import { BarraLateral } from '@/componentes/layout/barra-lateral';
import { BarraSuperior } from '@/componentes/layout/barra-superior';
import { Proveedores } from '@/componentes/layout/proveedores';
import { AvisosEnLinea } from '@/modulos/notificaciones/ui/avisos-en-linea';
import { MODO_DEMO, obtenerUsuarioSesion } from '@/lib/sesion';

export default async function LayoutAplicacion({ children }: { children: React.ReactNode }) {
  const usuario = await obtenerUsuarioSesion();
  return (
    <Proveedores usuario={usuario} modoDemo={MODO_DEMO}>
      <div className="flex min-h-dvh">
        <BarraLateral />
        <div className="flex min-w-0 flex-1 flex-col">
          {MODO_DEMO && (
            <div className="border-b border-amber-500/20 bg-amber-500/10 px-6 py-1.5 text-center text-xs text-amber-200">
              Modo demo: los datos viven solo en este navegador (IndexedDB). Usa “Ver como” para revisar cada rol.
            </div>
          )}
          <BarraSuperior />
          <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
      {/* Avisos modales: gestión → "Recibiste una solicitud nueva"; ingeniero → "Recibiste una nueva asignación" */}
      <AvisosEnLinea />
    </Proveedores>
  );
}
