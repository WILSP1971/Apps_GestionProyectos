import type { Metadata } from 'next';
import { PanelDashboard } from '@/modulos/dashboard/ui/panel-dashboard';
import { Encabezado } from '@/componentes/layout/encabezado';

export const metadata: Metadata = { title: 'Dashboard' };

export default function PaginaDashboard() {
  return (
    <>
      <Encabezado antetitulo="Gestión de Proyectos" titulo="Dashboard" descripcion="Estado general de las solicitudes de requerimiento." />
      <PanelDashboard />
    </>
  );
}
