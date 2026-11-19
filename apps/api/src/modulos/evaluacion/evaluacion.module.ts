import { Module } from '@nestjs/common';
import { IdentidadModule } from '../identidad/identidad.module';
import { REPOSITORIO_SOLICITUDES } from '../solicitudes/dominio/solicitud.repositorio';
import { PgSolicitudRepositorio } from '../solicitudes/infraestructura/pg-solicitud.repositorio';
import { GestionarTareasCasoUso } from './aplicacion/gestionar-tareas.caso-uso';
import { RegistrarEvaluacionCasoUso } from './aplicacion/registrar-evaluacion.caso-uso';
import { ConsultasEvaluacion } from './infraestructura/consultas-evaluacion';
import { EvaluacionController } from './presentacion/evaluacion.controller';

/** Bounded context M4: Evaluación y Calificación. */
@Module({
  imports: [IdentidadModule],
  controllers: [EvaluacionController],
  providers: [
    { provide: REPOSITORIO_SOLICITUDES, useClass: PgSolicitudRepositorio },
    ConsultasEvaluacion,
    GestionarTareasCasoUso,
    RegistrarEvaluacionCasoUso,
  ],
})
export class EvaluacionModule {}
