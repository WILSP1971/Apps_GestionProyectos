/**
 * Máquina de estados de la Solicitud (contrato compartido web ↔ API).
 * Debe mantenerse alineada con:
 *  - apps/api/src/modulos/solicitudes/dominio/estado-solicitud.vo.ts
 *  - database/semillas/001_datos_iniciales.sql (tabla transiciones_estado)
 */
export const ESTADOS = [
  'BORRADOR', 'ENVIADA', 'EN_REVISION', 'APROBADA', 'RECHAZADA',
  'ASIGNADA', 'EN_DESARROLLO', 'EN_VALIDACION', 'CERRADA', 'CANCELADA',
] as const;
export type EstadoSolicitud = (typeof ESTADOS)[number];

export const ROLES = ['SOLICITANTE', 'INGENIERO', 'LIDER', 'DIRECTOR', 'ADMIN'] as const;
export type Rol = (typeof ROLES)[number];

export interface ReglaTransicion {
  hacia: EstadoSolicitud;
  roles: Rol[];
  requiereComentario?: boolean;
  /** Texto del botón de acción en la UI */
  accion: string;
}

export const MAQUINA_ESTADOS: Record<EstadoSolicitud, ReglaTransicion[]> = {
  BORRADOR: [
    { hacia: 'ENVIADA', roles: ['SOLICITANTE', 'LIDER', 'DIRECTOR'], accion: 'Enviar' },
    { hacia: 'CANCELADA', roles: ['SOLICITANTE', 'ADMIN'], accion: 'Cancelar' },
  ],
  ENVIADA: [
    { hacia: 'EN_REVISION', roles: ['LIDER', 'DIRECTOR'], accion: 'Tomar en revisión' },
    { hacia: 'CANCELADA', roles: ['SOLICITANTE', 'ADMIN'], requiereComentario: true, accion: 'Cancelar' },
  ],
  EN_REVISION: [
    { hacia: 'APROBADA', roles: ['LIDER', 'DIRECTOR'], accion: 'Aprobar' },
    { hacia: 'RECHAZADA', roles: ['LIDER', 'DIRECTOR'], requiereComentario: true, accion: 'Rechazar' },
    { hacia: 'BORRADOR', roles: ['LIDER', 'DIRECTOR'], requiereComentario: true, accion: 'Devolver para ajustes' },
  ],
  APROBADA: [{ hacia: 'ASIGNADA', roles: ['LIDER', 'DIRECTOR'], accion: 'Asignar' }],
  ASIGNADA: [{ hacia: 'EN_DESARROLLO', roles: ['INGENIERO', 'LIDER'], accion: 'Iniciar desarrollo' }],
  EN_DESARROLLO: [{ hacia: 'EN_VALIDACION', roles: ['INGENIERO', 'LIDER'], accion: 'Entregar a validación' }],
  EN_VALIDACION: [
    { hacia: 'EN_DESARROLLO', roles: ['SOLICITANTE', 'LIDER', 'DIRECTOR'], requiereComentario: true, accion: 'Devolver con hallazgos' },
    { hacia: 'CERRADA', roles: ['SOLICITANTE', 'LIDER', 'DIRECTOR'], accion: 'Aceptar y cerrar' },
  ],
  RECHAZADA: [],
  CERRADA: [],
  CANCELADA: [],
};

/** Transiciones que un usuario con estos roles puede ejecutar desde el estado actual. */
export function transicionesDisponibles(estado: EstadoSolicitud, roles: readonly Rol[]): ReglaTransicion[] {
  return MAQUINA_ESTADOS[estado].filter((r) => r.roles.some((rol) => roles.includes(rol)));
}

export const ETIQUETA_ESTADO: Record<EstadoSolicitud, string> = {
  BORRADOR: 'Borrador',
  ENVIADA: 'Enviada',
  EN_REVISION: 'En revisión',
  APROBADA: 'Aprobada',
  RECHAZADA: 'Rechazada',
  ASIGNADA: 'Asignada',
  EN_DESARROLLO: 'En desarrollo',
  EN_VALIDACION: 'En validación',
  CERRADA: 'Cerrada',
  CANCELADA: 'Cancelada',
};

/** Orden del camino feliz (línea de vida de la UI). */
export const LINEA_DE_VIDA: EstadoSolicitud[] = [
  'BORRADOR', 'ENVIADA', 'EN_REVISION', 'APROBADA', 'ASIGNADA', 'EN_DESARROLLO', 'EN_VALIDACION', 'CERRADA',
];

export const ESTADOS_FINALES: EstadoSolicitud[] = ['RECHAZADA', 'CERRADA', 'CANCELADA'];
