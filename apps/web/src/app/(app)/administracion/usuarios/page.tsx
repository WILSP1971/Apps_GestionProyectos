import type { Metadata } from 'next';
import { Encabezado } from '@/componentes/layout/encabezado';
import { PestanasAdministracion } from '@/modulos/administracion/ui/pestanas-administracion';

export const metadata: Metadata = { title: 'Usuarios y equipos' };

export default function PaginaUsuarios() {
  return (
    <>
      <Encabezado antetitulo="Administración" titulo="Usuarios y equipos"
        descripcion="Roles, departamento, grupos, tecnologías y capacidad de cada persona, y el catálogo de aplicaciones que elige el solicitante." />
      <PestanasAdministracion />
    </>
  );
}
