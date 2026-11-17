-- =====================================================================
-- SierraFlow · 003 · Proyectos, solicitudes y su ciclo de vida
-- =====================================================================
SET search_path TO gestion, public;

CREATE TABLE proyectos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo             varchar(20) NOT NULL UNIQUE
                     DEFAULT 'PRY-' || lpad(nextval('gestion.seq_codigo_proyecto')::text, 4, '0'),
  nombre             varchar(160) NOT NULL,
  descripcion        text,
  departamento_id    uuid REFERENCES departamentos(id),
  director_id        uuid REFERENCES usuarios(id),
  estado             estado_proyecto NOT NULL DEFAULT 'PLANEACION',
  fecha_inicio       date,
  fecha_fin_plan     date,
  fecha_fin_real     date,
  presupuesto        numeric(16,2) CHECK (presupuesto >= 0),
  costo_real         numeric(16,2) NOT NULL DEFAULT 0,
  beneficio_esperado numeric(16,2),
  moneda             char(3) NOT NULL DEFAULT 'COP',
  creado_en          timestamptz NOT NULL DEFAULT now(),
  actualizado_en     timestamptz NOT NULL DEFAULT now(),
  version            integer NOT NULL DEFAULT 1,
  seq_cambio         bigint  NOT NULL DEFAULT nextval('gestion.seq_sync'),
  eliminado          boolean NOT NULL DEFAULT false,
  CONSTRAINT ck_proyecto_fechas CHECK (fecha_fin_plan IS NULL OR fecha_inicio IS NULL OR fecha_fin_plan >= fecha_inicio)
);

