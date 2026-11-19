# Instalación de SierraFlow en el VPS Ubuntu (sierrainnova.tech)

Esta guía instala la aplicación completa en el servidor con **un solo script**. Todo lo que se ejecuta
está en la carpeta `deploy/` del repositorio, así que puedes revisarlo antes.

| Componente | Dónde queda | Puerto interno |
|---|---|---|
| Web (Next.js) | PM2 · `sierraflow-web` | 127.0.0.1:3010 |
| API (NestJS) | PM2 · `sierraflow-api` | 127.0.0.1:4010 |
| Analítica (FastAPI) | systemd · `sierraflow-analitica` | 127.0.0.1:8010 |
| Base de datos | PostgreSQL existente · base `sierraflow` | 127.0.0.1:5432 |
| Publicación | Nginx + Let's Encrypt | 80 / 443 |
| Configuración y secretos | `/opt/sierraflow/.env` (fuera del repositorio) | — |
| Código | `/opt/sierraflow/app` | — |
| Adjuntos | `/var/sierraflow/adjuntos` | — |
| Copias de seguridad | `/var/backups/sierraflow` (diarias, 14 días) | — |

> **Dominio:** la app se publica en **`proyectos.sierrainnova.tech`** para no tocar el sitio que ya existe
> en `sierrainnova.tech`. Los puertos 3010/4010/8010 se eligieron para no chocar con otras apps del
> servidor (por ejemplo, algo que ya use el 3000).

---

## Paso 0 · Requisitos del servidor

- Ubuntu 22.04 o 24.04 con acceso `sudo`
- Node.js **20.12 o superior** (recomendado 22 LTS) · PostgreSQL **13 o superior** · Python 3.10+
- 2 GB de RAM o más (si tiene menos, el instalador crea 2 GB de swap para compilar)

Compruébalo conectado por SSH:

```bash
node -v && psql --version && python3 --version && free -h
```

