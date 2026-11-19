import { Module } from '@nestjs/common';
import { IdentidadModule } from '../identidad/identidad.module';
import { DespachadorOutbox } from './aplicacion/despachador-outbox';
import { ManejadorNotificaciones } from './aplicacion/manejador-notificaciones';
import { EscuchaPg } from './infraestructura/escucha-pg';
import { RepositorioNotificaciones } from './infraestructura/repositorio-notificaciones';
import { ServicioCorreo } from './infraestructura/servicio-correo';
import { ServicioWebPush } from './infraestructura/servicio-web-push';
import { EventosController } from './presentacion/eventos.controller';
import { NotificacionesController } from './presentacion/notificaciones.controller';

/** Bounded context M6: Notificaciones (in-app por SSE, Web Push y correo). */
@Module({
  imports: [IdentidadModule],
  controllers: [NotificacionesController, EventosController],
  providers: [EscuchaPg, RepositorioNotificaciones, ManejadorNotificaciones, DespachadorOutbox, ServicioWebPush, ServicioCorreo],
})
export class NotificacionesModule {}
