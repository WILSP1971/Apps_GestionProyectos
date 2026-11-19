import { AlertTriangle, CheckCircle2, CircleDashed, Clock, Flag } from 'lucide-react';
import {
  ETIQUETA_EXPOSICION, ETIQUETA_ESTADO_PROYECTO, ETIQUETA_SALUD, nivelExposicion,
  type EstadoProyecto, type NivelExposicion, type Salud,
} from '@sierraflow/contratos';
import { cn } from '@/lib/utils';

/** Montos sin decimales en la moneda del proyecto: $ 12.500.000 */
export function dinero(valor: number | null | undefined, moneda = 'COP'): string {
  if (valor == null) return '—';
  try {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: moneda, maximumFractionDigits: 0 }).format(valor);
  } catch {
    return `${moneda} ${Math.round(valor).toLocaleString('es-CO')}`;
  }
}

/** Monto abreviado para tarjetas: $ 12,5 M */
export function dineroCorto(valor: number | null | undefined, moneda = 'COP'): string {
  if (valor == null) return '—';
  const abs = Math.abs(valor);
  if (abs >= 1e9) return `${dinero(0, moneda).replace(/0.*$/, '')}${(valor / 1e9).toLocaleString('es-CO', { maximumFractionDigits: 1 })} mil M`;
  if (abs >= 1e6) return `${dinero(0, moneda).replace(/0.*$/, '')}${(valor / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M`;
  return dinero(valor, moneda);
}

export const fechaCorta = (iso: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const ESTILO_SALUD: Record<Salud, { clase: string; icono: React.ElementType }> = {
  SIN_PLAN: { clase: 'bg-slate-500/15 text-slate-300 ring-slate-500/30', icono: CircleDashed },
  EN_TIEMPO: { clase: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30', icono: CheckCircle2 },
  EN_RIESGO: { clase: 'bg-amber-500/15 text-amber-200 ring-amber-500/30', icono: Clock },
  ATRASADO: { clase: 'bg-red-500/15 text-red-300 ring-red-500/30', icono: AlertTriangle },
  TERMINADO: { clase: 'bg-sky-500/15 text-sky-200 ring-sky-500/30', icono: Flag },
};

/** Estado del cronograma con icono + texto (nunca solo color). */
export function InsigniaSalud({ salud, className }: { salud: Salud; className?: string }) {
  const { clase, icono: Icono } = ESTILO_SALUD[salud];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset', clase, className)}>
      <Icono className="size-3" />{ETIQUETA_SALUD[salud]}
    </span>
  );
}

const ESTILO_ESTADO: Record<EstadoProyecto, string> = {
  PLANEACION: 'text-sky-200 bg-sky-500/10', EN_EJECUCION: 'text-teal-200 bg-teal-500/10', EN_PAUSA: 'text-amber-200 bg-amber-500/10',
  CERRADO: 'text-slate-300 bg-slate-500/15', CANCELADO: 'text-red-300 bg-red-500/10',
};
export function InsigniaEstadoProyecto({ estado }: { estado: EstadoProyecto }) {
  return <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-medium', ESTILO_ESTADO[estado])}>{ETIQUETA_ESTADO_PROYECTO[estado]}</span>;
}

/** Colores de estado (bajo → crítico) para la matriz de riesgos; siempre acompañados de texto. */
export const COLOR_EXPOSICION: Record<NivelExposicion, { celda: string; texto: string; punto: string }> = {
  BAJO: { celda: 'bg-emerald-500/15', texto: 'text-emerald-300', punto: 'bg-emerald-400' },
  MEDIO: { celda: 'bg-amber-500/15', texto: 'text-amber-200', punto: 'bg-amber-400' },
  ALTO: { celda: 'bg-orange-500/25', texto: 'text-orange-200', punto: 'bg-orange-400' },
  CRITICO: { celda: 'bg-red-500/30', texto: 'text-red-200', punto: 'bg-red-400' },
};

export function InsigniaExposicion({ probabilidad, impacto }: { probabilidad: number; impacto: number }) {
  const n = nivelExposicion(probabilidad, impacto);
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium', COLOR_EXPOSICION[n].celda, COLOR_EXPOSICION[n].texto)}>
      <span className="tabular-nums">{probabilidad * impacto}</span> · {ETIQUETA_EXPOSICION[n]}
    </span>
  );
}
