import type { EstadoSolicitud, EvaluacionVista } from '@sierraflow/contratos';
import { apiFetch } from '@/lib/api';
import { dbLocal } from '@/lib/offline/db';
import { INGENIEROS_DEMO } from '@/modulos/asignacion/infraestructura/fuente-asignacion';

/** Respuestas del servicio de analítica (services/analitica/app/rutas/kpis.py). */
export interface Resumen { total: number; en_ejecucion: number; prioritarias: number; cerradas: number; lead_time_horas: number | null }
export interface FilaDepartamento { departamento: string; color_hex: string | null; estado: EstadoSolicitud; total: number }
export interface Sla { cumplimiento_pct: number | null; vencidas_abiertas: number }
export interface FilaTendencia { mes: string; creadas: number; cerradas: number; rechazadas: number }
export interface FilaTiempos {
  departamento: string; color_hex: string | null; cerradas: number;
  respuesta_horas: number | null; lead_time_horas: number | null; cycle_time_horas: number | null;
}
export interface FilaCarga { usuario_id: string; nombre_completo: string; solicitudes_activas: number; horas_pendientes: number; capacidad_semana: number; carga_pct: number }
export interface Calificaciones {
  ingenieros: { usuario_id: string; nombre_completo: string; evaluaciones: number; promedio_1a5: number; promedio_0a10: number }[];
  departamentos: { departamento: string; color_hex: string | null; solicitudes_evaluadas: number; promedio_global: number }[];
  distribucion: { letra: string; total: number }[];
}

export interface DatosReportes {
  resumen: Resumen;
  departamentos: FilaDepartamento[];
  sla: Sla;
  tendencia: FilaTendencia[];
  tiempos: FilaTiempos[];
  carga: FilaCarga[];
  calificaciones: Calificaciones;
}

export interface FuenteReportes { cargar(dias: number): Promise<DatosReportes> }

const kpi = <T,>(ruta: string) => apiFetch<T>(`/kpis/${ruta}`, { servicio: 'analitica' });

export const fuenteAnalitica: FuenteReportes = {
  async cargar(dias) {
    const [resumen, departamentos, sla, tendencia, tiempos, carga, calificaciones] = await Promise.all([
      kpi<Resumen>('resumen'), kpi<FilaDepartamento[]>('departamentos'), kpi<Sla>('sla'),
      kpi<FilaTendencia[]>('tendencia?meses=12'), kpi<FilaTiempos[]>(`tiempos?dias=${dias}`),
      kpi<FilaCarga[]>('carga-ingenieros'), kpi<Calificaciones>('calificaciones'),
    ]);
    return { resumen, departamentos, sla, tendencia, tiempos, carga, calificaciones };
  },
};

