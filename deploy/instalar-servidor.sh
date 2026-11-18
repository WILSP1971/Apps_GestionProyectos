#!/usr/bin/env bash
# =====================================================================
# SierraFlow · Instalación inicial en el VPS Ubuntu (se puede volver a ejecutar sin daño)
#
#   sudo bash /opt/sierraflow/app/deploy/instalar-servidor.sh
#
# Variables opcionales (ejemplo: sudo DOMINIO=app.sierrainnova.tech bash ...):
#   DOMINIO       proyectos.sierrainnova.tech   subdominio donde se publica la app
#   CORREO_ADMIN  admin@sierrainnova.tech       correo para Let's Encrypt y primer administrador
#   PUERTO_WEB / PUERTO_API / PUERTO_PY         3010 / 4010 / 8010 (internos, solo 127.0.0.1)
#
# Qué hace: paquetes → Node/pnpm/PM2 → usuario y carpetas → secretos y .env → PostgreSQL →
#           servicio Python (systemd) → compilación y arranque → Nginx → HTTPS → copias y firewall.
# No toca otros sitios de Nginx ni otras bases de datos existentes.
# =====================================================================
set -euo pipefail
source "$(dirname "$(readlink -f "$0")")/comun.sh"
requiere_root

DOMINIO="${DOMINIO:-proyectos.sierrainnova.tech}"
CORREO_ADMIN="${CORREO_ADMIN:-admin@sierrainnova.tech}"
PUERTO_WEB="${PUERTO_WEB:-3010}"
PUERTO_API="${PUERTO_API:-4010}"
PUERTO_PY="${PUERTO_PY:-8010}"

[[ -f "$APP/package.json" ]] || error "No encuentro el código en $APP. Clone primero el repositorio (docs/Despliegue_VPS.md, paso 3)."

echo -e "${C_AZUL}SierraFlow · instalación en $(hostname) para https://${DOMINIO}${C_FIN}"

# ---------------------------------------------------------------------
paso "1/11 Paquetes del sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nginx certbot python3-certbot-nginx python3-venv python3-pip git ufw openssl curl cron >/dev/null
ok "nginx, certbot, python3-venv, git, ufw, openssl"

command -v psql >/dev/null || error "PostgreSQL no está instalado (sudo apt install postgresql postgresql-contrib)"
PG_MAYOR=$(sudo -u postgres psql -tAc "SHOW server_version_num" | cut -c1-2)
(( PG_MAYOR >= 13 )) || error "Se requiere PostgreSQL 13 o superior (instalado: $PG_MAYOR)"
ok "PostgreSQL $PG_MAYOR"

# ---------------------------------------------------------------------
paso "2/11 Node.js, pnpm y PM2"
command -v node >/dev/null || error "Node.js no está instalado"
NODE_MAYOR=$(node -p 'process.versions.node.split(".")[0]')
NODE_MENOR=$(node -p 'process.versions.node.split(".")[1]')
if (( NODE_MAYOR < 20 || (NODE_MAYOR == 20 && NODE_MENOR < 12) )); then
  error "Node $(node -v) es antiguo. Instale Node 22 LTS:
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs"
fi
(( NODE_MAYOR >= 22 )) || aviso "Node $(node -v) funciona, pero se recomienda Node 22 LTS"
command -v pnpm >/dev/null || npm install -g pnpm@9 >/dev/null 2>&1
command -v pm2  >/dev/null || npm install -g pm2 >/dev/null 2>&1
ok "node $(node -v) · pnpm $(pnpm -v) · pm2 $(pm2 -v 2>/dev/null | tail -1)"

# ---------------------------------------------------------------------
paso "3/11 Usuario del sistema y carpetas"
if ! id -u "$USUARIO" >/dev/null 2>&1; then
  adduser --system --group --home "/home/$USUARIO" --shell /bin/bash "$USUARIO" >/dev/null
  ok "Usuario $USUARIO creado"
fi
mkdir -p "$BASE" /var/sierraflow/adjuntos /var/backups/sierraflow /var/log/sierraflow
chown -R "$USUARIO:$USUARIO" "$APP" /var/sierraflow /var/log/sierraflow
chmod 750 /var/sierraflow
ok "$BASE, /var/sierraflow/adjuntos, /var/log/sierraflow"

# Memoria de intercambio: la compilación de Next.js necesita ~2 GB
MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if (( MEM_MB < 3000 )) && ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  ok "Swap de 2 GB creado (RAM: ${MEM_MB} MB)"
fi

