import { dbLocal } from '@/lib/offline/db';
import { avisarCambioLocal } from '@/lib/offline/sync/motor-sync';
import { esModoDemo } from '@/lib/modo';

/**
 * Lectura de notificaciones (Offline-First): se marca al instante en IndexedDB y, con servidor,
 * se encola para sincronizar. Así la campana funciona igual con o sin conexión.
 */
export async function marcarNotificacionLeida(id: string) {
  const n = await dbLocal.notificaciones.get(id);
  if (!n || n.leida) return;
  await dbLocal.transaction('rw', dbLocal.notificaciones, dbLocal.bandejaSalida, async () => {
    await dbLocal.notificaciones.update(id, { leida: 1 });
    if (!esModoDemo()) {
      await dbLocal.bandejaSalida.add({
        idOperacion: crypto.randomUUID(), entidad: 'notificacion', tipo: 'leer_notificacion',
        entidadId: id, payload: {}, creadoEn: Date.now(), intentos: 0,
      });
    }
  });
  avisarCambioLocal();
}

export async function marcarTodasLeidas() {
  const ids = (await dbLocal.notificaciones.where('leida').equals(0).primaryKeys()) as string[];
  if (!ids.length) return;
  const ahora = Date.now();
  await dbLocal.transaction('rw', dbLocal.notificaciones, dbLocal.bandejaSalida, async () => {
    await dbLocal.notificaciones.where('leida').equals(0).modify({ leida: 1 });
    if (!esModoDemo()) {
      await dbLocal.bandejaSalida.bulkAdd(ids.map((id, i) => ({
        idOperacion: crypto.randomUUID(), entidad: 'notificacion' as const, tipo: 'leer_notificacion' as const,
        entidadId: id, payload: {}, creadoEn: ahora + i, intentos: 0,
      })));
    }
  });
  avisarCambioLocal();
}
