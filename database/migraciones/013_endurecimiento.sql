-- =====================================================================
-- SierraFlow · 013 · Endurecimiento (Sprint 8): índices y retención de datos
-- =====================================================================
SET search_path TO gestion, public;

-- Listados por estado sin filtrar departamento (kanban, evaluación, reportes)
CREATE INDEX IF NOT EXISTS ix_solicitudes_estado
  ON solicitudes(estado, actualizado_en DESC) WHERE NOT eliminado;
-- Despachador de notificaciones y SLA: eventos recientes
CREATE INDEX IF NOT EXISTS ix_outbox_creado ON eventos_outbox(ocurrido_en DESC);
-- Purga de sesiones vencidas
CREATE INDEX IF NOT EXISTS ix_sesiones_expira ON sesiones_refresh(expira_en);
-- Purga de auditoría por fecha
CREATE INDEX IF NOT EXISTS ix_auditoria_fecha ON auditoria(fecha);

-- Sesiones (refresh tokens) vencidas o revocadas hace más de p_dias
CREATE OR REPLACE FUNCTION gestion.fn_purgar_sesiones(p_dias int DEFAULT 30)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _sesiones_purga (id uuid) ON COMMIT DROP;
  INSERT INTO _sesiones_purga
  SELECT id FROM gestion.sesiones_refresh
   WHERE expira_en < now() - make_interval(days => p_dias)
      OR revocado_en < now() - make_interval(days => p_dias);
  -- la cadena de rotación apunta a la sesión siguiente: se suelta antes de borrar
  UPDATE gestion.sesiones_refresh SET reemplazado_por = NULL WHERE reemplazado_por IN (SELECT id FROM _sesiones_purga);
  DELETE FROM gestion.sesiones_refresh WHERE id IN (SELECT id FROM _sesiones_purga);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- Auditoría: se conservan p_dias (por defecto 2 años)
CREATE OR REPLACE FUNCTION gestion.fn_purgar_auditoria(p_dias int DEFAULT 730)
RETURNS integer LANGUAGE sql AS $$
  WITH borradas AS (
    DELETE FROM gestion.auditoria WHERE fecha < now() - make_interval(days => p_dias) RETURNING 1
  )
  SELECT count(*)::int FROM borradas;
$$;
