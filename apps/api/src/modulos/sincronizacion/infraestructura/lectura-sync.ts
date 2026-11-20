import { Injectable } from '@nestjs/common';
import type { ComentarioSync, CursoresSync, NotificacionSync, RespuestaPull, SolicitudSync } from '@sierraflow/contratos';
import { UsuarioActual } from '../../../compartido/dominio/usuario-actual';
import { db } from '../../../compartido/infraestructura/base-datos';

const verTodo = (u: UsuarioActual) => u.roles.some((r) => ['LIDER', 'DIRECTOR', 'ADMIN'].includes(r));

/**
 * Proyección de una solicitud en la forma que guarda el cliente (IndexedDB).
 * seq = máximo seq_cambio entre la solicitud, sus criterios y sus asignaciones:
 * así un cambio en cualquiera de ellos hace que la solicitud vuelva a bajar en el pull.
 * Parámetros fijos: $1 = usuario, $2 = puede ver todo.
 */
const SELECT_SOLICITUD = `
SELECT s.id, s.codigo, s.titulo, s.descripcion,
       coalesce(s.objetivos, '') AS objetivos, coalesce(s.justificacion, '') AS justificacion,
       s.tipo, s.prioridad, s.estado, s.avance_pct::float8 AS "avancePct",
       d.nombre AS departamento, d.color_hex AS "departamentoColor", s.solicitante_id AS "solicitanteId", u.nombre_completo AS "solicitanteNombre",
       to_char(s.fecha_deseada, 'YYYY-MM-DD') AS "fechaDeseada",
       s.proyecto_id AS "proyectoId", pr.codigo AS "proyectoCodigo", pr.nombre AS "proyectoNombre",
       s.version, s.creado_en AS "creadoEn", s.actualizado_en AS "actualizadoEn", s.eliminado,
       coalesce((SELECT array_agg(t.nombre ORDER BY t.nombre)
                   FROM gestion.solicitud_tecnologias st JOIN gestion.tecnologias t ON t.id = st.tecnologia_id
                  WHERE st.solicitud_id = s.id), '{}') AS tecnologias,
       coalesce((SELECT json_agg(json_build_object('id', c.id, 'orden', c.orden, 'descripcion', c.descripcion,
                                                   'cumplido', c.cumplido) ORDER BY c.orden)
                   FROM gestion.criterios_aceptacion c
                  WHERE c.solicitud_id = s.id AND NOT c.eliminado), '[]') AS criterios,
       coalesce((SELECT json_agg(json_build_object('estadoAnterior', h.estado_anterior, 'estadoNuevo', h.estado_nuevo,
                                                   'usuario', coalesce(uh.nombre_completo, 'Sistema'),
                                                   'comentario', h.comentario, 'fecha', h.fecha) ORDER BY h.fecha, h.id)
                   FROM gestion.historial_estados h LEFT JOIN gestion.usuarios uh ON uh.id = h.usuario_id
                  WHERE h.solicitud_id = s.id), '[]') AS historial,
       coalesce((SELECT json_agg(json_build_object('usuarioId', a.usuario_id, 'rol', a.rol_en_solicitud,
                                                   'nombre', coalesce(ua.nombre_completo, g.nombre),
                                                   'grupo', coalesce(g.nombre,
                                                     (SELECT min(gu.nombre) FROM gestion.grupo_miembros gm
                                                        JOIN gestion.grupos_trabajo gu ON gu.id = gm.grupo_id
                                                       WHERE gm.usuario_id = a.usuario_id),
                                                     a.rol_en_solicitud)))
                   FROM gestion.asignaciones a
                   LEFT JOIN gestion.usuarios ua ON ua.id = a.usuario_id
                   LEFT JOIN gestion.grupos_trabajo g ON g.id = a.grupo_id
                  WHERE a.solicitud_id = s.id AND a.activa AND NOT a.eliminado), '[]') AS asignados,
       sc.seq::float8 AS seq
  FROM gestion.solicitudes s
  JOIN gestion.departamentos d ON d.id = s.departamento_id
  JOIN gestion.usuarios u ON u.id = s.solicitante_id
  LEFT JOIN gestion.proyectos pr ON pr.id = s.proyecto_id
  CROSS JOIN LATERAL (
    SELECT greatest(s.seq_cambio,
                    coalesce((SELECT max(c.seq_cambio) FROM gestion.criterios_aceptacion c WHERE c.solicitud_id = s.id), 0),
                    coalesce((SELECT max(a.seq_cambio) FROM gestion.asignaciones a WHERE a.solicitud_id = s.id), 0)) AS seq
  ) sc
 WHERE ($2 OR s.solicitante_id = $1
        OR EXISTS (SELECT 1 FROM gestion.asignaciones a WHERE a.solicitud_id = s.id AND a.usuario_id = $1 AND a.activa))`;

@Injectable()
export class LecturaSync {
  async solicitudesPorIds(ids: string[], u: UsuarioActual): Promise<SolicitudSync[]> {
    if (!ids.length) return [];
    const { rows } = await db().query(`${SELECT_SOLICITUD} AND s.id = ANY($3::uuid[])`, [u.id, verTodo(u), ids]);
    return rows;
  }

  async pull(cursores: CursoresSync, limite: number, u: UsuarioActual): Promise<RespuestaPull> {
    const [sol, com, not] = await Promise.all([
      db().query<SolicitudSync>(`${SELECT_SOLICITUD} AND sc.seq > $3 ORDER BY sc.seq LIMIT $4`,
        [u.id, verTodo(u), cursores.solicitudes, limite]),
      db().query<ComentarioSync>(
        `SELECT c.id, c.solicitud_id AS "solicitudId", au.nombre_completo AS autor, c.contenido,
                c.creado_en AS "creadoEn", c.eliminado, c.seq_cambio::float8 AS seq
           FROM gestion.comentarios c
           JOIN gestion.usuarios au ON au.id = c.autor_id
           JOIN gestion.solicitudes s ON s.id = c.solicitud_id
          WHERE c.seq_cambio > $3
            AND ($2 OR s.solicitante_id = $1
                 OR EXISTS (SELECT 1 FROM gestion.asignaciones a WHERE a.solicitud_id = s.id AND a.usuario_id = $1 AND a.activa))
          ORDER BY c.seq_cambio LIMIT $4`,
        [u.id, verTodo(u), cursores.comentarios, limite]),
      db().query<NotificacionSync>(
        `SELECT n.id, n.titulo, n.mensaje, coalesce(n.enlace, '/dashboard') AS enlace, n.severidad,
                CASE WHEN n.leida THEN 1 ELSE 0 END AS leida, n.creado_en AS "creadoEn", n.tipo_evento AS tipo,
                n.seq_cambio::float8 AS seq
           FROM gestion.notificaciones n
          WHERE n.usuario_id = $1 AND n.seq_cambio > $2
          ORDER BY n.seq_cambio LIMIT $3`,
        [u.id, cursores.notificaciones, limite]),
    ]);

    const ultimo = (filas: { seq: number }[], previo: number) => (filas.length ? filas[filas.length - 1]!.seq : previo);
    return {
      solicitudes: sol.rows,
      comentarios: com.rows,
      notificaciones: not.rows,
      cursores: {
        solicitudes: ultimo(sol.rows, cursores.solicitudes),
        comentarios: ultimo(com.rows, cursores.comentarios),
        notificaciones: ultimo(not.rows, cursores.notificaciones),
      },
      hayMas: [sol.rows, com.rows, not.rows].some((f) => f.length === limite),
    };
  }
}
