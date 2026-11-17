import { Module } from '@nestjs/common';
import { IdentidadModule } from './modulos/identidad/identidad.module';
import { SaludController } from './modulos/salud/salud.controller';
import { SolicitudesModule } from './modulos/solicitudes/solicitudes.module';

/**
 * Módulos = Bounded Contexts. Se irán agregando por sprint:
 * asignacion, seguimiento, evaluacion, proyectos, notificaciones, sincronizacion.
 */
@Module({
  imports: [IdentidadModule, SolicitudesModule],
  controllers: [SaludController],
})
export class AppModule {}
