import type { Metadata } from 'next';
import { Encabezado } from '@/componentes/layout/encabezado';
import { RegistrarAvances } from '@/modulos/ingeniero/ui/registrar-avances';

export const metadata: Metadata = { title: 'Registrar avances' };

export default function PaginaAvances() {
  return (
    <>
      <Encabezado antetitulo="Mi trabajo" titulo="Registrar avances"
        descripcion="Tu centro de trabajo: tareas, checklist, horas y evidencias. El líder y el solicitante ven cada avance al instante." />
      <RegistrarAvances />
    </>
  );
}
