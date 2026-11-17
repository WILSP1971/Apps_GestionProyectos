import type { Metadata } from 'next';
import { EnConstruccion } from '@/componentes/layout/en-construccion';

export const metadata: Metadata = { title: 'Ayuda' };

export default function PaginaAyuda() {
  return <EnConstruccion titulo="Ayuda" sprint="Sprint 7" contenido={["Guía del usuario solicitante", "Preguntas frecuentes"]} />;
}
