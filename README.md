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

## 7. Pruebas

```bash
pnpm test                      # dominio (API) + contratos
cd services/analitica && pytest -q
```

## 8. Estado del proyecto (plan por sprints)

- [x] **Sprint 0** – Monorepo, modelo de datos, migraciones, semillas, roles de BD
- [x] **Sprint 1** – Identidad OAuth 2.0 (API) + login web + layout y tema
- [x] **Sprint 2** – Solicitudes: asistente de 4 pasos, Mis solicitudes, detalle con línea de vida, comentarios
- [ ] **Sprint 3** – Motor de sincronización offline (push/pull) + Service Worker (Serwist)
- [ ] **Sprint 4** – Notificaciones en tiempo real (outbox → SSE, Web Push, email)
- [ ] **Sprint 5** – Asignación por carga de trabajo y Kanban por departamentos
- [ ] **Sprint 6** – Evaluación/calificación y reportes
- [ ] **Sprint 7** – PM Suite (Gantt, riesgos, deuda técnica, ROI) y endurecimiento

Despliegue en el VPS Ubuntu (`proyectos.sierrainnova.tech`): ver sección 13 de la guía.
