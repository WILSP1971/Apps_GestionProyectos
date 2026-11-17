import { Ban, Check, XCircle } from 'lucide-react';
import { ETIQUETA_ESTADO, LINEA_DE_VIDA, type EstadoSolicitud } from '@sierraflow/contratos';
import { cn } from '@/lib/utils';

/** Línea de vida Borrador → Cerrada (estilo "chevrons" de los mockups). */
export function LineaDeVida({ estado, compacta = false }: { estado: EstadoSolicitud; compacta?: boolean }) {
  if (estado === 'RECHAZADA' || estado === 'CANCELADA') {
    const Icono = estado === 'RECHAZADA' ? XCircle : Ban;
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
        <Icono className="size-4" /> Solicitud {ETIQUETA_ESTADO[estado].toLowerCase()}: el ciclo de vida terminó.
      </div>
    );
  }
  const actual = LINEA_DE_VIDA.indexOf(estado);
  return (
    <ol className="flex overflow-x-auto rounded-lg border border-borde bg-fondo/50 p-1" aria-label="Línea de vida de la solicitud">
      {LINEA_DE_VIDA.map((e, i) => {
        const hecho = i < actual || estado === 'CERRADA';
        const esActual = i === actual && estado !== 'CERRADA';
        return (
          <li
            key={e}
            aria-current={esActual ? 'step' : undefined}
            className={cn(
              'relative flex min-w-fit flex-1 items-center justify-center gap-1.5 whitespace-nowrap px-4 text-center font-medium',
              compacta ? 'py-1 text-[11px]' : 'py-2 text-xs',
              '[clip-path:polygon(0_0,calc(100%-10px)_0,100%_50%,calc(100%-10px)_100%,0_100%,10px_50%)] first:[clip-path:polygon(0_0,calc(100%-10px)_0,100%_50%,calc(100%-10px)_100%,0_100%)]',
              hecho && 'bg-teal-700/70 text-teal-50',
              esActual && 'bg-blue-600 text-white shadow-lg',
              !hecho && !esActual && 'bg-panel-2 text-atenuado',
            )}
          >
            {hecho && <Check className="size-3" />}
            {ETIQUETA_ESTADO[e]}
            {esActual && !compacta && <span className="font-normal opacity-80">(actual)</span>}
          </li>
        );
      })}
    </ol>
  );
}
