'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowLeft, CalendarDays, Check, CheckCircle2, CloudUpload, FileQuestion, MessageSquare, RotateCcw, Send, UsersRound, X,
} from 'lucide-react';
import { ETIQUETA_ESTADO, ETIQUETA_TIPO, transicionesDisponibles, type EstadoSolicitud, type ReglaTransicion } from '@sierraflow/contratos';
import { dbLocal, type ConflictoLocal } from '@/lib/offline/db';
import { cn, fecha, fechaHora, haceTiempo } from '@/lib/utils';
import { Avatar, BarraProgreso, Boton, Tarjeta, Vacio } from '@/componentes/ui/primitivos';
import { useActor } from '@/componentes/layout/proveedores';
import { cambiarEstado, comentar, marcarCriterio } from '../aplicacion/casos-uso';
import { InsigniaEstado, InsigniaPrioridad } from './insignias';
import { LineaDeVida } from './linea-de-vida';

function varianteAccion(r: ReglaTransicion) {
  if (['RECHAZADA', 'CANCELADA'].includes(r.hacia)) return 'peligro' as const;
  if (r.hacia === 'BORRADOR' || (r.hacia === 'EN_DESARROLLO' && r.requiereComentario)) return 'secundario' as const;
  if (r.hacia === 'APROBADA' || r.hacia === 'CERRADA') return 'exito' as const;
  return 'primario' as const;
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="etiqueta">{etiqueta}</p>
      <div className="rounded-lg border border-borde/70 bg-fondo/40 px-3 py-2 text-sm">{children || <span className="text-atenuado">—</span>}</div>
    </div>
  );
}

const DESCRIPCION_OPERACION: Record<ConflictoLocal['tipo'], (p: Record<string, unknown>) => string> = {
  crear: () => 'Crear la solicitud',
  cambiar_estado: (p) => `Cambiar el estado a "${ETIQUETA_ESTADO[p.hacia as EstadoSolicitud] ?? p.hacia}"`,
  marcar_criterio: (p) => (p.cumplido ? 'Marcar un criterio como cumplido' : 'Desmarcar un criterio'),
  comentar: (p) => `Comentario: "${String(p.contenido ?? '').slice(0, 60)}"`,
  leer_notificacion: () => 'Marcar una notificación como leída',
};

