import { z } from 'zod';
import { TIPOS_SOLICITUD, type TipoSolicitud } from './solicitudes';

/**
 * Catálogo de aplicaciones de software. Cada una se asigna a los tipos de requerimiento en los que
 * puede elegirse al crear una solicitud, y lleva sus tecnologías (la solicitud las hereda para
 * recomendar ingenieros en la asignación).
 */
export interface AplicacionVista {
  id: string;
  nombre: string;
  descripcion: string | null;
  tipos: TipoSolicitud[];
  tecnologias: string[];
  activo: boolean;
}

export const esquemaAplicacion = z.object({
  nombre: z.string().trim().min(2, 'Mínimo 2 caracteres').max(120),
  descripcion: z.string().trim().max(1000).optional().nullable(),
  tipos: z.array(z.enum(TIPOS_SOLICITUD)).min(1, 'Elige al menos un tipo de requerimiento'),
  tecnologias: z.array(z.string()).default([]),
  activo: z.boolean().default(true),
});
export type NuevaAplicacion = z.input<typeof esquemaAplicacion>;

/** Aplicaciones que se ofrecen para un tipo de requerimiento (activas, por nombre). */
export function aplicacionesPara(tipo: TipoSolicitud, apps: readonly AplicacionVista[]): AplicacionVista[] {
  return apps.filter((a) => a.activo && a.tipos.includes(tipo)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}
