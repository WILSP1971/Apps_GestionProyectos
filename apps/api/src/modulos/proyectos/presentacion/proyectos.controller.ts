import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import {
  esquemaCambioDeuda, esquemaCambioProyecto, esquemaCambioRiesgo, esquemaDeuda, esquemaNuevoProyecto, esquemaRiesgo, esquemaSolicitudesProyecto,
  type CambioDeuda, type CambioProyecto, type CambioRiesgo, type NuevaDeuda, type NuevoProyecto, type NuevoRiesgo, type SolicitudesProyecto, esquemaCambioEstadoProyecto, type CambioEstadoProyecto
} from '@sierraflow/contratos';
import { UsuarioActual } from '../../../compartido/dominio/usuario-actual';
import { enTransaccion } from '../../../compartido/infraestructura/base-datos';
import { Roles, Usuario } from '../../../compartido/presentacion/decoradores';
import { ZodPipe } from '../../../compartido/presentacion/zod.pipe';
import { JwtGuard } from '../../identidad/presentacion/jwt.guard';
import { RolesGuard } from '../../identidad/presentacion/roles.guard';
import { RepositorioProyectos } from '../infraestructura/repositorio-proyectos';

const esDirector = (u: UsuarioActual) => u.roles.includes('DIRECTOR') || u.roles.includes('ADMIN');

/**
 * M5 · PM Suite. Directores (y ADMIN) crean y editan proyectos, presupuesto y solicitudes asociadas.
 * Líderes técnicos consultan y registran riesgos y deuda técnica.
 */
@Controller('proyectos')
@UseGuards(JwtGuard, RolesGuard)
@Roles('DIRECTOR', 'LIDER')
export class ProyectosController {
  constructor(private readonly repo: RepositorioProyectos) {}

  @Get()
  listado() {
    return this.repo.listado();
  }

  /** Proyectos en los que participa quien consulta (menú del ingeniero). */
  @Get('mios')
  @Roles('INGENIERO', 'LIDER', 'DIRECTOR')
  mios(@Usuario() u: UsuarioActual) {
    return this.repo.mios(u.id);
  }

  @Get('catalogos')
  catalogos() {
    return this.repo.catalogos(null);
  }

  @Get(':id')
  detalle(@Param('id', ParseUUIDPipe) id: string, @Usuario() u: UsuarioActual) {
    return this.repo.detalle(id, esDirector(u));
  }

  @Post()
  @Roles('DIRECTOR')
  crear(@Body(new ZodPipe(esquemaNuevoProyecto)) dto: NuevoProyecto, @Usuario() u: UsuarioActual) {
    return enTransaccion(u.id, async () => this.repo.detalle(await this.repo.crear(dto, u.id), true));
  }

  /** Ciclo de vida: líder, director y administrador pueden regresar a desarrollo un proyecto en validación. */
  @Patch(':id/estado')
  @Roles('DIRECTOR', 'LIDER')
  cambiarEstado(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(esquemaCambioEstadoProyecto)) dto: CambioEstadoProyecto, @Usuario() u: UsuarioActual) {
    return enTransaccion(u.id, async () => {
      await this.repo.cambiarEstado(id, dto, u);
      return this.repo.detalle(id, esDirector(u));
    });
  }

  @Patch(':id')
  @Roles('DIRECTOR')
  actualizar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(esquemaCambioProyecto)) dto: CambioProyecto, @Usuario() u: UsuarioActual) {
    return enTransaccion(u.id, async () => {
      await this.repo.actualizar(id, dto);
      return this.repo.detalle(id, true);
    });
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('DIRECTOR')
  async eliminar(@Param('id', ParseUUIDPipe) id: string, @Usuario() u: UsuarioActual) {
    await enTransaccion(u.id, () => this.repo.eliminar(id));
  }

  /** Agrega o quita solicitudes del proyecto. */
  @Put(':id/solicitudes')
  @Roles('DIRECTOR')
  solicitudes(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(esquemaSolicitudesProyecto)) dto: SolicitudesProyecto, @Usuario() u: UsuarioActual) {
    return enTransaccion(u.id, async () => {
      await this.repo.detalle(id, true); // 404 si no existe
      await this.repo.vincular(id, dto.agregar, dto.quitar);
      return this.repo.detalle(id, true);
    });
  }

  // --- Riesgos ---------------------------------------------------------
  @Post(':id/riesgos')
  crearRiesgo(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(esquemaRiesgo)) dto: NuevoRiesgo, @Usuario() u: UsuarioActual) {
    return enTransaccion(u.id, async () => {
      await this.repo.detalle(id, false);
      await this.repo.validarSolicitudDelProyecto(id, dto.solicitudId);
      return this.repo.crearRiesgo(id, dto);
    });
  }

  @Patch('riesgos/:riesgoId')
  actualizarRiesgo(@Param('riesgoId', ParseUUIDPipe) riesgoId: string, @Body(new ZodPipe(esquemaCambioRiesgo)) dto: CambioRiesgo, @Usuario() u: UsuarioActual) {
    return enTransaccion(u.id, async () => {
      const proyectoId = await this.repo.proyectoDeRiesgo(riesgoId);
      await this.repo.validarSolicitudDelProyecto(proyectoId, dto.solicitudId);
      return this.repo.actualizarRiesgo(riesgoId, dto);
    });
  }

  @Delete('riesgos/:riesgoId')
  @HttpCode(204)
  async eliminarRiesgo(@Param('riesgoId', ParseUUIDPipe) riesgoId: string, @Usuario() u: UsuarioActual) {
    await enTransaccion(u.id, async () => {
      await this.repo.proyectoDeRiesgo(riesgoId);
      await this.repo.eliminarRiesgo(riesgoId);
    });
  }

  // --- Deuda técnica ---------------------------------------------------
  @Post(':id/deuda')
  crearDeuda(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(esquemaDeuda)) dto: NuevaDeuda, @Usuario() u: UsuarioActual) {
    return enTransaccion(u.id, async () => {
      await this.repo.detalle(id, false);
      await this.repo.validarSolicitudDelProyecto(id, dto.solicitudId);
      return this.repo.crearDeuda(id, dto, u.id);
    });
  }

  @Patch('deuda/:deudaId')
  actualizarDeuda(@Param('deudaId', ParseUUIDPipe) deudaId: string, @Body(new ZodPipe(esquemaCambioDeuda)) dto: CambioDeuda, @Usuario() u: UsuarioActual) {
    return enTransaccion(u.id, async () => {
      const proyectoId = await this.repo.proyectoDeDeuda(deudaId);
      await this.repo.validarSolicitudDelProyecto(proyectoId, dto.solicitudId);
      return this.repo.actualizarDeuda(deudaId, dto);
    });
  }

  @Delete('deuda/:deudaId')
  @HttpCode(204)
  async eliminarDeuda(@Param('deudaId', ParseUUIDPipe) deudaId: string, @Usuario() u: UsuarioActual) {
    await enTransaccion(u.id, async () => {
      await this.repo.proyectoDeDeuda(deudaId);
      await this.repo.eliminarDeuda(deudaId);
    });
  }
}
