import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Encabezado } from '@/componentes/layout/encabezado';
import { BotonNuevaSolicitud } from '@/modulos/solicitudes/ui/boton-nueva-solicitud';
import { ListaSolicitudes } from '@/modulos/solicitudes/ui/lista-solicitudes';

export const metadata: Metadata = { title: 'Mis solicitudes' };

export default function PaginaMisSolicitudes() {
  return (
    <>
      <Encabezado
        antetitulo="Panel de seguimiento"
        titulo="Mis solicitudes"
        descripcion="Consulta el estado, el avance y quién está trabajando en cada solicitud."
        acciones={<BotonNuevaSolicitud />}
      />
      <Suspense>
        <ListaSolicitudes alcance="mias" />
      </Suspense>
    </>
  );
}
