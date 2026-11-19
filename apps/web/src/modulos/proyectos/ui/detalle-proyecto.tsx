'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ChevronLeft, Loader2, Pencil, Plus, Trash2, WifiOff, X } from 'lucide-react';
import {
  ESTADOS_PROYECTO, ETIQUETA_ESTADO, ETIQUETA_ESTADO_PROYECTO,
  type CatalogosProyecto, type DetalleProyecto, type EstadoProyecto,
} from '@sierraflow/contratos';
import { cn } from '@/lib/utils';
import { BarraProgreso, Boton, Tarjeta, Vacio } from '@/componentes/ui/primitivos';
import { useUsuario } from '@/componentes/layout/proveedores';
import { InsigniaEstado } from '@/modulos/solicitudes/ui/insignias';
import { fuenteApi, fuenteDemo, type FuenteProyectos } from '../infraestructura/fuente-proyectos';
import { dinero, fechaCorta, InsigniaEstadoProyecto, InsigniaSalud } from './comunes';
import { FormularioProyecto } from './formulario-proyecto';
import { Gantt } from './gantt';
import { PanelRiesgos } from './panel-riesgos';

const PESTANAS = [
  { clave: 'resumen', etiqueta: 'Resumen y finanzas' },
  { clave: 'cronograma', etiqueta: 'Cronograma' },
  { clave: 'riesgos', etiqueta: 'Riesgos' },
  { clave: 'deuda', etiqueta: 'Deuda técnica' },
  { clave: 'solicitudes', etiqueta: 'Solicitudes' },
] as const;
type Pestana = (typeof PESTANAS)[number]['clave'];

