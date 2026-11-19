'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { toast, Toaster } from 'sonner';
import type { Rol } from '@sierraflow/contratos';
import type { UsuarioSesion } from '@/lib/sesion';
import { prepararBaseLocal, type ConflictoLocal } from '@/lib/offline/db';
import { EVENTO_CONFLICTO, motorSync } from '@/lib/offline/sync/motor-sync';
import { precalentarPaginas } from '@/lib/offline/precalentar';
import { establecerModoDemo } from '@/lib/modo';
import { EVENTO_NOTIFICACION, tiempoReal } from '@/lib/tiempo-real';
import type { EventoNotificacion } from '@sierraflow/contratos';
import { configurarCasosUso } from '@/modulos/solicitudes/aplicacion/casos-uso';
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
    configurarCasosUso({ modoDemo });
    establecerModoDemo(modoDemo);
    let activo = true;

    (async () => {
      // La base local pertenece a un usuario y a un modo: si cambian, se vacía
      await prepararBaseLocal(usuario.id, modoDemo);
      if (!activo) return;
      if (modoDemo) {
        try {
          const guardado = localStorage.getItem('sierraflow.vista');
          if (guardado) setRolesVista(JSON.parse(guardado));
        } catch {
          /* almacenamiento no disponible */
        }
        await sembrarDemoSiVacio(usuario.id, usuario.nombre);
      } else {
        motorSync.iniciar();
        tiempoReal.iniciar(); // SSE: notificaciones y cambios de otros usuarios al instante
      }
      // Deja en caché las pantallas principales para poder abrirlas sin conexión
      precalentarPaginas();
    })().catch(console.error);

    const alConflicto = (e: Event) => {
      const lista = (e as CustomEvent<ConflictoLocal[]>).detail ?? [];
      for (const c of lista) {
        toast.warning(c.motivo === 'conflicto' ? 'Un cambio tuyo no se aplicó' : 'El servidor rechazó un cambio', {
          description: c.mensaje,
          action: { label: 'Ver', onClick: () => location.assign(`/solicitudes/${c.entidadId}`) },
        });
      }
    };
    window.addEventListener(EVENTO_CONFLICTO, alConflicto);

    const alNotificar = (e: Event) => {
      const n = (e as CustomEvent<EventoNotificacion>).detail;
      if (!n) return;
      const mostrar = { EXITO: toast.success, ALERTA: toast.warning, CRITICA: toast.error, INFO: toast.info }[n.severidad] ?? toast;
      mostrar(n.titulo, { description: n.mensaje, action: { label: 'Ver', onClick: () => location.assign(n.enlace) } });
    };
    window.addEventListener(EVENTO_NOTIFICACION, alNotificar);

    return () => {
      activo = false;
      window.removeEventListener(EVENTO_CONFLICTO, alConflicto);
      window.removeEventListener(EVENTO_NOTIFICACION, alNotificar);
      motorSync.detener();
      tiempoReal.detener();
    };
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
