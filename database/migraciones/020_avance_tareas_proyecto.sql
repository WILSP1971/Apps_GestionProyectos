-- =====================================================================
-- 020 · El avance de una solicitud incluye las tareas generales de su proyecto
--   Un ingeniero puede registrar tareas en la solicitud o directamente en el proyecto
--   (tareas.proyecto_id). Las tareas generales del proyecto también cuentan para el avance
--   ponderado de cada solicitud del proyecto, para que "Gestión y calificación del avance"
--   refleje todo el trabajo registrado.
-- =====================================================================
SET search_path TO gestion, public;

-- Avance ponderado de una solicitud: sus tareas + las tareas generales de su proyecto
CREATE OR REPLACE FUNCTION gestion.fn_avance_solicitud(p_solicitud uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE gestion.solicitudes s
     SET avance_pct = coalesce((
           SELECT round(sum(t.avance_pct * t.peso) / nullif(sum(t.peso), 0), 2)
             FROM gestion.tareas t
            WHERE NOT t.eliminado
              AND (t.solicitud_id = s.id OR (s.proyecto_id IS NOT NULL AND t.proyecto_id = s.proyecto_id))), 0)
   WHERE s.id = p_solicitud AND s.estado <> 'CERRADA';
$$;

-- Al cambiar una tarea: recalcula su solicitud o, si es del proyecto, todas las solicitudes del proyecto
CREATE OR REPLACE FUNCTION gestion.fn_recalcular_avance()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_sol uuid;
  v_proy uuid;
BEGIN
  FOR v_sol, v_proy IN
    SELECT x.sol, x.proy FROM (VALUES
      (CASE WHEN TG_OP <> 'INSERT' THEN OLD.solicitud_id END, CASE WHEN TG_OP <> 'INSERT' THEN OLD.proyecto_id END),
      (CASE WHEN TG_OP <> 'DELETE' THEN NEW.solicitud_id END, CASE WHEN TG_OP <> 'DELETE' THEN NEW.proyecto_id END)) AS x(sol, proy)
  LOOP
    IF v_sol IS NOT NULL THEN
      PERFORM gestion.fn_avance_solicitud(v_sol);
    END IF;
    IF v_proy IS NOT NULL THEN
      PERFORM gestion.fn_avance_solicitud(s.id) FROM gestion.solicitudes s WHERE s.proyecto_id = v_proy AND NOT s.eliminado;
    END IF;
  END LOOP;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS tg_tareas_avance ON tareas;
CREATE TRIGGER tg_tareas_avance
  AFTER INSERT OR UPDATE OF avance_pct, peso, eliminado, solicitud_id, proyecto_id OR DELETE ON tareas
  FOR EACH ROW EXECUTE FUNCTION gestion.fn_recalcular_avance();

-- Al agregar o quitar una solicitud de un proyecto cambia qué tareas generales le cuentan
CREATE OR REPLACE FUNCTION gestion.fn_avance_por_proyecto()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM gestion.fn_avance_solicitud(NEW.id);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS tg_solicitudes_avance_proyecto ON solicitudes;
CREATE TRIGGER tg_solicitudes_avance_proyecto
  AFTER UPDATE OF proyecto_id ON solicitudes
  FOR EACH ROW WHEN (OLD.proyecto_id IS DISTINCT FROM NEW.proyecto_id)
  EXECUTE FUNCTION gestion.fn_avance_por_proyecto();

-- Recalcula las solicitudes abiertas que pertenecen a un proyecto con tareas generales
SELECT gestion.fn_avance_solicitud(s.id)
  FROM gestion.solicitudes s
 WHERE NOT s.eliminado AND s.estado <> 'CERRADA' AND s.proyecto_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM gestion.tareas t WHERE t.proyecto_id = s.proyecto_id AND NOT t.eliminado);
