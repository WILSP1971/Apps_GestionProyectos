-- =====================================================================
-- SierraFlow · 010 · Evaluación, tareas por frente y reportes (Sprint 6)
-- =====================================================================
SET search_path TO gestion, public;

-- Consultas frecuentes
CREATE INDEX IF NOT EXISTS ix_tareas_grupo        ON tareas(solicitud_id, grupo_id) WHERE NOT eliminado;
CREATE INDEX IF NOT EXISTS ix_tareas_responsable  ON tareas(responsable_id) WHERE NOT eliminado;
CREATE INDEX IF NOT EXISTS ix_calif_individuales_usuario ON calificaciones_individuales(usuario_id);
CREATE INDEX IF NOT EXISTS ix_evaluaciones_fecha  ON evaluaciones(fecha DESC) WHERE NOT eliminado;

-- Una tarea completada siempre queda al 100 % y con fecha real de fin (y al reabrirse se limpia)
CREATE OR REPLACE FUNCTION gestion.fn_tarea_completada()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.estado = 'COMPLETADA' THEN
    NEW.avance_pct     := 100;
    NEW.fecha_fin_real := coalesce(NEW.fecha_fin_real, current_date);
  ELSIF TG_OP = 'UPDATE' AND OLD.estado = 'COMPLETADA' THEN
    NEW.fecha_fin_real := NULL;
    IF NEW.avance_pct = 100 THEN NEW.avance_pct := 90; END IF;
  ELSIF NEW.avance_pct = 100 THEN
    NEW.estado := 'COMPLETADA';
    NEW.fecha_fin_real := coalesce(NEW.fecha_fin_real, current_date);
  ELSIF NEW.avance_pct > 0 AND NEW.estado = 'PENDIENTE' THEN
    NEW.estado := 'EN_PROGRESO';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_tareas_completada ON tareas;
CREATE TRIGGER tg_tareas_completada
  BEFORE INSERT OR UPDATE OF estado, avance_pct ON tareas
  FOR EACH ROW EXECUTE FUNCTION gestion.fn_tarea_completada();

-- Última evaluación de cada solicitud
CREATE OR REPLACE VIEW v_ultima_evaluacion AS
SELECT DISTINCT ON (e.solicitud_id)
       e.solicitud_id, e.id AS evaluacion_id, e.tipo, e.calificacion_global, e.calificacion_letra,
       e.avance_reportado, e.fecha
  FROM evaluaciones e
 WHERE NOT e.eliminado
 ORDER BY e.solicitud_id, e.fecha DESC;

-- Desempeño por ingeniero (calificación individual 1–5 de cada evaluación)
CREATE OR REPLACE VIEW v_calificaciones_ingenieros AS
SELECT u.id AS usuario_id, u.nombre_completo,
       count(ci.*)::int                         AS evaluaciones,
       round(avg(ci.puntaje)::numeric, 2)        AS promedio_1a5,
       round(((avg(ci.puntaje) - 1) / 4 * 10)::numeric, 2) AS promedio_0a10,
       max(e.fecha)                              AS ultima_evaluacion
  FROM calificaciones_individuales ci
  JOIN evaluaciones e ON e.id = ci.evaluacion_id AND NOT e.eliminado
  JOIN usuarios u ON u.id = ci.usuario_id
 GROUP BY u.id, u.nombre_completo;

-- Calificación promedio por departamento (última evaluación de cada solicitud)
CREATE OR REPLACE VIEW v_calificaciones_departamento AS
SELECT d.nombre AS departamento, d.color_hex,
       count(*)::int                                 AS solicitudes_evaluadas,
       round(avg(ue.calificacion_global)::numeric, 2) AS promedio_global
  FROM v_ultima_evaluacion ue
  JOIN solicitudes s   ON s.id = ue.solicitud_id AND NOT s.eliminado
  JOIN departamentos d ON d.id = s.departamento_id
 GROUP BY d.nombre, d.color_hex;
