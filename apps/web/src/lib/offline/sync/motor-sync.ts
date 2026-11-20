import type { CursoresSync, RespuestaPull, RespuestaPush, SolicitudSync } from '@sierraflow/contratos';
import { apiFetch, ErrorSesion } from '@/lib/api';
import { dbLocal, type EstadoSync, type SolicitudLocal } from '../db';
import { planificarResultados, type PlanResultados } from './plan';

/**
 * Motor de sincronización Offline-First.
 *  1. push: envía la bandeja de salida EN ORDEN (lotes de 50) y aplica el plan de resultados.
 *  2. pull: trae los cambios posteriores a los cursores y actualiza IndexedDB.
 * Se dispara al iniciar, al recuperar la conexión, al volver a la pestaña, tras cada cambio local
 * y cada minuto. Con Web Locks solo una pestaña sincroniza a la vez.
 */

export const EVENTO_CAMBIO_LOCAL = 'sierraflow:cambio-local';
export const EVENTO_CONFLICTO = 'sierraflow:conflicto';

const LOTE_PUSH = 50;
const LIMITE_PULL = 200;
const CURSORES_INICIALES: CursoresSync = { solicitudes: 0, comentarios: 0, notificaciones: 0 };

const VERSION_DATOS = 2;

export function aSolicitudLocal(s: SolicitudSync, pendiente = false): SolicitudLocal {
  const { eliminado: _e, seq: _s, ...resto } = s;
  return {
    ...resto,
    objetivos: s.objetivos || undefined,
    justificacion: s.justificacion || undefined,
    fechaDeseada: s.fechaDeseada || undefined,
    pendienteSync: pendiente ? 1 : 0,
  };
}

async function guardarEstado(estado: EstadoSync) {
  const previo = (await dbLocal.meta.get('estado-sync'))?.valor as EstadoSync | undefined;
  await dbLocal.meta.put({ clave: 'estado-sync', valor: { ultimaSync: previo?.ultimaSync, ...estado } });
}

async function dispositivoId(): Promise<string> {
  const guardado = (await dbLocal.meta.get('dispositivo-id'))?.valor as string | undefined;
  if (guardado) return guardado;
  const nuevo = crypto.randomUUID();
  await dbLocal.meta.put({ clave: 'dispositivo-id', valor: nuevo });
  return nuevo;
}

async function aplicarPlan(plan: PlanResultados) {
  await dbLocal.transaction('rw', [dbLocal.bandejaSalida, dbLocal.solicitudes, dbLocal.comentarios, dbLocal.conflictos], async () => {
    await dbLocal.bandejaSalida.bulkDelete(plan.eliminarOps);
    for (const r of plan.rebasarOps) await dbLocal.bandejaSalida.update(r.idOperacion, { versionBase: r.versionBase });
    for (const r of plan.reintentar) await dbLocal.bandejaSalida.update(r.idOperacion, { intentos: r.intentos, error: r.error });
    for (const g of plan.guardarSolicitudes) await dbLocal.solicitudes.put(aSolicitudLocal(g.solicitud, g.pendiente));
    for (const c of plan.confirmarVersion) await dbLocal.solicitudes.update(c.id, { version: c.version, codigo: c.codigo });
    for (const id of plan.comentariosConfirmados) await dbLocal.comentarios.update(id, { pendienteSync: 0 });
    await dbLocal.comentarios.bulkDelete(plan.comentariosRechazados);
    if (plan.conflictos.length) await dbLocal.conflictos.bulkPut(plan.conflictos);
    for (const e of plan.erroresCrear) await dbLocal.solicitudes.update(e.id, { errorSync: e.mensaje, pendienteSync: 0 });
  });
  if (plan.conflictos.length && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENTO_CONFLICTO, { detail: plan.conflictos }));
  }
}

class MotorSync {
  private iniciado = false;
  private enCurso = false;
  private temporizador?: ReturnType<typeof setTimeout>;
  private intervalo?: ReturnType<typeof setInterval>;
  private fallosSeguidos = 0;
  private readonly alCambiar = () => this.programar(400);
  private readonly alVolver = () => document.visibilityState === 'visible' && this.programar(0);
  private readonly alConectar = () => this.programar(0);
  private readonly alDesconectar = () => void guardarEstado({ fase: 'sin-conexion' });

  iniciar() {
    if (this.iniciado || typeof window === 'undefined') return;
    this.iniciado = true;
    window.addEventListener(EVENTO_CAMBIO_LOCAL, this.alCambiar);
    window.addEventListener('online', this.alConectar);
    window.addEventListener('offline', this.alDesconectar);
    document.addEventListener('visibilitychange', this.alVolver);
    this.intervalo = setInterval(() => this.programar(0), 60_000);
    this.programar(0);
  }

  detener() {
    if (!this.iniciado) return;
    this.iniciado = false;
    window.removeEventListener(EVENTO_CAMBIO_LOCAL, this.alCambiar);
    window.removeEventListener('online', this.alConectar);
    window.removeEventListener('offline', this.alDesconectar);
    document.removeEventListener('visibilitychange', this.alVolver);
    clearInterval(this.intervalo);
    clearTimeout(this.temporizador);
  }

