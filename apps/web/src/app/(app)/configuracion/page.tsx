import type { Metadata } from 'next';
import { EnConstruccion } from '@/componentes/layout/en-construccion';

export const metadata: Metadata = { title: 'Configuración' };

export default function PaginaConfiguracion() {
  return <EnConstruccion titulo="Configuración" sprint="Sprint 4" contenido={["Preferencias de notificación (app, push, email)", "Activar notificaciones push en este equipo"]} />;
}
