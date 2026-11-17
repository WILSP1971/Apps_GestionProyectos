import { redirect } from 'next/navigation';
import type { Rol } from '@sierraflow/contratos';
import { auth } from '@/auth';

export interface UsuarioSesion {
  id: string;
  nombre: string;
  email: string;
  cargo: string;
  departamento: string;
  avatar?: string | null;
  roles: Rol[];
}

export const MODO_DEMO = process.env.NEXT_PUBLIC_MODO_DEMO === 'true';

export const USUARIO_DEMO: UsuarioSesion = {
  id: '11111111-0000-4000-8000-000000000001',
  nombre: 'Ana Gómez',
  email: 'ana.gomez@sierrainnova.tech',
  cargo: 'Directora de Proyecto',
  departamento: 'Desarrollo y TI',
  roles: ['SOLICITANTE', 'INGENIERO', 'LIDER', 'DIRECTOR'],
};

/** Usuario autenticado (o el usuario demo). Redirige a /login si no hay sesión. */
export async function obtenerUsuarioSesion(): Promise<UsuarioSesion> {
  if (MODO_DEMO) return USUARIO_DEMO;
  const sesion = await auth();
  if (!sesion?.usuario || sesion.error) redirect('/login');
  const u = sesion.usuario;
  return {
    id: u.id,
    nombre: u.nombre,
    email: u.email,
    cargo: u.cargo ?? '',
    departamento: u.departamento ?? '',
    avatar: u.avatar,
    roles: u.roles,
  };
}
