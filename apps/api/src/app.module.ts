import { Module } from '@nestjs/common';
import { AdministracionModule } from './modulos/administracion/administracion.module';
import { AsignacionModule } from './modulos/asignacion/asignacion.module';
import { EvaluacionModule } from './modulos/evaluacion/evaluacion.module';
import { ProyectosModule } from './modulos/proyectos/proyectos.module';
import { IdentidadModule } from './modulos/identidad/identidad.module';
import { SaludController } from './modulos/salud/salud.controller';
import { NotificacionesModule } from './modulos/notificaciones/notificaciones.module';
import { SincronizacionModule } from './modulos/sincronizacion/sincronizacion.module';
import { SolicitudesModule } from './modulos/solicitudes/solicitudes.module';

/**
 * Módulos = Bounded Contexts. Se irán agregando por sprint:
 * evaluacion y proyectos (Sprints 6 y 7).
 */
@Module({
  imports: [IdentidadModule, SolicitudesModule, SincronizacionModule, NotificacionesModule, AsignacionModule, AdministracionModule, EvaluacionModule, ProyectosModule],
  controllers: [SaludController],
})
export class AppModule {}
