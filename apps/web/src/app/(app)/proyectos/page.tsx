import type { Metadata } from 'next';
import { Encabezado } from '@/componentes/layout/encabezado';
import { ListaProyectos } from '@/modulos/proyectos/ui/lista-proyectos';

export const metadata: Metadata = { title: 'Proyectos (PM Suite)' };

export default function PaginaProyectos() {
  return (
    <>
      <Encabezado antetitulo="Dirección de proyectos" titulo="Portafolio de proyectos"
        descripcion="Cronograma, presupuesto, ROI, riesgos y deuda técnica de cada proyecto." />
      <ListaProyectos />
    </>
  );
}
