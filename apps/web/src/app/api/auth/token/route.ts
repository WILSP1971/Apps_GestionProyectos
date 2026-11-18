import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

/**
 * Entrega al navegador el access token de la API guardado en la sesión cifrada (cookie httpOnly).
 * Auth.js lo renueva con el refresh token cuando está por expirar.
 * Ruta más específica que /api/auth/[...nextauth], por eso Next.js la atiende aquí.
 */
export async function GET() {
  const sesion = await auth();
  if (!sesion?.accessToken || sesion.error) {
    return Response.json({ mensaje: 'Sin sesión' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  return Response.json(
    { accessToken: sesion.accessToken, expiraEn: sesion.expiraEn ?? Date.now() + 60_000 },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
