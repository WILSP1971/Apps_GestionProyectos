'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { UploadCloud, X } from 'lucide-react';
import { ACEPTAR_ADJUNTOS, MAX_ADJUNTOS_POR_ENVIO, tamanoLegible, validarAdjunto } from '@sierraflow/contratos';
import { cn } from '@/lib/utils';
import { IconoAdjunto } from './icono-adjunto';

/**
 * Selector de archivos con arrastrar y soltar: imágenes, PDF, documentos y código (máx. 10 MB c/u).
 * Valida en el navegador con las mismas reglas del servidor.
 */
export function SelectorAdjuntos({ archivos, alCambiar, maximo = MAX_ADJUNTOS_POR_ENVIO, texto, compacto }: {
  archivos: File[]; alCambiar: (a: File[]) => void; maximo?: number; texto?: string; compacto?: boolean;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [encima, setEncima] = useState(false);

  const agregar = (lista: FileList | null) => {
    if (!lista?.length) return;
    const validos: File[] = [];
    for (const f of Array.from(lista)) {
      const v = validarAdjunto(f.name, f.size);
      if (!v.ok) { toast.error(v.error); continue; }
      if (archivos.some((a) => a.name === f.name && a.size === f.size)) continue;
      validos.push(f);
    }
    const total = [...archivos, ...validos];
    if (total.length > maximo) toast.error(`Puedes adjuntar hasta ${maximo} archivos a la vez`);
    alCambiar(total.slice(0, maximo));
    if (entrada.current) entrada.current.value = '';
  };

  return (
    <div>
      <button type="button" onClick={() => entrada.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setEncima(true); }} onDragLeave={() => setEncima(false)}
        onDrop={(e) => { e.preventDefault(); setEncima(false); agregar(e.dataTransfer.files); }}
        className={cn('flex w-full items-center gap-3 rounded-xl border border-dashed text-left transition',
          compacto ? 'px-3 py-2.5' : 'px-4 py-4',
          encima ? 'border-primario bg-primario/10' : 'border-borde-fuerte hover:border-primario/60 hover:bg-panel-2/40')}>
        <UploadCloud className={cn('shrink-0 text-primario', compacto ? 'size-5' : 'size-7')} />
        <span className="min-w-0">
          <span className="block text-sm font-medium">{texto ?? 'Arrastra archivos aquí o haz clic para elegirlos'}</span>
          <span className="block text-[11px] text-atenuado">Imágenes, PDF, Word/Excel, código (.ts, .py, .cs, .sql…) · máx. 10 MB por archivo</span>
        </span>
      </button>
      <input ref={entrada} type="file" multiple accept={ACEPTAR_ADJUNTOS} className="hidden" onChange={(e) => agregar(e.target.files)} />
      {archivos.length > 0 && (
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {archivos.map((f, i) => (
            <li key={`${f.name}-${f.size}`} className="flex items-center gap-2.5 rounded-lg border border-borde bg-fondo/40 px-2.5 py-2">
              <Miniatura archivo={f} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">{f.name}</span>
                <span className="text-[11px] text-atenuado">{tamanoLegible(f.size)}</span>
              </span>
              <button type="button" onClick={() => alCambiar(archivos.filter((_, j) => j !== i))} aria-label={`Quitar ${f.name}`}
                className="rounded p-1 text-atenuado hover:bg-peligro/10 hover:text-red-300"><X className="size-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Miniatura({ archivo }: { archivo: File }) {
  const [url, setUrl] = useState<string | null>(null);
  const v = validarAdjunto(archivo.name, archivo.size);
  const mime = v.ok ? v.mime : '';
  useEffect(() => {
    if (!mime.startsWith('image/')) return;
    const u = URL.createObjectURL(archivo);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [archivo, mime]);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" className="size-8 shrink-0 rounded-lg object-cover" /> : <IconoAdjunto nombre={archivo.name} mime={mime} />;
}
