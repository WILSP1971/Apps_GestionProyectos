import type { Metadata } from 'next';
import { Encabezado } from '@/componentes/layout/encabezado';
import { PanelReportes } from '@/modulos/reportes/ui/panel-reportes';

export const metadata: Metadata = { title: 'Reportes y analítica' };

export default function PaginaReportes() {
  return (
    <>
      <Encabezado antetitulo="Analítica" titulo="Reportes e indicadores"
        descripcion="Solicitudes por departamento, tendencia, tiempos de ciclo, SLA, carga del equipo y calificaciones." />
      <PanelReportes />
    </>
  );
}
