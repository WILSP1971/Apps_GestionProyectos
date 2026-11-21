'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Download, Loader2, Trash2, X } from 'lucide-react';
import { categoriaAdjunto, tamanoLegible, type AdjuntoVista } from '@sierraflow/contratos';
import { cn, haceTiempo } from '@/lib/utils';
import type { FuenteAdjuntos } from '../infraestructura/fuente-adjuntos';
import { IconoAdjunto } from './icono-adjunto';

/** Abre un adjunto: imágenes en un visor, PDF en una pestaña nueva y el resto se descarga. */
async function abrir(a: AdjuntoVista, fuente: FuenteAdjuntos, verImagen: (url: string, a: AdjuntoVista) => void) {
  const blob = await fuente.descargar(a.id);
  const url = URL.createObjectURL(new Blob([blob], { type: a.mime }));
  const cat = categoriaAdjunto(a.nombre, a.mime);
  if (cat === 'imagen') return verImagen(url, a);
  if (cat === 'pdf') {
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = a.nombre;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function ListaAdjuntos({ adjuntos, fuente, compacta, puedeEliminar, alEliminar }: {
  adjuntos: AdjuntoVista[]; fuente: FuenteAdjuntos; compacta?: boolean;
  puedeEliminar?: (a: AdjuntoVista) => boolean; alEliminar?: (a: AdjuntoVista) => void;
}) {
  const [abriendo, setAbriendo] = useState<string | null>(null);
  const [visor, setVisor] = useState<{ url: string; a: AdjuntoVista } | null>(null);

  const alAbrir = async (a: AdjuntoVista) => {
    setAbriendo(a.id);
    try { await abrir(a, fuente, (url, x) => setVisor({ url, a: x })); } catch (e) { toast.error((e as Error).message); } finally { setAbriendo(null); }
  };

  if (!adjuntos.length) return null;
  return (
    <>
      <ul className={cn(compacta ? 'flex flex-wrap gap-1.5' : 'grid gap-2 sm:grid-cols-2')}>
        {adjuntos.map((a) => (
          <li key={a.id} className={cn('group flex items-center gap-2 rounded-lg border border-borde bg-fondo/40', compacta ? 'max-w-full py-1 pl-1 pr-2' : 'px-2.5 py-2')}>
            <button type="button" onClick={() => void alAbrir(a)} className="flex min-w-0 flex-1 items-center gap-2 text-left" title={`Abrir ${a.nombre}`}>
              {categoriaAdjunto(a.nombre, a.mime) === 'imagen' && !compacta
                ? <MiniaturaRemota a={a} fuente={fuente} />
                : <IconoAdjunto nombre={a.nombre} mime={a.mime} className={compacta ? 'size-6' : undefined} />}
              <span className="min-w-0">
                <span className={cn('block truncate font-medium text-sky-200 group-hover:underline', compacta ? 'text-[11px]' : 'text-xs')}>{a.nombre}</span>
                {!compacta && <span className="text-[11px] text-atenuado">{tamanoLegible(a.tamano)} · {a.subidoPor} · {haceTiempo(a.creadoEn)}</span>}
              </span>
              {abriendo === a.id ? <Loader2 className="size-3.5 shrink-0 animate-spin text-atenuado" />
                : !compacta && <Download className="size-3.5 shrink-0 text-atenuado opacity-0 transition group-hover:opacity-100" />}
            </button>
            {puedeEliminar?.(a) && alEliminar && (
              <button type="button" onClick={() => alEliminar(a)} aria-label={`Eliminar ${a.nombre}`}
                className="rounded p-1 text-atenuado opacity-0 transition hover:text-red-300 focus:opacity-100 group-hover:opacity-100"><Trash2 className="size-3.5" /></button>
            )}
          </li>
        ))}
      </ul>
      {visor && <VisorImagen url={visor.url} nombre={visor.a.nombre} alCerrar={() => { URL.revokeObjectURL(visor.url); setVisor(null); }} />}
    </>
  );
}

function MiniaturaRemota({ a, fuente }: { a: AdjuntoVista; fuente: FuenteAdjuntos }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    let vigente = true;
    fuente.descargar(a.id).then((b) => { if (vigente) { u = URL.createObjectURL(b); setUrl(u); } }).catch(() => undefined);
    return () => { vigente = false; if (u) URL.revokeObjectURL(u); };
  }, [a.id, fuente]);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" className="size-10 shrink-0 rounded-lg object-cover" /> : <IconoAdjunto nombre={a.nombre} mime={a.mime} className="size-10" />;
}

function VisorImagen({ url, nombre, alCerrar }: { url: string; nombre: string; alCerrar: () => void }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && alCerrar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [alCerrar]);
  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/85 p-6" role="dialog" aria-modal="true" aria-label={nombre} onClick={alCerrar}>
      <div className="mb-3 flex w-full max-w-5xl items-center justify-between text-sm text-white/80">
        <span className="truncate">{nombre}</span>
        <span className="flex gap-2">
          <a href={url} download={nombre} onClick={(e) => e.stopPropagation()} className="rounded-lg border border-white/20 px-2.5 py-1 hover:bg-white/10"><Download className="inline size-4" /> Descargar</a>
          <button type="button" onClick={alCerrar} aria-label="Cerrar" className="rounded-lg border border-white/20 p-1.5 hover:bg-white/10"><X className="size-4" /></button>
        </span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={nombre} className="max-h-[80vh] max-w-full rounded-lg object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}
