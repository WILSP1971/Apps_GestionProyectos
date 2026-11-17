import { Injectable } from '@nestjs/common';
import { Rol } from '../../../compartido/dominio/usuario-actual';
import { db } from '../../../compartido/infraestructura/base-datos';
import { IdentidadExterna } from './verificador-oidc';

export interface PerfilUsuario {
  id: string;
  email: string;
  nombre: string;
  cargo: string | null;
  avatar: string | null;
  departamentoId: string | null;
  departamento: string | null;
  roles: Rol[];
  activo: boolean;
}

const correosAdmin = () =>
  (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

@Injectable()
export class RepositorioUsuarios {
  /** Crea el usuario en su primer inicio de sesión o actualiza sus datos de perfil. */
  async registrarAcceso(ext: IdentidadExterna): Promise<PerfilUsuario> {
    const { rows: [u] } = await db().query(
      `INSERT INTO gestion.usuarios(email, nombre_completo, avatar_url, proveedor_oauth, sujeto_oauth, departamento_id, ultimo_acceso)
       VALUES ($1, $2, $3, $4, $5,
               (SELECT id FROM gestion.departamentos WHERE codigo = $6), now())
       ON CONFLICT (email) DO UPDATE
         SET nombre_completo = EXCLUDED.nombre_completo,
             avatar_url      = coalesce(EXCLUDED.avatar_url, gestion.usuarios.avatar_url),
             ultimo_acceso   = now()
       RETURNING id, (xmax = 0) AS es_nuevo`,
      [ext.email, ext.nombre, ext.avatar ?? null, ext.proveedor, ext.sub, process.env.DEPARTAMENTO_POR_DEFECTO ?? 'TI'],
    );

    if (u.es_nuevo) {
      const roles: Rol[] = correosAdmin().includes(ext.email)
        ? ['SOLICITANTE', 'LIDER', 'DIRECTOR', 'ADMIN']
        : ['SOLICITANTE'];
      await db().query(
        `INSERT INTO gestion.usuario_roles(usuario_id, rol_id)
         SELECT $1, id FROM gestion.roles WHERE codigo = ANY($2::text[]) ON CONFLICT DO NOTHING`,
        [u.id, roles],
      );
    }
    return (await this.porId(u.id))!;
  }

  async porId(id: string): Promise<PerfilUsuario | null> {
    const { rows: [u] } = await db().query(
      `SELECT u.id, u.email, u.nombre_completo AS nombre, u.cargo, u.avatar_url AS avatar,
              u.departamento_id AS "departamentoId", d.nombre AS departamento, u.activo,
              coalesce(array_agg(r.codigo) FILTER (WHERE r.codigo IS NOT NULL), '{}') AS roles
         FROM gestion.usuarios u
         LEFT JOIN gestion.departamentos d ON d.id = u.departamento_id
         LEFT JOIN gestion.usuario_roles ur ON ur.usuario_id = u.id
         LEFT JOIN gestion.roles r ON r.id = ur.rol_id
        WHERE u.id = $1 AND NOT u.eliminado
        GROUP BY u.id, d.nombre`,
      [id],
    );
    return u ?? null;
  }
}
