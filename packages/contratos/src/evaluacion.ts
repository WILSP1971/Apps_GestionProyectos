import { z } from 'zod';
import type { EstadoSolicitud } from './estados';
import type { FrenteAvance } from './calificacion';
import type { RolEnSolicitud } from './asignacion';

/** Tareas, avance por frente y evaluación/calificación (Sprint 6 · módulo M4). */
export const ESTADOS_TAREA = ['PENDIENTE', 'EN_PROGRESO', 'BLOQUEADA', 'COMPLETADA'] as const;
export type EstadoTarea = (typeof ESTADOS_TAREA)[number];
export const ETIQUETA_ESTADO_TAREA: Record<EstadoTarea, string> = {
  PENDIENTE: 'Pendiente', EN_PROGRESO: 'En progreso', BLOQUEADA: 'Bloqueada', COMPLETADA: 'Completada',
};

export const TIPOS_EVALUACION = ['AVANCE', 'CIERRE'] as const;
export type TipoEvaluacion = (typeof TIPOS_EVALUACION)[number];
export const ETIQUETA_TIPO_EVALUACION: Record<TipoEvaluacion, string> = {
  AVANCE: 'Seguimiento de avance', CIERRE: 'Evaluación de cierre',
};

/** Estados en los que se puede registrar cada tipo de evaluación. */
export const ESTADOS_EVALUABLES: Record<TipoEvaluacion, EstadoSolicitud[]> = {
  AVANCE: ['ASIGNADA', 'EN_DESARROLLO', 'EN_VALIDACION'],
  CIERRE: ['EN_VALIDACION', 'CERRADA'],
};
/** Estados en los que se pueden crear o mover tareas. */
export const ESTADOS_CON_TAREAS: EstadoSolicitud[] = ['ASIGNADA', 'EN_DESARROLLO', 'EN_VALIDACION'];

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD');

export const esquemaNuevaTarea = z.object({
  titulo: z.string().trim().min(3, 'Mínimo 3 caracteres').max(200),
  descripcion: z.string().trim().max(4000).optional(),
  grupoId: z.string().uuid().nullable().optional(),
  responsableId: z.string().uuid().nullable().optional(),
  peso: z.number().int().min(1).max(10).default(1),
  horasEstimadas: z.number().min(0).max(2000).nullable().optional(),
  fechaInicio: fecha.nullable().optional(),
  fechaFinPlan: fecha.nullable().optional(),
});
export type NuevaTarea = z.infer<typeof esquemaNuevaTarea>;

export const esquemaCambioTarea = esquemaNuevaTarea.partial().extend({
  version: z.number().int().min(1),
  estado: z.enum(ESTADOS_TAREA).optional(),
  avancePct: z.number().min(0).max(100).optional(),
  horasReales: z.number().min(0).max(5000).optional(),
});
export type CambioTarea = z.infer<typeof esquemaCambioTarea>;

export const esquemaEvaluacion = z.object({
  tipo: z.enum(TIPOS_EVALUACION),
  /** { CODIGO_CRITERIO: 1..5 } — deben venir todos los criterios activos */
  puntajes: z.record(z.string().min(1).max(40), z.number().int().min(1).max(5)),
  individuales: z.array(z.object({
    usuarioId: z.string().uuid(),
    puntaje: z.number().int().min(1).max(5),
    comentario: z.string().trim().max(1000).optional(),
  })).max(50).default([]),
  comentario: z.string().trim().max(4000).optional(),
});
export type NuevaEvaluacion = z.infer<typeof esquemaEvaluacion>;

export interface TareaVista {
  id: string;
  titulo: string;
  descripcion: string | null;
  grupoId: string | null;
  grupo: string | null;
  responsableId: string | null;
  responsable: string | null;
  estado: EstadoTarea;
  peso: number;
  avancePct: number;
  horasEstimadas: number | null;
  horasReales: number;
  fechaInicio: string | null;
  fechaFinPlan: string | null;
  version: number;
  /** En "Gestión y calificación": tarea general del proyecto de la solicitud (cuenta en su avance). */
  deProyecto?: boolean;
  proyectoCodigo?: string | null;
}

/** Tarea en la pantalla "Registrar avances" del ingeniero (de una solicitud o propia de un proyecto). */
export interface MiTarea extends TareaVista {
  solicitudId: string | null;
  solicitudCodigo: string | null;
  solicitudTitulo: string | null;
  proyectoId: string | null;
  proyectoCodigo: string | null;
  proyectoNombre: string | null;
  /** false si la solicitud o el proyecto ya no admite cambios (cerrado, cancelado…) */
  editable: boolean;
  /** Checklist de la tarea (Centro de trabajo) */
  subtareasTotal: number;
  subtareasHechas: number;
  /** Fecha/hora del último registro en la bitácora */
  ultimoRegistro: string | null;
  /** La propuso el propio ingeniero */
  creadaPorMi: boolean;
}

export interface CriterioCalificacion {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  peso: number;
}

export interface EvaluacionVista {
  id: string;
  tipo: TipoEvaluacion;
  avanceReportado: number;
  calificacionGlobal: number;
  calificacionLetra: string;
  calificacionTecnica: number | null;
  calificacionPlazos: number | null;
  evaluador: string;
  comentario: string | null;
  fecha: string;
  detalle: { codigo: string; puntaje: number }[];
  individuales: { usuarioId: string; nombre: string; puntaje: number; comentario: string | null }[];
}

export interface ContextoEvaluacion {
  solicitud: {
    id: string; codigo: string; titulo: string; estado: EstadoSolicitud; departamento: string;
    departamentoColor: string | null; solicitante: string; avancePct: number; fechaDeseada: string | null;
  };
  criterios: CriterioCalificacion[];
  tareas: TareaVista[];
  frentes: FrenteAvance[];
  equipo: { usuarioId: string; nombre: string; rol: RolEnSolicitud }[];
  grupos: { id: string; nombre: string }[];
  evaluaciones: EvaluacionVista[];
  /** Qué puede hacer quien consulta */
  permisos: { evaluar: boolean; gestionarTareas: boolean };
}

export interface ResumenEvaluable {
  id: string;
  codigo: string;
  titulo: string;
  estado: EstadoSolicitud;
  departamento: string;
  departamentoColor: string | null;
  avancePct: number;
  tareas: number;
  tareasCompletadas: number;
  ultimaNota: number | null;
  ultimaLetra: string | null;
  ultimaFecha: string | null;
}
