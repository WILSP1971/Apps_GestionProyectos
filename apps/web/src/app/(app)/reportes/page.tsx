import type { Metadata } from 'next';
import { EnConstruccion } from '@/componentes/layout/en-construccion';

export const metadata: Metadata = { title: 'Reportes y analítica' };

export default function PaginaReportes() {
  return <EnConstruccion titulo="Reportes y analítica" sprint="Sprint 6" contenido={["Distribución por estado y departamento", "Tiempo promedio de resolución y SLA", "Carga por ingeniero"]} />;
}
