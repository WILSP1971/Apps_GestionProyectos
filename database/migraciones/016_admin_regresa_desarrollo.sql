-- =====================================================================
-- SierraFlow · 016 · El administrador (además del director, el líder y el solicitante)
-- puede regresar a EN_DESARROLLO una solicitud que está EN_VALIDACION, con un motivo.
-- Debe coincidir con MAQUINA_ESTADOS (packages/contratos y estado-solicitud.vo.ts).
-- =====================================================================
SET search_path TO gestion, public;

UPDATE transiciones_estado
   SET roles_permitidos = '{SOLICITANTE,LIDER,DIRECTOR,ADMIN}', requiere_comentario = true
 WHERE desde = 'EN_VALIDACION' AND hacia = 'EN_DESARROLLO';
