import type { Metadata } from 'next';
import { EnConstruccion } from '@/componentes/layout/en-construccion';

export const metadata: Metadata = { title: 'Proyectos (PM Suite)' };

export default function PaginaProyectos() {
  return <EnConstruccion titulo="Proyectos (PM Suite)" sprint="Sprint 7" contenido={["Gantt del proyecto", "Matriz de riesgos probabilidad × impacto", "Deuda técnica, presupuesto y ROI"]} />;
}
