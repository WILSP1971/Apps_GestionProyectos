-- =====================================================================
-- SierraFlow · 001 · Esquema, extensiones, secuencias y tipos
-- Ejecutar con el usuario dueño de la base de datos (sierraflow_owner)
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid(), digest()
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- similitud de texto (detección de duplicados)
CREATE EXTENSION IF NOT EXISTS citext;     -- emails sin distinción de mayúsculas
CREATE EXTENSION IF NOT EXISTS unaccent;   -- búsqueda sin tildes

CREATE SCHEMA IF NOT EXISTS gestion;
SET search_path TO gestion, public;

-- Secuencia global de cambios: alimenta la sincronización offline (pull por cursor)
CREATE SEQUENCE IF NOT EXISTS gestion.seq_sync;
-- Consecutivos legibles: SOL-000001 / PRY-0001
CREATE SEQUENCE IF NOT EXISTS gestion.seq_codigo_solicitud;
CREATE SEQUENCE IF NOT EXISTS gestion.seq_codigo_proyecto;

CREATE TYPE gestion.estado_solicitud AS ENUM (
  'BORRADOR','ENVIADA','EN_REVISION','APROBADA','RECHAZADA',
  'ASIGNADA','EN_DESARROLLO','EN_VALIDACION','CERRADA','CANCELADA'
);
CREATE TYPE gestion.tipo_solicitud      AS ENUM ('FUNCIONAL','TECNICA','MEJORA','INCIDENTE','CAMBIO');
CREATE TYPE gestion.prioridad           AS ENUM ('BAJA','MEDIA','ALTA','CRITICA');
CREATE TYPE gestion.estado_tarea        AS ENUM ('PENDIENTE','EN_PROGRESO','BLOQUEADA','COMPLETADA');
CREATE TYPE gestion.estado_proyecto     AS ENUM ('PLANEACION','EN_EJECUCION','EN_PAUSA','CERRADO','CANCELADO');
CREATE TYPE gestion.estado_riesgo       AS ENUM ('ABIERTO','MITIGADO','MATERIALIZADO','CERRADO');
CREATE TYPE gestion.canal_notificacion  AS ENUM ('APP','EMAIL','PUSH');
CREATE TYPE gestion.operacion_auditoria AS ENUM ('INSERT','UPDATE','DELETE');
