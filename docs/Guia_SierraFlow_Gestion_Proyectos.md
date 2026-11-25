# SierraFlow — Guía paso a paso de diseño e implementación
### Plataforma web de Gestión y Dirección de Proyectos (Solicitudes de Requerimiento)
**Arquitectura:** Modular · Clean Architecture · DDD · Offline-First
**Stack:** Next.js + React · Node.js (NestJS) · Python (FastAPI) · PostgreSQL · OAuth 2.0 / OIDC
**Despliegue:** VPS Ubuntu · dominio `sierrainnova.tech`

---

## Índice

0. [Resumen ejecutivo y decisiones clave](#0-resumen-ejecutivo-y-decisiones-clave)
1. [Lectura de los mockups → módulos funcionales](#1-lectura-de-los-mockups--módulos-funcionales)
2. [Arquitectura de la solución](#2-arquitectura-de-la-solución)
3. [Stack tecnológico y versiones](#3-stack-tecnológico-y-versiones)
4. [Estructura del monorepo](#4-estructura-del-monorepo)
5. [Modelo de datos PostgreSQL (scripts SQL)](#5-modelo-de-datos-postgresql-scripts-sql)
6. [Backend Node.js — Clean Architecture + DDD](#6-backend-nodejs--clean-architecture--ddd)
7. [Autenticación y autorización OAuth 2.0 / OIDC](#7-autenticación-y-autorización-oauth-20--oidc)
8. [Offline-First (frontend + sincronización)](#8-offline-first-frontend--sincronización)
9. [Alertas y notificaciones en tiempo real](#9-alertas-y-notificaciones-en-tiempo-real)
10. [Frontend Next.js — módulos y pantallas](#10-frontend-nextjs--módulos-y-pantallas)
11. [Servicio Python — Analítica, SLA y calificación](#11-servicio-python--analítica-sla-y-calificación)
12. [Pruebas y calidad](#12-pruebas-y-calidad)
13. [Despliegue en el VPS Ubuntu (sierrainnova.tech)](#13-despliegue-en-el-vps-ubuntu-sierrainnovatech)
14. [CI/CD con GitHub Actions](#14-cicd-con-github-actions)
15. [Plan de trabajo por sprints y checklist](#15-plan-de-trabajo-por-sprints-y-checklist)

---

## 0. Resumen ejecutivo y decisiones clave

| Decisión | Elección | Motivo |
|---|---|---|
| Organización del código | Monorepo (pnpm + Turborepo) | Tipos y contratos compartidos entre web y API |
| Frontend | Next.js (App Router) + React 19 + Tailwind + shadcn/ui | SSR/RSC, PWA, ecosistema moderno |
| Backend de dominio | NestJS (Node.js, TypeScript) con capas Clean Architecture | Inyección de dependencias nativa, módulos ≈ bounded contexts |
| Servicio analítico | Python FastAPI | KPIs, calificación ponderada, SLA, detección de duplicados |
| Base de datos | PostgreSQL 16+ (esquema `gestion`) | Transacciones, JSONB, `LISTEN/NOTIFY`, `pg_trgm`, búsqueda full-text en español |
| Acceso a datos | SQL explícito con `pg` (sin ORM) | El modelo en español vive en SQL; repositorios limpios |
| Autenticación | OAuth 2.0 Authorization Code + PKCE vía OIDC (Google / Microsoft Entra ID / Keycloak) | Estándar, SSO corporativo |
| Tokens de la API | JWT RS256 propio (15 min) + refresh token rotativo | La API no depende del formato de token del IdP |
| Offline-First | IndexedDB (Dexie) + Service Worker (Serwist) + bandeja de salida (outbox) + sync por cursor | La app funciona sin red y sincroniza al reconectar |
| Eventos de dominio | Patrón *Transactional Outbox* + `LISTEN/NOTIFY` | Sin perder eventos; sin broker extra en el VPS |
| Notificaciones | In-app (SSE) + Web Push (VAPID) + Email (SMTP) | Alerta al usuario final esté o no conectado |
| Procesos en VPS | PM2 (Node) + systemd (Python) + Nginx + Certbot | Simple, robusto y sin Docker obligatorio |

> **Dominio recomendado:** publicar la app en `proyectos.sierrainnova.tech` para no interferir con el sitio actual en `sierrainnova.tech`. Si se prefiere el dominio raíz, solo cambia el `server_name` de Nginx.

---

## 1. Lectura de los mockups → módulos funcionales

A partir de las imágenes compartidas (REQFlow / ProyecTrack / ReqTrack) se identifican estos **bounded contexts** (módulos DDD):

| # | Módulo (Bounded Context) | Pantallas de referencia | Responsabilidades |
|---|---|---|---|
| M1 | **Solicitudes** (core) | "Crear Nueva Solicitud" (asistente de 4 pasos), "Formulario de Nueva Solicitud" | Crear/editar borradores, enviar, criterios de aceptación, adjuntos, stack tecnológico, detección de duplicados |
| M2 | **Gestión y Asignación** | "Gestión de Asignación", "Detalles y Asignación SOL-234", Kanban por departamentos | Aprobar/rechazar, asignar grupo de trabajo y/o ingenieros, ver capacidad/carga, Kanban |
| M3 | **Seguimiento y Trazabilidad** | "Detalle de Solicitud", línea de vida (Borrador→Cerrada), Registro de auditoría | Timeline de estados, actividad reciente, comentarios en hilo, tareas relacionadas, auditoría |
| M4 | **Evaluación y Calificación** | "Gestión y Calificación del Avance", "Avance & Calificación" | Avance por tareas, calificación por criterios (1–5), calificación individual, nota global (B+, 8.2/10) |
| M5 | **Dirección de Proyectos (PM Suite)** | "Criterios avanzados de PM", Gantt, matriz de riesgos | Proyectos, riesgos (probabilidad × impacto), deuda técnica, presupuesto/ROI |
| M6 | **Notificaciones** | Campana, "Últimas actividades", push móvil | Alertas in-app, push y email; preferencias por usuario |
| M7 | **Reportes y Analítica** | Dashboards, "Indicadores de Solicitudes", SLA, Lead Time | KPIs por departamento/estado, carga por ingeniero, SLA, tiempos de ciclo |
| M8 | **Identidad y Acceso** | Login, perfil, roles | OAuth 2.0/OIDC, roles: SOLICITANTE, INGENIERO, LIDER, DIRECTOR, ADMIN |
| M9 | **Sincronización** (transversal) | — | Offline-first: push/pull de cambios, idempotencia, conflictos |

### Ciclo de vida de una solicitud (máquina de estados)

```mermaid
stateDiagram-v2
    [*] --> BORRADOR
    BORRADOR --> ENVIADA: enviar (solicitante)
    BORRADOR --> CANCELADA
    ENVIADA --> EN_REVISION: tomar en revisión (líder)
    EN_REVISION --> APROBADA: aprobar (líder/director)
    EN_REVISION --> RECHAZADA: rechazar
    EN_REVISION --> BORRADOR: devolver para ajustes
    APROBADA --> ASIGNADA: asignar grupo/ingenieros
    ASIGNADA --> EN_DESARROLLO: iniciar
    EN_DESARROLLO --> EN_VALIDACION: entregar a QA/solicitante
    EN_VALIDACION --> EN_DESARROLLO: devolver con hallazgos
    EN_VALIDACION --> CERRADA: aceptar y calificar
    RECHAZADA --> [*]
    CERRADA --> [*]
    CANCELADA --> [*]
```

---

## 2. Arquitectura de la solución

```mermaid
flowchart LR
  subgraph Cliente["Navegador / PWA"]
    UI[Next.js UI React 19]
    SW[Service Worker - Serwist]
    IDB[(IndexedDB - Dexie)]
    UI <--> IDB
    UI --> SW
  end

  subgraph VPS["VPS Ubuntu - proyectos.sierrainnova.tech"]
    NGX[Nginx + TLS]
    WEB[Next.js server :3000]
    API[API NestJS :4000]
    PY[FastAPI Analítica :8000]
    PG[(PostgreSQL esquema gestion)]
    FS[/Adjuntos /var/sierraflow/]
  end

  IdP[(Proveedor OIDC: Google / Entra ID / Keycloak)]

  UI -- HTTPS --> NGX
  NGX --> WEB
  NGX -- /api --> API
  NGX -- /analitica --> PY
  WEB -- OAuth2 Code+PKCE --> IdP
  WEB -- intercambio id_token --> API
  API --> PG
  API --> FS
  PY --> PG
  PG -- LISTEN/NOTIFY eventos --> API
  API -- SSE / Web Push / SMTP --> UI
```

### Capas (Clean Architecture) — regla de dependencia

```
presentation  →  application  →  domain
     ↓               ↓
infrastructure ──────┘ (implementa los puertos definidos en domain/application)
```

- **domain**: Entidades, Agregados, Value Objects, Eventos de dominio, Puertos (interfaces de repositorio). *Sin* dependencias de frameworks.
- **application**: Casos de uso (comandos y consultas), DTOs, orquestación transaccional.
- **infrastructure**: PostgreSQL, outbox, email, web push, almacenamiento de archivos, IdP.
- **presentation**: Controladores HTTP, SSE, validación de entrada (Zod), guards de autorización.

El frontend aplica la misma idea: `domain` (tipos y reglas), `application` (casos de uso offline), `infrastructure` (Dexie, API, sync), `ui` (componentes).

---

## 3. Stack tecnológico y versiones

| Capa | Tecnología | Versión sugerida |
|---|---|---|
| Runtime | Node.js LTS | 22.x o 24.x |
| Gestor de paquetes | pnpm + Turborepo | pnpm 9+, turbo 2+ |
| Frontend | Next.js (App Router), React | Next 15/16, React 19 |
| UI | Tailwind CSS 4, shadcn/ui, lucide-react, Recharts, dnd-kit, sonner | — |
| Estado/datos | TanStack Query 5, Zustand, react-hook-form + Zod | — |
| Offline | Dexie 4 (+ dexie-react-hooks), Serwist (`@serwist/next`) | — |
| Auth web | Auth.js v5 (`next-auth@5`) | — |
| API | NestJS 11 (adaptador Fastify), `pg`, `jose`, `zod`, `web-push`, `nodemailer` | — |
| Analítica | Python 3.12+, FastAPI, asyncpg, APScheduler, PyJWT, pydantic v2 | — |
| BD | PostgreSQL | 16+ (17/18 recomendado) |
| Infra | Nginx, PM2, systemd, Certbot, UFW | — |

> Next.js **no se instala globalmente**: es una dependencia de cada proyecto (`apps/web/package.json`). Lo instalado en el VPS se reutiliza solo como referencia de versión.

---

## 4. Estructura del monorepo

```
sierraflow/
├── package.json                 # scripts raíz + workspaces
├── pnpm-workspace.yaml
├── turbo.json
├── .env.example
├── database/
│   ├── migraciones/
│   │   ├── 001_esquema_extensiones_tipos.sql
│   │   ├── 002_tablas_identidad_organizacion.sql
│   │   ├── 003_tablas_solicitudes.sql
│   │   ├── 004_tablas_evaluacion_riesgos.sql
│   │   ├── 005_tablas_notificaciones_sync_auditoria.sql
│   │   ├── 006_funciones_triggers.sql
│   │   ├── 007_vistas.sql
│   │   └── 008_roles_seguridad.sql
│   ├── semillas/
│   │   └── 001_datos_iniciales.sql
│   └── migrar.sh
├── packages/
│   ├── contratos/               # Tipos y esquemas Zod compartidos (DTOs, eventos)
│   └── config/                  # eslint, tsconfig base
├── apps/
│   ├── api/                     # NestJS – Clean Architecture + DDD
│   │   └── src/
│   │       ├── main.ts
│   │       ├── app.module.ts
│   │       ├── compartido/      # kernel: Entidad, AgregadoRaiz, EventoDominio, UnidadDeTrabajo
│   │       └── modulos/
│   │           ├── identidad/
│   │           ├── solicitudes/
│   │           │   ├── dominio/
│   │           │   ├── aplicacion/
│   │           │   ├── infraestructura/
│   │           │   └── presentacion/
│   │           ├── asignacion/
│   │           ├── seguimiento/
│   │           ├── evaluacion/
│   │           ├── proyectos/
│   │           ├── notificaciones/
│   │           └── sincronizacion/
│   └── web/                     # Next.js – PWA offline-first
│       └── src/
│           ├── app/
│           │   ├── (publico)/login/
│           │   ├── (app)/dashboard/
│           │   ├── (app)/solicitudes/nueva/
│           │   ├── (app)/solicitudes/[id]/
│           │   ├── (app)/mis-solicitudes/
│           │   ├── (app)/gestion/asignacion/
│           │   ├── (app)/gestion/kanban/
│           │   ├── (app)/gestion/evaluacion/[id]/
│           │   ├── (app)/proyectos/
│           │   ├── (app)/reportes/
│           │   ├── api/auth/[...nextauth]/route.ts
│           │   └── sw.ts
│           ├── auth.ts
│           ├── modulos/
│           │   ├── solicitudes/{dominio,aplicacion,infraestructura,ui}
│           │   ├── seguimiento/...
│           │   └── notificaciones/...
│           └── lib/offline/{db.ts,bandeja-salida.ts,motor-sync.ts}
└── services/
    └── analitica/               # Python FastAPI
        ├── pyproject.toml
        └── app/{main.py,config.py,db.py,seguridad.py,rutas/,dominio/,tareas/}
```

### Paso 4.1 — Crear el monorepo

```bash
mkdir sierraflow && cd sierraflow
pnpm init
cat > pnpm-workspace.yaml <<'EOF'
packages:
  - "apps/*"
  - "packages/*"
EOF
pnpm add -D -w turbo typescript

# Frontend
pnpm create next-app@latest apps/web --ts --tailwind --app --src-dir --eslint --use-pnpm
cd apps/web
pnpm add next-auth@beta dexie dexie-react-hooks @tanstack/react-query zustand zod \
         react-hook-form @hookform/resolvers sonner recharts @dnd-kit/core lucide-react uuid
pnpm add -D @serwist/next serwist
npx shadcn@latest init
cd ../..

# API
pnpm dlx @nestjs/cli new apps/api --package-manager pnpm --skip-git
cd apps/api
pnpm add @nestjs/platform-fastify pg jose zod web-push nodemailer uuid @nestjs/schedule
pnpm add -D @types/pg @types/web-push @types/nodemailer
cd ../..

# Python
mkdir -p services/analitica && cd services/analitica
python3 -m venv .venv && source .venv/bin/activate
pip install fastapi "uvicorn[standard]" gunicorn asyncpg pydantic-settings pyjwt[crypto] apscheduler httpx
pip freeze > requirements.txt
```

`turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
    "dev":   { "cache": false, "persistent": true },
    "lint":  {},
    "test":  { "dependsOn": ["^build"] }
  }
}
```

---

## 5. Modelo de datos PostgreSQL (scripts SQL)

### Diagrama entidad-relación (resumen)

```mermaid
erDiagram
  departamentos ||--o{ usuarios : agrupa
  usuarios ||--o{ usuario_roles : tiene
  roles ||--o{ usuario_roles : asigna
  grupos_trabajo ||--o{ grupo_miembros : contiene
  usuarios ||--o{ grupo_miembros : pertenece
  proyectos ||--o{ solicitudes : agrupa
  departamentos ||--o{ solicitudes : solicita
  usuarios ||--o{ solicitudes : crea
  solicitudes ||--o{ criterios_aceptacion : define
  solicitudes ||--o{ adjuntos : contiene
  solicitudes ||--o{ historial_estados : registra
  solicitudes ||--o{ asignaciones : recibe
  solicitudes ||--o{ tareas : desglosa
  solicitudes ||--o{ comentarios : discute
  solicitudes ||--o{ evaluaciones : califica
  evaluaciones ||--o{ evaluacion_detalle : detalla
  evaluaciones ||--o{ calificaciones_individuales : evalua
  solicitudes ||--o{ riesgos : identifica
  usuarios ||--o{ notificaciones : recibe
```

### 5.1 `001_esquema_extensiones_tipos.sql`

```sql
-- =====================================================================
-- SierraFlow · 001 · Esquema, extensiones y tipos enumerados
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid(), digest()
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- similitud de texto (duplicados)
CREATE EXTENSION IF NOT EXISTS citext;     -- emails sin distinción de mayúsculas
CREATE EXTENSION IF NOT EXISTS unaccent;   -- búsqueda sin tildes

CREATE SCHEMA IF NOT EXISTS gestion;
SET search_path TO gestion, public;

-- Secuencia global de cambios: alimenta la sincronización offline (pull por cursor)
CREATE SEQUENCE IF NOT EXISTS gestion.seq_sync;
-- Consecutivo legible de solicitudes: SOL-000001
CREATE SEQUENCE IF NOT EXISTS gestion.seq_codigo_solicitud;
CREATE SEQUENCE IF NOT EXISTS gestion.seq_codigo_proyecto;

CREATE TYPE gestion.estado_solicitud AS ENUM (
  'BORRADOR','ENVIADA','EN_REVISION','APROBADA','RECHAZADA',
  'ASIGNADA','EN_DESARROLLO','EN_VALIDACION','CERRADA','CANCELADA'
);
CREATE TYPE gestion.tipo_solicitud   AS ENUM ('FUNCIONAL','TECNICA','MEJORA','INCIDENTE','CAMBIO');
CREATE TYPE gestion.prioridad        AS ENUM ('BAJA','MEDIA','ALTA','CRITICA');
CREATE TYPE gestion.estado_tarea     AS ENUM ('PENDIENTE','EN_PROGRESO','BLOQUEADA','COMPLETADA');
CREATE TYPE gestion.estado_proyecto  AS ENUM ('PLANEACION','EN_EJECUCION','EN_PAUSA','CERRADO','CANCELADO');
CREATE TYPE gestion.estado_riesgo    AS ENUM ('ABIERTO','MITIGADO','MATERIALIZADO','CERRADO');
CREATE TYPE gestion.canal_notificacion AS ENUM ('APP','EMAIL','PUSH');
CREATE TYPE gestion.operacion_auditoria AS ENUM ('INSERT','UPDATE','DELETE');
```

### 5.2 `002_tablas_identidad_organizacion.sql`

```sql
SET search_path TO gestion, public;

CREATE TABLE departamentos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo        varchar(20)  NOT NULL UNIQUE,
  nombre        varchar(120) NOT NULL,
  color_hex     char(7)      NOT NULL DEFAULT '#0EA5A4',
  activo        boolean      NOT NULL DEFAULT true,
  creado_en     timestamptz  NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  version       integer      NOT NULL DEFAULT 1,
  seq_cambio    bigint       NOT NULL DEFAULT nextval('gestion.seq_sync'),
  eliminado     boolean      NOT NULL DEFAULT false
);

CREATE TABLE usuarios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           citext       NOT NULL UNIQUE,
  nombre_completo varchar(160) NOT NULL,
  cargo           varchar(120),
  avatar_url      text,
  departamento_id uuid REFERENCES departamentos(id),
  proveedor_oauth varchar(40)  NOT NULL,            -- google | microsoft-entra-id | keycloak
  sujeto_oauth    varchar(255) NOT NULL,            -- claim "sub" del IdP
  zona_horaria    varchar(60)  NOT NULL DEFAULT 'America/Bogota',
  activo          boolean      NOT NULL DEFAULT true,
  ultimo_acceso   timestamptz,
  creado_en       timestamptz  NOT NULL DEFAULT now(),
  actualizado_en  timestamptz  NOT NULL DEFAULT now(),
  version         integer      NOT NULL DEFAULT 1,
  seq_cambio      bigint       NOT NULL DEFAULT nextval('gestion.seq_sync'),
  eliminado       boolean      NOT NULL DEFAULT false,
  CONSTRAINT uq_usuario_oauth UNIQUE (proveedor_oauth, sujeto_oauth)
);
CREATE INDEX ix_usuarios_departamento ON usuarios(departamento_id);

CREATE TABLE roles (
  id          smallserial PRIMARY KEY,
  codigo      varchar(30)  NOT NULL UNIQUE,   -- SOLICITANTE, INGENIERO, LIDER, DIRECTOR, ADMIN
  nombre      varchar(80)  NOT NULL,
  descripcion text
);

CREATE TABLE usuario_roles (
  usuario_id  uuid     NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  rol_id      smallint NOT NULL REFERENCES roles(id),
  otorgado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, rol_id)
);

CREATE TABLE grupos_trabajo (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      varchar(80) NOT NULL UNIQUE,     -- Backend, Frontend, QA, DevOps, Diseño
  descripcion text,
  lider_id    uuid REFERENCES usuarios(id),
  activo      boolean NOT NULL DEFAULT true,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  version     integer NOT NULL DEFAULT 1,
  seq_cambio  bigint  NOT NULL DEFAULT nextval('gestion.seq_sync'),
  eliminado   boolean NOT NULL DEFAULT false
);

CREATE TABLE grupo_miembros (
  grupo_id               uuid NOT NULL REFERENCES grupos_trabajo(id) ON DELETE CASCADE,
  usuario_id             uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  capacidad_horas_semana numeric(5,2) NOT NULL DEFAULT 40 CHECK (capacidad_horas_semana > 0),
  desde                  date NOT NULL DEFAULT current_date,
  PRIMARY KEY (grupo_id, usuario_id)
);

CREATE TABLE tecnologias (
  id      smallserial PRIMARY KEY,
  nombre  varchar(60) NOT NULL UNIQUE,         -- Next.js, Node.js, Python/FastAPI, PostgreSQL...
  categoria varchar(40)                         -- frontend | backend | datos | infraestructura
);

CREATE TABLE usuario_tecnologias (
  usuario_id    uuid     NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tecnologia_id smallint NOT NULL REFERENCES tecnologias(id),
  nivel         smallint NOT NULL DEFAULT 3 CHECK (nivel BETWEEN 1 AND 5),
  PRIMARY KEY (usuario_id, tecnologia_id)
);

-- Refresh tokens rotativos (OAuth 2.0 – emitidos por la API)
CREATE TABLE sesiones_refresh (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id      uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash      char(64) NOT NULL UNIQUE,     -- SHA-256 del token, nunca el token en claro
  familia_id      uuid NOT NULL,                -- detecta reutilización (robo) de tokens
  dispositivo_id  varchar(80),
  user_agent      text,
  ip              inet,
  expira_en       timestamptz NOT NULL,
  revocado_en     timestamptz,
  reemplazado_por uuid REFERENCES sesiones_refresh(id),
  creado_en       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_sesiones_usuario ON sesiones_refresh(usuario_id) WHERE revocado_en IS NULL;
```

### 5.3 `003_tablas_solicitudes.sql`

```sql
SET search_path TO gestion, public;

CREATE TABLE proyectos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo          varchar(20) NOT NULL UNIQUE
                  DEFAULT 'PRY-' || lpad(nextval('gestion.seq_codigo_proyecto')::text, 4, '0'),
  nombre          varchar(160) NOT NULL,
  descripcion     text,
  departamento_id uuid REFERENCES departamentos(id),
  director_id     uuid REFERENCES usuarios(id),
  estado          estado_proyecto NOT NULL DEFAULT 'PLANEACION',
  fecha_inicio    date,
  fecha_fin_plan  date,
  fecha_fin_real  date,
  presupuesto     numeric(16,2) CHECK (presupuesto >= 0),
  costo_real      numeric(16,2) NOT NULL DEFAULT 0,
  beneficio_esperado numeric(16,2),
  moneda          char(3) NOT NULL DEFAULT 'COP',
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  version         integer NOT NULL DEFAULT 1,
  seq_cambio      bigint  NOT NULL DEFAULT nextval('gestion.seq_sync'),
  eliminado       boolean NOT NULL DEFAULT false,
  CONSTRAINT ck_proyecto_fechas CHECK (fecha_fin_plan IS NULL OR fecha_inicio IS NULL OR fecha_fin_plan >= fecha_inicio)
);

-- Agregado raíz principal
CREATE TABLE solicitudes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- el cliente offline puede enviar su UUID
  codigo             varchar(20) NOT NULL UNIQUE
                     DEFAULT 'SOL-' || lpad(nextval('gestion.seq_codigo_solicitud')::text, 6, '0'),
  titulo             varchar(200) NOT NULL CHECK (length(trim(titulo)) >= 5),
  descripcion        text NOT NULL,
  objetivos          text,
  justificacion      text,
  tipo               tipo_solicitud   NOT NULL DEFAULT 'FUNCIONAL',
  prioridad          prioridad        NOT NULL DEFAULT 'MEDIA',
  estado             estado_solicitud NOT NULL DEFAULT 'BORRADOR',
  solicitante_id     uuid NOT NULL REFERENCES usuarios(id),
  departamento_id    uuid NOT NULL REFERENCES departamentos(id),
  proyecto_id        uuid REFERENCES proyectos(id),
  responsable_id     uuid REFERENCES usuarios(id),             -- líder que gestiona
  fecha_deseada      date,
  fecha_envio        timestamptz,
  fecha_aprobacion   timestamptz,
  fecha_inicio_desarrollo timestamptz,
  fecha_cierre       timestamptz,
  sla_horas          integer NOT NULL DEFAULT 72 CHECK (sla_horas > 0), -- tiempo máx. de respuesta
  story_points       smallint CHECK (story_points BETWEEN 0 AND 100),
  avance_pct         numeric(5,2) NOT NULL DEFAULT 0 CHECK (avance_pct BETWEEN 0 AND 100),
  motivo_rechazo     text,
  impacto_negocio    text,
  busqueda           tsvector GENERATED ALWAYS AS (
                       setweight(to_tsvector('spanish', coalesce(titulo,'')), 'A') ||
                       setweight(to_tsvector('spanish', coalesce(descripcion,'')), 'B')
                     ) STORED,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  actualizado_en     timestamptz NOT NULL DEFAULT now(),
  version            integer NOT NULL DEFAULT 1,               -- concurrencia optimista
  seq_cambio         bigint  NOT NULL DEFAULT nextval('gestion.seq_sync'),
  eliminado          boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_solicitudes_estado        ON solicitudes(estado) WHERE NOT eliminado;
CREATE INDEX ix_solicitudes_solicitante   ON solicitudes(solicitante_id);
CREATE INDEX ix_solicitudes_departamento  ON solicitudes(departamento_id, estado);
CREATE INDEX ix_solicitudes_seq           ON solicitudes(seq_cambio);
CREATE INDEX ix_solicitudes_busqueda      ON solicitudes USING gin(busqueda);
CREATE INDEX ix_solicitudes_titulo_trgm   ON solicitudes USING gin(titulo gin_trgm_ops);

CREATE TABLE solicitud_tecnologias (
  solicitud_id  uuid     NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
  tecnologia_id smallint NOT NULL REFERENCES tecnologias(id),
  PRIMARY KEY (solicitud_id, tecnologia_id)
);

CREATE TABLE criterios_aceptacion (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id  uuid NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
  orden         smallint NOT NULL,
  descripcion   text NOT NULL,
  cumplido      boolean NOT NULL DEFAULT false,
  verificado_por uuid REFERENCES usuarios(id),
  verificado_en timestamptz,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  version       integer NOT NULL DEFAULT 1,
  seq_cambio    bigint  NOT NULL DEFAULT nextval('gestion.seq_sync'),
  eliminado     boolean NOT NULL DEFAULT false,
  CONSTRAINT uq_criterio_orden UNIQUE (solicitud_id, orden)
);

CREATE TABLE adjuntos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id        uuid NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
  nombre_archivo      varchar(255) NOT NULL,
  ruta_almacenamiento text NOT NULL,                 -- /var/sierraflow/adjuntos/aaaa/mm/uuid.ext
  tipo_mime           varchar(120) NOT NULL,
  tamano_bytes        bigint NOT NULL CHECK (tamano_bytes > 0 AND tamano_bytes <= 26214400), -- 25 MB
  sha256              char(64) NOT NULL,
  subido_por          uuid NOT NULL REFERENCES usuarios(id),
  creado_en           timestamptz NOT NULL DEFAULT now(),
  seq_cambio          bigint NOT NULL DEFAULT nextval('gestion.seq_sync'),
  eliminado           boolean NOT NULL DEFAULT false
);

-- Catálogo de transiciones permitidas (defensa en profundidad de la máquina de estados)
CREATE TABLE transiciones_estado (
  desde          estado_solicitud NOT NULL,
  hacia          estado_solicitud NOT NULL,
  roles_permitidos varchar(30)[] NOT NULL,
  requiere_comentario boolean NOT NULL DEFAULT false,
  PRIMARY KEY (desde, hacia)
);

CREATE TABLE historial_estados (
  id              bigserial PRIMARY KEY,
  solicitud_id    uuid NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
  estado_anterior estado_solicitud,
  estado_nuevo    estado_solicitud NOT NULL,
  usuario_id      uuid REFERENCES usuarios(id),
  comentario      text,
  fecha           timestamptz NOT NULL DEFAULT now(),
  duracion_estado_anterior interval               -- cuánto estuvo en el estado previo (lead/cycle time)
);
CREATE INDEX ix_historial_solicitud ON historial_estados(solicitud_id, fecha);

CREATE TABLE asignaciones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id   uuid NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
  grupo_id       uuid REFERENCES grupos_trabajo(id),
  usuario_id     uuid REFERENCES usuarios(id),          -- ingeniero de desarrollo
  rol_en_solicitud varchar(40) NOT NULL DEFAULT 'DESARROLLADOR', -- DESARROLLADOR | QA | REVISOR
  horas_estimadas numeric(6,2),
  asignado_por   uuid NOT NULL REFERENCES usuarios(id),
  comentario     text,
  activa         boolean NOT NULL DEFAULT true,
  fecha_asignacion timestamptz NOT NULL DEFAULT now(),
  fecha_liberacion timestamptz,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  version        integer NOT NULL DEFAULT 1,
  seq_cambio     bigint  NOT NULL DEFAULT nextval('gestion.seq_sync'),
  eliminado      boolean NOT NULL DEFAULT false,
  CONSTRAINT ck_asignacion_destino CHECK (grupo_id IS NOT NULL OR usuario_id IS NOT NULL)
);
CREATE UNIQUE INDEX uq_asignacion_activa_usuario
  ON asignaciones(solicitud_id, usuario_id) WHERE activa AND usuario_id IS NOT NULL;
CREATE INDEX ix_asignaciones_usuario ON asignaciones(usuario_id) WHERE activa;

CREATE TABLE tareas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id   uuid NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
  titulo         varchar(200) NOT NULL,
  descripcion    text,
  grupo_id       uuid REFERENCES grupos_trabajo(id),
  responsable_id uuid REFERENCES usuarios(id),
  estado         estado_tarea NOT NULL DEFAULT 'PENDIENTE',
  peso           smallint NOT NULL DEFAULT 1 CHECK (peso BETWEEN 1 AND 10),  -- ponderación del avance
  avance_pct     numeric(5,2) NOT NULL DEFAULT 0 CHECK (avance_pct BETWEEN 0 AND 100),
  horas_estimadas numeric(6,2),
  horas_reales   numeric(6,2) NOT NULL DEFAULT 0,
  fecha_inicio   date,
  fecha_fin_plan date,
  fecha_fin_real date,
  depende_de     uuid REFERENCES tareas(id),       -- para el Gantt
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  version        integer NOT NULL DEFAULT 1,
  seq_cambio     bigint  NOT NULL DEFAULT nextval('gestion.seq_sync'),
  eliminado      boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_tareas_solicitud   ON tareas(solicitud_id);
CREATE INDEX ix_tareas_responsable ON tareas(responsable_id, estado);

CREATE TABLE comentarios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id  uuid NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
  autor_id      uuid NOT NULL REFERENCES usuarios(id),
  padre_id      uuid REFERENCES comentarios(id),   -- hilos de discusión
  contenido     text NOT NULL CHECK (length(contenido) BETWEEN 1 AND 10000),
  menciones     uuid[] NOT NULL DEFAULT '{}',      -- @usuarios mencionados → notificación
  editado       boolean NOT NULL DEFAULT false,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  version       integer NOT NULL DEFAULT 1,
  seq_cambio    bigint  NOT NULL DEFAULT nextval('gestion.seq_sync'),
  eliminado     boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_comentarios_solicitud ON comentarios(solicitud_id, creado_en);
```

### 5.4 `004_tablas_evaluacion_riesgos.sql`

```sql
SET search_path TO gestion, public;

CREATE TABLE criterios_calificacion (
  id          smallserial PRIMARY KEY,
  codigo      varchar(40) NOT NULL UNIQUE,
  nombre      varchar(120) NOT NULL,          -- Cumplimiento de criterios, Código y documentación...
  descripcion text,
  peso        numeric(4,2) NOT NULL CHECK (peso > 0),  -- suman 1.00 entre los activos
  activo      boolean NOT NULL DEFAULT true
);

CREATE TABLE evaluaciones (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id        uuid NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
  evaluador_id        uuid NOT NULL REFERENCES usuarios(id),
  tipo                varchar(20) NOT NULL DEFAULT 'AVANCE' CHECK (tipo IN ('AVANCE','CIERRE')),
  avance_reportado    numeric(5,2) NOT NULL,
  calificacion_tecnica numeric(3,2) CHECK (calificacion_tecnica BETWEEN 1 AND 5),
  calificacion_plazos  numeric(3,2) CHECK (calificacion_plazos  BETWEEN 1 AND 5),
  calificacion_global  numeric(4,2) CHECK (calificacion_global BETWEEN 0 AND 10), -- 8.20 / 10
  calificacion_letra   varchar(2),                                                 -- A+, A, B+...
  comentario          text,
  fecha               timestamptz NOT NULL DEFAULT now(),
  seq_cambio          bigint NOT NULL DEFAULT nextval('gestion.seq_sync'),
  eliminado           boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_evaluaciones_solicitud ON evaluaciones(solicitud_id, fecha DESC);

CREATE TABLE evaluacion_detalle (
  evaluacion_id uuid     NOT NULL REFERENCES evaluaciones(id) ON DELETE CASCADE,
  criterio_id   smallint NOT NULL REFERENCES criterios_calificacion(id),
  puntaje       smallint NOT NULL CHECK (puntaje BETWEEN 1 AND 5),
  comentario    text,
  PRIMARY KEY (evaluacion_id, criterio_id)
);

CREATE TABLE calificaciones_individuales (
  evaluacion_id uuid NOT NULL REFERENCES evaluaciones(id) ON DELETE CASCADE,
  usuario_id    uuid NOT NULL REFERENCES usuarios(id),
  puntaje       smallint NOT NULL CHECK (puntaje BETWEEN 1 AND 5),
  comentario    text,
  PRIMARY KEY (evaluacion_id, usuario_id)
);

CREATE TABLE riesgos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id     uuid REFERENCES proyectos(id) ON DELETE CASCADE,
  solicitud_id    uuid REFERENCES solicitudes(id) ON DELETE CASCADE,
  titulo          varchar(200) NOT NULL,
  descripcion     text,
  probabilidad    smallint NOT NULL CHECK (probabilidad BETWEEN 1 AND 5),
  impacto         smallint NOT NULL CHECK (impacto BETWEEN 1 AND 5),
  exposicion      smallint GENERATED ALWAYS AS (probabilidad * impacto) STORED, -- 1..25
  plan_mitigacion text,
  responsable_id  uuid REFERENCES usuarios(id),
  estado          estado_riesgo NOT NULL DEFAULT 'ABIERTO',
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  version         integer NOT NULL DEFAULT 1,
  seq_cambio      bigint  NOT NULL DEFAULT nextval('gestion.seq_sync'),
  eliminado       boolean NOT NULL DEFAULT false,
  CONSTRAINT ck_riesgo_origen CHECK (proyecto_id IS NOT NULL OR solicitud_id IS NOT NULL)
);

CREATE TABLE deuda_tecnica (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id   uuid NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  descripcion   text NOT NULL,
  story_points  smallint NOT NULL CHECK (story_points > 0),
  resuelta      boolean NOT NULL DEFAULT false,
  creado_en     timestamptz NOT NULL DEFAULT now()
);
```

### 5.5 `005_tablas_notificaciones_sync_auditoria.sql`

```sql
SET search_path TO gestion, public;

CREATE TABLE notificaciones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id    uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo_evento   varchar(60) NOT NULL,         -- SOLICITUD_ENVIADA, SOLICITUD_ASIGNADA, SLA_EN_RIESGO...
  titulo        varchar(200) NOT NULL,
  mensaje       text NOT NULL,
  enlace        text,                          -- /solicitudes/{id}
  datos         jsonb NOT NULL DEFAULT '{}',
  severidad     varchar(10) NOT NULL DEFAULT 'INFO' CHECK (severidad IN ('INFO','EXITO','ALERTA','CRITICA')),
  leida         boolean NOT NULL DEFAULT false,
  fecha_lectura timestamptz,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  seq_cambio    bigint NOT NULL DEFAULT nextval('gestion.seq_sync')
);
CREATE INDEX ix_notificaciones_usuario ON notificaciones(usuario_id, leida, creado_en DESC);

CREATE TABLE preferencias_notificacion (
  usuario_id  uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo_evento varchar(60) NOT NULL,
  canal       canal_notificacion NOT NULL,
  activo      boolean NOT NULL DEFAULT true,
  PRIMARY KEY (usuario_id, tipo_evento, canal)
);

CREATE TABLE suscripciones_push (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  endpoint    text NOT NULL UNIQUE,
  clave_p256dh text NOT NULL,
  clave_auth  text NOT NULL,
  user_agent  text,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  ultimo_uso  timestamptz
);

-- Transactional Outbox: los eventos de dominio se guardan en la MISMA transacción
CREATE TABLE eventos_outbox (
  id            bigserial PRIMARY KEY,
  agregado      varchar(60) NOT NULL,          -- Solicitud, Asignacion, Evaluacion...
  agregado_id   uuid NOT NULL,
  tipo_evento   varchar(80) NOT NULL,          -- solicitud.enviada, solicitud.asignada...
  payload       jsonb NOT NULL,
  ocurrido_en   timestamptz NOT NULL DEFAULT now(),
  procesado_en  timestamptz,
  intentos      smallint NOT NULL DEFAULT 0,
  ultimo_error  text
);
CREATE INDEX ix_outbox_pendientes ON eventos_outbox(id) WHERE procesado_en IS NULL;

-- Idempotencia de operaciones offline (cada operación lleva un UUID generado en el cliente)
CREATE TABLE sync_operaciones (
  id_operacion  uuid PRIMARY KEY,
  usuario_id    uuid NOT NULL REFERENCES usuarios(id),
  dispositivo_id varchar(80) NOT NULL,
  entidad       varchar(60) NOT NULL,
  entidad_id    uuid NOT NULL,
  tipo          varchar(40) NOT NULL,
  resultado     jsonb NOT NULL,                -- respuesta original para reintentos
  procesada_en  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auditoria (
  id            bigserial PRIMARY KEY,
  tabla         varchar(60) NOT NULL,
  registro_id   uuid,
  operacion     operacion_auditoria NOT NULL,
  usuario_id    uuid,                          -- tomado de current_setting('app.usuario_id')
  datos_antes   jsonb,
  datos_despues jsonb,
  fecha         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_auditoria_registro ON auditoria(tabla, registro_id, fecha DESC);
```

### 5.6 `006_funciones_triggers.sql`

```sql
SET search_path TO gestion, public;

-- 1) Metadatos de cambio: actualizado_en, version (concurrencia optimista) y seq_cambio (sync)
CREATE OR REPLACE FUNCTION gestion.fn_metadatos_cambio()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.actualizado_en := now();
  NEW.version        := OLD.version + 1;
  NEW.seq_cambio     := nextval('gestion.seq_sync');
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['departamentos','usuarios','grupos_trabajo','proyectos','solicitudes',
                           'criterios_aceptacion','asignaciones','tareas','comentarios','riesgos']
  LOOP
    EXECUTE format('CREATE TRIGGER tg_%1$s_metadatos BEFORE UPDATE ON gestion.%1$s
                    FOR EACH ROW EXECUTE FUNCTION gestion.fn_metadatos_cambio()', t);
  END LOOP;
END $$;

-- 2) Validación de transiciones de estado + sellos de tiempo del ciclo de vida
CREATE OR REPLACE FUNCTION gestion.fn_validar_transicion_solicitud()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NOT EXISTS (SELECT 1 FROM gestion.transiciones_estado
                   WHERE desde = OLD.estado AND hacia = NEW.estado) THEN
      RAISE EXCEPTION 'Transición no permitida: % → %', OLD.estado, NEW.estado
        USING ERRCODE = 'check_violation';
    END IF;
    CASE NEW.estado
      WHEN 'ENVIADA'       THEN NEW.fecha_envio := coalesce(NEW.fecha_envio, now());
      WHEN 'APROBADA'      THEN NEW.fecha_aprobacion := now();
      WHEN 'EN_DESARROLLO' THEN NEW.fecha_inicio_desarrollo := coalesce(NEW.fecha_inicio_desarrollo, now());
      WHEN 'CERRADA'       THEN NEW.fecha_cierre := now(); NEW.avance_pct := 100;
      ELSE NULL;
    END CASE;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER tg_solicitudes_transicion
  BEFORE UPDATE OF estado ON solicitudes
  FOR EACH ROW EXECUTE FUNCTION gestion.fn_validar_transicion_solicitud();

-- 3) Historial de estados (trazabilidad / timeline)
CREATE OR REPLACE FUNCTION gestion.fn_historial_estado()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_usuario uuid := nullif(current_setting('app.usuario_id', true), '')::uuid;
  v_comentario text := nullif(current_setting('app.comentario_estado', true), '');
  v_ultimo timestamptz;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO gestion.historial_estados(solicitud_id, estado_anterior, estado_nuevo, usuario_id)
    VALUES (NEW.id, NULL, NEW.estado, coalesce(v_usuario, NEW.solicitante_id));
  ELSIF NEW.estado IS DISTINCT FROM OLD.estado THEN
    SELECT max(fecha) INTO v_ultimo FROM gestion.historial_estados WHERE solicitud_id = NEW.id;
    INSERT INTO gestion.historial_estados(solicitud_id, estado_anterior, estado_nuevo, usuario_id,
                                          comentario, duracion_estado_anterior)
    VALUES (NEW.id, OLD.estado, NEW.estado, v_usuario, v_comentario, now() - v_ultimo);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER tg_solicitudes_historial
  AFTER INSERT OR UPDATE OF estado ON solicitudes
  FOR EACH ROW EXECUTE FUNCTION gestion.fn_historial_estado();

-- 4) Avance ponderado de la solicitud a partir de sus tareas
CREATE OR REPLACE FUNCTION gestion.fn_recalcular_avance()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_id uuid := coalesce(NEW.solicitud_id, OLD.solicitud_id);
BEGIN
  UPDATE gestion.solicitudes s
     SET avance_pct = coalesce((
           SELECT round(sum(t.avance_pct * t.peso) / nullif(sum(t.peso), 0), 2)
             FROM gestion.tareas t
            WHERE t.solicitud_id = v_id AND NOT t.eliminado), 0)
   WHERE s.id = v_id AND s.estado <> 'CERRADA';
  RETURN NULL;
END $$;

CREATE TRIGGER tg_tareas_avance
  AFTER INSERT OR UPDATE OF avance_pct, peso, eliminado OR DELETE ON tareas
  FOR EACH ROW EXECUTE FUNCTION gestion.fn_recalcular_avance();

-- 5) Aviso inmediato al despachador de eventos (LISTEN eventos_dominio)
CREATE OR REPLACE FUNCTION gestion.fn_notificar_outbox()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('eventos_dominio', NEW.id::text);
  RETURN NULL;
END $$;

CREATE TRIGGER tg_outbox_notify
  AFTER INSERT ON eventos_outbox
  FOR EACH ROW EXECUTE FUNCTION gestion.fn_notificar_outbox();

-- 6) Aviso en tiempo real de nuevas notificaciones (SSE)
CREATE OR REPLACE FUNCTION gestion.fn_notificar_notificacion()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('notificaciones_usuario',
    json_build_object('usuario_id', NEW.usuario_id, 'id', NEW.id)::text);
  RETURN NULL;
END $$;

CREATE TRIGGER tg_notificaciones_notify
  AFTER INSERT ON notificaciones
  FOR EACH ROW EXECUTE FUNCTION gestion.fn_notificar_notificacion();

-- 7) Auditoría genérica
CREATE OR REPLACE FUNCTION gestion.fn_auditoria()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_usuario uuid := nullif(current_setting('app.usuario_id', true), '')::uuid;
BEGIN
  INSERT INTO gestion.auditoria(tabla, registro_id, operacion, usuario_id, datos_antes, datos_despues)
  VALUES (TG_TABLE_NAME,
          coalesce((to_jsonb(NEW)->>'id')::uuid, (to_jsonb(OLD)->>'id')::uuid),
          TG_OP::gestion.operacion_auditoria, v_usuario,
          CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) - 'busqueda' END,
          CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) - 'busqueda' END);
  RETURN NULL;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['solicitudes','asignaciones','tareas','evaluaciones','proyectos','riesgos']
  LOOP
    EXECUTE format('CREATE TRIGGER tg_%1$s_auditoria AFTER INSERT OR UPDATE OR DELETE ON gestion.%1$s
                    FOR EACH ROW EXECUTE FUNCTION gestion.fn_auditoria()', t);
  END LOOP;
END $$;

-- 8) Búsqueda de solicitudes similares (anti-duplicados del asistente de creación)
CREATE OR REPLACE FUNCTION gestion.fn_solicitudes_similares(p_texto text, p_limite int DEFAULT 5)
RETURNS TABLE(id uuid, codigo varchar, titulo varchar, estado estado_solicitud, similitud real)
LANGUAGE sql STABLE AS $$
  SELECT s.id, s.codigo, s.titulo, s.estado, similarity(s.titulo, p_texto) AS similitud
    FROM gestion.solicitudes s
   WHERE NOT s.eliminado AND s.estado NOT IN ('CANCELADA','RECHAZADA')
     AND s.titulo % p_texto
   ORDER BY similitud DESC
   LIMIT p_limite;
$$;

-- 9) Conversión de nota 0–10 a letra
CREATE OR REPLACE FUNCTION gestion.fn_letra_calificacion(p_nota numeric)
RETURNS varchar LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_nota >= 9.5 THEN 'A+' WHEN p_nota >= 9.0 THEN 'A'
    WHEN p_nota >= 8.0 THEN 'B+' WHEN p_nota >= 7.0 THEN 'B'
    WHEN p_nota >= 6.0 THEN 'C'  ELSE 'D' END;
$$;
```

### 5.7 `007_vistas.sql`

```sql
SET search_path TO gestion, public;

-- Tablero (lista / kanban / panel de seguimiento)
CREATE OR REPLACE VIEW v_tablero_solicitudes AS
SELECT s.id, s.codigo, s.titulo, s.tipo, s.prioridad, s.estado, s.avance_pct,
       s.fecha_deseada, s.creado_en, s.fecha_envio, s.sla_horas,
       d.nombre AS departamento, d.color_hex,
       u.nombre_completo AS solicitante,
       p.nombre AS proyecto,
       coalesce(json_agg(DISTINCT jsonb_build_object(
          'usuario_id', ua.id, 'nombre', ua.nombre_completo, 'avatar', ua.avatar_url,
          'grupo', g.nombre)) FILTER (WHERE a.id IS NOT NULL), '[]') AS asignados,
       CASE WHEN s.fecha_envio IS NOT NULL AND s.estado IN ('ENVIADA','EN_REVISION')
                 AND now() > s.fecha_envio + make_interval(hours => s.sla_horas)
            THEN true ELSE false END AS sla_vencido
  FROM solicitudes s
  JOIN departamentos d ON d.id = s.departamento_id
  JOIN usuarios u      ON u.id = s.solicitante_id
  LEFT JOIN proyectos p ON p.id = s.proyecto_id
  LEFT JOIN asignaciones a ON a.solicitud_id = s.id AND a.activa
  LEFT JOIN usuarios ua ON ua.id = a.usuario_id
  LEFT JOIN grupos_trabajo g ON g.id = a.grupo_id
 WHERE NOT s.eliminado
 GROUP BY s.id, d.nombre, d.color_hex, u.nombre_completo, p.nombre;

-- KPI por departamento y estado (gráfico "Resumen global por departamento")
CREATE OR REPLACE VIEW v_kpi_departamento_estado AS
SELECT d.nombre AS departamento, s.estado, count(*) AS total
  FROM solicitudes s JOIN departamentos d ON d.id = s.departamento_id
 WHERE NOT s.eliminado
 GROUP BY d.nombre, s.estado;

-- Carga de trabajo por ingeniero (pantalla de asignación)
CREATE OR REPLACE VIEW v_carga_ingenieros AS
SELECT u.id AS usuario_id, u.nombre_completo, u.avatar_url,
       array_agg(DISTINCT g.nombre) FILTER (WHERE g.nombre IS NOT NULL) AS grupos,
       array_agg(DISTINCT tc.nombre) FILTER (WHERE tc.nombre IS NOT NULL) AS tecnologias,
       count(DISTINCT a.solicitud_id) FILTER (WHERE a.activa) AS solicitudes_activas,
       coalesce(sum(t.horas_estimadas - t.horas_reales) FILTER (WHERE t.estado <> 'COMPLETADA'), 0)
         AS horas_pendientes,
       coalesce(max(gm.capacidad_horas_semana), 40) AS capacidad_semana,
       least(100, round(100 * coalesce(sum(t.horas_estimadas - t.horas_reales)
             FILTER (WHERE t.estado <> 'COMPLETADA'), 0) / coalesce(max(gm.capacidad_horas_semana), 40)))
         AS carga_pct
  FROM usuarios u
  JOIN usuario_roles ur ON ur.usuario_id = u.id
  JOIN roles r ON r.id = ur.rol_id AND r.codigo = 'INGENIERO'
  LEFT JOIN grupo_miembros gm ON gm.usuario_id = u.id
  LEFT JOIN grupos_trabajo g  ON g.id = gm.grupo_id
  LEFT JOIN usuario_tecnologias ut ON ut.usuario_id = u.id
  LEFT JOIN tecnologias tc ON tc.id = ut.tecnologia_id
  LEFT JOIN asignaciones a ON a.usuario_id = u.id
  LEFT JOIN tareas t ON t.responsable_id = u.id AND NOT t.eliminado
 WHERE u.activo
 GROUP BY u.id;

-- Tiempos de ciclo (lead time y cycle time) para reportes
CREATE OR REPLACE VIEW v_tiempos_ciclo AS
SELECT s.id, s.codigo, s.departamento_id,
       s.fecha_cierre - s.fecha_envio             AS lead_time,
       s.fecha_cierre - s.fecha_inicio_desarrollo AS cycle_time,
       s.fecha_aprobacion - s.fecha_envio         AS tiempo_respuesta
  FROM solicitudes s
 WHERE s.estado = 'CERRADA';
```

### 5.8 `008_roles_seguridad.sql`

```sql
-- Usuario de aplicación con mínimos privilegios (ejecutar como superusuario postgres)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sierraflow_app') THEN
    CREATE ROLE sierraflow_app LOGIN PASSWORD 'CAMBIAR_POR_CLAVE_SEGURA';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sierraflow_lectura') THEN
    CREATE ROLE sierraflow_lectura LOGIN PASSWORD 'CAMBIAR_POR_CLAVE_SEGURA_2';
  END IF;
END $$;

GRANT USAGE ON SCHEMA gestion TO sierraflow_app, sierraflow_lectura;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA gestion TO sierraflow_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA gestion TO sierraflow_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA gestion TO sierraflow_app;
GRANT SELECT ON ALL TABLES IN SCHEMA gestion TO sierraflow_lectura;   -- servicio de analítica

-- La auditoría es solo-inserción para la app
REVOKE UPDATE, DELETE ON gestion.auditoria FROM sierraflow_app;

ALTER ROLE sierraflow_app     SET search_path = gestion, public;
ALTER ROLE sierraflow_lectura SET search_path = gestion, public;
```

> El servicio Python necesita además `INSERT` en `notificaciones`, `eventos_outbox` y `evaluaciones`: `GRANT INSERT ON gestion.notificaciones, gestion.eventos_outbox TO sierraflow_lectura;` (o crea un rol `sierraflow_analitica` dedicado).

### 5.9 `semillas/001_datos_iniciales.sql`

```sql
SET search_path TO gestion, public;

INSERT INTO roles(codigo, nombre, descripcion) VALUES
 ('SOLICITANTE','Solicitante','Usuario final que crea y sigue solicitudes'),
 ('INGENIERO','Ingeniero de desarrollo','Ejecuta tareas asignadas'),
 ('LIDER','Líder técnico','Revisa, aprueba y asigna solicitudes de su grupo'),
 ('DIRECTOR','Director de proyecto','Gestiona proyectos, evalúa y califica'),
 ('ADMIN','Administrador','Configuración general')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO departamentos(codigo, nombre, color_hex) VALUES
 ('TI','Desarrollo y TI','#22C55E'),
 ('FIN','Finanzas y Contabilidad','#EAB308'),
 ('MKT','Marketing y Ventas','#3B82F6'),
 ('RRHH','Recursos Humanos','#EF4444'),
 ('OPS','Operaciones','#8B5CF6')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO grupos_trabajo(nombre, descripcion) VALUES
 ('Backend','APIs, integraciones y servicios'),
 ('Frontend','Interfaces web y móviles'),
 ('QA','Aseguramiento de calidad y pruebas'),
 ('DevOps','Infraestructura y despliegues'),
 ('Diseño','UX/UI')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO tecnologias(nombre, categoria) VALUES
 ('Next.js','frontend'),('React','frontend'),('Node.js','backend'),
 ('NestJS','backend'),('Python/FastAPI','backend'),('PostgreSQL','datos'),
 ('Stripe API','integracion'),('MercadoPago API','integracion'),('Nginx','infraestructura')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO criterios_calificacion(codigo, nombre, peso) VALUES
 ('CRITERIOS','Cumplimiento de criterios de aceptación',0.35),
 ('CODIGO_DOC','Código y documentación',0.20),
 ('PLAZOS','Cumplimiento de plazos',0.25),
 ('IMPACTO_PROD','Impacto en producción (estabilidad)',0.20)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO transiciones_estado(desde, hacia, roles_permitidos, requiere_comentario) VALUES
 ('BORRADOR','ENVIADA',        '{SOLICITANTE,LIDER,DIRECTOR}', false),
 ('BORRADOR','CANCELADA',      '{SOLICITANTE,ADMIN}',          false),
 ('ENVIADA','EN_REVISION',     '{LIDER,DIRECTOR}',             false),
 ('ENVIADA','CANCELADA',       '{SOLICITANTE,ADMIN}',          true),
 ('EN_REVISION','APROBADA',    '{LIDER,DIRECTOR}',             false),
 ('EN_REVISION','RECHAZADA',   '{LIDER,DIRECTOR}',             true),
 ('EN_REVISION','BORRADOR',    '{LIDER,DIRECTOR}',             true),
 ('APROBADA','ASIGNADA',       '{LIDER,DIRECTOR}',             false),
 ('ASIGNADA','EN_DESARROLLO',  '{INGENIERO,LIDER}',            false),
 ('EN_DESARROLLO','EN_VALIDACION','{INGENIERO,LIDER}',         false),
 ('EN_VALIDACION','EN_DESARROLLO','{SOLICITANTE,LIDER,DIRECTOR}', true),
 ('EN_VALIDACION','CERRADA',   '{SOLICITANTE,LIDER,DIRECTOR}', false)
ON CONFLICT DO NOTHING;
```

### 5.10 `database/migrar.sh` — ejecutor de migraciones

```bash
#!/usr/bin/env bash
# Uso: DATABASE_URL=postgres://... ./database/migrar.sh
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
: "${DATABASE_URL:?Defina DATABASE_URL}"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
CREATE SCHEMA IF NOT EXISTS gestion;
CREATE TABLE IF NOT EXISTS gestion.migraciones_aplicadas(
  archivo varchar(200) PRIMARY KEY, aplicada_en timestamptz NOT NULL DEFAULT now());
SQL

for f in "$DIR"/migraciones/*.sql "$DIR"/semillas/*.sql; do
  nombre="$(basename "$(dirname "$f")")/$(basename "$f")"
  ya=$(psql "$DATABASE_URL" -tAc "SELECT 1 FROM gestion.migraciones_aplicadas WHERE archivo='$nombre'")
  if [[ "$ya" != "1" ]]; then
    echo "▶ Aplicando $nombre"
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f "$f"
    psql "$DATABASE_URL" -qc "INSERT INTO gestion.migraciones_aplicadas(archivo) VALUES ('$nombre')"
  fi
done
echo "✔ Base de datos al día"
```

> Ejecuta `001`–`007` y las semillas con un usuario dueño del esquema (p. ej. `sierraflow_owner`), y `008` como `postgres`.

---

## 6. Backend Node.js — Clean Architecture + DDD

### 6.1 Kernel compartido (`apps/api/src/compartido/dominio`)

```ts
// evento-dominio.ts
export interface EventoDominio<P = unknown> {
  readonly tipo: string;          // 'solicitud.enviada'
  readonly agregado: string;      // 'Solicitud'
  readonly agregadoId: string;
  readonly ocurridoEn: Date;
  readonly payload: P;
}

// agregado-raiz.ts
export abstract class AgregadoRaiz<Props> {
  private _eventos: EventoDominio[] = [];
  protected constructor(
    public readonly id: string,
    protected props: Props,
    private _version: number = 0,
  ) {}
  get version() { return this._version; }
  protected registrar(evento: EventoDominio) { this._eventos.push(evento); }
  extraerEventos(): EventoDominio[] { const e = this._eventos; this._eventos = []; return e; }
}

// errores.ts
export class ErrorDominio extends Error {
  constructor(public readonly codigo: string, mensaje: string) { super(mensaje); }
}
export class ConflictoConcurrencia extends ErrorDominio {
  constructor(entidad: string, id: string) {
    super('CONFLICTO_VERSION', `${entidad} ${id} fue modificada por otro usuario`);
  }
}
```

### 6.2 Dominio de Solicitudes (`modulos/solicitudes/dominio`)

```ts
// estado-solicitud.vo.ts
export const ESTADOS = ['BORRADOR','ENVIADA','EN_REVISION','APROBADA','RECHAZADA',
  'ASIGNADA','EN_DESARROLLO','EN_VALIDACION','CERRADA','CANCELADA'] as const;
export type EstadoSolicitud = typeof ESTADOS[number];
export type Rol = 'SOLICITANTE' | 'INGENIERO' | 'LIDER' | 'DIRECTOR' | 'ADMIN';

type Regla = { hacia: EstadoSolicitud; roles: Rol[]; requiereComentario?: boolean };

export const MAQUINA_ESTADOS: Record<EstadoSolicitud, Regla[]> = {
  BORRADOR:      [{ hacia: 'ENVIADA', roles: ['SOLICITANTE','LIDER','DIRECTOR'] },
                  { hacia: 'CANCELADA', roles: ['SOLICITANTE','ADMIN'] }],
  ENVIADA:       [{ hacia: 'EN_REVISION', roles: ['LIDER','DIRECTOR'] },
                  { hacia: 'CANCELADA', roles: ['SOLICITANTE','ADMIN'], requiereComentario: true }],
  EN_REVISION:   [{ hacia: 'APROBADA', roles: ['LIDER','DIRECTOR'] },
                  { hacia: 'RECHAZADA', roles: ['LIDER','DIRECTOR'], requiereComentario: true },
                  { hacia: 'BORRADOR', roles: ['LIDER','DIRECTOR'], requiereComentario: true }],
  APROBADA:      [{ hacia: 'ASIGNADA', roles: ['LIDER','DIRECTOR'] }],
  ASIGNADA:      [{ hacia: 'EN_DESARROLLO', roles: ['INGENIERO','LIDER'] }],
  EN_DESARROLLO: [{ hacia: 'EN_VALIDACION', roles: ['INGENIERO','LIDER'] }],
  EN_VALIDACION: [{ hacia: 'EN_DESARROLLO', roles: ['SOLICITANTE','LIDER','DIRECTOR'], requiereComentario: true },
                  { hacia: 'CERRADA', roles: ['SOLICITANTE','LIDER','DIRECTOR'] }],
  RECHAZADA: [], CERRADA: [], CANCELADA: [],
};
```

```ts
// solicitud.agregado.ts
import { AgregadoRaiz } from '../../../compartido/dominio/agregado-raiz';
import { ErrorDominio } from '../../../compartido/dominio/errores';
import { EstadoSolicitud, MAQUINA_ESTADOS, Rol } from './estado-solicitud.vo';

export type Prioridad = 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';
export type TipoSolicitud = 'FUNCIONAL' | 'TECNICA' | 'MEJORA' | 'INCIDENTE' | 'CAMBIO';

export interface CriterioAceptacion { id: string; orden: number; descripcion: string; cumplido: boolean }

interface PropsSolicitud {
  codigo?: string;
  titulo: string;
  descripcion: string;
  objetivos?: string;
  justificacion?: string;
  tipo: TipoSolicitud;
  prioridad: Prioridad;
  estado: EstadoSolicitud;
  solicitanteId: string;
  departamentoId: string;
  proyectoId?: string;
  fechaDeseada?: Date;
  criterios: CriterioAceptacion[];
  tecnologias: number[];
}

export class Solicitud extends AgregadoRaiz<PropsSolicitud> {
  static crear(id: string, datos: Omit<PropsSolicitud, 'estado'>): Solicitud {
    if (datos.titulo.trim().length < 5) throw new ErrorDominio('TITULO_INVALIDO', 'El título debe tener al menos 5 caracteres');
    if (!datos.descripcion.trim()) throw new ErrorDominio('DESCRIPCION_REQUERIDA', 'La descripción es obligatoria');
    const s = new Solicitud(id, { ...datos, estado: 'BORRADOR' });
    s.registrar({ tipo: 'solicitud.creada', agregado: 'Solicitud', agregadoId: id,
                  ocurridoEn: new Date(), payload: { solicitanteId: datos.solicitanteId } });
    return s;
  }

  static reconstituir(id: string, props: PropsSolicitud, version: number) {
    return new Solicitud(id, props, version);
  }

  get estado() { return this.props.estado; }
  get datos(): Readonly<PropsSolicitud> { return this.props; }

  editar(cambios: Partial<Pick<PropsSolicitud, 'titulo'|'descripcion'|'objetivos'|'justificacion'|'prioridad'|'tipo'|'fechaDeseada'|'criterios'|'tecnologias'>>) {
    if (!['BORRADOR'].includes(this.props.estado))
      throw new ErrorDominio('NO_EDITABLE', 'Solo se pueden editar solicitudes en borrador');
    Object.assign(this.props, cambios);
  }

  cambiarEstado(hacia: EstadoSolicitud, actor: { id: string; roles: Rol[] }, comentario?: string) {
    const regla = MAQUINA_ESTADOS[this.props.estado].find(r => r.hacia === hacia);
    if (!regla) throw new ErrorDominio('TRANSICION_INVALIDA', `No se puede pasar de ${this.props.estado} a ${hacia}`);
    if (!regla.roles.some(r => actor.roles.includes(r)))
      throw new ErrorDominio('SIN_PERMISO', `Su rol no permite la transición a ${hacia}`);
    if (regla.requiereComentario && !comentario?.trim())
      throw new ErrorDominio('COMENTARIO_REQUERIDO', 'Esta transición requiere un comentario');
    if (hacia === 'ENVIADA' && this.props.criterios.length === 0)
      throw new ErrorDominio('SIN_CRITERIOS', 'Agregue al menos un criterio de aceptación antes de enviar');
    if (hacia === 'CERRADA' && this.props.criterios.some(c => !c.cumplido))
      throw new ErrorDominio('CRITERIOS_PENDIENTES', 'Todos los criterios deben estar cumplidos para cerrar');

    const anterior = this.props.estado;
    this.props.estado = hacia;
    this.registrar({
      tipo: `solicitud.${hacia.toLowerCase()}`, agregado: 'Solicitud', agregadoId: this.id,
      ocurridoEn: new Date(),
      payload: { anterior, nuevo: hacia, actorId: actor.id, comentario,
                 solicitanteId: this.props.solicitanteId, titulo: this.props.titulo },
    });
  }
}
```

```ts
// solicitud.repositorio.ts  (PUERTO – lo implementa infraestructura)
import { Solicitud } from './solicitud.agregado';
export const REPOSITORIO_SOLICITUDES = Symbol('RepositorioSolicitudes');
export interface RepositorioSolicitudes {
  porId(id: string): Promise<Solicitud | null>;
  guardar(solicitud: Solicitud): Promise<void>;   // inserta o actualiza con control de versión + outbox
}
```

### 6.3 Unidad de trabajo y contexto de transacción (`compartido/infraestructura`)

```ts
// base-datos.ts
import { Pool, PoolClient } from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';

export const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 20 });
const contexto = new AsyncLocalStorage<PoolClient>();

/** Devuelve el cliente de la transacción en curso o el pool. */
export const db = () => contexto.getStore() ?? pool;

export async function enTransaccion<T>(usuarioId: string, fn: () => Promise<T>): Promise<T> {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    // Variables de sesión usadas por los triggers de historial y auditoría
    await cliente.query(`SELECT set_config('app.usuario_id', $1, true)`, [usuarioId]);
    const r = await contexto.run(cliente, fn);
    await cliente.query('COMMIT');
    return r;
  } catch (e) {
    await cliente.query('ROLLBACK');
    throw e;
  } finally {
    cliente.release();
  }
}

// outbox.ts
import { EventoDominio } from '../dominio/evento-dominio';
export async function publicarEnOutbox(eventos: EventoDominio[]) {
  for (const e of eventos) {
    await db().query(
      `INSERT INTO gestion.eventos_outbox(agregado, agregado_id, tipo_evento, payload, ocurrido_en)
       VALUES ($1,$2,$3,$4,$5)`,
      [e.agregado, e.agregadoId, e.tipo, JSON.stringify(e.payload), e.ocurridoEn]);
  }
}
```

### 6.4 Repositorio PostgreSQL (`modulos/solicitudes/infraestructura`)

```ts
// pg-solicitud.repositorio.ts
import { Injectable } from '@nestjs/common';
import { db, publicarEnOutbox } from '../../../compartido/infraestructura';
import { ConflictoConcurrencia } from '../../../compartido/dominio/errores';
import { Solicitud } from '../dominio/solicitud.agregado';
import { RepositorioSolicitudes } from '../dominio/solicitud.repositorio';

@Injectable()
export class PgSolicitudRepositorio implements RepositorioSolicitudes {
  async porId(id: string) {
    const { rows } = await db().query(
      `SELECT s.*, coalesce(json_agg(c ORDER BY c.orden) FILTER (WHERE c.id IS NOT NULL), '[]') AS criterios,
              coalesce((SELECT array_agg(tecnologia_id) FROM gestion.solicitud_tecnologias WHERE solicitud_id = s.id), '{}') AS tecnologias
         FROM gestion.solicitudes s
         LEFT JOIN gestion.criterios_aceptacion c ON c.solicitud_id = s.id AND NOT c.eliminado
        WHERE s.id = $1 AND NOT s.eliminado
        GROUP BY s.id`, [id]);
    if (!rows[0]) return null;
    const r = rows[0];
    return Solicitud.reconstituir(r.id, {
      codigo: r.codigo, titulo: r.titulo, descripcion: r.descripcion, objetivos: r.objetivos,
      justificacion: r.justificacion, tipo: r.tipo, prioridad: r.prioridad, estado: r.estado,
      solicitanteId: r.solicitante_id, departamentoId: r.departamento_id, proyectoId: r.proyecto_id,
      fechaDeseada: r.fecha_deseada, tecnologias: r.tecnologias,
      criterios: r.criterios.map((c: any) => ({ id: c.id, orden: c.orden, descripcion: c.descripcion, cumplido: c.cumplido })),
    }, r.version);
  }

  async guardar(s: Solicitud) {
    const d = s.datos;
    if (s.version === 0) {
      await db().query(
        `INSERT INTO gestion.solicitudes(id, titulo, descripcion, objetivos, justificacion, tipo, prioridad,
                                         estado, solicitante_id, departamento_id, proyecto_id, fecha_deseada)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [s.id, d.titulo, d.descripcion, d.objetivos, d.justificacion, d.tipo, d.prioridad,
         d.estado, d.solicitanteId, d.departamentoId, d.proyectoId ?? null, d.fechaDeseada ?? null]);
    } else {
      // Concurrencia optimista: solo actualiza si la versión no cambió
      const { rowCount } = await db().query(
        `UPDATE gestion.solicitudes
            SET titulo=$2, descripcion=$3, objetivos=$4, justificacion=$5, tipo=$6, prioridad=$7,
                estado=$8, fecha_deseada=$9
          WHERE id=$1 AND version=$10`,
        [s.id, d.titulo, d.descripcion, d.objetivos, d.justificacion, d.tipo, d.prioridad,
         d.estado, d.fechaDeseada ?? null, s.version]);
      if (rowCount === 0) throw new ConflictoConcurrencia('Solicitud', s.id);
    }
    await this.sincronizarCriterios(s);
    await publicarEnOutbox(s.extraerEventos());   // misma transacción ⇒ consistencia garantizada
  }

  private async sincronizarCriterios(s: Solicitud) {
    const ids = s.datos.criterios.map(c => c.id);
    await db().query(
      `UPDATE gestion.criterios_aceptacion SET eliminado = true
        WHERE solicitud_id = $1 AND NOT (id = ANY($2::uuid[])) AND NOT eliminado`, [s.id, ids]);
    for (const c of s.datos.criterios) {
      await db().query(
        `INSERT INTO gestion.criterios_aceptacion(id, solicitud_id, orden, descripcion, cumplido)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id) DO UPDATE SET orden=EXCLUDED.orden, descripcion=EXCLUDED.descripcion,
                                        cumplido=EXCLUDED.cumplido, eliminado=false`,
        [c.id, s.id, c.orden, c.descripcion, c.cumplido]);
    }
  }
}
```

### 6.5 Casos de uso (`modulos/solicitudes/aplicacion`)

```ts
// crear-solicitud.caso-uso.ts
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { v7 as uuidv7 } from 'uuid';
import { enTransaccion } from '../../../compartido/infraestructura';
import { Solicitud } from '../dominio/solicitud.agregado';
import { REPOSITORIO_SOLICITUDES, RepositorioSolicitudes } from '../dominio/solicitud.repositorio';
import { UsuarioActual } from '../../identidad/dominio/usuario-actual';

export const CrearSolicitudDto = z.object({
  id: z.string().uuid().optional(),               // offline: el cliente genera el UUID
  titulo: z.string().min(5).max(200),
  descripcion: z.string().min(1),
  objetivos: z.string().optional(),
  justificacion: z.string().optional(),
  tipo: z.enum(['FUNCIONAL','TECNICA','MEJORA','INCIDENTE','CAMBIO']),
  prioridad: z.enum(['BAJA','MEDIA','ALTA','CRITICA']),
  proyectoId: z.string().uuid().optional(),
  fechaDeseada: z.coerce.date().optional(),
  criterios: z.array(z.object({ id: z.string().uuid(), orden: z.number().int(), descripcion: z.string().min(1), cumplido: z.boolean().default(false) })).default([]),
  tecnologias: z.array(z.number().int()).default([]),
  enviar: z.boolean().default(false),             // crear y enviar en un paso
});
export type CrearSolicitudDto = z.infer<typeof CrearSolicitudDto>;

@Injectable()
export class CrearSolicitudCasoUso {
  constructor(@Inject(REPOSITORIO_SOLICITUDES) private readonly repo: RepositorioSolicitudes) {}

  async ejecutar(dto: CrearSolicitudDto, usuario: UsuarioActual) {
    return enTransaccion(usuario.id, async () => {
      const s = Solicitud.crear(dto.id ?? uuidv7(), {
        ...dto, solicitanteId: usuario.id, departamentoId: usuario.departamentoId,
      });
      if (dto.enviar) s.cambiarEstado('ENVIADA', usuario);
      await this.repo.guardar(s);
      return { id: s.id };
    });
  }
}

// cambiar-estado-solicitud.caso-uso.ts
@Injectable()
export class CambiarEstadoSolicitudCasoUso {
  constructor(@Inject(REPOSITORIO_SOLICITUDES) private readonly repo: RepositorioSolicitudes) {}

  async ejecutar(id: string, hacia: EstadoSolicitud, versionEsperada: number, usuario: UsuarioActual, comentario?: string) {
    return enTransaccion(usuario.id, async () => {
      await db().query(`SELECT set_config('app.comentario_estado', $1, true)`, [comentario ?? '']);
      const s = await this.repo.porId(id);
      if (!s) throw new ErrorDominio('NO_ENCONTRADA', 'Solicitud no encontrada');
      if (s.version !== versionEsperada) throw new ConflictoConcurrencia('Solicitud', id);
      s.cambiarEstado(hacia, usuario, comentario);
      await this.repo.guardar(s);
      return { id, estado: s.estado };
    });
  }
}
```

### 6.6 Caso de uso de Asignación (`modulos/asignacion/aplicacion`)

```ts
export const AsignarSolicitudDto = z.object({
  solicitudId: z.string().uuid(),
  version: z.number().int(),
  grupos: z.array(z.string().uuid()).default([]),
  ingenieros: z.array(z.object({ usuarioId: z.string().uuid(), rol: z.enum(['DESARROLLADOR','QA','REVISOR']), horasEstimadas: z.number().optional() })).min(1),
  comentario: z.string().max(2000).optional(),
});

@Injectable()
export class AsignarSolicitudCasoUso {
  constructor(@Inject(REPOSITORIO_SOLICITUDES) private readonly solicitudes: RepositorioSolicitudes) {}

  async ejecutar(dto: z.infer<typeof AsignarSolicitudDto>, lider: UsuarioActual) {
    return enTransaccion(lider.id, async () => {
      const s = await this.solicitudes.porId(dto.solicitudId);
      if (!s) throw new ErrorDominio('NO_ENCONTRADA', 'Solicitud no encontrada');
      if (s.version !== dto.version) throw new ConflictoConcurrencia('Solicitud', s.id);

      for (const g of dto.grupos)
        await db().query(`INSERT INTO gestion.asignaciones(solicitud_id, grupo_id, asignado_por, comentario)
                          VALUES ($1,$2,$3,$4)`, [s.id, g, lider.id, dto.comentario]);
      for (const i of dto.ingenieros)
        await db().query(`INSERT INTO gestion.asignaciones(solicitud_id, usuario_id, rol_en_solicitud, horas_estimadas, asignado_por, comentario)
                          VALUES ($1,$2,$3,$4,$5,$6)
                          ON CONFLICT (solicitud_id, usuario_id) WHERE activa AND usuario_id IS NOT NULL DO NOTHING`,
                         [s.id, i.usuarioId, i.rol, i.horasEstimadas ?? null, lider.id, dto.comentario]);

      s.cambiarEstado('ASIGNADA', lider, dto.comentario);
      await this.solicitudes.guardar(s);
      await publicarEnOutbox([{ tipo: 'solicitud.ingenieros_asignados', agregado: 'Solicitud', agregadoId: s.id,
        ocurridoEn: new Date(), payload: { ingenieros: dto.ingenieros.map(i => i.usuarioId), titulo: s.datos.titulo } }]);
      return { id: s.id };
    });
  }
}
```

### 6.7 Presentación: controlador y filtro de errores

```ts
// solicitudes.controller.ts
@Controller('solicitudes')
@UseGuards(JwtGuard, RolesGuard)
export class SolicitudesController {
  constructor(private crear: CrearSolicitudCasoUso, private cambiar: CambiarEstadoSolicitudCasoUso,
              private consultas: ConsultasSolicitudes) {}

  @Post()
  @Roles('SOLICITANTE','LIDER','DIRECTOR')
  async crearSolicitud(@Body(new ZodPipe(CrearSolicitudDto)) dto: CrearSolicitudDto, @Usuario() u: UsuarioActual) {
    return this.crear.ejecutar(dto, u);
  }

  @Get()
  listar(@Query() filtros: FiltrosSolicitudDto, @Usuario() u: UsuarioActual) {
    return this.consultas.tablero(filtros, u);      // lee v_tablero_solicitudes (CQRS ligero)
  }

  @Get(':id')
  detalle(@Param('id', ParseUUIDPipe) id: string, @Usuario() u: UsuarioActual) {
    return this.consultas.detalle(id, u);           // solicitud + criterios + historial + asignados + tareas
  }

  @Patch(':id/estado')
  cambiarEstado(@Param('id', ParseUUIDPipe) id: string,
                @Body(new ZodPipe(z.object({ hacia: z.enum(ESTADOS), version: z.number().int(), comentario: z.string().optional() }))) b,
                @Usuario() u: UsuarioActual) {
    return this.cambiar.ejecutar(id, b.hacia, b.version, u, b.comentario);
  }

  @Get('similares/buscar')
  similares(@Query('texto') texto: string) {
    return db().query(`SELECT * FROM gestion.fn_solicitudes_similares($1, 5)`, [texto]).then(r => r.rows);
  }
}

// filtro-errores-dominio.ts  → traduce errores de dominio a HTTP
@Catch(ErrorDominio)
export class FiltroErroresDominio implements ExceptionFilter {
  catch(e: ErrorDominio, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    const status = e instanceof ConflictoConcurrencia ? 409
      : e.codigo === 'SIN_PERMISO' ? 403 : e.codigo === 'NO_ENCONTRADA' ? 404 : 422;
    res.status(status).send({ codigo: e.codigo, mensaje: e.message });
  }
}
```

### 6.8 `main.ts`

```ts
async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ trustProxy: true }));
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new FiltroErroresDominio());
  app.enableCors({ origin: [process.env.WEB_URL!], credentials: true });
  await app.register(import('@fastify/helmet'));
  await app.register(import('@fastify/rate-limit'), { max: 300, timeWindow: '1 minute' });
  await app.register(import('@fastify/multipart'), { limits: { fileSize: 25 * 1024 * 1024 } });
  await app.listen(Number(process.env.API_PORT ?? 4000), '127.0.0.1');
}
bootstrap();
```

---

## 7. Autenticación y autorización OAuth 2.0 / OIDC

### 7.1 Flujo

```mermaid
sequenceDiagram
  participant U as Usuario
  participant W as Next.js (Auth.js)
  participant I as IdP OIDC (Google / Entra ID / Keycloak)
  participant A as API NestJS
  U->>W: Iniciar sesión
  W->>I: Authorization Code + PKCE (state, nonce)
  I-->>W: code
  W->>I: Intercambio code → id_token
  W->>A: POST /api/auth/intercambio { id_token }
  A->>I: Verifica firma con JWKS, iss, aud, exp
  A->>A: Upsert usuario + roles
  A-->>W: access_token (JWT RS256 15 min) + refresh_token (30 días, rotativo)
  W-->>U: Cookie de sesión cifrada (httpOnly)
  U->>A: Llamadas con Bearer access_token
```

**Opciones de IdP:**
- *Google Workspace* o *Microsoft Entra ID* si la empresa ya los usa (SSO inmediato).
- *Keycloak* autoalojado (Docker en el mismo VPS) si se requiere control total de usuarios y MFA propio.

### 7.2 Web — `apps/web/src/auth.ts` (Auth.js v5)

```ts
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';

const API = process.env.API_URL_INTERNA!; // http://127.0.0.1:4000/api

async function refrescar(token: any) {
  const r = await fetch(`${API}/auth/refrescar`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: token.refreshToken }),
  });
  if (!r.ok) return { ...token, error: 'RefreshInvalido' };
  const d = await r.json();
  return { ...token, accessToken: d.accessToken, refreshToken: d.refreshToken, expiraEn: d.expiraEn };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({ authorization: { params: { prompt: 'select_account' } } }),
    MicrosoftEntraID({ issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER }),
  ],
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: '/login' },
  callbacks: {
    async jwt({ token, account }) {
      if (account?.id_token) {                       // primer inicio de sesión
        const r = await fetch(`${API}/auth/intercambio`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ proveedor: account.provider, idToken: account.id_token }),
        });
        if (!r.ok) throw new Error('Usuario no autorizado');
        const d = await r.json();
        return { ...token, accessToken: d.accessToken, refreshToken: d.refreshToken,
                 expiraEn: d.expiraEn, usuario: d.usuario };
      }
      if (Date.now() < (token.expiraEn as number) - 60_000) return token;
      return refrescar(token);
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.usuario = token.usuario as any;        // { id, nombre, roles, departamentoId }
      session.error = token.error as string | undefined;
      return session;
    },
  },
});
```

`app/api/auth/[...nextauth]/route.ts`:

```ts
export { GET, POST } from '@/auth'.handlers;   // o: import { handlers } from '@/auth'; export const { GET, POST } = handlers;
```

Protección de rutas (archivo `middleware.ts`, o `proxy.ts` en Next 16):

```ts
export { auth as middleware } from '@/auth';
export const config = { matcher: ['/((?!login|api/auth|_next|sw.js|manifest.webmanifest|iconos).*)'] };
```

### 7.3 API — intercambio y verificación de tokens

```ts
// modulos/identidad/infraestructura/verificador-oidc.ts
import { createRemoteJWKSet, jwtVerify, SignJWT, importPKCS8, importSPKI } from 'jose';

