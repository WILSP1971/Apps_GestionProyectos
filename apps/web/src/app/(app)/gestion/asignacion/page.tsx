import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Encabezado } from '@/componentes/layout/encabezado';
import { PanelAsignacion } from '@/modulos/asignacion/ui/panel-asignacion';

export const metadata: Metadata = { title: 'Asignación' };

export default function PaginaAsignacion() {
  return (
    <>
      <Encabezado antetitulo="Gestión" titulo="Asignación de grupo de trabajo / ingenieros"
        descripcion="Elige el equipo según tecnologías y carga de trabajo. Los recomendados aparecen primero." />
      <Suspense>
        <PanelAsignacion />
      </Suspense>
    </>
  );
}
