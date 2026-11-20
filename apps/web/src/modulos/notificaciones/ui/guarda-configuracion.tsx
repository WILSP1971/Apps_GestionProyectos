'use client';

import Link from 'next/link';
import { Lock } from 'lucide-react';
import { Vacio } from '@/componentes/ui/primitivos';
import { useUsuario } from '@/componentes/layout/proveedores';
import { veConfiguracion } from '@/componentes/layout/perfil';

/** Configuración: solo el administrador de la aplicación. */
export function GuardaConfiguracion({ children }: { children: React.ReactNode }) {
  const { rolesVista } = useUsuario();
  if (veConfiguracion(rolesVista)) return <>{children}</>;
  return (
    <Vacio icono={<Lock className="size-8" />} titulo="Configuración no disponible para tu rol"
      texto="La configuración la gestiona el administrador de la aplicación. Tus avisos siguen llegando por la campana y en pantalla."
      accion={<Link href="/dashboard" className="text-sm text-primario hover:underline">Volver al dashboard</Link>} />
  );
}
