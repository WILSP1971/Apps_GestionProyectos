import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Rol, UsuarioActual } from '../dominio/usuario-actual';

export const CLAVE_ROLES = 'roles';
export const CLAVE_PUBLICO = 'publico';

/** Restringe un endpoint a uno o varios roles. */
export const Roles = (...roles: Rol[]) => SetMetadata(CLAVE_ROLES, roles);

/** Marca un endpoint como público (sin token). */
export const Publico = () => SetMetadata(CLAVE_PUBLICO, true);

/** Inyecta el usuario autenticado en el controlador. */
export const Usuario = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): UsuarioActual => ctx.switchToHttp().getRequest().usuario,
);
