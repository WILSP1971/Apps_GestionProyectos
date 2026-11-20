-- =====================================================================
-- SierraFlow · 015 · Centro de trabajo del ingeniero
--   · Subtareas (checklist) de cada tarea.
--   · Bitácora de avances: cada registro guarda el cambio de % / estado, las horas de esa
--     sesión de trabajo, una nota y un enlace de evidencia (PR, rama, documento…).
--   · tareas.creado_por: el ingeniero ya puede proponer tareas en su solicitud o proyecto.
-- =====================================================================
SET search_path TO gestion, public;

ALTER TABLE tareas ADD COLUMN IF NOT EXISTS creado_por uuid REFERENCES usuarios(id);

CREATE TABLE IF NOT EXISTS tarea_subtareas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id        uuid NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  titulo          varchar(200) NOT NULL CHECK (length(btrim(titulo)) >= 2),
  completada      boolean NOT NULL DEFAULT false,
  orden           integer NOT NULL DEFAULT 0,
  completada_en   timestamptz,
  completada_por  uuid REFERENCES usuarios(id),
  creado_por      uuid REFERENCES usuarios(id),
  creado_en       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_subtareas_tarea ON tarea_subtareas(tarea_id, orden, creado_en);

CREATE TABLE IF NOT EXISTS tarea_avances (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id         uuid NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  usuario_id       uuid NOT NULL REFERENCES usuarios(id),
  tipo             varchar(20) NOT NULL DEFAULT 'AVANCE' CHECK (tipo IN ('AVANCE', 'CREACION', 'SUBTAREA')),
  avance_anterior  numeric(5,2),
  avance_nuevo     numeric(5,2),
  estado_anterior  estado_tarea,
  estado_nuevo     estado_tarea,
  horas            numeric(5,2) NOT NULL DEFAULT 0 CHECK (horas BETWEEN 0 AND 24),
  fecha_trabajo    date NOT NULL DEFAULT current_date,
  nota             text CHECK (length(nota) <= 4000),
  evidencia_url    varchar(500) CHECK (evidencia_url ~* '^https?://'),
  creado_en        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_avances_tarea   ON tarea_avances(tarea_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS ix_avances_usuario ON tarea_avances(usuario_id, fecha_trabajo DESC);

COMMENT ON TABLE tarea_avances IS 'Bitácora de avances por tarea (Registrar avances). horas = horas de esa sesión; se suman a tareas.horas_reales.';
COMMENT ON TABLE tarea_subtareas IS 'Checklist de cada tarea; el % sugerido = subtareas hechas / total.';
