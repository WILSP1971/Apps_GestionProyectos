import Link from 'next/link';
import { Construction } from 'lucide-react';
import { Boton } from '@/componentes/ui/primitivos';
import { Encabezado } from './encabezado';

/** Pantallas planificadas en sprints posteriores (ver docs/Guia_SierraFlow_Gestion_Proyectos.md §15). */
export function EnConstruccion({ titulo, sprint, contenido }: { titulo: string; sprint: string; contenido: string[] }) {
  return (
    <>
      <Encabezado titulo={titulo} />
      <div className="flex flex-col items-center rounded-xl border border-dashed border-borde bg-panel/40 px-6 py-16 text-center">
        <Construction className="size-10 text-primario" />
        <p className="mt-4 text-lg font-medium">Disponible en el {sprint}</p>
        <ul className="mt-3 space-y-1 text-sm text-atenuado">{contenido.map((c) => <li key={c}>• {c}</li>)}</ul>
        <Link href="/dashboard" className="mt-6"><Boton variante="secundario" tamano="sm">Ir al dashboard</Boton></Link>
      </div>
    </>
  );
}
