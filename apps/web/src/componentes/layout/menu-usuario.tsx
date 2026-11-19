'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, Loader2, LogOut, Settings, Users } from 'lucide-react';
import { cerrarSesionAccion } from '@/app/acciones/sesion';
import { olvidarToken } from '@/lib/api';
import { dbLocal, vaciarBaseLocal } from '@/lib/offline/db';
import { motorSync } from '@/lib/offline/sync/motor-sync';
import { desactivarPush } from '@/lib/push';
import { tiempoReal } from '@/lib/tiempo-real';
import { Avatar } from '@/componentes/ui/primitivos';
import { useUsuario } from './proveedores';

const ETIQUETA_ROL: Record<string, string> = {
  SOLICITANTE: 'Solicitante', INGENIERO: 'Ingeniero', LIDER: 'Líder', DIRECTOR: 'Director', ADMIN: 'Administrador',
};

/**
 * Menú del usuario con "Cerrar sesión".
 * Antes de salir: intenta sincronizar, avisa si quedan cambios sin enviar, quita las notificaciones
 * push de este equipo y borra los datos locales (para que otra persona no los vea en un equipo compartido).
 */
export function MenuUsuario() {
  const { usuario, modoDemo } = useUsuario();
  const [abierto, setAbierto] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const [pendientes, setPendientes] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cerrar = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && (setAbierto(false), setPendientes(null));
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, []);

  const salir = async (forzar = false) => {
    if (modoDemo) {
      location.assign('/login');
      return;
    }
    setSaliendo(true);
    try {
      if (!forzar) {
        if (navigator.onLine) await motorSync.sincronizarAhora().catch(() => undefined);
        const quedan = await dbLocal.bandejaSalida.count();
        if (quedan > 0) {
          setPendientes(quedan); // se pide confirmación en el mismo menú
          setSaliendo(false);
          return;
        }
      }
      tiempoReal.detener();
      motorSync.detener();
      await desactivarPush().catch(() => undefined);
      await vaciarBaseLocal();
      olvidarToken();
      await cerrarSesionAccion();
    } catch {
      setSaliendo(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-haspopup="menu"
        className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 transition hover:bg-panel-2"
      >
        <Avatar nombre={usuario.nombre} />
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-sm font-medium">{usuario.nombre}</span>
          <span className="block text-[11px] text-atenuado">{usuario.cargo || usuario.departamento}</span>
        </span>
        <ChevronDown className="hidden size-4 text-atenuado sm:block" />
      </button>

      {abierto && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-borde bg-panel shadow-2xl shadow-black/50">
          <div className="border-b border-borde px-4 py-3">
            <p className="truncate text-sm font-medium">{usuario.nombre}</p>
            <p className="truncate text-xs text-atenuado">{usuario.email}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {usuario.roles.map((r) => (
                <span key={r} className="rounded-md bg-primario/15 px-1.5 py-0.5 text-[10px] font-medium text-teal-200">{ETIQUETA_ROL[r] ?? r}</span>
              ))}
            </div>
          </div>
          <div className="py-1">
            <Link href="/configuracion" role="menuitem" onClick={() => setAbierto(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-sm text-atenuado hover:bg-panel-2 hover:text-texto">
              <Settings className="size-4" /> Configuración
            </Link>
            {usuario.roles.includes('ADMIN') && (
              <Link href="/administracion/usuarios" role="menuitem" onClick={() => setAbierto(false)}
                className="flex items-center gap-2.5 px-4 py-2 text-sm text-atenuado hover:bg-panel-2 hover:text-texto">
                <Users className="size-4" /> Usuarios y equipos
              </Link>
            )}
          </div>
          <div className="border-t border-borde p-2">
            {pendientes ? (
              <div className="space-y-2 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-200">
                <p className="flex items-start gap-1.5">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  Tienes {pendientes} cambio(s) sin sincronizar. Si cierras sesión ahora se perderán.
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setPendientes(null)} className="flex-1 rounded-md border border-borde px-2 py-1.5 text-texto hover:bg-panel-2">Cancelar</button>
                  <button onClick={() => salir(true)} className="flex-1 rounded-md bg-peligro/80 px-2 py-1.5 font-medium text-white hover:bg-peligro">Salir igual</button>
                </div>
              </div>
            ) : (
              <button role="menuitem" onClick={() => salir()} disabled={saliendo}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-60">
                {saliendo ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
                {modoDemo ? 'Salir del modo demo' : 'Cerrar sesión'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
