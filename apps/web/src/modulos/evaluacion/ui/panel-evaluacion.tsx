'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, ChevronLeft, Loader2, Plus, Trash2, WifiOff } from 'lucide-react';
import {
  ESTADOS_CON_TAREAS, ESTADOS_EVALUABLES, ESTADOS_TAREA, ETIQUETA_ESTADO_TAREA, ETIQUETA_ROL_SOLICITUD, ETIQUETA_TIPO_EVALUACION,
  letraCalificacion, notaGlobal, TIPOS_EVALUACION,
  type ContextoEvaluacion, type EstadoTarea, type EvaluacionVista, type TareaVista, type TipoEvaluacion,
} from '@sierraflow/contratos';
import { cn } from '@/lib/utils';
import { Avatar, BarraProgreso, Boton, Tarjeta, Vacio } from '@/componentes/ui/primitivos';
import { useActor, useUsuario } from '@/componentes/layout/proveedores';
import { InsigniaEstado } from '@/modulos/solicitudes/ui/insignias';
import { fuenteApi, fuenteDemo, type FuenteEvaluacion } from '../infraestructura/fuente-evaluacion';
import { InsigniaNota } from './insignia-nota';

const COLOR_ESTADO_TAREA: Record<EstadoTarea, string> = {
  PENDIENTE: 'text-atenuado', EN_PROGRESO: 'text-sky-300', BLOQUEADA: 'text-red-300', COMPLETADA: 'text-emerald-300',
};
const ETIQUETA_PUNTAJE = ['', 'Deficiente', 'Insuficiente', 'Aceptable', 'Bueno', 'Excelente'];

