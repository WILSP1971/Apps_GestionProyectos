import type { NextConfig } from 'next';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import withSerwistInit from '@serwist/next';

// Usa también el .env de la raíz del monorepo (Next ya carga apps/web/.env.local si existe)
try {
  process.loadEnvFile(resolve(process.cwd(), '../../.env'));
} catch {
  /* sin .env en la raíz */
}

// Service Worker (Offline-First). Desactivado en `next dev`: pruébalo con `pnpm preview`.
const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  // La página /offline es estática: se precarga para servirla cuando no hay red ni copia en caché
  additionalPrecacheEntries: [{ url: '/offline', revision: process.env.GIT_SHA ?? randomUUID() }],
  cacheOnNavigation: false,
  reloadOnOnline: false, // no recargar: se perderían formularios a medio llenar; el motor sincroniza solo
});

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: resolve(process.cwd(), '../../'),
  reactStrictMode: true,
  transpilePackages: ['@sierraflow/contratos'],
  poweredByHeader: false,
  async headers() {
    // El SW siempre debe revalidarse para que las actualizaciones lleguen enseguida
    return [{ source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }] }];
  },
  async rewrites() {
    // Desarrollo: /api/* que no resuelva Next.js (Auth.js vive en /api/auth) se envía a la API NestJS.
    // Producción: lo resuelve Nginx antes de llegar aquí.
    const api = process.env.API_URL_INTERNA ?? 'http://127.0.0.1:4000/api';
    const analitica = process.env.ANALITICA_URL_INTERNA ?? 'http://127.0.0.1:8000';
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [
        { source: '/api/:ruta*', destination: `${api}/:ruta*` },
        { source: '/analitica/:ruta*', destination: `${analitica}/:ruta*` },
      ],
    };
  },
};

export default withSerwist(config);
