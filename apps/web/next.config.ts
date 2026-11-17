import type { NextConfig } from 'next';
import { resolve } from 'node:path';

// Usa también el .env de la raíz del monorepo (Next ya carga apps/web/.env.local si existe)
try {
  process.loadEnvFile(resolve(process.cwd(), '../../.env'));
} catch {
  /* sin .env en la raíz */
}

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: resolve(process.cwd(), '../../'),
  reactStrictMode: true,
  transpilePackages: ['@sierraflow/contratos'],
  poweredByHeader: false,
  async rewrites() {
    // Desarrollo: /api/* que no resuelva Next.js (Auth.js vive en /api/auth) se envía a la API NestJS.
    // Producción: lo resuelve Nginx antes de llegar aquí.
    const api = process.env.API_URL_INTERNA ?? 'http://127.0.0.1:4000/api';
    return { beforeFiles: [], afterFiles: [], fallback: [{ source: '/api/:ruta*', destination: `${api}/:ruta*` }] };
  },
};

export default config;
