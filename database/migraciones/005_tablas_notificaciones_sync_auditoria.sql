-- =====================================================================
-- SierraFlow · 005 · Notificaciones, outbox, sincronización y auditoría
-- =====================================================================
SET search_path TO gestion, public;

CREATE TABLE notificaciones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id    uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo_evento   varchar(60)  NOT NULL,        -- SOLICITUD_ENVIADA, SLA_EN_RIESGO...
  titulo        varchar(200) NOT NULL,
  mensaje       text NOT NULL,
  enlace        text,                          -- /solicitudes/{id}
  datos         jsonb NOT NULL DEFAULT '{}',
  severidad     varchar(10) NOT NULL DEFAULT 'INFO' CHECK (severidad IN ('INFO','EXITO','ALERTA','CRITICA')),
  leida         boolean NOT NULL DEFAULT false,
  fecha_lectura timestamptz,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  seq_cambio    bigint NOT NULL DEFAULT nextval('gestion.seq_sync')
);
CREATE INDEX ix_notificaciones_usuario ON notificaciones(usuario_id, leida, creado_en DESC);

CREATE TABLE preferencias_notificacion (
  usuario_id  uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo_evento varchar(60) NOT NULL,
  canal       canal_notificacion NOT NULL,
  activo      boolean NOT NULL DEFAULT true,
  PRIMARY KEY (usuario_id, tipo_evento, canal)
);

CREATE TABLE suscripciones_push (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id   uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  endpoint     text NOT NULL UNIQUE,
  clave_p256dh text NOT NULL,
  clave_auth   text NOT NULL,
  user_agent   text,
  creado_en    timestamptz NOT NULL DEFAULT now(),
  ultimo_uso   timestamptz
);

-- Transactional Outbox: los eventos de dominio se guardan en la MISMA transacción del cambio
CREATE TABLE eventos_outbox (
  id           bigserial PRIMARY KEY,
  agregado     varchar(60) NOT NULL,           -- Solicitud, Asignacion, Evaluacion...
  agregado_id  uuid NOT NULL,
  tipo_evento  varchar(80) NOT NULL,           -- solicitud.enviada, solicitud.asignada...
  payload      jsonb NOT NULL,
  ocurrido_en  timestamptz NOT NULL DEFAULT now(),
  procesado_en timestamptz,
  intentos     smallint NOT NULL DEFAULT 0,
  ultimo_error text
);
CREATE INDEX ix_outbox_pendientes ON eventos_outbox(id) WHERE procesado_en IS NULL;
CREATE INDEX ix_outbox_agregado   ON eventos_outbox(agregado_id, tipo_evento);

-- Idempotencia de operaciones offline (cada operación lleva un UUID generado en el cliente)
CREATE TABLE sync_operaciones (
  id_operacion   uuid PRIMARY KEY,
  usuario_id     uuid NOT NULL REFERENCES usuarios(id),
  dispositivo_id varchar(80) NOT NULL,
  entidad        varchar(60) NOT NULL,
  entidad_id     uuid NOT NULL,
  tipo           varchar(40) NOT NULL,
  resultado      jsonb NOT NULL,               -- respuesta original para reintentos
  procesada_en   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auditoria (
  id            bigserial PRIMARY KEY,
  tabla         varchar(60) NOT NULL,
  registro_id   uuid,
  operacion     operacion_auditoria NOT NULL,
  usuario_id    uuid,                          -- tomado de current_setting('app.usuario_id')
  datos_antes   jsonb,
  datos_despues jsonb,
  fecha         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_auditoria_registro ON auditoria(tabla, registro_id, fecha DESC);
