import { Inject, Injectable } from '@nestjs/common';
import { ESTADOS_CON_TAREAS, type CambioTarea, type EstadoSolicitud, type NuevaTarea, type TareaVista } from '@sierraflow/contratos';
import { ConflictoConcurrencia, ErrorDominio, NoEncontrado, SinPermiso } from '../../../compartido/dominio/errores';
import { UsuarioActual } from '../../../compartido/dominio/usuario-actual';
import { db, enTransaccion } from '../../../compartido/infraestructura/base-datos';
import { publicarEnOutbox } from '../../../compartido/infraestructura/outbox';
import { REPOSITORIO_SOLICITUDES, RepositorioSolicitudes } from '../../solicitudes/dominio/solicitud.repositorio';
import { ConsultasEvaluacion, esGestor } from '../infraestructura/consultas-evaluacion';

function validarFechas(inicio: string | null | undefined, fin: string | null | undefined) {
  if (inicio && fin && fin < inicio) throw new ErrorDominio('FECHAS_INVALIDAS', 'La entrega no puede ser anterior al inicio de la tarea');
}

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

  async crear(solicitudId: string, dto: NuevaTarea, u: UsuarioActual): Promise<TareaVista> {
    return enTransaccion(u.id, async () => {
      await this.validarSolicitud(solicitudId);
      await this.validarResponsable(solicitudId, dto.responsableId);
      validarFechas(dto.fechaInicio, dto.fechaFinPlan);
      const { rows: [r] } = await db().query(
        `INSERT INTO gestion.tareas(solicitud_id, titulo, descripcion, grupo_id, responsable_id, peso, horas_estimadas, fecha_inicio, fecha_fin_plan)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [solicitudId, dto.titulo, dto.descripcion ?? null, dto.grupoId ?? null, dto.responsableId ?? null,
          dto.peso ?? 1, dto.horasEstimadas ?? null, dto.fechaInicio ?? null, dto.fechaFinPlan ?? null]);
      if (dto.responsableId && dto.responsableId !== u.id) await this.avisarResponsable(solicitudId, dto.responsableId, dto.titulo, u);
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
      const estadoSolicitud = await this.validarSolicitud(actual.solicitudId);
      validarFechas(dto.fechaInicio === undefined ? actual.fechaInicio : dto.fechaInicio,
        dto.fechaFinPlan === undefined ? actual.fechaFinPlan : dto.fechaFinPlan);
      if (dto.responsableId !== undefined && dto.responsableId !== actual.responsableId) {
        await this.validarResponsable(actual.solicitudId, dto.responsableId);
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
        await this.avisarResponsable(actual.solicitudId, dto.responsableId, dto.titulo ?? actual.titulo, u);
      }
      const nueva = (await this.consultas.tarea(tareaId))!;
      if (estadoSolicitud === 'ASIGNADA' && (nueva.avancePct > 0 || nueva.estado !== 'PENDIENTE')) {
        await this.iniciarDesarrollo(actual.solicitudId, u);
      }
      return nueva;
    });
  }

  async eliminar(tareaId: string, version: number, u: UsuarioActual): Promise<void> {
    await enTransaccion(u.id, async () => {
      const actual = await this.consultas.tarea(tareaId);
      if (!actual) throw new NoEncontrado('Tarea', tareaId);
      await this.validarSolicitud(actual.solicitudId);
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
