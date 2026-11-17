import type { Metadata } from 'next';
import { DetalleSolicitud } from '@/modulos/solicitudes/ui/detalle-solicitud';

export const metadata: Metadata = { title: 'Detalle de solicitud' };

export default async function PaginaDetalle({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DetalleSolicitud id={id} />;
}
