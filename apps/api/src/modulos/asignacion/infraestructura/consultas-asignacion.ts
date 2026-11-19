import { Injectable } from '@nestjs/common';
import type { GrupoTrabajo, IngenieroCarga, MiembroEquipo } from '@sierraflow/contratos';
import { db } from '../../../compartido/infraestructura/base-datos';

/** Lecturas para la pantalla de asignación (carga de trabajo, grupos, equipo actual). */
@Injectable()
export class ConsultasAsignacion {
  async ingenieros(): Promise<IngenieroCarga[]> {
    const { rows } = await db().query(
      `SELECT usuario_id AS "usuarioId", nombre_completo AS nombre, avatar_url AS avatar,
              coalesce(grupos, '{}') AS grupos, coalesce(tecnologias, '{}') AS tecnologias,
              solicitudes_activas AS "solicitudesActivas", horas_pendientes::float8 AS "horasPendientes",
              capacidad_semana::float8 AS "capacidadSemana", carga_pct AS "cargaPct"
         FROM gestion.v_carga_ingenieros
        ORDER BY carga_pct, nombre_completo`);
    return rows;
  }

  async grupos(): Promise<GrupoTrabajo[]> {
    const { rows } = await db().query(
      `SELECT g.id, g.nombre, g.descripcion, count(gm.usuario_id)::int AS miembros
         FROM gestion.grupos_trabajo g
         LEFT JOIN gestion.grupo_miembros gm ON gm.grupo_id = g.id
        WHERE g.activo AND NOT g.eliminado
        GROUP BY g.id ORDER BY g.nombre`);
    return rows;
  }

  async equipo(solicitudId: string): Promise<MiembroEquipo[]> {
    const { rows } = await db().query(
      `SELECT a.usuario_id AS "usuarioId", a.grupo_id AS "grupoId",
              coalesce(u.nombre_completo, g.nombre) AS nombre, a.rol_en_solicitud AS rol,
              a.horas_estimadas::float8 AS "horasEstimadas"
         FROM gestion.asignaciones a
         LEFT JOIN gestion.usuarios u ON u.id = a.usuario_id
         LEFT JOIN gestion.grupos_trabajo g ON g.id = a.grupo_id
        WHERE a.solicitud_id = $1 AND a.activa AND NOT a.eliminado
        ORDER BY a.grupo_id NULLS LAST, nombre`, [solicitudId]);
    return rows;
  }
}