const PROVEEDORES = {
  google: { iss: 'https://accounts.google.com', jwks: 'https://www.googleapis.com/oauth2/v3/certs', aud: process.env.AUTH_GOOGLE_ID! },
  'microsoft-entra-id': { iss: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER!, jwks: `${process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER}/discovery/v2.0/keys`, aud: process.env.AUTH_MICROSOFT_ENTRA_ID_ID! },
} as const;

export async function verificarIdToken(proveedor: keyof typeof PROVEEDORES, idToken: string) {
  const p = PROVEEDORES[proveedor];
  const { payload } = await jwtVerify(idToken, createRemoteJWKSet(new URL(p.jwks)), { issuer: p.iss, audience: p.aud });
  if (proveedor === 'google' && process.env.DOMINIO_PERMITIDO && payload.hd !== process.env.DOMINIO_PERMITIDO)
    throw new Error('Dominio de correo no autorizado');
  return { sub: payload.sub!, email: payload.email as string, nombre: payload.name as string, avatar: payload.picture as string };
}

// emisor-tokens.ts
const privada = await importPKCS8(process.env.JWT_CLAVE_PRIVADA!, 'RS256');
export const publica = await importSPKI(process.env.JWT_CLAVE_PUBLICA!, 'RS256');

export const emitirAccessToken = (u: { id: string; roles: string[]; departamentoId: string }) =>
  new SignJWT({ roles: u.roles, dep: u.departamentoId })
    .setProtectedHeader({ alg: 'RS256', kid: 'sierraflow-1' })
    .setSubject(u.id).setIssuer('https://proyectos.sierrainnova.tech').setAudience('sierraflow-api')
    .setIssuedAt().setExpirationTime('15m').sign(privada);
