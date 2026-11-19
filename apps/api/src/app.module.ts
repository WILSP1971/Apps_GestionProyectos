import { Module } from '@nestjs/common';
import { IdentidadModule } from './modulos/identidad/identidad.module';
import { SaludController } from './modulos/salud/salud.controller';
import { NotificacionesModule } from './modulos/notificaciones/notificaciones.module';
import { SincronizacionModule } from './modulos/sincronizacion/sincronizacion.module';
import { SolicitudesModule } from './modulos/solicitudes/solicitudes.module';

/**
 * Módulos = Bounded Contexts. Se irán agregando por sprint:
 * asignacion, seguimiento, evaluacion, proyectos.
 */
@Module({
  imports: [IdentidadModule, SolicitudesModule, SincronizacionModule, NotificacionesModule],
  controllers: [SaludController],
})
export class AppModule {}
