'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { CloudUpload, Eye, Inbox, Loader2, Search } from 'lucide-react';
import {
  ETIQUETA_PRIORIDAD, ETIQUETA_TIPO, PRIORIDADES, TIPOS_SOLICITUD, transicionesDisponibles,
  type EstadoSolicitud, type Prioridad, type TipoSolicitud,
} from '@sierraflow/contratos';
import { dbLocal, type SolicitudLocal } from '@/lib/offline/db';
import { cn, fecha, haceTiempo } from '@/lib/utils';
import { Avatar, BarraProgreso, Vacio } from '@/componentes/ui/primitivos';
import { useActor } from '@/componentes/layout/proveedores';
import { cambiarEstado } from '../aplicacion/casos-uso';
import { InsigniaEstado, InsigniaPrioridad } from './insignias';

/** Grupos de la bandeja, en el orden del ciclo de vida. */
const GRUPOS = [
  { clave: 'ENVIADA', etiqueta: 'Nuevas', estados: ['ENVIADA'], tono: 'text-teal-200', borde: 'border-primario/60' },
  { clave: 'EN_REVISION', etiqueta: 'En revisión', estados: ['EN_REVISION'], tono: 'text-amber-200', borde: 'border-amber-400/50' },
  { clave: 'APROBADA', etiqueta: 'Aprobadas · por asignar', estados: ['APROBADA'], tono: 'text-sky-200', borde: 'border-sky-400/50' },
  { clave: 'EN_CURSO', etiqueta: 'En ejecución', estados: ['ASIGNADA', 'EN_DESARROLLO', 'EN_VALIDACION'], tono: 'text-violet-200', borde: 'border-violet-400/50' },
  { clave: 'CERRADA', etiqueta: 'Cerradas', estados: ['CERRADA'], tono: 'text-emerald-200', borde: 'border-emerald-400/50' },
  { clave: 'NO_APROBADAS', etiqueta: 'Rechazadas / canceladas', estados: ['RECHAZADA', 'CANCELADA'], tono: 'text-red-200', borde: 'border-red-400/50' },
] as const satisfies readonly { clave: string; etiqueta: string; estados: readonly EstadoSolicitud[]; tono: string; borde: string }[];
type ClaveGrupo = (typeof GRUPOS)[number]['clave'] | 'TODAS';

const PESO_PRIORIDAD: Record<Prioridad, number> = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAJA: 3 };
type Orden = 'recibida' | 'prioridad' | 'deseada';

/** Fecha en que la solicitud llegó a la bandeja (paso a ENVIADA). */
const recibidaEn = (s: SolicitudLocal) => s.historial.find((h) => h.estadoNuevo === 'ENVIADA')?.fecha ?? s.creadoEn;
const grupoDe = (estado: EstadoSolicitud) => GRUPOS.find((g) => (g.estados as readonly EstadoSolicitud[]).includes(estado))?.clave;
/** ?estado= acepta un grupo (EN_CURSO…) o un estado (ENVIADA, EN_DESARROLLO…). */
const grupoDesdeUrl = (v: string | null): ClaveGrupo =>
  !v ? 'TODAS' : GRUPOS.some((g) => g.clave === v) ? (v as ClaveGrupo) : grupoDe(v as EstadoSolicitud) ?? 'TODAS';

/**
 * Bandeja de solicitudes (gestión): las solicitudes **recibidas** de todos los departamentos con su
 * estado e información. Los borradores no aparecen: aún no se han enviado.
 */
