import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { esquemaCambioEstado, esquemaComentario, esquemaNuevaSolicitud } from '@sierraflow/contratos';
import { z } from 'zod';
import type { CambioEstado, NuevaSolicitud } from '@sierraflow/contratos';
import { UsuarioActual } from '../../../compartido/dominio/usuario-actual';
import { Roles, Usuario } from '../../../compartido/presentacion/decoradores';
import { ZodPipe } from '../../../compartido/presentacion/zod.pipe';
import { JwtGuard } from '../../identidad/presentacion/jwt.guard';
import { RolesGuard } from '../../identidad/presentacion/roles.guard';
import { CambiarEstadoSolicitudCasoUso } from '../aplicacion/cambiar-estado.caso-uso';
import { ConsultasSolicitudes } from '../aplicacion/consultas-solicitudes';
import { ComentarCasoUso } from '../aplicacion/comentar.caso-uso';
import { CrearSolicitudCasoUso } from '../aplicacion/crear-solicitud.caso-uso';
import { MarcarCriterioCasoUso } from '../aplicacion/marcar-criterio.caso-uso';

const esquemaCriterioCumplido = z.object({ cumplido: z.boolean(), version: z.number().int().min(1) });

@Controller('solicitudes')
@UseGuards(JwtGuard, RolesGuard)
export class SolicitudesController {
  constructor(
    private readonly crear: CrearSolicitudCasoUso,
    private readonly cambiarEstado: CambiarEstadoSolicitudCasoUso,
    private readonly consultas: ConsultasSolicitudes,
    private readonly marcarCriterio: MarcarCriterioCasoUso,
    private readonly comentar: ComentarCasoUso,
  ) {}

  @Post()
  @Roles('SOLICITANTE', 'LIDER', 'DIRECTOR')
  crearSolicitud(@Body(new ZodPipe(esquemaNuevaSolicitud)) dto: NuevaSolicitud, @Usuario() u: UsuarioActual) {
    return this.crear.ejecutar(dto, u);
  }

  @Get()
  listar(
    @Usuario() u: UsuarioActual,
    @Query('estado') estado?: string,
    @Query('texto') texto?: string,
    @Query('mias') mias?: string,
  ) {
    return this.consultas.tablero({ estado, texto, mias: mias === 'true' }, u);
  }

  // Debe declararse antes de ':id' para que no lo capture la ruta paramétrica
  @Get('similares')
  similares(@Query('texto') texto: string) {
    return this.consultas.similares(texto);
  }

  @Get(':id')
  detalle(@Param('id', ParseUUIDPipe) id: string, @Usuario() u: UsuarioActual) {
    return this.consultas.detalle(id, u);
  }

  @Patch(':id/estado')
  cambiar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(esquemaCambioEstado)) cambio: CambioEstado,
    @Usuario() u: UsuarioActual,
  ) {
    return this.cambiarEstado.ejecutar(id, cambio, u);
  }

  @Patch(':id/criterios/:criterioId')
  criterio(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('criterioId', ParseUUIDPipe) criterioId: string,
    @Body(new ZodPipe(esquemaCriterioCumplido)) b: z.infer<typeof esquemaCriterioCumplido>,
    @Usuario() u: UsuarioActual,
  ) {
    return this.marcarCriterio.ejecutar(id, { criterioId, cumplido: b.cumplido, version: b.version }, u);
  }

  @Post(':id/comentarios')
  comentario(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(esquemaComentario)) b: z.infer<typeof esquemaComentario>,
    @Usuario() u: UsuarioActual,
  ) {
    return this.comentar.ejecutar(id, b, u);
  }
}
