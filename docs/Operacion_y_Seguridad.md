# SierraFlow · Operación y seguridad (Sprint 8)

Comandos para el VPS. `APP` es la carpeta del repositorio (por ejemplo `~/proyectos/Apps_GestionProyectos`).

## Rutina

| Qué | Comando | Cuándo |
|---|---|---|
| Desplegar | `sudo bash deploy/desplegar.sh` | Cada versión. Al final corre la prueba de humo. |
| Prueba de humo | `bash deploy/prueba-humo.sh` | Tras cualquier cambio en el servidor. |
| Tiempos de respuesta | `bash deploy/medir-rendimiento.sh` | Si los usuarios reportan lentitud. |
| Salud de la base | `sudo -u postgres psql -d sierraflow -f database/diagnostico/salud_bd.sql` | Mensual. |
| Endurecimiento | `sudo bash deploy/endurecer.sh` | Una vez (y tras reinstalar Nginx). |

## Copias de seguridad

- **Diarias** 2:15 a. m.: base de datos, adjuntos y `.env` en `/var/backups/sierraflow` (14 días).
- **Simulacro semanal** (domingo 4:30 a. m.): `deploy/verificar-copia.sh` restaura la última copia en una
  base temporal y compara registros. Resultado en `/var/log/sierraflow/verificacion-copias.log`.
- **Restaurar:** `sudo bash deploy/restaurar.sh` → elige la copia, guarda antes el estado actual, detiene
  la app, restaura, aplica migraciones y reinicia.
- **Fuera del servidor:** copie periódicamente `/var/backups/sierraflow` a otro lugar (otro servidor,
  almacenamiento en la nube). Una copia en el mismo disco no protege si se pierde el VPS.

## Volver a la versión anterior de la web

Cada despliegue publica la web en `.releases/web/<fecha>-<commit>` (se guardan las 3 últimas):
```bash
ls $APP/.releases/web
ln -sfn $APP/.releases/web/<versión-anterior> $APP/.releases/web/actual && sudo -u <usuario> pm2 reload sierraflow-web
```

## Controles de seguridad

| Área | Control |
|---|---|
| Identidad | OAuth 2.0 / OpenID Connect (Google, Microsoft). SierraFlow no guarda contraseñas. |
| Sesión | JWT RS256 de 15 min + refresh rotativo con detección de reutilización. Cierre de sesión revoca el refresh y borra los datos locales. |
| Autorización | Guardas por rol en cada endpoint (`JwtGuard` + `RolesGuard`); el ingeniero solo ve el avance y las tareas de las solicitudes de su equipo y solo edita las suyas. Se puede limitar el acceso a correos registrados (`SOLO_USUARIOS_REGISTRADOS=true`). |
| Abuso | Límite por IP en Nginx (50 r/s, ráfaga 200) y en la API (1200/min general, 30/min en `/api/auth`). Respuesta 429 con `Retry-After`. |
| Transporte | HTTPS (Let's Encrypt) con HSTS; http redirige a https. |
| Cabeceras | `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, COOP; Helmet en la API; versión de Nginx oculta. |
| Caché | Respuestas de la API con `Cache-Control: no-store`. |
| Registros | Nginx registra las URL **sin** parámetros (el token del canal en tiempo real no queda en disco). |
| Datos | SQL siempre parametrizado; borrado lógico; auditoría de cambios (2 años); concurrencia optimista por versión. |
| Secretos | `.env` fuera del repositorio (`/opt/sierraflow/.env`, permisos 640); `*.env` ignorado por git. La API no arranca si faltan secretos indispensables. |
| Servidor | Actualizaciones de seguridad automáticas, fail2ban para SSH, firewall ufw (80/443/SSH). |
| Retención | Sincronización 30 días, notificaciones leídas 180 días, sesiones vencidas 30 días, auditoría 730 días. |

## Revisiones periódicas sugeridas

- Mensual: `pnpm audit --prod` en el servidor (dependencias con vulnerabilidades conocidas).
- Trimestral: revisar usuarios activos y roles en *Usuarios y equipos*; desactivar a quien ya no esté.
- Semestral: rotar las claves JWT (cerrará todas las sesiones) y la contraseña de la base de datos.
