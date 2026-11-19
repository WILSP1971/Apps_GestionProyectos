import { cn } from '@/lib/utils';

const ESTILO: Record<string, string> = {
  'A+': 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/40',
  A: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/40',
  'B+': 'bg-teal-500/15 text-teal-200 ring-teal-500/40',
  B: 'bg-sky-500/15 text-sky-200 ring-sky-500/40',
  C: 'bg-amber-500/15 text-amber-200 ring-amber-500/40',
  D: 'bg-red-500/15 text-red-300 ring-red-500/40',
};

/** Letra de la calificación (A+ … D); el texto siempre acompaña al color. */
export function InsigniaNota({ letra, grande = false }: { letra: string; grande?: boolean }) {
  return (
    <span className={cn('inline-flex items-center justify-center rounded-md font-semibold ring-1 ring-inset',
      grande ? 'h-14 min-w-14 px-3 text-2xl' : 'h-6 min-w-8 px-1.5 text-xs', ESTILO[letra] ?? ESTILO.D)}>
      {letra}
    </span>
  );
}
