import { z } from 'zod';
import type { EstadoSolicitud } from './estados';
import type { Finanzas, ResultadoSalud } from './pm';
import type { TareaVista } from './evaluacion';

/** Proyectos, riesgos y deuda técnica (Sprint 7 · PM Suite). */
export const ESTADOS_PROYECTO = ['PLANEACION', 'EN_EJECUCION', 'EN_PAUSA', 'CERRADO', 'CANCELADO'] as const;
export type EstadoProyecto = (typeof ESTADOS_PROYECTO)[number];
export const ETIQUETA_ESTADO_PROYECTO: Record<EstadoProyecto, string> = {
  PLANEACION: 'Planeación', EN_EJECUCION: 'En ejecución', EN_PAUSA: 'En pausa', CERRADO: 'Cerrado', CANCELADO: 'Cancelado',
};

export const ESTADOS_RIESGO = ['ABIERTO', 'MITIGADO', 'MATERIALIZADO', 'CERRADO'] as const;
export type EstadoRiesgo = (typeof ESTADOS_RIESGO)[number];
export const ETIQUETA_ESTADO_RIESGO: Record<EstadoRiesgo, string> = {
  ABIERTO: 'Abierto', MITIGADO: 'Mitigado', MATERIALIZADO: 'Materializado', CERRADO: 'Cerrado',
};

export const MONEDAS = ['COP', 'USD', 'EUR'] as const;

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD');
const dinero = z.number().min(0).max(1e13);

const camposProyecto = {
  nombre: z.string().trim().min(3, 'Mínimo 3 caracteres').max(160),
  descripcion: z.string().trim().max(4000).nullable().optional(),
  departamentoId: z.string().uuid().nullable().optional(),
  directorId: z.string().uuid().nullable().optional(),
  fechaInicio: fecha.nullable().optional(),
  fechaFinPlan: fecha.nullable().optional(),
  presupuesto: dinero.nullable().optional(),
  costoOtros: dinero.optional(),
  tarifaHora: dinero.nullable().optional(),
  beneficioEsperado: dinero.nullable().optional(),
  moneda: z.enum(MONEDAS).optional(),
};
const fechasCoherentes = (p: { fechaInicio?: string | null; fechaFinPlan?: string | null }) =>
  !p.fechaInicio || !p.fechaFinPlan || p.fechaFinPlan >= p.fechaInicio;

export const esquemaNuevoProyecto = z.object(camposProyecto)
  .refine(fechasCoherentes, { message: 'La fecha de fin debe ser posterior al inicio', path: ['fechaFinPlan'] });
export type NuevoProyecto = z.infer<typeof esquemaNuevoProyecto>;

export const esquemaCambioProyecto = z.object({
  ...camposProyecto,
  nombre: camposProyecto.nombre.optional(),
  estado: z.enum(ESTADOS_PROYECTO).optional(),
  version: z.number().int().min(1),
}).refine(fechasCoherentes, { message: 'La fecha de fin debe ser posterior al inicio', path: ['fechaFinPlan'] });
export type CambioProyecto = z.infer<typeof esquemaCambioProyecto>;

export const esquemaSolicitudesProyecto = z.object({
  agregar: z.array(z.string().uuid()).max(200).default([]),
  quitar: z.array(z.string().uuid()).max(200).default([]),
});
export type SolicitudesProyecto = z.infer<typeof esquemaSolicitudesProyecto>;

export const esquemaRiesgo = z.object({
  titulo: z.string().trim().min(3).max(200),
  descripcion: z.string().trim().max(4000).nullable().optional(),
  probabilidad: z.number().int().min(1).max(5),
  impacto: z.number().int().min(1).max(5),
  planMitigacion: z.string().trim().max(4000).nullable().optional(),
  responsableId: z.string().uuid().nullable().optional(),
  solicitudId: z.string().uuid().nullable().optional(),
});
export type NuevoRiesgo = z.infer<typeof esquemaRiesgo>;
export const esquemaCambioRiesgo = esquemaRiesgo.partial().extend({
  estado: z.enum(ESTADOS_RIESGO).optional(),
  version: z.number().int().min(1),
});
export type CambioRiesgo = z.infer<typeof esquemaCambioRiesgo>;

export const esquemaDeuda = z.object({
  descripcion: z.string().trim().min(3).max(2000),
  storyPoints: z.number().int().min(1).max(100),
  solicitudId: z.string().uuid().nullable().optional(),
});
export type NuevaDeuda = z.infer<typeof esquemaDeuda>;
export const esquemaCambioDeuda = esquemaDeuda.partial().extend({ resuelta: z.boolean().optional() });
export type CambioDeuda = z.infer<typeof esquemaCambioDeuda>;

// ---------------------------------------------------------------------
export interface ResumenProyecto {
  id: string;
  codigo: string;
  nombre: string;
  estado: EstadoProyecto;
  departamento: string | null;
  departamentoColor: string | null;
  director: string | null;
  fechaInicio: string | null;
  fechaFinPlan: string | null;
  moneda: string;
  presupuesto: number | null;
  solicitudes: number;
  avancePct: number;
  riesgosAltos: number;
  deudaPendiente: number; // story points sin resolver
  salud: ResultadoSalud;
  finanzas: Finanzas;
}

export interface RiesgoVista {
  id: string;
  titulo: string;
  descripcion: string | null;
  probabilidad: number;
  impacto: number;
  exposicion: number;
  planMitigacion: string | null;
  responsableId: string | null;
  responsable: string | null;
  solicitudId: string | null;
  solicitudCodigo: string | null;
  estado: EstadoRiesgo;
  version: number;
  actualizadoEn: string;
}

export interface DeudaVista {
  id: string;
  descripcion: string;
  storyPoints: number;
  solicitudId: string | null;
  solicitudCodigo: string | null;
  resuelta: boolean;
  creadoEn: string;
  resueltaEn: string | null;
}

export interface SolicitudDeProyecto {
  id: string;
  codigo: string;
  titulo: string;
  estado: EstadoSolicitud;
  avancePct: number;
  inicio: string | null;   // AAAA-MM-DD (inicio de desarrollo, aprobación o envío)
  fin: string | null;      // cierre real o fecha deseada
  cerrada: boolean;
  tareas: { id: string; titulo: string; grupo: string | null; responsable: string | null; estado: string;
    avancePct: number; inicio: string | null; fin: string | null; dependeDe: string | null }[];
}

export interface DetalleProyecto extends ResumenProyecto {
  descripcion: string | null;
  departamentoId: string | null;
  directorId: string | null;
  costoOtros: number;
  tarifaHora: number | null;
  beneficioEsperado: number | null;
  horasReales: number;
  horasEstimadas: number;
  version: number;
  solicitudesDetalle: SolicitudDeProyecto[];
  /** Regla 3: tareas propias del proyecto (gestión, capacitación, despliegue…), sin solicitud */
  tareasProyecto: TareaVista[];
  riesgos: RiesgoVista[];
  deuda: DeudaVista[];
  permisos: { editar: boolean };
}

export interface CatalogosProyecto {
  departamentos: { id: string; nombre: string }[];
  directores: { id: string; nombre: string }[];
  responsables: { id: string; nombre: string }[];
  grupos: { id: string; nombre: string }[];
  solicitudesDisponibles: { id: string; codigo: string; titulo: string; estado: EstadoSolicitud; departamento: string }[];
}
