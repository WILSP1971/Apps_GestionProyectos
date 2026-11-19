import type { Metadata } from 'next';
import { Encabezado } from '@/componentes/layout/encabezado';
import { PanelEvaluacion } from '@/modulos/evaluacion/ui/panel-evaluacion';

export const metadata: Metadata = { title: 'Gestión y calificación del avance' };

export default function PaginaGestionEvaluacionDetalle() {
  return (
    <>
      <Encabezado antetitulo="Gestión" titulo="Gestión y calificación del avance"
        descripcion="Tareas por frente, avance ponderado, calificación por criterios y desempeño del equipo." />
      <PanelEvaluacion />
    </>
  );
}
