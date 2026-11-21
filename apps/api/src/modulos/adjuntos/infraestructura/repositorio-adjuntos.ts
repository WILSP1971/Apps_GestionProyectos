import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { firmaValida, validarAdjunto, type AdjuntoVista } from '@sierraflow/contratos';
import { ErrorDominio, NoEncontrado, SinPermiso } from '../../../compartido/dominio/errores';
import { UsuarioActual } from '../../../compartido/dominio/usuario-actual';
import { db } from '../../../compartido/infraestructura/base-datos';

export type Destino = { solicitudId: string } | { tareaId: string; avanceId?: string | null };

const esGestor = (u: UsuarioActual) => u.roles.some((r) => r === 'LIDER' || r === 'DIRECTOR' || r === 'ADMIN');
const MAX_POR_DESTINO = 30;
const ESTADOS_CERRADOS = ['CERRADA', 'CANCELADA', 'RECHAZADA'];

const COLUMNAS = `a.id, a.nombre, a.mime, a.tamano, u.nombre_completo AS "subidoPor", a.creado_en AS "creadoEn", a.avance_id AS "avanceId"`;

/**
 * Adjuntos de solicitudes (los ve el solicitante, gestión y el equipo asignado) y evidencias de
 * avance de tareas (las sube el responsable o gestión). Usar dentro de enTransaccion() al escribir.
 */
@Injectable()
export class RepositorioAdjuntos {
  async listar(destino: Destino, u: UsuarioActual): Promise<AdjuntoVista[]> {
    await this.verificar(destino, u, 'ver');
    const [col, id] = 'solicitudId' in destino ? ['solicitud_id', destino.solicitudId] : ['tarea_id', destino.tareaId];
    const { rows } = await db().query(
      `SELECT ${COLUMNAS} FROM gestion.adjuntos a JOIN gestion.usuarios u ON u.id = a.subido_por
        WHERE a.${col} = $1 AND NOT a.eliminado ORDER BY a.creado_en`, [id]);
    return rows;
  }

