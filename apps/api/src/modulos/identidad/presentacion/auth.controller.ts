import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { UsuarioActual } from '../../../compartido/dominio/usuario-actual';
import { Publico, Usuario } from '../../../compartido/presentacion/decoradores';
import { ZodPipe } from '../../../compartido/presentacion/zod.pipe';
import { ServicioSesiones } from '../aplicacion/servicio-sesiones';
import { RepositorioUsuarios } from '../infraestructura/repositorio-usuarios';
import { JwtGuard } from './jwt.guard';

const esquemaIntercambio = z.object({
  proveedor: z.enum(['google', 'microsoft-entra-id']),
  idToken: z.string().min(20),
});
const esquemaRefresh = z.object({ refreshToken: z.string().min(20) });

@Controller('auth')
@UseGuards(JwtGuard)
export class AuthController {
  constructor(
    private readonly sesiones: ServicioSesiones,
    private readonly usuarios: RepositorioUsuarios,
  ) {}

  /** Llamado por Auth.js (servidor Next.js) tras el login OIDC. */
  @Post('intercambio')
  @Publico()
  intercambio(@Body(new ZodPipe(esquemaIntercambio)) b: z.infer<typeof esquemaIntercambio>, @Req() req: FastifyRequest) {
    return this.sesiones.intercambiar(b.proveedor, b.idToken, { ua: req.headers['user-agent'], ip: req.ip });
  }

  @Post('refrescar')
  @Publico()
  refrescar(@Body(new ZodPipe(esquemaRefresh)) b: z.infer<typeof esquemaRefresh>) {
    return this.sesiones.refrescar(b.refreshToken);
  }

  @Post('cerrar')
  @Publico()
  @HttpCode(204)
  async cerrar(@Body(new ZodPipe(esquemaRefresh)) b: z.infer<typeof esquemaRefresh>) {
    await this.sesiones.cerrar(b.refreshToken);
  }

  @Get('yo')
  yo(@Usuario() u: UsuarioActual) {
    return this.usuarios.porId(u.id);
  }
}
