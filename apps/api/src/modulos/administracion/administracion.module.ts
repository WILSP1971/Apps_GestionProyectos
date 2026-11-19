import { Module } from '@nestjs/common';
import { IdentidadModule } from '../identidad/identidad.module';
import { RepositorioAdmin } from './infraestructura/repositorio-admin';
import { AdminController } from './presentacion/admin.controller';

/** Administración de usuarios y equipos (rol ADMIN). */
@Module({
  imports: [IdentidadModule],
  controllers: [AdminController],
  providers: [RepositorioAdmin],
})
export class AdministracionModule {}
