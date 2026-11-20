import { Injectable } from '@nestjs/common';
import {
  calcularFrentes, serieHoras, type ContextoEvaluacion, type CriterioCalificacion, type DetalleTarea, type EstadoSolicitud,
  type EvaluacionVista, type MiActividad, type MiTarea, type OpcionesNuevaTarea, type RegistroAvance, type ResumenEvaluable,
  type SubtareaVista, type TareaVista,
} from '@sierraflow/contratos';
import { NoEncontrado, SinPermiso } from '../../../compartido/dominio/errores';
import { UsuarioActual } from '../../../compartido/dominio/usuario-actual';
import { db } from '../../../compartido/infraestructura/base-datos';

export const esGestor = (u: UsuarioActual) => u.roles.some((r) => r === 'LIDER' || r === 'DIRECTOR' || r === 'ADMIN');

const COLUMNAS_TAREA = `
  t.id, t.titulo, t.descripcion, t.grupo_id AS "grupoId", g.nombre AS grupo,
  t.responsable_id AS "responsableId", u.nombre_completo AS responsable, t.estado::text AS estado,
  t.peso, t.avance_pct::float8 AS "avancePct", t.horas_estimadas::float8 AS "horasEstimadas",
  t.horas_reales::float8 AS "horasReales", to_char(t.fecha_inicio, 'YYYY-MM-DD') AS "fechaInicio",
  to_char(t.fecha_fin_plan, 'YYYY-MM-DD') AS "fechaFinPlan", t.version`;
const DESDE_TAREA = `
  FROM gestion.tareas t
  LEFT JOIN gestion.grupos_trabajo g ON g.id = t.grupo_id
  LEFT JOIN gestion.usuarios u ON u.id = t.responsable_id`;

/** Tarea con su contexto para el Centro de trabajo; $1 = usuario que consulta. */
const SELECT_MI_TAREA = `
  SELECT ${COLUMNAS_TAREA},
         t.solicitud_id AS "solicitudId", s.codigo AS "solicitudCodigo", s.titulo AS "solicitudTitulo",
         coalesce(t.proyecto_id, s.proyecto_id) AS "proyectoId", p.codigo AS "proyectoCodigo", p.nombre AS "proyectoNombre",
         CASE WHEN t.solicitud_id IS NOT NULL THEN coalesce(s.estado IN ('ASIGNADA','EN_DESARROLLO','EN_VALIDACION'), false)
              ELSE coalesce(p.estado NOT IN ('CERRADO','CANCELADO'), false) END AS editable,
         (SELECT count(*) FROM gestion.tarea_subtareas st WHERE st.tarea_id = t.id)::int AS "subtareasTotal",
         (SELECT count(*) FROM gestion.tarea_subtareas st WHERE st.tarea_id = t.id AND st.completada)::int AS "subtareasHechas",
         (SELECT max(a.creado_en) FROM gestion.tarea_avances a WHERE a.tarea_id = t.id) AS "ultimoRegistro",
         coalesce(t.creado_por = $1::uuid, false) AS "creadaPorMi"
  ${DESDE_TAREA}
    LEFT JOIN gestion.solicitudes s ON s.id = t.solicitud_id AND NOT s.eliminado
    LEFT JOIN gestion.proyectos p ON p.id = coalesce(t.proyecto_id, s.proyecto_id) AND NOT p.eliminado`;

/** Mismo criterio que "Mis proyectos": tiene tareas en el proyecto o está asignado a una de sus solicitudes ($1 = usuario). */
const CONDICION_MIEMBRO_PROYECTO = `(
  EXISTS (SELECT 1 FROM gestion.tareas t WHERE t.proyecto_id = p.id AND t.responsable_id = $1 AND NOT t.eliminado)
  OR EXISTS (SELECT 1 FROM gestion.solicitudes s
               JOIN gestion.asignaciones a ON a.solicitud_id = s.id AND a.activa AND NOT a.eliminado
              WHERE s.proyecto_id = p.id AND NOT s.eliminado AND a.usuario_id = $1))`;

