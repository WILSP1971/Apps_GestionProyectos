import { Injectable } from '@nestjs/common';
import {
  calcularFinanzas, saludCronograma, TIPOS_REQUIEREN_PROYECTO,
  type CambioDeuda, type CambioProyecto, type CambioRiesgo, type CatalogosProyecto, type DetalleProyecto, type DeudaVista,
  type NuevaDeuda, type NuevoProyecto, type NuevoRiesgo, type ResumenProyecto, type RiesgoVista, type SolicitudDeProyecto, type TareaVista,
} from '@sierraflow/contratos';
import { ConflictoConcurrencia, ErrorDominio, NoEncontrado } from '../../../compartido/dominio/errores';
import { db } from '../../../compartido/infraestructura/base-datos';

const COLUMNAS_PROYECTO = `
  p.id, p.codigo, p.nombre, p.descripcion, p.estado::text AS estado,
  p.departamento_id AS "departamentoId", d.nombre AS departamento, d.color_hex AS "departamentoColor",
  p.director_id AS "directorId", u.nombre_completo AS director,
  to_char(p.fecha_inicio, 'YYYY-MM-DD') AS "fechaInicio", to_char(p.fecha_fin_plan, 'YYYY-MM-DD') AS "fechaFinPlan",
  p.presupuesto::float8 AS presupuesto, p.costo_real::float8 AS "costoOtros", p.tarifa_hora::float8 AS "tarifaHora",
  p.beneficio_esperado::float8 AS "beneficioEsperado", p.moneda, p.version,
  coalesce(i.solicitudes, 0) AS solicitudes, coalesce(i.avance_pct, 0) AS "avancePct",
  coalesce(i.horas_reales, 0) AS "horasReales", coalesce(i.horas_estimadas, 0) AS "horasEstimadas",
  coalesce(i.riesgos_altos, 0) AS "riesgosAltos", coalesce(i.deuda_pendiente, 0) AS "deudaPendiente"`;
const DESDE_PROYECTO = `
  FROM gestion.proyectos p
  LEFT JOIN gestion.departamentos d ON d.id = p.departamento_id
  LEFT JOIN gestion.usuarios u ON u.id = p.director_id
  LEFT JOIN gestion.v_proyectos_indicadores i ON i.id = p.id`;

type FilaProyecto = Omit<DetalleProyecto, 'salud' | 'finanzas' | 'solicitudesDetalle' | 'riesgos' | 'deuda' | 'permisos'>;

/** Agrega los indicadores calculados (salud del cronograma y finanzas) con las reglas de @sierraflow/contratos. */
function conIndicadores<T extends FilaProyecto>(f: T): T & Pick<ResumenProyecto, 'salud' | 'finanzas'> {
  return {
    ...f,
    salud: saludCronograma(f.avancePct, f.fechaInicio, f.fechaFinPlan, Date.now(), f.estado === 'CERRADO' || f.estado === 'CANCELADO'),
    finanzas: calcularFinanzas({
      presupuesto: f.presupuesto, costoOtros: f.costoOtros, tarifaHora: f.tarifaHora,
      horasReales: f.horasReales, horasEstimadas: f.horasEstimadas, beneficioEsperado: f.beneficioEsperado,
    }),
  };
}

const COLUMNAS_RIESGO = `
  r.id, r.titulo, r.descripcion, r.probabilidad, r.impacto, r.exposicion, r.plan_mitigacion AS "planMitigacion",
  r.responsable_id AS "responsableId", ur.nombre_completo AS responsable,
  r.solicitud_id AS "solicitudId", sr.codigo AS "solicitudCodigo", r.estado::text AS estado, r.version, r.actualizado_en AS "actualizadoEn"`;
const DESDE_RIESGO = `
  FROM gestion.riesgos r
  LEFT JOIN gestion.usuarios ur ON ur.id = r.responsable_id
  LEFT JOIN gestion.solicitudes sr ON sr.id = r.solicitud_id`;
const COLUMNAS_DEUDA = `
  dt.id, dt.descripcion, dt.story_points AS "storyPoints", dt.solicitud_id AS "solicitudId", sd.codigo AS "solicitudCodigo",
  dt.resuelta, dt.creado_en AS "creadoEn", dt.resuelta_en AS "resueltaEn"`;
const DESDE_DEUDA = `
  FROM gestion.deuda_tecnica dt
  LEFT JOIN gestion.solicitudes sd ON sd.id = dt.solicitud_id`;

