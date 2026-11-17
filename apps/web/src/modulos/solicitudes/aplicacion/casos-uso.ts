import {
  esquemaNuevaSolicitud,
  ETIQUETA_ESTADO,
  transicionesDisponibles,
  type EstadoSolicitud,
  type NuevaSolicitud,
  type Rol,
} from '@sierraflow/contratos';
import { dbLocal, type SolicitudLocal } from '@/lib/offline/db';
import { nuevoId } from '@/lib/utils';

/**
 * Casos de uso del frontend (capa de aplicación, Offline-First):
 * 1) validan con las mismas reglas del dominio (contratos compartidos),
 * 2) aplican el cambio de forma optimista en IndexedDB,
 * 3) encolan la operación en la bandeja de salida para sincronizar con la API.
 */

export interface Actor {
  id: string;
  nombre: string;
  departamento: string;
  roles: Rol[];
}

export class ErrorNegocio extends Error {}

const ahora = () => new Date().toISOString();
const codigoProvisional = (id: string) => `SOL-L${id.replace(/-/g, '').slice(0, 5).toUpperCase()}`;

async function notificar(titulo: string, mensaje: string, enlace: string, severidad: 'INFO' | 'EXITO' | 'ALERTA' = 'INFO') {
  await dbLocal.notificaciones.add({ id: nuevoId(), titulo, mensaje, enlace, severidad, leida: 0, creadoEn: ahora() });
}

export async function crearSolicitud(datos: NuevaSolicitud, actor: Actor): Promise<string> {
  const v = esquemaNuevaSolicitud.parse(datos);
  const id = v.id ?? nuevoId();
  const fecha = ahora();
  const estado: EstadoSolicitud = v.enviar ? 'ENVIADA' : 'BORRADOR';
  const solicitud: SolicitudLocal = {
    id,
    codigo: codigoProvisional(id),
    titulo: v.titulo,
    descripcion: v.descripcion,
    objetivos: v.objetivos,
    justificacion: v.justificacion,
    tipo: v.tipo,
    prioridad: v.prioridad,
    estado,
    avancePct: 0,
    departamento: actor.departamento,
    solicitanteId: actor.id,
    solicitanteNombre: actor.nombre,
    fechaDeseada: v.fechaDeseada || undefined,
    tecnologias: v.tecnologias,
    criterios: v.criterios,
    historial: [
      { estadoAnterior: null, estadoNuevo: 'BORRADOR', usuario: actor.nombre, fecha },
      ...(v.enviar ? [{ estadoAnterior: 'BORRADOR' as const, estadoNuevo: 'ENVIADA' as const, usuario: actor.nombre, fecha }] : []),
    ],
    asignados: [],
    version: 0,
    creadoEn: fecha,
    actualizadoEn: fecha,
    pendienteSync: 1,
  };

  await dbLocal.transaction('rw', dbLocal.solicitudes, dbLocal.bandejaSalida, dbLocal.notificaciones, async () => {
    await dbLocal.solicitudes.add(solicitud);
    await dbLocal.bandejaSalida.add({
      idOperacion: nuevoId(), entidad: 'solicitud', tipo: 'crear', entidadId: id,
      payload: { ...v, id }, creadoEn: Date.now(), intentos: 0,
    });
    if (v.enviar) {
      await notificar('Solicitud enviada', `"${v.titulo}" quedó en cola para revisión.`, `/solicitudes/${id}`, 'EXITO');
    }
  });
  return id;
}

