import { validarAdjunto } from '@sierraflow/contratos';
import { ErrorApi } from '@/lib/api';
import { dbLocal, type AdjuntoLocal } from '@/lib/offline/db';
import { nuevoId } from '@/lib/utils';
import { fuenteApi } from '../infraestructura/fuente-adjuntos';

/**
 * Adjuntos de una solicitud creada desde el asistente. Como la solicitud se crea primero en el
 * navegador (funciona sin conexión), sus archivos esperan en IndexedDB y se suben cuando la
 * solicitud ya existe en el servidor. En modo demo quedan guardados localmente.
 */
export async function encolarAdjuntosSolicitud(solicitudId: string, archivos: File[], actor: { nombre: string }, modoDemo: boolean) {
  const filas: AdjuntoLocal[] = archivos.map((f) => {
    const v = validarAdjunto(f.name, f.size);
    if (!v.ok) throw new Error(v.error);
    return {
      id: nuevoId(), solicitudId, nombre: f.name, mime: v.mime, tamano: f.size, blob: f,
      estado: modoDemo ? 'DEMO' : 'PENDIENTE', subidoPor: actor.nombre, creadoEn: new Date().toISOString(),
    };
  });
  await dbLocal.adjuntos.bulkAdd(filas);
}

let subiendo = false;

/** Sube los adjuntos pendientes cuya solicitud ya llegó al servidor. Se ejecuta al final de cada sincronización. */
export async function subirAdjuntosPendientes(): Promise<void> {
  if (subiendo || !navigator.onLine) return;
  subiendo = true;
  try {
    const pendientes = await dbLocal.adjuntos.where('estado').equals('PENDIENTE').toArray();
    for (const a of pendientes) {
      if (!a.solicitudId) continue;
      const s = await dbLocal.solicitudes.get(a.solicitudId);
      if (!s) { await dbLocal.adjuntos.delete(a.id); continue; } // la solicitud ya no existe
      if (s.pendienteSync === 1 || s.errorSync) continue; // aún no está en el servidor
      try {
        await fuenteApi.subir({ solicitudId: a.solicitudId }, new File([a.blob], a.nombre, { type: a.mime }), { nombre: a.subidoPor });
        await dbLocal.adjuntos.delete(a.id);
      } catch (e) {
        if (e instanceof ErrorApi && e.status === 404) continue; // todavía no la ve el servidor: se reintenta
        if (e instanceof ErrorApi && e.status >= 400 && e.status < 500) {
          await dbLocal.adjuntos.update(a.id, { estado: 'ERROR', error: e.message });
          continue;
        }
        throw e; // red o servidor caído: se reintenta en la próxima sincronización
      }
    }
  } finally {
    subiendo = false;
  }
}
