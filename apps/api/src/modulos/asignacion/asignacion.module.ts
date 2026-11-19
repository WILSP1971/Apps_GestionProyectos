import { Module } from '@nestjs/common';
import { IdentidadModule } from '../identidad/identidad.module';
import { REPOSITORIO_SOLICITUDES } from '../solicitudes/dominio/solicitud.repositorio';
import { PgSolicitudRepositorio } from '../solicitudes/infraestructura/pg-solicitud.repositorio';
import { AsignarSolicitudCasoUso } from './aplicacion/asignar-solicitud.caso-uso';
import { ConsultasAsignacion } from './infraestructura/consultas-asignacion';
import { AsignacionController } from './presentacion/asignacion.controller';

/** Bounded context M2: Gestión y Asignación. */
@Module({
  imports: [IdentidadModule],
  controllers: [AsignacionController],
  providers: [
    { provide: REPOSITORIO_SOLICITUDES, useClass: PgSolicitudRepositorio },
    AsignarSolicitudCasoUso,
    ConsultasAsignacion,
  ],
})
export class AsignacionModule {}
