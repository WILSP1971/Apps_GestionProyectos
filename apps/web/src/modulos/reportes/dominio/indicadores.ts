/**
 * Transformaciones puras para los reportes (sin React ni red; probadas con node:test).
 */
export type EstadoReporte = string;

/** Los 10 estados se agrupan en 5 etapas para que el gráfico apilado sea legible (máx. 5 colores). */
export const ETAPAS = [
  { clave: 'revision', etiqueta: 'En revisión', estados: ['ENVIADA', 'EN_REVISION'] },
  { clave: 'por_asignar', etiqueta: 'Por asignar', estados: ['APROBADA'] },
  { clave: 'ejecucion', etiqueta: 'En ejecución', estados: ['ASIGNADA', 'EN_DESARROLLO', 'EN_VALIDACION'] },
  { clave: 'cerradas', etiqueta: 'Cerradas', estados: ['CERRADA'] },
  { clave: 'descartadas', etiqueta: 'Rechazadas / canceladas', estados: ['RECHAZADA', 'CANCELADA'] },
] as const;
export type ClaveEtapa = (typeof ETAPAS)[number]['clave'];

export interface DepartamentoPorEtapa {
  departamento: string;
  color: string | null;
  porEtapa: Record<ClaveEtapa, number>;
  total: number;
}

export function agruparPorEtapa(filas: { departamento: string; color_hex: string | null; estado: string; total: number }[]): DepartamentoPorEtapa[] {
  const mapa = new Map<string, DepartamentoPorEtapa>();
  for (const f of filas) {
    const etapa = ETAPAS.find((e) => (e.estados as readonly string[]).includes(f.estado));
    if (!etapa) continue; // BORRADOR no cuenta: aún no es una solicitud enviada
    const d = mapa.get(f.departamento) ?? {
      departamento: f.departamento, color: f.color_hex,
      porEtapa: { revision: 0, por_asignar: 0, ejecucion: 0, cerradas: 0, descartadas: 0 }, total: 0,
    };
    d.porEtapa[etapa.clave] += f.total;
    d.total += f.total;
    mapa.set(f.departamento, d);
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total || a.departamento.localeCompare(b.departamento, 'es'));
}

/** Horas → texto corto legible ("18 h", "3,5 días"). */
export function duracion(horas: number | null | undefined): string {
  if (horas == null || Number.isNaN(horas)) return '—';
  if (horas < 48) return `${Math.round(horas)} h`;
  return `${(horas / 24).toLocaleString('es-CO', { maximumFractionDigits: 1 })} días`;
}

/** "2026-03" → "mar 26" */
export function etiquetaMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  const nombre = new Date(a!, (m ?? 1) - 1, 1).toLocaleDateString('es-CO', { month: 'short' }).replace('.', '');
  return `${nombre} ${String(a).slice(2)}`;
}

/** Escala "bonita" para el eje Y: máximo redondeado y marcas enteras. */
export function escalaY(maximo: number, marcas = 4): { max: number; ticks: number[] } {
  if (maximo <= 0) return { max: marcas, ticks: Array.from({ length: marcas + 1 }, (_, i) => i) };
  const bruto = maximo / marcas;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((p) => p >= bruto)!;
  const pasoEntero = Math.max(1, Math.ceil(paso));
  const max = pasoEntero * Math.ceil(maximo / pasoEntero);
  return { max, ticks: Array.from({ length: Math.round(max / pasoEntero) + 1 }, (_, i) => i * pasoEntero) };
}

/** CSV con separador ";" (Excel en español) y BOM para que abra con tildes correctas. */
export function aCsv<T extends object>(filas: T[], columnas: { clave: keyof T & string; titulo: string }[]): string {
  const celda = (v: unknown) => {
    if (v == null) return '';
    const t = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const lineas = [columnas.map((c) => celda(c.titulo)).join(';'), ...filas.map((f) => columnas.map((c) => celda(f[c.clave])).join(';'))];
  return `﻿${lineas.join('\r\n')}`;
}
