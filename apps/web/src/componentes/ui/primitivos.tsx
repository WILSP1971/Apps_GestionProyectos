import { forwardRef } from 'react';
import { cn, iniciales } from '@/lib/utils';

type VarianteBoton = 'primario' | 'secundario' | 'fantasma' | 'peligro' | 'exito';

const estilosBoton: Record<VarianteBoton, string> = {
  primario: 'bg-primario text-slate-950 hover:bg-primario-hover shadow-[0_0_0_1px_rgb(20_184_166/0.4)]',
  secundario: 'border border-borde-fuerte bg-panel-2 text-texto hover:border-primario/60 hover:bg-panel',
  fantasma: 'text-atenuado hover:bg-panel-2 hover:text-texto',
  peligro: 'border border-peligro/50 bg-peligro/10 text-red-300 hover:bg-peligro/20',
  exito: 'bg-emerald-600 text-white hover:bg-emerald-500',
};

export const Boton = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: VarianteBoton; tamano?: 'sm' | 'md' }>(
  function Boton({ variante = 'primario', tamano = 'md', className, ...props }, ref) {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
          tamano === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm',
          estilosBoton[variante],
          className,
        )}
        {...props}
      />
    );
  },
);

export function Tarjeta({
  titulo, acciones, children, className, cuerpoClassName,
}: { titulo?: React.ReactNode; acciones?: React.ReactNode; children: React.ReactNode; className?: string; cuerpoClassName?: string }) {
  return (
    <section className={cn('rounded-xl border border-borde bg-panel/80 shadow-lg shadow-black/20 backdrop-blur', className)}>
      {(titulo || acciones) && (
        <header className="flex items-center justify-between gap-3 border-b border-borde/70 px-5 py-3">
          <h2 className="text-sm font-semibold tracking-tight">{titulo}</h2>
          {acciones}
        </header>
      )}
      <div className={cn('p-5', cuerpoClassName)}>{children}</div>
    </section>
  );
}

export function Avatar({ nombre, className }: { nombre: string; className?: string }) {
  // Color estable por nombre
  const tono = [...nombre].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <span
      title={nombre}
      className={cn('inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ring-2 ring-fondo', className)}
      style={{ background: `linear-gradient(135deg, hsl(${tono} 55% 45%), hsl(${(tono + 40) % 360} 60% 35%))` }}
    >
      {iniciales(nombre)}
    </span>
  );
}

export function BarraProgreso({ valor, className, color = 'bg-primario' }: { valor: number; className?: string; color?: string }) {
  const v = Math.max(0, Math.min(100, valor));
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-fondo/80', className)} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${v}%` }} />
    </div>
  );
}

export function Vacio({ icono, titulo, texto, accion }: { icono: React.ReactNode; titulo: string; texto?: string; accion?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-borde px-6 py-14 text-center">
      <div className="text-atenuado">{icono}</div>
      <p className="font-medium">{titulo}</p>
      {texto && <p className="max-w-sm text-sm text-atenuado">{texto}</p>}
      {accion}
    </div>
  );
}
