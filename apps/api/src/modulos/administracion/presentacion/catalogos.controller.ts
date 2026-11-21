import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../../identidad/presentacion/jwt.guard';
import { RepositorioAplicaciones } from '../infraestructura/repositorio-aplicaciones';

/** Catálogos de lectura para cualquier usuario con sesión (el asistente los guarda para usarlos sin conexión). */
@Controller('catalogos')
@UseGuards(JwtGuard)
export class CatalogosController {
  constructor(private readonly aplicaciones: RepositorioAplicaciones) {}

  /** Aplicaciones activas con los tipos de requerimiento a los que están asignadas. */
  @Get('aplicaciones')
  listarAplicaciones() {
    return this.aplicaciones.listar(true);
  }
}
