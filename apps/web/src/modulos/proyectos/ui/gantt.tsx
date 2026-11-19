'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { ETIQUETA_ESTADO, escalaGantt, posicionGantt, type SolicitudDeProyecto } from '@sierraflow/contratos';
import { cn } from '@/lib/utils';
import { fechaCorta } from './comunes';

const ANCHO_ETIQUETA = 260;

/**
 * Cronograma del proyecto: una fila por solicitud (inicio de desarrollo → cierre o fecha deseada) y,
 * al expandir, sus tareas (inicio → entrega). El relleno de cada barra es el avance real.
 * Línea vertical = hoy; franja sombreada = plazo planeado del proyecto.
 */
export function Gantt({ solicitudes, inicioPlan, finPlan }: { solicitudes: SolicitudDeProyecto[]; inicioPlan: string | null; finPlan: string | null }) {
  const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set(solicitudes.slice(0, 3).map((s) => s.id)));
  const [hover, setHover] = useState<string | null>(null);

  const escala = useMemo(() => escalaGantt(
    solicitudes.flatMap((s) => [{ id: s.id, inicio: s.inicio, fin: s.fin }, ...s.tareas.map((t) => ({ id: t.id, inicio: t.inicio, fin: t.fin }))]),
    Date.now(), [inicioPlan, finPlan]), [solicitudes, inicioPlan, finPlan]);

  // Marcas: semanas si el rango es corto, meses si es largo
  const marcas = useMemo(() => {
    const lista: { left: number; etiqueta: string }[] = [];
    const porMes = escala.dias > 120;
    const d = new Date(escala.desde);
    d.setHours(0, 0, 0, 0);
    if (porMes) d.setDate(1); else d.setDate(d.getDate() + ((8 - d.getDay()) % 7)); // próximo lunes
    while (d.getTime() <= escala.hasta) {
      if (d.getTime() >= escala.desde) {
        lista.push({
          left: ((d.getTime() - escala.desde) / (escala.hasta - escala.desde)) * 100,
          etiqueta: d.toLocaleDateString('es-CO', porMes ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' }),
        });
      }
      if (porMes) d.setMonth(d.getMonth() + 1); else d.setDate(d.getDate() + 7);
    }
    return lista;
  }, [escala]);

  const hoyPct = ((Date.now() - escala.desde) / (escala.hasta - escala.desde)) * 100;
  const plan = inicioPlan ? posicionGantt(inicioPlan, finPlan ?? inicioPlan, escala) : null;
  const anchoMin = Math.max(640, Math.min(escala.dias * 18, 2400));

  if (!solicitudes.length) {
    return <p className="py-10 text-center text-sm text-atenuado">Agrega solicitudes al proyecto para ver su cronograma.</p>;
  }

  const alternar = (id: string) => setAbiertas((a) => {
    const n = new Set(a);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const Barra = ({ id, inicio, fin, avance, fuerte, titulo, detalle }: {
    id: string; inicio: string | null; fin: string | null; avance: number; fuerte: boolean; titulo: string; detalle: string;
  }) => {
    const pos = posicionGantt(inicio, fin, escala);
    if (!pos) return <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] italic text-atenuado">sin fechas</span>;
    const vencida = fin && avance < 100 && Date.parse(`${fin}T23:59:59`) < Date.now();
    return (
      <>
        <div className={cn('absolute top-1/2 -translate-y-1/2 overflow-hidden rounded',
          fuerte ? 'h-5 bg-primario/25 ring-1 ring-primario/50' : 'h-3 bg-sky-500/20 ring-1 ring-sky-400/40',
          vencida && 'ring-red-400/70', hover === id && 'ring-2')}
          style={{ left: `${pos.left}%`, width: `${pos.width}%` }}
          onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover(null)}
          role="img" aria-label={`${titulo}: ${detalle}`}>
          <div className={cn('h-full', fuerte ? 'bg-primario' : 'bg-sky-400')} style={{ width: `${Math.min(100, avance)}%` }} />
        </div>
        {hover === id && (
          <div className="pointer-events-none absolute top-full z-30 -mt-1 whitespace-nowrap rounded-md border border-borde bg-panel px-2.5 py-1.5 text-xs text-texto shadow-xl"
            style={{ left: `min(${pos.left}%, calc(100% - 260px))` }}>
            <p className="font-medium">{titulo}</p><p className="text-atenuado">{detalle}{vencida ? ' · vencida' : ''}</p>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: anchoMin + ANCHO_ETIQUETA }}>
        {/* Encabezado de fechas */}
        <div className="flex border-b border-borde/60 text-[11px] text-atenuado">
          <div className="shrink-0 px-3 py-2" style={{ width: ANCHO_ETIQUETA }}>Solicitud / tarea</div>
          <div className="relative h-8 flex-1">
            {marcas.map((m) => <span key={m.left} className="absolute top-2 -translate-x-1/2 whitespace-nowrap" style={{ left: `${m.left}%` }}>{m.etiqueta}</span>)}
          </div>
        </div>

        <div className="relative">
          {/* Fondo: plazo del proyecto, rejilla y hoy (detrás de las filas) */}
          <div className="pointer-events-none absolute inset-y-0 right-0" style={{ left: ANCHO_ETIQUETA }}>
            {plan && <div className="absolute inset-y-0 bg-primario/[0.04] ring-1 ring-inset ring-primario/15" style={{ left: `${plan.left}%`, width: `${plan.width}%` }} />}
            {marcas.map((m) => <div key={m.left} className="absolute inset-y-0 w-px bg-borde/40" style={{ left: `${m.left}%` }} />)}
            <div className="absolute inset-y-0 w-0.5 bg-amber-400/80" style={{ left: `${hoyPct}%` }}>
              <span className="absolute -top-0.5 left-1 rounded bg-amber-400/90 px-1 text-[10px] font-medium text-slate-950">Hoy</span>
            </div>
          </div>

          {solicitudes.map((s) => (
            <div key={s.id} className="border-b border-borde/40">
              <div className="flex items-center hover:bg-panel-2/40">
                <div className="flex shrink-0 items-center gap-1.5 px-2 py-2" style={{ width: ANCHO_ETIQUETA }}>
                  <button onClick={() => alternar(s.id)} aria-expanded={abiertas.has(s.id)} aria-label={`Tareas de ${s.codigo}`}
                    className="rounded p-0.5 text-atenuado hover:text-texto disabled:opacity-30" disabled={!s.tareas.length}>
                    {abiertas.has(s.id) ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  </button>
                  <Link href={`/solicitudes/${s.id}`} className="min-w-0 hover:text-teal-200">
                    <span className="block truncate text-xs font-medium">{s.titulo}</span>
                    <span className="block text-[10px] text-atenuado"><span className="font-mono text-sky-300">{s.codigo}</span> · {ETIQUETA_ESTADO[s.estado]} · {Math.round(s.avancePct)}%</span>
                  </Link>
                </div>
                <div className="relative h-11 flex-1">
                  <Barra id={s.id} inicio={s.inicio} fin={s.fin} avance={s.avancePct} fuerte titulo={`${s.codigo} · ${s.titulo}`}
                    detalle={`${fechaCorta(s.inicio)} → ${fechaCorta(s.fin)} · avance ${Math.round(s.avancePct)}%`} />
                </div>
              </div>
              {abiertas.has(s.id) && s.tareas.map((t) => (
                <div key={t.id} className="flex items-center hover:bg-panel-2/30">
                  <div className="shrink-0 py-1.5 pl-9 pr-2" style={{ width: ANCHO_ETIQUETA }}>
                    <span className="block truncate text-[11px]">{t.titulo}</span>
                    <span className="block truncate text-[10px] text-atenuado">{t.grupo ?? 'Sin frente'}{t.responsable && ` · ${t.responsable}`}</span>
                  </div>
                  <div className="relative h-8 flex-1">
                    <Barra id={t.id} inicio={t.inicio} fin={t.fin} avance={t.avancePct} fuerte={false} titulo={t.titulo}
                      detalle={`${fechaCorta(t.inicio)} → ${fechaCorta(t.fin)} · ${Math.round(t.avancePct)}%`} />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-1 px-3 py-3 text-[11px] text-atenuado">
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-6 rounded bg-primario/25 ring-1 ring-primario/50"><span className="block h-full w-1/2 rounded-l bg-primario" /></span>Solicitud (relleno = avance)</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-6 rounded bg-sky-500/20 ring-1 ring-sky-400/40"><span className="block h-full w-1/2 rounded-l bg-sky-400" /></span>Tarea</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-0.5 bg-amber-400" />Hoy</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-5 rounded-sm bg-primario/10 ring-1 ring-primario/20" />Plazo del proyecto</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-5 rounded-sm ring-1 ring-red-400/70" />Vencida sin terminar</span>
        </div>
      </div>
    </div>
  );
}

