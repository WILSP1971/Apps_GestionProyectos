'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, CalendarDays, Check, Clock, ExternalLink, History, Loader2, Lock, MessageSquare, Plus, Sparkles, Trash2, X,
} from 'lucide-react';
import {
  ESTADOS_TAREA, ETIQUETA_ESTADO_TAREA, porcentajeSugerido,
  type DetalleTarea, type EstadoTarea, type RegistroAvance, type SubtareaVista,
} from '@sierraflow/contratos';
import { cn } from '@/lib/utils';
import { Avatar, BarraProgreso, Boton } from '@/componentes/ui/primitivos';
import { Portal } from '@/componentes/ui/portal';
import { useUsuario } from '@/componentes/layout/proveedores';
import { fuenteApi as adjuntosApi, fuenteDemo as adjuntosDemo, type FuenteAdjuntos } from '@/modulos/adjuntos/infraestructura/fuente-adjuntos';
import { ListaAdjuntos } from '@/modulos/adjuntos/ui/lista-adjuntos';
import { SelectorAdjuntos } from '@/modulos/adjuntos/ui/selector-adjuntos';
import type { Actor, FuenteAvances } from '../../infraestructura/fuente-avances';
import {
  colorFrente, ESTILO_ESTADO, fechaCorta, hoyIso, infoEvidencia, PillEstado, PipelineEstados, plazo, relativo,
} from './piezas';

const diasAtras = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);

/**
 * Panel lateral con el detalle de una tarea: datos generales, checklist, registro de avance
 * (%, estado, horas de la sesión, nota y evidencia) y la bitácora completa.
 */
