'use client';

import { Check, CircleDashed, CircleDot, FileText, GitBranch, GitPullRequest, Link2, PenTool, Ban } from 'lucide-react';
import { ETIQUETA_ESTADO, ETIQUETA_ESTADO_TAREA, type EstadoSolicitud, type EstadoTarea } from '@sierraflow/contratos';
import { cn } from '@/lib/utils';

export const hoyIso = () => new Date().toISOString().slice(0, 10);
export const estaVencida = (t: { estado: EstadoTarea; fechaFinPlan: string | null }) =>
  t.estado !== 'COMPLETADA' && !!t.fechaFinPlan && t.fechaFinPlan < hoyIso();

const fmtCorta = new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short' });
export const fechaCorta = (iso: string | null) => (iso ? fmtCorta.format(new Date(`${iso.slice(0, 10)}T12:00:00`)) : '—');

/** "hace 5 min", "ayer", "12 nov". */
export function relativo(iso: string | null): string {
  if (!iso) return '—';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'ahora';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86_400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 172_800) return 'ayer';
  if (s < 604_800) return `hace ${Math.floor(s / 86_400)} días`;
  return fmtCorta.format(new Date(iso));
}

/** Días hasta la entrega: "vence hoy", "en 3 días", "vencida hace 2 días". */
export function plazo(fin: string | null): { texto: string; tono: 'ok' | 'pronto' | 'vencida' } | null {
  if (!fin) return null;
  const d = Math.round((Date.parse(`${fin}T12:00:00`) - Date.parse(`${hoyIso()}T12:00:00`)) / 86_400_000);
  if (d < 0) return { texto: `vencida hace ${-d} ${-d === 1 ? 'día' : 'días'}`, tono: 'vencida' };
  if (d === 0) return { texto: 'vence hoy', tono: 'pronto' };
  if (d <= 2) return { texto: `vence en ${d} ${d === 1 ? 'día' : 'días'}`, tono: 'pronto' };
  return { texto: `entrega ${fechaCorta(fin)}`, tono: 'ok' };
}

// ------------------------------------------------------------------ estado de tarea
export const ESTILO_ESTADO: Record<EstadoTarea, { pill: string; punto: string; barra: string; Icono: typeof Check }> = {
  PENDIENTE: { pill: 'bg-violet-500/10 text-violet-200 ring-violet-400/25', punto: 'bg-violet-400', barra: 'bg-violet-400', Icono: CircleDashed },
  EN_PROGRESO: { pill: 'bg-sky-500/10 text-sky-200 ring-sky-400/25', punto: 'bg-sky-400', barra: 'bg-sky-400', Icono: CircleDot },
  BLOQUEADA: { pill: 'bg-red-500/10 text-red-200 ring-red-400/25', punto: 'bg-red-400', barra: 'bg-red-400', Icono: Ban },
  COMPLETADA: { pill: 'bg-emerald-500/10 text-emerald-200 ring-emerald-400/25', punto: 'bg-emerald-400', barra: 'bg-emerald-400', Icono: Check },
};

export function PillEstado({ estado, className }: { estado: EstadoTarea; className?: string }) {
  const e = ESTILO_ESTADO[estado];
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', e.pill, className)}>
      <e.Icono className="size-3" aria-hidden />{ETIQUETA_ESTADO_TAREA[estado]}
    </span>
  );
}

// ------------------------------------------------------------------ anillo de progreso
export function Anillo({ valor, tamano = 40, grosor = 4, className, children, color = 'stroke-primario' }: {
  valor: number; tamano?: number; grosor?: number; className?: string; children?: React.ReactNode; color?: string;
}) {
  const r = (tamano - grosor) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, valor));
  return (
    <div className={cn('relative inline-grid shrink-0 place-items-center', className)} style={{ width: tamano, height: tamano }}
      role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <svg width={tamano} height={tamano} className="-rotate-90">
        <circle cx={tamano / 2} cy={tamano / 2} r={r} fill="none" strokeWidth={grosor} className="stroke-fondo" />
        <circle cx={tamano / 2} cy={tamano / 2} r={r} fill="none" strokeWidth={grosor} strokeLinecap="round"
          className={cn('transition-[stroke-dashoffset] duration-700', color)} strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} />
      </svg>
      <span className="absolute inset-0 grid place-items-center">{children}</span>
    </div>
  );
}

// ------------------------------------------------------------------ pipeline de la solicitud (Estado multiciclo)
const ETAPAS: EstadoSolicitud[] = ['APROBADA', 'ASIGNADA', 'EN_DESARROLLO', 'EN_VALIDACION', 'CERRADA'];

