import type { Metadata } from 'next';
import { EnConstruccion } from '@/componentes/layout/en-construccion';

export const metadata: Metadata = { title: 'Gestión y calificación del avance' };

export default function PaginaGestionEvaluacionDetalle() {
  return <EnConstruccion titulo="Gestión y calificación del avance" sprint="Sprint 6" contenido={["Avance por frente (Backend, Frontend, QA)", "Calificación por criterios 1–5 y nota global", "Calificación individual y comentarios del líder"]} />;
}
