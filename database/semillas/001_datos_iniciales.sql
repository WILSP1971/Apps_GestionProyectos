-- =====================================================================
-- SierraFlow · Semilla 001 · Catálogos base (idempotente)
-- =====================================================================
SET search_path TO gestion, public;

INSERT INTO roles(codigo, nombre, descripcion) VALUES
 ('SOLICITANTE','Solicitante','Usuario final que crea y sigue solicitudes'),
 ('INGENIERO','Ingeniero de desarrollo','Ejecuta las tareas asignadas'),
 ('LIDER','Líder técnico','Revisa, aprueba y asigna solicitudes'),
 ('DIRECTOR','Director de proyecto','Gestiona proyectos, evalúa y califica'),
 ('ADMIN','Administrador','Configuración general del sistema')
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
 ('Diseño','Experiencia e interfaz de usuario (UX/UI)')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO tecnologias(nombre, categoria) VALUES
 ('Next.js','frontend'), ('React','frontend'), ('Node.js','backend'), ('NestJS','backend'),
 ('Python/FastAPI','backend'), ('PostgreSQL','datos'), ('Stripe API','integracion'),
 ('MercadoPago API','integracion'), ('Nginx','infraestructura')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO criterios_calificacion(codigo, nombre, peso) VALUES
 ('CRITERIOS','Cumplimiento de criterios de aceptación', 0.35),
 ('CODIGO_DOC','Código y documentación',                 0.20),
 ('PLAZOS','Cumplimiento de plazos',                     0.25),
 ('IMPACTO_PROD','Impacto en producción (estabilidad)',  0.20)
ON CONFLICT (codigo) DO NOTHING;

-- Debe coincidir con MAQUINA_ESTADOS (apps/api/.../estado-solicitud.vo.ts y packages/contratos)
INSERT INTO transiciones_estado(desde, hacia, roles_permitidos, requiere_comentario) VALUES
 ('BORRADOR','ENVIADA',            '{SOLICITANTE,LIDER,DIRECTOR}', false),
 ('BORRADOR','CANCELADA',          '{SOLICITANTE,ADMIN}',          false),
 ('ENVIADA','EN_REVISION',         '{LIDER,DIRECTOR}',             false),
 ('ENVIADA','CANCELADA',           '{SOLICITANTE,ADMIN}',          true),
 ('EN_REVISION','APROBADA',        '{LIDER,DIRECTOR}',             false),
 ('EN_REVISION','RECHAZADA',       '{LIDER,DIRECTOR}',             true),
 ('EN_REVISION','BORRADOR',        '{LIDER,DIRECTOR}',             true),
 ('APROBADA','ASIGNADA',           '{LIDER,DIRECTOR}',             false),
 ('ASIGNADA','EN_DESARROLLO',      '{INGENIERO,LIDER}',            false),
 ('EN_DESARROLLO','EN_VALIDACION', '{INGENIERO,LIDER}',            false),
 ('EN_VALIDACION','EN_DESARROLLO', '{SOLICITANTE,LIDER,DIRECTOR}', true),
 ('EN_VALIDACION','CERRADA',       '{SOLICITANTE,LIDER,DIRECTOR}', false)
ON CONFLICT DO NOTHING;
