import type { Metadata } from 'next';
import { Encabezado } from '@/componentes/layout/encabezado';
import { ReportesSegunRol } from '@/modulos/reportes/ui/reportes-segun-rol';

export const metadata: Metadata = { title: 'Reportes' };

export default function PaginaReportes() {
  return (
    <>
      <Encabezado antetitulo="Análisis" titulo="Reportes e indicadores"
        descripcion="Indicadores de solicitudes, tiempos, carga y calificaciones. El ingeniero ve su desempeño personal." />
      <ReportesSegunRol />
    </>
  );
}
