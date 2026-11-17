import { Inject, Injectable } from '@nestjs/common';
import type { CambioEstado } from '@sierraflow/contratos';
import { ConflictoConcurrencia, NoEncontrado } from '../../../compartido/dominio/errores';
import { UsuarioActual } from '../../../compartido/dominio/usuario-actual';
import { enTransaccion } from '../../../compartido/infraestructura/base-datos';
import { REPOSITORIO_SOLICITUDES, RepositorioSolicitudes } from '../dominio/solicitud.repositorio';

@Injectable()
export class CambiarEstadoSolicitudCasoUso {
  constructor(@Inject(REPOSITORIO_SOLICITUDES) private readonly repo: RepositorioSolicitudes) {}

  async ejecutar(id: string, cambio: CambioEstado, usuario: UsuarioActual) {
    return enTransaccion(
      usuario.id,
      async () => {
        const s = await this.repo.porId(id);
        if (!s) throw new NoEncontrado('Solicitud', id);
        if (s.version !== cambio.version) throw new ConflictoConcurrencia('Solicitud', id);
        s.cambiarEstado(cambio.hacia, usuario, cambio.comentario);
        await this.repo.guardar(s);
        return { id, estado: s.estado, version: s.version + 1 };
      },
      { comentarioEstado: cambio.comentario },
    );
  }
}