```

```ts
// Refresh token rotativo con detección de reutilización
async function rotarRefresh(tokenPlano: string) {
  const hash = createHash('sha256').update(tokenPlano).digest('hex');
  const { rows: [s] } = await db().query(`SELECT * FROM gestion.sesiones_refresh WHERE token_hash=$1`, [hash]);
  if (!s || s.expira_en < new Date()) throw new UnauthorizedException();
  if (s.revocado_en) {   // token ya usado ⇒ posible robo: revocar toda la familia
    await db().query(`UPDATE gestion.sesiones_refresh SET revocado_en=now() WHERE familia_id=$1 AND revocado_en IS NULL`, [s.familia_id]);
    throw new UnauthorizedException('Sesión comprometida');
  }
  const nuevo = randomBytes(48).toString('base64url');
  const { rows: [n] } = await db().query(
    `INSERT INTO gestion.sesiones_refresh(usuario_id, token_hash, familia_id, expira_en)
     VALUES ($1,$2,$3, now() + interval '30 days') RETURNING id`,
    [s.usuario_id, createHash('sha256').update(nuevo).digest('hex'), s.familia_id]);
  await db().query(`UPDATE gestion.sesiones_refresh SET revocado_en=now(), reemplazado_por=$2 WHERE id=$1`, [s.id, n.id]);
  return { usuarioId: s.usuario_id, refreshToken: nuevo };
}
```

```ts
// presentacion/jwt.guard.ts
@Injectable()
export class JwtGuard implements CanActivate {
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const token = req.headers.authorization?.replace(/^Bearer /, '') ?? req.query?.token; // SSE no admite headers
    if (!token) throw new UnauthorizedException();
    const { payload } = await jwtVerify(token, publica, { issuer: 'https://proyectos.sierrainnova.tech', audience: 'sierraflow-api' });
    req.usuario = { id: payload.sub, roles: payload.roles, departamentoId: payload.dep };
    return true;
  }
}
```

Generar el par de claves RS256:

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out jwt_privada.pem
openssl rsa -in jwt_privada.pem -pubout -out jwt_publica.pem
```

