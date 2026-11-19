import { Inject, Injectable } from '@nestjs/common';
import type { Asignacion } from '@sierraflow/contratos';
import { ConflictoConcurrencia, ErrorDominio, NoEncontrado } from '../../../compartido/dominio/errores';
import { UsuarioActual } from '../../../compartido/dominio/usuario-actual';
import { db, enTransaccion } from '../../../compartido/infraestructura/base-datos';
import { publicarEnOutbox } from '../../../compartido/infraestructura/outbox';
import { REPOSITORIO_SOLICITUDES, RepositorioSolicitudes } from '../../solicitudes/dominio/solicitud.repositorio';

const ESTADOS_ASIGNABLES = ['APROBADA', 'ASIGNADA', 'EN_DESARROLLO', 'EN_VALIDACION'];

/**
 * Define el equipo de una solicitud (grupos e ingenieros con su rol y horas estimadas).
 *  - APROBADA → pasa a ASIGNADA (evento solicitud.asignada: avisa al solicitante y a los asignados).
 *  - Ya en curso → solo cambia el equipo; los nuevos integrantes reciben aviso (solicitud.equipo_actualizado).
 * Quien sale del equipo queda con la asignación inactiva (se conserva el histórico).
 */
@Injectable()
export class AsignarSolicitudCasoUso {
  constructor(@Inject(REPOSITORIO_SOLICITUDES) private readonly solicitudes: RepositorioSolicitudes) {}

  async ejecutar(solicitudId: string, dto: Asignacion, lider: UsuarioActual) {
    return enTransaccion(lider.id, async () => {
      const s = await this.solicitudes.porId(solicitudId);
      if (!s) throw new NoEncontrado('Solicitud', solicitudId);
      if (s.version !== dto.version) throw new ConflictoConcurrencia('Solicitud', solicitudId);
      if (!ESTADOS_ASIGNABLES.includes(s.estado)) {
        throw new ErrorDominio('ESTADO_INVALIDO', 'Solo se asignan solicitudes aprobadas o en curso');
      }

      const ids = [...new Set(dto.ingenieros.map((i) => i.usuarioId))];
      if (ids.length) {
        const { rows } = await db().query(
          `SELECT u.id FROM gestion.usuarios u
             JOIN gestion.usuario_roles ur ON ur.usuario_id = u.id
             JOIN gestion.roles r ON r.id = ur.rol_id AND r.codigo = 'INGENIERO'
            WHERE u.id = ANY($1::uuid[]) AND u.activo AND NOT u.eliminado`, [ids]);
        if (rows.length !== ids.length) throw new ErrorDominio('INGENIERO_INVALIDO', 'Algún usuario seleccionado no es un ingeniero activo');
      }

      // --- Ingenieros ---
      const { rows: actuales } = await db().query(
        `SELECT usuario_id FROM gestion.asignaciones
          WHERE solicitud_id = $1 AND activa AND NOT eliminado AND usuario_id IS NOT NULL`, [solicitudId]);
      const idsActuales = new Set<string>(actuales.map((a: { usuario_id: string }) => a.usuario_id));
      const nuevos = ids.filter((id) => !idsActuales.has(id));
      const retirados = [...idsActuales].filter((id) => !ids.includes(id));

      if (retirados.length) {
        await db().query(
          `UPDATE gestion.asignaciones SET activa = false, fecha_liberacion = now()
            WHERE solicitud_id = $1 AND usuario_id = ANY($2::uuid[]) AND activa`, [solicitudId, retirados]);
      }
      for (const i of dto.ingenieros) {
        if (idsActuales.has(i.usuarioId)) {
          await db().query(
            `UPDATE gestion.asignaciones SET rol_en_solicitud = $3, horas_estimadas = $4
              WHERE solicitud_id = $1 AND usuario_id = $2 AND activa`,
            [solicitudId, i.usuarioId, i.rol, i.horasEstimadas ?? null]);
        } else {
          await db().query(
            `INSERT INTO gestion.asignaciones(solicitud_id, usuario_id, rol_en_solicitud, horas_estimadas, asignado_por, comentario)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [solicitudId, i.usuarioId, i.rol, i.horasEstimadas ?? null, lider.id, dto.comentario ?? null]);
        }
      }

      // --- Grupos de trabajo ---
      await db().query(
        `UPDATE gestion.asignaciones SET activa = false, fecha_liberacion = now()
          WHERE solicitud_id = $1 AND activa AND grupo_id IS NOT NULL AND usuario_id IS NULL
            AND NOT (grupo_id = ANY($2::uuid[]))`, [solicitudId, dto.grupos]);
      await db().query(
        `INSERT INTO gestion.asignaciones(solicitud_id, grupo_id, asignado_por, comentario)
         SELECT $1, g.id, $3, $4 FROM gestion.grupos_trabajo g
          WHERE g.id = ANY($2::uuid[]) AND g.activo
            AND NOT EXISTS (SELECT 1 FROM gestion.asignaciones a
                             WHERE a.solicitud_id = $1 AND a.grupo_id = g.id AND a.usuario_id IS NULL AND a.activa)`,
        [solicitudId, dto.grupos, lider.id, dto.comentario ?? null]);

      // --- Estado y eventos ---
      if (s.estado === 'APROBADA') {
        await db().query(`SELECT set_config('app.comentario_estado', $1, true)`, [dto.comentario ?? '']);
        s.cambiarEstado('ASIGNADA', lider, dto.comentario);
        await this.solicitudes.guardar(s);
      } else if (nuevos.length) {
        await publicarEnOutbox([{
          tipo: 'solicitud.equipo_actualizado', agregado: 'Solicitud', agregadoId: solicitudId, ocurridoEn: new Date(),
          payload: { nuevos, retirados, actorId: lider.id, comentario: dto.comentario ?? null },
        }]);
      }
      const { rows: [v] } = await db().query(`SELECT estado, version FROM gestion.solicitudes WHERE id = $1`, [solicitudId]);
      return { id: solicitudId, estado: v.estado, version: v.version, nuevos: nuevos.length, retirados: retirados.length };
    });
  }
}
