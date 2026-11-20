-- =====================================================================
-- SierraFlow · 018 · Regla de roles: es SOLICITANTE todo correo que no está registrado como
-- ingeniero de desarrollo, líder técnico, director o administrador.
--   · A quien tiene un rol de equipo se le quita el de solicitante.
--   · A quien no tiene ningún rol se le asigna el de solicitante.
-- La API aplica la misma regla en cada inicio de sesión y al editar usuarios (normalizarRoles).
-- =====================================================================
SET search_path TO gestion, public;

DELETE FROM usuario_roles ur USING roles r
 WHERE ur.rol_id = r.id AND r.codigo = 'SOLICITANTE'
   AND EXISTS (SELECT 1 FROM usuario_roles ur2 JOIN roles r2 ON r2.id = ur2.rol_id
                WHERE ur2.usuario_id = ur.usuario_id AND r2.codigo IN ('INGENIERO', 'LIDER', 'DIRECTOR', 'ADMIN'));

INSERT INTO usuario_roles(usuario_id, rol_id)
SELECT u.id, r.id FROM usuarios u CROSS JOIN roles r
 WHERE r.codigo = 'SOLICITANTE' AND NOT u.eliminado
   AND NOT EXISTS (SELECT 1 FROM usuario_roles ur WHERE ur.usuario_id = u.id)
ON CONFLICT DO NOTHING;
