-- =====================================================================
-- SierraFlow · 002 · Identidad y organización
-- =====================================================================
SET search_path TO gestion, public;

CREATE TABLE departamentos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo         varchar(20)  NOT NULL UNIQUE,
  nombre         varchar(120) NOT NULL,
  color_hex      char(7)      NOT NULL DEFAULT '#14B8A6',
  activo         boolean      NOT NULL DEFAULT true,
  creado_en      timestamptz  NOT NULL DEFAULT now(),
  actualizado_en timestamptz  NOT NULL DEFAULT now(),
  version        integer      NOT NULL DEFAULT 1,
  seq_cambio     bigint       NOT NULL DEFAULT nextval('gestion.seq_sync'),
  eliminado      boolean      NOT NULL DEFAULT false
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
  codigo      varchar(30) NOT NULL UNIQUE,   -- SOLICITANTE, INGENIERO, LIDER, DIRECTOR, ADMIN
  nombre      varchar(80) NOT NULL,
  descripcion text
);

CREATE TABLE usuario_roles (
  usuario_id  uuid     NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  rol_id      smallint NOT NULL REFERENCES roles(id),
  otorgado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, rol_id)
);

CREATE TABLE grupos_trabajo (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre         varchar(80) NOT NULL UNIQUE,   -- Backend, Frontend, QA, DevOps, Diseño
  descripcion    text,
  lider_id       uuid REFERENCES usuarios(id),
  activo         boolean NOT NULL DEFAULT true,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  version        integer NOT NULL DEFAULT 1,
  seq_cambio     bigint  NOT NULL DEFAULT nextval('gestion.seq_sync'),
  eliminado      boolean NOT NULL DEFAULT false
);

CREATE TABLE grupo_miembros (
  grupo_id               uuid NOT NULL REFERENCES grupos_trabajo(id) ON DELETE CASCADE,
  usuario_id             uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  capacidad_horas_semana numeric(5,2) NOT NULL DEFAULT 40 CHECK (capacidad_horas_semana > 0),
  desde                  date NOT NULL DEFAULT current_date,
  PRIMARY KEY (grupo_id, usuario_id)
);

CREATE TABLE tecnologias (
  id        smallserial PRIMARY KEY,
  nombre    varchar(60) NOT NULL UNIQUE,      -- Next.js, Node.js, Python/FastAPI, PostgreSQL...
  categoria varchar(40)                        -- frontend | backend | datos | integracion | infraestructura
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
