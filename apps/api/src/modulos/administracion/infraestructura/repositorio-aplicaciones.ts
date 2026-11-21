import { Injectable } from '@nestjs/common';
import type { AplicacionVista, NuevaAplicacion } from '@sierraflow/contratos';
import { ErrorDominio, NoEncontrado } from '../../../compartido/dominio/errores';
import { db } from '../../../compartido/infraestructura/base-datos';

const SELECT_APLICACION = `
  SELECT a.id, a.nombre, a.descripcion, a.activo,
         coalesce((SELECT array_agg(x.tipo::text ORDER BY x.tipo) FROM gestion.aplicacion_tipos x WHERE x.aplicacion_id = a.id), '{}') AS tipos,
         coalesce((SELECT array_agg(t.nombre ORDER BY t.nombre) FROM gestion.aplicacion_tecnologias y
                     JOIN gestion.tecnologias t ON t.id = y.tecnologia_id WHERE y.aplicacion_id = a.id), '{}') AS tecnologias
    FROM gestion.aplicaciones a`;

/** Catálogo de aplicaciones de software por tipo de requerimiento. Usar dentro de enTransaccion() al escribir. */
@Injectable()
export class RepositorioAplicaciones {
  /** Todas (administración) o solo las activas (asistente de nueva solicitud). */
  async listar(soloActivas: boolean): Promise<AplicacionVista[]> {
    const { rows } = await db().query(`${SELECT_APLICACION} ${soloActivas ? 'WHERE a.activo' : ''} ORDER BY lower(a.nombre)`);
    return rows;
  }

  async crear(d: NuevaAplicacion): Promise<AplicacionVista> {
    await this.validarNombre(d.nombre);
    const { rows: [r] } = await db().query(
      `INSERT INTO gestion.aplicaciones(nombre, descripcion, activo) VALUES ($1, $2, $3) RETURNING id`,
      [d.nombre.trim(), d.descripcion?.trim() || null, d.activo ?? true]);
    await this.guardarRelaciones(r.id, d);
    return this.porId(r.id);
  }

  async actualizar(id: string, d: NuevaAplicacion): Promise<AplicacionVista> {
    await this.porId(id);
    await this.validarNombre(d.nombre, id);
    await db().query(
      `UPDATE gestion.aplicaciones SET nombre = $2, descripcion = $3, activo = $4, actualizado_en = now() WHERE id = $1`,
      [id, d.nombre.trim(), d.descripcion?.trim() || null, d.activo ?? true]);
    await this.guardarRelaciones(id, d);
    return this.porId(id);
  }

  private async porId(id: string): Promise<AplicacionVista> {
    const { rows: [a] } = await db().query(`${SELECT_APLICACION} WHERE a.id = $1`, [id]);
    if (!a) throw new NoEncontrado('Aplicación', id);
    return a;
  }

  private async validarNombre(nombre: string, excepto?: string) {
    const { rowCount } = await db().query(
      `SELECT 1 FROM gestion.aplicaciones WHERE lower(nombre) = lower($1) AND id IS DISTINCT FROM $2::uuid`, [nombre.trim(), excepto ?? null]);
    if (rowCount) throw new ErrorDominio('APLICACION_DUPLICADA', `Ya existe una aplicación llamada "${nombre.trim()}"`);
  }

  private async guardarRelaciones(id: string, d: NuevaAplicacion) {
    await db().query(`DELETE FROM gestion.aplicacion_tipos WHERE aplicacion_id = $1`, [id]);
    await db().query(
      `INSERT INTO gestion.aplicacion_tipos(aplicacion_id, tipo) SELECT $1, unnest($2::gestion.tipo_solicitud[])`, [id, d.tipos]);
    await db().query(`DELETE FROM gestion.aplicacion_tecnologias WHERE aplicacion_id = $1`, [id]);
    if (d.tecnologias?.length) {
      await db().query(
        `INSERT INTO gestion.aplicacion_tecnologias(aplicacion_id, tecnologia_id)
         SELECT $1, t.id FROM gestion.tecnologias t WHERE t.nombre = ANY($2::text[])`, [id, d.tecnologias]);
    }
  }
}
