import { Inject, Injectable } from '@nestjs/common';
import {
  ESTADOS_CON_TAREAS, esquemaRegistroAvance, type CambioSubtarea, type CambioTarea, type DetalleTarea, type EstadoSolicitud,
  type EstadoTarea, type NuevaSubtarea, type NuevaTarea, type RegistroAvanceNuevo, type SubtareaVista, type TareaVista,
} from '@sierraflow/contratos';
import { ConflictoConcurrencia, ErrorDominio, NoEncontrado, SinPermiso } from '../../../compartido/dominio/errores';
import { UsuarioActual } from '../../../compartido/dominio/usuario-actual';
import { db, enTransaccion } from '../../../compartido/infraestructura/base-datos';
import { publicarEnOutbox } from '../../../compartido/infraestructura/outbox';
import { REPOSITORIO_SOLICITUDES, RepositorioSolicitudes } from '../../solicitudes/dominio/solicitud.repositorio';
import { ConsultasEvaluacion, esGestor } from '../infraestructura/consultas-evaluacion';

function validarFechas(inicio: string | null | undefined, fin: string | null | undefined) {
  if (inicio && fin && fin < inicio) throw new ErrorDominio('FECHAS_INVALIDAS', 'La entrega no puede ser anterior al inicio de la tarea');
}

type RegistroAvanceValido = ReturnType<typeof esquemaRegistroAvance.parse>;
type TareaActual = NonNullable<Awaited<ReturnType<ConsultasEvaluacion['tarea']>>>;

/** Campos que un ingeniero puede cambiar en SUS tareas (el resto lo define el líder). */
const CAMPOS_INGENIERO = new Set(['version', 'estado', 'avancePct', 'horasReales']);

/**
 * Tareas de una solicitud: son la base del avance ponderado (trigger fn_recalcular_avance) y de
 * las barras por frente. El líder las crea y reparte; cada ingeniero actualiza el avance de las suyas.
 * Cuando una solicitud ASIGNADA recibe su primer avance pasa sola a EN_DESARROLLO.
 */
@Injectable()
export class GestionarTareasCasoUso {
  constructor(
    @Inject(REPOSITORIO_SOLICITUDES) private readonly solicitudes: RepositorioSolicitudes,
    private readonly consultas: ConsultasEvaluacion,
  ) {}

