import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...clases: ClassValue[]) => twMerge(clsx(clases));

const formatoFecha = new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
const formatoFechaHora = new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export const fecha = (iso?: string | null) => (iso ? formatoFecha.format(new Date(iso)) : '—');
export const fechaHora = (iso?: string | null) => (iso ? formatoFechaHora.format(new Date(iso)) : '—');

/** "hace 5 min", "hace 2 h", "hace 3 d" */
export function haceTiempo(iso: string): string {
  const seg = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seg < 60) return 'hace un momento';
  if (seg < 3600) return `hace ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `hace ${Math.floor(seg / 3600)} h`;
  return `hace ${Math.floor(seg / 86400)} d`;
}

export const iniciales = (nombre: string) =>
  nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');

export const nuevoId = () => crypto.randomUUID();
