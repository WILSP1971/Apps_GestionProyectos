import { Rol } from '../../../compartido/dominio/usuario-actual';

/**
 * Value Object: estado de la solicitud y su máquina de estados.
 * Alineado con packages/contratos/src/estados.ts y la tabla transiciones_estado.
 */
export const ESTADOS = [
  'BORRADOR', 'ENVIADA', 'EN_REVISION', 'APROBADA', 'RECHAZADA',
  'ASIGNADA', 'EN_DESARROLLO', 'EN_VALIDACION', 'CERRADA', 'CANCELADA',
] as const;
export type EstadoSolicitud = (typeof ESTADOS)[number];

interface Regla {
  hacia: EstadoSolicitud;
  roles: Rol[];
  requiereComentario?: boolean;
}

export const MAQUINA_ESTADOS: Record<EstadoSolicitud, Regla[]> = {
  BORRADOR: [
    { hacia: 'ENVIADA', roles: ['SOLICITANTE', 'LIDER', 'DIRECTOR'] },
    { hacia: 'CANCELADA', roles: ['SOLICITANTE', 'ADMIN'] },
  ],
  ENVIADA: [
    { hacia: 'EN_REVISION', roles: ['LIDER', 'DIRECTOR'] },
    { hacia: 'CANCELADA', roles: ['SOLICITANTE', 'ADMIN'], requiereComentario: true },
  ],
  EN_REVISION: [
    { hacia: 'APROBADA', roles: ['LIDER', 'DIRECTOR'] },
    { hacia: 'RECHAZADA', roles: ['LIDER', 'DIRECTOR'], requiereComentario: true },
    { hacia: 'BORRADOR', roles: ['LIDER', 'DIRECTOR'], requiereComentario: true },
  ],
  APROBADA: [{ hacia: 'ASIGNADA', roles: ['LIDER', 'DIRECTOR'] }],
  ASIGNADA: [{ hacia: 'EN_DESARROLLO', roles: ['INGENIERO', 'LIDER'] }],
  EN_DESARROLLO: [{ hacia: 'EN_VALIDACION', roles: ['INGENIERO', 'LIDER'] }],
  EN_VALIDACION: [
    { hacia: 'EN_DESARROLLO', roles: ['SOLICITANTE', 'LIDER', 'DIRECTOR', 'ADMIN'], requiereComentario: true },
    { hacia: 'CERRADA', roles: ['SOLICITANTE', 'LIDER', 'DIRECTOR'] },
  ],
  RECHAZADA: [],
  CERRADA: [],
  CANCELADA: [],
};

export function buscarRegla(desde: EstadoSolicitud, hacia: EstadoSolicitud): Regla | undefined {
  return MAQUINA_ESTADOS[desde].find((r) => r.hacia === hacia);
}