export function PanelTarea({ tareaId, fuente, actor, alCerrar, alCambiar }: {
  tareaId: string; fuente: FuenteAvances; actor: Actor; alCerrar: () => void; alCambiar: () => void;
}) {
  const [d, setD] = useState<DetalleTarea | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cerrarRef = useRef<HTMLButtonElement>(null);
  const { modoDemo } = useUsuario();
  const adjuntos: FuenteAdjuntos = modoDemo ? adjuntosDemo : adjuntosApi;

  const cargar = useCallback(async () => {
    try { setD(await fuente.detalle(tareaId, actor)); setError(null); } catch (e) { setError((e as Error).message); }
  }, [fuente, tareaId, actor]);
  useEffect(() => { setD(null); void cargar(); }, [cargar]);
  useEffect(() => {
    cerrarRef.current?.focus();
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && alCerrar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [alCerrar]);

  const actualizarSubtareas = (subtareas: SubtareaVista[]) => {
    setD((x) => x && { ...x, subtareas, tarea: { ...x.tarea, subtareasTotal: subtareas.length, subtareasHechas: subtareas.filter((s) => s.completada).length } });
    alCambiar();
  };

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Detalle de la tarea">
      <button type="button" aria-label="Cerrar" tabIndex={-1} onClick={alCerrar} className="absolute inset-0 bg-black/55 backdrop-blur-[2px] entrada-fondo" />
      <aside className="relative flex h-full w-full max-w-[640px] flex-col border-l border-borde bg-panel shadow-2xl shadow-black/60 entrada-panel">
        {/* Encabezado */}
        <header className="border-b border-borde/70 px-6 pb-4 pt-5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-xs text-atenuado">
                <span className="font-semibold uppercase tracking-wider">Detalle de la tarea</span>
                {d && (d.tarea.solicitudId ? (
                  <Link href={`/solicitudes/${d.tarea.solicitudId}`} className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[11px] text-teal-200 hover:underline">{d.tarea.solicitudCodigo}</Link>
                ) : <span className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[11px] text-teal-200">{d.tarea.proyectoCodigo}</span>)}
                {d?.tarea.creadaPorMi && <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-200 ring-1 ring-inset ring-amber-400/25">Propuesta por ti</span>}
              </p>
              <h2 className="mt-1.5 text-lg font-semibold leading-snug tracking-tight">{d?.tarea.titulo ?? (error ? 'No se pudo cargar' : 'Cargando…')}</h2>
            </div>
            {d && <PillEstado estado={d.tarea.estado} className="mt-6" />}
            <button ref={cerrarRef} type="button" onClick={alCerrar} aria-label="Cerrar panel (Esc)"
              className="rounded-lg border border-borde p-1.5 text-atenuado hover:border-borde-fuerte hover:text-texto"><X className="size-4" /></button>
          </div>
          {d?.estadoSolicitud && <div className="mt-4"><PipelineEstados estado={d.estadoSolicitud} compacto /></div>}
        </header>

        <div className="flex-1 overflow-y-auto">
          {error ? (
            <p className="m-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</p>
          ) : !d ? (
            <div className="space-y-4 p-6">{[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-panel-2/60" />)}</div>
          ) : (
            <div className="space-y-7 px-6 py-5">
              <InfoGeneral d={d} />
              <Checklist d={d} fuente={fuente} actor={actor} alActualizar={actualizarSubtareas} />
              {d.permisos.registrar
                ? <Registrar key={d.tarea.version} d={d} fuente={fuente} adjuntos={adjuntos} actor={actor} alRegistrar={(nuevo) => { setD(nuevo); alCambiar(); }} />
                : <p className="flex items-center gap-2 rounded-lg border border-borde bg-panel-2/50 px-4 py-3 text-sm text-atenuado"><Lock className="size-4" />La solicitud o el proyecto ya no admite cambios: la tarea es de solo lectura.</p>}
              <Bitacora registros={d.bitacora} adjuntos={adjuntos} />
            </div>
          )}
        </div>

        {d && d.tarea.creadaPorMi && d.tarea.avancePct === 0 && d.tarea.horasReales === 0 && d.permisos.registrar && (
          <footer className="flex justify-between border-t border-borde/70 px-6 py-3">
            <Boton variante="peligro" tamano="sm" onClick={async () => {
              if (!confirm(`¿Eliminar la tarea "${d.tarea.titulo}"?`)) return;
              try { await fuente.eliminarTarea(d.tarea); toast.success('Tarea eliminada'); alCambiar(); alCerrar(); } catch (e) { toast.error((e as Error).message); }
            }}><Trash2 className="size-3.5" />Eliminar tarea</Boton>
            <span className="self-center text-xs text-atenuado">Puedes eliminarla mientras no tenga avance ni horas.</span>
          </footer>
        )}
      </aside>
    </div>
    </Portal>
  );
}

// ------------------------------------------------------------------ información general
function InfoGeneral({ d }: { d: DetalleTarea }) {
  const t = d.tarea;
  const p = plazo(t.estado === 'COMPLETADA' ? null : t.fechaFinPlan);
  const consumo = t.horasEstimadas ? (t.horasReales / t.horasEstimadas) * 100 : null;
  const Dato = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
    <div><dt className="text-xs text-atenuado">{titulo}</dt><dd className="mt-1 text-sm">{children}</dd></div>
  );
  return (
    <section aria-label="Información general">
      <div className="mb-4 flex items-center gap-4 rounded-xl border border-borde bg-fondo/40 p-4">
        <div className="flex-1">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-atenuado">Avance de la tarea</span>
            <span className="text-2xl font-semibold tabular-nums">{Math.round(t.avancePct)}%</span>
          </div>
          <BarraProgreso valor={t.avancePct} className="mt-2 h-1.5" color={ESTILO_ESTADO[t.estado].barra} />
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        <Dato titulo="Frente"><span className="inline-flex items-center gap-2"><span className={cn('size-2 rounded-full', colorFrente(t.grupo))} />{t.grupo ?? 'Sin frente'}</span></Dato>
        <Dato titulo="Asignado a">
          <span className="inline-flex items-center gap-2">{t.responsable ? <><Avatar nombre={t.responsable} className="size-6 text-[9px] ring-0" />{t.responsable}</> : '—'}</span>
        </Dato>
        <Dato titulo={t.solicitudId ? 'Solicitud' : 'Proyecto'}>
          <span className="line-clamp-2">{t.solicitudId ? t.solicitudTitulo : t.proyectoNombre}</span>
        </Dato>
        <Dato titulo="Fecha de inicio">{fechaCorta(t.fechaInicio)}</Dato>
        <Dato titulo="Fecha de entrega">
          {fechaCorta(t.fechaFinPlan)}
          {p && <span className={cn('ml-1.5 text-xs', p.tono === 'vencida' ? 'text-red-300' : p.tono === 'pronto' ? 'text-amber-200' : 'text-atenuado')}>· {p.texto}</span>}
        </Dato>
        <Dato titulo="Peso en el avance">{t.peso} {t.peso === 1 ? 'punto' : 'puntos'}</Dato>
        <div className="col-span-2 sm:col-span-3">
          <dt className="flex items-baseline justify-between text-xs text-atenuado">
            <span>Estimación vs. registrado</span>
            <span className={cn('tabular-nums', consumo != null && consumo > 100 && 'text-amber-200')}>
              <b className="text-texto">{t.horasReales} h</b> de {t.horasEstimadas ?? '—'} h estimadas{consumo != null && ` · ${Math.round(consumo)}%`}
            </span>
          </dt>
          <dd className="mt-2"><BarraProgreso valor={consumo ?? 0} className="h-1" color={consumo != null && consumo > 100 ? 'bg-amber-400' : 'bg-sky-400'} /></dd>
        </div>
      </dl>
      {t.descripcion && (
        <div className="mt-5">
          <h3 className="text-xs text-atenuado">Descripción</h3>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-texto/90">{t.descripcion}</p>
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ checklist
function Checklist({ d, fuente, actor, alActualizar }: {
  d: DetalleTarea; fuente: FuenteAvances; actor: Actor; alActualizar: (s: SubtareaVista[]) => void;
}) {
  const [nueva, setNueva] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const hechas = d.subtareas.filter((s) => s.completada).length;
  const editable = d.permisos.checklist;

  const ejecutar = async (clave: string, accion: () => Promise<SubtareaVista[]>) => {
    setOcupado(clave);
    try { alActualizar(await accion()); } catch (e) { toast.error((e as Error).message); } finally { setOcupado(null); }
  };

  return (
    <section aria-label="Subtareas">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Subtareas <span className="font-normal text-atenuado">(checklist)</span></h3>
        {d.subtareas.length > 0 && <span className="text-xs tabular-nums text-atenuado">{hechas}/{d.subtareas.length} completadas</span>}
      </div>
      {d.subtareas.length > 0 && <BarraProgreso valor={(hechas / d.subtareas.length) * 100} className="mb-3 h-1" color="bg-emerald-400" />}
      <ul className="space-y-1">
        {d.subtareas.map((s) => (
          <li key={s.id} className="group flex items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-panel-2/60">
            <button type="button" disabled={!editable || ocupado === s.id} role="checkbox" aria-checked={s.completada} aria-label={s.titulo}
              onClick={() => void ejecutar(s.id, () => fuente.actualizarSubtarea(d.tarea.id, s.id, { completada: !s.completada }, actor))}
              className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition',
                s.completada ? 'border-emerald-500 bg-emerald-500 text-slate-950' : 'border-borde-fuerte hover:border-primario', !editable && 'cursor-default')}>
              {ocupado === s.id ? <Loader2 className="size-3 animate-spin" /> : s.completada && <Check className="size-3.5" strokeWidth={3} />}
            </button>
            <div className="min-w-0 flex-1">
              <p className={cn('text-sm', s.completada && 'text-atenuado line-through decoration-atenuado/50')}>{s.titulo}</p>
              {s.completada && s.completadaEn && <p className="text-[11px] text-atenuado">Completado {relativo(s.completadaEn)}{s.completadaPor && ` · ${s.completadaPor}`}</p>}
            </div>
            {editable && (
              <button type="button" aria-label={`Eliminar subtarea ${s.titulo}`} onClick={() => void ejecutar(`x${s.id}`, () => fuente.eliminarSubtarea(d.tarea.id, s.id))}
                className="rounded p-1 text-atenuado opacity-0 transition hover:text-red-300 focus:opacity-100 group-hover:opacity-100"><Trash2 className="size-3.5" /></button>
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <form className="mt-2 flex gap-2" onSubmit={(e) => {
          e.preventDefault();
          const titulo = nueva.trim();
          if (titulo.length < 2) return;
          void ejecutar('nueva', async () => { const r = await fuente.crearSubtarea(d.tarea.id, titulo, actor); setNueva(''); return r; });
        }}>
          <input value={nueva} onChange={(e) => setNueva(e.target.value)} maxLength={200} placeholder="Agregar subtarea y pulsar Enter…"
            className="campo h-9 flex-1 text-sm" aria-label="Nueva subtarea" />
          <Boton type="submit" variante="secundario" tamano="sm" className="h-9" disabled={nueva.trim().length < 2 || ocupado === 'nueva'}>
            {ocupado === 'nueva' ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}Agregar
          </Boton>
        </form>
      )}
      {!d.subtareas.length && !editable && <p className="text-sm text-atenuado">Sin subtareas.</p>}
    </section>
  );
}

// ------------------------------------------------------------------ registrar avance
function Registrar({ d, fuente, adjuntos, actor, alRegistrar }: {
  d: DetalleTarea; fuente: FuenteAvances; adjuntos: FuenteAdjuntos; actor: Actor; alRegistrar: (d: DetalleTarea) => void;
}) {
  const t = d.tarea;
  const sugerido = porcentajeSugerido(d.subtareas);
  // Si el checklist ya va por delante del avance guardado, el formulario arranca con ese porcentaje
  const desdeChecklist = t.estado !== 'COMPLETADA' && sugerido != null && sugerido > Math.round(t.avancePct);
  const [estado, setEstado] = useState<EstadoTarea>(
    desdeChecklist ? (sugerido === 100 ? 'COMPLETADA' : t.estado === 'PENDIENTE' && sugerido! > 0 ? 'EN_PROGRESO' : t.estado) : t.estado);
  const [avance, setAvance] = useState(desdeChecklist ? sugerido! : Math.round(t.avancePct));
  const [autoChecklist, setAutoChecklist] = useState(desdeChecklist);
  const [horas, setHoras] = useState('');
  const [fecha, setFecha] = useState(hoyIso());
  const [nota, setNota] = useState('');
  const [evidencia, setEvidencia] = useState('');
  const [archivos, setArchivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);

  const h = Math.max(0, Math.min(24, Number(horas.replace(',', '.')) || 0));
  const evidenciaOk = !evidencia.trim() || /^https?:\/\/\S+$/i.test(evidencia.trim());
  const delta = avance - Math.round(t.avancePct);
  const cambia = estado !== t.estado || delta !== 0 || h > 0 || !!nota.trim() || !!evidencia.trim() || archivos.length > 0;
  const faltaMotivo = estado === 'BLOQUEADA' && t.estado !== 'BLOQUEADA' && !nota.trim();
  const ev = useMemo(() => (evidencia.trim() && evidenciaOk ? infoEvidencia(evidencia.trim()) : null), [evidencia, evidenciaOk]);

  const elegirEstado = (e: EstadoTarea) => {
    setEstado(e);
    if (e === 'COMPLETADA') setAvance(100);
    else if (avance === 100) setAvance(t.estado === 'COMPLETADA' ? 90 : 95);
  };
  const moverAvance = (v: number, porChecklist = false) => {
    setAvance(v);
    setAutoChecklist(porChecklist);
    if (v === 100) setEstado('COMPLETADA');
    else if (estado === 'COMPLETADA') setEstado('EN_PROGRESO');
    else if (v > 0 && estado === 'PENDIENTE') setEstado('EN_PROGRESO');
  };

  // Al marcar o desmarcar subtareas, el porcentaje se calcula y se coloca solo
  const claveChecklist = `${d.subtareas.filter((s) => s.completada).length}/${d.subtareas.length}`;
  const claveAnterior = useRef(claveChecklist);
  useEffect(() => {
    if (claveAnterior.current === claveChecklist) return;
    claveAnterior.current = claveChecklist;
    if (sugerido != null) moverAvance(sugerido, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveChecklist]);

  const enviar = async () => {
    if (!cambia || enviando || !evidenciaOk || faltaMotivo) return;
    setEnviando(true);
    try {
      const nuevo = await fuente.registrar(t.id, {
        version: t.version,
        ...(estado !== t.estado && { estado }),
        ...(delta !== 0 && { avancePct: avance }),
        horas: h,
        ...(fecha !== hoyIso() && { fechaTrabajo: fecha }),
        ...(nota.trim() && { nota: nota.trim() }),
        ...(evidencia.trim() && { evidenciaUrl: evidencia.trim() }),
        ...(archivos.length && { adjuntos: archivos.length }),
      }, actor);
      // Evidencias en archivo: se suben al registro recién creado
      let fallidos = 0;
      if (archivos.length && nuevo.registroId) {
        for (const f of archivos) {
          try { await adjuntos.subir({ tareaId: t.id, avanceId: nuevo.registroId }, f, actor); } catch (e) { fallidos++; toast.error(`${f.name}: ${(e as Error).message}`); }
        }
      }
      const final = archivos.length ? await fuente.detalle(t.id, actor) : nuevo;
      toast.success(nuevo.tarea.estado === 'COMPLETADA' && t.estado !== 'COMPLETADA' ? '¡Tarea completada! 🎉'
        : fallidos ? `Avance registrado (${fallidos} archivo(s) no se pudieron subir)` : 'Avance registrado');
      alRegistrar(final);
    } catch (e) {
      toast.error((e as Error).message);
      setEnviando(false);
    }
  };

  return (
    <section aria-label="Registrar avance" className="rounded-xl border border-primario/30 bg-gradient-to-b from-primario/[0.07] to-transparent p-4"
      onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void enviar(); } }}>
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-teal-300" />Registrar avance</h3>

      {/* Estado */}
      <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="radiogroup" aria-label="Estado">
        {ESTADOS_TAREA.map((e) => {
          const st = ESTILO_ESTADO[e];
          return (
            <button key={e} type="button" role="radio" aria-checked={estado === e} onClick={() => elegirEstado(e)}
              className={cn('flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition',
                estado === e ? cn(st.pill, 'border-transparent ring-1 ring-inset') : 'border-borde text-atenuado hover:border-borde-fuerte hover:text-texto')}>
              <st.Icono className="size-3.5" />{ETIQUETA_ESTADO_TAREA[e]}
            </button>
          );
        })}
      </div>

      {/* Porcentaje */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-atenuado">Porcentaje de avance</span>
          <span className="flex items-center gap-2">
            {delta !== 0 && <span className={cn('rounded px-1.5 py-0.5 font-medium tabular-nums', delta > 0 ? 'bg-emerald-500/15 text-emerald-200' : 'bg-red-500/15 text-red-200')}>{delta > 0 ? '+' : ''}{delta}%</span>}
            <span className="text-lg font-semibold tabular-nums text-texto">{avance}%</span>
          </span>
        </div>
        <input type="range" min={0} max={100} step={5} value={avance} onChange={(e) => moverAvance(Number(e.target.value))}
          aria-label="Porcentaje de avance" className="mt-1 w-full accent-teal-500" />
        <div className="flex flex-wrap items-center gap-1.5">
          {[25, 50, 75, 100].map((v) => (
            <button key={v} type="button" onClick={() => moverAvance(v)}
              className={cn('rounded-md border px-2 py-0.5 text-[11px] tabular-nums', avance === v ? 'border-primario text-teal-200' : 'border-borde text-atenuado hover:text-texto')}>{v}%</button>
          ))}
          {sugerido != null && sugerido !== avance && (
            <button type="button" onClick={() => moverAvance(sugerido, true)}
              className="ml-auto inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200 ring-1 ring-inset ring-emerald-400/25 hover:bg-emerald-500/20">
              <Check className="size-3" />Usar {sugerido}% del checklist
            </button>
          )}
        </div>
        {autoChecklist && sugerido === avance && avance !== Math.round(t.avancePct) && (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-200" role="status">
            <Check className="size-3" />Calculado del checklist ({claveChecklist} subtareas). Pulsa «Registrar avance» para guardarlo.
          </p>
        )}
      </div>

      {/* Horas y fecha */}
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <label htmlFor="horas-sesion" className="text-xs text-atenuado">Horas trabajadas en esta sesión</label>
          <div className="mt-1 flex items-center gap-1.5">
            <div className="relative">
              <Clock className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-atenuado" />
              <input id="horas-sesion" inputMode="decimal" value={horas} onChange={(e) => setHoras(e.target.value.replace(/[^\d.,]/g, ''))}
                placeholder="0" className="campo h-9 w-24 pl-8 text-sm tabular-nums" />
            </div>
            {[0.5, 1, 2, 4].map((v) => (
              <button key={v} type="button" onClick={() => setHoras(String(Math.min(24, Math.round((h + v) * 100) / 100)))}
                className="rounded-md border border-borde px-2 py-1 text-[11px] text-atenuado hover:border-borde-fuerte hover:text-texto">+{v} h</button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="fecha-trabajo" className="text-xs text-atenuado">Fecha del trabajo</label>
          <div className="relative mt-1">
            <CalendarDays className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-atenuado" />
            <select id="fecha-trabajo" value={fecha} onChange={(e) => setFecha(e.target.value)} className="campo h-9 w-40 pl-8 text-sm">
              <option value={hoyIso()}>Hoy</option>
              <option value={diasAtras(1)}>Ayer</option>
              {[2, 3, 4, 5, 6].map((n) => <option key={n} value={diasAtras(n)}>{fechaCorta(diasAtras(n))}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Nota y evidencia */}
      <label className="mt-4 block">
        <span className="text-xs text-atenuado">
          {estado === 'BLOQUEADA' && t.estado !== 'BLOQUEADA' ? <span className="text-red-200">Motivo del bloqueo (obligatorio)</span> : 'Nota del avance'}
        </span>
        <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={3} maxLength={4000}
          placeholder={estado === 'BLOQUEADA' ? '¿Qué te bloquea y qué necesitas para continuar?' : '¿Qué hiciste? ¿Qué sigue? ¿Algún riesgo?'}
          className={cn('campo mt-1 resize-y text-sm', faltaMotivo && 'border-red-500/60')} />
      </label>
      <label className="mt-3 block">
        <span className="text-xs text-atenuado">Evidencia: enlace (pull request o rama de GitHub, documento, diseño…)</span>
        <div className="relative mt-1">
          {ev ? <ev.Icono className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-teal-300" />
            : <ExternalLink className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-atenuado" />}
          <input value={evidencia} onChange={(e) => setEvidencia(e.target.value)} maxLength={500} inputMode="url"
            placeholder="https://github.com/org/repo/pull/123" className={cn('campo h-9 pl-8 text-sm', !evidenciaOk && 'border-red-500/60')} />
        </div>
        {!evidenciaOk && <span className="mt-1 block text-[11px] text-red-300">El enlace debe empezar por http:// o https://</span>}
      </label>
      <div className="mt-3">
        <span className="mb-1 block text-xs text-atenuado">…y/o archivos (capturas, PDF, código)</span>
        <SelectorAdjuntos archivos={archivos} alCambiar={setArchivos} compacto texto="Adjuntar archivos de evidencia" />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="hidden text-[11px] text-atenuado sm:block"><kbd className="rounded border border-borde px-1">Ctrl</kbd> + <kbd className="rounded border border-borde px-1">Enter</kbd> para guardar</span>
        <Boton type="button" onClick={() => void enviar()} disabled={!cambia || enviando || !evidenciaOk || faltaMotivo} className="ml-auto">
          {enviando ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}Registrar avance
        </Boton>
      </div>
      {estado === 'BLOQUEADA' && t.estado !== 'BLOQUEADA' && (
        <p className="mt-3 flex items-start gap-2 text-[11px] text-amber-200/90"><AlertTriangle className="mt-px size-3.5 shrink-0" />El líder verá la tarea bloqueada en Evaluación y en el Kanban.</p>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ bitácora
function Bitacora({ registros, adjuntos }: { registros: RegistroAvance[]; adjuntos: FuenteAdjuntos }) {
  return (
    <section aria-label="Bitácora">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><History className="size-4 text-atenuado" />Bitácora y evidencias</h3>
      {!registros.length ? (
        <p className="rounded-lg border border-dashed border-borde px-4 py-6 text-center text-sm text-atenuado">Aún no hay registros. El primero que guardes aparecerá aquí.</p>
      ) : (
        <ol className="relative space-y-4 border-l border-borde/70 pl-5">
          {registros.map((r) => <EntradaBitacora key={r.id} r={r} adjuntos={adjuntos} />)}
        </ol>
      )}
    </section>
  );
}

export function EntradaBitacora({ r, conTarea, alAbrir, adjuntos }: {
  r: RegistroAvance; conTarea?: boolean; alAbrir?: () => void; adjuntos?: FuenteAdjuntos;
}) {
  const ev = r.evidenciaUrl ? infoEvidencia(r.evidenciaUrl) : null;
  const punto = r.tipo === 'SUBTAREA' ? 'bg-emerald-400' : r.tipo === 'CREACION' ? 'bg-amber-400' : r.estadoNuevo ? ESTILO_ESTADO[r.estadoNuevo].punto : 'bg-primario';
  return (
    <li className="relative">
      <span className={cn('absolute -left-[25px] top-1.5 size-2.5 rounded-full ring-4 ring-panel', punto)} aria-hidden />
      <div className="flex items-start gap-2 text-xs">
        <p className="min-w-0 flex-1 leading-relaxed">
          <span className="font-medium text-texto">{r.usuario}</span>{' '}
          <span className="text-atenuado">{r.tipo === 'CREACION' ? 'creó la tarea' : r.tipo === 'SUBTAREA' ? 'marcó una subtarea' : 'registró avance'}</span>
          {conTarea && <><span className="text-atenuado"> en </span>{alAbrir
            ? <button type="button" onClick={alAbrir} className="text-left text-texto/90 hover:text-teal-200 hover:underline">{r.tareaTitulo}</button>
            : <span className="text-texto/90">{r.tareaTitulo}</span>}</>}
        </p>
        <time className="shrink-0 text-atenuado" dateTime={r.creadoEn} title={new Date(r.creadoEn).toLocaleString('es-CO')}>{relativo(r.creadoEn)}</time>
      </div>
      {(r.avanceNuevo != null && r.avanceAnterior !== r.avanceNuevo || r.estadoNuevo || r.horas > 0) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {r.avanceNuevo != null && r.avanceAnterior !== r.avanceNuevo && (
            <span className="rounded-md bg-panel-2 px-2 py-0.5 text-[11px] tabular-nums text-texto">{Math.round(r.avanceAnterior ?? 0)}% → <b>{Math.round(r.avanceNuevo)}%</b></span>
          )}
          {r.estadoNuevo && <PillEstado estado={r.estadoNuevo} className="py-0 text-[11px]" />}
          {r.horas > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-200">
              <Clock className="size-3" />{r.horas} h{r.fechaTrabajo !== r.creadoEn.slice(0, 10) && ` · ${fechaCorta(r.fechaTrabajo)}`}
            </span>
          )}
        </div>
      )}
      {r.nota && (
        <p className={cn('mt-1.5 text-sm leading-relaxed', r.tipo === 'SUBTAREA' ? 'text-atenuado' : 'text-texto/90')}>
          {r.tipo === 'AVANCE' && <MessageSquare className="mr-1.5 inline size-3.5 text-atenuado" aria-hidden />}{r.nota}
        </p>
      )}
      {ev && (
        <a href={r.evidenciaUrl!} target="_blank" rel="noopener noreferrer"
          className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-md border border-borde bg-fondo/50 px-2 py-1 text-xs text-sky-300 hover:border-sky-400/50 hover:underline">
          <ev.Icono className="size-3.5 shrink-0" /><span className="truncate">{ev.etiqueta}</span><ExternalLink className="size-3 shrink-0 text-atenuado" />
        </a>
      )}
      {adjuntos && r.adjuntos?.length > 0 && <div className="mt-1.5"><ListaAdjuntos adjuntos={r.adjuntos} fuente={adjuntos} compacta /></div>}
    </li>
  );
}
