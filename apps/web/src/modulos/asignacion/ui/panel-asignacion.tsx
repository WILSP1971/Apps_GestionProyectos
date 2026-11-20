'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { CheckCircle2, FolderKanban, Loader2, Search, Sparkles, UsersRound, WifiOff } from 'lucide-react';
import {
  ETIQUETA_ROL_SOLICITUD, requiereProyecto, ROLES_EN_SOLICITUD, type EstadoSolicitud, type GrupoTrabajo, type IngenieroCarga, type RolEnSolicitud,
} from '@sierraflow/contratos';
import { dbLocal, type SolicitudLocal } from '@/lib/offline/db';
import { cn } from '@/lib/utils';
import { Avatar, BarraProgreso, Boton, Tarjeta, Vacio } from '@/componentes/ui/primitivos';
import { useActor, useUsuario } from '@/componentes/layout/proveedores';
import { InsigniaEstado, InsigniaPrioridad } from '@/modulos/solicitudes/ui/insignias';
import { ordenarRecomendados, type NivelCarga } from '../dominio/recomendacion';
import { fuenteApi, fuenteDemo } from '../infraestructura/fuente-asignacion';

const POR_ASIGNAR: EstadoSolicitud[] = ['APROBADA'];
const EN_CURSO: EstadoSolicitud[] = ['ASIGNADA', 'EN_DESARROLLO', 'EN_VALIDACION'];

const COLOR_CARGA: Record<NivelCarga, string> = {
  baja: 'bg-emerald-500', media: 'bg-sky-500', alta: 'bg-amber-500', sobrecargado: 'bg-red-500',
};

interface Seleccion {
  rol: RolEnSolicitud;
  horas: string;
}

