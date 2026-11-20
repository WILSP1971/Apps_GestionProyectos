# SierraFlow · Gestión y Dirección de Proyectos

Plataforma web para crear, gestionar, asignar, evaluar y dar seguimiento a **solicitudes de requerimiento**.
Arquitectura **modular + Clean Architecture + DDD + Offline-First**.

| Carpeta | Qué contiene | Tecnología |
|---|---|---|
| `apps/web` | Interfaz web / PWA (datos locales en IndexedDB) | Next.js 15 · React 19 · Tailwind 4 · Auth.js · Dexie |
| `apps/api` | API de dominio (solicitudes, identidad OAuth 2.0) | NestJS 11 · Fastify · PostgreSQL (`pg`) · jose |
| `services/analitica` | KPIs, calificación, alertas de SLA | Python 3.12 · FastAPI · asyncpg · APScheduler |
| `packages/contratos` | Máquina de estados y esquemas Zod compartidos | TypeScript · Zod |
| `database` | Migraciones SQL, semillas, datos demo, roles | PostgreSQL 16+ |
| `docs` | Guía completa de diseño e implementación | Markdown |

> Guía completa: [`docs/Guia_SierraFlow_Gestion_Proyectos.md`](docs/Guia_SierraFlow_Gestion_Proyectos.md)

---

## 1. Requisitos

- Node.js 22 LTS o superior y **pnpm 9** (`npm i -g pnpm` o `corepack enable`)
- PostgreSQL 16+ (con `psql` en el PATH)
- Python 3.12+

## 2. Ver el diseño en 2 minutos (modo demo, sin base de datos)

```bash
pnpm install
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env
pnpm dev:web
```

Abre <http://localhost:3000>. Con `NEXT_PUBLIC_MODO_DEMO=true` la web funciona sola: crea datos de ejemplo en el
navegador (IndexedDB) y permite cambiar de rol con el selector **“Ver como”** (Solicitante, Ingeniero, Líder, Director).
Puedes crear solicitudes, enviarlas, aprobarlas/rechazarlas, comentar y marcar criterios, incluso **sin conexión**
(desconecta la red en DevTools y verás los cambios pendientes de sincronizar).

## 3. Base de datos

```bash
# como superusuario postgres
psql -U postgres -c "CREATE ROLE sierraflow_owner LOGIN PASSWORD 'clave_owner';"
psql -U postgres -c "CREATE DATABASE sierraflow OWNER sierraflow_owner ENCODING 'UTF8' TEMPLATE template0;"

# migraciones + catálogos (Linux/macOS/Git Bash)
DATABASE_URL_OWNER=postgres://sierraflow_owner:clave_owner@127.0.0.1:5432/sierraflow ./database/migrar.sh
# Windows PowerShell
$env:DATABASE_URL_OWNER="postgres://sierraflow_owner:clave_owner@127.0.0.1:5432/sierraflow"; .\database\migrar.ps1

# roles de la aplicación (como postgres)
psql -U postgres -d sierraflow -v clave_app='clave_app' -v clave_analitica='clave_analitica' -f database/seguridad/roles_seguridad.sql

# opcional: datos de demostración
psql "postgres://sierraflow_owner:clave_owner@127.0.0.1:5432/sierraflow" -f database/demo/datos_demo.sql
```

Esquema `gestion`: 31 tablas, triggers de historial de estados, avance ponderado, auditoría, outbox de eventos,
validación de transiciones y vistas de lectura (`v_tablero_solicitudes`, `v_carga_ingenieros`, …).

## 4. API (NestJS)

1. Genera las claves RS256 de los tokens:
   ```bash
   openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out jwt_privada.pem
   openssl rsa -in jwt_privada.pem -pubout -out jwt_publica.pem
   # pásalas a una línea para el .env:
   node -e "console.log(require('fs').readFileSync('jwt_privada.pem','utf8').replace(/\n/g,'\\\\n'))"
   ```
