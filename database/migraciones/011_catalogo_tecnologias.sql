-- =====================================================================
-- SierraFlow · 011 · Catálogo de tecnologías
--   + .NET, HTML/CSS, JavaScript   − Stripe API, MercadoPago API
-- Las tecnologías retiradas se desactivan (no se borran) para no perder el stack
-- histórico de solicitudes que ya las usaban; dejan de ofrecerse en los formularios.
-- =====================================================================
SET search_path TO gestion, public;

ALTER TABLE tecnologias ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

INSERT INTO tecnologias(nombre, categoria) VALUES
 ('.NET', 'backend'), ('HTML/CSS', 'frontend'), ('JavaScript', 'frontend')
ON CONFLICT (nombre) DO UPDATE SET activo = true;

UPDATE tecnologias SET activo = false WHERE nombre IN ('Stripe API', 'MercadoPago API');

-- Dejan de contar como habilidad de los ingenieros (recomendación de asignación)
DELETE FROM usuario_tecnologias
 WHERE tecnologia_id IN (SELECT id FROM tecnologias WHERE NOT activo);
