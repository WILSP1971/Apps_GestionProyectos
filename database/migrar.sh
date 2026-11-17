#!/usr/bin/env bash
# =====================================================================
# Aplica migraciones y semillas pendientes (en orden) y las registra.
# Uso:  DATABASE_URL_OWNER=postgres://... ./database/migrar.sh
# =====================================================================
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
URL="${DATABASE_URL_OWNER:-${DATABASE_URL:-}}"
: "${URL:?Defina DATABASE_URL_OWNER (usuario dueño del esquema)}"

psql "$URL" -v ON_ERROR_STOP=1 -q <<'SQL'
CREATE SCHEMA IF NOT EXISTS gestion;
CREATE TABLE IF NOT EXISTS gestion.migraciones_aplicadas(
  archivo     varchar(200) PRIMARY KEY,
  aplicada_en timestamptz NOT NULL DEFAULT now());
SQL

for f in "$DIR"/migraciones/*.sql "$DIR"/semillas/*.sql; do
  [[ -e "$f" ]] || continue
  nombre="$(basename "$(dirname "$f")")/$(basename "$f")"
  ya=$(psql "$URL" -tAc "SELECT 1 FROM gestion.migraciones_aplicadas WHERE archivo='$nombre'")
  if [[ "$ya" != "1" ]]; then
    echo "▶ Aplicando $nombre"
    psql "$URL" -v ON_ERROR_STOP=1 -q -1 -f "$f"
    psql "$URL" -qc "INSERT INTO gestion.migraciones_aplicadas(archivo) VALUES ('$nombre')"
  fi
done
echo "✔ Base de datos al día"
