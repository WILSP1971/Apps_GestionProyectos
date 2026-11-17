import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Plus } from 'lucide-react';
import { Encabezado } from '@/componentes/layout/encabezado';
import { Boton } from '@/componentes/ui/primitivos';
import { ListaSolicitudes } from '@/modulos/solicitudes/ui/lista-solicitudes';

export const metadata: Metadata = { title: 'Mis solicitudes' };

export default function PaginaMisSolicitudes() {
  return (
    <>
      <Encabezado
        antetitulo="Panel de seguimiento"
        titulo="Mis solicitudes"
        descripcion="Consulta el estado, el avance y quién está trabajando en cada solicitud."
        acciones={<Link href="/solicitudes/nueva"><Boton><Plus className="size-4" /> Nueva solicitud</Boton></Link>}
      />
      <Suspense>
        <ListaSolicitudes alcance="mias" />
      </Suspense>
    </>
  );
}