---

## 8. Offline-First (frontend + sincronización)

### 8.1 Principios

1. **La UI lee siempre de IndexedDB** (fuente local), nunca directamente de la red.
2. **Toda escritura** = cambio local optimista + operación en la **bandeja de salida** (outbox) con `idOperacion` (UUID v7) para idempotencia.
3. **Motor de sincronización**: `push` (envía operaciones pendientes) y `pull` (trae cambios desde el último `seq_cambio`).
4. **Conflictos**: concurrencia optimista por `version`. Si el servidor responde 409, se guarda el conflicto y se muestra al usuario para resolverlo (o se aplica *server-wins* en campos no editables).
5. **Service Worker**: precache del *app shell*, caché de catálogos (stale-while-revalidate) y Web Push.

### 8.2 Base local — `lib/offline/db.ts`

```ts
import Dexie, { Table } from 'dexie';

export interface SolicitudLocal {
  id: string; codigo?: string; titulo: string; descripcion: string; tipo: string; prioridad: string;
  estado: string; avancePct: number; departamento?: string; solicitanteId: string;
  version: number; seqCambio?: number; actualizadoEn: string;
  pendienteSync: 0 | 1;                       // 1 = tiene cambios locales sin confirmar
}
export interface OperacionPendiente {
  idOperacion: string; entidad: 'solicitud' | 'comentario' | 'tarea' | 'asignacion' | 'evaluacion';
  tipo: string;  // crear | editar | cambiar_estado | comentar ...
  entidadId: string; payload: unknown; versionBase?: number;
  creadoEn: number; intentos: number; error?: string;
}
export interface Conflicto { idOperacion: string; entidadId: string; local: unknown; servidor: unknown; fecha: number }

class BaseLocal extends Dexie {
  solicitudes!: Table<SolicitudLocal, string>;
  comentarios!: Table<any, string>;
  tareas!: Table<any, string>;
  notificaciones!: Table<any, string>;
  catalogos!: Table<{ clave: string; datos: unknown }, string>;
  bandejaSalida!: Table<OperacionPendiente, string>;
  conflictos!: Table<Conflicto, string>;
  meta!: Table<{ clave: string; valor: unknown }, string>;

  constructor() {
    super('sierraflow');
    this.version(1).stores({
      solicitudes:   'id, estado, solicitanteId, pendienteSync, actualizadoEn',
      comentarios:   'id, solicitudId, creadoEn',
      tareas:        'id, solicitudId, responsableId, estado',
      notificaciones:'id, leida, creadoEn',
      catalogos:     'clave',
      bandejaSalida: 'idOperacion, creadoEn, entidadId',
      conflictos:    'idOperacion, entidadId',
      meta:          'clave',
    });
  }
}
export const dbLocal = new BaseLocal();
```

