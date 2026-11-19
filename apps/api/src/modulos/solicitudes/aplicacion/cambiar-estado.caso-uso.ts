import { Inject, Injectable } from '@nestjs/common';
import type { EstadoSolicitud } from '@sierraflow/contratos';
import { ConflictoConcurrencia, ErrorDominio, NoEncontrado } from '../../../compartido/dominio/errores';
import { UsuarioActual } from '../../../compartido/dominio/usuario-actual';
import { db, enTransaccion } from '../../../compartido/infraestructura/base-datos';
import { REPOSITORIO_SOLICITUDES, RepositorioSolicitudes } from '../dominio/solicitud.repositorio';

export interface CambioEstadoComando {
  hacia: EstadoSolicitud;
  comentario?: string;
  /** Versión que conocía el cliente. undefined = sin verificación (solo uso interno de la sincronización). */
  version?: number;
}

@Injectable()
export class CambiarEstadoSolicitudCasoUso {
  constructor(@Inject(REPOSITORIO_SOLICITUDES) private readonly repo: RepositorioSolicitudes) {}

  async ejecutar(id: string, cambio: CambioEstadoComando, usuario: UsuarioActual) {
    return enTransaccion(
      usuario.id,
      async () => {
        const s = await this.repo.porId(id);
        if (!s) throw new NoEncontrado('Solicitud', id);
        if (cambio.version !== undefined && s.version !== cambio.version) throw new ConflictoConcurrencia('Solicitud', id);
        if (cambio.hacia === 'ASIGNADA') {
          const { rows: [r] } = await db().query(
            `SELECT count(*)::int AS n FROM gestion.asignaciones WHERE solicitud_id = $1 AND activa AND NOT eliminado`, [id]);
          if (!r.n) throw new ErrorDominio('SIN_EQUIPO', 'Asigna al menos un ingeniero o grupo desde la pantalla de Asignación');
        }
        s.cambiarEstado(cambio.hacia, usuario, cambio.comentario);
        await this.repo.guardar(s);
        return { id, estado: s.estado, version: s.version + 1 };
      },
      { comentarioEstado: cambio.comentario ?? '' },
    );
  }
}