/** Lecturas del módulo de evaluación (avance por frente, tareas, criterios e historial de calificaciones). */
@Injectable()
export class ConsultasEvaluacion {
  /** Solicitudes en curso o cerradas recientemente, con su avance y última nota. */
  async listado(): Promise<ResumenEvaluable[]> {
    const { rows } = await db().query(
      `SELECT s.id, s.codigo, s.titulo, s.estado::text AS estado, d.nombre AS departamento, d.color_hex AS "departamentoColor",
              s.avance_pct::float8 AS "avancePct",
              count(t.id) FILTER (WHERE NOT t.eliminado)::int AS tareas,
              count(t.id) FILTER (WHERE NOT t.eliminado AND t.estado = 'COMPLETADA')::int AS "tareasCompletadas",
              ue.calificacion_global::float8 AS "ultimaNota", ue.calificacion_letra AS "ultimaLetra", ue.fecha AS "ultimaFecha"
         FROM gestion.solicitudes s
         JOIN gestion.departamentos d ON d.id = s.departamento_id
         LEFT JOIN gestion.tareas t ON t.solicitud_id = s.id
         LEFT JOIN gestion.v_ultima_evaluacion ue ON ue.solicitud_id = s.id
        WHERE NOT s.eliminado
          AND (s.estado IN ('ASIGNADA','EN_DESARROLLO','EN_VALIDACION')
               OR (s.estado = 'CERRADA' AND s.fecha_cierre > now() - interval '90 days'))
        GROUP BY s.id, d.nombre, d.color_hex, ue.calificacion_global, ue.calificacion_letra, ue.fecha
        ORDER BY CASE s.estado WHEN 'EN_VALIDACION' THEN 0 WHEN 'EN_DESARROLLO' THEN 1 WHEN 'ASIGNADA' THEN 2 ELSE 3 END,
                 s.actualizado_en DESC
        LIMIT 300`);
    return rows;
  }

  async estaEnEquipo(solicitudId: string, usuarioId: string): Promise<boolean> {
    const { rowCount } = await db().query(
      `SELECT 1 FROM gestion.asignaciones
        WHERE solicitud_id = $1 AND usuario_id = $2 AND activa AND NOT eliminado LIMIT 1`, [solicitudId, usuarioId]);
    return (rowCount ?? 0) > 0;
  }

  async criterios(): Promise<CriterioCalificacion[]> {
    const { rows } = await db().query(
      `SELECT id, codigo, nombre, descripcion, peso::float8 AS peso
         FROM gestion.criterios_calificacion WHERE activo ORDER BY peso DESC, id`);
    return rows;
  }

  async tareas(solicitudId: string): Promise<TareaVista[]> {
    const { rows } = await db().query(
      `SELECT ${COLUMNAS_TAREA} ${DESDE_TAREA}
        WHERE t.solicitud_id = $1 AND NOT t.eliminado
        ORDER BY g.nombre NULLS LAST, t.creado_en`, [solicitudId]);
    return rows;
  }

  async tarea(id: string): Promise<(TareaVista & { solicitudId: string | null; proyectoId: string | null; creadoPor: string | null }) | null> {
    const { rows } = await db().query(
      `SELECT ${COLUMNAS_TAREA}, t.solicitud_id AS "solicitudId", t.proyecto_id AS "proyectoId", t.creado_por AS "creadoPor" ${DESDE_TAREA}
        WHERE t.id = $1 AND NOT t.eliminado`, [id]);
    return rows[0] ?? null;
  }

  /** Regla 3: tareas propias de un proyecto. */
  async tareasDeProyecto(proyectoId: string): Promise<TareaVista[]> {
    const { rows } = await db().query(
      `SELECT ${COLUMNAS_TAREA} ${DESDE_TAREA}
        WHERE t.proyecto_id = $1 AND NOT t.eliminado
        ORDER BY t.fecha_inicio NULLS LAST, t.creado_en`, [proyectoId]);
    return rows;
  }

