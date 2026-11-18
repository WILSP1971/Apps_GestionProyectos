#!/usr/bin/env bash
# =====================================================================
# SierraFlow · Despliegue / actualización en el VPS
#
#   sudo bash /opt/sierraflow/app/deploy/desplegar.sh            # trae lo último de GitHub y despliega
#   sudo bash /opt/sierraflow/app/deploy/desplegar.sh --sin-git  # despliega el código que ya está en el servidor
#
# Pasos: git pull → dependencias → migraciones → compilación → Python → PM2 → verificación.
# =====================================================================
set -euo pipefail
source "$(dirname "$(readlink -f "$0")")/comun.sh"
requiere_root

SIN_GIT=false
[[ "${1:-}" == "--sin-git" ]] && SIN_GIT=true
[[ -f "$ENV_FILE" ]] || error "No existe $ENV_FILE. Ejecute primero deploy/instalar-servidor.sh"

INICIO=$(date +%s)

paso "1/7 Código fuente"
chown -R "$USUARIO:$USUARIO" "$APP"
if $SIN_GIT; then
  ok "Se usa el código actual ($(como_app 'git rev-parse --short HEAD 2>/dev/null || echo sin-git'))"
else
  # Un pnpm-lock.yaml generado en el servidor (no versionado) impediría traer el del repositorio
  como_app "git ls-files --error-unmatch pnpm-lock.yaml >/dev/null 2>&1 || rm -f pnpm-lock.yaml"
  como_app "git pull --ff-only"
  ok "Versión $(como_app 'git log -1 --format="%h %s"')"
fi
ln -sfn "$ENV_FILE" "$APP/.env"   # todas las apps leen el mismo .env

paso "2/7 Dependencias Node (pnpm)"
if [[ -f "$APP/pnpm-lock.yaml" ]]; then
  como_app "pnpm install --frozen-lockfile"
else
  aviso "No hay pnpm-lock.yaml en el repositorio: se instalan las versiones más recientes compatibles."
  aviso "Recomendado: haga commit de pnpm-lock.yaml desde su PC para builds reproducibles."
  como_app "pnpm install --no-frozen-lockfile"
fi
ok "Dependencias instaladas"

paso "3/7 Migraciones de base de datos"
como_app "DATABASE_URL_OWNER='$(leer_env DATABASE_URL_OWNER)' bash database/migrar.sh"

paso "4/7 Compilación (contratos → API → web)"
MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
HEAP=$(( MEM_MB > 4096 ? 3072 : 1536 ))
como_app "pnpm --filter @sierraflow/contratos build"
como_app "pnpm --filter @sierraflow/api build"
como_app "GIT_SHA=\$(git rev-parse --short HEAD 2>/dev/null || date +%s) NODE_OPTIONS=--max-old-space-size=$HEAP pnpm --filter @sierraflow/web build"
# El servidor standalone de Next.js necesita los estáticos a su lado
WEB_SA="$APP/apps/web/.next/standalone/apps/web"
[[ -f "$WEB_SA/server.js" ]] || error "No se generó $WEB_SA/server.js (revise output: 'standalone' en next.config.ts)"
como_app "rm -rf '$WEB_SA/public' '$WEB_SA/.next/static' && cp -r apps/web/public '$WEB_SA/public' && mkdir -p '$WEB_SA/.next' && cp -r apps/web/.next/static '$WEB_SA/.next/static'"
ok "Compilación lista"

paso "5/7 Servicio de analítica (Python)"
como_app "cd services/analitica && { [[ -x .venv/bin/python ]] || python3 -m venv .venv; } && .venv/bin/pip install -q --upgrade pip && .venv/bin/pip install -q -r requirements.txt"
if systemctl list-unit-files | grep -q '^sierraflow-analitica.service'; then
  systemctl restart sierraflow-analitica
  ok "sierraflow-analitica reiniciado"
else
  aviso "Servicio systemd sierraflow-analitica no instalado (lo crea instalar-servidor.sh)"
fi

paso "6/7 Procesos Node (PM2)"
como_app "pm2 startOrReload deploy/ecosystem.config.cjs --update-env && pm2 save"

paso "7/7 Verificación"
PUERTO_WEB=$(leer_env PUERTO_WEB); PUERTO_API=$(leer_env API_PORT); PUERTO_PY=$(leer_env PUERTO_ANALITICA)
FALLAS=0
if esperar_url "http://127.0.0.1:${PUERTO_API}/api/salud"; then ok "API      http://127.0.0.1:${PUERTO_API}/api/salud"; else aviso "La API no responde (pm2 logs sierraflow-api)"; FALLAS=1; fi
if esperar_url "http://127.0.0.1:${PUERTO_WEB}/login"; then ok "Web      http://127.0.0.1:${PUERTO_WEB}/login"; else aviso "La web no responde (pm2 logs sierraflow-web)"; FALLAS=1; fi
if esperar_url "http://127.0.0.1:${PUERTO_PY}/salud" 10; then ok "Analítica http://127.0.0.1:${PUERTO_PY}/salud"; else aviso "Analítica no responde (journalctl -u sierraflow-analitica -n 50)"; FALLAS=1; fi

echo
if [[ $FALLAS -eq 0 ]]; then
  echo -e "${C_VERDE}Despliegue completado en $(( $(date +%s) - INICIO )) s → $(leer_env WEB_URL)${C_FIN}"
else
  error "Despliegue terminado con servicios sin responder. Revise los registros indicados arriba."
fi
