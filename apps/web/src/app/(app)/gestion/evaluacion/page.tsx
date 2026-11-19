import type { Metadata } from 'next';
import { Encabezado } from '@/componentes/layout/encabezado';
import { ListaEvaluacion } from '@/modulos/evaluacion/ui/lista-evaluacion';

export const metadata: Metadata = { title: 'Seguimiento y evaluación' };

export default function PaginaEvaluacion() {
  return (
    <>
      <Encabezado antetitulo="Gestión" titulo="Seguimiento y evaluación"
        descripcion="Avance por tareas de cada solicitud en curso y su última calificación." />
      <ListaEvaluacion />
    </>
  );
}