Si Node es menor a 20.12, actualízalo (verifica antes que no rompas otras apps del servidor):

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
```

## Paso 1 · Subir la versión actual a GitHub (desde tu PC)

El servidor descarga el código de GitHub. Incluye el archivo `pnpm-lock.yaml` que se generó al hacer
`pnpm install`: garantiza que el servidor instale exactamente las mismas versiones que tu PC.

```powershell
cd D:\DeveloperAPPS\Apps_GestionProyectos
git add .
git commit -m "Sprint 3 + scripts de despliegue"
git push
```

## Paso 2 · Crear el subdominio en el DNS

En el panel donde administras `sierrainnova.tech` (registrador, Cloudflare, cPanel…) crea:

| Tipo | Nombre | Valor | TTL |
|---|---|---|---|
| A | `proyectos` | IP pública del VPS | 300 (o automático) |

La IP del VPS la ves con `curl -4 ifconfig.me` en el servidor. Si usas **Cloudflare**, deja la nube en
**gris (solo DNS)** mientras se emite el certificado; luego puedes activarla en modo SSL "Full (strict)".

Comprueba desde tu PC (puede tardar unos minutos en propagarse):

```powershell
nslookup proyectos.sierrainnova.tech
```

## Paso 3 · Descargar el código en el servidor

Conéctate por SSH y clona el repositorio en `/opt/sierraflow/app`.

**Si el repositorio es privado** (recomendado), crea un token de solo lectura en GitHub:
*Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token*,
con acceso solo a `Apps_GestionProyectos` y permiso **Contents: Read-only**.

```bash
sudo mkdir -p /opt/sierraflow
sudo git clone https://<TOKEN>@github.com/WILSP1971/Apps_GestionProyectos.git /opt/sierraflow/app
```

**Si el repositorio es público:**

```bash
sudo mkdir -p /opt/sierraflow
sudo git clone https://github.com/WILSP1971/Apps_GestionProyectos.git /opt/sierraflow/app
```

**Si tu servidor organiza las apps en la carpeta de un usuario** (por ejemplo `/home/swarm/proyectos`),
clona ahí, sin `sudo`, con ese usuario:

```bash
cd ~/proyectos
git clone https://github.com/WILSP1971/Apps_GestionProyectos.git
```

El instalador detecta solo la carpeta y su dueño (`swarm`) y ejecuta la app con ese usuario.
La configuración y las claves quedan igual fuera del repositorio, en `/opt/sierraflow/.env`.

## Paso 4 · Ejecutar el instalador

```bash
sudo bash /opt/sierraflow/app/deploy/instalar-servidor.sh
# o, si clonaste en tu carpeta de proyectos:
sudo bash ~/proyectos/Apps_GestionProyectos/deploy/instalar-servidor.sh
```

Para usar otro subdominio o correo:
`sudo DOMINIO=app.sierrainnova.tech CORREO_ADMIN=tu@correo.com bash /opt/sierraflow/app/deploy/instalar-servidor.sh`

Tarda entre 5 y 15 minutos (la compilación de Next.js es lo más lento). Recorre 11 pasos:

1. Paquetes: nginx, certbot, python3-venv, git, ufw
2. Node, pnpm y PM2
3. Usuario de sistema `sierraflow`, carpetas y swap si hace falta
4. **Genera `/opt/sierraflow/.env`** con claves aleatorias (BD, `AUTH_SECRET`, par RS256 de los JWT)
5. PostgreSQL: rol `sierraflow_owner`, base `sierraflow`, migraciones y roles de la aplicación
6. Servicio `sierraflow-analitica` en systemd
7. Compila y arranca todo (`deploy/desplegar.sh`)
8. PM2 arranca solo al reiniciar el servidor
9. Sitio de Nginx para el subdominio (no modifica otros sitios)
10. Certificado HTTPS de Let's Encrypt (si el DNS ya apunta al servidor)
11. Copias de seguridad diarias, limpieza programada, rotación de registros y firewall

Al final verás: **`SierraFlow instalado → https://proyectos.sierrainnova.tech`**.

> Si el paso 10 avisa que el DNS aún no apunta al servidor, espera la propagación y ejecuta:
> `sudo certbot --nginx -d proyectos.sierrainnova.tech --redirect -m admin@sierrainnova.tech`

El instalador se puede volver a ejecutar sin riesgo: conserva el `.env`, la base de datos y el HTTPS.

## Paso 5 · Comprobar

Abre **https://proyectos.sierrainnova.tech**. La primera instalación queda en **modo demo** (sin inicio
de sesión real) para que verifiques que todo responde. En el servidor:

```bash
sudo -u sierraflow pm2 status                       # sierraflow-web y sierraflow-api en "online"
systemctl status sierraflow-analitica --no-pager     # active (running)
curl -s https://proyectos.sierrainnova.tech/api/salud   # {"estado":"ok","baseDatos":"ok",...}
```

## Paso 6 · Activar el inicio de sesión real (OAuth 2.0)

### Con Google (cuentas de Google Workspace o Gmail)

1. Entra a <https://console.cloud.google.com> → crea o elige un proyecto.
2. *APIs y servicios → Pantalla de consentimiento de OAuth*: tipo **Interno** (si tienes Workspace) o
   **Externo**; nombre "SierraFlow"; dominio autorizado `sierrainnova.tech`.
3. *Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web*:
   - Orígenes autorizados de JavaScript: `https://proyectos.sierrainnova.tech`
   - URI de redirección autorizados: `https://proyectos.sierrainnova.tech/api/auth/callback/google`
4. Copia el **ID de cliente** y el **secreto**.

### Con Microsoft (Entra ID / Office 365), opcional

1. <https://entra.microsoft.com> → *Registros de aplicaciones → Nuevo registro*.
2. URI de redirección (Web): `https://proyectos.sierrainnova.tech/api/auth/callback/microsoft-entra-id`
3. Copia el *Id. de aplicación (cliente)* y el *Id. de directorio (inquilino)*; en *Certificados y
   secretos* crea un secreto de cliente.

