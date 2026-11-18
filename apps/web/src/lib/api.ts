/**
 * Cliente HTTP de la API NestJS desde el navegador.
 * El access token (JWT de 15 min) se obtiene de /api/auth/token, que lo lee de la sesión
 * cifrada de Auth.js en el servidor (y la renueva con el refresh token cuando expira).
 */
export class ErrorSesion extends Error {
  constructor(mensaje = 'La sesión expiró; inicia sesión de nuevo') {
    super(mensaje);
    this.name = 'ErrorSesion';
  }
}

export class ErrorApi extends Error {
  constructor(public readonly status: number, public readonly cuerpo: { codigo?: string; mensaje?: string } | null) {
    super(cuerpo?.mensaje ?? `La API respondió ${status}`);
    this.name = 'ErrorApi';
  }
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api';
let cacheToken: { token: string; expira: number } | null = null;
let enVuelo: Promise<string> | null = null;

async function obtenerToken(forzar = false): Promise<string> {
  if (!forzar && cacheToken && Date.now() < cacheToken.expira - 30_000) return cacheToken.token;
  // Una sola petición de token a la vez, aunque haya varias llamadas concurrentes
  enVuelo ??= (async () => {
    try {
      const r = await fetch('/api/auth/token', { cache: 'no-store', credentials: 'same-origin' });
      if (r.status === 401) throw new ErrorSesion();
      if (!r.ok) throw new ErrorApi(r.status, null);
      const d = (await r.json()) as { accessToken: string; expiraEn: number };
      cacheToken = { token: d.accessToken, expira: d.expiraEn };
      return d.accessToken;
    } finally {
      enVuelo = null;
    }
  })();
  return enVuelo;
}

export function olvidarToken() {
  cacheToken = null;
}

export async function apiFetch<T>(ruta: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const llamar = (token: string) =>
    fetch(`${BASE}${ruta}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
      signal: init.signal,
    });

  let r = await llamar(await obtenerToken());
  if (r.status === 401) {
    r = await llamar(await obtenerToken(true));
    if (r.status === 401) throw new ErrorSesion();
  }
  if (!r.ok) throw new ErrorApi(r.status, await r.json().catch(() => null));
  return r.status === 204 ? (undefined as T) : ((await r.json()) as T);
}
