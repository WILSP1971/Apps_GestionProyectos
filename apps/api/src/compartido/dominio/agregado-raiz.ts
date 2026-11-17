import { EventoDominio } from './evento-dominio';

/**
 * Raíz de agregado: frontera de consistencia transaccional.
 * - `version` implementa concurrencia optimista (0 = aún no persistido).
 * - Los eventos se acumulan y el repositorio los publica en el outbox.
 */
export abstract class AgregadoRaiz<Props extends object> {
  private eventos: EventoDominio[] = [];

  protected constructor(
    public readonly id: string,
    protected props: Props,
    private readonly _version: number = 0,
  ) {}

  get version(): number {
    return this._version;
  }

  get esNuevo(): boolean {
    return this._version === 0;
  }

  protected registrar(evento: EventoDominio): void {
    this.eventos.push(evento);
  }

  extraerEventos(): EventoDominio[] {
    const pendientes = this.eventos;
    this.eventos = [];
    return pendientes;
  }
}
