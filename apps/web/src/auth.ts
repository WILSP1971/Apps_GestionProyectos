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

async function llamarApi(ruta: string, cuerpo: unknown) {
  const r = await fetch(`${API}${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`API ${ruta} respondió ${r.status}`);
  return r.json() as Promise<{ accessToken: string; refreshToken: string; expiraEn: number; usuario: PerfilApi }>;
}

/**
 * OAuth 2.0 Authorization Code + PKCE con el IdP (lo gestiona Auth.js).
 * Tras el login se intercambia el id_token por tokens propios de la API.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: proveedores,
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: '/login', error: '/login' },
  callbacks: {
    async jwt({ token, account }) {
      const t = token as typeof token & TokenSesion;
      if (account?.id_token) {
        const d = await llamarApi('/auth/intercambio', { proveedor: account.provider, idToken: account.id_token });
        return { ...t, accessToken: d.accessToken, refreshToken: d.refreshToken, expiraEn: d.expiraEn, usuario: d.usuario, error: undefined };
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
      return { ...session, accessToken: t.accessToken, usuario: t.usuario, error: t.error } as DefaultSession & typeof session;
    },
  },
});
