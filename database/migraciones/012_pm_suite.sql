-- =====================================================================
-- SierraFlow · 012 · PM Suite (Sprint 7): proyectos, riesgos, deuda técnica y ROI
-- =====================================================================
SET search_path TO gestion, public;

-- Costo del trabajo = horas reales de las tareas × tarifa por hora.
-- proyectos.costo_real se usa como "otros gastos" (licencias, servicios, proveedores).
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS tarifa_hora numeric(12,2) CHECK (tarifa_hora >= 0);
COMMENT ON COLUMN proyectos.costo_real IS 'Otros gastos del proyecto (sin el costo de las horas del equipo)';

-- Deuda técnica: trazable a una solicitud y con fecha de resolución
ALTER TABLE deuda_tecnica
  ADD COLUMN IF NOT EXISTS solicitud_id uuid REFERENCES solicitudes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS creado_por   uuid REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS resuelta_en  timestamptz,
  ADD COLUMN IF NOT EXISTS eliminado    boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS ix_solicitudes_proyecto ON solicitudes(proyecto_id) WHERE proyecto_id IS NOT NULL AND NOT eliminado;
CREATE INDEX IF NOT EXISTS ix_riesgos_proyecto     ON riesgos(proyecto_id) WHERE NOT eliminado;
CREATE INDEX IF NOT EXISTS ix_deuda_proyecto       ON deuda_tecnica(proyecto_id) WHERE NOT eliminado;

-- Indicadores por proyecto (avance ponderado por horas estimadas de sus solicitudes, o promedio simple)
CREATE OR REPLACE VIEW v_proyectos_indicadores AS
SELECT p.id,
       count(s.id)::int AS solicitudes,
       coalesce(round(avg(s.avance_pct) FILTER (WHERE s.estado NOT IN ('CANCELADA','RECHAZADA')), 2), 0)::float8 AS avance_pct,
       coalesce((SELECT sum(t.horas_reales) FROM tareas t JOIN solicitudes s2 ON s2.id = t.solicitud_id
                  WHERE s2.proyecto_id = p.id AND NOT t.eliminado AND NOT s2.eliminado), 0)::float8 AS horas_reales,
       coalesce((SELECT sum(t.horas_estimadas) FROM tareas t JOIN solicitudes s2 ON s2.id = t.solicitud_id
                  WHERE s2.proyecto_id = p.id AND NOT t.eliminado AND NOT s2.eliminado), 0)::float8 AS horas_estimadas,
       (SELECT count(*) FROM riesgos r WHERE r.proyecto_id = p.id AND NOT r.eliminado
           AND r.estado IN ('ABIERTO','MATERIALIZADO') AND r.probabilidad * r.impacto >= 10)::int AS riesgos_altos,
       coalesce((SELECT sum(d.story_points) FROM deuda_tecnica d
                  WHERE d.proyecto_id = p.id AND NOT d.resuelta AND NOT d.eliminado), 0)::int AS deuda_pendiente
  FROM proyectos p
  LEFT JOIN solicitudes s ON s.proyecto_id = p.id AND NOT s.eliminado
 WHERE NOT p.eliminado
 GROUP BY p.id;
