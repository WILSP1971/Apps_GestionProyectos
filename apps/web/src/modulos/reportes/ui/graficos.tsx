'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ETAPAS, escalaY, etiquetaMes, type ClaveEtapa, type DepartamentoPorEtapa } from '../dominio/indicadores';

/**
 * Gráficos de los reportes en SVG/HTML propio (sin librerías): paleta categórica validada para el
 * fondo oscuro (#0d2029, script dataviz: CVD ΔE ≥ 8.4, contraste ≥ 3:1), orden fijo de colores,
 * leyenda siempre visible y tooltip al pasar el cursor. Cada gráfico tiene además su vista en tabla.
 */
export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'] as const;
export const COLOR_ETAPA: Record<ClaveEtapa, string> = {
  revision: SERIES[0], por_asignar: SERIES[1], ejecucion: SERIES[2], cerradas: SERIES[3], descartadas: SERIES[4],
};

export function Leyenda({ elementos }: { elementos: { etiqueta: string; color: string; linea?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-atenuado">
      {elementos.map((e) => (
        <li key={e.etiqueta} className="inline-flex items-center gap-1.5">
          <span className={e.linea ? 'h-0.5 w-4 rounded-full' : 'size-2.5 rounded-sm'} style={{ background: e.color }} />
          {e.etiqueta}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------
/** Barras horizontales apiladas: solicitudes de cada departamento por etapa. */
export function BarrasApiladas({ datos }: { datos: DepartamentoPorEtapa[] }) {
  const [hover, setHover] = useState<{ depto: string; etapa: ClaveEtapa } | null>(null);
  const max = Math.max(1, ...datos.map((d) => d.total));
  return (
    <div className="space-y-3">
      <Leyenda elementos={ETAPAS.map((e) => ({ etiqueta: e.etiqueta, color: COLOR_ETAPA[e.clave] }))} />
      <ul className="space-y-2.5">
        {datos.map((d) => (
          <li key={d.departamento} className="relative">
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 text-texto">
                <span className="size-2 rounded-full" style={{ background: d.color ?? '#64748b' }} aria-hidden />{d.departamento}
              </span>
              <span className="tabular-nums text-atenuado">{d.total}</span>
            </div>
            <div className="flex h-4 gap-[2px]" style={{ width: `${(d.total / max) * 100}%` }} onMouseLeave={() => setHover(null)}>
              {ETAPAS.filter((e) => d.porEtapa[e.clave] > 0).map((e, i, visibles) => (
                <div key={e.clave} role="img" aria-label={`${d.departamento}, ${e.etiqueta}: ${d.porEtapa[e.clave]}`}
                  onMouseEnter={() => setHover({ depto: d.departamento, etapa: e.clave })}
                  className={cn('h-full transition-opacity', i === 0 && 'rounded-l', i === visibles.length - 1 && 'rounded-r',
                    hover && hover.depto === d.departamento && hover.etapa !== e.clave && 'opacity-50')}
                  style={{ flexGrow: d.porEtapa[e.clave], flexBasis: 0, minWidth: 3, background: COLOR_ETAPA[e.clave] }} />
              ))}
            </div>
            {hover?.depto === d.departamento && (
              <div className="pointer-events-none absolute right-0 top-0 z-10 rounded-md border border-borde bg-panel px-2.5 py-1.5 text-xs shadow-xl">
                <span className="mr-1.5 inline-block size-2 rounded-sm" style={{ background: COLOR_ETAPA[hover.etapa] }} />
                {ETAPAS.find((e) => e.clave === hover.etapa)!.etiqueta}: <b className="tabular-nums">{d.porEtapa[hover.etapa]}</b>
                <span className="text-atenuado"> de {d.total}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------
export interface SerieLinea { nombre: string; color: string; valores: number[] }

/** Líneas por mes con cursor vertical y tooltip con los valores de ese mes. */
export function GraficoLineas({ meses, series }: { meses: string[]; series: SerieLinea[] }) {
  const [activo, setActivo] = useState<number | null>(null);
  const W = 640, H = 220, M = { t: 12, r: 70, b: 26, l: 30 };
  const { max, ticks } = escalaY(Math.max(0, ...series.flatMap((s) => s.valores)));
  const x = (i: number) => M.l + (meses.length <= 1 ? 0 : (i / (meses.length - 1)) * (W - M.l - M.r));
  const y = (v: number) => M.t + (1 - v / max) * (H - M.t - M.b);
  const paso = meses.length > 1 ? (W - M.l - M.r) / (meses.length - 1) : W;

  return (
    <div className="space-y-2">
      <Leyenda elementos={series.map((s) => ({ etiqueta: s.nombre, color: s.color, linea: true }))} />
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Tendencia mensual: ${series.map((s) => s.nombre).join(', ')}`}
          onMouseLeave={() => setActivo(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="var(--color-borde)" strokeWidth={1} strokeDasharray={t === 0 ? undefined : '2 4'} />
              <text x={M.l - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-atenuado text-[10px] tabular-nums">{t}</text>
            </g>
          ))}
          {meses.map((m, i) => (i % 2 === meses.length % 2 || i === meses.length - 1) && (
            <text key={m} x={x(i)} y={H - 8} textAnchor="middle" className="fill-atenuado text-[10px]">{etiquetaMes(m)}</text>
          ))}
          {activo !== null && <line x1={x(activo)} x2={x(activo)} y1={M.t} y2={H - M.b} stroke="var(--color-borde-fuerte)" strokeWidth={1} />}
          {series.map((s) => (
            <g key={s.nombre}>
              <polyline fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
                points={s.valores.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
              {activo !== null && <circle cx={x(activo)} cy={y(s.valores[activo] ?? 0)} r={4} fill={s.color} stroke="var(--color-panel)" strokeWidth={2} />}
              {/* etiqueta directa al final de la línea */}
              <text x={x(meses.length - 1) + 8} y={y(s.valores.at(-1) ?? 0)} dy="0.32em" className="fill-atenuado text-[10px]">{s.nombre}</text>
            </g>
          ))}
          {meses.map((m, i) => (
            <rect key={m} x={x(i) - paso / 2} y={M.t} width={paso} height={H - M.t - M.b} fill="transparent" onMouseEnter={() => setActivo(i)} />
          ))}
        </svg>
        {activo !== null && (
          <div className="pointer-events-none absolute top-1 z-10 min-w-36 rounded-md border border-borde bg-panel px-3 py-2 text-xs shadow-xl"
            style={{ left: `clamp(0px, calc(${(x(activo) / W) * 100}% - 72px), calc(100% - 150px))` }}>
            <p className="mb-1 font-medium text-texto">{etiquetaMes(meses[activo]!)}</p>
            {series.map((s) => (
              <p key={s.nombre} className="flex items-center justify-between gap-3 text-atenuado">
                <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />{s.nombre}</span>
                <b className="tabular-nums text-texto">{s.valores[activo]}</b>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
/** Barras horizontales de una sola serie (magnitud) con valor al final. */
export function BarrasSimples({ filas, maximo, formato = (v) => String(v), alerta }: {
  filas: { etiqueta: string; valor: number; detalle?: string }[];
  maximo?: number;
  formato?: (v: number) => string;
  alerta?: (v: number) => string | null;
}) {
  const max = maximo ?? Math.max(1, ...filas.map((f) => f.valor));
  return (
    <ul className="space-y-2.5">
      {filas.map((f) => {
        const aviso = alerta?.(f.valor) ?? null;
        return (
          <li key={f.etiqueta} title={f.detalle}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate text-texto">{f.etiqueta}</span>
              <span className="shrink-0 tabular-nums text-atenuado">
                {aviso && <span className="mr-2 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-300">{aviso}</span>}
                {formato(f.valor)}
              </span>
            </div>
            <div className="h-2 rounded bg-panel-2">
              <div className={cn('h-full rounded', aviso ? 'bg-red-500' : 'bg-primario')} style={{ width: `${Math.min(100, (f.valor / max) * 100)}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
