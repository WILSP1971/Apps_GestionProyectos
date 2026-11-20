import type { Metadata } from 'next';
import { Encabezado } from '@/componentes/layout/encabezado';
import { PanelPreferencias } from '@/modulos/notificaciones/ui/panel-preferencias';
import { GuardaConfiguracion } from '@/modulos/notificaciones/ui/guarda-configuracion';

export const metadata: Metadata = { title: 'Configuración' };

export default function PaginaConfiguracion() {
  return (
    <GuardaConfiguracion>
      <Encabezado antetitulo="Cuenta" titulo="Configuración" descripcion="Elige cómo y cuándo quieres que SierraFlow te avise." />
      <PanelPreferencias />
    </GuardaConfiguracion>
  );
}