### Configurar el servidor

```bash
sudo nano /opt/sierraflow/.env
```

```dotenv
NEXT_PUBLIC_MODO_DEMO=false
AUTH_GOOGLE_ID=xxxxxxxx.apps.googleusercontent.com
AUTH_GOOGLE_SECRET=GOCSPX-xxxxxxxx
# Solo permite correos de la empresa (opcional)
DOMINIO_PERMITIDO=sierrainnova.tech
# Quiénes serán administradores al entrar por primera vez
ADMIN_EMAILS=tu.correo@sierrainnova.tech

# Microsoft (opcional)
AUTH_MICROSOFT_ENTRA_ID_ID=
AUTH_MICROSOFT_ENTRA_ID_SECRET=
AUTH_MICROSOFT_ENTRA_ID_ISSUER=https://login.microsoftonline.com/<ID_INQUILINO>/v2.0
```

Aplica los cambios (recompila, porque `NEXT_PUBLIC_MODO_DEMO` se fija al compilar):

```bash
sudo bash /opt/sierraflow/app/deploy/desplegar.sh --sin-git
```

Entra con tu correo: el primer acceso crea tu usuario y, si está en `ADMIN_EMAILS`, te da rol de
administrador, director y líder. Los demás usuarios entran como **Solicitante**; para cambiar roles por
ahora se usa SQL (la pantalla de administración de usuarios llega en un sprint posterior):

```bash
sudo -u postgres psql -d sierraflow -c "
INSERT INTO gestion.usuario_roles(usuario_id, rol_id)
SELECT u.id, r.id FROM gestion.usuarios u, gestion.roles r
 WHERE u.email = 'persona@sierrainnova.tech' AND r.codigo = 'LIDER'
ON CONFLICT DO NOTHING;"
```

## Paso 6b · Notificaciones por correo y push (Sprint 4)

**Push (navegador y celular):** no requiere configuración. Al desplegar, `desplegar.sh` genera las
claves VAPID en el `.env`. Cada usuario las activa en **Configuración → Activar en este equipo**.

**Correo:** requiere una cuenta SMTP. Con Gmail:

1. En la cuenta de Google que enviará los correos activa la **verificación en dos pasos**.
2. Entra a <https://myaccount.google.com/apppasswords>, crea una contraseña de aplicación llamada
   "SierraFlow" y copia los 16 caracteres.