@Injectable()
export class RepositorioProyectos {
  async listado(): Promise<ResumenProyecto[]> {
    const { rows } = await db().query(
      `SELECT ${COLUMNAS_PROYECTO} ${DESDE_PROYECTO}
        WHERE NOT p.eliminado
        ORDER BY CASE p.estado WHEN 'EN_EJECUCION' THEN 0 WHEN 'PLANEACION' THEN 1 WHEN 'EN_PAUSA' THEN 2 ELSE 3 END,
                 p.fecha_fin_plan NULLS LAST, p.nombre`);
    return rows.map((f: FilaProyecto) => conIndicadores(f));
  }

  async detalle(id: string, editar: boolean): Promise<DetalleProyecto> {
    const { rows: [f] } = await db().query(`SELECT ${COLUMNAS_PROYECTO} ${DESDE_PROYECTO} WHERE p.id = $1 AND NOT p.eliminado`, [id]);
    if (!f) throw new NoEncontrado('Proyecto', id);
    const [solicitudes, tareasProyecto, riesgos, deuda] = await Promise.all([
      this.solicitudes(id), this.tareasProyecto(id), this.riesgos(id), this.deuda(id)]);
    return { ...conIndicadores(f as FilaProyecto), solicitudesDetalle: solicitudes, tareasProyecto, riesgos, deuda, permisos: { editar } };
  }

  /** Proyectos en los que participa la persona: tiene tareas (propias del proyecto o de sus solicitudes) o está asignada. */
  async mios(usuarioId: string): Promise<ResumenProyecto[]> {
    const { rows } = await db().query(
      `SELECT ${COLUMNAS_PROYECTO} ${DESDE_PROYECTO}
        WHERE NOT p.eliminado AND p.estado NOT IN ('CANCELADO')
          AND (EXISTS (SELECT 1 FROM gestion.tareas t WHERE t.proyecto_id = p.id AND t.responsable_id = $1 AND NOT t.eliminado)
               OR EXISTS (SELECT 1 FROM gestion.solicitudes s
                            JOIN gestion.asignaciones a ON a.solicitud_id = s.id AND a.activa AND NOT a.eliminado
                           WHERE s.proyecto_id = p.id AND NOT s.eliminado AND a.usuario_id = $1))
        ORDER BY (p.estado = 'CERRADO'), p.fecha_fin_plan NULLS LAST, p.nombre`, [usuarioId]);
    return rows.map((f: FilaProyecto) => conIndicadores(f));
  }

  /** Regla 3: tareas propias del proyecto. */
  async tareasProyecto(proyectoId: string): Promise<TareaVista[]> {
    const { rows } = await db().query(
      `SELECT t.id, t.titulo, t.descripcion, t.grupo_id AS "grupoId", g.nombre AS grupo,
              t.responsable_id AS "responsableId", u.nombre_completo AS responsable, t.estado::text AS estado,
              t.peso, t.avance_pct::float8 AS "avancePct", t.horas_estimadas::float8 AS "horasEstimadas",
              t.horas_reales::float8 AS "horasReales", to_char(t.fecha_inicio, 'YYYY-MM-DD') AS "fechaInicio",
              to_char(t.fecha_fin_plan, 'YYYY-MM-DD') AS "fechaFinPlan", t.version
         FROM gestion.tareas t
         LEFT JOIN gestion.grupos_trabajo g ON g.id = t.grupo_id
         LEFT JOIN gestion.usuarios u ON u.id = t.responsable_id
        WHERE t.proyecto_id = $1 AND NOT t.eliminado
        ORDER BY t.fecha_inicio NULLS LAST, t.creado_en`, [proyectoId]);
    return rows;
  }

  /** Solicitudes del proyecto con sus tareas (filas del Gantt). */
  async solicitudes(proyectoId: string): Promise<SolicitudDeProyecto[]> {
    const { rows } = await db().query(
      `SELECT s.id, s.codigo, s.titulo, s.estado::text AS estado, s.avance_pct::float8 AS "avancePct",
              to_char(coalesce(s.fecha_inicio_desarrollo, s.fecha_aprobacion, s.fecha_envio, s.creado_en) AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD') AS inicio,
              to_char(coalesce((s.fecha_cierre AT TIME ZONE 'America/Bogota')::date, s.fecha_deseada), 'YYYY-MM-DD') AS fin,
              (s.estado = 'CERRADA') AS cerrada,
              coalesce((SELECT json_agg(json_build_object(
                         'id', t.id, 'titulo', t.titulo, 'grupo', g.nombre, 'responsable', u.nombre_completo, 'estado', t.estado,
                         'avancePct', t.avance_pct, 'inicio', to_char(t.fecha_inicio, 'YYYY-MM-DD'),
                         'fin', to_char(coalesce(t.fecha_fin_real, t.fecha_fin_plan), 'YYYY-MM-DD'), 'dependeDe', t.depende_de)
                         ORDER BY t.fecha_inicio NULLS LAST, t.creado_en)
                          FROM gestion.tareas t
                          LEFT JOIN gestion.grupos_trabajo g ON g.id = t.grupo_id
                          LEFT JOIN gestion.usuarios u ON u.id = t.responsable_id
                         WHERE t.solicitud_id = s.id AND NOT t.eliminado), '[]') AS tareas
         FROM gestion.solicitudes s
        WHERE s.proyecto_id = $1 AND NOT s.eliminado
        ORDER BY coalesce(s.fecha_inicio_desarrollo, s.fecha_aprobacion, s.fecha_envio, s.creado_en)`, [proyectoId]);
    return rows.map((r: SolicitudDeProyecto) => ({ ...r, tareas: r.tareas.map((t) => ({ ...t, avancePct: Number(t.avancePct) })) }));
  }

