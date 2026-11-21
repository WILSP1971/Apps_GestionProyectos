'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { AlertTriangle, CloudUpload, Loader2, Paperclip, Plus, Trash2, WifiOff } from 'lucide-react';
import { tamanoLegible, type AdjuntoVista } from '@sierraflow/contratos';
import { dbLocal } from '@/lib/offline/db';
import { Boton, Tarjeta } from '@/componentes/ui/primitivos';
import { useActor, useUsuario } from '@/componentes/layout/proveedores';
import { encolarAdjuntosSolicitud, subirAdjuntosPendientes } from '../aplicacion/cola-adjuntos';
import { fuenteApi, fuenteDemo } from '../infraestructura/fuente-adjuntos';
import { IconoAdjunto } from './icono-adjunto';
import { ListaAdjuntos } from './lista-adjuntos';
import { SelectorAdjuntos } from './selector-adjuntos';

const ROLES_GESTION = ['LIDER', 'DIRECTOR', 'ADMIN'] as const;

/**
 * Adjuntos de la solicitud (detalle): los del servidor, los que esperan subir desde este equipo y
 * la opción de agregar más (solicitante, gestión y equipo asignado, mientras no esté cerrada).
 */
export function AdjuntosSolicitud({ solicitudId, puedeAdjuntar }: { solicitudId: string; puedeAdjuntar: boolean }) {
  const { modoDemo } = useUsuario();
  const actor = useActor();
  const fuente = modoDemo ? fuenteDemo : fuenteApi;
  const [remotos, setRemotos] = useState<AdjuntoVista[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const locales = useLiveQuery(
    () => dbLocal.adjuntos.where('solicitudId').equals(solicitudId).filter((a) => a.estado !== 'DEMO').toArray(), [solicitudId]) ?? [];

  const cargar = useCallback(async () => {
    if (!modoDemo && !navigator.onLine) { setError('sin-conexion'); return; }
    try { setRemotos(await fuente.listar({ solicitudId })); setError(null); } catch (e) { setError((e as Error).message); }
  }, [fuente, solicitudId, modoDemo]);
  useEffect(() => { void cargar(); }, [cargar]);
  // Cuando la cola sube un pendiente, refresca la lista del servidor
  useEffect(() => { if (!modoDemo && locales.length === 0 && remotos) void cargar(); }, [locales.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const guardar = async () => {
    setSubiendo(true);
    try {
      if (modoDemo) {
        for (const f of archivos) await fuenteDemo.subir({ solicitudId }, f, actor);
      } else {
        await encolarAdjuntosSolicitud(solicitudId, archivos, actor, false);
        await subirAdjuntosPendientes().catch(() => undefined);
      }
      toast.success(modoDemo || navigator.onLine ? 'Archivos adjuntados' : 'Guardados en este equipo: se subirán al reconectar');
      setArchivos([]); setAgregando(false);
      await cargar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubiendo(false);
    }
  };
  const esGestion = actor.roles.some((r) => (ROLES_GESTION as readonly string[]).includes(r));
  const eliminar = async (a: AdjuntoVista) => {
    if (!confirm(`¿Eliminar "${a.nombre}"?`)) return;
    try { await fuente.eliminar(a.id); await cargar(); } catch (e) { toast.error((e as Error).message); }
  };
  const total = (remotos?.length ?? 0) + locales.length;

  return (
    <Tarjeta titulo={<span className="flex items-center gap-2"><Paperclip className="size-4 text-atenuado" />Adjuntos {total > 0 && <span className="font-normal text-atenuado">({total})</span>}</span>}
      acciones={puedeAdjuntar && !agregando && <Boton tamano="sm" variante="secundario" onClick={() => setAgregando(true)}><Plus className="size-4" />Adjuntar</Boton>}>
      <div className="space-y-3">
        {error === 'sin-conexion' ? (
          <p className="flex items-center gap-2 text-sm text-atenuado"><WifiOff className="size-4" />Los adjuntos guardados en el servidor se ven con conexión.</p>
        ) : error ? <p className="text-sm text-red-300">{error}</p>
          : remotos === null ? <div className="h-12 animate-pulse rounded-lg bg-panel-2/60" />
          : remotos.length === 0 && locales.length === 0 && !agregando ? <p className="text-sm text-atenuado">Sin adjuntos.</p>
          : <ListaAdjuntos adjuntos={remotos} fuente={fuente} puedeEliminar={(a) => esGestion || a.subidoPor === actor.nombre} alEliminar={(a) => void eliminar(a)} />}

        {locales.length > 0 && (
          <ul className="space-y-1.5">
            {locales.map((a) => (
              <li key={a.id} className="flex items-center gap-2.5 rounded-lg border border-dashed border-borde px-2.5 py-2">
                <IconoAdjunto nombre={a.nombre} mime={a.mime} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{a.nombre}</span>
                  <span className={a.estado === 'ERROR' ? 'text-[11px] text-red-300' : 'text-[11px] text-amber-200'}>
                    {a.estado === 'ERROR'
                      ? <><AlertTriangle className="mr-1 inline size-3" />{a.error}</>
                      : <><CloudUpload className="mr-1 inline size-3" />Pendiente de subir · {tamanoLegible(a.tamano)}</>}
                  </span>
                </span>
                <button type="button" onClick={() => void dbLocal.adjuntos.delete(a.id)} aria-label={`Quitar ${a.nombre}`}
                  className="rounded p-1 text-atenuado hover:text-red-300"><Trash2 className="size-3.5" /></button>
              </li>
            ))}
          </ul>
        )}

        {agregando && (
          <div className="rounded-xl border border-borde bg-fondo/30 p-3">
            <SelectorAdjuntos archivos={archivos} alCambiar={setArchivos} compacto />
            <div className="mt-3 flex justify-end gap-2">
              <Boton tamano="sm" variante="fantasma" onClick={() => { setAgregando(false); setArchivos([]); }}>Cancelar</Boton>
              <Boton tamano="sm" disabled={!archivos.length || subiendo} onClick={() => void guardar()}>
                {subiendo ? <Loader2 className="size-4 animate-spin" /> : <CloudUpload className="size-4" />}Subir {archivos.length || ''}
              </Boton>
            </div>
          </div>
        )}
      </div>
    </Tarjeta>
  );
}
