#!/usr/bin/env bash
# =====================================================================
# SierraFlow · Prueba de humo contra la URL PÚBLICA (lo que ve el usuario)
#
#   bash deploy/prueba-humo.sh                       # usa WEB_URL de /opt/sierraflow/.env
#   bash deploy/prueba-humo.sh https://proyectos.sierrainnova.tech
#
# Verifica: HTTPS y redirección, página de login CON sus estilos, Service Worker, manifest,
# API y base de datos, analítica, que la API exija sesión, cabeceras de seguridad y vigencia
# del certificado. Sale con código 1 si algo crítico falla. La ejecuta desplegar.sh al terminar.
# =====================================================================
set -uo pipefail
source "$(dirname "$(readlink -f "$0")")/comun.sh"

URL="${1:-$(leer_env WEB_URL)}"
URL="${URL%/}"
[[ -n "$URL" ]] || error "Indique la URL pública:  bash $0 https://su-dominio"
HOST="${URL#*://}"; HOST="${HOST%%/*}"
FALLAS=0; AVISOS=0
mal()  { echo -e "  ${C_ROJO}✖${C_FIN} $*"; FALLAS=$((FALLAS + 1)); }
leve() { aviso "$*"; AVISOS=$((AVISOS + 1)); }
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
pedir() { curl -sS -L --max-time 15 -o "$TMP/cuerpo" -D "$TMP/cabeceras" -w '%{http_code}' "$@" 2>/dev/null || echo 000; }
cabecera() { grep -i "^$1:" "$TMP/cabeceras" | tail -1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//'; }

paso "Prueba de humo · $URL"

# 1. Redirección http → https
if [[ "$URL" == https://* ]]; then
  c=$(curl -sS -o /dev/null --max-time 10 -w '%{http_code} %{redirect_url}' "http://$HOST/login" 2>/dev/null || echo 000)
  [[ "$c" == 30[18]\ https://* ]] && ok "http redirige a https" || leve "http://$HOST no redirige a https ($c)"
fi

# 2. Login con estilos (el CSS que pide la página debe existir)
c=$(pedir "$URL/login")
if [[ "$c" == 200 ]] && grep -q "SierraFlow" "$TMP/cuerpo"; then
  ok "Página de login (200)"
  css=$(grep -oE '/_next/static/[^"]+\.css' "$TMP/cuerpo" | head -1)
  if [[ -z "$css" ]]; then mal "La página no enlaza ninguna hoja de estilos"
  else
    c=$(pedir "$URL$css")
    [[ "$c" == 200 ]] && [[ "$(cabecera content-type)" == text/css* ]] && ok "Estilos disponibles ($css)" || mal "Los estilos no cargan ($c $css): la web se vería sin diseño"
  fi
else
  mal "La página de login no responde bien (HTTP $c)"
fi

# 3. Service Worker y manifest (modo sin conexión e instalación como app)
c=$(pedir "$URL/sw.js")
[[ "$c" == 200 ]] && ok "Service Worker (sw.js)" || mal "sw.js no disponible ($c): no funcionará sin conexión"
[[ "$(cabecera cache-control)" == *no-cache* || "$(cabecera cache-control)" == *no-store* ]] || leve "sw.js debería servirse sin caché"
c=$(pedir "$URL/manifest.webmanifest")
[[ "$c" == 200 ]] && ok "Manifest de la app instalable" || leve "manifest.webmanifest no disponible ($c)"

# 4. API, base de datos y analítica
c=$(pedir "$URL/api/salud")
if [[ "$c" == 200 ]] && grep -q '"baseDatos":"ok"' "$TMP/cuerpo"; then
  ok "API y base de datos ($(grep -oE '"latenciaMs":[0-9]+' "$TMP/cuerpo" | cut -d: -f2) ms)"
else
  mal "API o base de datos con problemas (HTTP $c: $(head -c 120 "$TMP/cuerpo"))"
fi
c=$(pedir "$URL/analitica/salud")
[[ "$c" == 200 ]] && ok "Servicio de analítica" || mal "Analítica no responde ($c): los reportes fallarán"

# 5. La API exige sesión y no expone datos en caché
c=$(pedir "$URL/api/solicitudes")
[[ "$c" == 401 ]] && ok "La API rechaza peticiones sin sesión (401)" || mal "GET /api/solicitudes sin sesión devolvió $c (se esperaba 401)"

# 6. Cabeceras de seguridad
pedir "$URL/login" >/dev/null
for h in x-content-type-options x-frame-options referrer-policy; do
  [[ -n "$(cabecera $h)" ]] || leve "Falta la cabecera $h"
done
if [[ "$URL" == https://* ]]; then
  [[ -n "$(cabecera strict-transport-security)" ]] && ok "HSTS activo" || leve "Falta Strict-Transport-Security (ejecute: sudo bash deploy/endurecer.sh)"
fi
[[ "$(cabecera server)" == *nginx/[0-9]* ]] && leve "Nginx muestra su versión (server_tokens off en deploy/endurecer.sh)"

# 7. Certificado
if [[ "$URL" == https://* ]]; then
  fin=$(echo | openssl s_client -servername "$HOST" -connect "$HOST:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  if [[ -n "$fin" ]]; then
    dias=$(( ($(date -d "$fin" +%s) - $(date +%s)) / 86400 ))
    (( dias > 14 )) && ok "Certificado vigente ($dias días)" || leve "El certificado vence en $dias días (revise: systemctl status certbot.timer)"
  else
    leve "No se pudo leer el certificado de $HOST"
  fi
fi

echo
if (( FALLAS )); then echo -e "${C_ROJO}Prueba de humo: $FALLAS falla(s), $AVISOS aviso(s)${C_FIN}"; exit 1; fi
(( AVISOS )) && echo -e "${C_VERDE}Prueba de humo superada${C_FIN} con $AVISOS aviso(s)" || echo -e "${C_VERDE}Prueba de humo superada${C_FIN}"
