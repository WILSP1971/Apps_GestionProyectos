/**
 * PM2 · procesos Node.js de SierraFlow en el VPS.
 * Lee las variables de /opt/sierraflow/.env (fuera del repositorio) y se las pasa a cada proceso.
 *   pm2 startOrReload deploy/ecosystem.config.cjs --update-env
 */
const fs = require('fs');
const path = require('path');

const ARCHIVO_ENV = process.env.SIERRAFLOW_ENV ?? '/opt/sierraflow/.env';
const RAIZ = path.resolve(__dirname, '..');
const LOGS = '/var/log/sierraflow';

function leerEnv(ruta) {
  const valores = {};
  if (!fs.existsSync(ruta)) return valores;
  for (const linea of fs.readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    valores[m[1]] = v;
  }
  return valores;
}

const env = leerEnv(ARCHIVO_ENV);

module.exports = {
  apps: [
    {
      name: 'sierraflow-web',
      // Versión publicada por desplegar.sh (enlace .releases/web/actual → .releases/web/<fecha>-<commit>)
      cwd: path.join(RAIZ, '.releases/web/actual/apps/web'),
      script: 'server.js',
      env: { ...env, NODE_ENV: 'production', PORT: env.PUERTO_WEB || '3010', HOSTNAME: '127.0.0.1' },
      max_memory_restart: '700M',
      out_file: path.join(LOGS, 'web.log'),
      error_file: path.join(LOGS, 'web-error.log'),
      time: true,
    },
    {
      name: 'sierraflow-api',
      cwd: path.join(RAIZ, 'apps/api'),
      script: 'dist/main.js',
      // Una sola instancia: atiende LISTEN/NOTIFY y SSE (Sprint 4)
      instances: 1,
      env: { ...env, NODE_ENV: 'production' },
      max_memory_restart: '500M',
      out_file: path.join(LOGS, 'api.log'),
      error_file: path.join(LOGS, 'api-error.log'),
      time: true,
    },
  ],
};