### 8.3 Caso de uso offline — `modulos/solicitudes/aplicacion/crear-solicitud-offline.ts`

```ts
import { v7 as uuidv7 } from 'uuid';
import { dbLocal } from '@/lib/offline/db';
import { motorSync } from '@/lib/offline/motor-sync';

export async function crearSolicitudOffline(datos: NuevaSolicitudForm, usuario: { id: string }) {
  const id = uuidv7();
  await dbLocal.transaction('rw', dbLocal.solicitudes, dbLocal.bandejaSalida, async () => {
    await dbLocal.solicitudes.add({
      id, titulo: datos.titulo, descripcion: datos.descripcion, tipo: datos.tipo, prioridad: datos.prioridad,
      estado: datos.enviar ? 'ENVIADA' : 'BORRADOR', avancePct: 0, solicitanteId: usuario.id,
      version: 0, actualizadoEn: new Date().toISOString(), pendienteSync: 1,
    });
    await dbLocal.bandejaSalida.add({
      idOperacion: uuidv7(), entidad: 'solicitud', tipo: 'crear', entidadId: id,
      payload: { ...datos, id }, creadoEn: Date.now(), intentos: 0,
    });
  });
  motorSync.programar();          // intenta sincronizar si hay red
  return id;
}
```

### 8.4 Motor de sincronización — `lib/offline/motor-sync.ts`

