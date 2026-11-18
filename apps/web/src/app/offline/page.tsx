import type { Metadata } from 'next';
import { ReintentarConexion } from './reintentar';

export const metadata: Metadata = { title: 'Sin conexión' };
export const dynamic = 'force-static';

/** Respaldo del Service Worker cuando una pantalla no está en caché y no hay red. */
export default function PaginaSinConexion() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-borde bg-panel/80 p-8 text-center">
        <img src="/icono.svg" alt="" className="mx-auto size-12" />
        <h1 className="mt-5 text-xl font-semibold">Estás sin conexión</h1>
        <p className="mt-2 text-sm text-atenuado">
          Esta pantalla todavía no estaba guardada en este equipo. Tus solicitudes y los cambios que hiciste
          siguen guardados y se enviarán al recuperar la conexión.
        </p>
        <ReintentarConexion />
        <div className="mt-4 flex justify-center gap-4 text-sm">
          <a href="/mis-solicitudes" className="text-primario hover:underline">Mis solicitudes</a>
          <a href="/dashboard" className="text-primario hover:underline">Dashboard</a>
        </div>
      </div>
    </main>
  );
}
