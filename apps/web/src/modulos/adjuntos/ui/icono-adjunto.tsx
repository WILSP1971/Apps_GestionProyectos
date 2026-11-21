'use client';

import { FileCode2, FileText, Image as ImageIcon, Paperclip } from 'lucide-react';
import { categoriaAdjunto } from '@sierraflow/contratos';
import { cn } from '@/lib/utils';

const ESTILO = {
  imagen: { Icono: ImageIcon, color: 'text-sky-300 bg-sky-500/10' },
  pdf: { Icono: FileText, color: 'text-red-300 bg-red-500/10' },
  documento: { Icono: Paperclip, color: 'text-amber-200 bg-amber-500/10' },
  codigo: { Icono: FileCode2, color: 'text-violet-200 bg-violet-500/10' },
} as const;

export function IconoAdjunto({ nombre, mime, className }: { nombre: string; mime: string; className?: string }) {
  const e = ESTILO[categoriaAdjunto(nombre, mime)];
  return <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', e.color, className)}><e.Icono className="size-4" /></span>;
}
