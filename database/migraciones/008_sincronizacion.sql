-- =====================================================================
-- SierraFlow · 008 · Soporte para sincronización Offline-First (Sprint 3)
-- =====================================================================
SET search_path TO gestion, public;

-- Índices para el pull por cursor (seq_cambio) de cada colección
CREATE INDEX IF NOT EXISTS ix_criterios_seq       ON criterios_aceptacion(solicitud_id, seq_cambio);
CREATE INDEX IF NOT EXISTS ix_asignaciones_seq    ON asignaciones(solicitud_id, seq_cambio);
CREATE INDEX IF NOT EXISTS ix_comentarios_seq     ON comentarios(seq_cambio);
CREATE INDEX IF NOT EXISTS ix_notificaciones_seq  ON notificaciones(usuario_id, seq_cambio);
CREATE INDEX IF NOT EXISTS ix_sync_ops_usuario    ON sync_operaciones(usuario_id, procesada_en DESC);

-- Las notificaciones no tienen "version": al marcarlas leídas solo avanza su seq_cambio
CREATE OR REPLACE FUNCTION gestion.fn_seq_notificacion()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.seq_cambio := nextval('gestion.seq_sync');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_notificaciones_seq ON notificaciones;
CREATE TRIGGER tg_notificaciones_seq
  BEFORE UPDATE ON notificaciones
  FOR EACH ROW EXECUTE FUNCTION gestion.fn_seq_notificacion();

-- Limpieza: las operaciones idempotentes se conservan 30 días (llamar desde un job programado)
CREATE OR REPLACE FUNCTION gestion.fn_purgar_sync_operaciones(p_dias int DEFAULT 30)
RETURNS integer LANGUAGE sql AS $$
  WITH borradas AS (
    DELETE FROM gestion.sync_operaciones WHERE procesada_en < now() - make_interval(days => p_dias) RETURNING 1
  )
  SELECT count(*)::int FROM borradas;
$$;
