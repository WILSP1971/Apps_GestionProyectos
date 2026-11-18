import type { ResultadoOperacion, SolicitudSync } from '@sierraflow/contratos';
import type { ConflictoLocal, OperacionPendiente } from '../db';

/**
 * Lógica PURA (sin IndexedDB) que decide qué hacer con la respuesta de /sync/push.
 * Separada del motor para poder probarla con node:test.
 */
export interface PlanResultados {
  eliminarOps: string[];
  rebasarOps: { idOperacion: string; versionBase: number }[];
  reintentar: { idOperacion: string; intentos: number; error: string }[];
  /** Reemplazar la copia local por la del servidor; `pendiente` si aún quedan operaciones locales */
  guardarSolicitudes: { solicitud: SolicitudSync; pendiente: boolean }[];
  /** Quedan cambios locales posteriores: solo se actualiza versión y código, para no perderlos */
  confirmarVersion: { id: string; version: number; codigo: string }[];
  comentariosConfirmados: string[];
  comentariosRechazados: string[];
  conflictos: ConflictoLocal[];
  erroresCrear: { id: string; mensaje: string }[];
  /** Hubo una falla temporal: detener y reintentar más tarde */
  detener: boolean;
}

const idComentario = (op: OperacionPendiente) => (op.payload as { id?: string } | null)?.id;

export function planificarResultados(
  pendientes: OperacionPendiente[],
  resultados: ResultadoOperacion[],
  ahora: string = new Date().toISOString(),
): PlanResultados {
  const plan: PlanResultados = {
    eliminarOps: [], rebasarOps: [], reintentar: [], guardarSolicitudes: [], confirmarVersion: [],
    comentariosConfirmados: [], comentariosRechazados: [], conflictos: [], erroresCrear: [], detener: false,
  };
  const quedan = [...pendientes];
  const rebases = new Map<string, number>();
  const guardar = new Map<string, { solicitud: SolicitudSync; pendiente: boolean }>();
  const confirmar = new Map<string, { id: string; version: number; codigo: string }>();

  const restantesDe = (entidadId: string) => quedan.filter((o) => o.entidadId === entidadId);

  /** Las operaciones locales siguientes de la misma solicitud se basan ahora en la versión del servidor. */
  const rebasar = (entidadId: string, version: number) => {
    for (const o of restantesDe(entidadId)) rebases.set(o.idOperacion, version);
  };

  for (const r of resultados) {
    const i = quedan.findIndex((o) => o.idOperacion === r.idOperacion);
    if (i < 0) continue;
    const [op] = quedan.splice(i, 1) as [OperacionPendiente];
    rebases.delete(op.idOperacion);

    if (r.estado === 'error') {
      plan.reintentar.push({ idOperacion: op.idOperacion, intentos: op.intentos + 1, error: r.mensaje ?? 'Error temporal' });
      plan.detener = true;
      break;
    }

    plan.eliminarOps.push(op.idOperacion);
    const quedanMas = restantesDe(op.entidadId).length > 0;

    if (r.estado === 'ok') {
      if (op.tipo === 'comentar' && idComentario(op)) plan.comentariosConfirmados.push(idComentario(op)!);
      if (r.solicitud) {
        rebasar(op.entidadId, r.solicitud.version);
        if (quedanMas) {
          confirmar.set(op.entidadId, { id: op.entidadId, version: r.solicitud.version, codigo: r.solicitud.codigo });
        } else {
          confirmar.delete(op.entidadId);
          guardar.set(op.entidadId, { solicitud: r.solicitud, pendiente: false });
        }
      }
      continue;
    }

    // conflicto o rechazada: el servidor manda (server-wins) y el usuario decide qué hacer
    plan.conflictos.push({
      idOperacion: op.idOperacion, entidadId: op.entidadId, tipo: op.tipo, payload: op.payload,
      motivo: r.estado, mensaje: r.mensaje ?? 'La operación no se pudo aplicar', fecha: ahora,
    });
    if (op.tipo === 'comentar' && idComentario(op)) plan.comentariosRechazados.push(idComentario(op)!);
    if (r.solicitud) {
      rebasar(op.entidadId, r.solicitud.version);
      confirmar.delete(op.entidadId);
      guardar.set(op.entidadId, { solicitud: r.solicitud, pendiente: quedanMas });
    } else if (op.tipo === 'crear') {
      plan.erroresCrear.push({ id: op.entidadId, mensaje: r.mensaje ?? 'El servidor rechazó la solicitud' });
    }
  }

  plan.rebasarOps = [...rebases].map(([idOperacion, versionBase]) => ({ idOperacion, versionBase }));
  plan.guardarSolicitudes = [...guardar.values()];
  plan.confirmarVersion = [...confirmar.values()];
  return plan;
}
