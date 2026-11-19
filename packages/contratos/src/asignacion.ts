import { z } from 'zod';
import { ROLES } from './estados';

/** Asignación de solicitudes a grupos de trabajo e ingenieros (Sprint 5). */
export const ROLES_EN_SOLICITUD = ['DESARROLLADOR', 'QA', 'REVISOR'] as const;
export type RolEnSolicitud = (typeof ROLES_EN_SOLICITUD)[number];

export const ETIQUETA_ROL_SOLICITUD: Record<RolEnSolicitud, string> = {
  DESARROLLADOR: 'Desarrollo', QA: 'Pruebas (QA)', REVISOR: 'Revisión',
};

export interface IngenieroCarga {
  usuarioId: string;
  nombre: string;
  avatar: string | null;
  grupos: string[];
  tecnologias: string[];
  solicitudesActivas: number;
  horasPendientes: number;
  capacidadSemana: number;
  cargaPct: number;
}

export interface GrupoTrabajo {
  id: string;
  nombre: string;
  descripcion: string | null;
  miembros: number;
}

export interface MiembroEquipo {
  usuarioId: string | null;
  grupoId: string | null;
  nombre: string;
  rol: RolEnSolicitud;
  horasEstimadas: number | null;
}

/**
 * PUT /asignacion/solicitudes/:id — define el equipo completo de la solicitud.
 * Si la solicitud está APROBADA pasa a ASIGNADA; si ya está en curso solo se actualiza el equipo.
 */
export const esquemaAsignacion = z.object({
  version: z.number().int().min(1),
  grupos: z.array(z.string().uuid()).max(10).default([]),
  ingenieros: z.array(z.object({
    usuarioId: z.string().uuid(),
    rol: z.enum(ROLES_EN_SOLICITUD).default('DESARROLLADOR'),
    horasEstimadas: z.number().min(0).max(2000).nullable().optional(),
  })).max(20).default([]),
  comentario: z.string().trim().max(2000).optional(),
}).refine((d) => d.grupos.length + d.ingenieros.length > 0, { message: 'Selecciona al menos un grupo o un ingeniero' });
export type Asignacion = z.infer<typeof esquemaAsignacion>;

// ---------------------------------------------------------------------
// Administración de usuarios y equipos (rol ADMIN)
// ---------------------------------------------------------------------
export interface CatalogosAdmin {
  roles: { codigo: string; nombre: string }[];
  departamentos: { id: string; codigo: string; nombre: string; colorHex: string }[];
  grupos: { id: string; nombre: string }[];
  tecnologias: { id: number; nombre: string; categoria: string | null }[];
}

export interface UsuarioAdmin {
  id: string;
  email: string;
  nombre: string;
  cargo: string | null;
  departamentoId: string | null;
  activo: boolean;
  ultimoAcceso: string | null;
  roles: string[];
  grupos: string[];
  tecnologias: number[];
  capacidadHoras: number;
}

export const esquemaCambioUsuario = z.object({
  cargo: z.string().trim().max(120).nullable().optional(),
  departamentoId: z.string().uuid().nullable().optional(),
  activo: z.boolean().optional(),
  roles: z.array(z.enum(ROLES)).max(ROLES.length).optional(),
  grupos: z.array(z.string().uuid()).max(20).optional(),
  tecnologias: z.array(z.number().int().positive()).max(50).optional(),
  capacidadHoras: z.number().min(1).max(80).optional(),
});
export type CambioUsuario = z.infer<typeof esquemaCambioUsuario>;
