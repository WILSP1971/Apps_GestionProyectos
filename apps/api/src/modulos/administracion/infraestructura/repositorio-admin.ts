import { Injectable } from '@nestjs/common';
import type { CambioUsuario, CatalogosAdmin, UsuarioAdmin } from '@sierraflow/contratos';
import { db } from '../../../compartido/infraestructura/base-datos';

@Injectable()
export class RepositorioAdmin {
  async catalogos(): Promise<CatalogosAdmin> {
    const [roles, departamentos, grupos, tecnologias] = await Promise.all([
      db().query(`SELECT codigo, nombre FROM gestion.roles ORDER BY id`),
      db().query(`SELECT id, codigo, nombre, color_hex AS "colorHex" FROM gestion.departamentos WHERE activo AND NOT eliminado ORDER BY nombre`),
      db().query(`SELECT id, nombre FROM gestion.grupos_trabajo WHERE activo AND NOT eliminado ORDER BY nombre`),
      db().query(`SELECT id, nombre, categoria FROM gestion.tecnologias ORDER BY categoria NULLS LAST, nombre`),
    ]);
    return { roles: roles.rows, departamentos: departamentos.rows, grupos: grupos.rows, tecnologias: tecnologias.rows };
  }

  async usuarios(id?: string): Promise<UsuarioAdmin[]> {
    const { rows } = await db().query(
      `SELECT u.id, u.email, u.nombre_completo AS nombre, u.cargo, u.departamento_id AS "departamentoId", u.activo,
              u.ultimo_acceso AS "ultimoAcceso",
              coalesce((SELECT array_agg(r.codigo ORDER BY r.id) FROM gestion.usuario_roles ur
                          JOIN gestion.roles r ON r.id = ur.rol_id WHERE ur.usuario_id = u.id), '{}') AS roles,
              coalesce((SELECT array_agg(gm.grupo_id) FROM gestion.grupo_miembros gm WHERE gm.usuario_id = u.id), '{}') AS grupos,
              coalesce((SELECT array_agg(ut.tecnologia_id) FROM gestion.usuario_tecnologias ut WHERE ut.usuario_id = u.id), '{}') AS tecnologias,
              coalesce((SELECT max(gm.capacidad_horas_semana) FROM gestion.grupo_miembros gm WHERE gm.usuario_id = u.id), 40)::float8 AS "capacidadHoras"
         FROM gestion.usuarios u
        WHERE NOT u.eliminado AND ($1::uuid IS NULL OR u.id = $1)
        ORDER BY u.activo DESC, u.nombre_completo`, [id ?? null]);
    return rows;
  }

  async contarAdminsActivos(exceptoId: string): Promise<number> {
    const { rows: [r] } = await db().query(
      `SELECT count(*)::int AS n FROM gestion.usuarios u
         JOIN gestion.usuario_roles ur ON ur.usuario_id = u.id
         JOIN gestion.roles r ON r.id = ur.rol_id AND r.codigo = 'ADMIN'
        WHERE u.activo AND NOT u.eliminado AND u.id <> $1`, [exceptoId]);
    return r.n;
  }

  async actualizar(id: string, c: CambioUsuario): Promise<void> {
    if (c.cargo !== undefined || c.departamentoId !== undefined || c.activo !== undefined) {
      await db().query(
        `UPDATE gestion.usuarios
            SET cargo = CASE WHEN $2 THEN $3 ELSE cargo END,
                departamento_id = CASE WHEN $4 THEN $5::uuid ELSE departamento_id END,
                activo = coalesce($6, activo)
          WHERE id = $1`,
        [id, c.cargo !== undefined, c.cargo ?? null, c.departamentoId !== undefined, c.departamentoId ?? null, c.activo ?? null]);
    }
    if (c.roles) {
      await db().query(`DELETE FROM gestion.usuario_roles WHERE usuario_id = $1`, [id]);
      await db().query(
        `INSERT INTO gestion.usuario_roles(usuario_id, rol_id) SELECT $1, r.id FROM gestion.roles r WHERE r.codigo = ANY($2::text[])`,
        [id, c.roles]);
    }
    if (c.grupos) {
      await db().query(`DELETE FROM gestion.grupo_miembros WHERE usuario_id = $1 AND NOT (grupo_id = ANY($2::uuid[]))`, [id, c.grupos]);
      await db().query(
        `INSERT INTO gestion.grupo_miembros(grupo_id, usuario_id, capacidad_horas_semana)
         SELECT g.id, $1, $3 FROM gestion.grupos_trabajo g WHERE g.id = ANY($2::uuid[])
         ON CONFLICT (grupo_id, usuario_id) DO NOTHING`, [id, c.grupos, c.capacidadHoras ?? 40]);
    }
    if (c.capacidadHoras !== undefined) {
      await db().query(`UPDATE gestion.grupo_miembros SET capacidad_horas_semana = $2 WHERE usuario_id = $1`, [id, c.capacidadHoras]);
    }
    if (c.tecnologias) {
      await db().query(`DELETE FROM gestion.usuario_tecnologias WHERE usuario_id = $1 AND NOT (tecnologia_id = ANY($2::smallint[]))`, [id, c.tecnologias]);
      await db().query(
        `INSERT INTO gestion.usuario_tecnologias(usuario_id, tecnologia_id)
         SELECT $1, t.id FROM gestion.tecnologias t WHERE t.id = ANY($2::smallint[]) ON CONFLICT DO NOTHING`, [id, c.tecnologias]);
    }
  }
}
