import { NextResponse } from 'next/server';
import { auth } from '@/auth';

const MODO_DEMO = process.env.NEXT_PUBLIC_MODO_DEMO === 'true';

/** Protege las rutas privadas: sin sesión → /login (en modo demo no se exige sesión). */
export default MODO_DEMO
  ? () => NextResponse.next()
  : auth((req) => {
      if (!req.auth) {
        const url = new URL('/login', req.nextUrl.origin);
        url.searchParams.set('volver', req.nextUrl.pathname);
        return NextResponse.redirect(url);
      }
    });

export const config = {
  matcher: ['/((?!login|api/auth|_next/static|_next/image|manifest.webmanifest|icono.svg|sw.js|favicon.ico).*)'],
};
