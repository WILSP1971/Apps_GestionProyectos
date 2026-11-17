import { resolve } from 'node:path';

/**
 * Carga el .env de la raíz del monorepo ANTES de importar el resto de la app
 * (el pool de PostgreSQL lee DATABASE_URL al importarse).
 * En producción PM2 inyecta las variables y este archivo no encuentra nada que cargar.
 */
for (const ruta of [resolve(__dirname, '../../../.env'), resolve(process.cwd(), '.env')]) {
  try {
    process.loadEnvFile(ruta);
    break;
  } catch {
    /* archivo inexistente: se ignora */
  }
}