  async riesgos(proyectoId: string): Promise<RiesgoVista[]> {
    const { rows } = await db().query(
      `SELECT ${COLUMNAS_RIESGO} ${DESDE_RIESGO}
        WHERE r.proyecto_id = $1 AND NOT r.eliminado
        ORDER BY (r.estado IN ('ABIERTO','MATERIALIZADO')) DESC, r.exposicion DESC, r.creado_en`, [proyectoId]);
    return rows;
  }

  async deuda(proyectoId: string): Promise<DeudaVista[]> {
    const { rows } = await db().query(
      `SELECT ${COLUMNAS_DEUDA} ${DESDE_DEUDA}
        WHERE dt.proyecto_id = $1 AND NOT dt.eliminado
        ORDER BY dt.resuelta, dt.story_points DESC, dt.creado_en`, [proyectoId]);
    return rows;
  }

  async catalogos(proyectoId: string | null): Promise<CatalogosProyecto> {
    const [deps, directores, responsables, disponibles, grupos] = await Promise.all([
      db().query(`SELECT id, nombre FROM gestion.departamentos WHERE activo AND NOT eliminado ORDER BY nombre`),
      db().query(
        `SELECT DISTINCT u.id, u.nombre_completo AS nombre FROM gestion.usuarios u
           JOIN gestion.usuario_roles ur ON ur.usuario_id = u.id JOIN gestion.roles r ON r.id = ur.rol_id
          WHERE r.codigo IN ('DIRECTOR','LIDER','ADMIN') AND u.activo AND NOT u.eliminado ORDER BY nombre`),
      db().query(
        `SELECT DISTINCT u.id, u.nombre_completo AS nombre FROM gestion.usuarios u
           JOIN gestion.usuario_roles ur ON ur.usuario_id = u.id JOIN gestion.roles r ON r.id = ur.rol_id
          WHERE r.codigo IN ('INGENIERO','LIDER','DIRECTOR') AND u.activo AND NOT u.eliminado ORDER BY nombre`),
      db().query(
        `SELECT s.id, s.codigo, s.titulo, s.estado::text AS estado, d.nombre AS departamento
           FROM gestion.solicitudes s JOIN gestion.departamentos d ON d.id = s.departamento_id
          WHERE NOT s.eliminado AND s.proyecto_id IS NULL
            AND s.estado NOT IN ('BORRADOR','RECHAZADA','CANCELADA')
          ORDER BY s.creado_en DESC LIMIT 300`),
      db().query(`SELECT id, nombre FROM gestion.grupos_trabajo WHERE activo AND NOT eliminado ORDER BY nombre`),
    ]);
    void proyectoId;
    return {
      departamentos: deps.rows, directores: directores.rows, responsables: responsables.rows,
      solicitudesDisponibles: disponibles.rows, grupos: grupos.rows,
    };
  }

