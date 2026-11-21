import { validarAdjunto, type AdjuntoVista } from '@sierraflow/contratos';
import { apiBinario, apiFetch } from '@/lib/api';
import { dbLocal, type AdjuntoLocal } from '@/lib/offline/db';
import { nuevoId } from '@/lib/utils';

/** Dónde va el archivo: una solicitud, o una tarea (y opcionalmente un registro de su bitácora). */
export type DestinoAdjunto = { solicitudId: string } | { tareaId: string; avanceId?: string | null };

export interface FuenteAdjuntos {
  listar(destino: DestinoAdjunto): Promise<AdjuntoVista[]>;
  subir(destino: DestinoAdjunto, archivo: File, actor: { nombre: string }): Promise<AdjuntoVista>;
  descargar(id: string): Promise<Blob>;
  eliminar(id: string): Promise<void>;
}

const consulta = (d: DestinoAdjunto) =>
  'solicitudId' in d ? `solicitud=${d.solicitudId}` : `tarea=${d.tareaId}${d.avanceId ? `&avance=${d.avanceId}` : ''}`;

export const fuenteApi: FuenteAdjuntos = {
  listar: (d) => apiFetch(`/adjuntos?${consulta(d)}`),
  async subir(d, archivo) {
    const r = await apiBinario(`/adjuntos?${consulta(d)}`, {
      method: 'POST', cuerpo: archivo, cabeceras: { 'X-Nombre-Archivo': encodeURIComponent(archivo.name) },
    });
    return (await r.json()) as AdjuntoVista;
  },
  async descargar(id) {
    return (await apiBinario(`/adjuntos/${id}/contenido`)).blob();
  },
  eliminar: (id) => apiFetch(`/adjuntos/${id}`, { method: 'DELETE' }),
};

/** Vista de un adjunto guardado en el navegador. */
export const vistaLocal = (a: AdjuntoLocal): AdjuntoVista => ({
  id: a.id, nombre: a.nombre, mime: a.mime, tamano: a.tamano, subidoPor: a.subidoPor, creadoEn: a.creadoEn, avanceId: a.avanceId ?? null,
});

/** Modo demo: los archivos quedan en IndexedDB y nunca salen del navegador. */
export const fuenteDemo: FuenteAdjuntos = {
  async listar(d) {
    const filas = 'solicitudId' in d
      ? await dbLocal.adjuntos.where('solicitudId').equals(d.solicitudId).toArray()
      : await dbLocal.adjuntos.where('tareaId').equals(d.tareaId).toArray();
    return filas.filter((a) => a.estado === 'DEMO').sort((a, b) => a.creadoEn.localeCompare(b.creadoEn)).map(vistaLocal);
  },
  async subir(d, archivo, actor) {
    const v = validarAdjunto(archivo.name, archivo.size);
    if (!v.ok) throw new Error(v.error);
    const fila: AdjuntoLocal = {
      id: nuevoId(), ...('solicitudId' in d ? { solicitudId: d.solicitudId } : { tareaId: d.tareaId, avanceId: d.avanceId ?? null }),
      nombre: archivo.name, mime: v.mime, tamano: archivo.size, blob: archivo, estado: 'DEMO', subidoPor: actor.nombre,
      creadoEn: new Date().toISOString(),
    };
    await dbLocal.adjuntos.add(fila);
    return vistaLocal(fila);
  },
  async descargar(id) {
    const a = await dbLocal.adjuntos.get(id);
    if (!a) throw new Error('El archivo ya no existe');
    return a.blob;
  },
  async eliminar(id) {
    await dbLocal.adjuntos.delete(id);
  },
};
