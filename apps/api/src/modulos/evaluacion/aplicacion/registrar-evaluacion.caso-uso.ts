import { Injectable } from '@nestjs/common';
import {
  ESTADOS_EVALUABLES, ETIQUETA_TIPO_EVALUACION, letraCalificacion, notaGlobal, promedio1a5,
  type EvaluacionVista, type NuevaEvaluacion,
} from '@sierraflow/contratos';
import { ErrorDominio, NoEncontrado } from '../../../compartido/dominio/errores';
import { UsuarioActual } from '../../../compartido/dominio/usuario-actual';
import { db, enTransaccion } from '../../../compartido/infraestructura/base-datos';
import { publicarEnOutbox } from '../../../compartido/infraestructura/outbox';
import { ConsultasEvaluacion } from '../infraestructura/consultas-evaluacion';

/** Criterio que alimenta la calificación de plazos; el resto forma la calificación técnica. */
const CRITERIO_PLAZOS = 'PLAZOS';

/**
 * Registra una evaluación (seguimiento de avance o cierre):
 *  - nota global 0–10 = promedio ponderado de los criterios activos (1–5), y su letra (A+ … D);
 *  - foto del avance ponderado en ese momento;
 *  - calificación individual de cada ingeniero del equipo;
 *  - evento evaluacion.registrada → avisa al equipo (con nota) y al solicitante (solo el avance).
 */
@Injectable()
export class RegistrarEvaluacionCasoUso {
  constructor(private readonly consultas: ConsultasEvaluacion) {}

  async ejecutar(solicitudId: string, dto: NuevaEvaluacion, u: UsuarioActual): Promise<EvaluacionVista> {
    return enTransaccion(u.id, async () => {
      const { rows: [s] } = await db().query(
        `SELECT estado::text AS estado, avance_pct::float8 AS avance FROM gestion.solicitudes
          WHERE id = $1 AND NOT eliminado FOR UPDATE`, [solicitudId]);
      if (!s) throw new NoEncontrado('Solicitud', solicitudId);
      if (!ESTADOS_EVALUABLES[dto.tipo].includes(s.estado)) {
        throw new ErrorDominio('ESTADO_INVALIDO',
          `${ETIQUETA_TIPO_EVALUACION[dto.tipo]}: la solicitud debe estar ${dto.tipo === 'CIERRE' ? 'en validación o cerrada' : 'asignada, en desarrollo o en validación'}`);
      }

      const criterios = await this.consultas.criterios();
      const faltan = criterios.filter((c) => dto.puntajes[c.codigo] === undefined).map((c) => c.nombre);
      if (faltan.length) throw new ErrorDominio('CRITERIOS_INCOMPLETOS', `Califica todos los criterios: ${faltan.join(', ')}`);
      const desconocidos = Object.keys(dto.puntajes).filter((k) => !criterios.some((c) => c.codigo === k));
      if (desconocidos.length) throw new ErrorDominio('CRITERIO_DESCONOCIDO', `Criterios desconocidos: ${desconocidos.join(', ')}`);

      const ids = [...new Set(dto.individuales.map((i) => i.usuarioId))];
      if (ids.length !== dto.individuales.length) throw new ErrorDominio('DUPLICADO', 'Cada ingeniero se califica una sola vez');
      for (const id of ids) {
        if (!(await this.consultas.estaEnEquipo(solicitudId, id))) {
          throw new ErrorDominio('FUERA_DEL_EQUIPO', 'Solo se califica a ingenieros del equipo asignado');
        }
      }

      const ponderados = criterios.map((c) => ({ codigo: c.codigo, peso: c.peso, puntaje: dto.puntajes[c.codigo]! }));
      const nota = notaGlobal(ponderados);
      const letra = letraCalificacion(nota);
      const tecnica = promedio1a5(ponderados.filter((p) => p.codigo !== CRITERIO_PLAZOS));
      const plazos = ponderados.find((p) => p.codigo === CRITERIO_PLAZOS)?.puntaje ?? null;

      const { rows: [e] } = await db().query(
        `INSERT INTO gestion.evaluaciones(solicitud_id, evaluador_id, tipo, avance_reportado, calificacion_tecnica,
                                          calificacion_plazos, calificacion_global, calificacion_letra, comentario)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [solicitudId, u.id, dto.tipo, s.avance, tecnica, plazos, nota, letra, dto.comentario || null]);

      await db().query(
        `INSERT INTO gestion.evaluacion_detalle(evaluacion_id, criterio_id, puntaje)
         SELECT $1, c.id, (($2::jsonb) ->> c.codigo)::smallint
           FROM gestion.criterios_calificacion c WHERE c.activo`, [e.id, JSON.stringify(dto.puntajes)]);
      for (const i of dto.individuales) {
        await db().query(
          `INSERT INTO gestion.calificaciones_individuales(evaluacion_id, usuario_id, puntaje, comentario) VALUES ($1, $2, $3, $4)`,
          [e.id, i.usuarioId, i.puntaje, i.comentario || null]);
      }

      await publicarEnOutbox([{
        tipo: 'evaluacion.registrada', agregado: 'Solicitud', agregadoId: solicitudId, ocurridoEn: new Date(),
        payload: { evaluacionId: e.id, tipo: dto.tipo, nota, letra, avancePct: s.avance, actorId: u.id, comentario: dto.comentario ?? null },
      }]);

      return (await this.consultas.evaluaciones(solicitudId)).find((x) => x.id === e.id)!;
    });
  }
}
