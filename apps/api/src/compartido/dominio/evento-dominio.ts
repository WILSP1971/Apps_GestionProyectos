/** Hecho relevante del negocio que ya ocurrió. Se persiste en eventos_outbox. */
export interface EventoDominio<P = Record<string, unknown>> {
  readonly tipo: string;        // 'solicitud.enviada'
  readonly agregado: string;    // 'Solicitud'
  readonly agregadoId: string;
  readonly ocurridoEn: Date;
  readonly payload: P;
}