  programar(retrasoMs = 500) {
    if (!this.iniciado) return;
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => void this.sincronizarAhora(), retrasoMs);
  }

  /** Sincroniza ya (también lo usa el botón del indicador de conexión). */
  async sincronizarAhora(): Promise<void> {
    if (!navigator.onLine) {
      await guardarEstado({ fase: 'sin-conexion' });
      return;
    }
    if (navigator.locks) {
      await navigator.locks.request('sierraflow-sync', { ifAvailable: true }, async (lock) => {
        if (lock) await this.ciclo();
      });
    } else {
      await this.ciclo();
    }
  }

  private async ciclo() {
    if (this.enCurso) return;
    this.enCurso = true;
    await guardarEstado({ fase: 'sincronizando' });
    try {
      await this.push();
      await this.pull();
      this.fallosSeguidos = 0;
      await guardarEstado({ fase: 'ok', ultimaSync: new Date().toISOString() });
    } catch (e) {
      this.fallosSeguidos++;
      if (e instanceof ErrorSesion) {
        await guardarEstado({ fase: 'sesion', mensaje: e.message });
      } else {
        await guardarEstado({ fase: navigator.onLine ? 'error' : 'sin-conexion', mensaje: (e as Error).message });
        // Reintento con espera exponencial: 5 s, 10 s, 20 s… hasta 5 min
        this.programar(Math.min(300_000, 5_000 * 2 ** (this.fallosSeguidos - 1)));
      }
    } finally {
      this.enCurso = false;
    }
  }

  private async push() {
    const id = await dispositivoId();
    for (let vuelta = 0; vuelta < 20; vuelta++) {
      const pendientes = await dbLocal.bandejaSalida.orderBy('creadoEn').toArray();
      if (!pendientes.length) return;
      const lote = pendientes.slice(0, LOTE_PUSH);
      const { resultados } = await apiFetch<RespuestaPush>('/sync/push', {
        method: 'POST',
        body: {
          dispositivoId: id,
          operaciones: lote.map(({ idOperacion, entidad, tipo, entidadId, payload, versionBase, creadoEn }) =>
            ({ idOperacion, entidad, tipo, entidadId, payload, versionBase, creadoEn })),
        },
      });
      const plan = planificarResultados(pendientes, resultados);
      await aplicarPlan(plan);
      if (plan.detener) throw new Error('El servidor no pudo aplicar los cambios; se reintentará');
      if (pendientes.length <= LOTE_PUSH) return;
    }
  }

  private async pull() {
    // Cuando cambia la forma de los datos que baja el servidor, se vuelve a descargar todo una vez
    // (v2: las solicitudes traen su proyecto)
    if ((await dbLocal.meta.get('version-datos'))?.valor !== VERSION_DATOS) {
      await dbLocal.meta.put({ clave: 'cursores', valor: CURSORES_INICIALES });
      await dbLocal.meta.put({ clave: 'version-datos', valor: VERSION_DATOS });
    }
    let cursores = ((await dbLocal.meta.get('cursores'))?.valor as CursoresSync | undefined) ?? CURSORES_INICIALES;
    for (let vuelta = 0; vuelta < 50; vuelta++) {
      const q = new URLSearchParams({
        solicitudes: String(cursores.solicitudes),
        comentarios: String(cursores.comentarios),
        notificaciones: String(cursores.notificaciones),
        limite: String(LIMITE_PULL),
      });
      const r = await apiFetch<RespuestaPull>(`/sync/pull?${q}`);
      await dbLocal.transaction('rw', [dbLocal.solicitudes, dbLocal.comentarios, dbLocal.notificaciones, dbLocal.bandejaSalida, dbLocal.meta], async () => {
        for (const s of r.solicitudes) {
          // No se pisan cambios locales aún no enviados: la respuesta del push traerá el estado final
          const pendientes = await dbLocal.bandejaSalida.where('entidadId').equals(s.id).count();
          if (pendientes) continue;
          if (s.eliminado) await dbLocal.solicitudes.delete(s.id);
          else await dbLocal.solicitudes.put(aSolicitudLocal(s));
        }
        for (const c of r.comentarios) {
          if (c.eliminado) await dbLocal.comentarios.delete(c.id);
          else await dbLocal.comentarios.put({ id: c.id, solicitudId: c.solicitudId, autor: c.autor, contenido: c.contenido, creadoEn: c.creadoEn, pendienteSync: 0 });
        }
        if (r.notificaciones.length) {
          await dbLocal.notificaciones.bulkPut(r.notificaciones.map(({ seq: _s, ...n }) => n));
        }
        await dbLocal.meta.put({ clave: 'cursores', valor: r.cursores });
      });
      cursores = r.cursores;
      if (!r.hayMas) return;
    }
  }
}

export const motorSync = new MotorSync();

/** Avisa al motor que hay un cambio local nuevo (lo llaman los casos de uso). */
export function avisarCambioLocal() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_CAMBIO_LOCAL));
}
