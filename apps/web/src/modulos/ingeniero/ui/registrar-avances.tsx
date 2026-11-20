'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertTriangle, Ban, CheckCircle2, ChevronRight, CircleDashed, CircleDot, ClipboardList, Clock, Flag, Layers,
  ListChecks, Plus, RefreshCw, Search, WifiOff, X,
} from 'lucide-react';
import {
  avancePonderado, calcularFrentes, ETIQUETA_TIPO_EVALUACION, type ContextoEvaluacion, type EstadoTarea, type FrenteAvance,
  type MiActividad, type MiTarea,
} from '@sierraflow/contratos';
import { cn } from '@/lib/utils';
import { Avatar, BarraProgreso, Boton, Tarjeta, Vacio } from '@/componentes/ui/primitivos';
import { useActor, useUsuario } from '@/componentes/layout/proveedores';
import { fuenteApi as evaluacionApi, fuenteDemo as evaluacionDemo } from '@/modulos/evaluacion/infraestructura/fuente-evaluacion';
import { InsigniaNota } from '@/modulos/evaluacion/ui/insignia-nota';
import { fuenteApi, fuenteDemo } from '../infraestructura/fuente-avances';
import { Cronograma } from './centro-trabajo/cronograma';
import { NuevaTarea } from './centro-trabajo/nueva-tarea';
import { EntradaBitacora, PanelTarea } from './centro-trabajo/panel-tarea';
import {
  Anillo, BarrasHoras, colorFrente, ESTILO_ESTADO, estaVencida, hoyIso, PillEstado, PipelineEstados, plazo, relativo,
} from './centro-trabajo/piezas';

const PESTANAS: { estado: EstadoTarea; etiqueta: string }[] = [
  { estado: 'PENDIENTE', etiqueta: 'Pendientes' },
  { estado: 'EN_PROGRESO', etiqueta: 'En progreso' },
  { estado: 'BLOQUEADA', etiqueta: 'Bloqueadas' },
  { estado: 'COMPLETADA', etiqueta: 'Completadas' },
];
const claveAmbito = (t: MiTarea) => (t.solicitudId ? `s:${t.solicitudId}` : `p:${t.proyectoId}`);

/**
 * Menú del ingeniero → "Registrar avances": Centro de trabajo con todas sus tareas (de solicitudes
 * y de proyectos), avance por frente, cronograma, actividad reciente y panel de detalle con
 * checklist, registro de avance (%, horas, nota, evidencia) y bitácora.
 */
