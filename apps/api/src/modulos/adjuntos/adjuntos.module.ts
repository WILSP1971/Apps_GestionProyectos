import { Module } from '@nestjs/common';
import { IdentidadModule } from '../identidad/identidad.module';
import { RepositorioAdjuntos } from './infraestructura/repositorio-adjuntos';
import { AdjuntosController } from './presentacion/adjuntos.controller';

/** Adjuntos de solicitudes y evidencias de avance (contenido guardado en PostgreSQL). */
@Module({
  imports: [IdentidadModule],
  controllers: [AdjuntosController],
  providers: [RepositorioAdjuntos],
})
export class AdjuntosModule {}