2. Completa en `.env`: `DATABASE_URL`, `JWT_CLAVE_PRIVADA`, `JWT_CLAVE_PUBLICA` y las credenciales OAuth.
3. `pnpm dev:api` → <http://127.0.0.1:4000/api/salud>

Endpoints iniciales:

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/intercambio` | id_token OIDC → access/refresh tokens propios |
| POST | `/api/auth/refrescar` | Rotación de refresh token (detecta reutilización) |
| GET | `/api/auth/yo` | Perfil y roles del usuario |
| POST | `/api/solicitudes` | Crear (y opcionalmente enviar) una solicitud |
| GET | `/api/solicitudes` | Tablero con filtros (`estado`, `texto`, `mias`) |
| GET | `/api/solicitudes/similares?texto=` | Detección de duplicados (pg_trgm) |
| GET | `/api/solicitudes/:id` | Detalle con criterios, historial y comentarios |
| PATCH | `/api/solicitudes/:id/estado` | Transición de estado con concurrencia optimista |
| PATCH | `/api/solicitudes/:id/criterios/:criterioId` | Marcar / desmarcar un criterio de aceptación |
| POST | `/api/solicitudes/:id/comentarios` | Comentar en el hilo de la solicitud |
| POST | `/api/sync/push` | Aplica en orden la bandeja de salida del dispositivo (idempotente) |
| GET | `/api/sync/pull` | Cambios posteriores a los cursores `solicitudes`, `comentarios`, `notificaciones` |
| GET | `/api/eventos/stream?token=` | Tiempo real (SSE): `notificacion`, `cambios`, `latido` |
| GET | `/api/notificaciones` | Últimas notificaciones del usuario |
| PATCH | `/api/notificaciones/:id/leida` · POST `/api/notificaciones/leer-todas` | Marcar como leídas |
| GET / PUT | `/api/notificaciones/preferencias` | Canales (correo, push) por tipo de aviso |
| POST / DELETE | `/api/notificaciones/push/suscripciones` | Suscribir / quitar este navegador a Web Push |
| POST | `/api/notificaciones/prueba` | Envía una notificación de prueba por todos los canales |

## 5. Inicio de sesión real (OAuth 2.0 / OIDC)

1. Crea un cliente OAuth en Google Cloud y/o Microsoft Entra ID.
2. URI de redirección: `http://localhost:3000/api/auth/callback/google` (y `/microsoft-entra-id`);
   en producción `https://proyectos.sierrainnova.tech/api/auth/callback/...`.
3. En `.env`: `NEXT_PUBLIC_MODO_DEMO=false`, `AUTH_SECRET` (`npx auth secret`), `AUTH_GOOGLE_ID/SECRET`, `ADMIN_EMAILS=tu@correo`.

## 6. Servicio de analítica (Python)

```bash
cd services/analitica
python -m venv .venv
.venv\Scripts\activate            # Windows  (Linux: source .venv/bin/activate)
pip install -r requirements.txt
pytest -q
uvicorn app.main:app --reload --port 8000     # http://127.0.0.1:8000/docs
```

## 7. Probar el funcionamiento sin conexión (Sprint 3)

El Service Worker solo se activa en una compilación de producción:

```bash
pnpm --filter @sierraflow/contratos build
pnpm --filter @sierraflow/web preview      # compila y abre http://localhost:3000
```

1. Inicia sesión y navega por Dashboard y Mis solicitudes (o espera ~3 s: se precargan solas).
2. En Chrome DevTools → **Network** marca **Offline** (o desconecta el Wi-Fi).
3. Crea una solicitud, cambia estados y comenta: el indicador muestra **“Sin conexión · N pendientes”**.
4. Recarga la página: la app sigue abriendo desde la caché, con los datos de IndexedDB.
5. Vuelve a **Online**: el indicador pasa a **“Sincronizado”** y los cambios aparecen en PostgreSQL.

Cómo funciona:

