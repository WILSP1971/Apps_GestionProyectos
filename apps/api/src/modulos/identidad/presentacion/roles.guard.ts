import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Rol, UsuarioActual } from '../../../compartido/dominio/usuario-actual';
import { CLAVE_ROLES } from '../../../compartido/presentacion/decoradores';

/** Autorización por rol (RBAC). Se usa después de JwtGuard. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const requeridos = this.reflector.getAllAndOverride<Rol[]>(CLAVE_ROLES, [ctx.getHandler(), ctx.getClass()]);
    if (!requeridos?.length) return true;
    const usuario: UsuarioActual | undefined = ctx.switchToHttp().getRequest().usuario;
    if (usuario?.roles.includes('ADMIN') || requeridos.some((r) => usuario?.roles.includes(r))) return true;
    throw new ForbiddenException({ codigo: 'SIN_PERMISO', mensaje: 'Su rol no permite esta operación' });
  }
}
