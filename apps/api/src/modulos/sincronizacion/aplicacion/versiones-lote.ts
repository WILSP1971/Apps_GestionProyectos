/**
 * Concurrencia optimista para operaciones encadenadas sin conexión.
 *
 * Sin red, el usuario puede hacer varios cambios seguidos sobre la misma solicitud
 * (p. ej. "Tomar en revisión" y luego "Aprobar"). Todas esas operaciones llegan con la
 * misma versionBase, porque el cliente no conoce las versiones que asignará el servidor.
 * Dentro de un mismo lote, si una operación previa del lote ya avanzó la versión desde
 * esa base, la siguiente se verifica contra la versión resultante y no contra la base.
 * Así solo hay conflicto si OTRO usuario cambió la solicitud.
 */
export class VersionesLote {
  private readonly porEntidad = new Map<string, { bases: Set<number>; actual: number }>();

  /**
   * Versión contra la que se debe verificar la operación.
   * undefined = sin verificación: la solicitud fue creada sin conexión por este cliente
   * (versionBase 0) y su orden de aplicación está garantizado por la bandeja de salida.
   */
  resolver(entidadId: string, versionBase: number | undefined): number | undefined {
    if (!versionBase) return undefined;
    const e = this.porEntidad.get(entidadId);
    if (e && e.bases.has(versionBase)) return e.actual;
    return versionBase;
  }

  /** Registra la versión resultante tras aplicar con éxito una operación del lote. */
  registrar(entidadId: string, versionBase: number | undefined, versionNueva: number): void {
    const e = this.porEntidad.get(entidadId) ?? { bases: new Set<number>(), actual: versionNueva };
    if (versionBase) e.bases.add(versionBase);
    if (this.porEntidad.has(entidadId)) e.bases.add(e.actual);
    e.actual = versionNueva;
    this.porEntidad.set(entidadId, e);
  }
}
