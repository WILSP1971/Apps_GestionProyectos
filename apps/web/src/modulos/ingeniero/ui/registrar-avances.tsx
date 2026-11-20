'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, ListChecks, Loader2, Lock, WifiOff } from 'lucide-react';
import { ESTADOS_TAREA, ETIQUETA_ESTADO_TAREA, type CambioTarea, type EstadoTarea, type MiTarea } from '@sierraflow/contratos';
import { cn } from '@/lib/utils';
import { BarraProgreso, Tarjeta, Vacio } from '@/componentes/ui/primitivos';
import { useActor, useUsuario } from '@/componentes/layout/proveedores';
import { fuenteApi as evaluacionApi, fuenteDemo as evaluacionDemo } from '@/modulos/evaluacion/infraestructura/fuente-evaluacion';
import { fuenteApi as proyectosApi, fuenteDemo as proyectosDemo } from '@/modulos/proyectos/infraestructura/fuente-proyectos';
import { fechaCorta } from '@/modulos/proyectos/ui/comunes';

const COLOR: Record<EstadoTarea, string> = {
  PENDIENTE: 'text-atenuado', EN_PROGRESO: 'text-sky-300', BLOQUEADA: 'text-red-300', COMPLETADA: 'text-emerald-300',
};
const FILTROS = [
  { clave: 'abiertas', etiqueta: 'Por hacer' },
  { clave: 'vencidas', etiqueta: 'Vencidas' },
  { clave: 'completadas', etiqueta: 'Completadas (30 días)' },
] as const;
const hoy = () => new Date().toISOString().slice(0, 10);

/** Menú del ingeniero → "Registrar avances": todas mis tareas (de solicitudes y de proyectos) en un solo lugar. */
export function RegistrarAvances() {
  const actor = useActor();
  const { modoDemo } = useUsuario();
  const [tareas, setTareas] = useState<MiTarea[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]['clave']>('abiertas');

  const cargar = useCallback(async () => {
    try {
      setTareas(await (modoDemo ? evaluacionDemo : evaluacionApi).misTareas(actor.id));
      setError(null);
    } catch (e) {
      setError(navigator.onLine ? (e as Error).message : 'sin-conexion');
    }
  }, [modoDemo, actor.id]);
  useEffect(() => { void cargar(); }, [cargar]);

  const visibles = useMemo(() => (tareas ?? []).filter((t) =>
    filtro === 'completadas' ? t.estado === 'COMPLETADA'
      : filtro === 'vencidas' ? t.estado !== 'COMPLETADA' && !!t.fechaFinPlan && t.fechaFinPlan < hoy()
        : t.estado !== 'COMPLETADA'), [tareas, filtro]);

  const grupos = useMemo(() => {
    const m = new Map<string, { titulo: string; enlace: string | null; lista: MiTarea[] }>();
    for (const t of visibles) {
      const k = t.solicitudId ?? `p:${t.proyectoId}`;
      const titulo = t.solicitudId
        ? `${t.solicitudCodigo} · ${t.solicitudTitulo}${t.proyectoNombre ? `  (${t.proyectoCodigo})` : ''}`
        : `${t.proyectoCodigo} · ${t.proyectoNombre} — tareas del proyecto`;
      const g = m.get(k) ?? { titulo, enlace: t.solicitudId ? `/solicitudes/${t.solicitudId}` : null, lista: [] };
      g.lista.push(t);
      m.set(k, g);
    }
    return [...m.values()];
  }, [visibles]);

  if (error) {
    return <Vacio icono={<WifiOff className="size-8" />} titulo={error === 'sin-conexion' ? 'Registrar avances necesita conexión' : 'No se pudieron cargar tus tareas'}
      texto={error === 'sin-conexion' ? 'El avance se guarda en el servidor para que el líder y el solicitante lo vean al instante.' : error} />;
  }
  if (!tareas) return <div className="h-72 animate-pulse rounded-xl bg-panel/60" />;

  const abiertas = tareas.filter((t) => t.estado !== 'COMPLETADA');
  const vencidas = abiertas.filter((t) => t.fechaFinPlan && t.fechaFinPlan < hoy());
  const bloqueadas = abiertas.filter((t) => t.estado === 'BLOQUEADA');
  const conteo = { abiertas: abiertas.length, vencidas: vencidas.length, completadas: tareas.length - abiertas.length };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { t: 'Por hacer', v: abiertas.length, i: ListChecks, c: '' },
          { t: 'Vencidas', v: vencidas.length, i: AlertTriangle, c: vencidas.length ? 'text-red-300' : '' },
          { t: 'Bloqueadas', v: bloqueadas.length, i: Lock, c: bloqueadas.length ? 'text-amber-200' : '' },
          { t: 'Completadas (30 días)', v: conteo.completadas, i: CheckCircle2, c: 'text-emerald-300' },
        ].map(({ t, v, i: Icono, c }) => (
          <div key={t} className="rounded-xl border border-borde bg-panel/80 p-4">
            <p className="flex items-center gap-1.5 text-xs text-atenuado"><Icono className="size-3.5" />{t}</p>
            <p className={cn('mt-1 text-2xl font-semibold tabular-nums', c)}>{v}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1 border-b border-borde/70" role="tablist">
        {FILTROS.map((f) => (
          <button key={f.clave} role="tab" aria-selected={filtro === f.clave} onClick={() => setFiltro(f.clave)}
            className={cn('border-b-2 px-4 py-2 text-sm', filtro === f.clave ? 'border-primario font-medium text-teal-200' : 'border-transparent text-atenuado hover:text-texto')}>
            {f.etiqueta} <span className="text-[11px] text-atenuado">{conteo[f.clave]}</span>
          </button>
        ))}
      </div>

      {grupos.length === 0 ? (
        <Vacio icono={<CheckCircle2 className="size-8" />} titulo={filtro === 'abiertas' ? '¡Sin tareas pendientes!' : 'Nada por aquí'}
          texto="Las tareas te las asigna el líder técnico en Evaluación (de una solicitud) o en el proyecto." />
      ) : grupos.map((g) => (
        <Tarjeta key={g.titulo} cuerpoClassName="p-0"
          titulo={g.enlace ? <Link href={g.enlace} className="hover:text-teal-200">{g.titulo}</Link> : g.titulo}>
          <ul className="divide-y divide-borde/50">
            {g.lista.map((t) => <Fila key={`${t.id}:${t.version}`} tarea={t} modoDemo={modoDemo} alCambiar={cargar} />)}
          </ul>
        </Tarjeta>
      ))}
      <p className="text-xs text-atenuado">Al llegar al 100 % la tarea queda <b>Completada</b>. El primer avance de una solicitud asignada la pasa a <b>En desarrollo</b>.</p>
    </div>
  );
}

