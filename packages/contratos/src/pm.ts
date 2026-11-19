/**
 * Reglas puras de la PM Suite (Sprint 7 · M5): finanzas/ROI, salud del cronograma, exposición de
 * riesgos y escala del Gantt. Sin dependencias: se usan en la API y en la web (y se prueban con node:test).
 */
const DIA = 86_400_000;
const redondear = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

// ---------------------------------------------------------------------
// Finanzas
// ---------------------------------------------------------------------
export interface EntradaFinanzas {
  presupuesto: number | null;
  costoOtros: number;          // gastos registrados a mano (licencias, servicios, proveedores…)
  tarifaHora: number | null;   // costo de una hora de trabajo del equipo
  horasReales: number;         // suma de horas reales de las tareas del proyecto
  horasEstimadas: number;      // suma de horas estimadas
  beneficioEsperado: number | null;
}

export interface Finanzas {
  costoTrabajo: number;
  costoTotal: number;
  costoEstimadoTotal: number | null; // proyección al terminar: trabajo estimado + otros
  consumoPresupuestoPct: number | null;
  desviacionPct: number | null;      // proyección vs presupuesto (+ = sobrecosto)
  roiPct: number | null;             // (beneficio − costo) / costo
  beneficioNeto: number | null;
}

export function calcularFinanzas(e: EntradaFinanzas): Finanzas {
  const tarifa = e.tarifaHora ?? 0;
  const costoTrabajo = redondear(e.horasReales * tarifa, 2);
  const costoTotal = redondear(costoTrabajo + e.costoOtros, 2);
  const costoEstimadoTotal = tarifa > 0 && e.horasEstimadas > 0
    ? redondear(Math.max(e.horasEstimadas, e.horasReales) * tarifa + e.costoOtros, 2)
    : null;
  const p = e.presupuesto && e.presupuesto > 0 ? e.presupuesto : null;
  return {
    costoTrabajo,
    costoTotal,
    costoEstimadoTotal,
    consumoPresupuestoPct: p ? redondear((costoTotal / p) * 100) : null,
    desviacionPct: p && costoEstimadoTotal != null ? redondear(((costoEstimadoTotal - p) / p) * 100) : null,
    roiPct: e.beneficioEsperado != null && costoTotal > 0 ? redondear(((e.beneficioEsperado - costoTotal) / costoTotal) * 100) : null,
    beneficioNeto: e.beneficioEsperado != null ? redondear(e.beneficioEsperado - costoTotal, 2) : null,
  };
}

// ---------------------------------------------------------------------
// Salud del cronograma (avance real vs tiempo transcurrido)
// ---------------------------------------------------------------------
export type Salud = 'SIN_PLAN' | 'EN_TIEMPO' | 'EN_RIESGO' | 'ATRASADO' | 'TERMINADO';

export interface ResultadoSalud {
  salud: Salud;
  tiempoPct: number | null;  // % del plazo transcurrido
  spi: number | null;        // índice de desempeño del cronograma ≈ avance / tiempo
  diasRestantes: number | null;
}

/** fechas en 'AAAA-MM-DD'; hoy en ms (inyectable para pruebas). */
export function saludCronograma(avancePct: number, inicio: string | null, fin: string | null, hoy = Date.now(), cerrado = false): ResultadoSalud {
  if (cerrado || avancePct >= 100) return { salud: 'TERMINADO', tiempoPct: null, spi: null, diasRestantes: null };
  if (!inicio || !fin) return { salud: 'SIN_PLAN', tiempoPct: null, spi: null, diasRestantes: null };
  const a = Date.parse(`${inicio}T00:00:00`), b = Date.parse(`${fin}T23:59:59`);
  const total = Math.max(b - a, DIA);
  const tiempo = Math.min(Math.max((hoy - a) / total, 0), 1.5);
  const tiempoPct = redondear(tiempo * 100);
  const diasRestantes = Math.ceil((b - hoy) / DIA);
  if (tiempo <= 0.05) return { salud: 'EN_TIEMPO', tiempoPct, spi: null, diasRestantes };
  const spi = redondear(avancePct / 100 / Math.min(tiempo, 1), 2);
  const salud: Salud = diasRestantes < 0 ? 'ATRASADO' : spi >= 0.9 ? 'EN_TIEMPO' : spi >= 0.7 ? 'EN_RIESGO' : 'ATRASADO';
  return { salud, tiempoPct, spi, diasRestantes };
}

export const ETIQUETA_SALUD: Record<Salud, string> = {
  SIN_PLAN: 'Sin fechas', EN_TIEMPO: 'En tiempo', EN_RIESGO: 'En riesgo', ATRASADO: 'Atrasado', TERMINADO: 'Terminado',
};

// ---------------------------------------------------------------------
// Riesgos: exposición = probabilidad × impacto (1–25)
// ---------------------------------------------------------------------
export type NivelExposicion = 'BAJO' | 'MEDIO' | 'ALTO' | 'CRITICO';

export function nivelExposicion(probabilidad: number, impacto: number): NivelExposicion {
  const e = probabilidad * impacto;
  if (e >= 15) return 'CRITICO';
  if (e >= 10) return 'ALTO';
  if (e >= 5) return 'MEDIO';
  return 'BAJO';
}

export const ETIQUETA_EXPOSICION: Record<NivelExposicion, string> = {
  BAJO: 'Bajo', MEDIO: 'Medio', ALTO: 'Alto', CRITICO: 'Crítico',
};

// ---------------------------------------------------------------------
// Gantt: posiciones relativas (0–100 %) dentro de una escala de fechas
// ---------------------------------------------------------------------
export interface ItemGantt { id: string; inicio: string | null; fin: string | null }
export interface EscalaGantt { desde: number; hasta: number; dias: number }

const aMs = (f: string) => Date.parse(`${f.slice(0, 10)}T00:00:00`);

/** Escala que cubre todos los ítems (y hoy), con 3 días de margen a cada lado (el último día cuenta completo). */
export function escalaGantt(items: ItemGantt[], hoy = Date.now(), extra: (string | null)[] = []): EscalaGantt {
  const fechas = [...items.flatMap((i) => [i.inicio, i.fin]), ...extra].filter((f): f is string => !!f).map(aMs);
  const min = Math.min(hoy, ...fechas), max = Math.max(hoy, ...fechas);
  const desde = min - 3 * DIA, hasta = max + 4 * DIA;
  return { desde, hasta, dias: Math.round((hasta - desde) / DIA) };
}

/** left/width en % de la escala. Sin fin: barra de 1 día. Sin inicio: null (no se dibuja). */
export function posicionGantt(inicio: string | null, fin: string | null, e: EscalaGantt): { left: number; width: number } | null {
  if (!inicio) return null;
  const a = aMs(inicio);
  const b = (fin ? aMs(fin) : a) + DIA; // el día de fin cuenta completo
  const total = e.hasta - e.desde;
  return {
    left: redondear(((a - e.desde) / total) * 100, 3),
    width: redondear((Math.max(b - a, DIA) / total) * 100, 3),
  };
}