-- Agregado raíz principal
CREATE TABLE solicitudes (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- el cliente offline puede enviar su UUID
  codigo                  varchar(20) NOT NULL UNIQUE
                          DEFAULT 'SOL-' || lpad(nextval('gestion.seq_codigo_solicitud')::text, 6, '0'),
  titulo                  varchar(200) NOT NULL CHECK (length(trim(titulo)) >= 5),
  descripcion             text NOT NULL,
  objetivos               text,
  justificacion           text,
  tipo                    tipo_solicitud   NOT NULL DEFAULT 'FUNCIONAL',
  prioridad               prioridad        NOT NULL DEFAULT 'MEDIA',
  estado                  estado_solicitud NOT NULL DEFAULT 'BORRADOR',
  solicitante_id          uuid NOT NULL REFERENCES usuarios(id),
  departamento_id         uuid NOT NULL REFERENCES departamentos(id),
  proyecto_id             uuid REFERENCES proyectos(id),
  responsable_id          uuid REFERENCES usuarios(id),             -- líder que gestiona
  fecha_deseada           date,
  fecha_envio             timestamptz,
  fecha_aprobacion        timestamptz,
  fecha_inicio_desarrollo timestamptz,
  fecha_cierre            timestamptz,
  sla_horas               integer NOT NULL DEFAULT 72 CHECK (sla_horas > 0),
  story_points            smallint CHECK (story_points BETWEEN 0 AND 100),
  avance_pct              numeric(5,2) NOT NULL DEFAULT 0 CHECK (avance_pct BETWEEN 0 AND 100),
  motivo_rechazo          text,
  impacto_negocio         text,
  busqueda                tsvector GENERATED ALWAYS AS (
                            setweight(to_tsvector('spanish', coalesce(titulo,'')), 'A') ||
                            setweight(to_tsvector('spanish', coalesce(descripcion,'')), 'B')
                          ) STORED,
  creado_en               timestamptz NOT NULL DEFAULT now(),
  actualizado_en          timestamptz NOT NULL DEFAULT now(),
  version                 integer NOT NULL DEFAULT 1,                -- concurrencia optimista
  seq_cambio              bigint  NOT NULL DEFAULT nextval('gestion.seq_sync'),
  eliminado               boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_solicitudes_estado       ON solicitudes(estado) WHERE NOT eliminado;
CREATE INDEX ix_solicitudes_solicitante  ON solicitudes(solicitante_id);
CREATE INDEX ix_solicitudes_departamento ON solicitudes(departamento_id, estado);
CREATE INDEX ix_solicitudes_seq          ON solicitudes(seq_cambio);
CREATE INDEX ix_solicitudes_busqueda     ON solicitudes USING gin(busqueda);
CREATE INDEX ix_solicitudes_titulo_trgm  ON solicitudes USING gin(titulo gin_trgm_ops);

CREATE TABLE solicitud_tecnologias (
  solicitud_id  uuid     NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
  tecnologia_id smallint NOT NULL REFERENCES tecnologias(id),
  PRIMARY KEY (solicitud_id, tecnologia_id)
);

CREATE TABLE criterios_aceptacion (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id   uuid NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
  orden          smallint NOT NULL,
  descripcion    text NOT NULL,
  cumplido       boolean NOT NULL DEFAULT false,
  verificado_por uuid REFERENCES usuarios(id),
  verificado_en  timestamptz,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  version        integer NOT NULL DEFAULT 1,
  seq_cambio     bigint  NOT NULL DEFAULT nextval('gestion.seq_sync'),
  eliminado      boolean NOT NULL DEFAULT false
);
-- Orden único solo entre criterios vigentes (permite reordenar tras borrados lógicos)
CREATE UNIQUE INDEX uq_criterio_orden ON criterios_aceptacion(solicitud_id, orden) WHERE NOT eliminado;

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
CREATE INDEX ix_adjuntos_solicitud ON adjuntos(solicitud_id);

-- Catálogo de transiciones permitidas (defensa en profundidad de la máquina de estados del dominio)
CREATE TABLE transiciones_estado (
  desde               estado_solicitud NOT NULL,
  hacia               estado_solicitud NOT NULL,
  roles_permitidos    varchar(30)[] NOT NULL,
  requiere_comentario boolean NOT NULL DEFAULT false,
  PRIMARY KEY (desde, hacia)
);

CREATE TABLE historial_estados (
  id                       bigserial PRIMARY KEY,
  solicitud_id             uuid NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
  estado_anterior          estado_solicitud,
  estado_nuevo             estado_solicitud NOT NULL,
  usuario_id               uuid REFERENCES usuarios(id),
  comentario               text,
  fecha                    timestamptz NOT NULL DEFAULT now(),
  duracion_estado_anterior interval          -- tiempo en el estado previo (lead/cycle time)
);
CREATE INDEX ix_historial_solicitud ON historial_estados(solicitud_id, fecha);

CREATE TABLE asignaciones (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id     uuid NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
  grupo_id         uuid REFERENCES grupos_trabajo(id),
  usuario_id       uuid REFERENCES usuarios(id),          -- ingeniero de desarrollo
  rol_en_solicitud varchar(40) NOT NULL DEFAULT 'DESARROLLADOR'
                   CHECK (rol_en_solicitud IN ('DESARROLLADOR','QA','REVISOR')),
  horas_estimadas  numeric(6,2),
  asignado_por     uuid NOT NULL REFERENCES usuarios(id),
  comentario       text,
  activa           boolean NOT NULL DEFAULT true,
  fecha_asignacion timestamptz NOT NULL DEFAULT now(),
  fecha_liberacion timestamptz,
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  version          integer NOT NULL DEFAULT 1,
  seq_cambio       bigint  NOT NULL DEFAULT nextval('gestion.seq_sync'),
  eliminado        boolean NOT NULL DEFAULT false,
  CONSTRAINT ck_asignacion_destino CHECK (grupo_id IS NOT NULL OR usuario_id IS NOT NULL)
);
CREATE UNIQUE INDEX uq_asignacion_activa_usuario
  ON asignaciones(solicitud_id, usuario_id) WHERE activa AND usuario_id IS NOT NULL;
CREATE INDEX ix_asignaciones_usuario ON asignaciones(usuario_id) WHERE activa;

CREATE TABLE tareas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id    uuid NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
  titulo          varchar(200) NOT NULL,
  descripcion     text,
  grupo_id        uuid REFERENCES grupos_trabajo(id),
  responsable_id  uuid REFERENCES usuarios(id),
  estado          estado_tarea NOT NULL DEFAULT 'PENDIENTE',
  peso            smallint NOT NULL DEFAULT 1 CHECK (peso BETWEEN 1 AND 10),  -- ponderación del avance
  avance_pct      numeric(5,2) NOT NULL DEFAULT 0 CHECK (avance_pct BETWEEN 0 AND 100),
  horas_estimadas numeric(6,2),
  horas_reales    numeric(6,2) NOT NULL DEFAULT 0,
  fecha_inicio    date,
  fecha_fin_plan  date,
  fecha_fin_real  date,
  depende_de      uuid REFERENCES tareas(id),       -- dependencias para el Gantt
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  version         integer NOT NULL DEFAULT 1,
  seq_cambio      bigint  NOT NULL DEFAULT nextval('gestion.seq_sync'),
  eliminado       boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_tareas_solicitud   ON tareas(solicitud_id);
CREATE INDEX ix_tareas_responsable ON tareas(responsable_id, estado);

CREATE TABLE comentarios (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id   uuid NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
  autor_id       uuid NOT NULL REFERENCES usuarios(id),
  padre_id       uuid REFERENCES comentarios(id),   -- hilos de discusión
  contenido      text NOT NULL CHECK (length(contenido) BETWEEN 1 AND 10000),
  menciones      uuid[] NOT NULL DEFAULT '{}',      -- @usuarios mencionados → notificación
  editado        boolean NOT NULL DEFAULT false,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  version        integer NOT NULL DEFAULT 1,
  seq_cambio     bigint  NOT NULL DEFAULT nextval('gestion.seq_sync'),
  eliminado      boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_comentarios_solicitud ON comentarios(solicitud_id, creado_en);
