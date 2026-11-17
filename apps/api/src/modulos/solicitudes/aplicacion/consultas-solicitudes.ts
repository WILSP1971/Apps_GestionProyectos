import { Injectable } from '@nestjs/common';
import { NoEncontrado } from '../../../compartido/dominio/errores';
import { UsuarioActual } from '../../../compartido/dominio/usuario-actual';
import { db } from '../../../compartido/infraestructura/base-datos';

export interface FiltrosTablero {
  estado?: string;
  mias?: boolean;
  texto?: string;
  limite?: number;
}

const puedeVerTodo = (u: UsuarioActual) => u.roles.some((r) => ['LIDER', 'DIRECTOR', 'ADMIN'].includes(r));

/** Lado de lectura (CQRS ligero): consulta vistas optimizadas sin pasar por el agregado. */
@Injectable()
export class ConsultasSolicitudes {
  async tablero(f: FiltrosTablero, u: UsuarioActual) {
    const { rows } = await db().query(
      `SELECT * FROM gestion.v_tablero_solicitudes v
        WHERE ($1::text IS NULL OR v.estado::text = $1)
          AND ($2::text IS NULL OR v.titulo ILIKE '%' || $2 || '%' OR v.codigo ILIKE '%' || $2 || '%')
          AND (
                ($3 AND NOT $5) OR v.solicitante_id = $4
                OR (NOT $5 AND EXISTS (SELECT 1 FROM gestion.asignaciones a
                                        WHERE a.solicitud_id = v.id AND a.usuario_id = $4 AND a.activa))
              )
        ORDER BY v.actualizado_en DESC
        LIMIT $6`,
      [f.estado ?? null, f.texto ?? null, puedeVerTodo(u), u.id, f.mias ?? false, Math.min(f.limite ?? 100, 500)],
    );
    return rows;
  }

  async detalle(id: string, u: UsuarioActual) {
    const { rows: [s] } = await db().query(`SELECT * FROM gestion.v_tablero_solicitudes WHERE id = $1`, [id]);
    if (!s) throw new NoEncontrado('Solicitud', id);
    const asignado = (s.asignados as Array<{ usuarioId: string }>).some((a) => a.usuarioId === u.id);
    if (!puedeVerTodo(u) && s.solicitante_id !== u.id && !asignado) throw new NoEncontrado('Solicitud', id);

    const [base, criterios, historial, comentarios, tecnologias] = await Promise.all([
      db().query(`SELECT descripcion, objetivos, justificacion, motivo_rechazo, story_points FROM gestion.solicitudes WHERE id=$1`, [id]),
      db().query(`SELECT id, orden, descripcion, cumplido FROM gestion.criterios_aceptacion
                   WHERE solicitud_id=$1 AND NOT eliminado ORDER BY orden`, [id]),
      db().query(`SELECT h.estado_anterior, h.estado_nuevo, h.comentario, h.fecha, u.nombre_completo AS usuario
                    FROM gestion.historial_estados h LEFT JOIN gestion.usuarios u ON u.id = h.usuario_id
                   WHERE h.solicitud_id=$1 ORDER BY h.fecha`, [id]),
      db().query(`SELECT c.id, c.contenido, c.padre_id, c.creado_en, u.nombre_completo AS autor, u.avatar_url
                    FROM gestion.comentarios c JOIN gestion.usuarios u ON u.id = c.autor_id
                   WHERE c.solicitud_id=$1 AND NOT c.eliminado ORDER BY c.creado_en`, [id]),
      db().query(`SELECT t.nombre FROM gestion.solicitud_tecnologias st JOIN gestion.tecnologias t ON t.id = st.tecnologia_id
                   WHERE st.solicitud_id=$1 ORDER BY t.nombre`, [id]),
    ]);
    return {
      ...s,
      ...base.rows[0],
      criterios: criterios.rows,
      historial: historial.rows,
      comentarios: comentarios.rows,
      tecnologias: tecnologias.rows.map((t) => t.nombre),
    };
  }

  async similares(texto: string) {
    if (!texto || texto.trim().length < 5) return [];
    const { rows } = await db().query(`SELECT * FROM gestion.fn_solicitudes_similares($1, 5)`, [texto.trim()]);
    return rows;
  }
}