/** Cambios locales que el servidor no aplicó (conflicto de versión o regla de negocio). */
function AvisosSincronizacion({ id, errorSync }: { id: string; errorSync?: string }) {
  const actor = useActor();
  const router = useRouter();
  const conflictos = useLiveQuery(() => dbLocal.conflictos.where('entidadId').equals(id).toArray(), [id]) ?? [];
  if (!conflictos.length && !errorSync) return null;

  const reintentar = async (c: ConflictoLocal) => {
    const p = c.payload as { hacia: EstadoSolicitud; comentario?: string };
    try {
      await cambiarEstado(id, p.hacia, actor, p.comentario);
      await dbLocal.conflictos.delete(c.idOperacion);
      toast.success('Cambio reenviado');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const descartarSolicitudLocal = async () => {
    await dbLocal.transaction('rw', dbLocal.solicitudes, dbLocal.comentarios, dbLocal.conflictos, async () => {
      await dbLocal.solicitudes.delete(id);
      await dbLocal.comentarios.where('solicitudId').equals(id).delete();
      await dbLocal.conflictos.where('entidadId').equals(id).delete();
    });
    router.push('/mis-solicitudes');
  };

  return (
    <section className="space-y-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4" aria-live="polite">
      <p className="flex items-center gap-2 text-sm font-medium text-red-200"><AlertTriangle className="size-4" /> Cambios que no se pudieron sincronizar</p>
      {errorSync && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-fondo/50 px-3 py-2 text-sm">
          <span>El servidor rechazó esta solicitud: <span className="text-red-200">{errorSync}</span></span>
          <Boton tamano="sm" variante="peligro" onClick={descartarSolicitudLocal}>Eliminar copia local</Boton>
        </div>
      )}
      {conflictos.map((c) => (
        <div key={c.idOperacion} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-fondo/50 px-3 py-2 text-sm">
          <span>
            {DESCRIPCION_OPERACION[c.tipo]((c.payload ?? {}) as Record<string, unknown>)}
            {' — '}
            <span className="text-red-200">{c.motivo === 'conflicto' ? 'otra persona modificó la solicitud antes' : c.mensaje}</span>
          </span>
          <span className="flex gap-2">
            {c.motivo === 'conflicto' && c.tipo === 'cambiar_estado' && (
              <Boton tamano="sm" variante="secundario" onClick={() => reintentar(c)}><RotateCcw className="size-3.5" /> Reintentar</Boton>
            )}
            <Boton tamano="sm" variante="fantasma" onClick={() => dbLocal.conflictos.delete(c.idOperacion)}>Descartar</Boton>
          </span>
        </div>
      ))}
    </section>
  );
}

export function DetalleSolicitud() {
  // El id se toma de la URL real (no de los parámetros del servidor): así la misma página en caché
  // del Service Worker sirve para abrir cualquier solicitud sin conexión.
  const ruta = usePathname();
  const router = useRouter();
  const id = decodeURIComponent(ruta.split('/').filter(Boolean).pop() ?? '');
  const actor = useActor();
  // undefined = cargando · null = no existe en este equipo
  const solicitud = useLiveQuery(() => dbLocal.solicitudes.get(id).then((x) => x ?? null), [id]);
  const comentarios = useLiveQuery(() => dbLocal.comentarios.where('solicitudId').equals(id).sortBy('creadoEn'), [id]) ?? [];
  const [accion, setAccion] = useState<ReglaTransicion | null>(null);
  const [comentarioAccion, setComentarioAccion] = useState('');
  const [nuevoComentario, setNuevoComentario] = useState('');

  if (solicitud === undefined) return <div className="h-96 animate-pulse rounded-xl bg-panel/50" />;
  if (solicitud === null) {
    return <Vacio icono={<FileQuestion className="size-8" />} titulo="Solicitud no encontrada" texto="Puede que aún no se haya sincronizado en este equipo."
      accion={<Link href="/mis-solicitudes"><Boton tamano="sm" variante="secundario">Volver</Boton></Link>} />;
  }

  const s = solicitud;
  const acciones = transicionesDisponibles(s.estado, actor.roles);
  const criteriosEditables = ['EN_DESARROLLO', 'EN_VALIDACION'].includes(s.estado);
  // Avance por tareas y calificación: líderes/directores y el propio equipo asignado
  const veAvance = ['ASIGNADA', 'EN_DESARROLLO', 'EN_VALIDACION', 'CERRADA'].includes(s.estado)
    && (actor.roles.some((r) => r === 'LIDER' || r === 'DIRECTOR' || r === 'ADMIN') || s.asignados.some((a) => a.usuarioId === actor.id));

  const ejecutar = async (regla: ReglaTransicion, comentario?: string) => {
    try {
      await cambiarEstado(s.id, regla.hacia, actor, comentario);
      toast.success(`Solicitud: ${ETIQUETA_ESTADO[regla.hacia]}`);
      setAccion(null);
      setComentarioAccion('');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const alPulsar = (regla: ReglaTransicion) => {
    if (regla.hacia === 'ASIGNADA') return router.push(`/gestion/asignacion?solicitud=${s.id}`);
    return regla.requiereComentario ? setAccion(regla) : ejecutar(regla);
  };

  return (
    <div className="space-y-5">
      <Link href="/mis-solicitudes" className="inline-flex items-center gap-1 text-sm text-atenuado hover:text-texto"><ArrowLeft className="size-4" /> Volver</Link>

      {/* 1 · Cabecera: estado, prioridad, tipo y acciones */}
      <section className="rounded-xl border border-borde bg-panel/80 p-5">
        <p className="text-xs text-atenuado">Requerimiento ID: <span className="font-mono text-sky-300">{s.codigo}</span>
          {s.pendienteSync === 1 && <span className="ml-2 inline-flex items-center gap-1 text-amber-300"><CloudUpload className="size-3.5" />pendiente de sincronizar</span>}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{s.titulo}</h1>
        <div className="mt-4 grid gap-4 border-t border-borde/70 pt-4 sm:grid-cols-2 lg:grid-cols-[repeat(4,auto)_1fr] lg:items-center lg:gap-8">
          <div><p className="etiqueta">Estado</p><InsigniaEstado estado={s.estado} /></div>
          <div><p className="etiqueta">Prioridad</p><InsigniaPrioridad prioridad={s.prioridad} /></div>
          <div><p className="etiqueta">Tipo</p><p className="text-sm">{ETIQUETA_TIPO[s.tipo]}</p></div>
          <div><p className="etiqueta">Solicitante</p><p className="text-sm">{s.solicitanteNombre} · <span className="text-atenuado">{s.departamento}</span></p></div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {acciones.map((r) => (
              <Boton key={r.hacia} tamano="sm" variante={varianteAccion(r)} onClick={() => alPulsar(r)}>
                {r.hacia === 'RECHAZADA' ? <X className="size-4" /> : r.hacia === 'APROBADA' || r.hacia === 'CERRADA' ? <Check className="size-4" /> : null}
                {r.accion}
              </Boton>
            ))}
          </div>
        </div>

        {accion && (
          <div className="mt-4 rounded-lg border border-borde-fuerte bg-fondo/60 p-4">
            <label className="etiqueta" htmlFor="comentario-accion">Comentario para “{accion.accion}” (obligatorio)</label>
            <textarea id="comentario-accion" autoFocus rows={3} className="campo" value={comentarioAccion} onChange={(e) => setComentarioAccion(e.target.value)}
              placeholder="Explica el motivo para que el equipo lo tenga claro." />
            <div className="mt-3 flex justify-end gap-2">
              <Boton tamano="sm" variante="fantasma" onClick={() => setAccion(null)}>Cancelar</Boton>
              <Boton tamano="sm" variante={varianteAccion(accion)} disabled={!comentarioAccion.trim()} onClick={() => ejecutar(accion, comentarioAccion)}>Confirmar</Boton>
            </div>
          </div>
        )}
      </section>

      <AvisosSincronizacion id={s.id} errorSync={s.errorSync} />

      {/* 2 · Línea de vida */}
      <LineaDeVida estado={s.estado} />

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        {/* 3 · Detalles */}
        <Tarjeta titulo="Detalles de la solicitud">
          <div className="space-y-4">
            <Dato etiqueta="Descripción"><p className="whitespace-pre-line">{s.descripcion}</p></Dato>
            <div className="grid gap-4 md:grid-cols-2">
              <Dato etiqueta="Objetivos">{s.objetivos}</Dato>
              <Dato etiqueta="Justificación">{s.justificacion}</Dato>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Dato etiqueta="Stack tecnológico">
                {s.tecnologias.length ? (
                  <div className="flex flex-wrap gap-1.5">{s.tecnologias.map((t) => <span key={t} className="rounded-md bg-panel-2 px-2 py-0.5 text-xs">{t}</span>)}</div>
                ) : null}
              </Dato>
              <Dato etiqueta="Fecha deseada">
                {s.fechaDeseada ? <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-4 text-atenuado" />{fecha(s.fechaDeseada)}</span> : null}
              </Dato>
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="etiqueta mb-0">Criterios de aceptación</p>
                <span className="text-xs text-atenuado">{s.criterios.filter((c) => c.cumplido).length}/{s.criterios.length} cumplidos</span>
              </div>
              <ul className="space-y-1.5 rounded-lg border border-borde/70 bg-fondo/40 p-3">
                {s.criterios.map((c) => (
                  <li key={c.id}>
                    <label className={cn('flex items-start gap-2.5 text-sm', criteriosEditables ? 'cursor-pointer' : 'cursor-default')}>
                      <input type="checkbox" className="mt-0.5 size-4 accent-teal-500" checked={c.cumplido} disabled={!criteriosEditables}
                        onChange={(e) => marcarCriterio(s.id, c.id, e.target.checked).catch((err) => toast.error(err.message))} />
                      <span className={cn(c.cumplido && 'text-atenuado line-through')}>{c.orden}. {c.descripcion}</span>
                    </label>
                  </li>
                ))}
              </ul>
              {!criteriosEditables && <p className="mt-1 text-[11px] text-atenuado">Los criterios se marcan durante el desarrollo y la validación.</p>}
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs text-atenuado"><span>Avance general</span><span className="tabular-nums">{s.avancePct}%</span></div>
              <BarraProgreso valor={s.avancePct} className="h-2.5" />
            </div>
          </div>
        </Tarjeta>

        {/* 4 · Gestión y seguimiento */}
        <div className="space-y-5">
          <Tarjeta titulo={<span className="inline-flex items-center gap-2"><UsersRound className="size-4 text-primario" />Equipo asignado</span>}
            acciones={veAvance && (
              <Link href={`/gestion/evaluacion/${s.id}`} className="text-xs font-medium text-primario hover:underline">Avance y tareas →</Link>
            )}>
            {s.asignados.length === 0 ? (
              <p className="text-sm text-atenuado">Aún no hay ingenieros asignados.</p>
            ) : (
              <ul className="space-y-3">
                {s.asignados.map((a) => (
                  <li key={a.nombre} className="flex items-center gap-3 text-sm"><Avatar nombre={a.nombre} /><span>{a.nombre}</span><span className="ml-auto text-xs text-atenuado">{a.grupo}</span></li>
                ))}
              </ul>
            )}
          </Tarjeta>

          <Tarjeta titulo="Actividad reciente">
            <ol className="relative space-y-4 before:absolute before:bottom-1 before:left-[7px] before:top-1 before:w-px before:bg-borde">
              {[...s.historial].reverse().map((h, i) => (
                <li key={i} className="relative pl-6 text-sm">
                  <span className={cn('absolute left-0 top-1 size-[15px] rounded-full border-2 border-fondo', i === 0 ? 'bg-primario' : 'bg-borde-fuerte')} />
                  <p>
                    <span className="font-medium">{h.usuario}</span>{' '}
                    <span className="text-atenuado">{h.estadoAnterior ? `cambió a ${ETIQUETA_ESTADO[h.estadoNuevo]}` : 'creó la solicitud'}</span>
                  </p>
                  {h.comentario && <p className="mt-1 rounded-md bg-fondo/60 px-2 py-1 text-xs text-atenuado">“{h.comentario}”</p>}
                  <p className="text-[11px] text-atenuado/80" title={fechaHora(h.fecha)}>{haceTiempo(h.fecha)}</p>
                </li>
              ))}
            </ol>
          </Tarjeta>

          <Tarjeta titulo={<span className="inline-flex items-center gap-2"><MessageSquare className="size-4 text-primario" />Comentarios ({comentarios.length})</span>}>
            <ul className="mb-3 max-h-72 space-y-3 overflow-y-auto">
              {comentarios.length === 0 && <li className="text-sm text-atenuado">Sé el primero en comentar.</li>}
              {comentarios.map((c) => (
                <li key={c.id} className="flex gap-2.5">
                  <Avatar nombre={c.autor} className="size-7" />
                  <div className="min-w-0 flex-1 rounded-lg bg-fondo/60 px-3 py-2">
                    <p className="text-xs"><span className="font-medium">{c.autor}</span> <span className="text-atenuado">· {haceTiempo(c.creadoEn)}</span>
                      {c.pendienteSync === 1 && <CloudUpload className="ml-1 inline size-3 text-amber-300" />}</p>
                    <p className="mt-0.5 whitespace-pre-line text-sm">{c.contenido}</p>
                  </div>
                </li>
              ))}
            </ul>
            <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); await comentar(s.id, nuevoComentario, actor); setNuevoComentario(''); }}>
              <input className="campo" placeholder="Comentar…" value={nuevoComentario} onChange={(e) => setNuevoComentario(e.target.value)} aria-label="Nuevo comentario" />
              <Boton tamano="md" type="submit" disabled={!nuevoComentario.trim()} aria-label="Enviar comentario"><Send className="size-4" /></Boton>
            </form>
          </Tarjeta>

          {s.estado === 'CERRADA' && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
              <CheckCircle2 className="size-5" /> Solicitud cerrada y aceptada. La calificación del equipo se habilita en el módulo de evaluación.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
