'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ClipboardList, FolderKanban, ListChecks } from 'lucide-react';
import { ETIQUETA_ROL_SOLICITUD, type ResumenProyecto, type RolEnSolicitud } from '@sierraflow/contratos';
import { dbLocal, type SolicitudLocal } from '@/lib/offline/db';
import { BarraProgreso, Tarjeta, Vacio } from '@/componentes/ui/primitivos';
import { useActor, useUsuario } from '@/componentes/layout/proveedores';
import { InsigniaEstado, InsigniaPrioridad } from '@/modulos/solicitudes/ui/insignias';
import { fuenteApi as proyectosApi, fuenteDemo as proyectosDemo } from '@/modulos/proyectos/infraestructura/fuente-proyectos';
import { fechaCorta, InsigniaSalud } from '@/modulos/proyectos/ui/comunes';
import { esAsignacionNueva } from '@/modulos/notificaciones/ui/avisos-en-linea';
import { marcarNotificacionLeida } from '@/modulos/notificaciones/aplicacion/casos-uso';

const ACTIVAS = ['ASIGNADA', 'EN_DESARROLLO', 'EN_VALIDACION'];

/**
 * Menú del ingeniero → "Mis solicitudes y proyectos": lo que tiene asignado.
 * Las solicitudes vienen de IndexedDB (funciona sin conexión); los proyectos, del servidor.
 */
export function MisAsignaciones() {
  const actor = useActor();
  const { modoDemo } = useUsuario();
  const [verCerradas, setVerCerradas] = useState(false);
  const [proyectos, setProyectos] = useState<ResumenProyecto[] | null>(null);

  useEffect(() => {
    (modoDemo ? proyectosDemo : proyectosApi).mios().then(setProyectos).catch(() => setProyectos([]));
  }, [modoDemo]);

  // Al abrir esta pantalla, las asignaciones nuevas quedan vistas (se apaga el contador del menú)
  useEffect(() => {
    void dbLocal.notificaciones.where('leida').equals(0).filter(esAsignacionNueva).toArray()
      .then((ns) => Promise.all(ns.map((n) => marcarNotificacionLeida(n.id))));
  }, []);

  const todas = useLiveQuery(() => dbLocal.solicitudes.toArray(), []) ?? [];
  // En demo los asignados son ingenieros ficticios: se muestran todas las solicitudes con equipo
  const mias = todas.filter((s) => s.asignados.some((a) => a.usuarioId === actor.id) || (modoDemo && s.asignados.length > 0));
  const visibles = mias.filter((s) => verCerradas || ACTIVAS.includes(s.estado));

  const grupos = useMemo(() => {
    const m = new Map<string, { titulo: string; proyectoId: string | null; lista: SolicitudLocal[] }>();
    for (const s of visibles) {
      const k = s.proyectoId ?? '';
      const g = m.get(k) ?? { titulo: s.proyectoId ? `${s.proyectoCodigo ?? ''} · ${s.proyectoNombre ?? 'Proyecto'}` : 'Sin proyecto', proyectoId: s.proyectoId ?? null, lista: [] };
      g.lista.push(s);
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => (a.proyectoId ? 0 : 1) - (b.proyectoId ? 0 : 1) || a.titulo.localeCompare(b.titulo, 'es'));
  }, [visibles]);

  const rol = (s: SolicitudLocal) => {
    const r = s.asignados.find((a) => a.usuarioId === actor.id)?.rol as RolEnSolicitud | undefined;
    return r ? ETIQUETA_ROL_SOLICITUD[r] : null;
  };

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-atenuado"><FolderKanban className="size-4" /> Mis proyectos</h2>
        {proyectos === null ? <div className="h-28 animate-pulse rounded-xl bg-panel/60" /> : proyectos.length === 0 ? (
          <p className="rounded-xl border border-borde bg-panel/60 px-5 py-6 text-sm text-atenuado">
            {navigator.onLine ? 'Aún no participas en ningún proyecto.' : 'Sin conexión: los proyectos se consultan en el servidor.'}
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {proyectos.map((p) => (
              <div key={p.id} className="rounded-xl border border-borde bg-panel/80 p-4">
                <p className="text-xs text-atenuado"><span className="font-mono text-sky-300">{p.codigo}</span>{p.departamento && ` · ${p.departamento}`}</p>
                <p className="mt-0.5 font-semibold">{p.nombre}</p>
                <div className="mt-3 mb-1 flex items-center justify-between text-xs">
                  <InsigniaSalud salud={p.salud.salud} />
                  <span className="tabular-nums text-atenuado">{Math.round(p.avancePct)}%</span>
                </div>
                <BarraProgreso valor={p.avancePct} />
                <p className="mt-2 text-[11px] text-atenuado">{fechaCorta(p.fechaInicio)} → {fechaCorta(p.fechaFinPlan)} · {p.solicitudes} solicitud(es)</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-atenuado"><ClipboardList className="size-4" /> Solicitudes asignadas ({visibles.length})</h2>
          <label className="flex items-center gap-2 text-xs text-atenuado">
            <input type="checkbox" className="size-3.5 accent-teal-500" checked={verCerradas} onChange={(e) => setVerCerradas(e.target.checked)} /> Incluir cerradas
          </label>
        </div>
        {visibles.length === 0 ? (
          <Vacio icono={<ClipboardList className="size-8" />} titulo="No tienes solicitudes asignadas"
            texto="Cuando un líder te asigne a una solicitud aparecerá aquí, agrupada por proyecto." />
        ) : (
          <div className="space-y-4">
            {grupos.map((g) => (
              <Tarjeta key={g.titulo} titulo={g.titulo} cuerpoClassName="p-0">
                <ul className="divide-y divide-borde/50">
                  {g.lista.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                      <Link href={`/solicitudes/${s.id}`} className="min-w-0 flex-1 basis-64 hover:text-teal-200">
                        <span className="flex items-center gap-2 text-xs"><span className="font-mono text-sky-300">{s.codigo}</span><InsigniaPrioridad prioridad={s.prioridad} />
                          {rol(s) && <span className="text-atenuado">· {rol(s)}</span>}</span>
                        <span className="mt-0.5 block text-sm font-medium">{s.titulo}</span>
                      </Link>
                      <InsigniaEstado estado={s.estado} />
                      <div className="flex w-40 items-center gap-2"><BarraProgreso valor={s.avancePct} className="flex-1" /><span className="w-9 text-right text-xs tabular-nums">{Math.round(s.avancePct)}%</span></div>
                      {ACTIVAS.includes(s.estado) && (
                        <Link href={`/gestion/evaluacion/${s.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-primario hover:underline">
                          <ListChecks className="size-3.5" /> Tareas
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </Tarjeta>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
