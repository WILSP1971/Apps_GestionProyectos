import type { Metadata } from 'next';
import { Encabezado } from '@/componentes/layout/encabezado';
import { TableroKanban } from '@/modulos/kanban/ui/tablero-kanban';

export const metadata: Metadata = { title: 'Kanban por departamentos' };

export default function PaginaGestionKanban() {
  return (
    <>
      <Encabezado antetitulo="Gestión" titulo="Kanban por departamentos"
        descripcion="Arrastra una tarjeta a otra columna para cambiar su estado. Solo se iluminan las columnas permitidas para tu rol." />
      <TableroKanban />
    </>
  );
}
