import { ETIQUETA_ESTADO, ETIQUETA_PRIORIDAD, ETIQUETA_TIPO, type EstadoSolicitud, type Prioridad, type TipoSolicitud } from '@sierraflow/contratos';
import { Flame } from 'lucide-react';
import { cn } from '@/lib/utils';

export const COLOR_ESTADO: Record<EstadoSolicitud, { punto: string; fondo: string; barra: string }> = {
  BORRADOR: { punto: 'bg-slate-400', fondo: 'bg-slate-500/15 text-slate-300', barra: 'bg-slate-500' },
  ENVIADA: { punto: 'bg-sky-400', fondo: 'bg-sky-500/15 text-sky-300', barra: 'bg-sky-500' },
  EN_REVISION: { punto: 'bg-amber-400', fondo: 'bg-amber-500/15 text-amber-300', barra: 'bg-amber-500' },
  APROBADA: { punto: 'bg-teal-400', fondo: 'bg-teal-500/15 text-teal-300', barra: 'bg-teal-500' },
  RECHAZADA: { punto: 'bg-red-400', fondo: 'bg-red-500/15 text-red-300', barra: 'bg-red-500' },
  ASIGNADA: { punto: 'bg-indigo-400', fondo: 'bg-indigo-500/15 text-indigo-300', barra: 'bg-indigo-500' },
  EN_DESARROLLO: { punto: 'bg-blue-400', fondo: 'bg-blue-500/15 text-blue-300', barra: 'bg-blue-500' },
  EN_VALIDACION: { punto: 'bg-violet-400', fondo: 'bg-violet-500/15 text-violet-300', barra: 'bg-violet-500' },
  CERRADA: { punto: 'bg-emerald-400', fondo: 'bg-emerald-500/15 text-emerald-300', barra: 'bg-emerald-500' },
  CANCELADA: { punto: 'bg-zinc-500', fondo: 'bg-zinc-500/15 text-zinc-400', barra: 'bg-zinc-600' },
};

export function InsigniaEstado({ estado, className }: { estado: EstadoSolicitud; className?: string }) {
  const c = COLOR_ESTADO[estado];
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', c.fondo, className)}>
      <span className={cn('size-1.5 rounded-full', c.punto)} />
      {ETIQUETA_ESTADO[estado]}
    </span>
  );
}

const COLOR_PRIORIDAD: Record<Prioridad, string> = {
  BAJA: 'text-slate-400',
  MEDIA: 'text-sky-300',
  ALTA: 'text-orange-400',
  CRITICA: 'text-red-400',
};

export function InsigniaPrioridad({ prioridad }: { prioridad: Prioridad }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', COLOR_PRIORIDAD[prioridad])}>
      {(prioridad === 'ALTA' || prioridad === 'CRITICA') && <Flame className="size-3.5" />}
      {ETIQUETA_PRIORIDAD[prioridad]}
    </span>
  );
}

export function InsigniaTipo({ tipo }: { tipo: TipoSolicitud }) {
  return <span className="rounded-md border border-borde px-2 py-0.5 text-xs text-atenuado">{ETIQUETA_TIPO[tipo]}</span>;
}
