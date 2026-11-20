'use client';

import type { MiTarea } from '@sierraflow/contratos';
import { cn } from '@/lib/utils';
import { ESTILO_ESTADO, estaVencida, fechaCorta, hoyIso } from './piezas';

const DIA = 86_400_000;
const aMs = (iso: string) => Date.parse(`${iso}T12:00:00`);

/** Mi cronograma: tareas abiertas con fechas en una ventana de 5 semanas (1 atrás, 4 adelante). */
export function Cronograma({ tareas, alAbrir }: { tareas: MiTarea[]; alAbrir: (id: string) => void }) {
  const hoy = aMs(hoyIso());
  const lunes = hoy - ((new Date(hoy).getDay() + 6) % 7) * DIA;
  const desde = lunes - 7 * DIA;
  const hasta = desde + 35 * DIA;
  const pct = (ms: number) => ((Math.max(desde, Math.min(hasta, ms)) - desde) / (hasta - desde)) * 100;

  const filas = tareas
    .filter((t) => t.estado !== 'COMPLETADA' && (t.fechaInicio || t.fechaFinPlan))
    .map((t) => {
      const fin = t.fechaFinPlan ? aMs(t.fechaFinPlan) : aMs(t.fechaInicio!) + 5 * DIA;
      const ini = t.fechaInicio ? aMs(t.fechaInicio) : fin - 5 * DIA;
      return { t, ini, fin };
    })
    .filter((f) => f.fin >= desde && f.ini <= hasta)
    .sort((a, b) => a.fin - b.fin)
    .slice(0, 8);

  if (!filas.length) {
    return <p className="py-6 text-center text-sm text-atenuado">Tus tareas abiertas no tienen fechas en las próximas semanas.</p>;
  }
  const semanas = Array.from({ length: 5 }, (_, i) => desde + i * 7 * DIA);

  return (
    <div className="text-xs">
      <div className="grid grid-cols-[minmax(0,180px)_1fr] gap-3">
        <span />
        <div className="relative grid grid-cols-5 border-b border-borde/60 pb-1 text-[10px] text-atenuado">
          {semanas.map((s) => <span key={s} className="pl-1">{fechaCorta(new Date(s).toISOString())}</span>)}
        </div>
      </div>
      <ul className="mt-1">
        {filas.map(({ t, ini, fin }) => {
          const izq = pct(ini);
          const ancho = Math.max(1.5, pct(fin + DIA) - izq);
          const vencida = estaVencida(t);
          return (
            <li key={t.id} className="grid grid-cols-[minmax(0,180px)_1fr] items-center gap-3 py-1">
              <button type="button" onClick={() => alAbrir(t.id)} className="truncate text-left text-atenuado hover:text-texto" title={t.titulo}>{t.titulo}</button>
              <div className="relative h-5">
                {semanas.slice(1).map((s) => <span key={s} className="absolute inset-y-0 w-px bg-borde/40" style={{ left: `${pct(s)}%` }} />)}
                <span className="absolute -inset-y-1 z-10 w-px bg-primario/80" style={{ left: `${pct(hoy + DIA / 2)}%` }} aria-hidden />
                <button type="button" onClick={() => alAbrir(t.id)}
                  title={`${t.titulo} · ${fechaCorta(t.fechaInicio)} → ${fechaCorta(t.fechaFinPlan)} · ${Math.round(t.avancePct)}%`}
                  className={cn('absolute inset-y-0.5 overflow-hidden rounded-[4px] ring-1 ring-inset transition hover:brightness-125',
                    vencida ? 'bg-red-500/20 ring-red-400/50' : 'bg-panel-2 ring-borde-fuerte')}
                  style={{ left: `${izq}%`, width: `${ancho}%` }}>
                  <span className={cn('block h-full opacity-70', vencida ? 'bg-red-400/60' : ESTILO_ESTADO[t.estado].barra)} style={{ width: `${t.avancePct}%` }} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="grid grid-cols-[minmax(0,180px)_1fr] gap-3">
        <span />
        <div className="relative h-4">
          <span className="absolute -translate-x-1/2 text-[10px] font-semibold text-teal-200" style={{ left: `${pct(hoy + DIA / 2)}%` }}>Hoy</span>
        </div>
      </div>
    </div>
  );
}
