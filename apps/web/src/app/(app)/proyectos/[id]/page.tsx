import type { Metadata } from 'next';
import { DetalleProyectoPanel } from '@/modulos/proyectos/ui/detalle-proyecto';

export const metadata: Metadata = { title: 'Proyecto · PM Suite' };

export default function PaginaProyecto() {
  return <DetalleProyectoPanel />;
}
