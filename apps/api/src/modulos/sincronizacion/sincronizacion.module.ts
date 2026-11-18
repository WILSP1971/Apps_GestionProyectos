import { Module } from '@nestjs/common';
import { IdentidadModule } from '../identidad/identidad.module';
import { SolicitudesModule } from '../solicitudes/solicitudes.module';
import { ServicioSincronizacion } from './aplicacion/servicio-sincronizacion';
import { LecturaSync } from './infraestructura/lectura-sync';
import { SyncController } from './presentacion/sync.controller';

/** Bounded context M9: Sincronización Offline-First (transversal). */
@Module({
  imports: [IdentidadModule, SolicitudesModule],
  controllers: [SyncController],
  providers: [ServicioSincronizacion, LecturaSync],
})
export class SincronizacionModule {}
