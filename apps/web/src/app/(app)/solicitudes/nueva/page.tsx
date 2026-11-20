import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Encabezado } from '@/componentes/layout/encabezado';
import { AsistenteNuevaSolicitud } from '@/modulos/solicitudes/ui/asistente-nueva-solicitud';
import { GuardaNuevaSolicitud } from '@/modulos/solicitudes/ui/guarda-nueva-solicitud';

export const metadata: Metadata = { title: 'Nueva solicitud' };

export default function PaginaNuevaSolicitud() {
  return (
    <>
      <Encabezado antetitulo="Solicitudes" titulo="Crear nueva solicitud de requerimiento" descripcion="Completa los 4 pasos. Puedes guardar como borrador y enviarla después." />
      <Suspense>
        <GuardaNuevaSolicitud><AsistenteNuevaSolicitud /></GuardaNuevaSolicitud>
      </Suspense>
    </>
  );
}
