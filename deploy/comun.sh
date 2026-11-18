#!/usr/bin/env bash
# =====================================================================
# SierraFlow · funciones y valores comunes de los scripts de despliegue
# =====================================================================
# Usuario de Linux que ejecuta la app y carpeta del código (se pueden cambiar al invocar el script):
#   sudo USUARIO=swarm APP=/home/swarm/proyectos/Apps_GestionProyectos bash deploy/instalar-servidor.sh
# Si no se indican, se deducen de la carpeta donde está este script y de su dueño.
_RAIZ_SCRIPT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/.." && pwd)"
APP="${APP:-$_RAIZ_SCRIPT}"
USUARIO="${USUARIO:-$(stat -c %U "$APP")}"
[[ "$USUARIO" == "root" ]] && USUARIO="sierraflow"
# Configuración y secretos fuera del repositorio
BASE="${BASE:-/opt/sierraflow}"
ENV_FILE="$BASE/.env"
BD="${BD:-sierraflow}"

C_AZUL='\033[1;36m'; C_VERDE='\033[1;32m'; C_AMARILLO='\033[1;33m'; C_ROJO='\033[1;31m'; C_FIN='\033[0m'
paso()  { echo -e "\n${C_AZUL}▶ $*${C_FIN}"; }
ok()    { echo -e "  ${C_VERDE}✔${C_FIN} $*"; }
aviso() { echo -e "  ${C_AMARILLO}⚠ $*${C_FIN}"; }
error() { echo -e "\n${C_ROJO}✖ $*${C_FIN}" >&2; exit 1; }

requiere_root() {
  [[ $EUID -eq 0 ]] || error "Ejecute este script con sudo:  sudo bash $0"
}

# Valor de una clave del .env (sin comillas)
leer_env() {
  local v
  v="$(grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2-)"
  v="${v%\"}"; v="${v#\"}"
  printf '%s' "$v"
}

# Ejecuta un comando como el usuario de la aplicación, dentro del repositorio
como_app() {
  sudo -u "$USUARIO" -H env PATH="$PATH" CI=true bash -c "cd '$APP' && $1"
}

# Espera a que una URL local responda 2xx/3xx (reintentos de 2 s)
esperar_url() {
  local url="$1" intentos="${2:-30}"
  for ((i = 1; i <= intentos; i++)); do
    if curl -fsS -o /dev/null --max-time 3 "$url"; then return 0; fi
    sleep 2
  done
  return 1
}
