-- =====================================================================
-- SierraFlow · 019 · Nueva solicitud: tipos, aplicaciones y adjuntos
--   1. Tipos de requerimiento: Nuevo, Normativo, Mejora, Incidente.
--        FUNCIONAL → NUEVO (se renombra: los datos y la regla 1 lo siguen).
--        TECNICA y CAMBIO → MEJORA, y quedan prohibidos (PostgreSQL no permite quitar valores de un enum).
--   2. Catálogo de aplicaciones de software, asignadas a uno o varios tipos de requerimiento, con
--      sus tecnologías (la solicitud las hereda para recomendar ingenieros).
--   3. Adjuntos (imagen, PDF, documentos, código) de solicitudes y de evidencias de avance.
-- =====================================================================
SET search_path TO gestion, public;

-- 1 ── Tipos ------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
              WHERE t.typname = 'tipo_solicitud' AND e.enumlabel = 'FUNCIONAL') THEN
    ALTER TYPE tipo_solicitud RENAME VALUE 'FUNCIONAL' TO 'NUEVO';
  END IF;
END $$;
-- (PostgreSQL ≥ 12 permite ADD VALUE en la transacción; el valor no se usa en este archivo)
ALTER TYPE tipo_solicitud ADD VALUE IF NOT EXISTS 'NORMATIVO' AFTER 'NUEVO';

UPDATE solicitudes SET tipo = 'MEJORA' WHERE tipo::text IN ('TECNICA', 'CAMBIO');
ALTER TABLE solicitudes DROP CONSTRAINT IF EXISTS ck_solicitudes_tipo_vigente;
ALTER TABLE solicitudes ADD CONSTRAINT ck_solicitudes_tipo_vigente CHECK (tipo::text NOT IN ('TECNICA', 'CAMBIO'));

-- 2 ── Aplicaciones -----------------------------------------------------
CREATE TABLE IF NOT EXISTS aplicaciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre          varchar(120) NOT NULL,
  descripcion     text CHECK (length(descripcion) <= 1000),
  activo          boolean NOT NULL DEFAULT true,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_aplicaciones_nombre ON aplicaciones(lower(nombre));

-- Tipos de requerimiento en los que aparece cada aplicación
CREATE TABLE IF NOT EXISTS aplicacion_tipos (
  aplicacion_id  uuid NOT NULL REFERENCES aplicaciones(id) ON DELETE CASCADE,
  tipo           tipo_solicitud NOT NULL,
  PRIMARY KEY (aplicacion_id, tipo)
);

CREATE TABLE IF NOT EXISTS aplicacion_tecnologias (
  aplicacion_id  uuid NOT NULL REFERENCES aplicaciones(id) ON DELETE CASCADE,
  tecnologia_id  smallint NOT NULL REFERENCES tecnologias(id),
  PRIMARY KEY (aplicacion_id, tecnologia_id)
);

ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS aplicacion_id uuid REFERENCES aplicaciones(id);
CREATE INDEX IF NOT EXISTS ix_solicitudes_aplicacion ON solicitudes(aplicacion_id);

-- 3 ── Adjuntos ---------------------------------------------------------
-- La tabla del diseño inicial (archivos en disco, migración 003) nunca se usó: se reemplaza.
-- Si por algún motivo tuviera filas, se conserva como adjuntos_legado.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'gestion' AND table_name = 'adjuntos' AND column_name = 'ruta_almacenamiento') THEN
    IF EXISTS (SELECT 1 FROM gestion.adjuntos) THEN
      ALTER TABLE gestion.adjuntos RENAME TO adjuntos_legado;
      ALTER INDEX IF EXISTS gestion.ix_adjuntos_solicitud RENAME TO ix_adjuntos_legado_solicitud;
    ELSE
      DROP TABLE gestion.adjuntos;
    END IF;
  END IF;
END $$;

-- El contenido se guarda en la base de datos: viaja en las copias de seguridad y respeta los permisos.
CREATE TABLE IF NOT EXISTS adjuntos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id  uuid REFERENCES solicitudes(id) ON DELETE CASCADE,
  tarea_id      uuid REFERENCES tareas(id) ON DELETE CASCADE,
  avance_id     uuid REFERENCES tarea_avances(id) ON DELETE CASCADE,
  nombre        varchar(200) NOT NULL CHECK (length(btrim(nombre)) >= 1),
  mime          varchar(120) NOT NULL,
  tamano        integer NOT NULL CHECK (tamano > 0 AND tamano <= 10485760),
  sha256        char(64) NOT NULL,
  contenido     bytea NOT NULL,
  subido_por    uuid NOT NULL REFERENCES usuarios(id),
  creado_en     timestamptz NOT NULL DEFAULT now(),
  eliminado     boolean NOT NULL DEFAULT false,
  CONSTRAINT ck_adjuntos_destino CHECK (num_nonnulls(solicitud_id, tarea_id) = 1),
  CONSTRAINT ck_adjuntos_avance CHECK (avance_id IS NULL OR tarea_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ix_adjuntos_solicitud ON adjuntos(solicitud_id) WHERE NOT eliminado;
CREATE INDEX IF NOT EXISTS ix_adjuntos_tarea     ON adjuntos(tarea_id) WHERE NOT eliminado;
CREATE INDEX IF NOT EXISTS ix_adjuntos_avance    ON adjuntos(avance_id) WHERE NOT eliminado;
-- El contenido ya viene comprimido (imágenes, PDF): no vale la pena que TOAST lo comprima otra vez
ALTER TABLE adjuntos ALTER COLUMN contenido SET STORAGE EXTERNAL;
