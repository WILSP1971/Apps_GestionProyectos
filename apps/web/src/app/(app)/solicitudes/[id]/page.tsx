import type { Metadata } from 'next';
import { DetalleSolicitud } from '@/modulos/solicitudes/ui/detalle-solicitud';

export const metadata: Metadata = { title: 'Detalle de solicitud' };

/** El componente lee el id de la URL en el cliente (necesario para abrir solicitudes sin conexión). */
export default function PaginaDetalle() {
  return <DetalleSolicitud />;
}