export function BandejaSolicitudes() {
  const params = useSearchParams();
  const router = useRouter();
  const actor = useActor();
  const estadoUrl = params.get('estado');
  const [grupo, setGrupo] = useState<ClaveGrupo>(() => grupoDesdeUrl(estadoUrl));
  useEffect(() => { if (estadoUrl) setGrupo(grupoDesdeUrl(estadoUrl)); }, [estadoUrl]);
  const [texto, setTexto] = useState(params.get('q') ?? '');
  const [prioridad, setPrioridad] = useState<Prioridad | ''>('');
  const [tipo, setTipo] = useState<TipoSolicitud | ''>('');
  const [departamento, setDepartamento] = useState('');
  const [orden, setOrden] = useState<Orden>('recibida');
  const [tomando, setTomando] = useState<string | null>(null);

  const recibidas = useLiveQuery(
    () => dbLocal.solicitudes.where('estado').notEqual('BORRADOR').toArray(), []);

  const conteo = useMemo(() => {
    const c: Record<string, number> = { TODAS: recibidas?.length ?? 0 };
    for (const s of recibidas ?? []) { const g = grupoDe(s.estado); if (g) c[g] = (c[g] ?? 0) + 1; }
    return c;
  }, [recibidas]);
  const departamentos = useMemo(() => [...new Set((recibidas ?? []).map((s) => s.departamento))].sort(), [recibidas]);

  const visibles = useMemo(() => {
    const q = texto.trim().toLowerCase();
    const lista = (recibidas ?? []).filter((s) =>
      (grupo === 'TODAS' || grupoDe(s.estado) === grupo)
      && (!prioridad || s.prioridad === prioridad)
      && (!tipo || s.tipo === tipo)
      && (!departamento || s.departamento === departamento)
      && (!q || `${s.codigo} ${s.titulo} ${s.solicitanteNombre} ${s.proyectoNombre ?? ''} ${s.aplicacionNombre ?? ''}`.toLowerCase().includes(q)));
    return lista.sort((a, b) => {
      // Las nuevas siempre arriba cuando se ve todo
      if (grupo === 'TODAS' && (a.estado === 'ENVIADA') !== (b.estado === 'ENVIADA')) return a.estado === 'ENVIADA' ? -1 : 1;
      if (orden === 'prioridad') return PESO_PRIORIDAD[a.prioridad] - PESO_PRIORIDAD[b.prioridad] || recibidaEn(b).localeCompare(recibidaEn(a));
      if (orden === 'deseada') return (a.fechaDeseada ?? '9999').localeCompare(b.fechaDeseada ?? '9999');
      return recibidaEn(b).localeCompare(recibidaEn(a));
    });
  }, [recibidas, grupo, prioridad, tipo, departamento, texto, orden]);

  const puedeTomar = (s: SolicitudLocal) => transicionesDisponibles(s.estado, actor.roles).some((r) => r.hacia === 'EN_REVISION');
  const tomar = async (s: SolicitudLocal) => {
    setTomando(s.id);
    try {
      await cambiarEstado(s.id, 'EN_REVISION', actor);
      toast.success(`${s.codigo} quedó en revisión`);
      router.push(`/solicitudes/${s.id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setTomando(null);
    }
  };

  if (!recibidas) return <div className="h-64 animate-pulse rounded-xl bg-panel/50" />;

  return (
    <div className="space-y-4">
      {/* Resumen por estado (filtra al hacer clic) */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {[{ clave: 'TODAS' as const, etiqueta: 'Todas las recibidas', tono: 'text-texto', borde: 'border-primario/60' }, ...GRUPOS].map((g) => (
          <button key={g.clave} type="button" onClick={() => setGrupo(g.clave)} aria-pressed={grupo === g.clave}
            className={cn('rounded-xl border bg-panel/70 px-3 py-2.5 text-left transition hover:border-borde-fuerte',
              grupo === g.clave ? cn(g.borde, 'bg-panel') : 'border-borde')}>
            <span className="flex items-center gap-1.5 truncate text-[11px] text-atenuado">
              {g.clave === 'ENVIADA' && (conteo.ENVIADA ?? 0) > 0 && <span className="size-1.5 animate-pulse rounded-full bg-primario motion-reduce:animate-none" />}
              {g.etiqueta}
            </span>
            <span className={cn('mt-0.5 block text-2xl font-semibold tabular-nums', g.tono)}>{conteo[g.clave] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-atenuado" />
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por código, título, solicitante, aplicación o proyecto"
            className="campo h-9 pl-9 text-sm" aria-label="Buscar" />
        </div>
        <select className="campo h-9 w-auto text-sm" value={prioridad} onChange={(e) => setPrioridad(e.target.value as Prioridad | '')} aria-label="Prioridad">
          <option value="">Toda prioridad</option>
          {PRIORIDADES.map((p) => <option key={p} value={p}>{ETIQUETA_PRIORIDAD[p]}</option>)}
        </select>
        <select className="campo h-9 w-auto text-sm" value={tipo} onChange={(e) => setTipo(e.target.value as TipoSolicitud | '')} aria-label="Tipo">
          <option value="">Todo tipo</option>
          {TIPOS_SOLICITUD.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO[t]}</option>)}
        </select>
        <select className="campo h-9 w-auto max-w-52 text-sm" value={departamento} onChange={(e) => setDepartamento(e.target.value)} aria-label="Departamento">
          <option value="">Todo departamento</option>
          {departamentos.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="campo h-9 w-auto text-sm" value={orden} onChange={(e) => setOrden(e.target.value as Orden)} aria-label="Ordenar">
          <option value="recibida">Más recientes</option>
          <option value="prioridad">Por prioridad</option>
          <option value="deseada">Por fecha deseada</option>
        </select>
      </div>

      {visibles.length === 0 ? (
        <Vacio icono={<Inbox className="size-8" />}
          titulo={recibidas.length ? 'No hay solicitudes con este filtro' : 'Aún no has recibido solicitudes'}
          texto="Cuando un solicitante envíe una solicitud te llegará un aviso y aparecerá aquí como Nueva." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-borde bg-panel/70">
          <table className="w-full text-sm">
            <thead className="hidden border-b border-borde bg-panel-2/40 text-left text-[11px] uppercase tracking-wider text-atenuado lg:table-header-group">
              <tr>
                <th className="px-4 py-2.5 font-medium">Solicitud</th>
                <th className="px-3 py-2.5 font-medium">Solicitante</th>
                <th className="px-3 py-2.5 font-medium">Prioridad</th>
                <th className="px-3 py-2.5 font-medium">Estado</th>
                <th className="px-3 py-2.5 font-medium">Recibida</th>
                <th className="px-3 py-2.5 font-medium">Avance</th>
                <th className="hidden px-3 py-2.5 font-medium xl:table-cell">Equipo</th>
                <th className="w-px px-4 py-2.5"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde/50">
              {visibles.map((s) => {
                const nueva = s.estado === 'ENVIADA';
                return (
                  <tr key={s.id} onClick={() => router.push(`/solicitudes/${s.id}`)}
                    className={cn('grid cursor-pointer grid-cols-[1fr_auto] gap-x-3 gap-y-2 px-4 py-3 transition hover:bg-panel-2/50 lg:table-row lg:px-0 lg:py-0',
                      nueva && 'bg-primario/[0.05] shadow-[inset_3px_0_0_var(--color-primario)]')}>
                    <td className="col-span-2 min-w-0 lg:max-w-[340px] lg:px-4 lg:py-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Link href={`/solicitudes/${s.id}`} onClick={(e) => e.stopPropagation()} className="font-mono text-sky-300 hover:underline">{s.codigo}</Link>
                        {nueva && <span className="rounded-full bg-primario px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-slate-950">Nueva</span>}
                        <span className="text-atenuado">{ETIQUETA_TIPO[s.tipo]}</span>
                        {s.pendienteSync === 1 && <span className="inline-flex items-center gap-1 text-amber-300" title="Pendiente de sincronizar"><CloudUpload className="size-3.5" /></span>}
                      </div>
                      <p className={cn('mt-0.5 line-clamp-1 font-medium', nueva && 'text-teal-50')}>{s.titulo}</p>
                      <p className="truncate text-xs text-atenuado">
                        {s.departamento}{s.aplicacionNombre && <> · <span className="text-texto/80">{s.aplicacionNombre}</span></>}
                        {s.proyectoCodigo && <> · <span className="text-texto/80" title={s.proyectoNombre ?? ''}>{s.proyectoCodigo}</span></>}
                        {s.fechaDeseada && <> · deseada {fecha(s.fechaDeseada)}</>}
                      </p>
                    </td>
                    <td className="lg:px-3 lg:py-3">
                      <span className="flex items-center gap-2 whitespace-nowrap text-xs"><Avatar nombre={s.solicitanteNombre} className="size-6 text-[9px] ring-0" /><span className="truncate">{s.solicitanteNombre}</span></span>
                    </td>
                    <td className="lg:px-3 lg:py-3"><InsigniaPrioridad prioridad={s.prioridad} /></td>
                    <td className="lg:px-3 lg:py-3"><InsigniaEstado estado={s.estado} /></td>
                    <td className="whitespace-nowrap text-xs text-atenuado lg:px-3 lg:py-3" title={new Date(recibidaEn(s)).toLocaleString('es-CO')}>{haceTiempo(recibidaEn(s))}</td>
                    <td className="lg:px-3 lg:py-3">
                      <span className="flex items-center gap-2 text-xs tabular-nums text-atenuado"><BarraProgreso valor={s.avancePct} className="h-1.5 w-12" />{Math.round(s.avancePct)}%</span>
                    </td>
                    <td className="hidden lg:px-3 lg:py-3 xl:table-cell">
                      <div className="flex -space-x-2">
                        {s.asignados.slice(0, 3).map((a) => <Avatar key={a.nombre} nombre={a.nombre} className="size-6 text-[9px]" />)}
                        {s.asignados.length === 0 && <span className="whitespace-nowrap text-xs text-atenuado">Sin asignar</span>}
                      </div>
                    </td>
                    <td className="col-span-2 lg:px-4 lg:py-3 lg:text-right">
                      {nueva && puedeTomar(s) ? (
                        <button type="button" disabled={tomando === s.id} onClick={(e) => { e.stopPropagation(); void tomar(s); }}
                          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-primario px-2.5 py-1 text-xs font-medium text-slate-950 hover:bg-primario-hover disabled:opacity-60">
                          {tomando === s.id ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />}Tomar en revisión
                        </button>
                      ) : (
                        <span className="hidden whitespace-nowrap rounded-lg border border-borde px-2.5 py-1 text-xs text-atenuado lg:inline">Ver detalle</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-atenuado">{visibles.length} de {recibidas.length} solicitudes recibidas. Los borradores no aparecen hasta que el solicitante los envía.</p>
    </div>
  );
}
