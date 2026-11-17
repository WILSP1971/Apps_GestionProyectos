-- =====================================================================
-- SierraFlow · 007 · Vistas de lectura (CQRS ligero)
-- =====================================================================
SET search_path TO gestion, public;

-- Tablero: lista, kanban y panel de seguimiento
CREATE OR REPLACE VIEW v_tablero_solicitudes AS
SELECT s.id, s.codigo, s.titulo, s.tipo, s.prioridad, s.estado, s.avance_pct, s.version,
       s.solicitante_id, s.departamento_id,
       s.fecha_deseada, s.creado_en, s.actualizado_en, s.fecha_envio, s.sla_horas,
       d.nombre AS departamento, d.color_hex,
       u.nombre_completo AS solicitante,
       p.nombre AS proyecto,
       coalesce(asg.asignados, '[]'::jsonb) AS asignados,
       (s.fecha_envio IS NOT NULL AND s.estado IN ('ENVIADA','EN_REVISION')
        AND now() > s.fecha_envio + make_interval(hours => s.sla_horas)) AS sla_vencido
  FROM solicitudes s
  JOIN departamentos d  ON d.id = s.departamento_id
  JOIN usuarios u       ON u.id = s.solicitante_id
  LEFT JOIN proyectos p ON p.id = s.proyecto_id
  LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object(
                 'usuarioId', ua.id, 'nombre', ua.nombre_completo, 'avatar', ua.avatar_url,
                 'grupo', g.nombre, 'rol', a.rol_en_solicitud)) AS asignados
          FROM asignaciones a
          LEFT JOIN usuarios ua      ON ua.id = a.usuario_id
          LEFT JOIN grupos_trabajo g ON g.id  = a.grupo_id
         WHERE a.solicitud_id = s.id AND a.activa AND NOT a.eliminado) asg ON true
 WHERE NOT s.eliminado;

-- KPI por departamento y estado (gráfico "Resumen global por departamento")
CREATE OR REPLACE VIEW v_kpi_departamento_estado AS
SELECT d.nombre AS departamento, d.color_hex, s.estado, count(*)::int AS total
  FROM solicitudes s JOIN departamentos d ON d.id = s.departamento_id
 WHERE NOT s.eliminado
 GROUP BY d.nombre, d.color_hex, s.estado;

-- Carga de trabajo por ingeniero (pantalla de asignación).
-- Subconsultas independientes para evitar multiplicar filas entre grupos/tecnologías/tareas.
CREATE OR REPLACE VIEW v_carga_ingenieros AS
SELECT u.id AS usuario_id, u.nombre_completo, u.avatar_url,
       grp.grupos, tec.tecnologias,
       coalesce(asg.solicitudes_activas, 0) AS solicitudes_activas,
       coalesce(tar.horas_pendientes, 0)    AS horas_pendientes,
       coalesce(grp.capacidad_semana, 40)   AS capacidad_semana,
       least(100, round(100 * coalesce(tar.horas_pendientes, 0) / coalesce(grp.capacidad_semana, 40)))::int AS carga_pct
  FROM usuarios u
  JOIN usuario_roles ur ON ur.usuario_id = u.id
  JOIN roles r          ON r.id = ur.rol_id AND r.codigo = 'INGENIERO'
  LEFT JOIN LATERAL (SELECT array_agg(g.nombre ORDER BY g.nombre) AS grupos,
                            max(gm.capacidad_horas_semana)      AS capacidad_semana
                       FROM grupo_miembros gm JOIN grupos_trabajo g ON g.id = gm.grupo_id
                      WHERE gm.usuario_id = u.id) grp ON true
  LEFT JOIN LATERAL (SELECT array_agg(t.nombre ORDER BY t.nombre) AS tecnologias
                       FROM usuario_tecnologias ut JOIN tecnologias t ON t.id = ut.tecnologia_id
                      WHERE ut.usuario_id = u.id) tec ON true
  LEFT JOIN LATERAL (SELECT count(DISTINCT a.solicitud_id)::int AS solicitudes_activas
                       FROM asignaciones a WHERE a.usuario_id = u.id AND a.activa AND NOT a.eliminado) asg ON true
  LEFT JOIN LATERAL (SELECT sum(greatest(coalesce(t.horas_estimadas, 0) - t.horas_reales, 0)) AS horas_pendientes
                       FROM tareas t
                      WHERE t.responsable_id = u.id AND t.estado <> 'COMPLETADA' AND NOT t.eliminado) tar ON true
 WHERE u.activo AND NOT u.eliminado;

-- Tiempos de ciclo (lead time / cycle time) para reportes
CREATE OR REPLACE VIEW v_tiempos_ciclo AS
SELECT s.id, s.codigo, s.departamento_id,
       s.fecha_cierre - s.fecha_envio             AS lead_time,
       s.fecha_cierre - s.fecha_inicio_desarrollo AS cycle_time,
       s.fecha_aprobacion - s.fecha_envio         AS tiempo_respuesta
  FROM solicitudes s
 WHERE s.estado = 'CERRADA' AND NOT s.eliminado;
