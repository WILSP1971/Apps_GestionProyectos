import { Injectable } from '@nestjs/common';
import { ConflictoConcurrencia } from '../../../compartido/dominio/errores';
import { db } from '../../../compartido/infraestructura/base-datos';
import { publicarEnOutbox } from '../../../compartido/infraestructura/outbox';
import { Solicitud } from '../dominio/solicitud.agregado';
import { RepositorioSolicitudes } from '../dominio/solicitud.repositorio';

/** Adaptador PostgreSQL del puerto RepositorioSolicitudes. Debe usarse dentro de enTransaccion(). */
@Injectable()
export class PgSolicitudRepositorio implements RepositorioSolicitudes {
  async porId(id: string): Promise<Solicitud | null> {
    const { rows } = await db().query(
      `SELECT s.*, to_char(s.fecha_deseada, 'YYYY-MM-DD') AS fecha_deseada_txt,
              coalesce((SELECT json_agg(json_build_object('id', c.id, 'orden', c.orden,
                                 'descripcion', c.descripcion, 'cumplido', c.cumplido) ORDER BY c.orden)
                          FROM gestion.criterios_aceptacion c
                         WHERE c.solicitud_id = s.id AND NOT c.eliminado), '[]') AS criterios,
              coalesce((SELECT array_agg(t.nombre ORDER BY t.nombre)
                          FROM gestion.solicitud_tecnologias st
                          JOIN gestion.tecnologias t ON t.id = st.tecnologia_id
                         WHERE st.solicitud_id = s.id), '{}') AS tecnologias
         FROM gestion.solicitudes s
        WHERE s.id = $1 AND NOT s.eliminado`,
      [id],
    );
    const r = rows[0];
    if (!r) return null;
    return Solicitud.reconstituir(
      r.id,
      {
        codigo: r.codigo,
        titulo: r.titulo,
        descripcion: r.descripcion,
        objetivos: r.objetivos,
        justificacion: r.justificacion,
        tipo: r.tipo,
        prioridad: r.prioridad,
        estado: r.estado,
        solicitanteId: r.solicitante_id,
        departamentoId: r.departamento_id,
        proyectoId: r.proyecto_id,
        fechaDeseada: r.fecha_deseada_txt,
        criterios: r.criterios,
        tecnologias: r.tecnologias,
      },
      r.version,
    );
  }

  async guardar(s: Solicitud): Promise<void> {
    const d = s.datos;
    if (s.esNuevo) {
      await db().query(
        `INSERT INTO gestion.solicitudes(id, titulo, descripcion, objetivos, justificacion, tipo, prioridad,
                                         estado, solicitante_id, departamento_id, proyecto_id, fecha_deseada)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [s.id, d.titulo, d.descripcion, d.objetivos, d.justificacion, d.tipo, d.prioridad,
         d.estado, d.solicitanteId, d.departamentoId, d.proyectoId ?? null, d.fechaDeseada ?? null],
      );
    } else {
      // Concurrencia optimista: solo actualiza si nadie más cambió la fila
      const { rowCount } = await db().query(
        `UPDATE gestion.solicitudes
            SET titulo=$2, descripcion=$3, objetivos=$4, justificacion=$5, tipo=$6, prioridad=$7,
                estado=$8, fecha_deseada=$9
          WHERE id=$1 AND version=$10`,
        [s.id, d.titulo, d.descripcion, d.objetivos, d.justificacion, d.tipo, d.prioridad,
         d.estado, d.fechaDeseada ?? null, s.version],
      );
      if (rowCount === 0) throw new ConflictoConcurrencia('Solicitud', s.id);
    }
    await this.sincronizarCriterios(s);
    await this.sincronizarTecnologias(s);
    await publicarEnOutbox(s.extraerEventos()); // misma transacción ⇒ el evento existe sí y solo sí el cambio existe
  }

  private async sincronizarCriterios(s: Solicitud): Promise<void> {
    const ids = s.datos.criterios.map((c) => c.id);
    await db().query(
      `UPDATE gestion.criterios_aceptacion SET eliminado = true
        WHERE solicitud_id = $1 AND NOT (id = ANY($2::uuid[])) AND NOT eliminado`,
      [s.id, ids],
    );
    for (const c of s.datos.criterios) {
      await db().query(
        `INSERT INTO gestion.criterios_aceptacion(id, solicitud_id, orden, descripcion, cumplido)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id) DO UPDATE
           SET orden = EXCLUDED.orden, descripcion = EXCLUDED.descripcion,
               cumplido = EXCLUDED.cumplido, eliminado = false
         WHERE gestion.criterios_aceptacion.solicitud_id = EXCLUDED.solicitud_id`,
        [c.id, s.id, c.orden, c.descripcion, c.cumplido],
      );
    }
  }

  private async sincronizarTecnologias(s: Solicitud): Promise<void> {
    await db().query(`DELETE FROM gestion.solicitud_tecnologias WHERE solicitud_id = $1`, [s.id]);
    if (s.datos.tecnologias.length === 0) return;
    await db().query(
      `INSERT INTO gestion.solicitud_tecnologias(solicitud_id, tecnologia_id)
       SELECT $1, t.id FROM gestion.tecnologias t WHERE t.nombre = ANY($2::text[])
       ON CONFLICT DO NOTHING`,
      [s.id, s.datos.tecnologias],
    );
  }
}
