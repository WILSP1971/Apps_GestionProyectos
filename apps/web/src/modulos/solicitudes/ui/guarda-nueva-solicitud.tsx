'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FolderKanban, Inbox } from 'lucide-react';
import { Vacio } from '@/componentes/ui/primitivos';
import { useUsuario } from '@/componentes/layout/proveedores';
import { perfilDe } from '@/componentes/layout/perfil';

/**
 * Quién crea solicitudes:
 *  - el solicitante, siempre;
 *  - gestión (administrador, director, líder) solo dentro de un proyecto (Proyecto → Solicitudes);
 *  - el ingeniero no: trabaja sobre lo que le asignan.
 */
export function GuardaNuevaSolicitud({ children }: { children: React.ReactNode }) {
  const { rolesVista } = useUsuario();
  const params = useSearchParams();
  const perfil = perfilDe(rolesVista);
  if (perfil === 'SOLICITANTE' || (perfil === 'GESTION' && params.get('proyecto'))) return <>{children}</>;
  if (perfil === 'GESTION') {
    return (
      <Vacio icono={<Inbox className="size-8" />} titulo="Las solicitudes las crean los usuarios solicitantes"
        texto="Como administrador, director o líder las recibes en la bandeja. Si necesitas registrar un requerimiento dentro de un proyecto, hazlo desde Proyecto → Solicitudes → Nueva solicitud en este proyecto."
        accion={<div className="flex gap-4 text-sm"><Link href="/solicitudes" className="text-primario hover:underline">Ir a la bandeja</Link>
          <Link href="/proyectos" className="inline-flex items-center gap-1 text-primario hover:underline"><FolderKanban className="size-4" />Ir a proyectos</Link></div>} />
    );
  }
  return (
    <Vacio icono={<Inbox className="size-8" />} titulo="Tu rol no crea solicitudes"
      texto="Como ingeniero de desarrollo trabajas sobre las solicitudes y proyectos que te asignan."
      accion={<Link href="/mis-asignaciones" className="text-sm text-primario hover:underline">Ver mis asignaciones</Link>} />
  );
}
