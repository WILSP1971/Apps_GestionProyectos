-- =====================================================================
-- SierraFlow · 009 · Activación del módulo de notificaciones (Sprint 4)
-- =====================================================================
SET search_path TO gestion, public;

-- Los eventos acumulados antes de existir el despachador no deben generar avisos atrasados
-- (evita enviar de golpe correos y push de acciones de días anteriores).
UPDATE eventos_outbox
   SET procesado_en = now(),
       ultimo_error = 'Omitido: anterior a la activación de notificaciones'
 WHERE procesado_en IS NULL
   AND ocurrido_en < now() - interval '15 minutes';

-- Consulta frecuente de la campana: no leídas por usuario
CREATE INDEX IF NOT EXISTS ix_notificaciones_no_leidas
  ON notificaciones(usuario_id, creado_en DESC) WHERE NOT leida;

-- Limpieza: notificaciones leídas con más de 180 días (llamar desde el cron de mantenimiento)
CREATE OR REPLACE FUNCTION gestion.fn_purgar_notificaciones(p_dias int DEFAULT 180)
RETURNS integer LANGUAGE sql AS $$
  WITH borradas AS (
    DELETE FROM gestion.notificaciones
     WHERE leida AND creado_en < now() - make_interval(days => p_dias)
    RETURNING 1
  )
  SELECT count(*)::int FROM borradas;
$$;