  // -------------------------------------------------------------------
  async crear(n: NuevoProyecto, directorPorDefecto: string): Promise<string> {
    const { rows: [r] } = await db().query(
      `INSERT INTO gestion.proyectos(nombre, descripcion, departamento_id, director_id, fecha_inicio, fecha_fin_plan,
                                     presupuesto, costo_real, tarifa_hora, beneficio_esperado, moneda)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [n.nombre, n.descripcion ?? null, n.departamentoId ?? null, n.directorId ?? directorPorDefecto, n.fechaInicio ?? null,
        n.fechaFinPlan ?? null, n.presupuesto ?? null, n.costoOtros ?? 0, n.tarifaHora ?? null, n.beneficioEsperado ?? null, n.moneda ?? 'COP']);
    return r.id;
  }

  async actualizar(id: string, c: CambioProyecto): Promise<void> {
    const columnas: [string, unknown][] = ([
      ['nombre', c.nombre], ['descripcion', c.descripcion], ['departamento_id', c.departamentoId], ['director_id', c.directorId],
      ['fecha_inicio', c.fechaInicio], ['fecha_fin_plan', c.fechaFinPlan], ['presupuesto', c.presupuesto], ['costo_real', c.costoOtros],
      ['tarifa_hora', c.tarifaHora], ['beneficio_esperado', c.beneficioEsperado], ['moneda', c.moneda], ['estado', c.estado],
    ] as [string, unknown][]).filter(([, v]) => v !== undefined);
    if (c.estado === 'CERRADO') columnas.push(['fecha_fin_real', new Date().toISOString().slice(0, 10)]);
    if (!columnas.length) return;
    const sets = columnas.map(([k], i) => `${k} = $${i + 3}${k === 'estado' ? '::gestion.estado_proyecto' : ''}`).join(', ');
    const { rowCount } = await db().query(
      `UPDATE gestion.proyectos SET ${sets} WHERE id = $1 AND version = $2 AND NOT eliminado`,
      [id, c.version, ...columnas.map(([, v]) => v)]);
    if (!rowCount) {
      const { rowCount: existe } = await db().query(`SELECT 1 FROM gestion.proyectos WHERE id = $1 AND NOT eliminado`, [id]);
      if (!existe) throw new NoEncontrado('Proyecto', id);
      throw new ConflictoConcurrencia('Proyecto', id);
    }
    // Las fechas del proyecto deben seguir siendo coherentes aunque se cambie solo una
    const { rows: [f] } = await db().query(`SELECT fecha_inicio <= fecha_fin_plan OR fecha_inicio IS NULL OR fecha_fin_plan IS NULL AS ok FROM gestion.proyectos WHERE id = $1`, [id]);
    if (!f.ok) throw new ErrorDominio('FECHAS_INVALIDAS', 'La fecha de fin debe ser posterior al inicio');
  }

  async eliminar(id: string): Promise<void> {
    const { rows: [f] } = await db().query(`SELECT count(*)::int AS n FROM gestion.solicitudes WHERE proyecto_id = $1 AND NOT eliminado`, [id]);
    if (f.n > 0) throw new ErrorDominio('PROYECTO_CON_SOLICITUDES', 'Quita primero las solicitudes del proyecto (o márcalo como cancelado)');
    await db().query(`UPDATE gestion.proyectos SET eliminado = true WHERE id = $1`, [id]);
  }

  async vincular(id: string, agregar: string[], quitar: string[]): Promise<void> {
    if (agregar.length) {
      const { rowCount } = await db().query(
        `UPDATE gestion.solicitudes SET proyecto_id = $1
          WHERE id = ANY($2::uuid[]) AND NOT eliminado AND (proyecto_id IS NULL OR proyecto_id = $1)`, [id, agregar]);
      if ((rowCount ?? 0) < agregar.length) {
        throw new ErrorDominio('SOLICITUD_EN_OTRO_PROYECTO', 'Alguna solicitud ya pertenece a otro proyecto o no existe');
      }
    }
    if (quitar.length) {
      // Regla 1: un requerimiento funcional ya en ejecución no puede quedar sin proyecto
      const { rows: bloqueadas } = await db().query(
        `SELECT codigo FROM gestion.solicitudes
          WHERE proyecto_id = $1 AND id = ANY($2::uuid[]) AND tipo = ANY($3::gestion.tipo_solicitud[])
            AND estado IN ('ASIGNADA','EN_DESARROLLO','EN_VALIDACION')`, [id, quitar, [...TIPOS_REQUIEREN_PROYECTO]]);
      if (bloqueadas.length) {
        throw new ErrorDominio('REQUIERE_PROYECTO',
          `${bloqueadas.map((b: { codigo: string }) => b.codigo).join(', ')}: los requerimientos funcionales en ejecución deben permanecer en un proyecto`);
      }
      await db().query(`UPDATE gestion.solicitudes SET proyecto_id = NULL WHERE proyecto_id = $1 AND id = ANY($2::uuid[])`, [id, quitar]);
    }
  }

  // -------------------------------------------------------------------
  async proyectoDeRiesgo(id: string): Promise<string> {
    const { rows: [r] } = await db().query(`SELECT proyecto_id FROM gestion.riesgos WHERE id = $1 AND NOT eliminado`, [id]);
    if (!r?.proyecto_id) throw new NoEncontrado('Riesgo', id);
    return r.proyecto_id;
  }

  async crearRiesgo(proyectoId: string, n: NuevoRiesgo): Promise<RiesgoVista> {
    const { rows: [r] } = await db().query(
      `INSERT INTO gestion.riesgos(proyecto_id, solicitud_id, titulo, descripcion, probabilidad, impacto, plan_mitigacion, responsable_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [proyectoId, n.solicitudId ?? null, n.titulo, n.descripcion ?? null, n.probabilidad, n.impacto, n.planMitigacion ?? null, n.responsableId ?? null]);
    return this.riesgo(r.id);
  }

  async actualizarRiesgo(id: string, c: CambioRiesgo): Promise<RiesgoVista> {
    const columnas = ([
      ['titulo', c.titulo], ['descripcion', c.descripcion], ['probabilidad', c.probabilidad], ['impacto', c.impacto],
      ['plan_mitigacion', c.planMitigacion], ['responsable_id', c.responsableId], ['solicitud_id', c.solicitudId], ['estado', c.estado],
    ] as [string, unknown][]).filter(([, v]) => v !== undefined);
    if (columnas.length) {
      const sets = columnas.map(([k], i) => `${k} = $${i + 3}${k === 'estado' ? '::gestion.estado_riesgo' : ''}`).join(', ');
      const { rowCount } = await db().query(
        `UPDATE gestion.riesgos SET ${sets} WHERE id = $1 AND version = $2 AND NOT eliminado`, [id, c.version, ...columnas.map(([, v]) => v)]);
      if (!rowCount) throw new ConflictoConcurrencia('Riesgo', id);
    }
    return this.riesgo(id);
  }

  async eliminarRiesgo(id: string): Promise<void> {
    await db().query(`UPDATE gestion.riesgos SET eliminado = true WHERE id = $1`, [id]);
  }

  private async riesgo(id: string): Promise<RiesgoVista> {
    const { rows: [r] } = await db().query(`SELECT ${COLUMNAS_RIESGO} ${DESDE_RIESGO} WHERE r.id = $1`, [id]);
    return r;
  }

  // -------------------------------------------------------------------
  async proyectoDeDeuda(id: string): Promise<string> {
    const { rows: [r] } = await db().query(`SELECT proyecto_id FROM gestion.deuda_tecnica WHERE id = $1 AND NOT eliminado`, [id]);
    if (!r) throw new NoEncontrado('Deuda técnica', id);
    return r.proyecto_id;
  }

  async crearDeuda(proyectoId: string, n: NuevaDeuda, autor: string): Promise<DeudaVista> {
    const { rows: [r] } = await db().query(
      `INSERT INTO gestion.deuda_tecnica(proyecto_id, solicitud_id, descripcion, story_points, creado_por)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [proyectoId, n.solicitudId ?? null, n.descripcion, n.storyPoints, autor]);
    return this.unaDeuda(r.id);
  }

  async actualizarDeuda(id: string, c: CambioDeuda): Promise<DeudaVista> {
    await db().query(
      `UPDATE gestion.deuda_tecnica
          SET descripcion  = coalesce($2, descripcion),
              story_points = coalesce($3, story_points),
              solicitud_id = CASE WHEN $4 THEN $5::uuid ELSE solicitud_id END,
              resuelta     = coalesce($6, resuelta),
              resuelta_en  = CASE WHEN $6 IS TRUE AND NOT resuelta THEN now() WHEN $6 IS FALSE THEN NULL ELSE resuelta_en END
        WHERE id = $1 AND NOT eliminado`,
      [id, c.descripcion ?? null, c.storyPoints ?? null, c.solicitudId !== undefined, c.solicitudId ?? null, c.resuelta ?? null]);
    return this.unaDeuda(id);
  }

  async eliminarDeuda(id: string): Promise<void> {
    await db().query(`UPDATE gestion.deuda_tecnica SET eliminado = true WHERE id = $1`, [id]);
  }

  private async unaDeuda(id: string): Promise<DeudaVista> {
    const { rows: [r] } = await db().query(`SELECT ${COLUMNAS_DEUDA} ${DESDE_DEUDA} WHERE dt.id = $1`, [id]);
    return r;
  }

  /** Una solicitud asociada a un riesgo o deuda debe pertenecer al mismo proyecto. */
  async validarSolicitudDelProyecto(proyectoId: string, solicitudId: string | null | undefined): Promise<void> {
    if (!solicitudId) return;
    const { rowCount } = await db().query(`SELECT 1 FROM gestion.solicitudes WHERE id = $1 AND proyecto_id = $2 AND NOT eliminado`, [solicitudId, proyectoId]);
    if (!rowCount) throw new ErrorDominio('SOLICITUD_AJENA', 'La solicitud indicada no pertenece a este proyecto');
  }
}