  /** "Registrar avances": tareas de las que la persona es responsable, con su solicitud o proyecto. */
  async misTareas(usuarioId: string): Promise<MiTarea[]> {
    const { rows } = await db().query(
      `${SELECT_MI_TAREA}
        WHERE t.responsable_id = $1 AND NOT t.eliminado
          AND (t.solicitud_id IS NULL OR s.id IS NOT NULL)
          AND (t.estado <> 'COMPLETADA' OR t.actualizado_en > now() - interval '30 days')
        ORDER BY (t.estado = 'COMPLETADA'), t.fecha_fin_plan NULLS LAST, t.creado_en
        LIMIT 300`, [usuarioId]);
    return rows;
  }

  /** Detalle para el panel lateral: la tarea, su checklist, su bitácora y qué puede hacer quien consulta. */
  async detalleTarea(tareaId: string, u: UsuarioActual): Promise<DetalleTarea> {
    const { rows: [tarea] } = await db().query(`${SELECT_MI_TAREA} WHERE t.id = $2 AND NOT t.eliminado`, [u.id, tareaId]);
    if (!tarea) throw new NoEncontrado('Tarea', tareaId);
    const gestor = esGestor(u);
    const propia = tarea.responsableId === u.id;
    if (!gestor && !propia && !(tarea.solicitudId && (await this.estaEnEquipo(tarea.solicitudId, u.id)))) {
      throw new SinPermiso('Solo el responsable, su equipo, líderes y directores ven esta tarea');
    }
    const [subtareas, bitacora, estado] = await Promise.all([
      this.subtareas(tareaId),
      this.bitacora('t.id = $1', [tareaId], 100),
      tarea.solicitudId
        ? db().query(`SELECT estado::text AS estado FROM gestion.solicitudes WHERE id = $1`, [tarea.solicitudId])
        : Promise.resolve({ rows: [] as { estado: EstadoSolicitud }[] }),
    ]);
    const puede = tarea.editable && (gestor || propia);
    return {
      tarea: tarea as MiTarea,
      subtareas,
      bitacora,
      estadoSolicitud: estado.rows[0]?.estado ?? null,
      permisos: { registrar: puede, checklist: puede },
    };
  }

  async subtareas(tareaId: string): Promise<SubtareaVista[]> {
    const { rows } = await db().query(
      `SELECT st.id, st.titulo, st.completada, st.completada_en AS "completadaEn", u.nombre_completo AS "completadaPor", st.orden
         FROM gestion.tarea_subtareas st LEFT JOIN gestion.usuarios u ON u.id = st.completada_por
        WHERE st.tarea_id = $1 ORDER BY st.orden, st.creado_en`, [tareaId]);
    return rows;
  }

  async subtarea(id: string): Promise<{ id: string; tareaId: string; titulo: string; completada: boolean } | null> {
    const { rows } = await db().query(
      `SELECT id, tarea_id AS "tareaId", titulo, completada FROM gestion.tarea_subtareas WHERE id = $1`, [id]);
    return rows[0] ?? null;
  }

  private async bitacora(filtro: string, params: unknown[], limite: number): Promise<RegistroAvance[]> {
    const { rows } = await db().query(
      `SELECT a.id, a.tarea_id AS "tareaId", t.titulo AS "tareaTitulo", a.usuario_id AS "usuarioId", u.nombre_completo AS usuario,
              a.tipo, a.avance_anterior::float8 AS "avanceAnterior", a.avance_nuevo::float8 AS "avanceNuevo",
              a.estado_anterior::text AS "estadoAnterior", a.estado_nuevo::text AS "estadoNuevo", a.horas::float8 AS horas,
              to_char(a.fecha_trabajo, 'YYYY-MM-DD') AS "fechaTrabajo", a.nota, a.evidencia_url AS "evidenciaUrl", a.creado_en AS "creadoEn"
         FROM gestion.tarea_avances a
         JOIN gestion.tareas t ON t.id = a.tarea_id AND NOT t.eliminado
         JOIN gestion.usuarios u ON u.id = a.usuario_id
        WHERE ${filtro}
        ORDER BY a.creado_en DESC
        LIMIT ${limite}`, params);
    return rows;
  }