# ---------------------------------------------------------------------
paso "4/11 Secretos y archivo .env"
if [[ -f "$ENV_FILE" ]]; then
  ok "Ya existe $ENV_FILE: se conserva (no se regeneran claves)"
else
  CLAVE_OWNER=$(openssl rand -hex 18); CLAVE_APP=$(openssl rand -hex 18); CLAVE_ANALITICA=$(openssl rand -hex 18)
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$BASE/jwt_privada.pem" 2>/dev/null
  openssl rsa -in "$BASE/jwt_privada.pem" -pubout -out "$BASE/jwt_publica.pem" 2>/dev/null
  chmod 600 "$BASE"/jwt_*.pem
  una_linea() { awk 'BEGIN{ORS="\\n"} {print}' "$1"; }
  cat > "$ENV_FILE" <<EOF
# =====================================================================
# SierraFlow · producción · generado por instalar-servidor.sh el $(date -I)
# Tras editar este archivo:  sudo bash $APP/deploy/desplegar.sh --sin-git
# =====================================================================
NODE_ENV=production
WEB_URL=https://${DOMINIO}

# --- PostgreSQL ---
DATABASE_URL_OWNER=postgres://sierraflow_owner:${CLAVE_OWNER}@127.0.0.1:5432/${BD}
DATABASE_URL=postgres://sierraflow_app:${CLAVE_APP}@127.0.0.1:5432/${BD}
DATABASE_URL_ANALITICA=postgres://sierraflow_analitica:${CLAVE_ANALITICA}@127.0.0.1:5432/${BD}

# --- Web (Next.js / Auth.js) ---
# true = modo demo (sin inicio de sesión real). Cambie a false cuando configure Google o Microsoft.
NEXT_PUBLIC_MODO_DEMO=true
AUTH_SECRET=$(openssl rand -base64 32)
AUTH_URL=https://${DOMINIO}
AUTH_TRUST_HOST=true
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
AUTH_MICROSOFT_ENTRA_ID_ID=
AUTH_MICROSOFT_ENTRA_ID_SECRET=
AUTH_MICROSOFT_ENTRA_ID_ISSUER=
API_URL_INTERNA=http://127.0.0.1:${PUERTO_API}/api
NEXT_PUBLIC_API_URL=/api
PUERTO_WEB=${PUERTO_WEB}

# --- API (NestJS) ---
API_PORT=${PUERTO_API}
JWT_EMISOR=https://${DOMINIO}
JWT_AUDIENCIA=sierraflow-api
JWT_CLAVE_PRIVADA=$(una_linea "$BASE/jwt_privada.pem")
JWT_CLAVE_PUBLICA=$(una_linea "$BASE/jwt_publica.pem")
# Solo correos de este dominio pueden entrar con Google (vacío = cualquiera)
DOMINIO_PERMITIDO=
# Reciben rol ADMIN/DIRECTOR/LIDER en su primer inicio de sesión (separados por coma)
ADMIN_EMAILS=${CORREO_ADMIN}
DEPARTAMENTO_POR_DEFECTO=TI
RUTA_ADJUNTOS=/var/sierraflow/adjuntos

# --- Analítica (Python) ---
PUERTO_ANALITICA=${PUERTO_PY}
ANALITICA_URL_INTERNA=http://127.0.0.1:${PUERTO_PY}
EOF
  ok "Generado $ENV_FILE con claves aleatorias (BD, AUTH_SECRET, JWT RS256)"
fi
chown root:"$USUARIO" "$ENV_FILE" && chmod 640 "$ENV_FILE"
ln -sfn "$ENV_FILE" "$APP/.env"
# Los puertos que realmente usa la instalación son los del .env
PUERTO_WEB=$(leer_env PUERTO_WEB); PUERTO_API=$(leer_env API_PORT); PUERTO_PY=$(leer_env PUERTO_ANALITICA)

# ---------------------------------------------------------------------
paso "5/11 PostgreSQL: rol dueño y base de datos"
clave_de() { sed -E 's#^postgres://[^:]+:([^@]+)@.*#\1#' <<< "$1"; }
CLAVE_OWNER=$(clave_de "$(leer_env DATABASE_URL_OWNER)")
CLAVE_APP=$(clave_de "$(leer_env DATABASE_URL)")
CLAVE_ANALITICA=$(clave_de "$(leer_env DATABASE_URL_ANALITICA)")
systemctl is-active --quiet postgresql || systemctl start postgresql

