-- =====================================================================
-- SierraFlow · 008 · Roles de base de datos (ejecutar como superusuario "postgres")
--   psql -d sierraflow -v clave_app='...' -v clave_analitica='...' -f 008_roles_seguridad.sql
-- =====================================================================
\if :{?clave_app}
\else
  \set clave_app 'CAMBIAR_CLAVE_APP'
\endif
\if :{?clave_analitica}
\else
  \set clave_analitica 'CAMBIAR_CLAVE_ANALITICA'
\endif

SELECT 'CREATE ROLE sierraflow_app LOGIN'
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sierraflow_app') \gexec
SELECT 'CREATE ROLE sierraflow_analitica LOGIN'
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sierraflow_analitica') \gexec

ALTER ROLE sierraflow_app       PASSWORD :'clave_app';
ALTER ROLE sierraflow_analitica PASSWORD :'clave_analitica';

-- Aplicación (API NestJS): lectura/escritura sin DDL
GRANT USAGE ON SCHEMA gestion TO sierraflow_app, sierraflow_analitica;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA gestion TO sierraflow_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA gestion TO sierraflow_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA gestion TO sierraflow_app;
REVOKE UPDATE, DELETE ON gestion.auditoria FROM sierraflow_app;   -- auditoría solo-inserción

-- Analítica (FastAPI): lectura + publicar eventos y evaluaciones
GRANT SELECT ON ALL TABLES IN SCHEMA gestion TO sierraflow_analitica;
GRANT INSERT ON gestion.eventos_outbox, gestion.evaluaciones, gestion.evaluacion_detalle,
                gestion.calificaciones_individuales TO sierraflow_analitica;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA gestion TO sierraflow_analitica;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA gestion TO sierraflow_analitica;

ALTER ROLE sierraflow_app       SET search_path = gestion, public;
ALTER ROLE sierraflow_analitica SET search_path = gestion, public;