```ts
import { dbLocal } from './db';
import { apiFetch } from '@/lib/api';

const LOTE = 50;

class MotorSync {
  private enCurso = false;
  private temporizador?: ReturnType<typeof setTimeout>;

  iniciar() {
    window.addEventListener('online', () => this.programar(0));
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && this.programar(0));
    setInterval(() => this.programar(0), 60_000);
    this.programar(0);
  }

  programar(retraso = 500) {
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => this.sincronizar(), retraso);
  }

  async sincronizar() {
    if (this.enCurso || !navigator.onLine) return;
    this.enCurso = true;
    try { await this.push(); await this.pull(); }
    catch (e) { console.warn('[sync]', e); this.programar(15_000); }
    finally { this.enCurso = false; }
  }

  private async push() {
    const ops = await dbLocal.bandejaSalida.orderBy('creadoEn').limit(LOTE).toArray();
    if (!ops.length) return;
    const dispositivoId = await obtenerDispositivoId();
    const { resultados } = await apiFetch('/sync/push', { method: 'POST', body: { dispositivoId, operaciones: ops } });

    for (const r of resultados as Array<{ idOperacion: string; estado: 'ok' | 'conflicto' | 'error'; entidad?: any; mensaje?: string }>) {
      const op = ops.find(o => o.idOperacion === r.idOperacion)!;
      if (r.estado === 'ok') {
        await dbLocal.transaction('rw', dbLocal.bandejaSalida, dbLocal.solicitudes, async () => {
          await dbLocal.bandejaSalida.delete(r.idOperacion);
          if (r.entidad && op.entidad === 'solicitud') await dbLocal.solicitudes.put({ ...r.entidad, pendienteSync: 0 });
        });
      } else if (r.estado === 'conflicto') {
        await dbLocal.conflictos.put({ idOperacion: op.idOperacion, entidadId: op.entidadId, local: op.payload, servidor: r.entidad, fecha: Date.now() });
        await dbLocal.bandejaSalida.delete(op.idOperacion);
      } else {
        await dbLocal.bandejaSalida.update(op.idOperacion, { intentos: op.intentos + 1, error: r.mensaje });
      }
    }
  }

  private async pull() {
    let cursor = ((await dbLocal.meta.get('cursor'))?.valor as number) ?? 0;
    for (;;) {
      const d = await apiFetch(`/sync/pull?desde=${cursor}&limite=500`);
      await dbLocal.transaction('rw', [dbLocal.solicitudes, dbLocal.comentarios, dbLocal.tareas, dbLocal.notificaciones, dbLocal.meta], async () => {
        for (const s of d.solicitudes) {
          const local = await dbLocal.solicitudes.get(s.id);
          if (local?.pendienteSync) continue;            // no pisar cambios locales aún no enviados
          s.eliminado ? await dbLocal.solicitudes.delete(s.id) : await dbLocal.solicitudes.put({ ...s, pendienteSync: 0 });
        }
        await dbLocal.comentarios.bulkPut(d.comentarios);
        await dbLocal.tareas.bulkPut(d.tareas);
        await dbLocal.notificaciones.bulkPut(d.notificaciones);
        await dbLocal.meta.put({ clave: 'cursor', valor: d.cursor });
      });
      cursor = d.cursor;
      if (!d.hayMas) break;
    }
  }
}
export const motorSync = new MotorSync();
```

Hook de lectura reactiva:

```ts
import { useLiveQuery } from 'dexie-react-hooks';
export const useMisSolicitudes = (usuarioId: string) =>
  useLiveQuery(() => dbLocal.solicitudes.where('solicitanteId').equals(usuarioId).reverse().sortBy('actualizadoEn'), [usuarioId]);
```

### 8.5 API de sincronización (`modulos/sincronizacion`)

```ts
@Controller('sync')
@UseGuards(JwtGuard)
export class SyncController {
  constructor(private despachador: DespachadorOperaciones) {}

  @Post('push')
  async push(@Body() body: { dispositivoId: string; operaciones: OperacionDto[] }, @Usuario() u: UsuarioActual) {
    const resultados = [];
    for (const op of body.operaciones) {
      // Idempotencia: si ya se procesó, devolver el mismo resultado
      const previa = await db().query(`SELECT resultado FROM gestion.sync_operaciones WHERE id_operacion=$1`, [op.idOperacion]);
      if (previa.rows[0]) { resultados.push(previa.rows[0].resultado); continue; }
      let resultado;
      try {
        const entidad = await this.despachador.ejecutar(op, u);   // enruta al caso de uso correspondiente
        resultado = { idOperacion: op.idOperacion, estado: 'ok', entidad };
      } catch (e) {
        resultado = e instanceof ConflictoConcurrencia
          ? { idOperacion: op.idOperacion, estado: 'conflicto', entidad: await this.despachador.estadoActual(op) }
          : { idOperacion: op.idOperacion, estado: 'error', mensaje: (e as Error).message };
      }
      if (resultado.estado !== 'error')
        await db().query(`INSERT INTO gestion.sync_operaciones(id_operacion, usuario_id, dispositivo_id, entidad, entidad_id, tipo, resultado)
                          VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
          [op.idOperacion, u.id, body.dispositivoId, op.entidad, op.entidadId, op.tipo, resultado]);
      resultados.push(resultado);
    }
    return { resultados };
  }

  @Get('pull')
  async pull(@Query('desde') desde = '0', @Query('limite') limite = '500', @Usuario() u: UsuarioActual) {
    const d = Number(desde), l = Math.min(Number(limite), 1000);
    // Solo lo que el usuario puede ver: sus solicitudes, las asignadas a él, o todas si es LIDER/DIRECTOR
    const verTodo = u.roles.some(r => ['LIDER','DIRECTOR','ADMIN'].includes(r));
    const { rows: solicitudes } = await db().query(
      `SELECT s.id, s.codigo, s.titulo, s.descripcion, s.tipo, s.prioridad, s.estado, s.avance_pct AS "avancePct",
              s.solicitante_id AS "solicitanteId", s.version, s.seq_cambio AS "seqCambio",
              s.actualizado_en AS "actualizadoEn", s.eliminado
         FROM gestion.solicitudes s
        WHERE s.seq_cambio > $1
          AND ($3 OR s.solicitante_id = $2 OR EXISTS (SELECT 1 FROM gestion.asignaciones a WHERE a.solicitud_id = s.id AND a.usuario_id = $2 AND a.activa))
        ORDER BY s.seq_cambio LIMIT $4`, [d, u.id, verTodo, l]);
    // ... mismas consultas para comentarios, tareas y notificaciones (WHERE seq_cambio > $1)
    const cursor = Math.max(d, ...solicitudes.map(s => Number(s.seqCambio)));
    return { solicitudes, comentarios: [], tareas: [], notificaciones: [], cursor, hayMas: solicitudes.length === l };
  }
}
```

> **Nota sobre el cursor:** si usas varias tablas, calcula el cursor como el **mínimo** de los máximos alcanzados por tabla cuando alguna llegó al límite, para no saltarte cambios.

### 8.6 Service Worker con Serwist

`next.config.ts`:

```ts
import withSerwistInit from '@serwist/next';
const withSerwist = withSerwistInit({ swSrc: 'src/app/sw.ts', swDest: 'public/sw.js', disable: process.env.NODE_ENV === 'development' });
export default withSerwist({ output: 'standalone', reactStrictMode: true });
```

`src/app/sw.ts`:

```ts
import { defaultCache } from '@serwist/next/worker';
import { Serwist, NetworkOnly, StaleWhileRevalidate } from 'serwist';
declare const self: ServiceWorkerGlobalScope & { __SW_MANIFEST: any };

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true, clientsClaim: true, navigationPreload: true,
  runtimeCaching: [
    { matcher: ({ url }) => url.pathname.startsWith('/api/catalogos'), handler: new StaleWhileRevalidate({ cacheName: 'catalogos' }) },
    { matcher: ({ url }) => url.pathname.startsWith('/api/'), handler: new NetworkOnly() }, // los datos van por Dexie
    ...defaultCache,
  ],
  fallbacks: { entries: [{ url: '/offline', matcher: ({ request }) => request.destination === 'document' }] },
});
serwist.addEventListeners();

// Web Push → notificación del sistema
self.addEventListener('push', (e) => {
  const d = e.data?.json() ?? {};
  e.waitUntil(self.registration.showNotification(d.titulo ?? 'SierraFlow', {
    body: d.mensaje, icon: '/iconos/icon-192.png', badge: '/iconos/badge.png', data: { enlace: d.enlace }, tag: d.id,
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.openWindow(e.notification.data?.enlace ?? '/dashboard'));
});
```

> Si usas Next 16 (Turbopack por defecto), compila con `next build --webpack` mientras uses `@serwist/next`, o usa la integración de Serwist para Turbopack si ya está disponible en tu versión.

`public/manifest.webmanifest`: nombre "SierraFlow", `display: "standalone"`, `start_url: "/dashboard"`, `theme_color: "#0B2530"`, iconos 192/512.

---

## 9. Alertas y notificaciones en tiempo real

### 9.1 Flujo

```
Caso de uso → eventos_outbox (misma TX) → pg_notify('eventos_dominio')
   → DespachadorOutbox (API, LISTEN) → ManejadorNotificaciones
        → INSERT notificaciones (in-app) → pg_notify('notificaciones_usuario') → SSE al navegador
        → Web Push (si el usuario lo tiene activo)
        → Email SMTP (eventos críticos o según preferencias)
```

### 9.2 Reglas de negocio de notificación

| Evento | Destinatarios | Canales por defecto |
|---|---|---|
| `solicitud.enviada` | Líderes del departamento TI / responsables | APP, PUSH, EMAIL |
| `solicitud.en_revision` | Solicitante | APP |
| `solicitud.aprobada` / `rechazada` | Solicitante | APP, PUSH, EMAIL |
| `solicitud.ingenieros_asignados` | Ingenieros asignados + solicitante | APP, PUSH, EMAIL |
| `solicitud.en_validacion` | Solicitante (debe validar) | APP, PUSH, EMAIL |
| `comentario.creado` (con @mención) | Mencionados + participantes | APP, PUSH |
| `sla.en_riesgo` (80 % del SLA) / `sla.vencido` | Líder + director | APP, PUSH, EMAIL |
| `evaluacion.registrada` | Ingenieros evaluados | APP |

### 9.3 Despachador del outbox (`modulos/notificaciones/infraestructura/despachador-outbox.ts`)

```ts
@Injectable()
export class DespachadorOutbox implements OnModuleInit {
  private cliente!: Client;
  constructor(private manejador: ManejadorNotificaciones) {}

  async onModuleInit() {
    this.cliente = new Client({ connectionString: process.env.DATABASE_URL });
    await this.cliente.connect();
    await this.cliente.query('LISTEN eventos_dominio');
    this.cliente.on('notification', () => this.procesarPendientes());
    setInterval(() => this.procesarPendientes(), 30_000);   // red de seguridad
    await this.procesarPendientes();
  }

  private procesando = false;
  async procesarPendientes() {
    if (this.procesando) return;
    this.procesando = true;
    try {
      for (;;) {
        const lote = await enTransaccion('00000000-0000-0000-0000-000000000000', async () => {
          const { rows } = await db().query(
            `SELECT * FROM gestion.eventos_outbox
              WHERE procesado_en IS NULL AND intentos < 5
              ORDER BY id LIMIT 20 FOR UPDATE SKIP LOCKED`);
          for (const ev of rows) {
            try {
              await this.manejador.manejar(ev);
              await db().query(`UPDATE gestion.eventos_outbox SET procesado_en=now() WHERE id=$1`, [ev.id]);
            } catch (e) {
              await db().query(`UPDATE gestion.eventos_outbox SET intentos=intentos+1, ultimo_error=$2 WHERE id=$1`, [ev.id, String(e)]);
            }
          }
          return rows.length;
        });
        if (lote < 20) break;
      }
    } finally { this.procesando = false; }
  }
}
```

### 9.4 Manejador de notificaciones

```ts
@Injectable()
export class ManejadorNotificaciones {
  constructor(private push: ServicioWebPush, private correo: ServicioCorreo) {}

  async manejar(ev: { tipo_evento: string; agregado_id: string; payload: any }) {
    const plantilla = PLANTILLAS[ev.tipo_evento];
    if (!plantilla) return;
    const destinatarios: string[] = await plantilla.destinatarios(ev);
    for (const usuarioId of destinatarios) {
      const { titulo, mensaje, severidad } = plantilla.texto(ev);
      const enlace = `/solicitudes/${ev.agregado_id}`;
      await db().query(
        `INSERT INTO gestion.notificaciones(usuario_id, tipo_evento, titulo, mensaje, enlace, datos, severidad)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`, [usuarioId, ev.tipo_evento, titulo, mensaje, enlace, ev.payload, severidad]);
      const canales = await this.canalesActivos(usuarioId, ev.tipo_evento, plantilla.canalesPorDefecto);
      if (canales.includes('PUSH'))  await this.push.enviarAUsuario(usuarioId, { titulo, mensaje, enlace });
      if (canales.includes('EMAIL')) await this.correo.enviarAUsuario(usuarioId, titulo, mensaje, enlace);
    }
  }
}

const PLANTILLAS: Record<string, Plantilla> = {
  'solicitud.aprobada': {
    canalesPorDefecto: ['APP','PUSH','EMAIL'],
    destinatarios: async (ev) => [ev.payload.solicitanteId],
    texto: (ev) => ({ titulo: 'Solicitud aprobada', severidad: 'EXITO',
                      mensaje: `Tu solicitud "${ev.payload.titulo}" fue aprobada.` }),
  },
  'solicitud.rechazada': {
    canalesPorDefecto: ['APP','PUSH','EMAIL'],
    destinatarios: async (ev) => [ev.payload.solicitanteId],
    texto: (ev) => ({ titulo: 'Solicitud rechazada', severidad: 'ALERTA',
                      mensaje: `"${ev.payload.titulo}" fue rechazada: ${ev.payload.comentario}` }),
  },
  // ... resto de eventos
};
```

### 9.5 Web Push (VAPID) y Email

```ts
// servicio-web-push.ts
import webpush from 'web-push';
webpush.setVapidDetails('mailto:soporte@sierrainnova.tech', process.env.VAPID_PUBLICA!, process.env.VAPID_PRIVADA!);

export class ServicioWebPush {
  async enviarAUsuario(usuarioId: string, datos: { titulo: string; mensaje: string; enlace: string }) {
    const { rows } = await db().query(`SELECT * FROM gestion.suscripciones_push WHERE usuario_id=$1`, [usuarioId]);
    await Promise.all(rows.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.clave_p256dh, auth: s.clave_auth } }, JSON.stringify(datos));
      } catch (e: any) {
        if (e.statusCode === 404 || e.statusCode === 410) await db().query(`DELETE FROM gestion.suscripciones_push WHERE id=$1`, [s.id]);
      }
    }));
  }
}
// Generar claves: npx web-push generate-vapid-keys
```

```ts
// servicio-correo.ts
const transporte = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: 587, secure: false,
  auth: { user: process.env.SMTP_USUARIO, pass: process.env.SMTP_CLAVE } });
export class ServicioCorreo {
  async enviarAUsuario(usuarioId: string, asunto: string, mensaje: string, enlace: string) {
    const { rows: [u] } = await db().query(`SELECT email, nombre_completo FROM gestion.usuarios WHERE id=$1`, [usuarioId]);
    await transporte.sendMail({ from: '"SierraFlow" <notificaciones@sierrainnova.tech>', to: u.email, subject: asunto,
      html: `<p>Hola ${u.nombre_completo},</p><p>${mensaje}</p><p><a href="${process.env.WEB_URL}${enlace}">Ver solicitud</a></p>` });
  }
}
```

### 9.6 SSE: canal en tiempo real

```ts
@Controller('eventos')
export class EventosController implements OnModuleInit {
  private flujo = new Subject<{ usuarioId: string; id: string }>();

  async onModuleInit() {
    const c = new Client({ connectionString: process.env.DATABASE_URL });
    await c.connect(); await c.query('LISTEN notificaciones_usuario');
    c.on('notification', (n) => this.flujo.next(JSON.parse(n.payload!)));
  }

