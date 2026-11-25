'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Inbox, Search, X } from 'lucide-react';
import { ETIQUETA_TIPO, type CatalogosProyecto, type EstadoSolicitud } from '@sierraflow/contratos';
import { dbLocal, type SolicitudLocal } from '@/lib/offline/db';
import { cn, haceTiempo } from '@/lib/utils';
import { InsigniaEstado, InsigniaPrioridad } from '@/modulos/solicitudes/ui/insignias';

/** Solicitudes recibidas que todavía pueden dar origen a un proyecto. */
export const ESTADOS_RECIBIDA: readonly EstadoSolicitud[] = ['ENVIADA', 'EN_REVISION', 'APROBADA'];

/**
 * Ventana para elegir una solicitud recibida (enviada, en revisión o aprobada) que aún no pertenece
 * a ningún proyecto. Por defecto muestra las de tipo "Nuevo"; se puede ver cualquier tipo.
 */
export function SelectorSolicitudNueva({ catalogos, alElegir, alCerrar }: {
  catalogos: CatalogosProyecto | null;
  alElegir: (s: SolicitudLocal) => void;
  alCerrar: () => void;
}) {
  const [texto, setTexto] = useState('');
  const [soloNuevo, setSoloNuevo] = useState(true);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); alCerrar(); } };
    window.addEventListener('keydown', tecla, true);
    return () => window.removeEventListener('keydown', tecla, true);
  }, [alCerrar]);

  const todas = useLiveQuery(() => dbLocal.solicitudes.where('estado').anyOf([...ESTADOS_RECIBIDA]).toArray(), []);
  // El servidor confirma cuáles siguen sin proyecto (la copia local puede ir un poco atrasada)
  const libres = useMemo(() => (catalogos ? new Set(catalogos.solicitudesDisponibles.map((s) => s.id)) : null), [catalogos]);

  const candidatas = useMemo(() => (todas ?? [])
    .filter((s) => !s.proyectoId && (!libres || libres.has(s.id)))
    .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn)), [todas, libres]);
  const nuevas = candidatas.filter((s) => s.tipo === 'NUEVO').length;
  const q = texto.trim().toLowerCase();
  const visibles = candidatas.filter((s) => (!soloNuevo || s.tipo === 'NUEVO')
    && (!q || `${s.codigo} ${s.titulo} ${s.solicitanteNombre}`.toLowerCase().includes(q)));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-selector-solicitud">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-borde bg-panel shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-borde px-5 py-4">
          <div>
            <h3 id="titulo-selector-solicitud" className="flex items-center gap-2 font-semibold"><Inbox className="size-4 text-teal-300" />Solicitudes nuevas existentes</h3>
            <p className="mt-0.5 text-xs text-atenuado">Recibidas (enviadas, en revisión o aprobadas) que aún no pertenecen a un proyecto. Elige una para usar sus datos.</p>
          </div>
          <button type="button" onClick={alCerrar} aria-label="Cerrar"><X className="size-5 text-atenuado" /></button>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-5 py-3">
          <label className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-atenuado" />
            <input autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por código, título o solicitante"
              className="campo pl-9" aria-label="Buscar solicitud" />
          </label>
          <div className="flex rounded-lg border border-borde p-0.5 text-xs" role="group" aria-label="Tipo de solicitud">
            {[{ v: true, t: `Tipo Nuevo (${nuevas})` }, { v: false, t: `Todos los tipos (${candidatas.length})` }].map((o) => (
              <button key={String(o.v)} type="button" aria-pressed={soloNuevo === o.v} onClick={() => setSoloNuevo(o.v)}
                className={cn('rounded-md px-2.5 py-1.5 transition', soloNuevo === o.v ? 'bg-primario/20 text-teal-200' : 'text-atenuado hover:text-texto')}>{o.t}</button>
            ))}
          </div>
        </div>

        <ul className="flex-1 divide-y divide-borde/60 overflow-y-auto border-t border-borde">
          {todas === undefined && <li className="px-5 py-10 text-center text-sm text-atenuado">Cargando…</li>}
          {todas !== undefined && visibles.length === 0 && (
            <li className="px-5 py-10 text-center text-sm text-atenuado">
              {candidatas.length === 0 ? 'No hay solicitudes recibidas sin proyecto.' : 'Ninguna solicitud coincide con el filtro.'}
            </li>
          )}
          {visibles.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => alElegir(s)} className="group w-full px-5 py-3 text-left transition hover:bg-panel-2/60 focus:bg-panel-2/60 focus:outline-none">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-sky-500/10 px-1.5 py-0.5 font-mono text-[11px] text-sky-300">{s.codigo}</span>
                  <span className="min-w-0 flex-1 truncate font-medium group-hover:text-teal-200">{s.titulo}</span>
                  <InsigniaEstado estado={s.estado} />
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-atenuado">{s.descripcion}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-atenuado">
                  <span>{ETIQUETA_TIPO[s.tipo]}</span>
                  <InsigniaPrioridad prioridad={s.prioridad} />
                  <span>{s.solicitanteNombre}</span>
                  <span>{haceTiempo(s.creadoEn)}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
