import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  esquemaCambioTarea, esquemaEvaluacion, esquemaNuevaTarea, type CambioTarea, type NuevaEvaluacion, type NuevaTarea,
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

  @Post('solicitudes/:id/tareas')
  @Roles('LIDER', 'DIRECTOR')
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

  @Delete('tareas/:id')
  @HttpCode(204)
  @Roles('LIDER', 'DIRECTOR')
  async eliminarTarea(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('version', ParseIntPipe) version: number,
    @Usuario() u: UsuarioActual,
  ) {
    await this.tareas.eliminar(id, version, u);
  }
}
