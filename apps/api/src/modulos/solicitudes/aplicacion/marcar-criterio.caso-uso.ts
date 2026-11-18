import { Inject, Injectable } from '@nestjs/common';
import { ConflictoConcurrencia, NoEncontrado } from '../../../compartido/dominio/errores';
import { UsuarioActual } from '../../../compartido/dominio/usuario-actual';
import { enTransaccion } from '../../../compartido/infraestructura/base-datos';
import { REPOSITORIO_SOLICITUDES, RepositorioSolicitudes } from '../dominio/solicitud.repositorio';

export interface MarcarCriterioComando {
  criterioId: string;
  cumplido: boolean;
  version?: number;
}

/** Verificación de un criterio de aceptación durante desarrollo o validación. */
@Injectable()
export class MarcarCriterioCasoUso {
  constructor(@Inject(REPOSITORIO_SOLICITUDES) private readonly repo: RepositorioSolicitudes) {}

  async ejecutar(solicitudId: string, cmd: MarcarCriterioComando, usuario: UsuarioActual) {
    return enTransaccion(usuario.id, async () => {
      const s = await this.repo.porId(solicitudId);
      if (!s) throw new NoEncontrado('Solicitud', solicitudId);
      if (cmd.version !== undefined && s.version !== cmd.version) throw new ConflictoConcurrencia('Solicitud', solicitudId);
      s.marcarCriterio(cmd.criterioId, cmd.cumplido, usuario);
      await this.repo.guardar(s);
      return { id: solicitudId };
    });
  }
}
