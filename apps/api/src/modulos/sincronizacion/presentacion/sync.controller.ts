import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { esquemaPush, type PeticionPush } from '@sierraflow/contratos';
import { UsuarioActual } from '../../../compartido/dominio/usuario-actual';
import { Usuario } from '../../../compartido/presentacion/decoradores';
import { ZodPipe } from '../../../compartido/presentacion/zod.pipe';
import { JwtGuard } from '../../identidad/presentacion/jwt.guard';
import { ServicioSincronizacion } from '../aplicacion/servicio-sincronizacion';

const entero = (v: string | undefined, porDefecto: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : porDefecto;
};

@Controller('sync')
@UseGuards(JwtGuard)
export class SyncController {
  constructor(private readonly servicio: ServicioSincronizacion) {}

  /** Aplica en orden las operaciones pendientes del dispositivo. */
  @Post('push')
  @HttpCode(200)
  push(@Body(new ZodPipe(esquemaPush)) peticion: PeticionPush, @Usuario() u: UsuarioActual) {
    return this.servicio.push(peticion, u);
  }

  /** Cambios posteriores a los cursores: /sync/pull?solicitudes=0&comentarios=0&notificaciones=0&limite=200 */
  @Get('pull')
  pull(
    @Usuario() u: UsuarioActual,
    @Query('solicitudes') solicitudes?: string,
    @Query('comentarios') comentarios?: string,
    @Query('notificaciones') notificaciones?: string,
    @Query('limite') limite?: string,
  ) {
    return this.servicio.pull(
      { solicitudes: entero(solicitudes, 0), comentarios: entero(comentarios, 0), notificaciones: entero(notificaciones, 0) },
      Math.min(Math.max(entero(limite, 200), 1), 500),
      u,
    );
  }
}
