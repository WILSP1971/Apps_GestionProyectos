-- =====================================================================
-- SierraFlow · 004 · Evaluación, calificación, riesgos y deuda técnica
-- =====================================================================
SET search_path TO gestion, public;

CREATE TABLE criterios_calificacion (
  id          smallserial PRIMARY KEY,
  codigo      varchar(40)  NOT NULL UNIQUE,
  nombre      varchar(120) NOT NULL,
  descripcion text,
  peso        numeric(4,2) NOT NULL CHECK (peso > 0),  -- los activos deben sumar 1.00
  activo      boolean NOT NULL DEFAULT true
);

CREATE TABLE evaluaciones (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id         uuid NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
  evaluador_id         uuid NOT NULL REFERENCES usuarios(id),
  tipo                 varchar(20) NOT NULL DEFAULT 'AVANCE' CHECK (tipo IN ('AVANCE','CIERRE')),
  avance_reportado     numeric(5,2) NOT NULL CHECK (avance_reportado BETWEEN 0 AND 100),
  calificacion_tecnica numeric(3,2) CHECK (calificacion_tecnica BETWEEN 1 AND 5),
  calificacion_plazos  numeric(3,2) CHECK (calificacion_plazos  BETWEEN 1 AND 5),
  calificacion_global  numeric(4,2) CHECK (calificacion_global  BETWEEN 0 AND 10),  -- 8.20 / 10
  calificacion_letra   varchar(2),                                                  -- A+, A, B+...
  comentario           text,
  fecha                timestamptz NOT NULL DEFAULT now(),
  seq_cambio           bigint  NOT NULL DEFAULT nextval('gestion.seq_sync'),
  eliminado            boolean NOT NULL DEFAULT false
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
  exposicion      smallint GENERATED ALWAYS AS (probabilidad * impacto) STORED,  -- 1..25
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
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id  uuid NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  descripcion  text NOT NULL,
  story_points smallint NOT NULL CHECK (story_points > 0),
  resuelta     boolean NOT NULL DEFAULT false,
  creado_en    timestamptz NOT NULL DEFAULT now()
);
