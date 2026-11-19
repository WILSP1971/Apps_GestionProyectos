import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { esquemaAsignacion, type Asignacion } from '@sierraflow/contratos';
import { UsuarioActual } from '../../../compartido/dominio/usuario-actual';
import { Roles, Usuario } from '../../../compartido/presentacion/decoradores';
import { ZodPipe } from '../../../compartido/presentacion/zod.pipe';
import { JwtGuard } from '../../identidad/presentacion/jwt.guard';
import { RolesGuard } from '../../identidad/presentacion/roles.guard';
import { AsignarSolicitudCasoUso } from '../aplicacion/asignar-solicitud.caso-uso';
import { ConsultasAsignacion } from '../infraestructura/consultas-asignacion';

@Controller('asignacion')
@UseGuards(JwtGuard, RolesGuard)
@Roles('LIDER', 'DIRECTOR')
export class AsignacionController {
  constructor(
    private readonly consultas: ConsultasAsignacion,
    private readonly asignar: AsignarSolicitudCasoUso,
  ) {}

  /** Ingenieros activos con su carga de trabajo, grupos y tecnologías. */
  @Get('ingenieros')
  ingenieros() {
    return this.consultas.ingenieros();
  }

  @Get('grupos')
  grupos() {
    return this.consultas.grupos();
  }

  @Get('solicitudes/:id/equipo')
  equipo(@Param('id', ParseUUIDPipe) id: string) {
    return this.consultas.equipo(id);
  }

  /** Define el equipo completo (y pasa a ASIGNADA si estaba APROBADA). */
  @Put('solicitudes/:id')
  definirEquipo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(esquemaAsignacion)) dto: Asignacion,
    @Usuario() u: UsuarioActual,
  ) {
    return this.asignar.ejecutar(id, dto, u);
  }
}