// ---------------------------------------------------------------------
// Modo demo: mismos indicadores calculados sobre los datos locales
// ---------------------------------------------------------------------
const LETRAS = ['A+', 'A', 'B+', 'B', 'C', 'D'];
const mesDe = (iso: string) => iso.slice(0, 7);
const horasEntre = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;
const promedio = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export const fuenteDemo: FuenteReportes = {
  async cargar(dias) {
    const todas = await dbLocal.solicitudes.toArray();
    const fechaDe = (s: (typeof todas)[number], estado: EstadoSolicitud) =>
      [...s.historial].reverse().find((h) => h.estadoNuevo === estado)?.fecha ?? null;

    const cerradas = todas.filter((s) => s.estado === 'CERRADA');
    const leads = cerradas.map((s) => {
      const envio = fechaDe(s, 'ENVIADA') ?? s.creadoEn;
      return horasEntre(envio, fechaDe(s, 'CERRADA') ?? s.actualizadoEn);
    });

    const conteo = new Map<string, FilaDepartamento>();
    for (const s of todas.filter((x) => x.estado !== 'BORRADOR')) {
      const k = `${s.departamento}|${s.estado}`;
      const f = conteo.get(k) ?? { departamento: s.departamento, color_hex: s.departamentoColor ?? null, estado: s.estado, total: 0 };
      f.total++;
      conteo.set(k, f);
    }

    const hoy = new Date();
    const tendencia: FilaTendencia[] = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - 11 + i, 1);
      const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return {
        mes,
        creadas: todas.filter((s) => mesDe(s.creadoEn) === mes).length,
        cerradas: cerradas.filter((s) => mesDe(fechaDe(s, 'CERRADA') ?? s.actualizadoEn) === mes).length,
        rechazadas: todas.filter((s) => s.estado === 'RECHAZADA' && mesDe(s.actualizadoEn) === mes).length,
      };
    });

    const limite = Date.now() - dias * 86_400_000;
    const recientes = cerradas.filter((s) => new Date(fechaDe(s, 'CERRADA') ?? s.actualizadoEn).getTime() > limite);
    const tiemposDe = (lista: typeof cerradas, departamento: string, color: string | null): FilaTiempos => ({
      departamento, color_hex: color, cerradas: lista.length,
      respuesta_horas: promedio(lista.flatMap((s) => {
        const a = fechaDe(s, 'ENVIADA'); const b = fechaDe(s, 'APROBADA');
        return a && b ? [horasEntre(a, b)] : [];
      })),
      lead_time_horas: promedio(lista.map((s) => horasEntre(fechaDe(s, 'ENVIADA') ?? s.creadoEn, fechaDe(s, 'CERRADA') ?? s.actualizadoEn))),
      cycle_time_horas: promedio(lista.flatMap((s) => {
        const a = fechaDe(s, 'EN_DESARROLLO'); const b = fechaDe(s, 'CERRADA');
        return a && b ? [horasEntre(a, b)] : [];
      })),
    });
    const porDepto = [...new Set(recientes.map((s) => s.departamento))].sort().map((d) =>
      tiemposDe(recientes.filter((s) => s.departamento === d), d, recientes.find((s) => s.departamento === d)?.departamentoColor ?? null));

    // Calificaciones guardadas por el módulo de evaluación en modo demo
    const evaluaciones = (await dbLocal.meta.toArray())
      .filter((m) => m.clave.startsWith('evaluacion:'))
      .map((m) => ({ id: m.clave.slice(11), evs: (m.valor as { evaluaciones: EvaluacionVista[] }).evaluaciones ?? [] }));
    const ultimas = evaluaciones.filter((e) => e.evs.length).map((e) => ({ s: todas.find((x) => x.id === e.id), e: e.evs[0]! }));
    const porIngeniero = new Map<string, { nombre: string; puntajes: number[] }>();
    for (const { evs } of evaluaciones) for (const ev of evs) for (const i of ev.individuales) {
      const f = porIngeniero.get(i.usuarioId) ?? { nombre: i.nombre, puntajes: [] };
      f.puntajes.push(i.puntaje);
      porIngeniero.set(i.usuarioId, f);
    }
    const deptos = new Map<string, { color: string | null; notas: number[] }>();
    for (const { s, e } of ultimas) {
      if (!s) continue;
      const f = deptos.get(s.departamento) ?? { color: s.departamentoColor ?? null, notas: [] };
      f.notas.push(e.calificacionGlobal);
      deptos.set(s.departamento, f);
    }

    return {
      resumen: {
        total: todas.length,
        en_ejecucion: todas.filter((s) => ['ASIGNADA', 'EN_DESARROLLO', 'EN_VALIDACION'].includes(s.estado)).length,
        prioritarias: todas.filter((s) => ['ALTA', 'CRITICA'].includes(s.prioridad) && !['CERRADA', 'CANCELADA', 'RECHAZADA'].includes(s.estado)).length,
        cerradas: cerradas.length,
        lead_time_horas: promedio(leads),
      },
      departamentos: [...conteo.values()],
      sla: { cumplimiento_pct: null, vencidas_abiertas: 0 },
      tendencia,
      tiempos: [tiemposDe(recientes, 'Total', null), ...porDepto],
      carga: INGENIEROS_DEMO.map((i) => ({
        usuario_id: i.usuarioId, nombre_completo: i.nombre, solicitudes_activas: i.solicitudesActivas,
        horas_pendientes: i.horasPendientes, capacidad_semana: i.capacidadSemana, carga_pct: Math.min(100, i.cargaPct),
      })),
      calificaciones: {
        ingenieros: [...porIngeniero.entries()].map(([id, f]) => {
          const p = f.puntajes.reduce((a, b) => a + b, 0) / f.puntajes.length;
          return { usuario_id: id, nombre_completo: f.nombre, evaluaciones: f.puntajes.length,
            promedio_1a5: Math.round(p * 100) / 100, promedio_0a10: Math.round(((p - 1) / 4) * 1000) / 100 };
        }).sort((a, b) => b.promedio_0a10 - a.promedio_0a10),
        departamentos: [...deptos.entries()].map(([d, f]) => ({
          departamento: d, color_hex: f.color, solicitudes_evaluadas: f.notas.length,
          promedio_global: Math.round((f.notas.reduce((a, b) => a + b, 0) / f.notas.length) * 100) / 100,
        })),
        distribucion: LETRAS.map((l) => ({ letra: l, total: ultimas.filter((u) => u.e.calificacionLetra === l).length })),
      },
    };
  },
};