| Pieza | Archivo | Qué hace |
|---|---|---|
| Bandeja de salida | `apps/web/src/lib/offline/db.ts` | Cada cambio local se guarda en IndexedDB con un `idOperacion` único |
| Motor | `apps/web/src/lib/offline/sync/motor-sync.ts` | push en orden + pull por cursores; reintentos con espera exponencial; una sola pestaña sincroniza (Web Locks) |
| Plan de resultados | `apps/web/src/lib/offline/sync/plan.ts` | Decide qué hacer con cada respuesta (ok, conflicto, rechazada, error) — lógica pura con pruebas |
| Sincronización (API) | `apps/api/src/modulos/sincronizacion/` | Reutiliza los casos de uso de dominio; idempotencia en `sync_operaciones`; versiones encadenadas |
| Service Worker | `apps/web/src/app/sw.ts` | Precarga JS/CSS, páginas con red primero, plantilla de detalle y página `/offline` |

Conflictos: si otra persona cambió la solicitud mientras estabas sin conexión, prevalece el servidor
y el detalle de la solicitud muestra el cambio que no se aplicó, con **Reintentar** o **Descartar**.

### Asignación, Kanban y usuarios (Sprint 5)

| Pantalla | Ruta | Quién |
|---|---|---|
| Asignación de grupo / ingenieros | `/gestion/asignacion` | LIDER, DIRECTOR |
| Kanban por departamentos | `/gestion/kanban` | LIDER, DIRECTOR, ADMIN |
| Usuarios y equipos | `/administracion/usuarios` | ADMIN |

Endpoints nuevos: `GET /api/asignacion/ingenieros`, `GET /api/asignacion/grupos`,
`GET /api/asignacion/solicitudes/:id/equipo`, `PUT /api/asignacion/solicitudes/:id`,
`GET /api/admin/catalogos`, `GET /api/admin/usuarios`, `PATCH /api/admin/usuarios/:id`.

Para sumar ingenieros o programadores, un ADMIN usa **Agregar usuario** en *Usuarios y equipos* (correo, nombre, roles,
grupos, tecnologías). Quedan *Pendientes* hasta que entran con “Continuar con Google” usando ese correo; en ese momento
se vinculan a su cuenta. Con `SOLO_USUARIOS_REGISTRADOS=true` en el `.env` solo pueden entrar los correos agregados así.
También se puede editar a quien ya entró: para que aparezca en la asignación necesita el rol **INGENIERO**, sus grupos,
tecnologías y capacidad semanal en *Usuarios y equipos*. La recomendación ordena por tecnologías
coincidentes, pertenencia al grupo elegido y carga (`apps/web/src/modulos/asignacion/dominio/recomendacion.ts`).
Al confirmar sobre una solicitud **Aprobada**, pasa a **Asignada** y los nuevos integrantes reciben aviso.

### Evaluación y reportes (Sprint 6)

| Pantalla | Ruta | Quién |
|---|---|---|
| Seguimiento y evaluación | `/gestion/evaluacion` | LIDER, DIRECTOR |
| Avance, tareas y calificación | `/gestion/evaluacion/:id` | LIDER, DIRECTOR · el ingeniero del equipo ve el avance y actualiza sus tareas |
| Reportes e indicadores | `/reportes` | LIDER, DIRECTOR |

- **Tareas por frente:** el líder crea tareas (frente = grupo de trabajo, responsable, peso 1–10, horas, entrega).
  El avance general es el promedio ponderado por peso (trigger `fn_recalcular_avance`). Una tarea al 100 % queda
  *Completada* (migración 010). El primer avance de una solicitud *Asignada* la pasa sola a *En desarrollo*.
- **Calificación:** criterios 1–5 con los pesos de `criterios_calificacion` → nota 0–10 y letra (A+ … D),
  calculadas con `packages/contratos/src/calificacion.ts` (mismas reglas que `services/analitica`).
  Calificación individual opcional por ingeniero. El equipo recibe la nota; el solicitante solo el avance.
