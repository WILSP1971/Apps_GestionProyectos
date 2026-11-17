'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Toaster } from 'sonner';
import type { Rol } from '@sierraflow/contratos';
import type { UsuarioSesion } from '@/lib/sesion';
import { sembrarDemoSiVacio } from '@/modulos/solicitudes/infraestructura/datos-demo';

interface ContextoUsuario {
  usuario: UsuarioSesion;
  modoDemo: boolean;
  /** Solo en modo demo: permite revisar la app con la vista de cada rol */
  rolesVista: Rol[];
  cambiarVista: (roles: Rol[]) => void;
}

const Contexto = createContext<ContextoUsuario | null>(null);

export const useUsuario = () => {
  const c = useContext(Contexto);
  if (!c) throw new Error('useUsuario debe usarse dentro de <Proveedores>');
  return c;
};

/** Actor para los casos de uso, con los roles de la vista activa */
export const useActor = () => {
  const { usuario, rolesVista } = useUsuario();
  return useMemo(
    () => ({ id: usuario.id, nombre: usuario.nombre, departamento: usuario.departamento, roles: rolesVista }),
    [usuario, rolesVista],
  );
};

export function Proveedores({ usuario, modoDemo, children }: { usuario: UsuarioSesion; modoDemo: boolean; children: React.ReactNode }) {
  const [rolesVista, setRolesVista] = useState<Rol[]>(usuario.roles);

  useEffect(() => {
    if (!modoDemo) return;
    try {
      const guardado = localStorage.getItem('sierraflow.vista');
      if (guardado) setRolesVista(JSON.parse(guardado));
    } catch {
      /* almacenamiento no disponible */
    }
    sembrarDemoSiVacio(usuario.id, usuario.nombre).catch(console.error);
  }, [modoDemo, usuario.id, usuario.nombre]);

  const valor = useMemo<ContextoUsuario>(() => ({
    usuario,
    modoDemo,
    rolesVista,
    cambiarVista: (roles) => {
      setRolesVista(roles);
      try { localStorage.setItem('sierraflow.vista', JSON.stringify(roles)); } catch { /* ignorar */ }
    },
  }), [usuario, modoDemo, rolesVista]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      <Toaster theme="dark" position="bottom-right" richColors closeButton />
    </Contexto.Provider>
  );
}