export function RegistrarAvances() {
  const actorCompleto = useActor();
  const { modoDemo } = useUsuario();
  const actor = useMemo(() => ({ id: actorCompleto.id, nombre: actorCompleto.nombre }), [actorCompleto.id, actorCompleto.nombre]);
  const fuente = modoDemo ? fuenteDemo : fuenteApi;

  const [tareas, setTareas] = useState<MiTarea[] | null>(null);
  const [actividad, setActividad] = useState<MiActividad | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ambito, setAmbito] = useState<string>('todo');
  const [pestana, setPestana] = useState<EstadoTarea>('EN_PROGRESO');
  const [frente, setFrente] = useState<string | null>(null);
  const [soloVencidas, setSoloVencidas] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [abierta, setAbierta] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [contexto, setContexto] = useState<ContextoEvaluacion | null>(null);
  const buscador = useRef<HTMLInputElement>(null);
  const pestanaElegida = useRef(false);

  const cargar = useCallback(async () => {
    try {
      const [t, a] = await Promise.all([fuente.misTareas(actor), fuente.miActividad(actor)]);
      setTareas(t); setActividad(a); setError(null);
      if (!pestanaElegida.current) {
        pestanaElegida.current = true;
        setPestana(t.some((x) => x.estado === 'EN_PROGRESO') ? 'EN_PROGRESO' : 'PENDIENTE');
      }
    } catch (e) {
      setError(navigator.onLine ? (e as Error).message : 'sin-conexion');
    }
  }, [fuente, actor]);
  useEffect(() => { void cargar(); }, [cargar]);

  // Ámbito = una solicitud: ciclo, avance del equipo por frente e historial de evaluaciones
  useEffect(() => {
    if (!ambito.startsWith('s:')) { setContexto(null); return; }
    let vigente = true;
    (modoDemo ? evaluacionDemo : evaluacionApi).contexto(ambito.slice(2))
      .then((c) => vigente && setContexto(c)).catch(() => vigente && setContexto(null));
    return () => { vigente = false; };
  }, [ambito, modoDemo, tareas]);

  // Atajos: N = nueva tarea, / = buscar
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (abierta || creando || e.ctrlKey || e.metaKey || e.altKey || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable) return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setCreando(true); }
      if (e.key === '/') { e.preventDefault(); buscador.current?.focus(); }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [abierta, creando]);

  const ambitos = useMemo(() => {
    const m = new Map<string, { clave: string; codigo: string; titulo: string; lista: MiTarea[] }>();
    for (const t of tareas ?? []) {
      const k = claveAmbito(t);
      const a = m.get(k) ?? { clave: k, codigo: (t.solicitudCodigo ?? t.proyectoCodigo) ?? '—', titulo: (t.solicitudTitulo ?? t.proyectoNombre) ?? '', lista: [] };
      a.lista.push(t);
      m.set(k, a);
    }
    return [...m.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [tareas]);

  const delAmbito = useMemo(() => (tareas ?? []).filter((t) => ambito === 'todo' || claveAmbito(t) === ambito), [tareas, ambito]);
  const conteo = useMemo(
    () => Object.fromEntries(PESTANAS.map((p) => [p.estado, delAmbito.filter((t) => t.estado === p.estado).length])) as Record<EstadoTarea, number>,
    [delAmbito]);
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return delAmbito.filter((t) =>
      (soloVencidas ? estaVencida(t) : t.estado === pestana)
      && (frente === null || (t.grupoId ?? '') === frente)
      && (!q || `${t.titulo} ${t.solicitudCodigo ?? ''} ${t.proyectoCodigo ?? ''} ${t.grupo ?? ''}`.toLowerCase().includes(q)));
  }, [delAmbito, pestana, frente, busqueda, soloVencidas]);

  const frentes: FrenteAvance[] = useMemo(
    () => (contexto && ambito.startsWith('s:') ? contexto.frentes : calcularFrentes(delAmbito)), [contexto, ambito, delAmbito]);

  if (error) {
    return <Vacio icono={<WifiOff className="size-8" />} titulo={error === 'sin-conexion' ? 'Registrar avances necesita conexión' : 'No se pudieron cargar tus tareas'}
      texto={error === 'sin-conexion' ? 'El avance se guarda en el servidor para que el líder y el solicitante lo vean al instante.' : error}
      accion={<Boton variante="secundario" tamano="sm" onClick={() => void cargar()}><RefreshCw className="size-3.5" />Reintentar</Boton>} />;
  }
  if (!tareas || !actividad) {
    return (
      <div className="space-y-4">
        <div className="h-40 animate-pulse rounded-2xl bg-panel/60" />
        <div className="grid gap-4 xl:grid-cols-[1fr_340px]"><div className="h-96 animate-pulse rounded-xl bg-panel/60" /><div className="h-96 animate-pulse rounded-xl bg-panel/60" /></div>
      </div>
    );
  }

  const abiertas = delAmbito.filter((t) => t.estado !== 'COMPLETADA');
  const vencidas = abiertas.filter(estaVencida);
  const enSieteDias = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const estaSemana = abiertas.filter((t) => t.fechaFinPlan && t.fechaFinPlan >= hoyIso() && t.fechaFinPlan <= enSieteDias);
  const avance = avancePonderado(delAmbito);
  const horasSemana = actividad.horasPorDia.slice(-7).reduce((a, d) => a + d.horas, 0);
  const ambitoActual = ambitos.find((a) => a.clave === ambito);
  const esSolicitud = ambito.startsWith('s:');
  const elegirPestana = (e: EstadoTarea) => { setSoloVencidas(false); setPestana(e); };

  return (
    <div className="space-y-5">
      {/* ── Resumen ─────────────────────────────────────────── */}
      <section className="grid gap-4 rounded-2xl border border-borde bg-gradient-to-br from-panel via-panel/90 to-primario/[0.06] p-5 lg:grid-cols-[auto_1fr_auto] lg:items-center">
        <div className="flex items-center gap-4">
          <Anillo valor={avance} tamano={84} grosor={7}>
            <span className="text-center leading-none"><b className="block text-xl tabular-nums">{Math.round(avance)}%</b><span className="text-[9px] text-atenuado">ponderado</span></span>
          </Anillo>
          <div>
            <p className="text-lg font-semibold tracking-tight">Hola, {actor.nombre.split(' ')[0]}</p>
            <p className="max-w-xs text-sm text-atenuado">
              {abiertas.length
                ? <>Tienes <b className="text-texto">{abiertas.length}</b> {abiertas.length === 1 ? 'tarea abierta' : 'tareas abiertas'}{estaSemana.length > 0 && <> · <b className="text-amber-200">{estaSemana.length}</b> vencen esta semana</>}.</>
                : 'No tienes tareas abiertas. ¡Buen trabajo!'}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { k: 'PENDIENTE' as const, t: 'Pendientes', v: conteo.PENDIENTE, I: CircleDashed, c: 'text-violet-200' },
            { k: 'EN_PROGRESO' as const, t: 'En progreso', v: conteo.EN_PROGRESO, I: CircleDot, c: 'text-sky-200' },
            { k: 'VENCIDAS' as const, t: 'Vencidas', v: vencidas.length, I: AlertTriangle, c: vencidas.length ? 'text-red-300' : 'text-texto' },
            { k: 'BLOQUEADA' as const, t: 'Bloqueadas', v: conteo.BLOQUEADA, I: Ban, c: conteo.BLOQUEADA ? 'text-amber-200' : 'text-texto' },
          ].map(({ k, t, v, I, c }) => (
            <button key={k} type="button"
              onClick={() => { if (k === 'VENCIDAS') setSoloVencidas(true); else elegirPestana(k); }}
              className={cn('rounded-xl border bg-fondo/40 px-3 py-2.5 text-left transition hover:border-borde-fuerte',
                (k === 'VENCIDAS' ? soloVencidas : !soloVencidas && pestana === k) ? 'border-primario/60' : 'border-borde')}>
              <span className="flex items-center gap-1.5 text-[11px] text-atenuado"><I className="size-3.5" />{t}</span>
              <span className={cn('mt-0.5 block text-2xl font-semibold tabular-nums', c)}>{v}</span>
            </button>
          ))}
        </div>
        <div className="min-w-[230px] rounded-xl border border-borde bg-fondo/40 px-4 py-3">
          <div className="mb-2 flex items-baseline justify-between gap-3 text-[11px] text-atenuado">
            <span className="flex items-center gap-1.5"><Clock className="size-3.5" />Horas · 14 días</span>
            <span><b className="text-sm tabular-nums text-texto">{Math.round(horasSemana * 10) / 10} h</b> últimos 7 días</span>
          </div>
          <BarrasHoras serie={actividad.horasPorDia} />
        </div>
      </section>

      {/* ── Ámbitos ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="-mx-1 flex w-full gap-2 overflow-x-auto px-1 pb-1 sm:w-auto sm:flex-1" role="tablist" aria-label="Filtrar por solicitud o proyecto">
          {[{ clave: 'todo', codigo: 'Todo mi trabajo', titulo: '', lista: tareas }, ...ambitos].map((a) => {
            const activo = ambito === a.clave;
            const abiertasA = a.lista.filter((t) => t.estado !== 'COMPLETADA').length;
            return (
              <button key={a.clave} role="tab" aria-selected={activo} type="button" title={a.titulo}
                onClick={() => { setAmbito(a.clave); setFrente(null); }}
                className={cn('flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition',
                  activo ? 'border-primario/70 bg-primario/10 text-teal-100' : 'border-borde text-atenuado hover:border-borde-fuerte hover:text-texto')}>
                {a.clave === 'todo' ? <Layers className="size-3.5" /> : <Anillo valor={avancePonderado(a.lista)} tamano={16} grosor={2.5} />}
                <span className={cn(a.clave !== 'todo' && 'font-mono')}>{a.codigo}</span>
                {a.clave !== 'todo' && <span className="hidden max-w-[160px] truncate md:inline">{a.titulo}</span>}
                <span className="rounded-full bg-panel-2 px-1.5 text-[10px] tabular-nums">{abiertasA}</span>
              </button>
            );
          })}
        </div>
        <Boton onClick={() => setCreando(true)} title="Nueva tarea (N)" className="w-full sm:w-auto">
          <Plus className="size-4" />Nueva tarea<kbd className="ml-1 hidden rounded border border-slate-950/30 px-1 text-[10px] sm:inline">N</kbd>
        </Boton>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {/* Ciclo de la solicitud */}
          {ambitoActual && esSolicitud && (
            <Tarjeta titulo={<span className="flex items-center gap-2"><Flag className="size-4 text-atenuado" />Ciclo de {ambitoActual.codigo}</span>}
              acciones={<Link href={`/solicitudes/${ambito.slice(2)}`} className="inline-flex items-center gap-1 text-xs text-teal-200 hover:underline">Ver solicitud<ChevronRight className="size-3.5" /></Link>}>
              {contexto ? (
                <div className="space-y-3">
                  <PipelineEstados estado={contexto.solicitud.estado} />
                  <p className="text-xs text-atenuado">
                    {contexto.solicitud.departamento} · solicitante {contexto.solicitud.solicitante}
                    {contexto.solicitud.fechaDeseada && <> · fecha deseada {new Date(`${contexto.solicitud.fechaDeseada}T12:00:00`).toLocaleDateString('es-CO')}</>}
                    {' · '}avance del equipo <b className="text-texto">{Math.round(contexto.solicitud.avancePct)}%</b>
                  </p>
                </div>
              ) : <div className="h-14 animate-pulse rounded-lg bg-panel-2/60" />}
            </Tarjeta>
          )}

          {/* Avance por frente */}
          <Tarjeta
            titulo={<span className="flex items-center gap-2"><Activity className="size-4 text-atenuado" />Avance por frente{contexto && esSolicitud && <span className="font-normal text-atenuado">· todo el equipo</span>}</span>}
            acciones={frente !== null && <button type="button" onClick={() => setFrente(null)} className="inline-flex items-center gap-1 text-xs text-atenuado hover:text-texto"><X className="size-3" />Quitar filtro</button>}
            cuerpoClassName="space-y-3.5">
            {frentes.length ? frentes.map((f) => {
              const k = f.grupoId ?? '';
              const activo = frente === k;
              return (
                <button key={k || 'sin'} type="button" onClick={() => setFrente(activo ? null : k)} aria-pressed={activo} title="Filtrar mis tareas por este frente"
                  className={cn('block w-full rounded-lg text-left transition', frente !== null && !activo && 'opacity-45 hover:opacity-80')}>
                  <span className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={cn('size-2 shrink-0 rounded-full', colorFrente(f.grupo))} /><span className="truncate">{f.grupo}</span>
                      <span className="shrink-0 text-xs text-atenuado">{f.completadas}/{f.tareas} tareas{f.bloqueadas > 0 && <span className="text-red-300"> · {f.bloqueadas} bloqueada{f.bloqueadas > 1 && 's'}</span>}</span>
                    </span>
                    <span className="font-semibold tabular-nums">{Math.round(f.avancePct)}%</span>
                  </span>
                  <BarraProgreso valor={f.avancePct} className="mt-1.5 h-1.5" color={colorFrente(f.grupo)} />
                </button>
              );
            }) : <p className="text-sm text-atenuado">Sin tareas en este ámbito.</p>}
          </Tarjeta>

          {/* Tareas */}
          <Tarjeta cuerpoClassName="p-0"
            titulo={<span className="flex items-center gap-2"><ListChecks className="size-4 text-atenuado" />Tareas <span className="font-normal text-atenuado">({delAmbito.length})</span></span>}
            acciones={
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-atenuado" />
                  <input ref={buscador} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Filtrar…  /"
                    aria-label="Filtrar tareas" className="campo h-8 w-32 py-0 pl-8 text-xs sm:w-56" />
                </div>
                <button type="button" onClick={() => void cargar()} aria-label="Actualizar" className="rounded-lg border border-borde p-1.5 text-atenuado hover:text-texto"><RefreshCw className="size-3.5" /></button>
              </div>
            }>
            <div className="flex gap-1 overflow-x-auto border-b border-borde/70 px-3" role="tablist" aria-label="Estado de las tareas">
              {PESTANAS.map((p) => (
                <button key={p.estado} role="tab" type="button" aria-selected={!soloVencidas && pestana === p.estado} onClick={() => elegirPestana(p.estado)}
                  className={cn('-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition',
                    !soloVencidas && pestana === p.estado ? 'border-primario font-medium text-teal-100' : 'border-transparent text-atenuado hover:text-texto')}>
                  {p.etiqueta}<span className="rounded-full bg-panel-2 px-1.5 text-[10px] tabular-nums">{conteo[p.estado]}</span>
                </button>
              ))}
              {soloVencidas && (
                <span className="-mb-px flex shrink-0 items-center gap-1.5 border-b-2 border-red-400 px-3 py-2.5 text-sm font-medium text-red-200">
                  Vencidas <span className="rounded-full bg-red-500/15 px-1.5 text-[10px]">{vencidas.length}</span>
                  <button type="button" onClick={() => setSoloVencidas(false)} aria-label="Quitar filtro de vencidas"><X className="size-3" /></button>
                </span>
              )}
            </div>
            {visibles.length ? (
              <ul className="divide-y divide-borde/50">
                {visibles.map((t) => <FilaTarea key={t.id} t={t} mostrarResponsable={modoDemo} alAbrir={() => setAbierta(t.id)} />)}
              </ul>
            ) : (
              <div className="px-6 py-12 text-center">
                <CheckCircle2 className="mx-auto size-8 text-atenuado" />
                <p className="mt-2 font-medium">
                  {busqueda || frente !== null ? 'Ninguna tarea coincide con el filtro'
                    : soloVencidas ? 'No tienes tareas vencidas'
                      : `Sin tareas ${PESTANAS.find((p) => p.estado === pestana)!.etiqueta.toLowerCase()}`}
                </p>
                <p className="mt-1 text-sm text-atenuado">Las tareas te las asigna el líder, o puedes proponer una con{' '}
                  <button type="button" className="text-teal-200 hover:underline" onClick={() => setCreando(true)}>Nueva tarea</button>.</p>
              </div>
            )}
          </Tarjeta>

          <Tarjeta className="hidden md:block" titulo={<span className="flex items-center gap-2"><ClipboardList className="size-4 text-atenuado" />Mi cronograma <span className="font-normal text-atenuado">· próximas 4 semanas</span></span>}>
            <Cronograma tareas={delAmbito} alAbrir={setAbierta} />
          </Tarjeta>
        </div>

        {/* ── Columna derecha ───────────────────────────────── */}
        <aside className="space-y-5">
          <Tarjeta titulo={<span className="flex items-center gap-2"><Activity className="size-4 text-atenuado" />Actividad reciente</span>}>
            {actividad.recientes.length ? (
              <ol className="relative space-y-4 border-l border-borde/70 pl-5">
                {actividad.recientes.slice(0, 8).map((r) => (
                  <EntradaBitacora key={r.id} r={r} conTarea alAbrir={() => setAbierta(r.tareaId)} />
                ))}
              </ol>
            ) : <p className="text-sm text-atenuado">Cuando registres avances, aquí verás tu actividad.</p>}
          </Tarjeta>

          {contexto && esSolicitud ? (
            <Tarjeta titulo="Historial de evaluaciones">
              {contexto.evaluaciones.length ? (
                <ol className="space-y-3">
                  {contexto.evaluaciones.slice(0, 5).map((e) => {
                    const mia = e.individuales.find((i) => i.usuarioId === actorCompleto.id);
                    return (
                      <li key={e.id} className="rounded-lg border border-borde/70 bg-fondo/30 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium">{ETIQUETA_TIPO_EVALUACION[e.tipo]}</p>
                            <p className="text-[11px] text-atenuado">por {e.evaluador} · {relativo(e.fecha)} · avance {Math.round(e.avanceReportado)}%</p>
                          </div>
                          <span className="flex items-center gap-1.5 text-xs tabular-nums text-atenuado">{e.calificacionGlobal.toFixed(1)}/10<InsigniaNota letra={e.calificacionLetra} /></span>
                        </div>
                        {mia && <p className="mt-2 text-xs text-atenuado">Tu calificación: <b className="text-texto">{mia.puntaje}/5</b>{mia.comentario && ` — ${mia.comentario}`}</p>}
                        {e.comentario && <p className="mt-1.5 line-clamp-2 text-xs text-texto/80">{e.comentario}</p>}
                      </li>
                    );
                  })}
                </ol>
              ) : <p className="text-sm text-atenuado">El líder aún no ha registrado evaluaciones de esta solicitud.</p>}
            </Tarjeta>
          ) : (
            <Tarjeta titulo="Buenas prácticas">
              <ul className="space-y-2.5 text-sm text-atenuado">
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />Divide cada tarea en subtareas: el checklist te sugiere el %.</li>
                <li className="flex gap-2"><Clock className="mt-0.5 size-4 shrink-0 text-sky-400" />Registra las horas al terminar cada sesión, no al final de la semana.</li>
                <li className="flex gap-2"><Flag className="mt-0.5 size-4 shrink-0 text-amber-400" />Adjunta el pull request o documento como evidencia del avance.</li>
                <li className="flex gap-2"><Ban className="mt-0.5 size-4 shrink-0 text-red-400" /><span>Si algo te frena, marca la tarea como <b className="text-texto">Bloqueada</b> y explica el motivo.</span></li>
              </ul>
              <p className="mt-4 text-[11px] text-atenuado">
                Atajos: <kbd className="rounded border border-borde px-1">N</kbd> nueva tarea · <kbd className="rounded border border-borde px-1">/</kbd> buscar · <kbd className="rounded border border-borde px-1">Esc</kbd> cerrar panel
              </p>
            </Tarjeta>
          )}
        </aside>
      </div>

      {abierta && <PanelTarea tareaId={abierta} fuente={fuente} actor={actor} alCerrar={() => setAbierta(null)} alCambiar={() => void cargar()} />}
      {creando && (
        <NuevaTarea fuente={fuente} actor={actor} alCerrar={() => setCreando(false)}
          contextoInicial={ambito === 'todo' ? null : esSolicitud ? `SOLICITUD:${ambito.slice(2)}` : `PROYECTO:${ambito.slice(2)}`}
          alCrear={() => { setCreando(false); elegirPestana('PENDIENTE'); void cargar(); }} />
      )}
    </div>
  );
}

