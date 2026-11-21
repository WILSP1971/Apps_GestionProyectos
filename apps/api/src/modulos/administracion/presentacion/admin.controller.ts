import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import {
  esquemaAplicacion, esquemaCambioUsuario, esquemaNuevoUsuario, type CambioUsuario, type NuevaAplicacion, type NuevoUsuario,
} from '@sierraflow/contratos';
import { ErrorDominio, NoEncontrado } from '../../../compartido/dominio/errores';
import { UsuarioActual } from '../../../compartido/dominio/usuario-actual';
import { Roles, Usuario } from '../../../compartido/presentacion/decoradores';
import { ZodPipe } from '../../../compartido/presentacion/zod.pipe';
import { enTransaccion } from '../../../compartido/infraestructura/base-datos';
import { JwtGuard } from '../../identidad/presentacion/jwt.guard';
import { RolesGuard } from '../../identidad/presentacion/roles.guard';
import { RepositorioAdmin } from '../infraestructura/repositorio-admin';
import { RepositorioAplicaciones } from '../infraestructura/repositorio-aplicaciones';

/** Administración de usuarios: roles, departamento, grupos de trabajo, tecnologías y capacidad. */
@Controller('admin')
@UseGuards(JwtGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly repo: RepositorioAdmin, private readonly aplicaciones: RepositorioAplicaciones) {}

  // ---------------------------------------------------------------- catálogo de aplicaciones
  @Get('aplicaciones')
  listarAplicaciones() {
    return this.aplicaciones.listar(false);
  }

  @Post('aplicaciones')
  crearAplicacion(@Body(new ZodPipe(esquemaAplicacion)) dto: NuevaAplicacion, @Usuario() u: UsuarioActual) {
    return enTransaccion(u.id, () => this.aplicaciones.crear(dto));
  }

  @Patch('aplicaciones/:id')
  actualizarAplicacion(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(esquemaAplicacion)) dto: NuevaAplicacion, @Usuario() u: UsuarioActual) {
    return enTransaccion(u.id, () => this.aplicaciones.actualizar(id, dto));
  }

  @Get('catalogos')
  catalogos() {
    return this.repo.catalogos();
  }

  @Get('usuarios')
  usuarios() {
    return this.repo.usuarios();
  }

  /**
   * Agrega un usuario antes de que entre por primera vez (p. ej. ingenieros y programadores).
   * Queda "pendiente" y se vincula a su cuenta Google/Microsoft cuando inicia sesión con ese correo,
   * conservando los roles, grupos y tecnologías definidos aquí.
   */
  @Post('usuarios')
  crear(@Body(new ZodPipe(esquemaNuevoUsuario)) dto: NuevoUsuario, @Usuario() u: UsuarioActual) {
    return enTransaccion(u.id, async () => {
      const id = await this.repo.crear(dto);
      const [r] = await this.repo.usuarios(id);
      return r;
    });
  }

  /** Los cambios de rol se reflejan en el siguiente token (máx. 15 min) o al volver a iniciar sesión. */
  @Patch('usuarios/:id')
  async actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(esquemaCambioUsuario)) cambio: CambioUsuario,
    @Usuario() u: UsuarioActual,
  ) {
    return enTransaccion(u.id, async () => {
      const [actual] = await this.repo.usuarios(id);
      if (!actual) throw new NoEncontrado('Usuario', id);
      const pierdeAdmin = (cambio.roles && !cambio.roles.includes('ADMIN') && actual.roles.includes('ADMIN')) || cambio.activo === false;
      if (pierdeAdmin && actual.roles.includes('ADMIN') && (await this.repo.contarAdminsActivos(id)) === 0) {
        throw new ErrorDominio('ULTIMO_ADMIN', 'Debe quedar al menos un administrador activo');
      }
      if (id === u.id && cambio.activo === false) throw new ErrorDominio('AUTO_DESACTIVAR', 'No puedes desactivar tu propio usuario');
      await this.repo.actualizar(id, cambio);
      const [r] = await this.repo.usuarios(id);
      return r;
    });
  }
}