export function PanelAsignacion() {
  const { modoDemo } = useUsuario();
  const actor = useActor();
  const router = useRouter();
  const params = useSearchParams();
  const fuente = modoDemo ? fuenteDemo : fuenteApi;

  const [pestana, setPestana] = useState<'por-asignar' | 'en-curso'>('por-asignar');
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(params.get('solicitud'));
  const [ingenieros, setIngenieros] = useState<IngenieroCarga[] | null>(null);
  const [grupos, setGrupos] = useState<GrupoTrabajo[]>([]);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [gruposSel, setGruposSel] = useState<string[]>([]);
  const [ingSel, setIngSel] = useState<Record<string, Seleccion>>({});
  const [comentario, setComentario] = useState('');
  const [filtro, setFiltro] = useState('');
  const [guardando, setGuardando] = useState(false);

  const solicitudes = useLiveQuery(
    () => dbLocal.solicitudes.where('estado').anyOf([...POR_ASIGNAR, ...EN_CURSO]).toArray(),
    [],
  ) ?? [];
  const porAsignar = solicitudes.filter((s) => POR_ASIGNAR.includes(s.estado));
  const enCurso = solicitudes.filter((s) => EN_CURSO.includes(s.estado));
  const lista = (pestana === 'por-asignar' ? porAsignar : enCurso)
    .sort((a, b) => ({ CRITICA: 0, ALTA: 1, MEDIA: 2, BAJA: 3 }[a.prioridad] - { CRITICA: 0, ALTA: 1, MEDIA: 2, BAJA: 3 }[b.prioridad]));
  const seleccionada: SolicitudLocal | undefined = solicitudes.find((s) => s.id === seleccionadaId);

  // Si llega por ?solicitud=, abrir la pestaña que le corresponde
  useEffect(() => {
    if (seleccionada && EN_CURSO.includes(seleccionada.estado)) setPestana('en-curso');
  }, [seleccionada?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Carga de ingenieros y grupos
  useEffect(() => {
    setErrorCarga(null);
    Promise.all([fuente.ingenieros(), fuente.grupos()])
      .then(([i, g]) => { setIngenieros(i); setGrupos(g); })
      .catch((e: Error) => setErrorCarga(navigator.onLine ? e.message : 'sin-conexion'));
  }, [fuente]);

  // Al elegir una solicitud: precargar su equipo actual
  useEffect(() => {
    setGruposSel([]); setIngSel({}); setComentario('');
    if (!seleccionadaId) return;
    fuente.equipo(seleccionadaId).then((equipo) => {
      setGruposSel(equipo.filter((m) => m.grupoId && !m.usuarioId).map((m) => m.grupoId!));
      setIngSel(Object.fromEntries(equipo.filter((m) => m.usuarioId).map((m) => [m.usuarioId!, { rol: m.rol, horas: m.horasEstimadas?.toString() ?? '' }])));
    }).catch(() => undefined);
  }, [seleccionadaId, fuente]);

  const recomendados = useMemo(() => {
    if (!ingenieros) return [];
    const nombresGrupos = grupos.filter((g) => gruposSel.includes(g.id)).map((g) => g.nombre);
    const q = filtro.trim().toLowerCase();
    return ordenarRecomendados(ingenieros, { tecnologias: seleccionada?.tecnologias ?? [], grupos: nombresGrupos })
      .filter((i) => !q || i.nombre.toLowerCase().includes(q) || i.tecnologias.some((t) => t.toLowerCase().includes(q)));
  }, [ingenieros, grupos, gruposSel, seleccionada?.tecnologias, filtro]);

  const alternarIngeniero = (id: string) =>
    setIngSel((s) => {
      const copia = { ...s };
      if (copia[id]) delete copia[id];
      else copia[id] = { rol: ingenieros?.find((i) => i.usuarioId === id)?.grupos.includes('QA') ? 'QA' : 'DESARROLLADOR', horas: '' };
      return copia;
    });

  const confirmar = async () => {
    if (!seleccionada) return;
    setGuardando(true);
    try {
      await fuente.asignar(seleccionada.id, {
        version: Math.max(seleccionada.version, 1),
        grupos: gruposSel,
        ingenieros: Object.entries(ingSel).map(([usuarioId, v]) => ({
          usuarioId, rol: v.rol, horasEstimadas: v.horas ? Number(v.horas) : null,
        })),
        comentario: comentario.trim() || undefined,
      }, actor.nombre);
      toast.success(seleccionada.estado === 'APROBADA' ? 'Equipo asignado: la solicitud pasó a "Asignada"' : 'Equipo actualizado');
      router.push(`/solicitudes/${seleccionada.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  const totalSel = gruposSel.length + Object.keys(ingSel).length;
  // Regla 1: un requerimiento funcional aprobado no se asigna si no está en un proyecto
  const faltaProyecto = !!seleccionada && seleccionada.estado === 'APROBADA' && requiereProyecto(seleccionada.tipo) && !seleccionada.proyectoId;

  return (
    <div className="grid gap-5 xl:grid-cols-[340px_1fr]">
      {/* Lista de solicitudes */}
      <Tarjeta cuerpoClassName="p-0">
        <div className="flex border-b border-borde/70 p-1.5">
          {([['por-asignar', `Por asignar (${porAsignar.length})`], ['en-curso', `En curso (${enCurso.length})`]] as const).map(([k, t]) => (
            <button key={k} onClick={() => setPestana(k)}
              className={cn('flex-1 rounded-lg px-3 py-2 text-sm transition', pestana === k ? 'bg-primario/15 font-medium text-teal-200' : 'text-atenuado hover:text-texto')}>
              {t}
            </button>
          ))}
        </div>
        <ul className="max-h-[70vh] overflow-y-auto p-2">
          {lista.length === 0 && (
            <li className="px-3 py-10 text-center text-sm text-atenuado">
              {pestana === 'por-asignar' ? 'No hay solicitudes aprobadas esperando equipo.' : 'No hay solicitudes en curso.'}
            </li>
          )}
          {lista.map((s) => (
            <li key={s.id}>
              <button onClick={() => setSeleccionadaId(s.id)}
                className={cn('mb-1 w-full rounded-lg border px-3 py-2.5 text-left transition',
                  s.id === seleccionadaId ? 'border-primario/60 bg-primario/10' : 'border-transparent hover:bg-panel-2')}>
                <div className="flex items-center gap-2 text-xs">
                  <span className="size-2 rounded-full" style={{ background: s.departamentoColor ?? '#64748b' }} />
                  <span className="font-mono text-sky-300">{s.codigo}</span>
                  <InsigniaPrioridad prioridad={s.prioridad} />
                </div>
                <p className="mt-1 line-clamp-2 text-sm">{s.titulo}</p>
                <p className="mt-0.5 truncate text-[11px] text-atenuado">
                  {s.proyectoCodigo ? `${s.proyectoCodigo} · ` : ''}{s.departamento}{s.asignados.length ? ` · ${s.asignados.map((a) => a.nombre).join(', ')}` : ''}
                </p>
                {s.estado === 'APROBADA' && requiereProyecto(s.tipo) && !s.proyectoId && (
                  <p className="mt-1 text-[11px] text-amber-200">Requiere proyecto antes de asignar</p>
                )}
              </button>
            </li>
          ))}
        </ul>
      </Tarjeta>

      {/* Detalle de asignación */}
      {!seleccionada ? (
        <Vacio icono={<UsersRound className="size-8" />} titulo="Elige una solicitud" texto="Selecciona una solicitud de la lista para asignar su grupo de trabajo e ingenieros." />
      ) : errorCarga ? (
        <Vacio icono={<WifiOff className="size-8" />} titulo={errorCarga === 'sin-conexion' ? 'La asignación necesita conexión' : 'No se pudo cargar el equipo'}
          texto={errorCarga === 'sin-conexion' ? 'Para asignar se consulta la carga de trabajo actual de todos los ingenieros.' : errorCarga} />
      ) : (
        <div className="grid gap-5 2xl:grid-cols-[1fr_340px]">
          <div className="space-y-5">
            <Tarjeta>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-atenuado"><span className="font-mono text-sky-300">{seleccionada.codigo}</span> · {seleccionada.departamento} · {seleccionada.solicitanteNombre}</p>
                  <h2 className="mt-1 text-lg font-semibold">{seleccionada.titulo}</h2>
                  <p className="mt-1 line-clamp-2 text-sm text-atenuado">{seleccionada.descripcion}</p>
                </div>
                <InsigniaEstado estado={seleccionada.estado} />
              </div>
              {seleccionada.tecnologias.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {seleccionada.tecnologias.map((t) => <span key={t} className="rounded-md bg-panel-2 px-2 py-0.5 text-xs">{t}</span>)}
                </div>
              )}
            </Tarjeta>

            <Tarjeta titulo="1. Grupo de trabajo">
              <div className="flex flex-wrap gap-2">
                {grupos.map((g) => {
                  const activo = gruposSel.includes(g.id);
                  return (
                    <button key={g.id} type="button" aria-pressed={activo}
                      onClick={() => setGruposSel((s) => (activo ? s.filter((x) => x !== g.id) : [...s, g.id]))}
                      className={cn('rounded-lg border px-3 py-2 text-left text-sm transition',
                        activo ? 'border-primario bg-primario/15 text-teal-100' : 'border-borde hover:border-borde-fuerte')}>
                      <span className="flex items-center gap-1.5 font-medium">{activo && <CheckCircle2 className="size-4 text-primario" />}{g.nombre}</span>
                      <span className="text-[11px] text-atenuado">{g.miembros} integrante(s)</span>
                    </button>
                  );
                })}
              </div>
            </Tarjeta>

            <Tarjeta titulo="2. Ingenieros de desarrollo" cuerpoClassName="p-0"
              acciones={
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-atenuado" />
                  <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Nombre o tecnología" className="campo h-8 w-52 py-0 pl-8 text-xs" />
                </div>
              }>
              {!ingenieros ? (
                <div className="h-48 animate-pulse" />
              ) : recomendados.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-atenuado">
                  No hay ingenieros registrados. Un administrador puede asignar el rol en <Link href="/administracion/usuarios" className="text-primario hover:underline">Usuarios y equipos</Link>.
                </p>
              ) : (
                <ul className="divide-y divide-borde/50">
                  {recomendados.map((i, idx) => {
                    const sel = ingSel[i.usuarioId];
                    const recomendado = idx < 3 && i.puntuacion.puntaje >= 50 && i.puntuacion.nivel !== 'sobrecargado';
                    return (
                      <li key={i.usuarioId} className={cn('px-5 py-3 transition', sel && 'bg-primario/5')}>
                        <div className="flex items-center gap-3">
                          <input type="checkbox" className="size-4 accent-teal-500" checked={!!sel} onChange={() => alternarIngeniero(i.usuarioId)} aria-label={`Asignar a ${i.nombre}`} />
                          <Avatar nombre={i.nombre} />
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                              {i.nombre}
                              {recomendado && <span className="inline-flex items-center gap-1 rounded-full bg-primario/15 px-2 py-0.5 text-[10px] font-medium text-teal-200"><Sparkles className="size-3" />Recomendado</span>}
                            </p>
                            <p className="truncate text-xs text-atenuado">
                              {i.grupos.join(', ') || 'Sin grupo'} · {i.tecnologias.map((t) => (
                                <span key={t} className={cn(i.puntuacion.coincidencias.includes(t) && 'font-medium text-teal-300')}>{t}{' '}</span>
                              ))}
                            </p>
                          </div>
                          <div className="hidden w-40 sm:block" title={`${i.horasPendientes} h pendientes de ${i.capacidadSemana} h/semana`}>
                            <div className="mb-1 flex justify-between text-[11px] text-atenuado"><span>Carga</span><span className="tabular-nums">{i.cargaPct}%</span></div>
                            <BarraProgreso valor={i.cargaPct} color={COLOR_CARGA[i.puntuacion.nivel]} />
                          </div>
                          <span className="hidden w-16 text-right text-xs text-atenuado md:block">{i.solicitudesActivas} activas</span>
                        </div>
                        {sel && (
                          <div className="mt-2 flex flex-wrap items-center gap-2 pl-[4.25rem]">
                            <select className="campo h-8 w-auto py-0 text-xs" value={sel.rol}
                              onChange={(e) => setIngSel((s) => ({ ...s, [i.usuarioId]: { ...sel, rol: e.target.value as RolEnSolicitud } }))}>
                              {ROLES_EN_SOLICITUD.map((r) => <option key={r} value={r}>{ETIQUETA_ROL_SOLICITUD[r]}</option>)}
                            </select>
                            <input type="number" min={0} max={2000} placeholder="Horas estimadas" className="campo h-8 w-36 py-0 text-xs" value={sel.horas}
                              onChange={(e) => setIngSel((s) => ({ ...s, [i.usuarioId]: { ...sel, horas: e.target.value } }))} />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Tarjeta>
          </div>

          <div className="space-y-5">
            <Tarjeta titulo="Comentarios de asignación">
              <textarea rows={5} className="campo resize-y" value={comentario} onChange={(e) => setComentario(e.target.value)}
                placeholder="Ej.: Luis integra la API y María el flujo de pago en frontend." />
              <div className="mt-4 rounded-lg bg-fondo/50 p-3 text-xs text-atenuado">
                <p className="mb-1 font-medium text-texto">Resumen</p>
                <p>{gruposSel.length} grupo(s) · {Object.keys(ingSel).length} ingeniero(s)</p>
                {seleccionada.estado === 'APROBADA' && <p className="mt-1">La solicitud pasará a <span className="text-teal-300">Asignada</span> y el equipo recibirá un aviso.</p>}
              </div>
              {faltaProyecto && (
                <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100">
                  <p className="flex items-center gap-1.5 font-medium"><FolderKanban className="size-4" /> Falta el proyecto</p>
                  <p className="mt-1">Es un requerimiento <b>funcional</b>: agrégalo a un proyecto antes de asignar el equipo
                    (Proyectos → el proyecto → Solicitudes → Agregar existentes).</p>
                  <Link href="/proyectos" className="mt-2 inline-block font-medium text-primario hover:underline">Ir a Proyectos →</Link>
                </div>
              )}
              <Boton className="mt-4 w-full" onClick={confirmar} disabled={guardando || totalSel === 0 || faltaProyecto}>
                {guardando && <Loader2 className="size-4 animate-spin" />}
                {seleccionada.estado === 'APROBADA' ? 'Confirmar asignación y actualizar estado' : 'Actualizar equipo'}
              </Boton>
            </Tarjeta>
          </div>
        </div>
      )}
    </div>
  );
}
