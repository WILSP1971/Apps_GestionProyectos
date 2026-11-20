import { z } from 'zod';

/**
 * Notificaciones (Sprint 4): canales, grupos de eventos y preferencias por usuario.
 * La notificación dentro de la app (APP) siempre se entrega; correo y push son configurables.
 */
export const CANALES = ['APP', 'EMAIL', 'PUSH'] as const;
export type Canal = (typeof CANALES)[number];

export const CODIGOS_GRUPO = ['MIS_SOLICITUDES', 'POR_REVISAR', 'ASIGNACIONES', 'COMENTARIOS', 'SLA'] as const;
export type GrupoNotificacion = (typeof CODIGOS_GRUPO)[number];

export interface DefinicionGrupo {
  codigo: GrupoNotificacion;
  nombre: string;
  descripcion: string;
  porDefecto: { EMAIL: boolean; PUSH: boolean };
}

export const GRUPOS_NOTIFICACION: DefinicionGrupo[] = [
  {
    codigo: 'MIS_SOLICITUDES', nombre: 'Mis solicitudes',
    descripcion: 'Cuando una solicitud tuya entra en revisión, se aprueba, se rechaza, se devuelve o queda lista para validar.',
    porDefecto: { EMAIL: true, PUSH: true },
  },
  {
    codigo: 'POR_REVISAR', nombre: 'Solicitudes por revisar',
    descripcion: 'Nuevas solicitudes enviadas o canceladas (líderes y directores).',
    porDefecto: { EMAIL: true, PUSH: true },
  },
  {
    codigo: 'ASIGNACIONES', nombre: 'Asignaciones',
    descripcion: 'Cuando te asignan una solicitud o se cierra una en la que trabajaste.',
    porDefecto: { EMAIL: true, PUSH: true },
  },
  {
    codigo: 'COMENTARIOS', nombre: 'Comentarios',
    descripcion: 'Nuevos comentarios en solicitudes en las que participas.',
    porDefecto: { EMAIL: false, PUSH: true },
  },
  {
    codigo: 'SLA', nombre: 'Alertas de SLA',
    descripcion: 'Solicitudes que están por vencer o vencieron sin respuesta (líderes y directores).',
    porDefecto: { EMAIL: true, PUSH: true },
  },
];

export interface PreferenciaGrupo {
  grupo: GrupoNotificacion;
  nombre: string;
  descripcion: string;
  email: boolean;
  push: boolean;
}

export const esquemaPreferencias = z.array(z.object({
  grupo: z.enum(CODIGOS_GRUPO),
  email: z.boolean(),
  push: z.boolean(),
})).max(CODIGOS_GRUPO.length);
export type CambioPreferencias = z.infer<typeof esquemaPreferencias>;

/** PushSubscription.toJSON() del navegador */
export const esquemaSuscripcionPush = z.object({
  endpoint: z.string().url().max(2000),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: z.string().min(10), auth: z.string().min(4) }),
});
export type SuscripcionPush = z.infer<typeof esquemaSuscripcionPush>;

/** Evento que la API envía por SSE cuando el usuario recibe una notificación */
export interface EventoNotificacion {
  id: string;
  titulo: string;
  mensaje: string;
  enlace: string;
  severidad: 'INFO' | 'EXITO' | 'ALERTA' | 'CRITICA';
  /** Evento de dominio que la originó (p. ej. 'solicitud.enviada') */
  tipo?: string | null;
}

/** Evento que dispara el aviso "Recibiste una solicitud nueva" en el panel de gestión. */
export const TIPO_SOLICITUD_NUEVA = 'solicitud.enviada';
