import type { Metadata } from 'next';
import { Encabezado } from '@/componentes/layout/encabezado';
import { MisAsignaciones } from '@/modulos/ingeniero/ui/mis-asignaciones';

export const metadata: Metadata = { title: 'Mis solicitudes y proyectos' };

export default function PaginaMisAsignaciones() {
  return (
    <>
      <Encabezado antetitulo="Mi trabajo" titulo="Mis solicitudes y proyectos" descripcion="Lo que tienes asignado, agrupado por proyecto." />
      <MisAsignaciones />
    </>
  );
}
