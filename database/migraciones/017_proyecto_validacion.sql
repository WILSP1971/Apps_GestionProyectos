-- =====================================================================
-- SierraFlow · 017 · Ciclo del proyecto con validación
--   · Nuevo estado EN_VALIDACION (entre En ejecución y Cerrado).
--   · Historial de cambios de estado con su motivo: líder, director y administrador pueden
--     regresar a desarrollo (En ejecución) un proyecto en validación indicando por qué.
--   Debe coincidir con MAQUINA_ESTADOS_PROYECTO (packages/contratos/src/proyectos.ts).
-- =====================================================================
SET search_path TO gestion, public;

-- (PostgreSQL ≥ 12 permite ADD VALUE dentro de la transacción; el valor no se usa en este archivo)
ALTER TYPE estado_proyecto ADD VALUE IF NOT EXISTS 'EN_VALIDACION' AFTER 'EN_EJECUCION';

CREATE TABLE IF NOT EXISTS proyecto_historial_estados (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id      uuid NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  estado_anterior  estado_proyecto NOT NULL,
  estado_nuevo     estado_proyecto NOT NULL,
  usuario_id       uuid NOT NULL REFERENCES usuarios(id),
  motivo           text CHECK (length(motivo) <= 2000),
  creado_en        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_proyecto_historial ON proyecto_historial_estados(proyecto_id, creado_en DESC);
