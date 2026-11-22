import { Injectable } from '@nestjs/common';
import type { Canal, EventoNotificacion, GrupoNotificacion } from '@sierraflow/contratos';
import { db } from '../../../compartido/infraestructura/base-datos';
import type { Destinatario, Severidad } from '../dominio/plantillas';

const SOLO_ACTIVOS = `AND EXISTS (SELECT 1 FROM gestion.usuarios ux WHERE ux.id = d.id AND ux.activo AND NOT ux.eliminado)`;

@Injectable()
export class RepositorioNotificaciones {
  async contextoSolicitud(id: string): Promise<{ codigo: string; titulo: string; solicitanteId: string } | null> {
    const { rows: [s] } = await db().query(
      `SELECT codigo, titulo, solicitante_id AS "solicitanteId" FROM gestion.solicitudes WHERE id = $1`, [id]);
    return s ?? null;
  }

  /** Mismo formato que contextoSolicitud para los eventos de proyecto (sin solicitante). */
  async contextoProyecto(id: string): Promise<{ codigo: string; titulo: string; solicitanteId: string } | null> {
    const { rows: [p] } = await db().query(
      `SELECT codigo, nombre AS titulo, NULL::uuid AS "solicitanteId" FROM gestion.proyectos WHERE id = $1`, [id]);
    return p ?? null;
  }

  async nombreUsuario(id?: string | null): Promise<string | null> {
    if (!id) return null;
    const { rows: [u] } = await db().query(`SELECT nombre_completo FROM gestion.usuarios WHERE id = $1`, [id]);
    return u?.nombre_completo ?? null;
  }

  async contenidoComentario(id?: string | null): Promise<string | null> {
    if (!id) return null;
    const { rows: [c] } = await db().query(`SELECT contenido FROM gestion.comentarios WHERE id = $1`, [id]);
    return c?.contenido ?? null;
  }

  /** Usuarios activos que corresponden a un tipo de destinatario para una solicitud. */
  async destinatarios(quien: Destinatario, solicitudId: string, solicitanteId: string | null, explicitos: string[] = []): Promise<string[]> {
    let sql: string;
    let params: unknown[];
    switch (quien) {
      case 'NUEVOS_ASIGNADOS':
        if (!explicitos.length) return [];
        sql = `SELECT unnest($1::uuid[]) AS id`;
        params = [explicitos];
        break;
      case 'SOLICITANTE':
        if (!solicitanteId) return [];
        sql = `SELECT $1::uuid AS id`;
        params = [solicitanteId];
        break;
      case 'GESTORES':
        // Panel de gestión: administrador, director y líder técnico activos
        sql = `SELECT DISTINCT ur.usuario_id AS id FROM gestion.usuario_roles ur
                 JOIN gestion.roles r ON r.id = ur.rol_id
                 JOIN gestion.usuarios u ON u.id = ur.usuario_id AND u.activo AND NOT u.eliminado
                WHERE r.codigo IN ('ADMIN', 'LIDER', 'DIRECTOR')`;
        params = [];
        break;
      case 'ASIGNADOS':
        sql = `SELECT DISTINCT a.usuario_id AS id FROM gestion.asignaciones a
                WHERE a.solicitud_id = $1 AND a.activa AND NOT a.eliminado AND a.usuario_id IS NOT NULL`;
        params = [solicitudId];
        break;
      case 'PARTICIPANTES':
        sql = `SELECT s.solicitante_id AS id FROM gestion.solicitudes s WHERE s.id = $1
               UNION SELECT a.usuario_id FROM gestion.asignaciones a
                      WHERE a.solicitud_id = $1 AND a.activa AND NOT a.eliminado AND a.usuario_id IS NOT NULL
               UNION SELECT c.autor_id FROM gestion.comentarios c WHERE c.solicitud_id = $1 AND NOT c.eliminado`;
        params = [solicitudId];
        break;
      default:
        throw new Error(`Destinatario desconocido: ${String(quien)}`);
    }
    const { rows } = await db().query(`SELECT d.id FROM (${sql}) d WHERE d.id IS NOT NULL ${SOLO_ACTIVOS}`, params);
    return rows.map((r: { id: string }) => r.id);
  }

  async preferencias(usuarioId: string, grupo: GrupoNotificacion): Promise<{ canal: Canal; activo: boolean }[]> {
    const { rows } = await db().query(
      `SELECT canal, activo FROM gestion.preferencias_notificacion WHERE usuario_id = $1 AND tipo_evento = $2`,
      [usuarioId, grupo]);
    return rows;
  }

  async todasLasPreferencias(usuarioId: string): Promise<{ grupo: string; canal: Canal; activo: boolean }[]> {
    const { rows } = await db().query(
      `SELECT tipo_evento AS grupo, canal, activo FROM gestion.preferencias_notificacion WHERE usuario_id = $1`, [usuarioId]);
    return rows;
  }