  /** Actividad reciente y horas de los últimos 14 días de quien consulta. */
  async miActividad(usuarioId: string): Promise<MiActividad> {
    const [recientes, horas, hoy] = await Promise.all([
      this.bitacora('a.usuario_id = $1', [usuarioId], 15),
      db().query(
        `SELECT to_char(fecha_trabajo, 'YYYY-MM-DD') AS fecha, sum(horas)::float8 AS horas
           FROM gestion.tarea_avances
          WHERE usuario_id = $1 AND fecha_trabajo > current_date - 14
          GROUP BY fecha_trabajo`, [usuarioId]),
      db().query(`SELECT to_char(current_date, 'YYYY-MM-DD') AS hoy`),
    ]);
    return { recientes, horasPorDia: serieHoras(horas.rows, hoy.rows[0].hoy, 14) };
  }

  /** Dónde puede crear tareas el ingeniero: solicitudes de su equipo en curso y sus proyectos activos. */
  async opcionesNuevaTarea(usuarioId: string): Promise<OpcionesNuevaTarea> {
    const [contextos, grupos] = await Promise.all([
      db().query(
        `SELECT 'SOLICITUD' AS tipo, s.id, s.codigo, s.titulo, p.nombre AS proyecto
           FROM gestion.solicitudes s
           JOIN gestion.asignaciones a ON a.solicitud_id = s.id AND a.activa AND NOT a.eliminado AND a.usuario_id = $1
           LEFT JOIN gestion.proyectos p ON p.id = s.proyecto_id
          WHERE NOT s.eliminado AND s.estado IN ('ASIGNADA','EN_DESARROLLO','EN_VALIDACION')
         UNION ALL
         SELECT 'PROYECTO', p.id, p.codigo, p.nombre, NULL
           FROM gestion.proyectos p
          WHERE NOT p.eliminado AND p.estado NOT IN ('CERRADO','CANCELADO') AND ${CONDICION_MIEMBRO_PROYECTO}
          ORDER BY 1 DESC, 3`, [usuarioId]),
      db().query(
        `SELECT g.id, g.nombre FROM gestion.grupos_trabajo g WHERE g.activo AND NOT g.eliminado
          ORDER BY (g.id IN (SELECT grupo_id FROM gestion.grupo_miembros WHERE usuario_id = $1)) DESC, g.nombre`, [usuarioId]),
    ]);
    return { contextos: contextos.rows, grupos: grupos.rows };
  }

  async esMiembroProyecto(proyectoId: string, usuarioId: string): Promise<boolean> {
    const { rowCount } = await db().query(
      `SELECT 1 FROM gestion.proyectos p WHERE p.id = $2 AND ${CONDICION_MIEMBRO_PROYECTO}`, [usuarioId, proyectoId]);
    return (rowCount ?? 0) > 0;
  }

