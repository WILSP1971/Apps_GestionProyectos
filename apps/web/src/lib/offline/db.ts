import Dexie, { type Table } from 'dexie';
import type {
  CriterioAceptacion, EntradaHistorialSync, EstadoSolicitud, Prioridad, TipoOperacion, TipoSolicitud,
} from '@sierraflow/contratos';

/**
 * Base local (IndexedDB) — fuente de verdad de la UI (Offline-First).
 * La UI siempre lee de aquí; el motor de sincronización la mantiene al día con la API.
 */

export type EntradaHistorial = EntradaHistorialSync;

export interface Asignado {
  usuarioId?: string | null;
  nombre: string;
  grupo: string;
  rol?: string;
}

export interface SolicitudLocal {
  id: string;
  codigo: string;
  titulo: string;
  descripcion: string;
  objetivos?: string;
  justificacion?: string;
  tipo: TipoSolicitud;
  prioridad: Prioridad;
  estado: EstadoSolicitud;
  avancePct: number;
  departamento: string;
  departamentoColor?: string;
  /** Proyecto al que pertenece (null o ausente = solicitud suelta) */
  proyectoId?: string | null;
  proyectoCodigo?: string | null;
  proyectoNombre?: string | null;
  /** Aplicación de software sobre la que trata */
  aplicacionId?: string | null;
  aplicacionNombre?: string | null;
  solicitanteId: string;
  solicitanteNombre: string;
  /** Fecha sugerida de entrega */
  fechaDeseada?: string;
  tecnologias: string[];
  criterios: CriterioAceptacion[];
  historial: EntradaHistorial[];
  asignados: Asignado[];
  version: number;
  creadoEn: string;
  actualizadoEn: string;
  /** 1 = tiene cambios locales sin confirmar por el servidor (IndexedDB no indexa booleanos) */
  pendienteSync: 0 | 1;
  /** El servidor rechazó la creación de esta solicitud (no existe en el servidor) */
  errorSync?: string;
}

export interface ComentarioLocal {
  id: string;
  solicitudId: string;
  autor: string;
  contenido: string;
  creadoEn: string;
  pendienteSync: 0 | 1;
}

export interface NotificacionLocal {
  id: string;
  titulo: string;
  mensaje: string;
  enlace: string;
  severidad: 'INFO' | 'EXITO' | 'ALERTA' | 'CRITICA';
  leida: 0 | 1;
  creadoEn: string;
  /** Evento de dominio que la originó (p. ej. 'solicitud.enviada') */
  tipo?: string | null;
}

export interface OperacionPendiente {
  idOperacion: string;
  entidad: 'solicitud' | 'comentario' | 'notificacion';
  tipo: TipoOperacion;
  entidadId: string;
  payload: unknown;
  versionBase?: number;
  creadoEn: number;
  intentos: number;
  error?: string;
}

/** Operación que el servidor no aplicó: queda visible para que el usuario decida. */
export interface ConflictoLocal {
  idOperacion: string;
  entidadId: string;
  tipo: TipoOperacion;
  payload: unknown;
  motivo: 'conflicto' | 'rechazada';
  mensaje: string;
  fecha: string;
}

export interface EstadoSync {
  fase: 'inactivo' | 'sincronizando' | 'ok' | 'error' | 'sin-conexion' | 'sesion';
  ultimaSync?: string;
  mensaje?: string;
}

/**
 * Archivo adjunto guardado en el navegador:
 *  - PENDIENTE: adjunto de una solicitud que espera conexión (o a que la solicitud llegue al servidor);
 *  - ERROR: el servidor lo rechazó (se muestra el motivo y se puede quitar);
 *  - DEMO: adjunto del modo demostración (nunca se sube).
 */
export interface AdjuntoLocal {
  id: string;
  solicitudId?: string | null;
  tareaId?: string | null;
  avanceId?: string | null;
  nombre: string;
  mime: string;
  tamano: number;
  blob: Blob;
  estado: 'PENDIENTE' | 'ERROR' | 'DEMO';
  error?: string;
  subidoPor: string;
  creadoEn: string;
}

class BaseLocal extends Dexie {
  solicitudes!: Table<SolicitudLocal, string>;
  comentarios!: Table<ComentarioLocal, string>;
  notificaciones!: Table<NotificacionLocal, string>;
  bandejaSalida!: Table<OperacionPendiente, string>;
  conflictos!: Table<ConflictoLocal, string>;
  meta!: Table<{ clave: string; valor: unknown }, string>;
  adjuntos!: Table<AdjuntoLocal, string>;

  constructor() {
    super('sierraflow');
    this.version(1).stores({
      solicitudes: 'id, estado, solicitanteId, prioridad, pendienteSync, actualizadoEn',
      comentarios: 'id, solicitudId, creadoEn',
      notificaciones: 'id, leida, creadoEn',
      bandejaSalida: 'idOperacion, creadoEn, entidadId',
      meta: 'clave',
    });
    // Sprint 3: conflictos de sincronización
    this.version(2).stores({
      conflictos: 'idOperacion, entidadId, fecha',
    });
    // Adjuntos pendientes de subir (y los del modo demo)
    this.version(3).stores({
      adjuntos: 'id, estado, solicitudId, tareaId, avanceId',
    });
  }
}

export const dbLocal = new BaseLocal();

/** Borra todos los datos locales (cambio de usuario, salida del modo demo, cierre de sesión). */
export async function vaciarBaseLocal() {
  await dbLocal.transaction('rw', [dbLocal.solicitudes, dbLocal.comentarios, dbLocal.notificaciones,
    dbLocal.bandejaSalida, dbLocal.conflictos, dbLocal.meta, dbLocal.adjuntos], async () => {
    await Promise.all([dbLocal.solicitudes.clear(), dbLocal.comentarios.clear(), dbLocal.notificaciones.clear(),
      dbLocal.bandejaSalida.clear(), dbLocal.conflictos.clear(), dbLocal.meta.clear(), dbLocal.adjuntos.clear()]);
  });
}

/**
 * Asegura que la base local pertenece al usuario actual y al modo correcto.
 * Si cambió el usuario o se pasó de demo a real (o al revés) se vacía, para no mezclar datos.
 */
export async function prepararBaseLocal(usuarioId: string, modoDemo: boolean) {
  const propietario = `${modoDemo ? 'demo' : 'real'}:${usuarioId}`;
  const actual = (await dbLocal.meta.get('propietario'))?.valor;
  if (actual !== propietario) {
    if (actual !== undefined) await vaciarBaseLocal();
    await dbLocal.meta.put({ clave: 'propietario', valor: propietario });
  }
}
