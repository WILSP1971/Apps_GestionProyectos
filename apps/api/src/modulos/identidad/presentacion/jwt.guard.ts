import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { jwtVerify } from 'jose';
import { UsuarioActual } from '../../../compartido/dominio/usuario-actual';
import { CLAVE_PUBLICO } from '../../../compartido/presentacion/decoradores';
import { AUDIENCIA, clavePublica, EMISOR } from '../infraestructura/claves-jwt';

/** Valida el access token (Bearer) emitido por la API y deja el usuario en request.usuario. */
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, [ctx.getHandler(), ctx.getClass()])) return true;

    const req = ctx.switchToHttp().getRequest();
    const cabecera: string | undefined = req.headers?.authorization;
    // EventSource (SSE) no permite cabeceras: se acepta ?token= solo como alternativa
    const token = cabecera?.startsWith('Bearer ') ? cabecera.slice(7) : req.query?.token;
    if (!token) throw new UnauthorizedException('Falta el token de acceso');

    try {
      const { payload } = await jwtVerify(token, await clavePublica(), { issuer: EMISOR(), audience: AUDIENCIA() });
      const usuario: UsuarioActual = {
        id: String(payload.sub),
        roles: (payload.roles as UsuarioActual['roles']) ?? [],
        departamentoId: (payload.dep as string | null) ?? null,
      };
      req.usuario = usuario;
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }
}
