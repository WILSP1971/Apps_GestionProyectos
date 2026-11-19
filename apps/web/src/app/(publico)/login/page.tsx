import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { PROVEEDORES_ACTIVOS, signIn } from '@/auth';
import { MODO_DEMO } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Iniciar sesión' };

const ICONOS: Record<string, React.ReactNode> = {
  google: (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden><path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.8-5.4 3.8-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.8 0 3.1.8 3.8 1.4l2.6-2.5C16.8 3.3 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" /></svg>
  ),
  'microsoft-entra-id': (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden><path fill="#F25022" d="M2 2h9.5v9.5H2z" /><path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" /><path fill="#00A4EF" d="M2 12.5h9.5V22H2z" /><path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" /></svg>
  ),
};

export default async function PaginaLogin({ searchParams }: { searchParams: Promise<{ volver?: string; error?: string; motivo?: string }> }) {
  const { volver = '/dashboard', error, motivo } = await searchParams;
  const destino = volver.startsWith('/') && !volver.startsWith('//') ? volver : '/dashboard';

  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-borde bg-panel/60 p-12 lg:flex">
        <div className="flex items-center gap-2.5">
          <img src="/icono.svg" alt="" className="size-9" />
          <span className="text-xl font-semibold">Sierra<span className="text-primario">Flow</span></span>
        </div>
        <div>
          <h1 className="max-w-md text-4xl font-semibold leading-tight tracking-tight">
            Del requerimiento a la entrega, <span className="text-primario">con trazabilidad total.</span>
          </h1>
          <p className="mt-4 max-w-md text-atenuado">
            Crea solicitudes, sigue su avance en tiempo real y recibe alertas en cada cambio de estado — incluso sin conexión.
          </p>
        </div>
        <p className="text-xs text-atenuado">© {new Date().getFullYear()} Sierra Innova · sierrainnova.tech</p>
        <div className="pointer-events-none absolute -bottom-40 -right-40 size-[480px] rounded-full bg-primario/10 blur-3xl" />
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold tracking-tight">Iniciar sesión</h2>
          <p className="mt-1 text-sm text-atenuado">Usa tu cuenta corporativa.</p>

          {error && (
            <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              <p>{error === 'AccessDenied' ? 'Tu cuenta no fue autorizada.' : 'No fue posible iniciar sesión.'}</p>
              {motivo && <p className="mt-1 text-xs text-red-200">Motivo: {motivo.slice(0, 200)}</p>}
              {!motivo && error === 'Configuration' && (
                <p className="mt-1 text-xs text-red-200">Error de configuración del servidor. Revisa los registros: pm2 logs sierraflow-web</p>
              )}
            </div>
          )}

          <div className="mt-6 space-y-3">
            {PROVEEDORES_ACTIVOS.map((p) => (
              <form key={p.id} action={async () => { 'use server'; await signIn(p.id, { redirectTo: destino }); }}>
                <button className="flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-borde-fuerte bg-panel-2 text-sm font-medium transition hover:border-primario/60">
                  {ICONOS[p.id]} Continuar con {p.nombre}
                </button>
              </form>
            ))}

            {PROVEEDORES_ACTIVOS.length === 0 && !MODO_DEMO && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                No hay proveedores OAuth configurados. Define AUTH_GOOGLE_ID o AUTH_MICROSOFT_ENTRA_ID_ID en el .env.
              </p>
            )}

            {MODO_DEMO && (
              <form action={async () => { 'use server'; redirect(destino); }}>
                <button className="h-11 w-full rounded-lg bg-primario text-sm font-medium text-slate-950 transition hover:bg-primario-hover">
                  Entrar en modo demo
                </button>
              </form>
            )}
          </div>

          <p className="mt-8 flex items-center gap-2 text-xs text-atenuado">
            <ShieldCheck className="size-4 text-primario" /> Autenticación OAuth 2.0 / OpenID Connect. No almacenamos tu contraseña.
          </p>
          <p className="mt-2 text-xs text-atenuado"><Link href="/ayuda" className="hover:text-texto">¿Necesitas ayuda?</Link></p>
        </div>
      </section>
    </main>
  );
}
