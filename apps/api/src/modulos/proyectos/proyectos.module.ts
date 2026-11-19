import { Module } from '@nestjs/common';
import { IdentidadModule } from '../identidad/identidad.module';
import { RepositorioProyectos } from './infraestructura/repositorio-proyectos';
import { ProyectosController } from './presentacion/proyectos.controller';

/** Bounded context M5: Dirección de Proyectos (PM Suite). */
@Module({
  imports: [IdentidadModule],
  controllers: [ProyectosController],
  providers: [RepositorioProyectos],
})
export class ProyectosModule {}
