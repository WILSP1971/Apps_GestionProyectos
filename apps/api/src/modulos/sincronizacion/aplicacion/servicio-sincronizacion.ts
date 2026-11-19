import { Injectable, Logger } from '@nestjs/common';
import { z, ZodError } from 'zod';
import {
  ESTADOS, esquemaNuevaSolicitud,
  type CursoresSync, type OperacionSync, type PeticionPush, type ResultadoOperacion, type RespuestaPush,
} from '@sierraflow/contratos';
import { ConflictoConcurrencia, ErrorDominio } from '../../../compartido/dominio/errores';
import { UsuarioActual } from '../../../compartido/dominio/usuario-actual';
import { db, enTransaccion } from '../../../compartido/infraestructura/base-datos';
import { CambiarEstadoSolicitudCasoUso } from '../../solicitudes/aplicacion/cambiar-estado.caso-uso';
import { ComentarCasoUso } from '../../solicitudes/aplicacion/comentar.caso-uso';
import { CrearSolicitudCasoUso } from '../../solicitudes/aplicacion/crear-solicitud.caso-uso';
import { MarcarCriterioCasoUso } from '../../solicitudes/aplicacion/marcar-criterio.caso-uso';
import { LecturaSync } from '../infraestructura/lectura-sync';
import { VersionesLote } from './versiones-lote';

const payloadCambioEstado = z.object({ hacia: z.enum(ESTADOS), comentario: z.string().max(2000).optional().nullable() });
const payloadCriterio = z.object({ criterioId: z.string().uuid(), cumplido: z.boolean() });
const payloadComentario = z.object({ id: z.string().uuid(), contenido: z.string().min(1).max(10_000), padreId: z.string().uuid().optional() });

/**
 * Sincronización Offline-First.
 * push: aplica la bandeja de salida del cliente EN ORDEN, cada operación en su propia transacción,
 *       reutilizando los mismos casos de uso que la API REST (una sola fuente de reglas de negocio).
 *       Es idempotente: el resultado de cada idOperacion queda registrado en sync_operaciones.
 * pull: devuelve los cambios posteriores a los cursores del cliente.
 */
@Injectable()
export class ServicioSincronizacion {
  private readonly log = new Logger('Sincronizacion');

  constructor(
    private readonly crear: CrearSolicitudCasoUso,
    private readonly cambiarEstado: CambiarEstadoSolicitudCasoUso,
    private readonly marcarCriterio: MarcarCriterioCasoUso,
    private readonly comentar: ComentarCasoUso,
    private readonly lectura: LecturaSync,
  ) {}

  async push(peticion: PeticionPush, u: UsuarioActual): Promise<RespuestaPush> {
    const versiones = new VersionesLote();
    const resultados: ResultadoOperacion[] = [];

    for (const op of peticion.operaciones) {
      const previa = await db().query(
        `SELECT resultado FROM gestion.sync_operaciones WHERE id_operacion = $1 AND usuario_id = $2`, [op.idOperacion, u.id]);
      if (previa.rows[0]) {
        resultados.push(previa.rows[0].resultado);
        continue;
      }

      let resultado: ResultadoOperacion;
      try {
        resultado = await enTransaccion(u.id, async () => {
          await this.aplicar(op, u, versiones);
          const [solicitud] = op.entidad === 'notificacion' ? [] : await this.lectura.solicitudesPorIds([op.entidadId], u);
          const r: ResultadoOperacion = { idOperacion: op.idOperacion, estado: 'ok', solicitud: solicitud ?? null };
          await this.registrar(op, peticion.dispositivoId, u, r);
          if (solicitud) versiones.registrar(op.entidadId, op.versionBase, solicitud.version);
          return r;
        });
      } catch (e) {
        resultado = await this.resultadoDeError(op, e, u);
        if (resultado.estado !== 'error') await this.registrar(op, peticion.dispositivoId, u, resultado);
      }
      resultados.push(resultado);
      // Tras una falla temporal se detiene el lote: el cliente reintentará en el mismo orden
      if (resultado.estado === 'error') break;
    }
    return { resultados };
  }

  pull(cursores: CursoresSync, limite: number, u: UsuarioActual) {
    return this.lectura.pull(cursores, limite, u);
  }

  private async aplicar(op: OperacionSync, u: UsuarioActual, versiones: VersionesLote): Promise<void> {
    const version = versiones.resolver(op.entidadId, op.versionBase);
    switch (op.tipo) {
      case 'crear': {
        const dto = esquemaNuevaSolicitud.parse({ ...(op.payload as object), id: op.entidadId });
        await this.crear.ejecutar(dto, u);
        return;
      }
      case 'cambiar_estado': {
        const p = payloadCambioEstado.parse(op.payload);
        await this.cambiarEstado.ejecutar(op.entidadId, { hacia: p.hacia, comentario: p.comentario ?? undefined, version }, u);
        return;
      }
      case 'marcar_criterio': {
        const p = payloadCriterio.parse(op.payload);
        await this.marcarCriterio.ejecutar(op.entidadId, { ...p, version }, u);
        return;
      }
      case 'comentar': {
        const p = payloadComentario.parse(op.payload);
        await this.comentar.ejecutar(op.entidadId, p, u);
        return;
      }
      case 'leer_notificacion': {
        await db().query(
          `UPDATE gestion.notificaciones SET leida = true, fecha_lectura = coalesce(fecha_lectura, now())
            WHERE id = $1 AND usuario_id = $2`, [op.entidadId, u.id]);
        return;
      }
    }
  }

  private async resultadoDeError(op: OperacionSync, e: unknown, u: UsuarioActual): Promise<ResultadoOperacion> {
    const vigente = async () => op.entidad === 'notificacion'
      ? null
      : (await this.lectura.solicitudesPorIds([op.entidadId], u).catch(() => []))[0] ?? null;
    if (e instanceof ConflictoConcurrencia) {
      return { idOperacion: op.idOperacion, estado: 'conflicto', codigo: e.codigo, mensaje: e.message, solicitud: await vigente() };
    }
    if (e instanceof ErrorDominio) {
      return { idOperacion: op.idOperacion, estado: 'rechazada', codigo: e.codigo, mensaje: e.message, solicitud: await vigente() };
    }
    if (e instanceof ZodError) {
      return { idOperacion: op.idOperacion, estado: 'rechazada', codigo: 'DATOS_INVALIDOS', mensaje: 'La operación tiene datos inválidos', solicitud: await vigente() };
    }
    // Violaciones de restricciones de la BD (p. ej. trigger de transiciones) también son definitivas
    const pg = e as { code?: string; message?: string };
    if (pg?.code && /^(23|22|P0)/.test(pg.code)) {
      return { idOperacion: op.idOperacion, estado: 'rechazada', codigo: 'RESTRICCION_BD', mensaje: pg.message ?? 'Restricción de datos', solicitud: await vigente() };
    }
    this.log.error(`Operación ${op.idOperacion} (${op.tipo}) falló`, e as Error);
    return { idOperacion: op.idOperacion, estado: 'error', mensaje: 'Error temporal del servidor; se reintentará' };
  }

  private async registrar(op: OperacionSync, dispositivoId: string, u: UsuarioActual, r: ResultadoOperacion) {
    await db().query(
      `INSERT INTO gestion.sync_operaciones(id_operacion, usuario_id, dispositivo_id, entidad, entidad_id, tipo, resultado)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id_operacion) DO NOTHING`,
      [op.idOperacion, u.id, dispositivoId, op.entidad, op.entidadId, op.tipo, JSON.stringify(r)]);
  }
}
