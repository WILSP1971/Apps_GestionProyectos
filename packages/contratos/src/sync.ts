import { z } from 'zod';
import type { CriterioAceptacion, Prioridad, TipoSolicitud } from './solicitudes';
import type { EstadoSolicitud } from './estados';

/**
 * Contrato de sincronización Offline-First (web ↔ API).
 *  - push: el cliente envía su bandeja de salida en orden; el servidor la aplica en orden.
 *  - pull: el cliente pide los cambios posteriores a sus cursores (seq_cambio por colección).
 */

export const ENTIDADES_SYNC = ['solicitud', 'comentario', 'notificacion'] as const;
export const TIPOS_OPERACION = ['crear', 'cambiar_estado', 'marcar_criterio', 'comentar', 'leer_notificacion'] as const;
export type TipoOperacion = (typeof TIPOS_OPERACION)[number];

export const esquemaOperacionSync = z.object({
  idOperacion: z.string().uuid(),                 // idempotencia: el mismo id nunca se aplica dos veces
  entidad: z.enum(ENTIDADES_SYNC),
  tipo: z.enum(TIPOS_OPERACION),
  entidadId: z.string().uuid(),                   // id de la solicitud afectada (o de la notificación)
  payload: z.unknown(),
  versionBase: z.number().int().min(0).optional(),// versión que conocía el cliente (0 = creada sin conexión)
  creadoEn: z.number().optional(),
});
export type OperacionSync = z.infer<typeof esquemaOperacionSync>;

export const esquemaPush = z.object({
  dispositivoId: z.string().min(8).max(80),
  operaciones: z.array(esquemaOperacionSync).max(100),
});
export type PeticionPush = z.infer<typeof esquemaPush>;

export interface EntradaHistorialSync {
  estadoAnterior: EstadoSolicitud | null;
  estadoNuevo: EstadoSolicitud;
  usuario: string;
  comentario?: string | null;
  fecha: string;
}

/** Forma de una solicitud tal como la guarda el cliente en IndexedDB. */
export interface SolicitudSync {
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
  /** Proyecto al que pertenece (null = solicitud suelta) */
  proyectoId?: string | null;
  proyectoCodigo?: string | null;
  proyectoNombre?: string | null;
  solicitanteId: string;
  solicitanteNombre: string;
  fechaDeseada?: string;
  tecnologias: string[];
  criterios: CriterioAceptacion[];
  historial: EntradaHistorialSync[];
  asignados: { usuarioId?: string | null; nombre: string; grupo: string; rol?: string }[];
  version: number;
  creadoEn: string;
  actualizadoEn: string;
  eliminado: boolean;
  seq: number;
}

export interface ComentarioSync {
  id: string;
  solicitudId: string;
  autor: string;
  contenido: string;
  creadoEn: string;
  eliminado: boolean;
  seq: number;
}

export interface NotificacionSync {
  id: string;
  titulo: string;
  mensaje: string;
  enlace: string;
  severidad: 'INFO' | 'EXITO' | 'ALERTA' | 'CRITICA';
  leida: 0 | 1;
  creadoEn: string;
  seq: number;
}

/**
 *  ok         → aplicada; `solicitud` trae el estado actual del servidor
 *  conflicto  → otro usuario cambió la solicitud (versión distinta); `solicitud` trae lo vigente
 *  rechazada  → viola una regla de negocio; reintentar no sirve
 *  error      → falla temporal (BD, red); el cliente reintenta después
 */
export type EstadoResultado = 'ok' | 'conflicto' | 'rechazada' | 'error';

export interface ResultadoOperacion {
  idOperacion: string;
  estado: EstadoResultado;
  codigo?: string;
  mensaje?: string;
  solicitud?: SolicitudSync | null;
}

export interface RespuestaPush {
  resultados: ResultadoOperacion[];
}

export interface CursoresSync {
  solicitudes: number;
  comentarios: number;
  notificaciones: number;
}

export interface RespuestaPull {
  solicitudes: SolicitudSync[];
  comentarios: ComentarioSync[];
  notificaciones: NotificacionSync[];
  cursores: CursoresSync;
  hayMas: boolean;
}
