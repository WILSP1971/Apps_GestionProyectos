import type { Metadata } from 'next';
import { Encabezado } from '@/componentes/layout/encabezado';
import { RegistrarAvances } from '@/modulos/ingeniero/ui/registrar-avances';

export const metadata: Metadata = { title: 'Registrar avances' };

export default function PaginaAvances() {
  return (
    <>
      <Encabezado antetitulo="Mi trabajo" titulo="Registrar avances"
        descripcion="Actualiza el estado, el porcentaje y las horas de tus tareas. El líder y el solicitante ven el avance al instante." />
      <RegistrarAvances />
    </>
  );
}
