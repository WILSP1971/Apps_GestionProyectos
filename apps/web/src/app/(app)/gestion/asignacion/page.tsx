import type { Metadata } from 'next';
import { EnConstruccion } from '@/componentes/layout/en-construccion';

export const metadata: Metadata = { title: 'Asignación de grupo de trabajo / ingenieros' };

export default function PaginaGestionAsignacion() {
  return <EnConstruccion titulo="Asignación de grupo de trabajo / ingenieros" sprint="Sprint 5" contenido={["Solicitudes aprobadas por asignar", "Carga de trabajo y tecnologías por ingeniero", "Asignación a grupos (Backend, Frontend, QA) e ingenieros"]} />;
}
