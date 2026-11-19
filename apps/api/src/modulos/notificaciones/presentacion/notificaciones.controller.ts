import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  esquemaPreferencias, esquemaSuscripcionPush, GRUPOS_NOTIFICACION,
  type CambioPreferencias, type PreferenciaGrupo, type SuscripcionPush,
} from '@sierraflow/contratos';
import { UsuarioActual } from '../../../compartido/dominio/usuario-actual';
import { Usuario } from '../../../compartido/presentacion/decoradores';
import { ZodPipe } from '../../../compartido/presentacion/zod.pipe';
import { JwtGuard } from '../../identidad/presentacion/jwt.guard';
import { RepositorioNotificaciones } from '../infraestructura/repositorio-notificaciones';
import { ServicioCorreo } from '../infraestructura/servicio-correo';
import { ServicioWebPush } from '../infraestructura/servicio-web-push';

const esquemaEndpoint = z.object({ endpoint: z.string().url() });

@Controller('notificaciones')
@UseGuards(JwtGuard)
export class NotificacionesController {
  constructor(
    private readonly repo: RepositorioNotificaciones,
    private readonly push: ServicioWebPush,
    private readonly correo: ServicioCorreo,
  ) {}

  @Get()
  listar(@Usuario() u: UsuarioActual) {
    return this.repo.ultimas(u.id);
  }

  @Patch(':id/leida')
  @HttpCode(204)
  async leida(@Param('id', ParseUUIDPipe) id: string, @Usuario() u: UsuarioActual) {
    await this.repo.marcarLeida(id, u.id);
  }

  @Post('leer-todas')
  async leerTodas(@Usuario() u: UsuarioActual) {
    return { actualizadas: await this.repo.marcarTodasLeidas(u.id) };
  }

  /** Qué canales están disponibles en el servidor (para la pantalla de Configuración). */
  @Get('canales')
  canales() {
    return { app: true, push: this.push.disponible, email: this.correo.disponible, clavePublicaPush: this.push.clavePublica };
  }

  @Get('preferencias')
  async preferencias(@Usuario() u: UsuarioActual): Promise<PreferenciaGrupo[]> {
    const guardadas = await this.repo.todasLasPreferencias(u.id);
    const valor = (grupo: string, canal: 'EMAIL' | 'PUSH', porDefecto: boolean) =>
      guardadas.find((p) => p.grupo === grupo && p.canal === canal)?.activo ?? porDefecto;
    return GRUPOS_NOTIFICACION.map((g) => ({
      grupo: g.codigo, nombre: g.nombre, descripcion: g.descripcion,
      email: valor(g.codigo, 'EMAIL', g.porDefecto.EMAIL),
      push: valor(g.codigo, 'PUSH', g.porDefecto.PUSH),
    }));
  }

  @Put('preferencias')
  async guardarPreferencias(@Body(new ZodPipe(esquemaPreferencias)) cambios: CambioPreferencias, @Usuario() u: UsuarioActual) {
    for (const c of cambios) {
      await this.repo.guardarPreferencia(u.id, c.grupo, 'EMAIL', c.email);
      await this.repo.guardarPreferencia(u.id, c.grupo, 'PUSH', c.push);
    }
    return this.preferencias(u);
  }

  @Post('push/suscripciones')
  @HttpCode(204)
  async suscribir(@Body(new ZodPipe(esquemaSuscripcionPush)) s: SuscripcionPush, @Usuario() u: UsuarioActual, @Req() req: FastifyRequest) {
    await this.repo.guardarSuscripcion(u.id, s.endpoint, s.keys.p256dh, s.keys.auth, req.headers['user-agent']);
  }

  @Delete('push/suscripciones')
  @HttpCode(204)
  async desuscribir(@Body(new ZodPipe(esquemaEndpoint)) b: z.infer<typeof esquemaEndpoint>, @Usuario() u: UsuarioActual) {
    await this.repo.eliminarSuscripcion(b.endpoint, u.id);
  }

  /** Envía una notificación de prueba al propio usuario por todos los canales disponibles. */
  @Post('prueba')
  async prueba(@Usuario() u: UsuarioActual) {
    const titulo = 'Notificación de prueba';
    const mensaje = 'Si ves esto, las notificaciones de SierraFlow están funcionando.';
    const id = await this.repo.insertar({
      usuarioId: u.id, tipoEvento: 'prueba', titulo, mensaje, enlace: '/configuracion', severidad: 'EXITO',
    });
    const n = { id, titulo, mensaje, enlace: '/configuracion', severidad: 'EXITO' as const };
    const push = await this.push.enviar(u.id, n);
    let email: boolean | string = 'no configurado';
    if (this.correo.disponible) {
      const contacto = await this.repo.contacto(u.id);
      email = contacto ? await this.correo.enviarNotificacion(contacto, n).catch((e: Error) => `error: ${e.message}`) : 'sin correo';
    }
    return { app: true, push, email };
  }
}
