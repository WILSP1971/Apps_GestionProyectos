import type { Metadata } from 'next';
import { Encabezado } from '@/componentes/layout/encabezado';
import { PanelUsuarios } from '@/modulos/administracion/ui/panel-usuarios';

export const metadata: Metadata = { title: 'Usuarios y equipos' };

export default function PaginaUsuarios() {
  return (
    <>
      <Encabezado antetitulo="Administración" titulo="Usuarios y equipos"
        descripcion="Roles, departamento, grupos de trabajo, tecnologías y capacidad de cada persona. Así se alimenta la recomendación de asignación." />
      <PanelUsuarios />
    </>
  );
}
