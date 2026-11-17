import { Module } from '@nestjs/common';
import { ServicioSesiones } from './aplicacion/servicio-sesiones';
import { RepositorioUsuarios } from './infraestructura/repositorio-usuarios';
import { VerificadorOidc } from './infraestructura/verificador-oidc';
import { AuthController } from './presentacion/auth.controller';
import { JwtGuard } from './presentacion/jwt.guard';
import { RolesGuard } from './presentacion/roles.guard';

/** Bounded context M8: Identidad y Acceso (OAuth 2.0 / OIDC). */
@Module({
  controllers: [AuthController],
  providers: [VerificadorOidc, RepositorioUsuarios, ServicioSesiones, JwtGuard, RolesGuard],
  exports: [JwtGuard, RolesGuard, RepositorioUsuarios],
})
export class IdentidadModule {}
