import { Module } from '@nestjs/common';
import { IdentidadModule } from '../identidad/identidad.module';
import { RepositorioAdmin } from './infraestructura/repositorio-admin';
import { RepositorioAplicaciones } from './infraestructura/repositorio-aplicaciones';
import { AdminController } from './presentacion/admin.controller';
import { CatalogosController } from './presentacion/catalogos.controller';

/** Administración de usuarios y equipos (rol ADMIN). */
@Module({
  imports: [IdentidadModule],
  controllers: [AdminController, CatalogosController],
  providers: [RepositorioAdmin, RepositorioAplicaciones],
})
export class AdministracionModule {}