export async function cambiarEstado(id: string, hacia: EstadoSolicitud, actor: Actor, comentario?: string) {
  await dbLocal.transaction('rw', dbLocal.solicitudes, dbLocal.bandejaSalida, dbLocal.notificaciones, async () => {
    const s = await dbLocal.solicitudes.get(id);
    if (!s) throw new ErrorNegocio('La solicitud no existe');

    const regla = transicionesDisponibles(s.estado, actor.roles).find((r) => r.hacia === hacia);
    if (!regla) throw new ErrorNegocio(`No puede pasar de ${ETIQUETA_ESTADO[s.estado]} a ${ETIQUETA_ESTADO[hacia]}`);
    if (regla.requiereComentario && !comentario?.trim()) throw new ErrorNegocio('Esta acción requiere un comentario');
    if (hacia === 'ENVIADA' && s.criterios.length === 0) throw new ErrorNegocio('Agregue al menos un criterio de aceptación');
    if (hacia === 'CERRADA' && s.criterios.some((c) => !c.cumplido)) {
      throw new ErrorNegocio('Todos los criterios de aceptación deben estar cumplidos para cerrar');
    }

    const fecha = ahora();
    await dbLocal.solicitudes.update(id, {
      estado: hacia,
      avancePct: hacia === 'CERRADA' ? 100 : s.avancePct,
      historial: [...s.historial, { estadoAnterior: s.estado, estadoNuevo: hacia, usuario: actor.nombre, comentario: comentario ?? null, fecha }],
      actualizadoEn: fecha,
      pendienteSync: 1,
    });
    await dbLocal.bandejaSalida.add({
      idOperacion: nuevoId(), entidad: 'solicitud', tipo: 'cambiar_estado', entidadId: id,
      payload: { hacia, comentario }, versionBase: s.version, creadoEn: Date.now(), intentos: 0,
    });
    const severidad = hacia === 'RECHAZADA' ? 'ALERTA' : hacia === 'APROBADA' || hacia === 'CERRADA' ? 'EXITO' : 'INFO';
    await notificar(`${s.codigo}: ${ETIQUETA_ESTADO[hacia]}`, `"${s.titulo}" pasó a ${ETIQUETA_ESTADO[hacia].toLowerCase()}.`, `/solicitudes/${id}`, severidad);
  });
}

export async function marcarCriterio(id: string, criterioId: string, cumplido: boolean) {
  const s = await dbLocal.solicitudes.get(id);
  if (!s) return;
  if (!['EN_DESARROLLO', 'EN_VALIDACION'].includes(s.estado)) {
    throw new ErrorNegocio('Los criterios se verifican durante desarrollo o validación');
  }
  const criterios = s.criterios.map((c) => (c.id === criterioId ? { ...c, cumplido } : c));
  const avance = s.estado === 'EN_VALIDACION' || s.estado === 'EN_DESARROLLO'
    ? Math.max(s.avancePct, Math.round((criterios.filter((c) => c.cumplido).length / criterios.length) * 100))
    : s.avancePct;
  await dbLocal.transaction('rw', dbLocal.solicitudes, dbLocal.bandejaSalida, async () => {
    await dbLocal.solicitudes.update(id, { criterios, avancePct: avance, actualizadoEn: ahora(), pendienteSync: 1 });
    await dbLocal.bandejaSalida.add({
      idOperacion: nuevoId(), entidad: 'solicitud', tipo: 'marcar_criterio', entidadId: id,
      payload: { criterioId, cumplido }, versionBase: s.version, creadoEn: Date.now(), intentos: 0,
    });
  });
}

export async function comentar(solicitudId: string, contenido: string, actor: Actor) {
  const texto = contenido.trim();
  if (!texto) return;
  const id = nuevoId();
  await dbLocal.transaction('rw', dbLocal.comentarios, dbLocal.bandejaSalida, async () => {
    await dbLocal.comentarios.add({ id, solicitudId, autor: actor.nombre, contenido: texto, creadoEn: ahora(), pendienteSync: 1 });
    await dbLocal.bandejaSalida.add({
      idOperacion: nuevoId(), entidad: 'comentario', tipo: 'comentar', entidadId: solicitudId,
      payload: { id, contenido: texto }, creadoEn: Date.now(), intentos: 0,
    });
  });
}

/** Detección local de duplicados (funciona sin red): similitud por palabras significativas. */
export async function buscarSimilares(titulo: string, excluirId?: string) {
  const palabras = (t: string) =>
    new Set(t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((p) => p.length > 3));
  const base = palabras(titulo);
  if (base.size < 2) return [];
  const todas = await dbLocal.solicitudes.toArray();
  return todas
    .filter((s) => s.id !== excluirId && !['CANCELADA', 'RECHAZADA'].includes(s.estado))
    .map((s) => {
      const otras = palabras(s.titulo);
      const comunes = [...base].filter((p) => otras.has(p)).length;
      return { id: s.id, codigo: s.codigo, titulo: s.titulo, similitud: comunes / Math.max(base.size, otras.size) };
    })
    .filter((s) => s.similitud >= 0.4)
    .sort((a, b) => b.similitud - a.similitud)
    .slice(0, 3);
}
