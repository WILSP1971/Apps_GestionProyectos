#!/usr/bin/env bash
# =====================================================================
# SierraFlow · Medición rápida de tiempos de respuesta (sin herramientas extra, solo curl)
#
#   bash deploy/medir-rendimiento.sh                    # 30 peticiones por punto, URL de WEB_URL
#   N=100 bash deploy/medir-rendimiento.sh https://proyectos.sierrainnova.tech
#
# Mide la mediana (p50), el percentil 95 y el máximo de: página de login, hoja de estilos,
# API (incluye una consulta a PostgreSQL) y analítica. Objetivo: p95 < 300 ms en la API.
# =====================================================================
set -uo pipefail
source "$(dirname "$(readlink -f "$0")")/comun.sh"
URL="${1:-$(leer_env WEB_URL)}"; URL="${URL%/}"
N="${N:-30}"
[[ -n "$URL" ]] || error "Indique la URL:  bash $0 https://su-dominio"

css=$(curl -sS --max-time 10 "$URL/login" | grep -oE '/_next/static/[^"]+\.css' | head -1)
paso "Tiempos de respuesta · $URL · $N peticiones por punto"
printf '  %-28s %8s %8s %8s %8s\n' "Punto" "p50 ms" "p95 ms" "máx ms" "errores"
medir() {
  local nombre="$1" ruta="$2" tiempos=() errores=0 t c
  for ((i = 0; i < N; i++)); do
    read -r c t < <(curl -sS -o /dev/null --max-time 10 -w '%{http_code} %{time_total}' "$URL$ruta" 2>/dev/null || echo "000 0")
    [[ "$c" =~ ^[23] ]] || errores=$((errores + 1))
    tiempos+=("$(awk -v t="$t" 'BEGIN { printf "%.1f", t * 1000 }')")
  done
  mapfile -t ord < <(printf '%s\n' "${tiempos[@]}" | sort -g)
  local p50=${ord[$(( N / 2 ))]} p95=${ord[$(( (N * 95 + 99) / 100 - 1 ))]} max=${ord[$(( N - 1 ))]}
  printf '  %-28s %8s %8s %8s %8s\n' "$nombre" "$p50" "$p95" "$max" "$errores"
}
medir "Página de login" "/login"
[[ -n "$css" ]] && medir "Hoja de estilos (caché)" "$css"
medir "API + base de datos" "/api/salud"
medir "Analítica" "/analitica/salud"
echo -e "\n  Las mediciones incluyen la red entre este equipo y el servidor. Para aislar el servidor, ejecútelo en el VPS."
