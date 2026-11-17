import { EventoDominio } from '../dominio/evento-dominio';
import { db } from './base-datos';

/** Guarda los eventos en eventos_outbox dentro de la transacción actual (Transactional Outbox). */
export async function publicarEnOutbox(eventos: EventoDominio[]): Promise<void> {
  for (const e of eventos) {
    await db().query(
      `INSERT INTO gestion.eventos_outbox(agregado, agregado_id, tipo_evento, payload, ocurrido_en)
       VALUES ($1, $2, $3, $4, $5)`,
      [e.agregado, e.agregadoId, e.tipo, JSON.stringify(e.payload), e.ocurridoEn],
    );
  }
}