export function PipelineEstados({ estado, compacto }: { estado: EstadoSolicitud; compacto?: boolean }) {
  const idx = ETAPAS.indexOf(estado);
  const fuera = idx < 0;
  return (
    <ol className="flex w-full items-stretch" aria-label={`Ciclo de la solicitud: ${ETIQUETA_ESTADO[estado]}`}>
      {ETAPAS.map((e, i) => {
        const hecho = !fuera && i < idx;
        const actual = !fuera && i === idx;
        return (
          <li key={e} aria-current={actual ? 'step' : undefined}
            className={cn('relative flex flex-1 items-center justify-center text-center font-medium',
              compacto ? 'h-7 text-[10px]' : 'h-9 text-[11px] sm:text-xs',
              '[clip-path:polygon(0_0,calc(100%-10px)_0,100%_50%,calc(100%-10px)_100%,0_100%,10px_50%)] first:[clip-path:polygon(0_0,calc(100%-10px)_0,100%_50%,calc(100%-10px)_100%,0_100%)]',
              i > 0 && '-ml-1.5',
              actual ? 'bg-primario text-slate-950' : hecho ? 'bg-primario/20 text-teal-100' : 'bg-panel-2 text-atenuado')}>
            <span className="truncate px-3">{hecho && <Check className="mr-1 inline size-3" aria-hidden />}{ETIQUETA_ESTADO[e]}</span>
          </li>
        );
      })}
    </ol>
  );
}

// ------------------------------------------------------------------ colores por frente (estables por nombre, no por posición)
const PALETA_FRENTES = ['bg-teal-400', 'bg-sky-400', 'bg-amber-300', 'bg-violet-400', 'bg-lime-400', 'bg-indigo-400', 'bg-fuchsia-400', 'bg-orange-300'];
/**
 * Color estable por nombre de frente (nunca por posición en la lista, para que un filtro no lo cambie).
 * FNV-1a + mezcla final; la semilla 105 da colores distintos a los frentes más comunes
 * (Backend, Frontend, QA, Pruebas, DevOps, Móvil, Base de datos, Offline-First).
 */
export function colorFrente(nombre: string | null): string {
  if (!nombre || nombre === 'Sin frente') return 'bg-slate-500';
  let h = 105;
  for (const c of nombre.toLowerCase()) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  h ^= h >>> 16; h = Math.imul(h, 0x45d9f3b); h ^= h >>> 16;
  return PALETA_FRENTES[(h >>> 0) % PALETA_FRENTES.length]!;
}

// ------------------------------------------------------------------ horas de los últimos 14 días
export function BarrasHoras({ serie }: { serie: { fecha: string; horas: number }[] }) {
  const max = Math.max(8, ...serie.map((d) => d.horas));
  const hoy = hoyIso();
  const dia = new Intl.DateTimeFormat('es-CO', { weekday: 'narrow' });
  return (
    <div className="flex h-16 items-end gap-[3px]" role="img"
      aria-label={`Horas registradas en 14 días: ${serie.reduce((a, d) => a + d.horas, 0)} h`}>
      {serie.map((d) => {
        const finde = [0, 6].includes(new Date(`${d.fecha}T12:00:00`).getDay());
        return (
          <div key={d.fecha} className="group relative flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="pointer-events-none absolute -top-7 z-10 hidden whitespace-nowrap rounded-md border border-borde bg-panel-2 px-2 py-0.5 text-[11px] text-texto shadow-lg group-hover:block">
              {fechaCorta(d.fecha)} · {d.horas} h
            </span>
            <div className={cn('w-full rounded-t-[4px] transition-colors',
              d.horas === 0 ? 'h-[2px] bg-borde' : d.fecha === hoy ? 'bg-primario' : 'bg-primario/45 group-hover:bg-primario/70')}
              style={d.horas ? { height: `${Math.max(6, (d.horas / max) * 100)}%` } : undefined} />
            <span className={cn('text-[9px] leading-none', d.fecha === hoy ? 'font-semibold text-teal-200' : finde ? 'text-atenuado/50' : 'text-atenuado')}>
              {dia.format(new Date(`${d.fecha}T12:00:00`)).toUpperCase()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ evidencia: icono según el enlace
export function infoEvidencia(url: string): { Icono: typeof Link2; etiqueta: string } {
  let host = '';
  let ruta = '';
  try { const u = new URL(url); host = u.hostname.replace(/^www\./, ''); ruta = u.pathname; } catch { return { Icono: Link2, etiqueta: url }; }
  const corta = `${host}${ruta}`.replace(/\/$/, '');
  if (/\/(pull|merge_requests|pullrequest)\//.test(ruta)) return { Icono: GitPullRequest, etiqueta: corta.split('/').slice(-3).join('/') };
  if (/\/(tree|branch|commits?)\//.test(ruta) || /github|gitlab|bitbucket|dev\.azure/.test(host)) return { Icono: GitBranch, etiqueta: corta.split('/').slice(-2).join('/') };
  if (/figma/.test(host)) return { Icono: PenTool, etiqueta: 'Diseño en Figma' };
  if (/docs\.google|drive\.google|sharepoint|onedrive|notion|confluence/.test(host)) return { Icono: FileText, etiqueta: host };
  return { Icono: Link2, etiqueta: corta.length > 48 ? `${corta.slice(0, 45)}…` : corta };
}