/** Gestión y calificación del avance de una solicitud (M4). Lee el id de la URL, como el detalle. */
export function PanelEvaluacion() {
  const ruta = usePathname();
  const id = ruta.split('/').filter(Boolean).pop() ?? '';
  const { modoDemo } = useUsuario();
  const fuente = modoDemo ? fuenteDemo : fuenteApi;
  const [ctx, setCtx] = useState<ContextoEvaluacion | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    try {
      setCtx(await fuente.contexto(id));
      setError(null);
    } catch (e) {
      setError(navigator.onLine ? (e as Error).message : 'sin-conexion');
    }
  }, [fuente, id]);

  useEffect(() => { void recargar(); }, [recargar]);

  if (error) {
    return <Vacio icono={<WifiOff className="size-8" />} titulo={error === 'sin-conexion' ? 'La evaluación necesita conexión' : 'No se pudo cargar'}
      texto={error === 'sin-conexion' ? 'El avance del equipo y las notas se consultan en el servidor.' : error}
      accion={<Link href="/gestion/evaluacion" className="text-sm text-primario hover:underline">Volver al listado</Link>} />;
  }
  if (!ctx) return <div className="h-96 animate-pulse rounded-xl bg-panel/60" />;

  const s = ctx.solicitud;
  const ultima = ctx.evaluaciones[0];
  return (
    <div className="space-y-5">
      <Link href={ctx.permisos.evaluar ? '/gestion/evaluacion' : `/solicitudes/${s.id}`} className="inline-flex items-center gap-1 text-sm text-atenuado hover:text-texto">
        <ChevronLeft className="size-4" /> {ctx.permisos.evaluar ? 'Seguimiento y evaluación' : 'Volver a la solicitud'}
      </Link>

      <Tarjeta>
        <div className="flex flex-wrap items-center gap-5">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-xs text-atenuado">
              <span className="size-2 rounded-full" style={{ background: s.departamentoColor ?? '#64748b' }} />
              <Link href={`/solicitudes/${s.id}`} className="font-mono text-sky-300 hover:underline">{s.codigo}</Link>
              · {s.departamento} · {s.solicitante}
              {s.fechaDeseada && <> · deseada {new Date(`${s.fechaDeseada}T12:00:00`).toLocaleDateString('es-CO')}</>}
            </p>
            <h2 className="mt-1 text-lg font-semibold">{s.titulo}</h2>
            <div className="mt-2"><InsigniaEstado estado={s.estado} /></div>
          </div>
          <div className="w-56">
            <p className="text-xs text-atenuado">Avance general (ponderado)</p>
            <p className="text-3xl font-semibold tabular-nums">{Math.round(s.avancePct)}%</p>
            <BarraProgreso valor={s.avancePct} className="mt-1.5" />
          </div>
          {ultima && (
            <div className="flex items-center gap-3 border-l border-borde/70 pl-5">
              <InsigniaNota letra={ultima.calificacionLetra} grande />
              <div className="text-xs text-atenuado">
                <p className="text-base font-semibold tabular-nums text-texto">{ultima.calificacionGlobal.toFixed(1)}<span className="text-xs text-atenuado">/10</span></p>
                <p>Última nota · {new Date(ultima.fecha).toLocaleDateString('es-CO')}</p>
              </div>
            </div>
          )}
        </div>
      </Tarjeta>

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Frentes ctx={ctx} />
          <Tareas ctx={ctx} fuente={fuente} alCambiar={recargar} />
        </div>
        <div className="space-y-5">
          {ctx.permisos.evaluar && <FormularioEvaluacion ctx={ctx} fuente={fuente} alGuardar={recargar} />}
          <Historial evaluaciones={ctx.evaluaciones} ctx={ctx} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
function Frentes({ ctx }: { ctx: ContextoEvaluacion }) {
  return (
    <Tarjeta titulo="Avance por frente">
      {ctx.frentes.length === 0 ? (
        <p className="text-sm text-atenuado">Aún no hay tareas. {ctx.permisos.gestionarTareas ? 'Crea las tareas de cada frente para medir el avance.' : ''}</p>
      ) : (
        <ul className="space-y-3.5">
          {ctx.frentes.map((f) => (
            <li key={f.grupoId ?? 'sin'}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{f.grupo}</span>
                <span className="text-xs text-atenuado">
                  {f.completadas}/{f.tareas} completadas{f.bloqueadas ? ` · ${f.bloqueadas} bloqueada(s)` : ''}
                  <span className="ml-2 inline-block w-10 text-right font-medium tabular-nums text-texto">{Math.round(f.avancePct)}%</span>
                </span>
              </div>
              <BarraProgreso valor={f.avancePct} />
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------
function Tareas({ ctx, fuente, alCambiar }: { ctx: ContextoEvaluacion; fuente: FuenteEvaluacion; alCambiar: () => Promise<void> }) {
  const actor = useActor();
  const editable = ESTADOS_CON_TAREAS.includes(ctx.solicitud.estado);
  const [nueva, setNueva] = useState(false);

  return (
    <Tarjeta titulo={`Tareas (${ctx.tareas.length})`} cuerpoClassName="p-0"
      acciones={ctx.permisos.gestionarTareas && editable && !nueva && (
        <Boton tamano="sm" variante="secundario" onClick={() => setNueva(true)}><Plus className="size-4" /> Nueva tarea</Boton>
      )}>
      {nueva && <NuevaTareaForm ctx={ctx} fuente={fuente} alTerminar={async (ok) => { setNueva(false); if (ok) await alCambiar(); }} />}
      {ctx.tareas.length === 0 && !nueva ? (
        <p className="px-5 py-8 text-center text-sm text-atenuado">
          {editable ? 'Sin tareas todavía.' : 'Esta solicitud no tiene tareas registradas.'}
        </p>
      ) : (
        <ul className="divide-y divide-borde/50">
          {ctx.tareas.map((t) => (
            <FilaTarea key={`${t.id}:${t.version}`} tarea={t} ctx={ctx} fuente={fuente} alCambiar={alCambiar}
              puedeEditar={editable && (ctx.permisos.gestionarTareas || t.responsableId === actor.id)} />
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}

function FilaTarea({ tarea: t, ctx, fuente, alCambiar, puedeEditar }: {
  tarea: TareaVista; ctx: ContextoEvaluacion; fuente: FuenteEvaluacion; alCambiar: () => Promise<void>; puedeEditar: boolean;
}) {
  const [avance, setAvance] = useState(String(Math.round(t.avancePct)));
  const [horas, setHoras] = useState(String(t.horasReales));
  const [guardando, setGuardando] = useState(false);

  const guardar = async (cambio: Parameters<FuenteEvaluacion['actualizarTarea']>[1]) => {
    setGuardando(true);
    try {
      await fuente.actualizarTarea(t.id, cambio);
      await alCambiar();
    } catch (e) {
      toast.error((e as Error).message);
      setAvance(String(Math.round(t.avancePct)));
      setHoras(String(t.horasReales));
    } finally {
      setGuardando(false);
    }
  };
  const confirmarAvance = () => {
    const v = Math.max(0, Math.min(100, Number(avance) || 0));
    if (v !== Math.round(t.avancePct)) void guardar({ version: t.version, avancePct: v });
  };
  const confirmarHoras = () => {
    const v = Math.max(0, Number(horas) || 0);
    if (v !== t.horasReales) void guardar({ version: t.version, horasReales: v });
  };
  const eliminar = async () => {
    setGuardando(true);
    try {
      await fuente.eliminarTarea(t.id, t.version);
      await alCambiar();
    } catch (e) {
      toast.error((e as Error).message);
      setGuardando(false);
    }
  };

  return (
    <li className="px-5 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-60">
          <p className="text-sm font-medium">{t.titulo}</p>
          <p className="text-xs text-atenuado">
            {t.grupo ?? 'Sin frente'} · {t.responsable ?? 'Sin responsable'} · peso {t.peso}
            {t.horasEstimadas != null && ` · ${t.horasEstimadas} h estimadas`}
            {t.fechaFinPlan && ` · entrega ${new Date(`${t.fechaFinPlan}T12:00:00`).toLocaleDateString('es-CO')}`}
          </p>
        </div>
        {puedeEditar ? (
          <>
            <select aria-label="Estado de la tarea" className={cn('campo h-8 w-36 py-0 text-xs', COLOR_ESTADO_TAREA[t.estado])} value={t.estado} disabled={guardando}
              onChange={(e) => void guardar({ version: t.version, estado: e.target.value as EstadoTarea })}>
              {ESTADOS_TAREA.map((e) => <option key={e} value={e}>{ETIQUETA_ESTADO_TAREA[e]}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-atenuado">
              <input type="number" min={0} max={100} step={5} value={avance} disabled={guardando} aria-label="Avance en porcentaje"
                onChange={(e) => setAvance(e.target.value)} onBlur={confirmarAvance}
                onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
                className="campo h-8 w-16 py-0 text-right text-xs tabular-nums" />%
            </label>
            <label className="flex items-center gap-1.5 text-xs text-atenuado">
              <input type="number" min={0} step={0.5} value={horas} disabled={guardando} aria-label="Horas reales"
                onChange={(e) => setHoras(e.target.value)} onBlur={confirmarHoras}
                onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
                className="campo h-8 w-16 py-0 text-right text-xs tabular-nums" />h
            </label>
            {ctx.permisos.gestionarTareas && (
              <button onClick={eliminar} disabled={guardando} aria-label={`Eliminar tarea ${t.titulo}`}
                className="rounded p-1.5 text-atenuado hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-4" /></button>
            )}
            {guardando && <Loader2 className="size-4 animate-spin text-atenuado" />}
          </>
        ) : (
          <span className={cn('text-xs', COLOR_ESTADO_TAREA[t.estado])}>{ETIQUETA_ESTADO_TAREA[t.estado]} · {Math.round(t.avancePct)}%</span>
        )}
      </div>
      <BarraProgreso valor={t.avancePct} className="mt-2 h-1" color={t.estado === 'BLOQUEADA' ? 'bg-red-500' : t.estado === 'COMPLETADA' ? 'bg-emerald-500' : undefined} />
    </li>
  );
}

function NuevaTareaForm({ ctx, fuente, alTerminar }: { ctx: ContextoEvaluacion; fuente: FuenteEvaluacion; alTerminar: (ok: boolean) => Promise<void> }) {
  const [titulo, setTitulo] = useState('');
  const [grupoId, setGrupoId] = useState(ctx.grupos[0]?.id ?? '');
  const [responsableId, setResponsableId] = useState('');
  const [peso, setPeso] = useState('1');
  const [horas, setHoras] = useState('');
  const [fecha, setFecha] = useState('');
  const [guardando, setGuardando] = useState(false);

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    try {
      await fuente.crearTarea(ctx.solicitud.id, {
        titulo: titulo.trim(), grupoId: grupoId || null, responsableId: responsableId || null,
        peso: Number(peso) || 1, horasEstimadas: horas ? Number(horas) : null, fechaFinPlan: fecha || null,
      });
      toast.success('Tarea creada');
      await alTerminar(true);
    } catch (err) {
      toast.error((err as Error).message);
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={crear} className="grid gap-3 border-b border-borde/60 bg-fondo/30 px-5 py-4 sm:grid-cols-6">
      <input autoFocus required minLength={3} maxLength={200} value={titulo} onChange={(e) => setTitulo(e.target.value)}
        placeholder="Título de la tarea" className="campo sm:col-span-6" />
      <select value={grupoId} onChange={(e) => setGrupoId(e.target.value)} className="campo sm:col-span-2" aria-label="Frente">
        <option value="">Sin frente</option>
        {ctx.grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
      </select>
      <select value={responsableId} onChange={(e) => setResponsableId(e.target.value)} className="campo sm:col-span-2" aria-label="Responsable">
        <option value="">Sin responsable</option>
        {ctx.equipo.map((m) => <option key={m.usuarioId} value={m.usuarioId}>{m.nombre}</option>)}
      </select>
      <label className="flex items-center gap-2 text-xs text-atenuado sm:col-span-2">Peso
        <input type="number" min={1} max={10} value={peso} onChange={(e) => setPeso(e.target.value)} className="campo w-20" />
      </label>
      <label className="flex items-center gap-2 text-xs text-atenuado sm:col-span-2">Horas est.
        <input type="number" min={0} step={0.5} value={horas} onChange={(e) => setHoras(e.target.value)} className="campo" />
      </label>
      <label className="flex items-center gap-2 text-xs text-atenuado sm:col-span-2">Entrega
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="campo" />
      </label>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Boton type="button" variante="fantasma" tamano="sm" onClick={() => void alTerminar(false)}>Cancelar</Boton>
        <Boton type="submit" tamano="sm" disabled={guardando || titulo.trim().length < 3}>
          {guardando && <Loader2 className="size-4 animate-spin" />}Crear
        </Boton>
      </div>
      <p className="text-[11px] text-atenuado sm:col-span-6">El peso define cuánto aporta la tarea al avance general (1 = poco, 10 = mucho).</p>
    </form>
  );
}

// ---------------------------------------------------------------------
function Escala({ valor, onChange, etiqueta }: { valor: number | undefined; onChange: (v: number) => void; etiqueta: string }) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={valor === n} title={ETIQUETA_PUNTAJE[n]} onClick={() => onChange(n)}
          className={cn('size-8 rounded-md border text-sm tabular-nums transition',
            valor === n ? 'border-primario bg-primario text-slate-950 font-semibold' : valor !== undefined && n < valor ? 'border-primario/40 bg-primario/15' : 'border-borde hover:border-borde-fuerte')}>
          {n}
        </button>
      ))}
    </div>
  );
}

function FormularioEvaluacion({ ctx, fuente, alGuardar }: { ctx: ContextoEvaluacion; fuente: FuenteEvaluacion; alGuardar: () => Promise<void> }) {
  const actor = useActor();
  const permitidos = TIPOS_EVALUACION.filter((t) => ESTADOS_EVALUABLES[t].includes(ctx.solicitud.estado));
  const [tipo, setTipo] = useState<TipoEvaluacion>(permitidos.includes('CIERRE') && ctx.solicitud.estado === 'CERRADA' ? 'CIERRE' : 'AVANCE');
  const [puntajes, setPuntajes] = useState<Record<string, number>>({});
  const [individuales, setIndividuales] = useState<Record<string, number>>({});
  const [comentario, setComentario] = useState('');
  const [guardando, setGuardando] = useState(false);

  const completos = ctx.criterios.every((c) => puntajes[c.codigo] !== undefined);
  const nota = useMemo(
    () => (completos ? notaGlobal(ctx.criterios.map((c) => ({ peso: c.peso, puntaje: puntajes[c.codigo]! }))) : null),
    [completos, ctx.criterios, puntajes]);

  if (!permitidos.length) {
    return (
      <Tarjeta titulo="Calificación">
        <p className="text-sm text-atenuado">Se califica cuando la solicitud tiene equipo asignado (seguimiento) o está en validación o cerrada (cierre).</p>
      </Tarjeta>
    );
  }

  const registrar = async () => {
    setGuardando(true);
    try {
      const e = await fuente.evaluar(ctx.solicitud.id, {
        tipo, puntajes,
        individuales: Object.entries(individuales).map(([usuarioId, puntaje]) => ({ usuarioId, puntaje })),
        comentario: comentario.trim() || undefined,
      }, actor.nombre);
      toast.success(`Evaluación registrada: ${e.calificacionLetra} (${e.calificacionGlobal.toFixed(1)}/10)`);
      setPuntajes({}); setIndividuales({}); setComentario('');
      await alGuardar();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Tarjeta titulo="Calificación">
      <div className="space-y-5">
        <div className="flex rounded-lg border border-borde p-1">
          {TIPOS_EVALUACION.map((t) => (
            <button key={t} type="button" disabled={!permitidos.includes(t)} onClick={() => setTipo(t)}
              className={cn('flex-1 rounded-md px-2 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-40',
                tipo === t ? 'bg-primario/15 font-medium text-teal-200' : 'text-atenuado hover:text-texto')}>
              {ETIQUETA_TIPO_EVALUACION[t]}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-atenuado">Criterios (1–5)</p>
          {ctx.criterios.map((c) => (
            <div key={c.codigo}>
              <div className="mb-1.5 flex justify-between gap-2 text-sm">
                <span>{c.nombre}</span>
                <span className="shrink-0 text-xs tabular-nums text-atenuado">{Math.round(c.peso * 100)}%</span>
              </div>
              <Escala etiqueta={c.nombre} valor={puntajes[c.codigo]} onChange={(v) => setPuntajes((p) => ({ ...p, [c.codigo]: v }))} />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 rounded-lg bg-fondo/50 p-3">
          {nota != null ? (
            <>
              <InsigniaNota letra={letraCalificacion(nota)} grande />
              <div>
                <p className="text-xl font-semibold tabular-nums">{nota.toFixed(2)}<span className="text-sm text-atenuado">/10</span></p>
                <p className="text-xs text-atenuado">Nota global ponderada · avance actual {Math.round(ctx.solicitud.avancePct)}%</p>
              </div>
            </>
          ) : (
            <p className="text-xs text-atenuado">Califica los {ctx.criterios.length} criterios para ver la nota global.</p>
          )}
        </div>

        {ctx.equipo.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-atenuado">Calificación individual (opcional)</p>
            {ctx.equipo.map((m) => (
              <div key={m.usuarioId} className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm">
                  <Avatar nombre={m.nombre} className="size-7 text-[10px]" />
                  <span>{m.nombre}<span className="block text-[11px] text-atenuado">{ETIQUETA_ROL_SOLICITUD[m.rol]}</span></span>
                </span>
                <Escala etiqueta={`Calificación de ${m.nombre}`} valor={individuales[m.usuarioId]}
                  onChange={(v) => setIndividuales((p) => ({ ...p, [m.usuarioId]: v }))} />
              </div>
            ))}
          </div>
        )}

        <textarea rows={3} value={comentario} onChange={(e) => setComentario(e.target.value)} className="campo resize-y"
          placeholder="Comentario para el equipo (fortalezas, riesgos, próximos pasos)" maxLength={4000} />
        <Boton className="w-full" onClick={registrar} disabled={!completos || guardando}>
          {guardando && <Loader2 className="size-4 animate-spin" />}Registrar {tipo === 'CIERRE' ? 'evaluación de cierre' : 'seguimiento'}
        </Boton>
        <p className="text-[11px] text-atenuado">El equipo recibe la nota; el solicitante solo ve el avance.</p>
      </div>
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------
function Historial({ evaluaciones, ctx }: { evaluaciones: EvaluacionVista[]; ctx: ContextoEvaluacion }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const nombreCriterio = (codigo: string) => ctx.criterios.find((c) => c.codigo === codigo)?.nombre ?? codigo;
  return (
    <Tarjeta titulo="Historial de evaluaciones" cuerpoClassName="p-0">
      {evaluaciones.length === 0 ? (
        <p className="px-5 py-6 text-sm text-atenuado">Todavía no hay evaluaciones registradas.</p>
      ) : (
        <ul className="divide-y divide-borde/50">
          {evaluaciones.map((e) => (
            <li key={e.id}>
              <button onClick={() => setAbierta(abierta === e.id ? null : e.id)} aria-expanded={abierta === e.id}
                className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-panel-2/50">
                <InsigniaNota letra={e.calificacionLetra} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">{ETIQUETA_TIPO_EVALUACION[e.tipo]} · <span className="tabular-nums">{e.calificacionGlobal.toFixed(1)}/10</span></span>
                  <span className="block text-xs text-atenuado">
                    {e.evaluador} · {new Date(e.fecha).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })} · avance {Math.round(e.avanceReportado)}%
                  </span>
                </span>
                <ChevronDown className={cn('size-4 text-atenuado transition', abierta === e.id && 'rotate-180')} />
              </button>
              {abierta === e.id && (
                <div className="space-y-3 px-5 pb-4 text-xs">
                  {e.comentario && <p className="rounded-lg bg-fondo/50 p-2.5 text-sm">{e.comentario}</p>}
                  <table className="w-full">
                    <tbody>
                      {e.detalle.map((d) => (
                        <tr key={d.codigo}><td className="py-0.5 text-atenuado">{nombreCriterio(d.codigo)}</td><td className="text-right tabular-nums">{d.puntaje}/5</td></tr>
                      ))}
                      {e.calificacionTecnica != null && (
                        <tr className="border-t border-borde/50"><td className="pt-1 text-atenuado">Calificación técnica</td><td className="pt-1 text-right tabular-nums">{e.calificacionTecnica.toFixed(2)}/5</td></tr>
                      )}
                    </tbody>
                  </table>
                  {e.individuales.length > 0 && (
                    <div>
                      <p className="mb-1 text-atenuado">Individual</p>
                      {e.individuales.map((i) => (
                        <p key={i.usuarioId} className="flex justify-between"><span>{i.nombre}</span><span className="tabular-nums">{i.puntaje}/5</span></p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}