- **Reportes:** el navegador consulta el servicio Python en `/analitica/kpis/*` (resumen, departamentos, sla,
  tendencia, tiempos, carga-ingenieros, calificaciones). Cada bloque se descarga en CSV (Excel en español).

Endpoints nuevos: `GET /api/evaluacion/solicitudes`, `GET /api/evaluacion/solicitudes/:id`,
`POST /api/evaluacion/solicitudes/:id/evaluaciones`, `POST /api/evaluacion/solicitudes/:id/tareas`,
`PATCH /api/evaluacion/tareas/:id`, `DELETE /api/evaluacion/tareas/:id?version=N`,
`GET /analitica/kpis/tendencia|tiempos|calificaciones`.

**Despliegue sin cortes (desde este sprint):** `desplegar.sh` compila y luego publica la web en
`.releases/web/<fecha>-<commit>`; PM2 ejecuta el enlace `.releases/web/actual`. Mientras compila, o si la
compilación falla, sigue atendiendo la versión anterior completa. Para volver a la anterior:
`ln -sfn .releases/web/<versión> .releases/web/actual && pm2 reload sierraflow-web`.

### PM Suite (Sprint 7)

| Pantalla | Ruta | Quién |
|---|---|---|
| Portafolio de proyectos | `/proyectos` | DIRECTOR crea y edita · LIDER consulta |
| Proyecto | `/proyectos/:id` | Resumen y finanzas, Cronograma (Gantt), Riesgos, Deuda técnica, Solicitudes |

- **Proyecto** = agrupa solicitudes. Su avance es el promedio del avance de sus solicitudes.
- **Salud del cronograma:** compara el avance con el % del plazo transcurrido (índice ≈ avance ÷ tiempo):
  ≥ 0,9 en tiempo, 0,7–0,9 en riesgo, < 0,7 o plazo vencido = atrasado.
- **Finanzas:** costo de trabajo = horas reales de las tareas × tarifa por hora; costo total = trabajo + otros gastos;
  proyección = horas estimadas × tarifa + otros; ROI = (beneficio esperado − costo) ÷ costo.
  Reglas en `packages/contratos/src/pm.ts` (con pruebas).
- **Gantt:** una fila por solicitud (inicio de desarrollo → cierre o fecha deseada) y sus tareas (inicio → entrega).
  Las tareas ahora tienen fecha de **inicio** (en *Evaluación → Nueva tarea*).
- **Riesgos:** matriz 5×5 probabilidad × impacto (bajo 1–4, medio 5–9, alto 10–14, crítico 15–25) con plan de mitigación.
- **Deuda técnica:** registro en story points, por proyecto o solicitud, con fecha de resolución.

Endpoints: `GET/POST /api/proyectos`, `GET /api/proyectos/catalogos`, `GET/PATCH/DELETE /api/proyectos/:id`,
`PUT /api/proyectos/:id/solicitudes`, `POST /api/proyectos/:id/riesgos`, `PATCH|DELETE /api/proyectos/riesgos/:id`,
`POST /api/proyectos/:id/deuda`, `PATCH|DELETE /api/proyectos/deuda/:id`.

### Endurecimiento y operación (Sprint 8)

Detalle completo en [`docs/Operacion_y_Seguridad.md`](docs/Operacion_y_Seguridad.md).

| Script | Para qué |
|---|---|
| `sudo bash deploy/endurecer.sh` | **Una vez**: HSTS, versión de Nginx oculta, límite por IP, registros sin tokens, permisos del `.env`, actualizaciones automáticas, fail2ban, verificación semanal de copias y purgas |
| `bash deploy/prueba-humo.sh` | Revisa la URL pública: estilos, Service Worker, API + BD, analítica, 401 sin sesión, cabeceras, certificado. `desplegar.sh` la corre al final |
| `sudo bash deploy/verificar-copia.sh` | Simulacro: restaura la última copia en una base temporal y compara registros |
| `sudo bash deploy/restaurar.sh` | Restauración guiada (respalda antes el estado actual) |
| `bash deploy/medir-rendimiento.sh` | p50/p95 de login, estilos, API y analítica |
| `database/diagnostico/salud_bd.sql` | Tamaños, índices sin uso, lecturas completas, outbox pendiente, consultas lentas |

