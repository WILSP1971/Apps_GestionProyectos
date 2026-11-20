#!/usr/bin/env bash
# =====================================================================
# SierraFlow · Endurecimiento del servidor (Sprint 8). Idempotente: se puede ejecutar varias veces.
#
#   sudo bash deploy/endurecer.sh
#
#  1. Nginx: oculta su versión, HSTS y cabeceras extra, límite de peticiones por IP y un registro de
#     accesos SIN parámetros de URL (el token del canal en tiempo real no queda en los logs).
#     No reescribe el sitio de Certbot: solo le agrega una línea "include".
#  2. Permisos del .env y de las copias de seguridad.
#  3. Actualizaciones de seguridad automáticas y fail2ban para SSH.
#  4. Tareas programadas: verificación semanal de copias y purgas de sesiones y auditoría.
# =====================================================================
set -euo pipefail
source "$(dirname "$(readlink -f "$0")")/comun.sh"
requiere_root

DOMINIO="${DOMINIO:-$(leer_env WEB_URL | sed -E 's#^https?://##; s#/.*$##')}"
[[ -n "$DOMINIO" ]] || error "No se pudo deducir el dominio (WEB_URL en $ENV_FILE). Indíquelo: sudo DOMINIO=... bash $0"
SITIO="/etc/nginx/sites-available/sierraflow-${DOMINIO}"
[[ -f "$SITIO" ]] || error "No existe $SITIO (¿se ejecutó instalar-servidor.sh?)"

# ---------------------------------------------------------------------
paso "1/4 Nginx"
# Contexto http (Ubuntu incluye /etc/nginx/conf.d/*.conf dentro de http {})
rm -f /etc/nginx/conf.d/sierraflow-endurecimiento.conf
# server_tokens solo se define si no está ya en la configuración global (evita "directive is duplicate")
TOKENS="server_tokens off;"
grep -rqsE '^[[:space:]]*server_tokens' /etc/nginx/nginx.conf /etc/nginx/conf.d/ && TOKENS="# server_tokens ya definido en la configuración global"
cat > /etc/nginx/conf.d/sierraflow-endurecimiento.conf <<NGX
# SierraFlow · generado por deploy/endurecer.sh
${TOKENS}
# 50 peticiones/s por IP (oficinas con muchos usuarios salen por una sola IP) con ráfagas (la app sincroniza y hace varias llamadas al abrir)
limit_req_zone  \$binary_remote_addr zone=sierraflow_req:10m rate=50r/s;
limit_conn_zone \$binary_remote_addr zone=sierraflow_con:10m;
limit_req_status  429;
limit_conn_status 429;
# Registro sin query string: /api/eventos/stream?token=… no deja el token en disco
log_format sierraflow_sin_query '\$remote_addr - [\$time_local] "\$request_method \$uri \$server_protocol" '
                                '\$status \$body_bytes_sent \$request_time "\$http_user_agent"';
NGX

mkdir -p /etc/nginx/snippets
cat > /etc/nginx/snippets/sierraflow-seguridad.conf <<'NGX'
# SierraFlow · generado por deploy/endurecer.sh (incluido en cada server {} del sitio)
limit_req  zone=sierraflow_req burst=200 nodelay;
limit_conn sierraflow_con 200;
access_log /var/log/nginx/sierraflow.access.log sierraflow_sin_query;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;
NGX

cp "$SITIO" "$SITIO.antes-endurecer"
if grep -q 'snippets/sierraflow-seguridad.conf' "$SITIO"; then
  ok "El sitio ya incluye las reglas de seguridad"
else
  # Una línea include después de cada server_name del dominio (servidor 443 y redirección 80)
  sed -i "/server_name[[:space:]]\+${DOMINIO//./\\.};/a\\  include /etc/nginx/snippets/sierraflow-seguridad.conf;" "$SITIO"
  ok "Reglas agregadas a $SITIO (copia previa: $SITIO.antes-endurecer)"
fi
if nginx -t >/dev/null 2>&1; then
  systemctl reload nginx
  ok "Nginx recargado (HSTS, límite por IP, registro sin tokens, versión oculta)"
else
  cp "$SITIO.antes-endurecer" "$SITIO"
  rm -f /etc/nginx/conf.d/sierraflow-endurecimiento.conf
  nginx -t 2>&1 | sed 's/^/    /'
  error "La configuración de Nginx no fue válida: se restauró la anterior y no se aplicaron cambios"
fi

# ---------------------------------------------------------------------
paso "2/4 Permisos de secretos y copias"
chown root:"$USUARIO" "$ENV_FILE" && chmod 640 "$ENV_FILE"
ok "$ENV_FILE: solo root y $USUARIO pueden leerlo"
mkdir -p /var/backups/sierraflow && chmod 700 /var/backups/sierraflow
ok "/var/backups/sierraflow: solo root"

# ---------------------------------------------------------------------
paso "3/4 Actualizaciones de seguridad y SSH"
export DEBIAN_FRONTEND=noninteractive
apt-get install -y -qq unattended-upgrades fail2ban >/dev/null 2>&1 || aviso "No se pudieron instalar unattended-upgrades/fail2ban (apt)"
if command -v unattended-upgrade >/dev/null; then
  printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' > /etc/apt/apt.conf.d/20auto-upgrades
  ok "Parches de seguridad automáticos (unattended-upgrades)"
fi
if command -v fail2ban-client >/dev/null; then
  if [[ ! -f /etc/fail2ban/jail.d/sierraflow.conf ]]; then
    cat > /etc/fail2ban/jail.d/sierraflow.conf <<'F2B'
[sshd]
enabled  = true
maxretry = 5
findtime = 10m
bantime  = 1h
F2B
  fi
  systemctl enable --now fail2ban >/dev/null 2>&1 && systemctl restart fail2ban && ok "fail2ban: 5 intentos fallidos de SSH → bloqueo 1 h"
fi
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ok "Firewall activo: $(ufw status | grep -cE 'ALLOW') reglas"
else
  aviso "El firewall (ufw) no está activo. Revise antes de activarlo que SSH esté permitido: ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw enable"
fi

# ---------------------------------------------------------------------
paso "4/4 Tareas programadas"
mkdir -p /var/log/sierraflow
cat > /etc/cron.d/sierraflow-endurecimiento <<CRON
# SierraFlow · generado por deploy/endurecer.sh
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
# Simulacro de restauración de la última copia (domingos 4:30 a. m.)
30 4 * * 0 root bash ${APP}/deploy/verificar-copia.sh >> /var/log/sierraflow/verificacion-copias.log 2>&1
# Sesiones vencidas (30 días) y auditoría de más de 2 años
50 3 * * * postgres psql -d ${BD} -qtAc "SELECT gestion.fn_purgar_sesiones(30)" >> /var/log/sierraflow/mantenimiento.log 2>&1
55 3 1 * * postgres psql -d ${BD} -qtAc "SELECT gestion.fn_purgar_auditoria(730)" >> /var/log/sierraflow/mantenimiento.log 2>&1
CRON
chmod 644 /etc/cron.d/sierraflow-endurecimiento
ok "Verificación semanal de copias y purgas programadas"

echo -e "\n${C_VERDE}Endurecimiento aplicado.${C_FIN} Compruebe con:  bash ${APP}/deploy/prueba-humo.sh"
