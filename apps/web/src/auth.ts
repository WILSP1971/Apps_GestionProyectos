import NextAuth, { type DefaultSession } from 'next-auth';
import type { Provider } from 'next-auth/providers';
import Google from 'next-auth/providers/google';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
import type { Rol } from '@sierraflow/contratos';

/** Perfil devuelto por POST /api/auth/intercambio de la API */
export interface PerfilApi {
  id: string;
  email: string;
  nombre: string;
  cargo: string | null;
  avatar: string | null;
  departamento: string | null;
  roles: Rol[];
}

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    expiraEn?: number;
    usuario?: PerfilApi;
    error?: string;
  }
}

const API = process.env.API_URL_INTERNA ?? 'http://127.0.0.1:4000/api';

const proveedores: Provider[] = [];
if (process.env.AUTH_GOOGLE_ID) proveedores.push(Google({ authorization: { params: { prompt: 'select_account' } } }));
if (process.env.AUTH_MICROSOFT_ENTRA_ID_ID) {
  proveedores.push(MicrosoftEntraID({ issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER }));
}
export const PROVEEDORES_ACTIVOS = proveedores.map((p) => (typeof p === 'function' ? p() : p)).map((p) => ({ id: p.id, nombre: p.name }));

interface TokenSesion {
  accessToken?: string;
  refreshToken?: string;
  expiraEn?: number;
  usuario?: PerfilApi;
  error?: string;
}

type RespuestaSesion = { accessToken: string; refreshToken: string; expiraEn: number; usuario: PerfilApi };

async function llamarApi(ruta: string, cuerpo: unknown): Promise<RespuestaSesion> {
  let r: Response;
  try {
    r = await fetch(`${API}${ruta}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
      cache: 'no-store',
    });
  } catch (e) {
    console.error(`[auth] No se pudo contactar la API en ${API}${ruta}:`, e);
    throw new Error('No se pudo contactar el servidor de la aplicación (API)');
  }
  if (!r.ok) {
    const c = (await r.json().catch(() => null)) as { message?: string | string[]; mensaje?: string } | null;
    const motivo = c?.mensaje ?? (Array.isArray(c?.message) ? c?.message.join(', ') : c?.message) ?? `La API respondió ${r.status}`;
    console.error(`[auth] ${ruta} → ${r.status}: ${motivo}`);
    throw new Error(motivo);
  }
  return (await r.json()) as RespuestaSesion;
}

/**
 * OAuth 2.0 Authorization Code + PKCE con el IdP (lo gestiona Auth.js).
 * Tras el login se intercambia el id_token por tokens propios de la API.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: proveedores,
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: '/login', error: '/login' },
  events: {
    // Al cerrar sesión se revoca el refresh token en la API (toda su familia de sesiones)
    async signOut(mensaje) {
      const token = 'token' in mensaje ? (mensaje.token as TokenSesion | null) : null;
      if (!token?.refreshToken) return;
      await fetch(`${API}/auth/cerrar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: token.refreshToken }),
        cache: 'no-store',
      }).catch(() => undefined);
    },
  },
  callbacks: {
    /**
     * Tras el login en Google/Microsoft se intercambia el id_token con la API.
     * Si la API rechaza la cuenta, se vuelve a /login mostrando el motivo (en vez de un error genérico).
     */
    async signIn({ account }) {
      if (!account?.id_token) return `/login?error=AccessDenied&motivo=${encodeURIComponent('El proveedor no entregó el id_token')}`;
      try {
        const d = await llamarApi('/auth/intercambio', { proveedor: account.provider, idToken: account.id_token });
        (account as typeof account & { sierraflow?: RespuestaSesion }).sierraflow = d; // lo recoge el callback jwt
        return true;
      } catch (e) {
        return `/login?error=AccessDenied&motivo=${encodeURIComponent((e as Error).message)}`;
      }
    },
    async jwt({ token, account }) {
      const t = token as typeof token & TokenSesion;
      const d0 = (account as (typeof account & { sierraflow?: RespuestaSesion }) | null | undefined)?.sierraflow;
      if (d0) {
        return { ...t, accessToken: d0.accessToken, refreshToken: d0.refreshToken, expiraEn: d0.expiraEn, usuario: d0.usuario, error: undefined };
      }
      if (t.expiraEn && Date.now() < t.expiraEn - 60_000) return t;
      if (!t.refreshToken) return t;
      try {
        const d = await llamarApi('/auth/refrescar', { refreshToken: t.refreshToken });
        return { ...t, accessToken: d.accessToken, refreshToken: d.refreshToken, expiraEn: d.expiraEn, usuario: d.usuario, error: undefined };
      } catch {
        return { ...t, error: 'RefreshInvalido' };
      }
    },
    async session({ session, token }) {
      const t = token as typeof token & TokenSesion;
      return { ...session, accessToken: t.accessToken, expiraEn: t.expiraEn, usuario: t.usuario, error: t.error } as DefaultSession & typeof session;
    },
  },
});