sudo -u postgres psql -v ON_ERROR_STOP=1 -q -v clave="$CLAVE_OWNER" <<'SQL'
SELECT 'CREATE ROLE sierraflow_owner LOGIN' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sierraflow_owner') \gexec
ALTER ROLE sierraflow_owner PASSWORD :'clave';
SQL
if [[ "$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${BD}'")" != "1" ]]; then
  sudo -u postgres psql -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE ${BD} OWNER sierraflow_owner ENCODING 'UTF8' TEMPLATE template0"
  ok "Base de datos ${BD} creada"
else
  ok "Base de datos ${BD} ya existe"
fi

como_app "DATABASE_URL_OWNER='$(leer_env DATABASE_URL_OWNER)' bash database/migrar.sh"
sudo -u postgres psql -d "$BD" -q -v ON_ERROR_STOP=1 -v clave_app="$CLAVE_APP" -v clave_analitica="$CLAVE_ANALITICA" \
  < "$APP/database/seguridad/roles_seguridad.sql"
ok "Roles sierraflow_app y sierraflow_analitica con mínimos privilegios"

# ---------------------------------------------------------------------
paso "6/11 Servicio de analítica (systemd)"
cat > /etc/systemd/system/sierraflow-analitica.service <<EOF
[Unit]
Description=SierraFlow · servicio de analítica (FastAPI)
After=network.target postgresql.service

[Service]
User=${USUARIO}
Group=${USUARIO}
WorkingDirectory=${APP}/services/analitica
ExecStart=${APP}/services/analitica/.venv/bin/gunicorn app.main:app -k uvicorn.workers.UvicornWorker -w 1 -b 127.0.0.1:${PUERTO_PY} --timeout 60 --access-logfile -
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable sierraflow-analitica >/dev/null 2>&1
ok "sierraflow-analitica.service (127.0.0.1:${PUERTO_PY})"

# ---------------------------------------------------------------------
paso "7/11 Compilación y arranque (deploy/desplegar.sh)"
bash "$APP/deploy/desplegar.sh" --sin-git

# ---------------------------------------------------------------------
paso "8/11 PM2 al iniciar el servidor"
env PATH="$PATH" pm2 startup systemd -u "$USUARIO" --hp "/home/$USUARIO" >/dev/null
como_app "pm2 save" >/dev/null
ok "pm2-${USUARIO}.service habilitado"

# ---------------------------------------------------------------------
paso "9/11 Nginx (${DOMINIO})"
SITIO="/etc/nginx/sites-available/sierraflow-${DOMINIO}"
if [[ -f "$SITIO" ]] && grep -q "managed by Certbot" "$SITIO"; then
  ok "El sitio ya existe con HTTPS (Certbot): se conserva sin cambios"
else
cat > "$SITIO" <<EOF
# SierraFlow · ${DOMINIO} · generado por instalar-servidor.sh
upstream sierraflow_web { server 127.0.0.1:${PUERTO_WEB}; keepalive 16; }
upstream sierraflow_api { server 127.0.0.1:${PUERTO_API}; keepalive 16; }
upstream sierraflow_py  { server 127.0.0.1:${PUERTO_PY}; }

server {
  listen 80;
  listen [::]:80;
  server_name ${DOMINIO};

  client_max_body_size 25m;
  add_header X-Content-Type-Options nosniff always;
  add_header X-Frame-Options DENY always;
  add_header Referrer-Policy strict-origin-when-cross-origin always;
  gzip on;
  gzip_types text/css application/javascript application/json image/svg+xml application/manifest+json;

  # Auth.js (OAuth) y entrega del token → Next.js
  location /api/auth/ {
    proxy_pass http://sierraflow_web;
    include /etc/nginx/sierraflow-proxy.conf;
  }

  # Tiempo real (SSE, Sprint 4): sin búfer
  location /api/eventos/ {
    proxy_pass http://sierraflow_api;
    include /etc/nginx/sierraflow-proxy.conf;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 1h;
  }

  # API NestJS
  location /api/ {
    proxy_pass http://sierraflow_api;
    include /etc/nginx/sierraflow-proxy.conf;
  }

  # Servicio de analítica (FastAPI)
  location /analitica/ {
    proxy_pass http://sierraflow_py/;
    include /etc/nginx/sierraflow-proxy.conf;
  }

  # Service Worker: siempre fresco
  location = /sw.js {
    proxy_pass http://sierraflow_web;
    include /etc/nginx/sierraflow-proxy.conf;
    add_header Cache-Control "no-cache, no-store, must-revalidate" always;
  }

  # Estáticos con hash: caché de un año
  location /_next/static/ {
    proxy_pass http://sierraflow_web;
    include /etc/nginx/sierraflow-proxy.conf;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
  }

  # Next.js
  location / {
    proxy_pass http://sierraflow_web;
    include /etc/nginx/sierraflow-proxy.conf;
  }
}
EOF
fi
cat > /etc/nginx/sierraflow-proxy.conf <<'EOF'
proxy_http_version 1.1;
proxy_set_header Connection        "";
proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host  $host;
EOF
ln -sfn "$SITIO" "/etc/nginx/sites-enabled/sierraflow-${DOMINIO}"
nginx -t 2>&1 | sed 's/^/  /' || error "La configuración de Nginx tiene errores (no se recargó)"
systemctl reload nginx
ok "Sitio habilitado: $SITIO"

# ---------------------------------------------------------------------
paso "10/11 HTTPS con Let's Encrypt"
IP_SERVIDOR=$(curl -fsS4 --max-time 5 https://api.ipify.org || true)
IP_DNS=$(getent ahostsv4 "$DOMINIO" | awk 'NR==1 {print $1}' || true)
if [[ -n "$IP_DNS" && "$IP_DNS" == "$IP_SERVIDOR" ]]; then
  if certbot --nginx -d "$DOMINIO" --non-interactive --agree-tos -m "$CORREO_ADMIN" --redirect --keep-until-expiring >/dev/null 2>&1; then
    ok "Certificado instalado; renovación automática con certbot.timer"
  else
    aviso "Certbot falló. Reintente:  sudo certbot --nginx -d $DOMINIO --redirect"
  fi
else
  aviso "El DNS de $DOMINIO apunta a '${IP_DNS:-nada}' y este servidor es '${IP_SERVIDOR:-desconocido}'."
  aviso "Cree el registro A en su proveedor de dominio y luego ejecute:  sudo certbot --nginx -d $DOMINIO --redirect -m $CORREO_ADMIN"
fi

# ---------------------------------------------------------------------
paso "11/11 Copias de seguridad, mantenimiento y firewall"
cat > /etc/cron.d/sierraflow <<EOF
# SierraFlow · tareas programadas
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
# Copia diaria 2:15 a. m. (BD + adjuntos + .env, 14 días)
15 2 * * * root bash ${APP}/deploy/backup.sh >> /var/log/sierraflow/backup.log 2>&1
# Limpieza de operaciones de sincronización con más de 30 días
40 3 * * * postgres psql -d ${BD} -qtAc "SELECT gestion.fn_purgar_sync_operaciones(30)" >> /var/log/sierraflow/mantenimiento.log 2>&1
EOF
ok "Copia diaria en /var/backups/sierraflow (2:15 a. m.)"

cat > /etc/logrotate.d/sierraflow <<'EOF'
/var/log/sierraflow/*.log {
  weekly
  rotate 8
  compress
  missingok
  notifempty
  copytruncate
}
EOF
ok "Rotación semanal de registros"

if ufw status | grep -q "Status: active"; then
  ufw allow 'Nginx Full' >/dev/null && ok "UFW: puertos 80/443 permitidos"
else
  aviso "UFW está inactivo. Si desea activarlo (verifique antes el puerto de SSH):"
  aviso "  sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable"
fi
ss -ltn | grep -E ":(${PUERTO_WEB}|${PUERTO_API}|${PUERTO_PY}|5432)\b" | grep -vq '127.0.0.1\|\[::1\]' \
  && aviso "Algún puerto interno escucha en todas las interfaces; revise con: ss -ltnp" || ok "Puertos internos solo en 127.0.0.1"

# ---------------------------------------------------------------------
echo
echo -e "${C_VERDE}════════════════════════════════════════════════════════════════${C_FIN}"
echo -e "${C_VERDE} SierraFlow instalado → https://${DOMINIO}${C_FIN}"
echo -e "${C_VERDE}════════════════════════════════════════════════════════════════${C_FIN}"
cat <<EOF
  Configuración:   $ENV_FILE   (modo demo activo hasta configurar OAuth)
  Actualizar:      sudo bash $APP/deploy/desplegar.sh
  Procesos Node:   sudo -u $USUARIO pm2 status   ·   sudo -u $USUARIO pm2 logs
  Analítica:       journalctl -u sierraflow-analitica -f
  Copias:          /var/backups/sierraflow

  Siguiente paso: configurar el inicio de sesión con Google/Microsoft
  (docs/Despliegue_VPS.md, paso 6).
EOF
