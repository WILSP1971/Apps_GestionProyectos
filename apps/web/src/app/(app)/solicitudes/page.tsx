import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Encabezado } from '@/componentes/layout/encabezado';
import { BandejaSolicitudes } from '@/modulos/solicitudes/ui/bandeja-solicitudes';

export const metadata: Metadata = { title: 'Bandeja de solicitudes' };

export default function PaginaBandeja() {
  return (
    <>
      <Encabezado antetitulo="Gestión" titulo="Bandeja de solicitudes" descripcion="Solicitudes recibidas de todos los departamentos, con su estado e información. Las nuevas aparecen primero." />
      <Suspense>
        <BandejaSolicitudes />
      </Suspense>
    </>
  );
}
