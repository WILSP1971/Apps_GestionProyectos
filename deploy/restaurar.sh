#!/usr/bin/env bash
# =====================================================================
# SierraFlow · Restaurar la base de datos desde una copia (procedimiento guiado)
#
#   sudo bash deploy/restaurar.sh                       # elige de la lista
#   sudo bash deploy/restaurar.sh /var/backups/sierraflow/bd_20261118_0215.dump
#
# 1) Saca una copia de seguridad del estado ACTUAL (por si hay que deshacer).
# 2) Detiene la API y la web.  3) Restaura.  4) Aplica migraciones pendientes.  5) Reinicia y verifica.
# =====================================================================
set -euo pipefail
source "$(dirname "$(readlink -f "$0")")/comun.sh"
requiere_root

DESTINO="${DESTINO:-/var/backups/sierraflow}"
COPIA="${1:-}"
if [[ -z "$COPIA" ]]; then
  mapfile -t LISTA < <(ls -1t "$DESTINO"/bd_*.dump 2>/dev/null | head -10)
  (( ${#LISTA[@]} )) || error "No hay copias en $DESTINO"
  echo "Copias disponibles (más reciente primero):"
  for i in "${!LISTA[@]}"; do printf '  %2d) %s  (%s)\n' $((i + 1)) "$(basename "${LISTA[$i]}")" "$(du -h "${LISTA[$i]}" | cut -f1)"; done
  read -rp "Número de la copia a restaurar: " n
  [[ "$n" =~ ^[0-9]+$ ]] && (( n >= 1 && n <= ${#LISTA[@]} )) || error "Opción inválida"
  COPIA="${LISTA[$((n - 1))]}"
fi
[[ -f "$COPIA" ]] || error "No existe $COPIA"

echo -e "\n${C_AMARILLO}Se reemplazará TODA la base '$BD' por $(basename "$COPIA").${C_FIN}"
echo "Los cambios hechos después de esa copia se perderán (quedará un respaldo del estado actual)."
read -rp "Escriba RESTAURAR para continuar: " confirmacion
[[ "$confirmacion" == "RESTAURAR" ]] || error "Cancelado"

paso "1/5 Respaldo del estado actual"
mkdir -p "$DESTINO"
PREVIA="$DESTINO/bd_antes_de_restaurar_$(date +%Y%m%d_%H%M).dump"
sudo -u postgres pg_dump -Fc "$BD" > "$PREVIA" && chmod 600 "$PREVIA"
ok "Guardado en $PREVIA"

paso "2/5 Deteniendo la API y la web"
como_app "pm2 stop sierraflow-api sierraflow-web >/dev/null" || true
systemctl stop sierraflow-analitica 2>/dev/null || true
ok "Servicios detenidos"

paso "3/5 Restaurando"
sudo -u postgres psql -qtAc "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$BD' AND pid <> pg_backend_pid()" >/dev/null
sudo -u postgres pg_restore --clean --if-exists --exit-on-error -d "$BD" < "$COPIA"   # root lee el archivo (permisos 600)
ok "Base restaurada"

paso "4/5 Migraciones pendientes"
export DATABASE_URL_OWNER="$(leer_env DATABASE_URL_OWNER)"
bash "$APP/database/migrar.sh" | tail -2

paso "5/5 Reiniciando"
systemctl start sierraflow-analitica 2>/dev/null || true
como_app "pm2 start sierraflow-api sierraflow-web >/dev/null"
esperar_url "http://127.0.0.1:$(leer_env API_PORT)/api/salud" && ok "API en línea" || aviso "La API no responde: pm2 logs sierraflow-api"
echo -e "\n${C_VERDE}Restauración terminada.${C_FIN} Si algo salió mal, restaure el respaldo previo:\n  sudo bash $0 $PREVIA"
