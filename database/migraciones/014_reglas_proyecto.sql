-- =====================================================================
-- SierraFlow · 014 · Reglas proyecto ↔ solicitud
--   Regla 1: los requerimientos FUNCIONALES no pasan a ASIGNADA sin proyecto (se valida en la API).
--   Regla 2: una solicitud puede crearse ya asociada a un proyecto (solicitudes.proyecto_id, ya existía).
--   Regla 3: tareas propias del proyecto, sin solicitud (gestión, capacitación, despliegue…).
-- =====================================================================
SET search_path TO gestion, public;

ALTER TABLE tareas ADD COLUMN IF NOT EXISTS proyecto_id uuid REFERENCES proyectos(id) ON DELETE CASCADE;
ALTER TABLE tareas ALTER COLUMN solicitud_id DROP NOT NULL;
DO $$ BEGIN
  ALTER TABLE tareas ADD CONSTRAINT ck_tareas_contenedor CHECK (num_nonnulls(solicitud_id, proyecto_id) = 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS ix_tareas_proyecto ON tareas(proyecto_id) WHERE proyecto_id IS NOT NULL AND NOT eliminado;

-- Indicadores del proyecto: el avance promedia sus solicitudes y, si tiene tareas propias,
-- suma el avance ponderado de esas tareas como un componente más. Las horas incluyen ambas.
CREATE OR REPLACE VIEW v_proyectos_indicadores AS
WITH tareas_proyecto AS (
  SELECT t.* FROM tareas t
    JOIN solicitudes s ON s.id = t.solicitud_id AND NOT s.eliminado
   WHERE NOT t.eliminado AND s.proyecto_id IS NOT NULL
  UNION ALL
  SELECT t.* FROM tareas t WHERE NOT t.eliminado AND t.proyecto_id IS NOT NULL
)
SELECT p.id,
       (SELECT count(*) FROM solicitudes s WHERE s.proyecto_id = p.id AND NOT s.eliminado)::int AS solicitudes,
       coalesce(round(avg(c.avance), 2), 0)::float8 AS avance_pct,
       coalesce((SELECT sum(t.horas_reales) FROM tareas_proyecto t
                  WHERE t.proyecto_id = p.id OR t.solicitud_id IN (SELECT id FROM solicitudes WHERE proyecto_id = p.id)), 0)::float8 AS horas_reales,
       coalesce((SELECT sum(t.horas_estimadas) FROM tareas_proyecto t
                  WHERE t.proyecto_id = p.id OR t.solicitud_id IN (SELECT id FROM solicitudes WHERE proyecto_id = p.id)), 0)::float8 AS horas_estimadas,
       (SELECT count(*) FROM riesgos r WHERE r.proyecto_id = p.id AND NOT r.eliminado
           AND r.estado IN ('ABIERTO','MATERIALIZADO') AND r.probabilidad * r.impacto >= 10)::int AS riesgos_altos,
       coalesce((SELECT sum(d.story_points) FROM deuda_tecnica d
                  WHERE d.proyecto_id = p.id AND NOT d.resuelta AND NOT d.eliminado), 0)::int AS deuda_pendiente
  FROM proyectos p
  LEFT JOIN LATERAL (
    SELECT s.avance_pct AS avance FROM solicitudes s
     WHERE s.proyecto_id = p.id AND NOT s.eliminado AND s.estado NOT IN ('CANCELADA','RECHAZADA')
    UNION ALL
    SELECT sum(t.avance_pct * t.peso) / nullif(sum(t.peso), 0) FROM tareas t
     WHERE t.proyecto_id = p.id AND NOT t.eliminado
    HAVING count(*) > 0
  ) c ON true
 WHERE NOT p.eliminado
 GROUP BY p.id;
