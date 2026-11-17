import { z } from 'zod';
import { ESTADOS } from './estados';

export const TIPOS_SOLICITUD = ['FUNCIONAL', 'TECNICA', 'MEJORA', 'INCIDENTE', 'CAMBIO'] as const;
export type TipoSolicitud = (typeof TIPOS_SOLICITUD)[number];

export const PRIORIDADES = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'] as const;
export type Prioridad = (typeof PRIORIDADES)[number];

export const ETIQUETA_TIPO: Record<TipoSolicitud, string> = {
  FUNCIONAL: 'Funcional', TECNICA: 'Técnica', MEJORA: 'Mejora', INCIDENTE: 'Incidente', CAMBIO: 'Cambio',
};
export const ETIQUETA_PRIORIDAD: Record<Prioridad, string> = {
  BAJA: 'Baja', MEDIA: 'Media', ALTA: 'Alta', CRITICA: 'Crítica',
};

export const esquemaCriterio = z.object({
  id: z.string().uuid(),
  orden: z.number().int().min(1),
  descripcion: z.string().trim().min(3, 'Describe el criterio (mínimo 3 caracteres)'),
  cumplido: z.boolean().default(false),
});
export type CriterioAceptacion = z.infer<typeof esquemaCriterio>;

/** Datos que captura el asistente "Crear Nueva Solicitud" y recibe POST /api/solicitudes */
export const esquemaNuevaSolicitud = z.object({
  id: z.string().uuid().optional(), // offline: el cliente genera el UUID (v7)
  titulo: z.string().trim().min(5, 'El título debe tener al menos 5 caracteres').max(200),
  descripcion: z.string().trim().min(20, 'Describe el requerimiento con más detalle (mínimo 20 caracteres)'),
  objetivos: z.string().trim().optional(),
  justificacion: z.string().trim().optional(),
  tipo: z.enum(TIPOS_SOLICITUD),
  prioridad: z.enum(PRIORIDADES),
  proyectoId: z.string().uuid().optional(),
  fechaDeseada: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida').optional().or(z.literal('')),
  tecnologias: z.array(z.string()).default([]),
  criterios: z.array(esquemaCriterio).min(1, 'Agrega al menos un criterio de aceptación'),
  enviar: z.boolean().default(false),
});
export type NuevaSolicitud = z.infer<typeof esquemaNuevaSolicitud>;

export const esquemaCambioEstado = z.object({
  hacia: z.enum(ESTADOS),
  version: z.number().int().min(1),
  comentario: z.string().trim().max(2000).optional(),
});
export type CambioEstado = z.infer<typeof esquemaCambioEstado>;

export const esquemaComentario = z.object({
  id: z.string().uuid().optional(),
  contenido: z.string().trim().min(1).max(10000),
  padreId: z.string().uuid().optional(),
});
