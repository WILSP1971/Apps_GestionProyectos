/**
 * Verificación del entorno al arrancar: la API no inicia si falta configuración indispensable
 * (mejor un error claro en `pm2 logs` que fallas raras después) y advierte lo inseguro.
 */
export function validarEntorno(env: Record<string, string | undefined>): { errores: string[]; avisos: string[] } {
  const errores: string[] = [];
  const avisos: string[] = [];
  const produccion = env.NODE_ENV === 'production';

  for (const v of ['DATABASE_URL', 'JWT_CLAVE_PRIVADA', 'JWT_CLAVE_PUBLICA']) if (!env[v]) errores.push(`Falta ${v}`);
  if (!env.AUTH_GOOGLE_ID && !env.AUTH_MICROSOFT_ENTRA_ID_ID) avisos.push('No hay proveedor OAuth configurado (AUTH_GOOGLE_ID o AUTH_MICROSOFT_ENTRA_ID_ID)');

  if (produccion) {
    if (!env.WEB_URL) errores.push('Falta WEB_URL (origen permitido para CORS)');
    else if (!env.WEB_URL.startsWith('https://')) avisos.push('WEB_URL debería usar https:// en producción');
    if (env.DATABASE_URL && /:\/\/[^:]+:(postgres|password|123456|cambiar)@/i.test(env.DATABASE_URL)) {
      avisos.push('La contraseña de DATABASE_URL es insegura: cámbiela');
    }
    if (env.JWT_CLAVE_PRIVADA && !env.JWT_CLAVE_PRIVADA.includes('PRIVATE KEY')) errores.push('JWT_CLAVE_PRIVADA no parece una clave PEM');
    if (!env.VAPID_PUBLICA || !env.VAPID_PRIVADA) avisos.push('Sin claves VAPID: no habrá notificaciones push');
  }
  return { errores, avisos };
}
