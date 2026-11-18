import { Pool, PoolClient } from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX ?? 20),
});
pool.on('connect', (c) => c.query('SET search_path TO gestion, public'));

const contexto = new AsyncLocalStorage<PoolClient>();

/** Cliente de la transacción en curso (si existe) o el pool. */
export const db = (): Pool | PoolClient => contexto.getStore() ?? pool;

/**
 * Unidad de trabajo: ejecuta `fn` en una transacción y fija variables de sesión
 * que usan los triggers de historial y auditoría (app.usuario_id, app.comentario_estado).
 */
export async function enTransaccion<T>(
  usuarioId: string | null,
  fn: () => Promise<T>,
  opciones: { comentarioEstado?: string } = {},
): Promise<T> {
  const enCurso = contexto.getStore();
  if (enCurso) {
    // Transacción anidada (p. ej. un caso de uso llamado desde la sincronización):
    // reutiliza la actual y solo actualiza las variables de sesión que se indiquen.
    if (usuarioId || opciones.comentarioEstado !== undefined) {
      await enCurso.query(
        `SELECT set_config('app.usuario_id', coalesce(nullif($1, ''), current_setting('app.usuario_id', true)), true),
                set_config('app.comentario_estado', $2, true)`,
        [usuarioId ?? '', opciones.comentarioEstado ?? ''],
      );
    }
    return fn();
  }

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query(
      `SELECT set_config('app.usuario_id', $1, true), set_config('app.comentario_estado', $2, true)`,
      [usuarioId ?? '', opciones.comentarioEstado ?? ''],
    );
    const resultado = await contexto.run(cliente, fn);
    await cliente.query('COMMIT');
    return resultado;
  } catch (e) {
    await cliente.query('ROLLBACK');
    throw e;
  } finally {
    cliente.release();
  }
}