function FilaTarea({ t, mostrarResponsable, alAbrir }: { t: MiTarea; mostrarResponsable: boolean; alAbrir: () => void }) {
  const p = plazo(t.estado === 'COMPLETADA' ? null : t.fechaFinPlan);
  const st = ESTILO_ESTADO[t.estado];
  return (
    <li>
      <div role="button" tabIndex={0} onClick={alAbrir}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alAbrir(); } }}
        className="group flex cursor-pointer items-center gap-3 px-5 py-3 transition hover:bg-panel-2/50 focus-visible:bg-panel-2/60 focus-visible:outline-none">
        <st.Icono className={cn('size-4 shrink-0', t.estado === 'COMPLETADA' ? 'text-emerald-400' : t.estado === 'BLOQUEADA' ? 'text-red-400' : t.estado === 'EN_PROGRESO' ? 'text-sky-400' : 'text-violet-300')} />
        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-sm font-medium', t.estado === 'COMPLETADA' && 'text-atenuado')}>{t.titulo}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-atenuado">
            <span className="font-mono text-teal-200/80">{t.solicitudCodigo ?? t.proyectoCodigo}</span>
            <span className="inline-flex items-center gap-1"><span className={cn('size-1.5 rounded-full', colorFrente(t.grupo))} />{t.grupo ?? 'Sin frente'}</span>
            {p && <span className={cn(p.tono === 'vencida' ? 'font-medium text-red-300' : p.tono === 'pronto' ? 'text-amber-200' : '')}>{p.texto}</span>}
            {t.ultimoRegistro && <span className="hidden sm:inline">· último avance {relativo(t.ultimoRegistro)}</span>}
            {t.creadaPorMi && <span className="text-amber-200/80">· propuesta por ti</span>}
            {!t.editable && <span>· solo lectura</span>}
          </p>
        </div>
        {t.subtareasTotal > 0 && (
          <span className={cn('hidden items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] tabular-nums sm:inline-flex',
            t.subtareasHechas === t.subtareasTotal ? 'bg-emerald-500/10 text-emerald-200' : 'bg-panel-2 text-atenuado')}>
            <ListChecks className="size-3" />{t.subtareasHechas}/{t.subtareasTotal}
          </span>
        )}
        <span className="hidden md:block"><PillEstado estado={t.estado} /></span>
        {mostrarResponsable && t.responsable && (
          <span className="hidden items-center gap-1.5 text-xs text-atenuado lg:inline-flex"><Avatar nombre={t.responsable} className="size-6 text-[9px] ring-0" />{t.responsable.split(' ')[0]}</span>
        )}
        <Anillo valor={t.avancePct} tamano={34} grosor={3.5} color={t.estado === 'BLOQUEADA' ? 'stroke-red-400' : t.estado === 'COMPLETADA' ? 'stroke-emerald-400' : 'stroke-primario'}>
          <span className="text-[9px] font-semibold tabular-nums">{Math.round(t.avancePct)}</span>
        </Anillo>
        <span className="hidden rounded-lg border border-borde px-2.5 py-1 text-xs text-atenuado transition group-hover:border-primario/60 group-hover:text-teal-100 sm:inline">
          {t.editable && t.estado !== 'COMPLETADA' ? 'Registrar' : 'Ver detalle'}
        </span>
      </div>
    </li>
  );
}