La API ahora: limita peticiones por IP (`LIMITE_PETICIONES_MIN`, `LIMITE_AUTH_MIN`), responde `Cache-Control: no-store`,
confía solo en el proxy local para la IP del cliente y no arranca en producción si faltan secretos indispensables.
Guion manual de pruebas sin conexión: [`docs/pruebas/E2E_sin_conexion.md`](docs/pruebas/E2E_sin_conexion.md).

### Reglas proyecto ↔ solicitud y menú por rol

1. **Los requerimientos funcionales van en un proyecto:** una solicitud de tipo *Funcional* no pasa a *Asignada*
   sin proyecto, y no se puede quitar del proyecto mientras está en ejecución. Mejoras, incidentes, cambios y
   tareas técnicas pueden trabajarse sueltas (`TIPOS_REQUIEREN_PROYECTO` en `packages/contratos/src/solicitudes.ts`).
2. **Crear solicitudes desde el proyecto:** *Proyecto → Solicitudes → Nueva solicitud en este proyecto*
   (abre el asistente con `?proyecto=`). Solo líderes, directores y administradores.
3. **Tareas propias del proyecto:** actividades sin solicitud (gestión, capacitación, despliegue) en
   *Proyecto → Tareas y cronograma*. Suman al avance, horas, costo y Gantt (migración 014).

| Perfil | Menú |
|---|---|
| Solicitante | Dashboard · Nueva solicitud · Mis solicitudes |
| Ingeniero | Dashboard · Mis solicitudes y proyectos · Registrar avances · Reportes (su desempeño) |
| Líder, Director, Administrador | Dashboard · Proyectos · Solicitudes (nueva, mías, bandeja) · Gestión (asignación, Kanban, evaluación) · Reportes · Cuenta |

Con varios roles manda el de mayor alcance. Endpoints nuevos: `GET /api/evaluacion/mis-tareas`,
`POST /api/evaluacion/proyectos/:id/tareas`, `GET /api/proyectos/mios`, `GET /analitica/kpis/mi-desempeno`.

## 8. Pruebas

```bash
pnpm test                      # dominio (API) + contratos
cd services/analitica && pytest -q
```

## 9. Estado del proyecto (plan por sprints)

- [x] **Sprint 0** – Monorepo, modelo de datos, migraciones, semillas, roles de BD
- [x] **Sprint 1** – Identidad OAuth 2.0 (API) + login web + layout y tema
- [x] **Sprint 2** – Solicitudes: asistente de 4 pasos, Mis solicitudes, detalle con línea de vida, comentarios
- [x] **Sprint 3** – Motor de sincronización offline (push/pull) + Service Worker (Serwist)
- [x] **Sprint 4** – Notificaciones en tiempo real (outbox → SSE, Web Push, email)
- [x] **Sprint 5** – Asignación por carga de trabajo, Kanban por departamentos y administración de usuarios
- [x] **Sprint 6** – Tareas por frente, evaluación/calificación y reportes
- [x] **Sprint 7** – PM Suite: proyectos, Gantt, matriz de riesgos, deuda técnica, presupuesto y ROI
- [x] **Sprint 8** – Endurecimiento: límites de peticiones, cabeceras y registros seguros, verificación y restauración de copias, prueba de humo, rendimiento y guion de pruebas sin conexión

## 10. Instalación en el VPS (producción)

Guía paso a paso: [`docs/Despliegue_VPS.md`](docs/Despliegue_VPS.md). Resumen:

```bash
sudo git clone https://<TOKEN>@github.com/WILSP1971/Apps_GestionProyectos.git /opt/sierraflow/app
sudo bash /opt/sierraflow/app/deploy/instalar-servidor.sh   # primera vez
sudo bash /opt/sierraflow/app/deploy/desplegar.sh           # cada actualización
```