function Fila({ tarea: t, modoDemo, alCambiar }: { tarea: MiTarea; modoDemo: boolean; alCambiar: () => Promise<void> }) {
  const [avance, setAvance] = useState(String(Math.round(t.avancePct)));
  const [horas, setHoras] = useState(String(t.horasReales));
  const [guardando, setGuardando] = useState(false);
  const vencida = t.estado !== 'COMPLETADA' && !!t.fechaFinPlan && t.fechaFinPlan < hoy();

  const guardar = async (cambio: Omit<CambioTarea, 'version'>) => {
    setGuardando(true);
    try {
      const datos = { ...cambio, version: t.version };
      if (t.solicitudId) await (modoDemo ? evaluacionDemo : evaluacionApi).actualizarTarea(t.id, datos);
      else await (modoDemo ? proyectosDemo : proyectosApi).actualizarTareaProyecto(t.id, datos);
      if (cambio.avancePct === 100 || cambio.estado === 'COMPLETADA') toast.success(`"${t.titulo}" completada`);
      await alCambiar();
    } catch (e) {
      toast.error((e as Error).message);
      setAvance(String(Math.round(t.avancePct))); setHoras(String(t.horasReales));
      setGuardando(false);
    }
  };

  return (
    <li className="px-5 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-64">
          <p className="text-sm font-medium">{t.titulo}</p>
          <p className="text-xs text-atenuado">
            {t.grupo ?? 'Sin frente'} · peso {t.peso}{t.horasEstimadas != null && ` · ${t.horasEstimadas} h estimadas`}
            {t.fechaFinPlan && <span className={cn(vencida && 'font-medium text-red-300')}> · entrega {fechaCorta(t.fechaFinPlan)}{vencida && ' (vencida)'}</span>}
          </p>
        </div>
        {t.editable ? (
          <>
            <select aria-label="Estado" className={cn('campo h-8 w-36 py-0 text-xs', COLOR[t.estado])} value={t.estado} disabled={guardando}
              onChange={(e) => void guardar({ estado: e.target.value as EstadoTarea })}>
              {ESTADOS_TAREA.map((e) => <option key={e} value={e}>{ETIQUETA_ESTADO_TAREA[e]}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-atenuado">
              <input type="range" min={0} max={100} step={5} value={avance} disabled={guardando} aria-label="Avance"
                onChange={(e) => setAvance(e.target.value)}
                onMouseUp={() => Number(avance) !== Math.round(t.avancePct) && void guardar({ avancePct: Number(avance) })}
                onKeyUp={() => Number(avance) !== Math.round(t.avancePct) && void guardar({ avancePct: Number(avance) })}
                onTouchEnd={() => Number(avance) !== Math.round(t.avancePct) && void guardar({ avancePct: Number(avance) })}
                className="w-28 accent-teal-500" />
              <span className="w-9 text-right tabular-nums text-texto">{avance}%</span>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-atenuado">
              <input type="number" min={0} step={0.5} value={horas} disabled={guardando} aria-label="Horas reales trabajadas"
                onChange={(e) => setHoras(e.target.value)}
                onBlur={() => { const v = Math.max(0, Number(horas) || 0); if (v !== t.horasReales) void guardar({ horasReales: v }); }}
                onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
                className="campo h-8 w-16 py-0 text-right text-xs" /> h
            </label>
            {guardando && <Loader2 className="size-4 animate-spin text-atenuado" />}
          </>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-atenuado"><Lock className="size-3.5" />{ETIQUETA_ESTADO_TAREA[t.estado]} · {Math.round(t.avancePct)}%</span>
        )}
      </div>
      <BarraProgreso valor={t.avancePct} className="mt-2 h-1" color={t.estado === 'BLOQUEADA' ? 'bg-red-500' : t.estado === 'COMPLETADA' ? 'bg-emerald-500' : undefined} />
    </li>
  );
}
