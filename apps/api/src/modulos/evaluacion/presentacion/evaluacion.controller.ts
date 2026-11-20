import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  esquemaCambioSubtarea, esquemaCambioTarea, esquemaEvaluacion, esquemaNuevaTarea, esquemaRegistroAvance, esquemaSubtarea,
  type CambioSubtarea, type CambioTarea, type NuevaEvaluacion, type NuevaSubtarea, type NuevaTarea, type RegistroAvanceNuevo,
} from '@sierraflow/contratos';
import { UsuarioActual } from '../../../compartido/dominio/usuario-actual';
import { Roles, Usuario } from '../../../compartido/presentacion/decoradores';
import { ZodPipe } from '../../../compartido/presentacion/zod.pipe';
import { JwtGuard } from '../../identidad/presentacion/jwt.guard';
import { RolesGuard } from '../../identidad/presentacion/roles.guard';
import { GestionarTareasCasoUso } from '../aplicacion/gestionar-tareas.caso-uso';
import { RegistrarEvaluacionCasoUso } from '../aplicacion/registrar-evaluacion.caso-uso';
import { ConsultasEvaluacion } from '../infraestructura/consultas-evaluacion';

/** M4 · Gestión y calificación del avance: tareas por frente y evaluaciones. */
@Controller('evaluacion')
@UseGuards(JwtGuard, RolesGuard)
export class EvaluacionController {
  constructor(
    private readonly consultas: ConsultasEvaluacion,
    private readonly tareas: GestionarTareasCasoUso,
    private readonly registrar: RegistrarEvaluacionCasoUso,
  ) {}

  @Get('solicitudes')
  @Roles('LIDER', 'DIRECTOR')
  listado() {
    return this.consultas.listado();
  }

  /** Avance, tareas, criterios e historial. El ingeniero del equipo también puede consultarlo. */
  @Get('solicitudes/:id')
  @Roles('LIDER', 'DIRECTOR', 'INGENIERO')
  contexto(@Param('id', ParseUUIDPipe) id: string, @Usuario() u: UsuarioActual) {
    return this.consultas.contexto(id, u);
  }

  @Post('solicitudes/:id/evaluaciones')
  @Roles('LIDER', 'DIRECTOR')
  evaluar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(esquemaEvaluacion)) dto: NuevaEvaluacion,
    @Usuario() u: UsuarioActual,
  ) {
    return this.registrar.ejecutar(id, dto, u);
  }

  /** Registrar avances: tareas de las que soy responsable (de solicitudes y de proyectos). */
  @Get('mis-tareas')
  @Roles('INGENIERO', 'LIDER', 'DIRECTOR')
  misTareas(@Usuario() u: UsuarioActual) {
    return this.consultas.misTareas(u.id);
  }

  /** Centro de trabajo: actividad reciente y horas de los últimos 14 días. */
  @Get('mi-actividad')
  @Roles('INGENIERO', 'LIDER', 'DIRECTOR')
  miActividad(@Usuario() u: UsuarioActual) {
    return this.consultas.miActividad(u.id);
  }

  /** Solicitudes y proyectos donde quien consulta puede crear tareas, y los frentes disponibles. */
  @Get('opciones-nueva-tarea')
  @Roles('INGENIERO', 'LIDER', 'DIRECTOR')
  opcionesNuevaTarea(@Usuario() u: UsuarioActual) {
    return this.consultas.opcionesNuevaTarea(u.id);
  }

  @Get('tareas/:id')
  @Roles('INGENIERO', 'LIDER', 'DIRECTOR')
  detalleTarea(@Param('id', ParseUUIDPipe) id: string, @Usuario() u: UsuarioActual) {
    return this.consultas.detalleTarea(id, u);
  }

  /** Registrar avance: % / estado + horas de la sesión + nota + evidencia, en la bitácora de la tarea. */
  @Post('tareas/:id/avances')
  @Roles('INGENIERO', 'LIDER', 'DIRECTOR')
  registrarAvance(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(esquemaRegistroAvance)) dto: RegistroAvanceNuevo,
    @Usuario() u: UsuarioActual,
  ) {
    return this.tareas.registrarAvance(id, dto, u);
  }

  @Post('tareas/:id/subtareas')
  @Roles('INGENIERO', 'LIDER', 'DIRECTOR')
  crearSubtarea(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(esquemaSubtarea)) dto: NuevaSubtarea,
    @Usuario() u: UsuarioActual,
  ) {
    return this.tareas.crearSubtarea(id, dto, u);
  }

  @Patch('subtareas/:id')
  @Roles('INGENIERO', 'LIDER', 'DIRECTOR')
  actualizarSubtarea(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(esquemaCambioSubtarea)) dto: CambioSubtarea,
    @Usuario() u: UsuarioActual,
  ) {
    return this.tareas.actualizarSubtarea(id, dto, u);
  }

  @Delete('subtareas/:id')
  @Roles('INGENIERO', 'LIDER', 'DIRECTOR')
  eliminarSubtarea(@Param('id', ParseUUIDPipe) id: string, @Usuario() u: UsuarioActual) {
    return this.tareas.eliminarSubtarea(id, u);
  }

  /** Regla 3: tarea propia de un proyecto (el ingeniero que participa en él también puede proponerla). */
  @Post('proyectos/:id/tareas')
  @Roles('LIDER', 'DIRECTOR', 'INGENIERO')
  crearTareaProyecto(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(esquemaNuevaTarea)) dto: NuevaTarea,
    @Usuario() u: UsuarioActual,
  ) {
    return this.tareas.crearEnProyecto(id, dto, u);
  }

  /** El ingeniero del equipo puede proponer tareas propias (quedan a su nombre). */
  @Post('solicitudes/:id/tareas')
  @Roles('LIDER', 'DIRECTOR', 'INGENIERO')
  crearTarea(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(esquemaNuevaTarea)) dto: NuevaTarea,
    @Usuario() u: UsuarioActual,
  ) {
    return this.tareas.crear(id, dto, u);
  }

  /** El líder cambia cualquier campo; el ingeniero, solo estado/avance/horas de sus tareas. */
  @Patch('tareas/:id')
  @Roles('LIDER', 'DIRECTOR', 'INGENIERO')
  actualizarTarea(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(esquemaCambioTarea)) dto: CambioTarea,
    @Usuario() u: UsuarioActual,
  ) {
    return this.tareas.actualizar(id, dto, u);
  }

  /** El ingeniero solo puede eliminar las tareas que propuso y que aún no tienen avance. */
  @Delete('tareas/:id')
  @HttpCode(204)
  @Roles('LIDER', 'DIRECTOR', 'INGENIERO')
  async eliminarTarea(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('version', ParseIntPipe) version: number,
    @Usuario() u: UsuarioActual,
  ) {
    await this.tareas.eliminar(id, version, u);
  }
}