  async evaluaciones(solicitudId: string): Promise<EvaluacionVista[]> {
    const { rows } = await db().query(
      `SELECT e.id, e.tipo, e.avance_reportado::float8 AS "avanceReportado",
              e.calificacion_global::float8 AS "calificacionGlobal", e.calificacion_letra AS "calificacionLetra",
              e.calificacion_tecnica::float8 AS "calificacionTecnica", e.calificacion_plazos::float8 AS "calificacionPlazos",
              u.nombre_completo AS evaluador, e.comentario, e.fecha,
              coalesce((SELECT json_agg(json_build_object('codigo', c.codigo, 'puntaje', ed.puntaje) ORDER BY c.peso DESC, c.id)
                          FROM gestion.evaluacion_detalle ed JOIN gestion.criterios_calificacion c ON c.id = ed.criterio_id
                         WHERE ed.evaluacion_id = e.id), '[]') AS detalle,
              coalesce((SELECT json_agg(json_build_object('usuarioId', ci.usuario_id, 'nombre', ui.nombre_completo,
                                                          'puntaje', ci.puntaje, 'comentario', ci.comentario) ORDER BY ui.nombre_completo)
                          FROM gestion.calificaciones_individuales ci JOIN gestion.usuarios ui ON ui.id = ci.usuario_id
                         WHERE ci.evaluacion_id = e.id), '[]') AS individuales
         FROM gestion.evaluaciones e
         JOIN gestion.usuarios u ON u.id = e.evaluador_id
        WHERE e.solicitud_id = $1 AND NOT e.eliminado
        ORDER BY e.fecha DESC
        LIMIT 50`, [solicitudId]);
    return rows;
  }

  async contexto(solicitudId: string, u: UsuarioActual): Promise<ContextoEvaluacion> {
    const { rows: [s] } = await db().query(
      `SELECT s.id, s.codigo, s.titulo, s.estado::text AS estado, d.nombre AS departamento, d.color_hex AS "departamentoColor",
              us.nombre_completo AS solicitante, s.avance_pct::float8 AS "avancePct",
              to_char(s.fecha_deseada, 'YYYY-MM-DD') AS "fechaDeseada"
         FROM gestion.solicitudes s
         JOIN gestion.departamentos d ON d.id = s.departamento_id
         JOIN gestion.usuarios us ON us.id = s.solicitante_id
        WHERE s.id = $1 AND NOT s.eliminado`, [solicitudId]);
    if (!s) throw new NoEncontrado('Solicitud', solicitudId);

    const gestor = esGestor(u);
    if (!gestor && !(await this.estaEnEquipo(solicitudId, u.id))) {
      throw new SinPermiso('Solo el equipo asignado, líderes y directores ven el avance de esta solicitud');
    }

    const [criterios, tareas, evaluaciones, equipo, grupos] = await Promise.all([
      this.criterios(),
      this.tareas(solicitudId),
      gestor ? this.evaluaciones(solicitudId) : this.evaluacionesPropias(solicitudId, u.id),
      db().query(
        `SELECT a.usuario_id AS "usuarioId", u.nombre_completo AS nombre, a.rol_en_solicitud AS rol
           FROM gestion.asignaciones a JOIN gestion.usuarios u ON u.id = a.usuario_id
          WHERE a.solicitud_id = $1 AND a.activa AND NOT a.eliminado ORDER BY u.nombre_completo`, [solicitudId]),
      db().query(
        `SELECT DISTINCT g.id, g.nombre FROM gestion.grupos_trabajo g
          WHERE g.activo AND NOT g.eliminado
            AND (g.id IN (SELECT a.grupo_id FROM gestion.asignaciones a WHERE a.solicitud_id = $1 AND a.activa AND a.grupo_id IS NOT NULL)
                 OR g.id IN (SELECT gm.grupo_id FROM gestion.grupo_miembros gm
                               JOIN gestion.asignaciones a ON a.usuario_id = gm.usuario_id
                              WHERE a.solicitud_id = $1 AND a.activa))
          ORDER BY g.nombre`, [solicitudId]),
    ]);

    return {
      solicitud: s,
      criterios,
      tareas,
      frentes: calcularFrentes(tareas),
      equipo: equipo.rows,
      grupos: grupos.rows,
      evaluaciones,
      permisos: { evaluar: gestor, gestionarTareas: gestor },
    };
  }

  /** Un ingeniero ve las evaluaciones de su equipo, pero solo su propia calificación individual. */
  private async evaluacionesPropias(solicitudId: string, usuarioId: string): Promise<EvaluacionVista[]> {
    return (await this.evaluaciones(solicitudId)).map((e) => ({
      ...e, individuales: e.individuales.filter((i) => i.usuarioId === usuarioId),
    }));
  }
}
