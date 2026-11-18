#!/usr/bin/env bash
# =====================================================================
# SierraFlow · Copia de seguridad diaria (la programa instalar-servidor.sh en /etc/cron.d)
#   Base de datos (pg_dump formato custom) + adjuntos + .env. Conserva 14 días.
# Restaurar BD:  sudo -u postgres pg_restore -d sierraflow --clean --if-exists <archivo.dump>
# =====================================================================
set -euo pipefail
DESTINO="${DESTINO:-/var/backups/sierraflow}"
BD="${BD:-sierraflow}"
DIAS="${DIAS:-14}"
FECHA=$(date +%Y%m%d_%H%M)

mkdir -p "$DESTINO"
sudo -u postgres pg_dump -Fc "$BD" > "$DESTINO/bd_${FECHA}.dump"
tar -czf "$DESTINO/adjuntos_${FECHA}.tar.gz" -C /var/sierraflow adjuntos
cp /opt/sierraflow/.env "$DESTINO/env_${FECHA}"
chmod 600 "$DESTINO"/*_"${FECHA}"*

find "$DESTINO" -type f -mtime +"$DIAS" -delete
echo "$(date -Is) copia ${FECHA} OK ($(du -sh "$DESTINO" | cut -f1) en total)"
