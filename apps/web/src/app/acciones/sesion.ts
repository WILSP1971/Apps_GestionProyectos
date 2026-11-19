'use server';

import { signOut } from '@/auth';

/**
 * Cierra la sesión de Auth.js (borra la cookie cifrada) y vuelve a /login.
 * El refresh token de la API se revoca en el evento `signOut` de auth.ts.
 */
export async function cerrarSesionAccion() {
  await signOut({ redirectTo: '/login' });
}
