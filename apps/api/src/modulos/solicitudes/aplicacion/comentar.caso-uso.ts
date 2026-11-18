import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ErrorDominio, NoEncontrado } from '../../../compartido/dominio/errores';
import { UsuarioActual } from '../../../compartido/dominio/usuario-actual';
import { db, enTransaccion } from '../../../compartido/infraestructura/base-datos';
import { publicarEnOutbox } from '../../../compartido/infraestructura/outbox';

export interface ComentarComando {
  id?: string;        // UUID generado en el cliente (idempotencia offline)
  contenido: string;
  padreId?: string;
}

/** Agrega un comentario al hilo de una solicitud visible para el usuario. */
@Injectable()
export class ComentarCasoUso {
  async ejecutar(solicitudId: string, cmd: ComentarComando, u: UsuarioActual) {
    const contenido = cmd.contenido?.trim() ?? '';
    if (!contenido || contenido.length > 10_000) {
      throw new ErrorDominio('COMENTARIO_INVALIDO', 'El comentario debe tener entre 1 y 10.000 caracteres');
    }
    return enTransaccion(u.id, async () => {
      const verTodo = u.roles.some((r) => ['LIDER', 'DIRECTOR', 'ADMIN'].includes(r));
      const { rows: [s] } = await db().query(
        `SELECT s.id, s.titulo, s.solicitante_id FROM gestion.solicitudes s
          WHERE s.id = $1 AND NOT s.eliminado
            AND ($2 OR s.solicitante_id = $3
                 OR EXISTS (SELECT 1 FROM gestion.asignaciones a WHERE a.solicitud_id = s.id AND a.usuario_id = $3 AND a.activa))`,
        [solicitudId, verTodo, u.id]);
      if (!s) throw new NoEncontrado('Solicitud', solicitudId);

      // Las @menciones (selector de usuarios en la UI) llegan con las notificaciones en el Sprint 4
      const menciones: string[] = [];
      const id = cmd.id ?? randomUUID();
      const { rowCount } = await db().query(
        `INSERT INTO gestion.comentarios(id, solicitud_id, autor_id, padre_id, contenido, menciones)
         VALUES ($1, $2, $3, $4, $5, $6::uuid[])
         ON CONFLICT (id) DO NOTHING`,
        [id, solicitudId, u.id, cmd.padreId ?? null, contenido, menciones]);

      if (rowCount) {
        await publicarEnOutbox([{
          tipo: 'comentario.creado', agregado: 'Solicitud', agregadoId: solicitudId, ocurridoEn: new Date(),
          payload: { comentarioId: id, autorId: u.id, solicitanteId: s.solicitante_id, titulo: s.titulo, menciones },
        }]);
      }
      return { id, solicitudId };
    });
  }
}