  /**
   * El líder crea y reparte tareas. El ingeniero del equipo también puede proponer las suyas
   * (quedan a su nombre); el líder las ve en Evaluación y puede ajustarlas o reasignarlas.
   */
  async crear(solicitudId: string, dto: NuevaTarea, u: UsuarioActual): Promise<TareaVista> {
    return enTransaccion(u.id, async () => {
      await this.validarSolicitud(solicitudId);
      if (!esGestor(u)) {
        if (!(await this.consultas.estaEnEquipo(solicitudId, u.id))) throw new SinPermiso('Solo puedes crear tareas en solicitudes de tu equipo');
        dto = { ...dto, responsableId: u.id };
      }
      await this.validarResponsable(solicitudId, dto.responsableId);
      validarFechas(dto.fechaInicio, dto.fechaFinPlan);
      const { rows: [r] } = await db().query(
        `INSERT INTO gestion.tareas(solicitud_id, titulo, descripcion, grupo_id, responsable_id, peso, horas_estimadas, fecha_inicio, fecha_fin_plan, creado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [solicitudId, dto.titulo, dto.descripcion ?? null, dto.grupoId ?? null, dto.responsableId ?? null,
          dto.peso ?? 1, dto.horasEstimadas ?? null, dto.fechaInicio ?? null, dto.fechaFinPlan ?? null, u.id]);
      await this.anotar(r.id, u, { tipo: 'CREACION', nota: esGestor(u) ? null : 'Tarea propuesta por el ingeniero' });
      if (dto.responsableId && dto.responsableId !== u.id) await this.avisarResponsable(solicitudId, dto.responsableId, dto.titulo, u);
      return (await this.consultas.tarea(r.id))!;
    });
  }

  /** Regla 3: tarea propia del proyecto (sin solicitud): gestión, capacitación, despliegue… */
  async crearEnProyecto(proyectoId: string, dto: NuevaTarea, u: UsuarioActual): Promise<TareaVista> {
    return enTransaccion(u.id, async () => {
      await this.validarProyecto(proyectoId);
      if (!esGestor(u)) {
        if (!(await this.consultas.esMiembroProyecto(proyectoId, u.id))) throw new SinPermiso('Solo puedes crear tareas en proyectos donde participas');
        dto = { ...dto, responsableId: u.id };
      }
      await this.validarResponsableProyecto(dto.responsableId);
      validarFechas(dto.fechaInicio, dto.fechaFinPlan);
      const { rows: [r] } = await db().query(
        `INSERT INTO gestion.tareas(proyecto_id, titulo, descripcion, grupo_id, responsable_id, peso, horas_estimadas, fecha_inicio, fecha_fin_plan, creado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [proyectoId, dto.titulo, dto.descripcion ?? null, dto.grupoId ?? null, dto.responsableId ?? null,
          dto.peso ?? 1, dto.horasEstimadas ?? null, dto.fechaInicio ?? null, dto.fechaFinPlan ?? null, u.id]);
      await this.anotar(r.id, u, { tipo: 'CREACION', nota: esGestor(u) ? null : 'Tarea propuesta por el ingeniero' });
      if (dto.responsableId && dto.responsableId !== u.id) await this.avisarResponsableProyecto(proyectoId, dto.responsableId, dto.titulo, u);
      return (await this.consultas.tarea(r.id))!;
    });
  }

  async actualizar(tareaId: string, dto: CambioTarea, u: UsuarioActual): Promise<TareaVista> {
    return enTransaccion(u.id, async () => {
      const actual = await this.consultas.tarea(tareaId);
      if (!actual) throw new NoEncontrado('Tarea', tareaId);
      if (actual.version !== dto.version) throw new ConflictoConcurrencia('Tarea', tareaId);

      if (!esGestor(u)) {
        if (actual.responsableId !== u.id) throw new SinPermiso('Solo puedes actualizar las tareas que tienes asignadas');
        const otros = Object.keys(dto).filter((k) => !CAMPOS_INGENIERO.has(k) && dto[k as keyof CambioTarea] !== undefined);
        if (otros.length) throw new SinPermiso('Solo puedes cambiar el estado, el avance y las horas reales de tu tarea');
      }
      const estadoSolicitud = actual.solicitudId ? await this.validarSolicitud(actual.solicitudId) : null;
      if (actual.proyectoId) await this.validarProyecto(actual.proyectoId);
      validarFechas(dto.fechaInicio === undefined ? actual.fechaInicio : dto.fechaInicio,
        dto.fechaFinPlan === undefined ? actual.fechaFinPlan : dto.fechaFinPlan);
      if (dto.responsableId !== undefined && dto.responsableId !== actual.responsableId) {
        if (actual.solicitudId) await this.validarResponsable(actual.solicitudId, dto.responsableId);
        else await this.validarResponsableProyecto(dto.responsableId);
      }

      const columnas: Record<string, unknown> = {
        titulo: dto.titulo, descripcion: dto.descripcion, grupo_id: dto.grupoId, responsable_id: dto.responsableId,
        peso: dto.peso, horas_estimadas: dto.horasEstimadas, fecha_inicio: dto.fechaInicio, fecha_fin_plan: dto.fechaFinPlan,
        estado: dto.estado, avance_pct: dto.avancePct, horas_reales: dto.horasReales,
      };
      const cambios = Object.entries(columnas).filter(([, v]) => v !== undefined);
      if (cambios.length) {
        const sets = cambios.map(([c], i) => `${c} = $${i + 3}${c === 'estado' ? '::gestion.estado_tarea' : ''}`).join(', ');
        const { rowCount } = await db().query(
          `UPDATE gestion.tareas SET ${sets} WHERE id = $1 AND version = $2 AND NOT eliminado`,
          [tareaId, dto.version, ...cambios.map(([, v]) => v)]);
        if (!rowCount) throw new ConflictoConcurrencia('Tarea', tareaId);
      }

      if (dto.responsableId && dto.responsableId !== actual.responsableId && dto.responsableId !== u.id) {
        if (actual.solicitudId) await this.avisarResponsable(actual.solicitudId, dto.responsableId, dto.titulo ?? actual.titulo, u);
        else await this.avisarResponsableProyecto(actual.proyectoId!, dto.responsableId, dto.titulo ?? actual.titulo, u);
      }
      const nueva = (await this.consultas.tarea(tareaId))!;
      if (nueva.avancePct !== actual.avancePct || nueva.estado !== actual.estado) await this.anotarCambio(actual, nueva, u);
      if (actual.solicitudId && estadoSolicitud === 'ASIGNADA' && (nueva.avancePct > 0 || nueva.estado !== 'PENDIENTE')) {
        await this.iniciarDesarrollo(actual.solicitudId, u);
      }
      return nueva;
    });
  }

  /**
   * Registrar avance (Centro de trabajo): cambia % y/o estado, suma las horas de la sesión a las
   * horas reales y deja el registro en la bitácora con su nota y evidencia, todo en una transacción.
   */
  async registrarAvance(tareaId: string, entrada: RegistroAvanceNuevo, u: UsuarioActual): Promise<DetalleTarea> {
    const dto: RegistroAvanceValido = esquemaRegistroAvance.parse(entrada);
    let registroId = '';
    await enTransaccion(u.id, async () => {
      const actual = await this.tareaEditable(tareaId, u);
      if (actual.version !== dto.version) throw new ConflictoConcurrencia('Tarea', tareaId);
      const estadoSolicitud = actual.solicitudId ? await this.validarSolicitud(actual.solicitudId) : null;
      if (dto.fechaTrabajo) {
        const { rows: [f] } = await db().query(`SELECT $1::date > current_date AS futura, $1::date < current_date - 14 AS vieja`, [dto.fechaTrabajo]);
        if (f.futura || f.vieja) throw new ErrorDominio('FECHA_INVALIDA', 'La fecha de trabajo debe estar entre hoy y hace 14 días');
      }

      const { rowCount } = await db().query(
        `UPDATE gestion.tareas
            SET estado = coalesce($3::gestion.estado_tarea, estado), avance_pct = coalesce($4, avance_pct),
                horas_reales = horas_reales + $5
          WHERE id = $1 AND version = $2 AND NOT eliminado`,
        [tareaId, dto.version, dto.estado ?? null, dto.avancePct ?? null, dto.horas]);
      if (!rowCount) throw new ConflictoConcurrencia('Tarea', tareaId);

      const nueva = (await this.consultas.tarea(tareaId))!;
      registroId = await this.anotar(tareaId, u, {
        tipo: 'AVANCE', antes: actual, despues: nueva, horas: dto.horas, fechaTrabajo: dto.fechaTrabajo ?? null,
        nota: dto.nota || null, evidenciaUrl: dto.evidenciaUrl || null,
      });
      if (actual.solicitudId && estadoSolicitud === 'ASIGNADA' && (nueva.avancePct > 0 || nueva.estado !== 'PENDIENTE')) {
        await this.iniciarDesarrollo(actual.solicitudId, u);
      }
    });
    return { ...(await this.consultas.detalleTarea(tareaId, u)), registroId };
  }

  // ---------------------------------------------------------------- checklist
  async crearSubtarea(tareaId: string, dto: NuevaSubtarea, u: UsuarioActual): Promise<SubtareaVista[]> {
    await enTransaccion(u.id, async () => {
      await this.tareaEditable(tareaId, u);
      const { rows: [{ n }] } = await db().query(`SELECT count(*)::int AS n FROM gestion.tarea_subtareas WHERE tarea_id = $1`, [tareaId]);
      if (n >= 50) throw new ErrorDominio('LIMITE', 'Una tarea admite hasta 50 subtareas');
      await db().query(
        `INSERT INTO gestion.tarea_subtareas(tarea_id, titulo, orden, creado_por)
         VALUES ($1, $2, (SELECT coalesce(max(orden), 0) + 1 FROM gestion.tarea_subtareas WHERE tarea_id = $1), $3)`,
        [tareaId, dto.titulo, u.id]);
    });
    return this.consultas.subtareas(tareaId);
  }

  async actualizarSubtarea(id: string, dto: CambioSubtarea, u: UsuarioActual): Promise<SubtareaVista[]> {
    const st = await this.consultas.subtarea(id);
    if (!st) throw new NoEncontrado('Subtarea', id);
    await enTransaccion(u.id, async () => {
      await this.tareaEditable(st.tareaId, u);
      await db().query(
        `UPDATE gestion.tarea_subtareas
            SET titulo = coalesce($2, titulo),
                completada = coalesce($3, completada),
                completada_en  = CASE WHEN $3::boolean IS NULL THEN completada_en  WHEN $3 THEN now() ELSE NULL END,
                completada_por = CASE WHEN $3::boolean IS NULL THEN completada_por WHEN $3 THEN $4::uuid ELSE NULL END
          WHERE id = $1`, [id, dto.titulo ?? null, dto.completada ?? null, u.id]);
      if (dto.completada === true && !st.completada) {
        await this.anotar(st.tareaId, u, { tipo: 'SUBTAREA', nota: `Completó: ${dto.titulo ?? st.titulo}` });
      }
    });
    return this.consultas.subtareas(st.tareaId);
  }

  async eliminarSubtarea(id: string, u: UsuarioActual): Promise<SubtareaVista[]> {
    const st = await this.consultas.subtarea(id);
    if (!st) throw new NoEncontrado('Subtarea', id);
    await enTransaccion(u.id, async () => {
      await this.tareaEditable(st.tareaId, u);
      await db().query(`DELETE FROM gestion.tarea_subtareas WHERE id = $1`, [id]);
    });
    return this.consultas.subtareas(st.tareaId);
  }

  /** La tarea existe, su solicitud/proyecto admite cambios y quien actúa es el responsable o un gestor. */
  private async tareaEditable(tareaId: string, u: UsuarioActual): Promise<TareaActual> {
    const t = await this.consultas.tarea(tareaId);
    if (!t) throw new NoEncontrado('Tarea', tareaId);
    if (!esGestor(u) && t.responsableId !== u.id) throw new SinPermiso('Solo puedes registrar avances en las tareas que tienes asignadas');
    if (t.solicitudId) await this.validarSolicitud(t.solicitudId);
    else await this.validarProyecto(t.proyectoId!);
    return t;
  }

  private async anotarCambio(antes: TareaVista, despues: TareaVista, u: UsuarioActual) {
    await this.anotar(despues.id, u, { tipo: 'AVANCE', antes, despues });
  }

  /** Inserta un registro en la bitácora de la tarea. */
  private async anotar(tareaId: string, u: UsuarioActual, r: {
    tipo: 'AVANCE' | 'CREACION' | 'SUBTAREA'; antes?: TareaVista; despues?: TareaVista; horas?: number;
    fechaTrabajo?: string | null; nota?: string | null; evidenciaUrl?: string | null;
  }): Promise<string> {
    const cambioEstado = r.antes && r.despues && r.antes.estado !== r.despues.estado;
    const { rows: [registro] } = await db().query(
      `INSERT INTO gestion.tarea_avances(tarea_id, usuario_id, tipo, avance_anterior, avance_nuevo, estado_anterior, estado_nuevo,
                                         horas, fecha_trabajo, nota, evidencia_url)
       VALUES ($1, $2, $3, $4, $5, $6::gestion.estado_tarea, $7::gestion.estado_tarea, $8, coalesce($9::date, current_date), $10, $11)
       RETURNING id`,
      [tareaId, u.id, r.tipo, r.antes?.avancePct ?? null, r.despues?.avancePct ?? null,
        cambioEstado ? r.antes!.estado : null, cambioEstado ? (r.despues!.estado as EstadoTarea) : null,
        r.horas ?? 0, r.fechaTrabajo ?? null, r.nota ?? null, r.evidenciaUrl ?? null]);
    return registro.id;
  }

  async eliminar(tareaId: string, version: number, u: UsuarioActual): Promise<void> {
    await enTransaccion(u.id, async () => {
      const actual = await this.consultas.tarea(tareaId);
      if (!actual) throw new NoEncontrado('Tarea', tareaId);
      if (!esGestor(u) && (actual.creadoPor !== u.id || actual.avancePct > 0 || actual.horasReales > 0)) {
        throw new SinPermiso('Solo puedes eliminar tareas que propusiste y que aún no tienen avance ni horas');
      }
      if (actual.solicitudId) await this.validarSolicitud(actual.solicitudId);
      else await this.validarProyecto(actual.proyectoId!);
      const { rowCount } = await db().query(
        `UPDATE gestion.tareas SET eliminado = true WHERE id = $1 AND version = $2 AND NOT eliminado`, [tareaId, version]);
      if (!rowCount) throw new ConflictoConcurrencia('Tarea', tareaId);
    });
  }

  private async validarSolicitud(solicitudId: string): Promise<EstadoSolicitud> {
    const { rows: [s] } = await db().query(
      `SELECT estado::text AS estado FROM gestion.solicitudes WHERE id = $1 AND NOT eliminado`, [solicitudId]);
    if (!s) throw new NoEncontrado('Solicitud', solicitudId);
    if (!ESTADOS_CON_TAREAS.includes(s.estado)) {
      throw new ErrorDominio('ESTADO_INVALIDO', 'Las tareas solo se gestionan en solicitudes asignadas, en desarrollo o en validación');
    }
    return s.estado;
  }

  private async validarProyecto(proyectoId: string) {
    const { rows: [p] } = await db().query(
      `SELECT estado::text AS estado FROM gestion.proyectos WHERE id = $1 AND NOT eliminado`, [proyectoId]);
    if (!p) throw new NoEncontrado('Proyecto', proyectoId);
    if (p.estado === 'CERRADO' || p.estado === 'CANCELADO') {
      throw new ErrorDominio('ESTADO_INVALIDO', 'El proyecto está cerrado o cancelado: sus tareas ya no se modifican');
    }
  }

  /** En tareas del proyecto el responsable puede ser cualquier ingeniero, líder o director activo. */
  private async validarResponsableProyecto(responsableId: string | null | undefined) {
    if (!responsableId) return;
    const { rowCount } = await db().query(
      `SELECT 1 FROM gestion.usuarios u JOIN gestion.usuario_roles ur ON ur.usuario_id = u.id JOIN gestion.roles r ON r.id = ur.rol_id
        WHERE u.id = $1 AND u.activo AND NOT u.eliminado AND r.codigo IN ('INGENIERO','LIDER','DIRECTOR') LIMIT 1`, [responsableId]);
    if (!rowCount) throw new ErrorDominio('RESPONSABLE_INVALIDO', 'El responsable debe ser un ingeniero, líder o director activo');
  }

  private async validarResponsable(solicitudId: string, responsableId: string | null | undefined) {
    if (!responsableId) return;
    if (!(await this.consultas.estaEnEquipo(solicitudId, responsableId))) {
      throw new ErrorDominio('RESPONSABLE_INVALIDO', 'El responsable debe pertenecer al equipo asignado (agrégalo en Asignación)');
    }
  }

  private async avisarResponsable(solicitudId: string, responsableId: string, titulo: string, u: UsuarioActual) {
    await publicarEnOutbox([{
      tipo: 'tarea.asignada', agregado: 'Solicitud', agregadoId: solicitudId, ocurridoEn: new Date(),
      payload: { nuevos: [responsableId], tarea: titulo, actorId: u.id },
    }]);
  }

  /** Aviso al ingeniero: "Recibiste una nueva asignación" (tarea propia del proyecto). */
  private async avisarResponsableProyecto(proyectoId: string, responsableId: string, titulo: string, u: UsuarioActual) {
    await publicarEnOutbox([{
      tipo: 'proyecto.tarea_asignada', agregado: 'Proyecto', agregadoId: proyectoId, ocurridoEn: new Date(),
      payload: { nuevos: [responsableId], tarea: titulo, actorId: u.id },
    }]);
  }

  /** Primer avance real: ASIGNADA → EN_DESARROLLO (si el rol de quien actualiza lo permite). */
  private async iniciarDesarrollo(solicitudId: string, u: UsuarioActual) {
    const s = await this.solicitudes.porId(solicitudId);
    if (!s || s.estado !== 'ASIGNADA') return;
    try {
      s.cambiarEstado('EN_DESARROLLO', u);
    } catch (e) {
      if (e instanceof ErrorDominio) return; // p. ej. un DIRECTOR no inicia desarrollo: se deja como está
      throw e;
    }
    await db().query(`SELECT set_config('app.comentario_estado', $1, true)`, ['Inicio automático: primer avance de tareas']);
    await this.solicitudes.guardar(s);
  }
}
