import { z } from 'zod';
import { ESTADOS_TAREA, type EstadoTarea, type MiTarea } from './evaluacion';
import type { EstadoSolicitud } from './estados';

/**
 * Centro de trabajo del ingeniero ("Registrar avances"): checklist de subtareas, bitácora de
 * avances con horas, nota y evidencia, y tareas que el propio ingeniero propone.
 */
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD');

export const esquemaRegistroAvance = z.object({
  version: z.number().int().min(1),
  avancePct: z.number().min(0).max(100).optional(),
  estado: z.enum(ESTADOS_TAREA).optional(),
  /** Horas de ESTA sesión de trabajo (se suman a las horas reales de la tarea). */
  horas: z.number().min(0).max(24).default(0),
  fechaTrabajo: fecha.optional(),
  nota: z.string().trim().max(4000).optional(),
  evidenciaUrl: z.string().trim().max(500).regex(/^https?:\/\/\S+$/i, 'El enlace debe empezar por http:// o https://').optional(),
}).refine((d) => d.avancePct !== undefined || d.estado !== undefined || d.horas > 0 || !!d.nota || !!d.evidenciaUrl, {
  message: 'Registra al menos un cambio: avance, estado, horas, nota o evidencia',
});
export type RegistroAvanceNuevo = z.input<typeof esquemaRegistroAvance>;

export const esquemaSubtarea = z.object({ titulo: z.string().trim().min(2, 'Mínimo 2 caracteres').max(200) });
export type NuevaSubtarea = z.infer<typeof esquemaSubtarea>;
export const esquemaCambioSubtarea = z.object({
  titulo: z.string().trim().min(2).max(200).optional(),
  completada: z.boolean().optional(),
}).refine((d) => d.titulo !== undefined || d.completada !== undefined, { message: 'Nada que cambiar' });
export type CambioSubtarea = z.infer<typeof esquemaCambioSubtarea>;

export interface SubtareaVista {
  id: string;
  titulo: string;
  completada: boolean;
  completadaEn: string | null;
  completadaPor: string | null;
  orden: number;
}

export const TIPOS_REGISTRO = ['AVANCE', 'CREACION', 'SUBTAREA'] as const;
export type TipoRegistro = (typeof TIPOS_REGISTRO)[number];

export interface RegistroAvance {
  id: string;
  tareaId: string;
  tareaTitulo: string;
  usuarioId: string;
  usuario: string;
  tipo: TipoRegistro;
  avanceAnterior: number | null;
  avanceNuevo: number | null;
  estadoAnterior: EstadoTarea | null;
  estadoNuevo: EstadoTarea | null;
  horas: number;
  fechaTrabajo: string;
  nota: string | null;
  evidenciaUrl: string | null;
  creadoEn: string;
}

export interface DetalleTarea {
  tarea: MiTarea;
  subtareas: SubtareaVista[];
  bitacora: RegistroAvance[];
  /** Estado de la solicitud dueña (para el pipeline); null en tareas del proyecto. */
  estadoSolicitud: EstadoSolicitud | null;
  permisos: { registrar: boolean; checklist: boolean };
}

export interface MiActividad {
  recientes: RegistroAvance[];
  /** Últimos 14 días, incluidos los días sin horas (fecha AAAA-MM-DD). */
  horasPorDia: { fecha: string; horas: number }[];
}

/** Dónde puede crear tareas el ingeniero: solicitudes de su equipo y sus proyectos activos. */
export interface ContextoTrabajo {
  tipo: 'SOLICITUD' | 'PROYECTO';
  id: string;
  codigo: string;
  titulo: string;
  proyecto: string | null;
}
export interface OpcionesNuevaTarea {
  contextos: ContextoTrabajo[];
  grupos: { id: string; nombre: string }[];
}

// ---------------------------------------------------------------------
// Funciones puras (las usan la API, la web y el modo demo)
// ---------------------------------------------------------------------

/** % sugerido por el checklist (múltiplos de 5), o null si no hay subtareas. */
export function porcentajeSugerido(subtareas: Pick<SubtareaVista, 'completada'>[]): number | null {
  if (!subtareas.length) return null;
  const pct = (subtareas.filter((s) => s.completada).length / subtareas.length) * 100;
  return Math.round(pct / 5) * 5;
}

/** Rellena los días sin registros para que la serie de horas sea continua. */
export function serieHoras(registros: { fecha: string; horas: number }[], hasta: string, dias = 14): { fecha: string; horas: number }[] {
  const mapa = new Map<string, number>();
  for (const r of registros) mapa.set(r.fecha, (mapa.get(r.fecha) ?? 0) + r.horas);
  const fin = new Date(`${hasta}T00:00:00Z`);
  return Array.from({ length: dias }, (_, i) => {
    const d = new Date(fin);
    d.setUTCDate(fin.getUTCDate() - (dias - 1 - i));
    const f = d.toISOString().slice(0, 10);
    return { fecha: f, horas: Math.round((mapa.get(f) ?? 0) * 100) / 100 };
  });
}

/**
 * Aplica un registro de avance a la tarea con las mismas reglas que el trigger fn_tarea_completada:
 * 100 % ⇒ COMPLETADA; COMPLETADA ⇒ 100 %; reabrir una completada la deja en 90 %; > 0 % saca de PENDIENTE.
 */
export function aplicarRegistro(
  t: { estado: EstadoTarea; avancePct: number; horasReales: number },
  r: { estado?: EstadoTarea; avancePct?: number; horas?: number },
): { estado: EstadoTarea; avancePct: number; horasReales: number } {
  let estado = r.estado ?? t.estado;
  let avance = r.avancePct ?? t.avancePct;
  const horasReales = Math.round((t.horasReales + (r.horas ?? 0)) * 100) / 100;
  if (estado === 'COMPLETADA') avance = 100;
  else if (t.estado === 'COMPLETADA' && avance === 100) avance = 90;
  else if (avance >= 100) { avance = 100; estado = 'COMPLETADA'; }
  else if (avance > 0 && estado === 'PENDIENTE') estado = 'EN_PROGRESO';
  return { estado, avancePct: avance, horasReales };
}
