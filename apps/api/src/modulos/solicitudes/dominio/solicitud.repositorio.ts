import { Solicitud } from './solicitud.agregado';

/** Puerto de persistencia del agregado (lo implementa la capa de infraestructura). */
export const REPOSITORIO_SOLICITUDES = Symbol('RepositorioSolicitudes');

export interface RepositorioSolicitudes {
  porId(id: string): Promise<Solicitud | null>;
  /** Inserta o actualiza con control de versión y publica los eventos en el outbox. */
  guardar(solicitud: Solicitud): Promise<void>;
}
