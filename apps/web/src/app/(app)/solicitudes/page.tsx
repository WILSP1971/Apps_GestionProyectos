import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Encabezado } from '@/componentes/layout/encabezado';
import { ListaSolicitudes } from '@/modulos/solicitudes/ui/lista-solicitudes';

export const metadata: Metadata = { title: 'Bandeja de solicitudes' };

export default function PaginaBandeja() {
  return (
    <>
      <Encabezado antetitulo="Gestión" titulo="Bandeja de solicitudes" descripcion="Todas las solicitudes de los departamentos de la empresa." />
      <Suspense>
        <ListaSolicitudes alcance="todas" />
      </Suspense>
    </>
  );
}
