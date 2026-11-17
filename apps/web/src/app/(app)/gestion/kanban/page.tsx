import type { Metadata } from 'next';
import { EnConstruccion } from '@/componentes/layout/en-construccion';

export const metadata: Metadata = { title: 'Kanban por departamentos' };

export default function PaginaGestionKanban() {
  return <EnConstruccion titulo="Kanban por departamentos" sprint="Sprint 5" contenido={["Columnas por estado y color por departamento", "Arrastrar y soltar con validación de la máquina de estados", "Asignación cross-departamento"]} />;
}