  @Sse('stream')
  @UseGuards(JwtGuard)
  stream(@Usuario() u: UsuarioActual): Observable<MessageEvent> {
    return merge(
      this.flujo.pipe(filter(e => e.usuarioId === u.id), map(e => ({ type: 'notificacion', data: e }) as MessageEvent)),
      interval(25_000).pipe(map(() => ({ type: 'ping', data: '' }) as MessageEvent)),  // mantiene viva la conexión
    );
  }
}
```

### 9.7 Cliente: campana, toasts y suscripción push

```tsx
'use client';
export function useNotificacionesTiempoReal(token: string) {
  useEffect(() => {
    const es = new EventSource(`/api/eventos/stream?token=${encodeURIComponent(token)}`);
    es.addEventListener('notificacion', async () => {
      await motorSync.sincronizar();                       // trae la notificación y los cambios relacionados
      const ultima = await dbLocal.notificaciones.orderBy('creadoEn').last();
      if (ultima) toast(ultima.titulo, { description: ultima.mensaje, action: { label: 'Ver', onClick: () => location.assign(ultima.enlace) } });
    });
    return () => es.close();
  }, [token]);
}

export async function activarPush() {
  const reg = await navigator.serviceWorker.ready;
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') return;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLICA });
  await apiFetch('/notificaciones/suscripciones', { method: 'POST', body: sub.toJSON() });
}

export function Campana() {
  const noLeidas = useLiveQuery(() => dbLocal.notificaciones.where('leida').equals(0).count(), []) ?? 0;
  return (<button aria-label="Notificaciones" className="relative">
    <Bell className="size-5" />
    {noLeidas > 0 && <span className="absolute -top-1 -right-1 rounded-full bg-red-500 px-1.5 text-xs">{noLeidas}</span>}
  </button>);
}
```

> Guarda `leida` como `0/1` en IndexedDB (los booleanos no son indexables en Dexie).

---

## 10. Frontend Next.js — módulos y pantallas

### 10.1 Mapa de rutas ↔ mockups

| Ruta | Pantalla (mockup) | Roles |
|---|---|---|
| `/dashboard` | Gestión de Proyectos – Dashboard (barras por estado, carga por mes, KPIs) | Todos (contenido según rol) |
| `/solicitudes/nueva` | Creación de Solicitudes – asistente de 4 pasos con detección de duplicados | SOLICITANTE+ |
| `/mis-solicitudes` | Panel de seguimiento del usuario final (lista + estado + avance) | SOLICITANTE |
| `/solicitudes/[id]` | Detalle: cabecera estado/prioridad/tipo, línea de vida, criterios, actividad, comentarios, tareas | Todos con acceso |
| `/gestion/asignacion` | Asignación de grupo/ingenieros con carga de trabajo | LIDER, DIRECTOR |
| `/gestion/kanban` | Kanban por departamentos + asignación cross-departamento | LIDER, DIRECTOR |
| `/gestion/evaluacion/[id]` | Gestión y calificación del avance (barras por frente, criterios 1–5, nota global) | LIDER, DIRECTOR |
| `/proyectos` y `/proyectos/[id]` | PM Suite: Gantt, matriz de riesgos, deuda técnica, ROI | DIRECTOR |
| `/reportes` | Analítica: distribución por estado, tiempo promedio, carga por ingeniero, SLA | LIDER, DIRECTOR |

### 10.2 Layout y tema (estilo de los mockups: azul petróleo oscuro)

```css
/* app/globals.css – Tailwind 4 */
@import "tailwindcss";
@theme {
  --color-fondo: #0B1A22;
  --color-panel: #0F2530;
  --color-borde: #1E3A46;
  --color-primario: #14B8A6;      /* teal de los botones "Crear Nueva Solicitud" */
  --color-texto: #E2E8F0;
  --color-atenuado: #94A3B8;
}
body { @apply bg-fondo text-texto antialiased; }
```

```tsx
// app/(app)/layout.tsx
export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect('/login');
  return (
    <ProveedoresCliente session={session}>          {/* QueryClient, Toaster, inicia motorSync y SSE */}
      <div className="grid min-h-dvh grid-cols-[240px_1fr]">
        <BarraLateral roles={session.usuario.roles} />  {/* Dashboard, Proyectos, Mis Solicitudes, Configuración, Ayuda */}
        <div className="flex flex-col">
          <BarraSuperior usuario={session.usuario} />   {/* Buscar, indicador offline, campana, idioma, CTA */}
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </ProveedoresCliente>
  );
}
```

Indicador de conectividad (muestra pendientes de sincronizar):

```tsx
export function IndicadorConexion() {
  const [enLinea, setEnLinea] = useState(true);
  const pendientes = useLiveQuery(() => dbLocal.bandejaSalida.count(), []) ?? 0;
  useEffect(() => {
    const act = () => setEnLinea(navigator.onLine); act();
    addEventListener('online', act); addEventListener('offline', act);
    return () => { removeEventListener('online', act); removeEventListener('offline', act); };
  }, []);
  return (<span className={cn('rounded-full px-3 py-1 text-xs', enLinea ? 'bg-emerald-900/50 text-emerald-300' : 'bg-amber-900/50 text-amber-300')}>
    {enLinea ? (pendientes ? `Sincronizando ${pendientes}…` : 'En línea') : `Sin conexión · ${pendientes} pendientes`}
  </span>);
}
```

### 10.3 Asistente "Crear Nueva Solicitud" (4 pasos)

```tsx
'use client';
const esquema = z.object({
  titulo: z.string().min(5, 'Mínimo 5 caracteres'),
  descripcion: z.string().min(20, 'Describe el requerimiento con más detalle'),
  objetivos: z.string().optional(),
  justificacion: z.string().optional(),
  tipo: z.enum(['FUNCIONAL','TECNICA','MEJORA','INCIDENTE','CAMBIO']),
  prioridad: z.enum(['BAJA','MEDIA','ALTA','CRITICA']),
  fechaDeseada: z.string().optional(),
  tecnologias: z.array(z.number()).default([]),
  criterios: z.array(z.object({ id: z.string(), orden: z.number(), descripcion: z.string().min(3), cumplido: z.boolean() })).min(1, 'Agrega al menos un criterio'),
});
const PASOS = ['Información básica', 'Prioridad y detalle técnico', 'Criterios de aceptación', 'Revisión y envío'] as const;
const CAMPOS_POR_PASO = [['titulo','descripcion','tipo'], ['prioridad','fechaDeseada','tecnologias','justificacion'], ['criterios'], []] as const;

export function AsistenteNuevaSolicitud() {
  const [paso, setPaso] = useState(0);
  const { data: session } = useSession();
  const router = useRouter();
  const form = useForm<z.infer<typeof esquema>>({ resolver: zodResolver(esquema),
    defaultValues: { tipo: 'FUNCIONAL', prioridad: 'MEDIA', criterios: [], tecnologias: [] } });
  const titulo = form.watch('titulo');
  const similares = useSolicitudesSimilares(titulo);   // GET /api/solicitudes/similares/buscar (debounce 400 ms, solo en línea)

  // Autoguardado del borrador local (sobrevive a recargas y a la falta de red)
  useEffect(() => { const s = form.watch(v => dbLocal.meta.put({ clave: 'borrador-solicitud', valor: v })); return () => s.unsubscribe(); }, [form]);

  const siguiente = async () => { if (await form.trigger(CAMPOS_POR_PASO[paso] as any)) setPaso(p => p + 1); };
  const enviar = form.handleSubmit(async (v) => {
    const id = await crearSolicitudOffline({ ...v, enviar: true }, session!.usuario);
    await dbLocal.meta.delete('borrador-solicitud');
    toast.success(navigator.onLine ? 'Solicitud enviada' : 'Guardada sin conexión: se enviará al reconectar');
    router.push(`/solicitudes/${id}`);
  });

  return (
    <form onSubmit={enviar} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <section className="rounded-xl border border-borde bg-panel p-6">
        <Stepper pasos={PASOS} actual={paso} />
        {paso === 0 && <PasoInformacionBasica form={form} />}
        {paso === 1 && <PasoDetalleTecnico form={form} />}
        {paso === 2 && <PasoCriterios form={form} />}
        {paso === 3 && <PasoRevision valores={form.getValues()} />}
        <div className="mt-6 flex justify-end gap-2">
          {paso > 0 && <Button type="button" variant="ghost" onClick={() => setPaso(p => p - 1)}>Atrás</Button>}
          {paso < 3 ? <Button type="button" onClick={siguiente}>Siguiente</Button>
                    : <Button type="submit">Enviar solicitud</Button>}
        </div>
      </section>
      {similares?.length > 0 && (
        <aside className="rounded-xl border border-amber-700/50 bg-amber-950/30 p-4 text-sm">
          <p className="font-medium">Se detectaron solicitudes similares</p>
          {similares.map(s => <Link key={s.id} href={`/solicitudes/${s.id}`} className="block py-1">
            {s.codigo} · {s.titulo} ({Math.round(s.similitud * 100)} %)</Link>)}
        </aside>
      )}
    </form>
  );
}
```

### 10.4 Panel de seguimiento — línea de vida del estado

```tsx
const LINEA = ['BORRADOR','ENVIADA','EN_REVISION','APROBADA','ASIGNADA','EN_DESARROLLO','EN_VALIDACION','CERRADA'] as const;
const ETIQUETA: Record<string,string> = { BORRADOR:'Borrador', ENVIADA:'Enviada', EN_REVISION:'En revisión', APROBADA:'Aprobación',
  ASIGNADA:'Asignada', EN_DESARROLLO:'Desarrollo', EN_VALIDACION:'Validación', CERRADA:'Cerrada' };

export function LineaDeVida({ estado }: { estado: string }) {
  const actual = LINEA.indexOf(estado as any);
  if (['RECHAZADA','CANCELADA'].includes(estado))
    return <div className="rounded-lg bg-red-950/40 p-3 text-red-300">Solicitud {estado.toLowerCase()}</div>;
  return (
    <ol className="flex overflow-x-auto rounded-lg border border-borde">
      {LINEA.map((e, i) => (
        <li key={e} aria-current={i === actual ? 'step' : undefined}
            className={cn('flex-1 whitespace-nowrap px-4 py-2 text-center text-sm [clip-path:polygon(0_0,92%_0,100%_50%,92%_100%,0_100%,8%_50%)]',
              i < actual && 'bg-teal-800 text-teal-100', i === actual && 'bg-blue-600 font-semibold text-white',
              i > actual && 'bg-slate-800 text-slate-400')}>
          {ETIQUETA[e]}{i === actual && ' (Actual)'}
        </li>))}
    </ol>
  );
}
```

La página `/solicitudes/[id]` compone: `CabeceraSolicitud` (estado, prioridad, tipo, botones Aprobar/Rechazar según rol) → `LineaDeVida` → `DetallesSolicitud` (nombre, descripción, stack, justificación, criterios con checkbox, adjuntos) → columna derecha `ActividadReciente` (historial_estados), `HiloComentarios`, `TareasRelacionadas`.

### 10.5 Asignación y Kanban

- **Asignación:** lista de solicitudes `APROBADA` a la izquierda; al seleccionar, panel con grupos (checkbox Backend/Frontend/QA) e ingenieros desde `v_carga_ingenieros` mostrando barra de carga y tecnologías; comentario de asignación; botón *Confirmar asignación y actualizar estado* → `POST /api/asignaciones`.
- **Kanban:** columnas por estado (Por asignar, En análisis, En desarrollo, QA, Despliegue) agrupadas por departamento con su color; arrastrar con `@dnd-kit/core` dispara `cambiarEstadoOffline()` (la máquina de estados del dominio compartido en `packages/contratos` valida antes de mover la tarjeta).

### 10.6 Evaluación y calificación

- Barras de avance por frente (tareas por grupo) y **avance general** (= `avance_pct` ponderado de la BD).
- Tabla de criterios (1–5) desde `criterios_calificacion`; calificación individual por ingeniero.
- Al confirmar → `POST /api/evaluaciones`; la API llama al servicio Python `POST /analitica/evaluaciones/calcular` para obtener nota global y letra.

---

## 11. Servicio Python — Analítica, SLA y calificación

### 11.1 Estructura

```
services/analitica/app/
├── main.py            # FastAPI + scheduler
├── config.py          # pydantic-settings
├── db.py              # pool asyncpg
├── seguridad.py       # verificación JWT RS256 (misma clave pública de la API)
├── dominio/calificacion.py
├── rutas/kpis.py
├── rutas/evaluaciones.py
└── tareas/sla.py
```

### 11.2 Código

```python
# config.py
from pydantic_settings import BaseSettings
class Config(BaseSettings):
    database_url: str
    jwt_clave_publica: str
    jwt_emisor: str = "https://proyectos.sierrainnova.tech"
    jwt_audiencia: str = "sierraflow-api"
    class Config: env_file = ".env"
config = Config()

# db.py
import asyncpg
from .config import config
pool: asyncpg.Pool | None = None
async def iniciar_pool():
    global pool
    pool = await asyncpg.create_pool(config.database_url, min_size=2, max_size=10,
                                     server_settings={"search_path": "gestion,public"})

# seguridad.py
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from .config import config
bearer = HTTPBearer()
def usuario_actual(cred: HTTPAuthorizationCredentials = Depends(bearer)) -> dict:
    try:
        p = jwt.decode(cred.credentials, config.jwt_clave_publica, algorithms=["RS256"],
                       audience=config.jwt_audiencia, issuer=config.jwt_emisor)
        return {"id": p["sub"], "roles": p.get("roles", [])}
    except jwt.PyJWTError:
        raise HTTPException(401, "Token inválido")

def requiere_rol(*roles: str):
    def _v(u: dict = Depends(usuario_actual)):
        if not set(roles) & set(u["roles"]): raise HTTPException(403, "Sin permiso")
        return u
    return _v
```

```python
# dominio/calificacion.py  — lógica pura, testeable sin BD
from dataclasses import dataclass

@dataclass(frozen=True)
class PuntajeCriterio:
    codigo: str
    peso: float      # 0..1
    puntaje: int     # 1..5

def nota_global(puntajes: list[PuntajeCriterio]) -> float:
    """Promedio ponderado escalado a 0–10."""
    total_peso = sum(p.peso for p in puntajes)
    if total_peso == 0: return 0.0
    promedio_1a5 = sum(p.puntaje * p.peso for p in puntajes) / total_peso
    return round((promedio_1a5 - 1) / 4 * 10, 2)

def letra(nota: float) -> str:
    for umbral, l in [(9.5,"A+"),(9.0,"A"),(8.0,"B+"),(7.0,"B"),(6.0,"C")]:
        if nota >= umbral: return l
    return "D"
```

```python
# rutas/kpis.py
from fastapi import APIRouter, Depends
from .. import db
from ..seguridad import requiere_rol
router = APIRouter(prefix="/kpis", tags=["KPIs"])

@router.get("/departamentos")
async def por_departamento(_=Depends(requiere_rol("LIDER","DIRECTOR","ADMIN"))):
    filas = await db.pool.fetch("SELECT departamento, estado, total FROM v_kpi_departamento_estado")
    return [dict(f) for f in filas]

@router.get("/resumen")
async def resumen(_=Depends(requiere_rol("LIDER","DIRECTOR","ADMIN"))):
    f = await db.pool.fetchrow("""
      SELECT count(*) FILTER (WHERE NOT eliminado)                         AS total,
             count(*) FILTER (WHERE estado IN ('EN_DESARROLLO','ASIGNADA')) AS en_ejecucion,
             count(*) FILTER (WHERE prioridad IN ('ALTA','CRITICA') AND estado NOT IN ('CERRADA','CANCELADA','RECHAZADA')) AS prioritarias,
             round(avg(extract(epoch FROM fecha_cierre - fecha_envio)/3600)::numeric, 1) AS lead_time_horas
        FROM solicitudes""")
    return dict(f)

@router.get("/carga-mensual")
async def carga_mensual(_=Depends(requiere_rol("LIDER","DIRECTOR","ADMIN"))):
    filas = await db.pool.fetch("""
      SELECT to_char(date_trunc('month', creado_en), 'YYYY-MM') AS mes, count(*) AS solicitudes
        FROM solicitudes WHERE creado_en > now() - interval '12 months'
       GROUP BY 1 ORDER BY 1""")
    return [dict(f) for f in filas]

@router.get("/sla")
async def cumplimiento_sla(_=Depends(requiere_rol("LIDER","DIRECTOR","ADMIN"))):
    f = await db.pool.fetchrow("""
      SELECT round(100.0 * count(*) FILTER (WHERE fecha_aprobacion <= fecha_envio + make_interval(hours => sla_horas))
                   / nullif(count(*),0), 1) AS cumplimiento_pct
        FROM solicitudes WHERE fecha_aprobacion IS NOT NULL""")
    return dict(f)
```

```python
# rutas/evaluaciones.py
from pydantic import BaseModel, conint
from fastapi import APIRouter, Depends
from ..dominio.calificacion import PuntajeCriterio, nota_global, letra
router = APIRouter(prefix="/evaluaciones", tags=["Evaluación"])

class EntradaCalificacion(BaseModel):
    puntajes: dict[str, conint(ge=1, le=5)]   # {"CRITERIOS": 4, "PLAZOS": 3, ...}

@router.post("/calcular")
async def calcular(e: EntradaCalificacion, _=Depends(requiere_rol("LIDER","DIRECTOR"))):
    pesos = {r["codigo"]: float(r["peso"]) for r in await db.pool.fetch(
        "SELECT codigo, peso FROM criterios_calificacion WHERE activo")}
    lista = [PuntajeCriterio(c, pesos[c], p) for c, p in e.puntajes.items() if c in pesos]
    n = nota_global(lista)
    return {"calificacion_global": n, "calificacion_letra": letra(n)}
```

```python
# tareas/sla.py — alerta de SLA en riesgo / vencido cada 15 minutos
import json
from .. import db

