'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3, ClipboardCheck, ClipboardList, FilePlus2, FolderKanban, HelpCircle, Inbox, LayoutDashboard, ListChecks, Settings,
  UserCog, UsersRound, Workflow,
} from 'lucide-react';
import type { Rol } from '@sierraflow/contratos';
import { cn } from '@/lib/utils';
import { useUsuario } from './proveedores';
import { perfilDe, type Perfil } from './perfil';

interface Item { href: string; etiqueta: string; icono: React.ElementType; roles?: Rol[] }
type Seccion = { titulo?: string; items: Item[] };

const CUENTA: Seccion = {
  titulo: 'Cuenta',
  items: [
    { href: '/administracion/usuarios', etiqueta: 'Usuarios y equipos', icono: UserCog, roles: ['ADMIN'] },
    { href: '/configuracion', etiqueta: 'Configuración', icono: Settings },
    { href: '/ayuda', etiqueta: 'Ayuda', icono: HelpCircle },
  ],
};

/** Menú de cada perfil. Gestión sigue el orden de trabajo: proyecto → solicitudes → equipo y tareas → análisis. */
const MENUS: Record<Perfil, Seccion[]> = {
  SOLICITANTE: [
    {
      items: [
        { href: '/dashboard', etiqueta: 'Dashboard', icono: LayoutDashboard },
        { href: '/solicitudes/nueva', etiqueta: 'Nueva solicitud', icono: FilePlus2 },
        { href: '/mis-solicitudes', etiqueta: 'Mis solicitudes', icono: ClipboardList },
      ],
    },
    CUENTA,
  ],
  INGENIERO: [
    {
      items: [
        { href: '/dashboard', etiqueta: 'Dashboard', icono: LayoutDashboard },
        { href: '/mis-asignaciones', etiqueta: 'Mis solicitudes y proyectos', icono: ClipboardList },
        { href: '/avances', etiqueta: 'Registrar avances', icono: ListChecks },
        { href: '/reportes', etiqueta: 'Reportes', icono: BarChart3 },
      ],
    },
    CUENTA,
  ],
  GESTION: [
    { items: [{ href: '/dashboard', etiqueta: 'Dashboard', icono: LayoutDashboard }] },
    {
      titulo: 'Proyectos',
      items: [{ href: '/proyectos', etiqueta: 'Proyectos', icono: FolderKanban }],
    },
    {
      titulo: 'Solicitudes',
      items: [
        { href: '/solicitudes/nueva', etiqueta: 'Nueva solicitud', icono: FilePlus2 },
        { href: '/mis-solicitudes', etiqueta: 'Mis solicitudes', icono: ClipboardList },
        { href: '/solicitudes', etiqueta: 'Bandeja de solicitudes', icono: Inbox },
      ],
    },
    {
      titulo: 'Gestión',
      items: [
        { href: '/gestion/asignacion', etiqueta: 'Asignación', icono: UsersRound },
        { href: '/gestion/kanban', etiqueta: 'Kanban', icono: Workflow },
        { href: '/gestion/evaluacion', etiqueta: 'Evaluación y tareas', icono: ClipboardCheck },
      ],
    },
    { titulo: 'Análisis', items: [{ href: '/reportes', etiqueta: 'Reportes', icono: BarChart3 }] },
    CUENTA,
  ],
};

export function BarraLateral() {
  const ruta = usePathname();
  const { rolesVista } = useUsuario();
  const secciones = MENUS[perfilDe(rolesVista)];
  const activo = (href: string) =>
    href === '/solicitudes' ? ruta === '/solicitudes' : ruta === href || (ruta.startsWith(href + '/') && href !== '/solicitudes/nueva');

  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-borde bg-panel/60 backdrop-blur lg:flex">
      <Link href="/dashboard" className="flex items-center gap-2.5 px-5 py-5">
        <img src="/icono.svg" alt="" className="size-8" />
        <span className="text-lg font-semibold tracking-tight">
          Sierra<span className="text-primario">Flow</span>
        </span>
      </Link>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-6" aria-label="Navegación principal">
        {secciones.map((sec, i) => {
          const visibles = sec.items.filter((it) => !it.roles || it.roles.some((r) => rolesVista.includes(r)));
          if (!visibles.length) return null;
          return (
            <div key={i}>
              {sec.titulo && <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-atenuado/70">{sec.titulo}</p>}
              <ul className="space-y-1">
                {visibles.map(({ href, etiqueta, icono: Icono }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={activo(href) ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition',
                        activo(href)
                          ? 'bg-primario/15 font-medium text-teal-200 shadow-[inset_2px_0_0_var(--color-primario)]'
                          : 'text-atenuado hover:bg-panel-2 hover:text-texto',
                      )}
                    >
                      <Icono className="size-4" />
                      {etiqueta}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
      <p className="border-t border-borde px-5 py-3 text-[11px] text-atenuado/70">Sierra Innova · v0.1</p>
    </aside>
  );
}