/** Detalle de un proyecto (PM Suite). Lee el id de la URL. */
export function DetalleProyectoPanel() {
  const id = usePathname().split('/').filter(Boolean).pop() ?? '';
  const router = useRouter();
  const { modoDemo } = useUsuario();
  const fuente = modoDemo ? fuenteDemo : fuenteApi;
  const [p, setP] = useState<DetalleProyecto | null>(null);
  const [catalogos, setCatalogos] = useState<CatalogosProyecto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pestana, setPestana] = useState<Pestana>('resumen');
  const [editando, setEditando] = useState(false);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);

  const recargar = useCallback(async () => {
    try {
      const [d, c] = await Promise.all([fuente.detalle(id), fuente.catalogos()]);
      setP(d); setCatalogos(c); setError(null);
    } catch (e) {
      setError(navigator.onLine ? (e as Error).message : 'sin-conexion');
    }
  }, [fuente, id]);
  useEffect(() => { void recargar(); }, [recargar]);

  if (error) {
    return <Vacio icono={<WifiOff className="size-8" />} titulo={error === 'sin-conexion' ? 'La PM Suite necesita conexión' : 'No se pudo cargar el proyecto'}
      texto={error === 'sin-conexion' ? 'Presupuesto, riesgos y cronograma se consultan en el servidor.' : error}
      accion={<Link href="/proyectos" className="text-sm text-primario hover:underline">Volver a proyectos</Link>} />;
  }
  if (!p) return <div className="h-96 animate-pulse rounded-xl bg-panel/60" />;

  const cambiarEstado = async (estado: EstadoProyecto) => {
    try {
      setP(await fuente.actualizar(p.id, { estado, version: p.version }));
      toast.success(`Proyecto ${ETIQUETA_ESTADO_PROYECTO[estado].toLowerCase()}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const eliminar = async () => {
    if (!confirmarEliminar) { setConfirmarEliminar(true); return; }
    try {
      await fuente.eliminar(p.id);
      toast.success('Proyecto eliminado');
      router.push('/proyectos');
    } catch (e) {
      toast.error((e as Error).message);
      setConfirmarEliminar(false);
    }
  };

  return (
    <div className="space-y-5">
      <Link href="/proyectos" className="inline-flex items-center gap-1 text-sm text-atenuado hover:text-texto"><ChevronLeft className="size-4" /> Proyectos</Link>

      <Tarjeta>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-xs text-atenuado">
              {p.departamentoColor && <span className="size-2 rounded-full" style={{ background: p.departamentoColor }} />}
              <span className="font-mono text-sky-300">{p.codigo}</span>
              {p.departamento && <>· {p.departamento}</>}{p.director && <>· Director: {p.director}</>}
            </p>
            <h2 className="mt-1 text-xl font-semibold">{p.nombre}</h2>
            {p.descripcion && <p className="mt-1 max-w-3xl text-sm text-atenuado">{p.descripcion}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <InsigniaEstadoProyecto estado={p.estado} />
              <InsigniaSalud salud={p.salud.salud} />
              <span className="text-xs text-atenuado">{fechaCorta(p.fechaInicio)} → {fechaCorta(p.fechaFinPlan)}
                {p.salud.diasRestantes != null && (p.salud.diasRestantes >= 0 ? ` · faltan ${p.salud.diasRestantes} días` : ` · vencido hace ${-p.salud.diasRestantes} días`)}</span>
            </div>
          </div>
          {p.permisos.editar && (
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="Estado del proyecto" className="campo h-9 w-auto py-0 text-sm" value={p.estado} onChange={(e) => void cambiarEstado(e.target.value as EstadoProyecto)}>
                {ESTADOS_PROYECTO.map((e) => <option key={e} value={e}>{ETIQUETA_ESTADO_PROYECTO[e]}</option>)}
              </select>
              <Boton tamano="sm" variante="secundario" onClick={() => setEditando(true)}><Pencil className="size-4" /> Editar</Boton>
              {p.solicitudes === 0 && (
                <Boton tamano="sm" variante={confirmarEliminar ? 'peligro' : 'fantasma'} onClick={eliminar} onBlur={() => setConfirmarEliminar(false)}>
                  <Trash2 className="size-4" />{confirmarEliminar ? '¿Eliminar?' : ''}
                </Boton>
              )}
            </div>
          )}
        </div>
      </Tarjeta>

      <div className="flex gap-1 overflow-x-auto border-b border-borde/70" role="tablist">
        {PESTANAS.map((t) => (
          <button key={t.clave} role="tab" aria-selected={pestana === t.clave} onClick={() => setPestana(t.clave)}
            className={cn('whitespace-nowrap border-b-2 px-4 py-2 text-sm transition', pestana === t.clave ? 'border-primario font-medium text-teal-200' : 'border-transparent text-atenuado hover:text-texto')}>
            {t.etiqueta}
            {t.clave === 'riesgos' && p.riesgosAltos > 0 && <span className="ml-1.5 rounded-full bg-orange-500/20 px-1.5 text-[10px] text-orange-200">{p.riesgosAltos}</span>}
            {t.clave === 'solicitudes' && <span className="ml-1.5 text-[11px] text-atenuado">{p.solicitudes}</span>}
          </button>
        ))}
      </div>

      {pestana === 'resumen' && <Resumen p={p} />}
      {pestana === 'cronograma' && (
        <Tarjeta cuerpoClassName="p-0"><Gantt solicitudes={p.solicitudesDetalle} inicioPlan={p.fechaInicio} finPlan={p.fechaFinPlan} /></Tarjeta>
      )}
      {pestana === 'riesgos' && <PanelRiesgos proyecto={p} responsables={catalogos?.responsables ?? []} fuente={fuente} alCambiar={recargar} />}
      {pestana === 'deuda' && <PanelDeuda p={p} fuente={fuente} alCambiar={recargar} />}
      {pestana === 'solicitudes' && <PanelSolicitudes p={p} catalogos={catalogos} fuente={fuente} alCambiar={recargar} />}

      {editando && (
        <FormularioProyecto inicial={p} catalogos={catalogos} alCerrar={() => setEditando(false)}
          alGuardar={async (datos) => {
            try {
              setP(await fuente.actualizar(p.id, { ...datos, version: p.version }));
              setEditando(false);
              toast.success('Proyecto actualizado');
            } catch (e) {
              toast.error((e as Error).message);
            }
          }} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
function Indicador({ titulo, valor, detalle, tono }: { titulo: string; valor: string; detalle?: React.ReactNode; tono?: 'bien' | 'alerta' | 'mal' }) {
  return (
    <div className="rounded-lg bg-fondo/40 p-3">
      <p className="text-xs text-atenuado">{titulo}</p>
      <p className={cn('mt-0.5 text-xl font-semibold tabular-nums', tono === 'mal' && 'text-red-300', tono === 'alerta' && 'text-amber-200', tono === 'bien' && 'text-emerald-300')}>{valor}</p>
      {detalle && <p className="mt-0.5 text-[11px] text-atenuado">{detalle}</p>}
    </div>
  );
}

function Resumen({ p }: { p: DetalleProyecto }) {
  const f = p.finanzas;
  const m = p.moneda;
  const tonoDesv = f.desviacionPct == null ? undefined : f.desviacionPct > 10 ? 'mal' : f.desviacionPct > 0 ? 'alerta' : 'bien';
  const tonoSpi = p.salud.spi == null ? undefined : p.salud.spi >= 0.9 ? 'bien' : p.salud.spi >= 0.7 ? 'alerta' : 'mal';
  const maxBarra = Math.max(p.presupuesto ?? 0, f.costoTotal, f.costoEstimadoTotal ?? 0, 1);

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Tarjeta titulo="Cronograma">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Indicador titulo="Avance real" valor={`${Math.round(p.avancePct)}%`} detalle="Promedio de sus solicitudes" />
          <Indicador titulo="Plazo transcurrido" valor={p.salud.tiempoPct != null ? `${Math.round(Math.min(p.salud.tiempoPct, 100))}%` : '—'} />
          <Indicador titulo="Índice de cronograma" valor={p.salud.spi != null ? p.salud.spi.toFixed(2) : '—'} tono={tonoSpi}
            detalle="Avance ÷ plazo (≥ 0,9 en tiempo)" />
          <Indicador titulo="Días restantes" valor={p.salud.diasRestantes != null ? String(p.salud.diasRestantes) : '—'}
            tono={p.salud.diasRestantes != null && p.salud.diasRestantes < 0 ? 'mal' : undefined} />
        </div>
        <div className="mt-4 space-y-2 text-xs">
          <div><div className="mb-1 flex justify-between text-atenuado"><span>Avance</span><span className="tabular-nums">{Math.round(p.avancePct)}%</span></div><BarraProgreso valor={p.avancePct} /></div>
          <div><div className="mb-1 flex justify-between text-atenuado"><span>Tiempo</span><span className="tabular-nums">{p.salud.tiempoPct != null ? `${Math.round(Math.min(p.salud.tiempoPct, 100))}%` : '—'}</span></div>
            <BarraProgreso valor={Math.min(p.salud.tiempoPct ?? 0, 100)} color="bg-slate-400" /></div>
        </div>
        <p className="mt-3 text-[11px] text-atenuado">Si la barra de avance queda por debajo de la de tiempo, el proyecto va más lento de lo planeado.</p>
      </Tarjeta>

      <Tarjeta titulo={`Presupuesto (${m})`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Indicador titulo="Presupuesto" valor={dinero(p.presupuesto, m)} />
          <Indicador titulo="Costo a la fecha" valor={dinero(f.costoTotal, m)}
            detalle={f.consumoPresupuestoPct != null ? `${Math.round(f.consumoPresupuestoPct)}% del presupuesto` : undefined}
            tono={f.consumoPresupuestoPct != null && f.consumoPresupuestoPct > 100 ? 'mal' : undefined} />
          <Indicador titulo="Proyección al cierre" valor={dinero(f.costoEstimadoTotal, m)} detalle="Horas estimadas × tarifa + otros" />
          <Indicador titulo="Desviación" valor={f.desviacionPct != null ? `${f.desviacionPct > 0 ? '+' : ''}${f.desviacionPct}%` : '—'} tono={tonoDesv}
            detalle={f.desviacionPct != null ? (f.desviacionPct > 0 ? 'Sobrecosto proyectado' : 'Dentro del presupuesto') : 'Define presupuesto y tarifa'} />
        </div>
        <div className="mt-4 space-y-2 text-xs" aria-label="Comparación de presupuesto, costo y proyección">
          {[
            { etiqueta: 'Presupuesto', valor: p.presupuesto ?? 0, clase: 'bg-slate-400' },
            { etiqueta: 'Costo a la fecha', valor: f.costoTotal, clase: f.consumoPresupuestoPct != null && f.consumoPresupuestoPct > 100 ? 'bg-red-500' : 'bg-primario' },
            { etiqueta: 'Proyección', valor: f.costoEstimadoTotal ?? 0, clase: tonoDesv === 'mal' ? 'bg-red-500/70' : tonoDesv === 'alerta' ? 'bg-amber-500/80' : 'bg-primario/50' },
          ].map((b) => (
            <div key={b.etiqueta}>
              <div className="mb-1 flex justify-between text-atenuado"><span>{b.etiqueta}</span><span className="tabular-nums">{dinero(b.valor, m)}</span></div>
              <div className="h-2 rounded bg-panel-2"><div className={cn('h-full rounded', b.clase)} style={{ width: `${(b.valor / maxBarra) * 100}%` }} /></div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-atenuado">
          Trabajo: {p.horasReales.toLocaleString('es-CO')} h reales de {p.horasEstimadas.toLocaleString('es-CO')} h estimadas × {dinero(p.tarifaHora, m)}/h = {dinero(f.costoTrabajo, m)}
          {' · '}Otros gastos: {dinero(p.costoOtros, m)}
        </p>
      </Tarjeta>

      <Tarjeta titulo="Retorno de la inversión">
        <div className="grid grid-cols-3 gap-3">
          <Indicador titulo="Beneficio esperado" valor={dinero(p.beneficioEsperado, m)} />
          <Indicador titulo="Beneficio neto" valor={dinero(f.beneficioNeto, m)} tono={f.beneficioNeto != null ? (f.beneficioNeto >= 0 ? 'bien' : 'mal') : undefined} />
          <Indicador titulo="ROI" valor={f.roiPct != null ? `${Math.round(f.roiPct)}%` : '—'} tono={f.roiPct != null ? (f.roiPct >= 0 ? 'bien' : 'mal') : undefined}
            detalle="(beneficio − costo) ÷ costo" />
        </div>
        {f.roiPct == null && <p className="mt-3 text-xs text-atenuado">Registra el beneficio esperado y la tarifa por hora (o los gastos) en “Editar” para calcular el ROI.</p>}
      </Tarjeta>

      <Tarjeta titulo="Alertas del proyecto">
        <ul className="space-y-2 text-sm">
          <li className="flex justify-between"><span className="text-atenuado">Riesgos altos o críticos abiertos</span><b className={cn('tabular-nums', p.riesgosAltos && 'text-orange-200')}>{p.riesgosAltos}</b></li>
          <li className="flex justify-between"><span className="text-atenuado">Deuda técnica pendiente</span><b className="tabular-nums">{p.deudaPendiente} SP</b></li>
          <li className="flex justify-between"><span className="text-atenuado">Solicitudes vencidas sin cerrar</span>
            <b className="tabular-nums">{p.solicitudesDetalle.filter((s) => !s.cerrada && s.fin && Date.parse(`${s.fin}T23:59:59`) < Date.now()).length}</b></li>
          <li className="flex justify-between"><span className="text-atenuado">Solicitudes cerradas</span>
            <b className="tabular-nums">{p.solicitudesDetalle.filter((s) => s.cerrada).length} / {p.solicitudes}</b></li>
        </ul>
      </Tarjeta>
    </div>
  );
}

// ---------------------------------------------------------------------
function PanelDeuda({ p, fuente, alCambiar }: { p: DetalleProyecto; fuente: FuenteProyectos; alCambiar: () => Promise<void> }) {
  const [descripcion, setDescripcion] = useState('');
  const [sp, setSp] = useState('3');
  const [solicitudId, setSolicitudId] = useState('');
  const [guardando, setGuardando] = useState(false);
  const pendientes = p.deuda.filter((d) => !d.resuelta);
  const resueltas = p.deuda.filter((d) => d.resuelta);
  const spTotal = p.deuda.reduce((a, d) => a + d.storyPoints, 0);
  const spResueltos = resueltas.reduce((a, d) => a + d.storyPoints, 0);

  const ejecutar = async (accion: () => Promise<unknown>) => {
    try {
      await accion();
      await alCambiar();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const agregar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    await ejecutar(() => fuente.crearDeuda(p.id, { descripcion: descripcion.trim(), storyPoints: Number(sp) || 1, solicitudId: solicitudId || null }));
    setDescripcion(''); setSp('3'); setSolicitudId(''); setGuardando(false);
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <Tarjeta titulo={`Deuda técnica pendiente (${pendientes.length})`} cuerpoClassName="p-0">
        <form onSubmit={agregar} className="flex flex-wrap gap-2 border-b border-borde/60 p-4">
          <input required minLength={3} maxLength={2000} value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Ej.: Falta cubrir con pruebas el webhook de pagos" className="campo min-w-60 flex-1" />
          <label className="flex items-center gap-1.5 text-xs text-atenuado">SP
            <input type="number" min={1} max={100} value={sp} onChange={(e) => setSp(e.target.value)} className="campo w-16" aria-label="Story points" /></label>
          <select value={solicitudId} onChange={(e) => setSolicitudId(e.target.value)} className="campo w-48" aria-label="Solicitud relacionada">
            <option value="">Todo el proyecto</option>
            {p.solicitudesDetalle.map((s) => <option key={s.id} value={s.id}>{s.codigo}</option>)}
          </select>
          <Boton type="submit" tamano="sm" disabled={guardando || descripcion.trim().length < 3}>{guardando ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}Agregar</Boton>
        </form>
        {p.deuda.length === 0 ? <p className="px-5 py-10 text-center text-sm text-atenuado">Sin deuda técnica registrada.</p> : (
          <ul className="divide-y divide-borde/50">
            {[...pendientes, ...resueltas].map((d) => (
              <li key={d.id} className={cn('flex items-center gap-3 px-5 py-3', d.resuelta && 'opacity-60')}>
                <input type="checkbox" className="size-4 accent-teal-500" checked={d.resuelta} aria-label={`Marcar como ${d.resuelta ? 'pendiente' : 'resuelta'}`}
                  onChange={(e) => void ejecutar(() => fuente.actualizarDeuda(d.id, { resuelta: e.target.checked }))} />
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm', d.resuelta && 'line-through')}>{d.descripcion}</p>
                  <p className="text-xs text-atenuado">{d.solicitudCodigo ?? 'Todo el proyecto'} · registrada {fechaCorta(d.creadoEn)}{d.resueltaEn && ` · resuelta ${fechaCorta(d.resueltaEn)}`}</p>
                </div>
                <span className="rounded-md bg-panel-2 px-2 py-0.5 text-xs tabular-nums">{d.storyPoints} SP</span>
                <button onClick={() => void ejecutar(() => fuente.eliminarDeuda(d.id))} aria-label="Eliminar"
                  className="rounded p-1.5 text-atenuado hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
      <Tarjeta titulo="Resumen">
        <p className="text-3xl font-semibold tabular-nums">{spTotal - spResueltos} <span className="text-sm font-normal text-atenuado">SP pendientes</span></p>
        <div className="mt-3"><div className="mb-1 flex justify-between text-xs text-atenuado"><span>Resuelta</span><span className="tabular-nums">{spResueltos} / {spTotal} SP</span></div>
          <BarraProgreso valor={spTotal ? (spResueltos / spTotal) * 100 : 0} color="bg-emerald-500" /></div>
        <p className="mt-4 text-xs text-atenuado">
          La deuda técnica son atajos que habrá que corregir después (pruebas faltantes, código duplicado, configuraciones quemadas).
          Los story points (SP) estiman el esfuerzo para saldarla. Reserva capacidad en cada iteración para reducirla.
        </p>
      </Tarjeta>
    </div>
  );
}

// ---------------------------------------------------------------------
function PanelSolicitudes({ p, catalogos, fuente, alCambiar }: { p: DetalleProyecto; catalogos: CatalogosProyecto | null; fuente: FuenteProyectos; alCambiar: () => Promise<void> }) {
  const [agregando, setAgregando] = useState(false);
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const disponibles = (catalogos?.solicitudesDisponibles ?? []).filter((s) => {
    const t = q.trim().toLowerCase();
    return !t || s.codigo.toLowerCase().includes(t) || s.titulo.toLowerCase().includes(t) || s.departamento.toLowerCase().includes(t);
  });
  const vincular = async (agregar: string[], quitar: string[]) => {
    try {
      await fuente.vincular(p.id, agregar, quitar);
      toast.success(agregar.length ? `${agregar.length} solicitud(es) agregada(s)` : 'Solicitud quitada del proyecto');
      setAgregando(false); setSeleccion([]);
      await alCambiar();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Tarjeta titulo={`Solicitudes del proyecto (${p.solicitudes})`} cuerpoClassName="p-0"
      acciones={p.permisos.editar && !agregando && <Boton tamano="sm" variante="secundario" onClick={() => setAgregando(true)}><Plus className="size-4" /> Agregar solicitudes</Boton>}>
      {agregando && (
        <div className="border-b border-borde/60 bg-fondo/30 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por código, título o departamento" className="campo max-w-sm" />
            <button onClick={() => { setAgregando(false); setSeleccion([]); }} aria-label="Cerrar"><X className="size-4 text-atenuado" /></button>
          </div>
          {disponibles.length === 0 ? <p className="text-sm text-atenuado">No hay solicitudes sin proyecto.</p> : (
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {disponibles.map((s) => (
                <li key={s.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-panel-2/60">
                    <input type="checkbox" className="size-4 accent-teal-500" checked={seleccion.includes(s.id)}
                      onChange={(e) => setSeleccion((x) => (e.target.checked ? [...x, s.id] : x.filter((y) => y !== s.id)))} />
                    <span className="font-mono text-xs text-sky-300">{s.codigo}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{s.titulo}</span>
                    <span className="text-xs text-atenuado">{s.departamento} · {ETIQUETA_ESTADO[s.estado]}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex justify-end">
            <Boton tamano="sm" disabled={!seleccion.length} onClick={() => vincular(seleccion, [])}>Agregar {seleccion.length || ''} al proyecto</Boton>
          </div>
        </div>
      )}
      {p.solicitudesDetalle.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-atenuado">El proyecto aún no tiene solicitudes. Agrégalas para medir su avance y ver el cronograma.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-atenuado">
              <tr className="border-b border-borde/60"><th className="px-5 py-2 font-normal">Solicitud</th><th className="px-3 py-2 font-normal">Estado</th>
                <th className="w-48 px-3 py-2 font-normal">Avance</th><th className="px-3 py-2 font-normal">Fechas</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody className="divide-y divide-borde/40">
              {p.solicitudesDetalle.map((s) => (
                <tr key={s.id}>
                  <td className="px-5 py-2.5"><Link href={`/solicitudes/${s.id}`} className="hover:text-teal-200">
                    <span className="font-mono text-xs text-sky-300">{s.codigo}</span><span className="block">{s.titulo}</span></Link></td>
                  <td className="px-3 py-2.5"><InsigniaEstado estado={s.estado} /></td>
                  <td className="px-3 py-2.5"><div className="flex items-center gap-2"><BarraProgreso valor={s.avancePct} className="flex-1" /><span className="w-9 text-right text-xs tabular-nums">{Math.round(s.avancePct)}%</span></div></td>
                  <td className="px-3 py-2.5 text-xs text-atenuado">{fechaCorta(s.inicio)} → {fechaCorta(s.fin)}</td>
                  <td className="px-3 py-2.5 text-right">
                    {p.permisos.editar && <button onClick={() => vincular([], [s.id])} className="text-xs text-atenuado hover:text-red-300">Quitar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  );
}
