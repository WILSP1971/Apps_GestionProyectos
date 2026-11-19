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
  solicitanteId: string;
  solicitanteNombre: string;
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

class BaseLocal extends Dexie {
  solicitudes!: Table<SolicitudLocal, string>;
  comentarios!: Table<ComentarioLocal, string>;
  notificaciones!: Table<NotificacionLocal, string>;
  bandejaSalida!: Table<OperacionPendiente, string>;
  conflictos!: Table<ConflictoLocal, string>;
  meta!: Table<{ clave: string; valor: unknown }, string>;

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
  }
}

export const dbLocal = new BaseLocal();

/** Borra todos los datos locales (cambio de usuario, salida del modo demo, cierre de sesión). */
export async function vaciarBaseLocal() {
  await dbLocal.transaction('rw', [dbLocal.solicitudes, dbLocal.comentarios, dbLocal.notificaciones,
    dbLocal.bandejaSalida, dbLocal.conflictos, dbLocal.meta], async () => {
    await Promise.all([dbLocal.solicitudes.clear(), dbLocal.comentarios.clear(), dbLocal.notificaciones.clear(),
      dbLocal.bandejaSalida.clear(), dbLocal.conflictos.clear(), dbLocal.meta.clear()]);
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
