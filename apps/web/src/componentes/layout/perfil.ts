import type { Rol } from '@sierraflow/contratos';

/**
 * Perfil de navegación según los roles del usuario (un usuario puede tener varios; manda el de más alcance):
 *  - GESTION: administrador, director o líder técnico → menú completo.
 *  - INGENIERO: grupo / ingeniero de desarrollo → sus asignaciones, registro de avances y su reporte.
 *  - SOLICITANTE: usuario final → crear y seguir sus solicitudes.
 */
export type Perfil = 'GESTION' | 'INGENIERO' | 'SOLICITANTE';

export function perfilDe(roles: readonly Rol[]): Perfil {
  if (roles.some((r) => r === 'ADMIN' || r === 'DIRECTOR' || r === 'LIDER')) return 'GESTION';
  if (roles.includes('INGENIERO')) return 'INGENIERO';
  return 'SOLICITANTE';
}

/**
 * ¿Crea solicitudes desde el menú y la barra superior? Solo el solicitante: gestión las recibe en la
 * bandeja (y las crea dentro de un proyecto) y el ingeniero trabaja sobre lo asignado.
 */
export const creaSolicitudes = (roles: readonly Rol[]) => perfilDe(roles) === 'SOLICITANTE';

/** Configuración: solo el administrador de la aplicación. */
export const veConfiguracion = (roles: readonly Rol[]) => roles.includes('ADMIN');
