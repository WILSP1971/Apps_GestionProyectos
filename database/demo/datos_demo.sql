-- =====================================================================
-- SierraFlow · Datos de demostración (SOLO desarrollo / staging)
--   psql "$DATABASE_URL_OWNER" -f database/demo/datos_demo.sql
-- =====================================================================
SET search_path TO gestion, public;

INSERT INTO usuarios(id, email, nombre_completo, cargo, departamento_id, proveedor_oauth, sujeto_oauth)
SELECT v.id::uuid, v.email, v.nombre, v.cargo, d.id, 'demo', v.sub
  FROM (VALUES
    ('11111111-0000-4000-8000-000000000001','ana.gomez@sierrainnova.tech','Ana Gómez','Directora de Proyecto','TI','ana'),
    ('11111111-0000-4000-8000-000000000002','carlos.ruiz@sierrainnova.tech','Carlos Ruiz','Líder Backend','TI','carlos'),
    ('11111111-0000-4000-8000-000000000003','luis.f@sierrainnova.tech','Luis F.','Ingeniero Backend','TI','luis'),
    ('11111111-0000-4000-8000-000000000004','maria.t@sierrainnova.tech','María T.','Ingeniera Frontend','TI','maria'),
    ('11111111-0000-4000-8000-000000000005','andres.s@sierrainnova.tech','Andrés S.','Ingeniero Fullstack','TI','andres'),
    ('11111111-0000-4000-8000-000000000006','paula.finanzas@sierrainnova.tech','Paula Méndez','Analista Financiera','FIN','paula')
  ) AS v(id, email, nombre, cargo, dep, sub)
  JOIN departamentos d ON d.codigo = v.dep
ON CONFLICT (email) DO NOTHING;

INSERT INTO usuario_roles(usuario_id, rol_id)
SELECT u.id, r.id
  FROM (VALUES ('ana.gomez@sierrainnova.tech','DIRECTOR'), ('ana.gomez@sierrainnova.tech','LIDER'),
               ('carlos.ruiz@sierrainnova.tech','LIDER'),  ('luis.f@sierrainnova.tech','INGENIERO'),
               ('maria.t@sierrainnova.tech','INGENIERO'),  ('andres.s@sierrainnova.tech','INGENIERO'),
               ('paula.finanzas@sierrainnova.tech','SOLICITANTE')) v(email, rol)
  JOIN usuarios u ON u.email = v.email
  JOIN roles r    ON r.codigo = v.rol
ON CONFLICT DO NOTHING;

INSERT INTO grupo_miembros(grupo_id, usuario_id)
SELECT g.id, u.id
  FROM (VALUES ('Backend','luis.f@sierrainnova.tech'), ('Frontend','maria.t@sierrainnova.tech'),
               ('Backend','andres.s@sierrainnova.tech'), ('Frontend','andres.s@sierrainnova.tech')) v(grupo, email)
  JOIN grupos_trabajo g ON g.nombre = v.grupo
  JOIN usuarios u       ON u.email  = v.email
ON CONFLICT DO NOTHING;

INSERT INTO solicitudes(id, titulo, descripcion, objetivos, tipo, prioridad, estado, solicitante_id, departamento_id, fecha_deseada)
SELECT '22222222-0000-4000-8000-000000000234'::uuid,
       'Integración API Pagos Regionales (COP/USD)',
       'Implementar pasarela de pagos regionales.',
       'Aceptar pagos en COP y USD para Colombia y Perú.',
       'FUNCIONAL', 'ALTA', 'ENVIADA', u.id, u.departamento_id, current_date + 30
  FROM usuarios u WHERE u.email = 'paula.finanzas@sierrainnova.tech'
ON CONFLICT (id) DO NOTHING;

INSERT INTO criterios_aceptacion(solicitud_id, orden, descripcion) VALUES
 ('22222222-0000-4000-8000-000000000234', 1, 'Integración con API de MercadoPago'),
 ('22222222-0000-4000-8000-000000000234', 2, 'Validación de transacciones exitosas'),
 ('22222222-0000-4000-8000-000000000234', 3, 'Panel de reportes de cobro')
ON CONFLICT DO NOTHING;
