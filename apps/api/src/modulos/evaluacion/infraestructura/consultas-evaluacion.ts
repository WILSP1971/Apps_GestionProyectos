import { Injectable } from '@nestjs/common';
import {
  calcularFrentes, type ContextoEvaluacion, type CriterioCalificacion, type EvaluacionVista, type ResumenEvaluable, type TareaVista,
} from '@sierraflow/contratos';
import { NoEncontrado, SinPermiso } from '../../../compartido/dominio/errores';
import { UsuarioActual } from '../../../compartido/dominio/usuario-actual';
import { db } from '../../../compartido/infraestructura/base-datos';

export const esGestor = (u: UsuarioActual) => u.roles.some((r) => r === 'LIDER' || r === 'DIRECTOR' || r === 'ADMIN');

const COLUMNAS_TAREA = `
  t.id, t.titulo, t.descripcion, t.grupo_id AS "grupoId", g.nombre AS grupo,
  t.responsable_id AS "responsableId", u.nombre_completo AS responsable, t.estado::text AS estado,
  t.peso, t.avance_pct::float8 AS "avancePct", t.horas_estimadas::float8 AS "horasEstimadas",
  t.horas_reales::float8 AS "horasReales", to_char(t.fecha_fin_plan, 'YYYY-MM-DD') AS "fechaFinPlan", t.version`;
const DESDE_TAREA = `
  FROM gestion.tareas t
  LEFT JOIN gestion.grupos_trabajo g ON g.id = t.grupo_id
  LEFT JOIN gestion.usuarios u ON u.id = t.responsable_id`;

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

  async tarea(id: string): Promise<(TareaVista & { solicitudId: string }) | null> {
    const { rows } = await db().query(
      `SELECT ${COLUMNAS_TAREA}, t.solicitud_id AS "solicitudId" ${DESDE_TAREA}
        WHERE t.id = $1 AND NOT t.eliminado`, [id]);
    return rows[0] ?? null;
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
