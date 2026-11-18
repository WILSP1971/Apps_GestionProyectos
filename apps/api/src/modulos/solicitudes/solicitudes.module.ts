import { Module } from '@nestjs/common';
import { IdentidadModule } from '../identidad/identidad.module';
import { CambiarEstadoSolicitudCasoUso } from './aplicacion/cambiar-estado.caso-uso';
import { ConsultasSolicitudes } from './aplicacion/consultas-solicitudes';
import { ComentarCasoUso } from './aplicacion/comentar.caso-uso';
import { CrearSolicitudCasoUso } from './aplicacion/crear-solicitud.caso-uso';
import { MarcarCriterioCasoUso } from './aplicacion/marcar-criterio.caso-uso';
import { REPOSITORIO_SOLICITUDES } from './dominio/solicitud.repositorio';
import { PgSolicitudRepositorio } from './infraestructura/pg-solicitud.repositorio';
import { SolicitudesController } from './presentacion/solicitudes.controller';

/** Bounded context M1: Solicitudes. */
@Module({
  imports: [IdentidadModule],
  controllers: [SolicitudesController],
  providers: [
    { provide: REPOSITORIO_SOLICITUDES, useClass: PgSolicitudRepositorio }, // puerto → adaptador
    CrearSolicitudCasoUso,
    CambiarEstadoSolicitudCasoUso,
    ConsultasSolicitudes,
    MarcarCriterioCasoUso,
    ComentarCasoUso,
  ],
  // La sincronización offline reutiliza los mismos casos de uso (una sola fuente de reglas)
  exports: [CrearSolicitudCasoUso, CambiarEstadoSolicitudCasoUso, MarcarCriterioCasoUso, ComentarCasoUso],
})
export class SolicitudesModule {}
