import { Injectable, UnauthorizedException } from '@nestjs/common';
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
    // SOLO_USUARIOS_REGISTRADOS=true: solo entran los correos que un administrador agregó (y ADMIN_EMAILS)
    if (process.env.SOLO_USUARIOS_REGISTRADOS === 'true' && !correosAdmin().includes(ext.email)) {
      const { rowCount } = await db().query(`SELECT 1 FROM gestion.usuarios WHERE email = $1 AND NOT eliminado`, [ext.email]);
      if (!rowCount) throw new UnauthorizedException('Tu correo no está registrado en SierraFlow. Pide acceso al administrador.');
    }
    const { rows: [u] } = await db().query(
      `INSERT INTO gestion.usuarios(email, nombre_completo, avatar_url, proveedor_oauth, sujeto_oauth, departamento_id, ultimo_acceso)
       VALUES ($1, $2, $3, $4, $5,
               (SELECT id FROM gestion.departamentos WHERE codigo = $6), now())
       ON CONFLICT (email) DO UPDATE
         SET nombre_completo = EXCLUDED.nombre_completo,
             -- Usuario agregado por un administrador: en su primer acceso se vincula a la cuenta real
             proveedor_oauth = CASE WHEN gestion.usuarios.proveedor_oauth = 'invitado' THEN EXCLUDED.proveedor_oauth ELSE gestion.usuarios.proveedor_oauth END,
             sujeto_oauth    = CASE WHEN gestion.usuarios.proveedor_oauth = 'invitado' THEN EXCLUDED.sujeto_oauth ELSE gestion.usuarios.sujeto_oauth END,
             avatar_url      = coalesce(EXCLUDED.avatar_url, gestion.usuarios.avatar_url),
             ultimo_acceso   = now()
       RETURNING id, (xmax = 0) AS es_nuevo`,
      [ext.email, ext.nombre, ext.avatar ?? null, ext.proveedor, ext.sub, process.env.DEPARTAMENTO_POR_DEFECTO ?? 'TI'],
    );

    if (u.es_nuevo && correosAdmin().includes(ext.email)) {
      await db().query(
        `INSERT INTO gestion.usuario_roles(usuario_id, rol_id)
         SELECT $1, id FROM gestion.roles WHERE codigo = ANY($2::text[]) ON CONFLICT DO NOTHING`,
        [u.id, ['LIDER', 'DIRECTOR', 'ADMIN'] satisfies Rol[]],
      );
    }
    await this.validarRol(u.id);
    return (await this.porId(u.id))!;
  }

  /**
   * Validación del rol en cada inicio de sesión (misma regla que normalizarRoles de contratos):
   *  - quien está registrado como ingeniero, líder, director o administrador NO es solicitante;
   *  - cualquier otro correo (sin rol de equipo) queda como SOLICITANTE.
   */
  private async validarRol(usuarioId: string) {
    await db().query(
      `DELETE FROM gestion.usuario_roles ur USING gestion.roles r
        WHERE ur.rol_id = r.id AND r.codigo = 'SOLICITANTE' AND ur.usuario_id = $1
          AND EXISTS (SELECT 1 FROM gestion.usuario_roles ur2 JOIN gestion.roles r2 ON r2.id = ur2.rol_id
                       WHERE ur2.usuario_id = $1 AND r2.codigo IN ('INGENIERO', 'LIDER', 'DIRECTOR', 'ADMIN'))`, [usuarioId]);
    await db().query(
      `INSERT INTO gestion.usuario_roles(usuario_id, rol_id)
       SELECT $1, r.id FROM gestion.roles r
        WHERE r.codigo = 'SOLICITANTE'
          AND NOT EXISTS (SELECT 1 FROM gestion.usuario_roles ur JOIN gestion.roles r2 ON r2.id = ur.rol_id
                           WHERE ur.usuario_id = $1 AND r2.codigo IN ('INGENIERO', 'LIDER', 'DIRECTOR', 'ADMIN'))
       ON CONFLICT DO NOTHING`, [usuarioId]);
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
