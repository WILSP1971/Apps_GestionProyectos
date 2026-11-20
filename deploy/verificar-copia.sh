#!/usr/bin/env bash
# =====================================================================
# SierraFlow · Verificación de la última copia de seguridad (simulacro de restauración)
#
#   sudo bash deploy/verificar-copia.sh
#
# Restaura la copia más reciente en una base TEMPORAL (sierraflow_verificacion), compara la
# cantidad de registros de las tablas principales con la base en producción y la elimina.
# Una copia que no se puede restaurar no es una copia. Programada cada domingo por endurecer.sh.
# =====================================================================
set -uo pipefail
source "$(dirname "$(readlink -f "$0")")/comun.sh"
requiere_root

DESTINO="${DESTINO:-/var/backups/sierraflow}"
TEMP_BD="${BD}_verificacion"
COPIA=$(ls -1t "$DESTINO"/bd_*.dump 2>/dev/null | head -1)
[[ -n "$COPIA" ]] || error "No hay copias en $DESTINO (¿corre deploy/backup.sh a diario?)"

edad_h=$(( ($(date +%s) - $(stat -c %Y "$COPIA")) / 3600 ))
paso "Verificando $(basename "$COPIA") ($(du -h "$COPIA" | cut -f1), hace ${edad_h} h)"
(( edad_h <= 30 )) || aviso "La copia más reciente tiene más de 30 horas: revise /var/log/sierraflow/backup.log"

sql() { sudo -u postgres psql -qtAX -d "$1" -c "$2"; }
sudo -u postgres dropdb --if-exists "$TEMP_BD"
sudo -u postgres createdb "$TEMP_BD"
trap 'sudo -u postgres dropdb --if-exists "$TEMP_BD"' EXIT

# Los roles ya existen en el servidor; --no-owner evita depender de ellos
if ! sudo -u postgres pg_restore --no-owner --no-privileges --exit-on-error -d "$TEMP_BD" < "$COPIA" 2>/tmp/sierraflow-restauracion.err; then
  error "La copia NO se pudo restaurar: $(tail -3 /tmp/sierraflow-restauracion.err)"
fi
ok "Restauración completa en la base temporal"

FALLAS=0
for t in usuarios solicitudes tareas evaluaciones proyectos migraciones_aplicadas; do
  copia=$(sql "$TEMP_BD" "SELECT count(*) FROM gestion.$t" 2>/dev/null || echo "?")
  actual=$(sql "$BD" "SELECT count(*) FROM gestion.$t" 2>/dev/null || echo "?")
  if [[ "$copia" == "?" ]]; then
    echo -e "  ${C_ROJO}✖${C_FIN} gestion.$t no existe en la copia"; FALLAS=$((FALLAS + 1))
  elif [[ "$actual" != "?" ]] && (( copia > actual )); then
    echo -e "  ${C_ROJO}✖${C_FIN} gestion.$t: la copia tiene más registros ($copia) que producción ($actual)"; FALLAS=$((FALLAS + 1))
  else
    ok "gestion.$t: $copia en la copia · $actual hoy"
  fi
done

echo
if (( FALLAS )); then echo -e "${C_ROJO}$(date -Is) verificación FALLIDA ($FALLAS)${C_FIN}"; exit 1; fi
echo -e "${C_VERDE}$(date -Is) copia $(basename "$COPIA") verificada: se puede restaurar${C_FIN}"