CONSULTA = """
SELECT s.id, s.codigo, s.titulo, s.solicitante_id,
       extract(epoch FROM now() - s.fecha_envio) / 3600 / s.sla_horas AS consumo
  FROM solicitudes s
 WHERE s.estado IN ('ENVIADA','EN_REVISION') AND s.fecha_envio IS NOT NULL
   AND extract(epoch FROM now() - s.fecha_envio) / 3600 >= s.sla_horas * 0.8
   AND NOT EXISTS (SELECT 1 FROM eventos_outbox o
                    WHERE o.agregado_id = s.id
                      AND o.tipo_evento = CASE WHEN extract(epoch FROM now() - s.fecha_envio)/3600 >= s.sla_horas
                                               THEN 'sla.vencido' ELSE 'sla.en_riesgo' END)
"""

async def revisar_sla():
    async with db.pool.acquire() as c, c.transaction():
        for f in await c.fetch(CONSULTA):
            tipo = "sla.vencido" if f["consumo"] >= 1 else "sla.en_riesgo"
            await c.execute(
                "INSERT INTO eventos_outbox(agregado, agregado_id, tipo_evento, payload) VALUES ('Solicitud',$1,$2,$3)",
                f["id"], tipo, json.dumps({"codigo": f["codigo"], "titulo": f["titulo"],
                                            "consumo": round(float(f["consumo"]) * 100)}))
```

```python
# main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from . import db
from .rutas import kpis, evaluaciones
from .tareas.sla import revisar_sla

@asynccontextmanager
async def ciclo_vida(app: FastAPI):
    await db.iniciar_pool()
    planificador = AsyncIOScheduler(timezone="America/Bogota")
    planificador.add_job(revisar_sla, "interval", minutes=15, id="sla", max_instances=1)
    planificador.start()
    yield
    planificador.shutdown(); await db.pool.close()

app = FastAPI(title="SierraFlow Analítica", root_path="/analitica", lifespan=ciclo_vida)
app.include_router(kpis.router)
app.include_router(evaluaciones.router)

@app.get("/salud")
async def salud(): return {"estado": "ok"}
```

> El servicio Python inserta en `eventos_outbox`; el despachador de la API (sección 9.3) se encarga de crear las notificaciones. Así toda la lógica de notificación vive en un solo lugar.
> Usa **un solo worker** de Gunicorn (o mueve el scheduler a un servicio aparte) para que el job de SLA no se ejecute duplicado.

---

## 12. Pruebas y calidad

| Nivel | Herramienta | Qué probar |
|---|---|---|
| Dominio (unitarias) | Vitest / Jest · pytest | Máquina de estados, reglas del agregado `Solicitud`, `nota_global()` |
| Aplicación | Vitest con repos en memoria | Casos de uso: crear, asignar, cambiar estado, conflictos de versión |
| Integración BD | Testcontainers (PostgreSQL) | Triggers: transiciones inválidas, historial, avance ponderado, outbox |
| API | Supertest / httpx | Contratos HTTP, 401/403/409/422 |
| Offline | Vitest + `fake-indexeddb` | Bandeja de salida, idempotencia, pull por cursor |
| E2E | Playwright (modo offline con `context.setOffline(true)`) | Crear solicitud sin red → reconectar → aparece en el servidor |

Ejemplo de prueba de dominio:

```ts
describe('Solicitud', () => {
  const solicitante = { id: 'u1', roles: ['SOLICITANTE'] as Rol[] };
  const lider = { id: 'u2', roles: ['LIDER'] as Rol[] };
  const nueva = () => Solicitud.crear('s1', { titulo: 'Integración pagos', descripcion: 'x', tipo: 'FUNCIONAL',
    prioridad: 'ALTA', solicitanteId: 'u1', departamentoId: 'd1', criterios: [{ id: 'c1', orden: 1, descripcion: 'ok', cumplido: false }], tecnologias: [] });

  it('el solicitante no puede aprobar', () => {
    const s = nueva(); s.cambiarEstado('ENVIADA', solicitante); s.cambiarEstado('EN_REVISION', lider);
    expect(() => s.cambiarEstado('APROBADA', solicitante)).toThrow('Su rol no permite');
  });
  it('rechazar exige comentario', () => {
    const s = nueva(); s.cambiarEstado('ENVIADA', solicitante); s.cambiarEstado('EN_REVISION', lider);
    expect(() => s.cambiarEstado('RECHAZADA', lider)).toThrow('requiere un comentario');
  });
});
```

```python
def test_nota_global():
    from app.dominio.calificacion import PuntajeCriterio, nota_global, letra
    n = nota_global([PuntajeCriterio("A", .5, 5), PuntajeCriterio("B", .5, 4)])
    assert n == 8.75 and letra(n) == "B+"
```

---

## 13. Despliegue en el VPS Ubuntu (sierrainnova.tech)

### 13.1 Preparación del servidor

```bash
# Usuario de despliegue sin privilegios
sudo adduser --disabled-password --gecos "" sierraflow
sudo mkdir -p /opt/sierraflow /var/sierraflow/adjuntos /var/backups/sierraflow
sudo chown -R sierraflow:sierraflow /opt/sierraflow /var/sierraflow /var/backups/sierraflow

# Herramientas
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx python3-venv git ufw
sudo npm i -g pnpm pm2
node -v    # verificar >= 22
psql --version  # verificar >= 16

# Firewall
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
```

### 13.2 DNS

En el proveedor del dominio crea un registro **A**: `proyectos.sierrainnova.tech → IP_DEL_VPS` (y AAAA si hay IPv6).

### 13.3 Base de datos

```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE sierraflow_owner LOGIN PASSWORD 'CLAVE_OWNER_SEGURA';
CREATE DATABASE sierraflow OWNER sierraflow_owner ENCODING 'UTF8' LC_COLLATE 'es_CO.UTF-8' LC_CTYPE 'es_CO.UTF-8' TEMPLATE template0;
\c sierraflow
CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;   CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE SCHEMA gestion AUTHORIZATION sierraflow_owner;
SQL
# (si la locale es_CO no existe: sudo locale-gen es_CO.UTF-8, o usa C.UTF-8)

cd /home/swarm/proyectos/Apps_GestionProyectos
DATABASE_URL="postgres://sierraflow_owner:CLAVE_OWNER_SEGURA@127.0.0.1:5432/sierraflow" ./database/migrar.sh
sudo -u postgres psql -d sierraflow -f database/seguridad/roles_seguridad.sql
```

Asegura en `postgresql.conf` → `listen_addresses = 'localhost'` (la BD no debe exponerse a Internet).

### 13.4 Variables de entorno — `/opt/sierraflow/.env`

```dotenv
# --- Comunes ---
NODE_ENV=production
WEB_URL=https://proyectos.sierrainnova.tech
DATABASE_URL=postgres://sierraflow_app:CLAVE_APP@127.0.0.1:5432/sierraflow

# --- Web (Next.js / Auth.js) ---
AUTH_SECRET=<openssl rand -base64 32>
AUTH_URL=https://proyectos.sierrainnova.tech
AUTH_TRUST_HOST=true
AUTH_GOOGLE_ID=xxxx.apps.googleusercontent.com
AUTH_GOOGLE_SECRET=xxxx
AUTH_MICROSOFT_ENTRA_ID_ID=xxxx
AUTH_MICROSOFT_ENTRA_ID_SECRET=xxxx
AUTH_MICROSOFT_ENTRA_ID_ISSUER=https://login.microsoftonline.com/<TENANT_ID>/v2.0
API_URL_INTERNA=http://127.0.0.1:4000/api
NEXT_PUBLIC_API_URL=/api
NEXT_PUBLIC_VAPID_PUBLICA=<clave pública VAPID>
DOMINIO_PERMITIDO=sierrainnova.tech

# --- API ---
API_PORT=4000
JWT_CLAVE_PRIVADA="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
JWT_CLAVE_PUBLICA="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
VAPID_PUBLICA=...
VAPID_PRIVADA=...
SMTP_HOST=smtp.tu-proveedor.com
SMTP_USUARIO=notificaciones@sierrainnova.tech
SMTP_CLAVE=...
RUTA_ADJUNTOS=/var/sierraflow/adjuntos
```

```bash
chmod 600 /opt/sierraflow/.env
```

> **URIs de redirección OAuth** a registrar en Google Cloud / Entra ID:
> `https://proyectos.sierrainnova.tech/api/auth/callback/google` y `.../api/auth/callback/microsoft-entra-id`.
> Como Auth.js usa `/api/auth/*`, Nginx debe enviar **esa ruta a Next.js** y el resto de `/api/*` a NestJS (ver 13.6).

### 13.5 Build y procesos

```bash
sudo -iu sierraflow
cd /opt/sierraflow && git clone git@github.com:TU_ORG/sierraflow.git app && cd app
ln -sf /opt/sierraflow/.env apps/web/.env.production
ln -sf /opt/sierraflow/.env apps/api/.env
pnpm install --frozen-lockfile
pnpm turbo build

# Next.js standalone necesita sus estáticos al lado
cp -r apps/web/public apps/web/.next/standalone/apps/web/
cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/

# Python
cd services/analitica && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && cd -
```

`/home/swarm/proyectos/Apps_GestionProyectos/ecosystem.config.cjs`:

```js
module.exports = {
  apps: [
    { name: 'sierraflow-web', cwd: './apps/web/.next/standalone/apps/web', script: 'server.js',
      env: { PORT: 3000, HOSTNAME: '127.0.0.1', NODE_ENV: 'production' },
      node_args: '--env-file=/opt/sierraflow/.env', max_memory_restart: '600M' },
    { name: 'sierraflow-api', cwd: './apps/api', script: 'dist/main.js',
      node_args: '--env-file=/opt/sierraflow/.env', instances: 1, max_memory_restart: '500M' },
  ],
};
```

```bash
pm2 start ecosystem.config.cjs && pm2 save
exit
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u sierraflow --hp /home/sierraflow
```

> La API usa `instances: 1` porque contiene el `LISTEN` del outbox y SSE. Para escalar, separa el despachador en su propio proceso.

Servicio Python — `/etc/systemd/system/sierraflow-analitica.service`:

```ini
[Unit]
Description=SierraFlow Analitica (FastAPI)
After=network.target postgresql.service

[Service]
User=swarm
WorkingDirectory=/home/swarm/proyectos/Apps_GestionProyectos/services/analitica
EnvironmentFile=/opt/sierraflow/.env
Environment=JWT_CLAVE_PUBLICA_FILE=/opt/sierraflow/jwt_publica.pem
ExecStart=/home/swarm/proyectos/Apps_GestionProyectos/services/analitica/.venv/bin/gunicorn app.main:app \
  -k uvicorn.workers.UvicornWorker -w 1 -b 127.0.0.1:8000 --timeout 60
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now sierraflow-analitica
```

### 13.6 Nginx — `/etc/nginx/sites-available/sierraflow`

```nginx
upstream sf_web  { server 127.0.0.1:3000; keepalive 32; }
upstream sf_api  { server 127.0.0.1:4000; keepalive 32; }
upstream sf_py   { server 127.0.0.1:8000; }

server {
  listen 80;
  server_name proyectos.sierrainnova.tech;
  # Certbot añadirá aquí la redirección a HTTPS
  client_max_body_size 25m;

  add_header X-Content-Type-Options nosniff always;
  add_header X-Frame-Options DENY always;
  add_header Referrer-Policy strict-origin-when-cross-origin always;

  gzip on; gzip_types text/css application/javascript application/json image/svg+xml;

  # Auth.js (OAuth) → Next.js
  location /api/auth/ {
    proxy_pass http://sf_web;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }

  # SSE: sin buffer y con timeout largo
  location /api/eventos/ {
    proxy_pass http://sf_api;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 1h;
    proxy_set_header Host $host;
  }

  # API NestJS
  location /api/ {
    proxy_pass http://sf_api;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # Servicio Python
  location /analitica/ {
    proxy_pass http://sf_py/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # Service worker: nunca en caché
  location = /sw.js {
    proxy_pass http://sf_web;
    add_header Cache-Control "no-cache, no-store, must-revalidate";
  }

  # Estáticos con hash: caché larga
  location /_next/static/ {
    proxy_pass http://sf_web;
    add_header Cache-Control "public, max-age=31536000, immutable";
  }

  # Next.js
  location / {
    proxy_pass http://sf_web;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/sierraflow /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d proyectos.sierrainnova.tech --redirect -m admin@sierrainnova.tech --agree-tos
sudo systemctl status certbot.timer   # renovación automática
```

### 13.7 Copias de seguridad

`/opt/sierraflow/backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
FECHA=$(date +%Y%m%d_%H%M)
pg_dump -Fc -d sierraflow -f /var/backups/sierraflow/sierraflow_$FECHA.dump
tar -czf /var/backups/sierraflow/adjuntos_$FECHA.tar.gz -C /var/sierraflow adjuntos
find /var/backups/sierraflow -type f -mtime +14 -delete
```

```bash
sudo -u postgres crontab -e
# 0 2 * * * /opt/sierraflow/backup.sh >> /var/log/sierraflow-backup.log 2>&1
```

Restaurar: `pg_restore -d sierraflow --clean --if-exists archivo.dump`. Copia los respaldos fuera del VPS (rclone a S3/Drive).

### 13.8 Script de despliegue — `/opt/sierraflow/deploy.sh`

> En producción se usa `deploy/desplegar.sh` del repositorio: `cd ~/proyectos/Apps_GestionProyectos && sudo bash deploy/desplegar.sh` (ver `docs/Despliegue_VPS.md`). Este esquema queda como referencia.

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /home/swarm/proyectos/Apps_GestionProyectos
git fetch --all && git reset --hard origin/main
pnpm install --frozen-lockfile
DATABASE_URL="$(grep ^DATABASE_URL_OWNER= /opt/sierraflow/.env | cut -d= -f2-)" ./database/migrar.sh
pnpm turbo build
cp -r apps/web/public apps/web/.next/standalone/apps/web/
cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/
services/analitica/.venv/bin/pip install -q -r services/analitica/requirements.txt
pm2 reload ecosystem.config.cjs --update-env
sudo systemctl restart sierraflow-analitica
curl -fsS https://proyectos.sierrainnova.tech/api/salud && echo "✔ Despliegue OK"
```

(Agrega `DATABASE_URL_OWNER` al `.env` y permite al usuario `sierraflow` ejecutar sin clave solo `systemctl restart sierraflow-analitica` vía `sudoers`.)

### 13.9 Monitoreo

- `pm2 logs`, `pm2 monit`, `journalctl -u sierraflow-analitica -f`.
- `pm2 install pm2-logrotate`.
- Endpoints `/api/salud` y `/analitica/salud` vigilados con UptimeRobot / Uptime Kuma.
- Consulta de eventos atascados: `SELECT count(*) FROM gestion.eventos_outbox WHERE procesado_en IS NULL AND ocurrido_en < now() - interval '5 min';`

---

## 14. CI/CD con GitHub Actions

`.github/workflows/ci-cd.yml`:

```yaml
name: CI/CD SierraFlow
on:
  push: { branches: [main] }
  pull_request:

jobs:
  pruebas:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env: { POSTGRES_PASSWORD: prueba, POSTGRES_DB: sierraflow }
        ports: ["5432:5432"]
        options: --health-cmd pg_isready --health-interval 5s --health-retries 10
    env:
      DATABASE_URL: postgres://postgres:prueba@localhost:5432/sierraflow
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pnpm install --frozen-lockfile
      - run: ./database/migrar.sh
      - run: pnpm turbo lint test build
      - run: |
          cd services/analitica
          pip install -r requirements.txt pytest
          pytest -q

  desplegar:
    needs: pruebas
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: sierraflow
          key: ${{ secrets.VPS_SSH_KEY }}
          script: /opt/sierraflow/deploy.sh
```

---

## 15. Plan de trabajo por sprints y checklist

| Sprint (2 sem.) | Entregables |
|---|---|
| **0 – Fundaciones** | Monorepo, CI, scripts SQL 001–008 + semillas, VPS con Nginx/TLS, entorno staging |
| **1 – Identidad** | OAuth 2.0/OIDC (Google/Entra), intercambio de tokens, roles, layout base y tema |
| **2 – Solicitudes (M1)** | Agregado `Solicitud`, asistente de 4 pasos, adjuntos, detección de duplicados, *Mis solicitudes* |
| **3 – Offline-First (M9)** | Dexie, bandeja de salida, `/sync/push` y `/sync/pull`, Service Worker, indicador de conexión, conflictos |
| **4 – Seguimiento + Notificaciones (M3, M6)** | Detalle con línea de vida, historial, comentarios con @menciones, outbox, SSE, Web Push, email |
| **5 – Gestión y Asignación (M2)** | Revisión/aprobación, asignación por carga, Kanban por departamentos |
| **6 – Evaluación (M4) + Analítica (M7)** | Tareas y avance ponderado, calificación por criterios, servicio Python, dashboards, SLA |
| **7 – PM Suite (M5) + endurecimiento** | Proyectos, Gantt, riesgos, deuda técnica, ROI; pruebas E2E offline, rendimiento, seguridad, backups |

### Checklist de salida a producción

- [ ] Migraciones aplicadas y usuario `sierraflow_app` con mínimos privilegios
- [ ] PostgreSQL escuchando solo en `localhost`
- [ ] `.env` con permisos `600`, claves RS256 y VAPID generadas
- [ ] URIs de redirección OAuth registradas en el IdP
- [ ] TLS activo y renovación de Certbot verificada
- [ ] Service Worker sirviéndose sin caché (`/sw.js`)
- [ ] Prueba E2E: crear solicitud offline → reconectar → notificación al líder
- [ ] Job de SLA ejecutándose (revisar `eventos_outbox` con `sla.*`)
- [ ] Respaldo diario funcionando y probado con una restauración
- [ ] Monitoreo de `/api/salud` y alertas de caída

---

**Siguientes pasos sugeridos:** comenzar por el Sprint 0 ejecutando los scripts SQL de la sección 5 en un entorno local, y validar el flujo OAuth (sección 7) antes de construir pantallas, ya que todos los módulos dependen del usuario autenticado y sus roles.
