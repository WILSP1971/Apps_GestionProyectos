import Dexie, { type Table } from 'dexie';
import type { CriterioAceptacion, EstadoSolicitud, Prioridad, TipoSolicitud } from '@sierraflow/contratos';

/**
 * Base local (IndexedDB) — fuente de verdad de la UI (Offline-First).
 * La UI siempre lee de aquí; el motor de sincronización (Sprint 3) la mantiene al día con la API.
 */

export interface EntradaHistorial {
  estadoAnterior: EstadoSolicitud | null;
  estadoNuevo: EstadoSolicitud;
  usuario: string;
  comentario?: string | null;
  fecha: string;
}

export interface Asignado {
  nombre: string;
  grupo: string;
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
  entidad: 'solicitud' | 'comentario';
  tipo: 'crear' | 'editar' | 'cambiar_estado' | 'marcar_criterio' | 'comentar';
  entidadId: string;
  payload: unknown;
  versionBase?: number;
  creadoEn: number;
  intentos: number;
  error?: string;
}

class BaseLocal extends Dexie {
  solicitudes!: Table<SolicitudLocal, string>;
  comentarios!: Table<ComentarioLocal, string>;
  notificaciones!: Table<NotificacionLocal, string>;
  bandejaSalida!: Table<OperacionPendiente, string>;
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
  }
}

export const dbLocal = new BaseLocal();