3. Edita el `.env` (por ejemplo con el método de `scp` descrito abajo) y completa:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PUERTO=587
SMTP_USUARIO=notificaciones.sierrainnova@gmail.com
SMTP_CLAVE=abcdefghijklmnop
SMTP_REMITENTE="SierraFlow" <notificaciones.sierrainnova@gmail.com>
```

Con el correo de tu hosting o Microsoft 365 usa su servidor SMTP (por ejemplo `smtp.office365.com`,
puerto 587). Aplica con `sudo bash ~/proyectos/Apps_GestionProyectos/deploy/desplegar.sh --sin-git` y
prueba desde **Configuración → Enviar prueba**.

### Editar el `.env` desde tu PC

```powershell
scp swarm@sierrainnova.tech:/opt/sierraflow/.env D:\DeveloperAPPS\sierraflow.env      # descargar
# … editar con VS Code …
scp D:\DeveloperAPPS\sierraflow.env swarm@sierrainnova.tech:~/sierraflow.env          # subir
```

```bash
sudo install -o root -g swarm -m 640 ~/sierraflow.env /opt/sierraflow/.env
sudo sed -i 's/\r$//' /opt/sierraflow/.env && rm ~/sierraflow.env
sudo bash ~/proyectos/Apps_GestionProyectos/deploy/desplegar.sh --sin-git
```

## Paso 7 · Publicar actualizaciones

En tu PC: `git push`. En el servidor:

```bash
sudo bash /opt/sierraflow/app/deploy/desplegar.sh
```

Descarga lo último, instala dependencias, aplica migraciones nuevas, recompila, reinicia sin cortar el
servicio (`pm2 reload`) y verifica que todo responda.

---

## Operación diaria

| Tarea | Comando |
|---|---|
| Estado de procesos | `sudo -u sierraflow pm2 status` |
| Registros web / API | `sudo -u sierraflow pm2 logs sierraflow-web` · `... pm2 logs sierraflow-api` |
| Registros analítica | `journalctl -u sierraflow-analitica -f` |
| Registros Nginx | `sudo tail -f /var/log/nginx/error.log` |
| Reiniciar todo | `sudo -u sierraflow pm2 restart all && sudo systemctl restart sierraflow-analitica` |
| Copia manual | `sudo bash /opt/sierraflow/app/deploy/backup.sh` |
| Restaurar la BD | `sudo -u postgres pg_restore -d sierraflow --clean --if-exists /var/backups/sierraflow/bd_AAAAMMDD_HHMM.dump` |
| Renovación HTTPS | automática (`systemctl list-timers \| grep certbot`); prueba: `sudo certbot renew --dry-run` |
| Volver a una versión | `cd /opt/sierraflow/app && sudo -u sierraflow git checkout <commit>` y `sudo bash deploy/desplegar.sh --sin-git` |

Copia periódicamente `/var/backups/sierraflow` **fuera del VPS** (otro servidor, S3, Google Drive con
`rclone`). Ahí también queda una copia del `.env`: protégela, contiene las claves.

## Problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| `git clone` pide usuario y clave | Repositorio privado | Usa el token del paso 3 |
| La compilación se detiene con "JavaScript heap out of memory" | Poca RAM | Verifica el swap: `swapon --show`; vuelve a ejecutar `desplegar.sh --sin-git` |
| `502 Bad Gateway` | Un proceso no arrancó | `sudo -u sierraflow pm2 logs --lines 50` |
| Certbot: "DNS problem" | El subdominio aún no apunta al VPS | Revisa el registro A y espera la propagación |
| Al iniciar sesión: "redirect_uri_mismatch" | URI de Google mal escrita | Debe ser exactamente `https://proyectos.sierrainnova.tech/api/auth/callback/google` |
| Al iniciar sesión: "Dominio de correo no autorizado" | `DOMINIO_PERMITIDO` | Deja vacío o pon el dominio correcto en el `.env` |
| Puerto ocupado (3010/4010/8010) | Otra app del servidor | Cambia `PUERTO_WEB`, `API_PORT`, `PUERTO_ANALITICA` y `API_URL_INTERNA` en el `.env`, borra `/etc/nginx/sites-available/sierraflow-*` y vuelve a ejecutar el instalador |

## Seguridad aplicada

- PostgreSQL, la API, la web y la analítica solo escuchan en `127.0.0.1`; solo Nginx está expuesto.
- La aplicación usa el rol `sierraflow_app` sin permisos de DDL; la auditoría no se puede borrar.
- `/opt/sierraflow/.env` es `640 root:sierraflow`; las claves se generan aleatoriamente en el servidor.
- HTTPS obligatorio con redirección; cabeceras `X-Frame-Options`, `nosniff` y `Referrer-Policy`.
- Los procesos corren con el usuario sin privilegios `sierraflow`.

## ¿Publicar en el dominio raíz `sierrainnova.tech`?

Es posible (`sudo DOMINIO=sierrainnova.tech bash .../instalar-servidor.sh`), pero **reemplazaría el sitio
que hoy responde en ese dominio** si su configuración de Nginx usa el mismo `server_name`. Antes revisa
con `grep -R "server_name" /etc/nginx/sites-enabled/` y desactiva el sitio anterior si así lo decides.