  async subir(destino: Destino, nombre: string, contenido: Buffer, u: UsuarioActual): Promise<AdjuntoVista> {
    const v = validarAdjunto(nombre, contenido.length);
    if (!v.ok) throw new ErrorDominio('ADJUNTO_INVALIDO', v.error);
    if (!firmaValida(v.mime, contenido.subarray(0, 16))) {
      throw new ErrorDominio('ADJUNTO_INVALIDO', `"${nombre}" no es un archivo ${v.mime.split('/')[1]?.toUpperCase()} válido`);
    }
    await this.verificar(destino, u, 'subir');
    const solicitudId = 'solicitudId' in destino ? destino.solicitudId : null;
    const tareaId = 'tareaId' in destino ? destino.tareaId : null;
    const avanceId = 'tareaId' in destino ? destino.avanceId ?? null : null;
    const { rows: [{ n }] } = await db().query(
      `SELECT count(*)::int AS n FROM gestion.adjuntos WHERE NOT eliminado AND (solicitud_id = $1 OR tarea_id = $2)`, [solicitudId, tareaId]);
    if (n >= MAX_POR_DESTINO) throw new ErrorDominio('LIMITE_ADJUNTOS', `Se admiten hasta ${MAX_POR_DESTINO} adjuntos`);

    const { rows: [r] } = await db().query(
      `INSERT INTO gestion.adjuntos(solicitud_id, tarea_id, avance_id, nombre, mime, tamano, sha256, contenido, subido_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [solicitudId, tareaId, avanceId, nombre.trim(), v.mime, contenido.length,
        createHash('sha256').update(contenido).digest('hex'), contenido, u.id]);
    const { rows: [vista] } = await db().query(
      `SELECT ${COLUMNAS} FROM gestion.adjuntos a JOIN gestion.usuarios u ON u.id = a.subido_por WHERE a.id = $1`, [r.id]);
    return vista;
  }

  async contenido(id: string, u: UsuarioActual): Promise<{ nombre: string; mime: string; contenido: Buffer }> {
    const a = await this.cabecera(id);
    await this.verificar(a.destino, u, 'ver');
    const { rows: [r] } = await db().query(`SELECT nombre, mime, contenido FROM gestion.adjuntos WHERE id = $1`, [id]);
    return r;
  }

  async eliminar(id: string, u: UsuarioActual): Promise<void> {
    const a = await this.cabecera(id);
    if (a.subidoPor !== u.id && !esGestor(u)) throw new SinPermiso('Solo quien subió el archivo o gestión puede eliminarlo');
    await db().query(`UPDATE gestion.adjuntos SET eliminado = true WHERE id = $1`, [id]);
  }

  private async cabecera(id: string): Promise<{ destino: Destino; subidoPor: string }> {
    const { rows: [a] } = await db().query(
      `SELECT solicitud_id, tarea_id, avance_id, subido_por FROM gestion.adjuntos WHERE id = $1 AND NOT eliminado`, [id]);
    if (!a) throw new NoEncontrado('Adjunto', id);
    return {
      destino: a.solicitud_id ? { solicitudId: a.solicitud_id } : { tareaId: a.tarea_id, avanceId: a.avance_id },
      subidoPor: a.subido_por,
    };
  }

  /** Permisos: ver = participa en la solicitud/tarea; subir = además, que admita cambios. */
  private async verificar(destino: Destino, u: UsuarioActual, accion: 'ver' | 'subir') {
    const gestor = esGestor(u);
    if ('solicitudId' in destino) {
      const { rows: [s] } = await db().query(
        `SELECT s.estado::text AS estado, s.solicitante_id = $2 AS propia,
                EXISTS (SELECT 1 FROM gestion.asignaciones a WHERE a.solicitud_id = s.id AND a.usuario_id = $2 AND a.activa AND NOT a.eliminado) AS asignado
           FROM gestion.solicitudes s WHERE s.id = $1 AND NOT s.eliminado`, [destino.solicitudId, u.id]);
      if (!s) throw new NoEncontrado('Solicitud', destino.solicitudId);
      if (!gestor && !s.propia && !s.asignado) throw new SinPermiso('No participas en esta solicitud');
      if (accion === 'subir' && ESTADOS_CERRADOS.includes(s.estado)) {
        throw new ErrorDominio('NO_EDITABLE', 'La solicitud está cerrada: ya no admite adjuntos');
      }
      return;
    }
    const { rows: [t] } = await db().query(
      `SELECT t.responsable_id = $2 AS propia,
              EXISTS (SELECT 1 FROM gestion.asignaciones a WHERE a.solicitud_id = t.solicitud_id AND a.usuario_id = $2 AND a.activa AND NOT a.eliminado) AS equipo,
              CASE WHEN t.solicitud_id IS NOT NULL THEN coalesce(s.estado IN ('ASIGNADA','EN_DESARROLLO','EN_VALIDACION'), false)
                   ELSE coalesce(p.estado NOT IN ('CERRADO','CANCELADO'), false) END AS editable
         FROM gestion.tareas t
         LEFT JOIN gestion.solicitudes s ON s.id = t.solicitud_id
         LEFT JOIN gestion.proyectos p ON p.id = t.proyecto_id
        WHERE t.id = $1 AND NOT t.eliminado`, [destino.tareaId, u.id]);
    if (!t) throw new NoEncontrado('Tarea', destino.tareaId);
    if (accion === 'ver' && !gestor && !t.propia && !t.equipo) throw new SinPermiso('No participas en esta tarea');
    if (accion === 'subir') {
      if (!gestor && !t.propia) throw new SinPermiso('Solo el responsable de la tarea o gestión suben evidencias');
      if (!t.editable) throw new ErrorDominio('NO_EDITABLE', 'La solicitud o el proyecto ya no admite cambios');
      if (destino.avanceId) {
        const { rowCount } = await db().query(
          `SELECT 1 FROM gestion.tarea_avances WHERE id = $1 AND tarea_id = $2`, [destino.avanceId, destino.tareaId]);
        if (!rowCount) throw new ErrorDominio('AVANCE_INVALIDO', 'El registro de avance no pertenece a esta tarea');
      }
    }
  }
}