  async guardarPreferencia(usuarioId: string, grupo: GrupoNotificacion, canal: Canal, activo: boolean) {
    await db().query(
      `INSERT INTO gestion.preferencias_notificacion(usuario_id, tipo_evento, canal, activo) VALUES ($1, $2, $3, $4)
       ON CONFLICT (usuario_id, tipo_evento, canal) DO UPDATE SET activo = EXCLUDED.activo`,
      [usuarioId, grupo, canal, activo]);
  }

  /** Inserta la notificación in-app. El trigger avisa por NOTIFY al canal de tiempo real. */
  async insertar(n: {
    usuarioId: string; tipoEvento: string; titulo: string; mensaje: string; enlace: string;
    severidad: Severidad; datos?: Record<string, unknown>;
  }): Promise<string> {
    const { rows: [r] } = await db().query(
      `INSERT INTO gestion.notificaciones(usuario_id, tipo_evento, titulo, mensaje, enlace, severidad, datos)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [n.usuarioId, n.tipoEvento, n.titulo.slice(0, 200), n.mensaje, n.enlace, n.severidad, JSON.stringify(n.datos ?? {})]);
    return r.id;
  }

  async porId(id: string, usuarioId: string): Promise<EventoNotificacion | null> {
    const { rows: [n] } = await db().query(
      `SELECT id, titulo, mensaje, coalesce(enlace, '/dashboard') AS enlace, severidad, tipo_evento AS tipo
         FROM gestion.notificaciones WHERE id = $1 AND usuario_id = $2`, [id, usuarioId]);
    return n ?? null;
  }

  async ultimas(usuarioId: string, limite = 50) {
    const { rows } = await db().query(
      `SELECT id, titulo, mensaje, coalesce(enlace, '/dashboard') AS enlace, severidad, leida, creado_en AS "creadoEn",
              tipo_evento AS tipo
         FROM gestion.notificaciones WHERE usuario_id = $1 ORDER BY creado_en DESC LIMIT $2`, [usuarioId, limite]);
    return rows;
  }

  async marcarLeida(id: string, usuarioId: string) {
    await db().query(
      `UPDATE gestion.notificaciones SET leida = true, fecha_lectura = coalesce(fecha_lectura, now())
        WHERE id = $1 AND usuario_id = $2 AND NOT leida`, [id, usuarioId]);
  }

  async marcarTodasLeidas(usuarioId: string): Promise<number> {
    const { rowCount } = await db().query(
      `UPDATE gestion.notificaciones SET leida = true, fecha_lectura = now() WHERE usuario_id = $1 AND NOT leida`, [usuarioId]);
    return rowCount ?? 0;
  }

  async contacto(usuarioId: string): Promise<{ email: string; nombre: string } | null> {
    const { rows: [u] } = await db().query(
      `SELECT email, nombre_completo AS nombre FROM gestion.usuarios WHERE id = $1 AND activo AND NOT eliminado`, [usuarioId]);
    return u ?? null;
  }

  // --- Suscripciones Web Push ---
  async suscripciones(usuarioId: string): Promise<{ id: string; endpoint: string; clave_p256dh: string; clave_auth: string }[]> {
    const { rows } = await db().query(
      `SELECT id, endpoint, clave_p256dh, clave_auth FROM gestion.suscripciones_push WHERE usuario_id = $1`, [usuarioId]);
    return rows;
  }

  async guardarSuscripcion(usuarioId: string, endpoint: string, p256dh: string, auth: string, userAgent?: string) {
    // Un mismo navegador (endpoint) solo pertenece al último usuario que se suscribió en él
    await db().query(
      `INSERT INTO gestion.suscripciones_push(usuario_id, endpoint, clave_p256dh, clave_auth, user_agent)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE
         SET usuario_id = EXCLUDED.usuario_id, clave_p256dh = EXCLUDED.clave_p256dh,
             clave_auth = EXCLUDED.clave_auth, user_agent = EXCLUDED.user_agent`,
      [usuarioId, endpoint, p256dh, auth, userAgent?.slice(0, 500) ?? null]);
  }

  async eliminarSuscripcion(endpoint: string, usuarioId?: string) {
    await db().query(
      `DELETE FROM gestion.suscripciones_push WHERE endpoint = $1 AND ($2::uuid IS NULL OR usuario_id = $2)`,
      [endpoint, usuarioId ?? null]);
  }

  async marcarUsoSuscripcion(id: string) {
    await db().query(`UPDATE gestion.suscripciones_push SET ultimo_uso = now() WHERE id = $1`, [id]);
  }
}
