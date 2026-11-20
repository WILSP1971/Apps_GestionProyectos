-- =====================================================================
-- SierraFlow · Diagnóstico de la base de datos (solo lectura)
--   sudo -u postgres psql -d sierraflow -f database/diagnostico/salud_bd.sql
-- =====================================================================
\pset footer off
\echo '== Tamaño de la base y de las tablas más grandes =='
SELECT pg_size_pretty(pg_database_size(current_database())) AS base_de_datos;
SELECT relname AS tabla, n_live_tup AS filas, pg_size_pretty(pg_total_relation_size(relid)) AS tamano_total
  FROM pg_stat_user_tables WHERE schemaname = 'gestion'
 ORDER BY pg_total_relation_size(relid) DESC LIMIT 12;

\echo '== Tablas leídas completas con frecuencia (posible índice faltante) =='
SELECT relname AS tabla, seq_scan, idx_scan, n_live_tup AS filas
  FROM pg_stat_user_tables
 WHERE schemaname = 'gestion' AND n_live_tup > 1000 AND seq_scan > coalesce(idx_scan, 0)
 ORDER BY seq_scan DESC LIMIT 10;

\echo '== Índices nunca usados desde el último reinicio de estadísticas =='
SELECT relname AS tabla, indexrelname AS indice, pg_size_pretty(pg_relation_size(indexrelid)) AS tamano
  FROM pg_stat_user_indexes
 WHERE schemaname = 'gestion' AND idx_scan = 0 AND indexrelname NOT LIKE '%pkey' AND indexrelname NOT LIKE 'uq_%'
 ORDER BY pg_relation_size(indexrelid) DESC LIMIT 15;

\echo '== Filas muertas (VACUUM pendiente) =='
SELECT relname AS tabla, n_dead_tup AS muertas, n_live_tup AS vivas, last_autovacuum
  FROM pg_stat_user_tables
 WHERE schemaname = 'gestion' AND n_dead_tup > 1000
 ORDER BY n_dead_tup DESC LIMIT 10;

\echo '== Eventos del outbox sin procesar (deberían ser ~0) =='
SELECT count(*) AS pendientes, min(ocurrido_en) AS mas_antiguo FROM gestion.eventos_outbox WHERE procesado_en IS NULL;

\echo '== Conexiones por aplicación =='
SELECT usename AS rol, state AS estado, count(*) FROM pg_stat_activity WHERE datname = current_database() GROUP BY 1, 2 ORDER BY 3 DESC;

\echo '== Consultas más lentas (requiere la extensión pg_stat_statements; si no está, se omite) =='
SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') AS hay_pg_stat_statements \gset
\if :hay_pg_stat_statements
SELECT round(mean_exec_time::numeric, 1) AS ms_promedio, calls AS llamadas, left(regexp_replace(query, '\s+', ' ', 'g'), 110) AS consulta
  FROM pg_stat_statements WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
 ORDER BY mean_exec_time DESC LIMIT 10;
\endif
