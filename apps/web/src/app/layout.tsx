import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--fuente-inter', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'SierraFlow', template: '%s · SierraFlow' },
  description: 'Gestión y Dirección de Proyectos — Sierra Innova',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icono.svg' },
};

export const viewport: Viewport = { themeColor: '#08161d' };

export default function LayoutRaiz({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
