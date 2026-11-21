import {
  aplicarRegistro, ESTADOS_CON_TAREAS, esquemaRegistroAvance, serieHoras,
  type CambioSubtarea, type ContextoTrabajo, type DetalleTarea, type EstadoTarea, type MiActividad, type MiTarea, type NuevaTarea,
  type OpcionesNuevaTarea, type RegistroAvance, type RegistroAvanceNuevo, type SubtareaVista, type TareaVista,
} from '@sierraflow/contratos';
import { apiFetch } from '@/lib/api';
import { dbLocal } from '@/lib/offline/db';
import { motorSync } from '@/lib/offline/sync/motor-sync';
import { GRUPOS_DEMO } from '@/modulos/asignacion/infraestructura/fuente-asignacion';
import { fuenteDemo as evaluacionDemo } from '@/modulos/evaluacion/infraestructura/fuente-evaluacion';
import { fuenteDemo as proyectosDemo } from '@/modulos/proyectos/infraestructura/fuente-proyectos';
import { vistaLocal } from '@/modulos/adjuntos/infraestructura/fuente-adjuntos';

export interface Actor { id: string; nombre: string }

/**
 * Puerto de datos del Centro de trabajo del ingeniero ("Registrar avances").
 * En modo real habla con la API; en demo guarda checklist y bitácora en IndexedDB.
 */
export interface FuenteAvances {
  misTareas(actor: Actor): Promise<MiTarea[]>;
  detalle(tareaId: string, actor: Actor): Promise<DetalleTarea>;
  registrar(tareaId: string, datos: RegistroAvanceNuevo, actor: Actor): Promise<DetalleTarea>;
  crearSubtarea(tareaId: string, titulo: string, actor: Actor): Promise<SubtareaVista[]>;
  actualizarSubtarea(tareaId: string, id: string, cambio: CambioSubtarea, actor: Actor): Promise<SubtareaVista[]>;
  eliminarSubtarea(tareaId: string, id: string): Promise<SubtareaVista[]>;
  miActividad(actor: Actor): Promise<MiActividad>;
  opciones(actor: Actor): Promise<OpcionesNuevaTarea>;
  /** Devuelve el id de la tarea creada. */
  crearTarea(contexto: ContextoTrabajo, datos: NuevaTarea, actor: Actor): Promise<string>;
  eliminarTarea(tarea: MiTarea): Promise<void>;
}

export const fuenteApi: FuenteAvances = {
  misTareas: () => apiFetch('/evaluacion/mis-tareas'),
  detalle: (id) => apiFetch(`/evaluacion/tareas/${id}`),
  async registrar(id, datos) {
    const d = await apiFetch<DetalleTarea>(`/evaluacion/tareas/${id}/avances`, { method: 'POST', body: datos });
    motorSync.programar(300); // trae el nuevo avance de la solicitud a IndexedDB
    return d;
  },
  crearSubtarea: (id, titulo) => apiFetch(`/evaluacion/tareas/${id}/subtareas`, { method: 'POST', body: { titulo } }),
  actualizarSubtarea: (_t, id, cambio) => apiFetch(`/evaluacion/subtareas/${id}`, { method: 'PATCH', body: cambio }),
  eliminarSubtarea: (_t, id) => apiFetch(`/evaluacion/subtareas/${id}`, { method: 'DELETE' }),
  miActividad: () => apiFetch('/evaluacion/mi-actividad'),
  opciones: () => apiFetch('/evaluacion/opciones-nueva-tarea'),
  async crearTarea(ctx, datos) {
    const ruta = ctx.tipo === 'SOLICITUD' ? `/evaluacion/solicitudes/${ctx.id}/tareas` : `/evaluacion/proyectos/${ctx.id}/tareas`;
    const t = await apiFetch<TareaVista>(ruta, { method: 'POST', body: datos });
    motorSync.programar(300);
    return t.id;
  },
  async eliminarTarea(t) {
    await apiFetch(`/evaluacion/tareas/${t.id}?version=${t.version}`, { method: 'DELETE' });
    motorSync.programar(300);
  },
};

// ---------------------------------------------------------------------
// Modo demo: checklist y bitácora de cada tarea en la tabla "meta" de IndexedDB
// ---------------------------------------------------------------------
interface ExtrasDemo { subtareas: SubtareaVista[]; bitacora: RegistroAvance[]; creadaPor: string | null }
const claveExtras = (id: string) => `avances:${id}`;
const ahora = () => new Date().toISOString();
const hoy = () => new Date().toISOString().slice(0, 10);
const haceDias = (d: number, h = 10) => new Date(Date.now() - d * 86_400_000 + (h - 12) * 3_600_000).toISOString();

const CHECKLIST_BASE = ['Análisis y diseño técnico', 'Implementación', 'Pruebas unitarias', 'Revisión de código (pull request)'];

/** Primera visita a una tarea en demo: checklist y bitácora de ejemplo coherentes con su avance. */
function extrasIniciales(t: MiTarea): ExtrasDemo {
  const hechas = Math.round((t.avancePct / 100) * CHECKLIST_BASE.length);
  const subtareas = CHECKLIST_BASE.map((titulo, i) => ({
    id: crypto.randomUUID(), titulo, completada: i < hechas, orden: i + 1,
    completadaEn: i < hechas ? haceDias(6 - i) : null, completadaPor: i < hechas ? (t.responsable ?? 'Equipo') : null,
  }));
  const bitacora: RegistroAvance[] = [];
  if (t.avancePct > 0) {
    const autor = { usuarioId: t.responsableId ?? 'demo', usuario: t.responsable ?? 'Equipo' };
    const mitad = Math.round(t.avancePct / 2 / 5) * 5;
    const base = { tareaId: t.id, tareaTitulo: t.titulo, ...autor, tipo: 'AVANCE' as const, estadoAnterior: null, estadoNuevo: null };
    bitacora.push(
      { ...base, id: crypto.randomUUID(), avanceAnterior: mitad, avanceNuevo: t.avancePct, horas: Math.max(1, Math.round(t.horasReales / 2)),
        fechaTrabajo: haceDias(1).slice(0, 10), nota: 'Avance sobre la implementación principal; quedan pendientes los casos borde.',
        evidenciaUrl: 'https://github.com/sierrainnova/sierraflow/pull/42', creadoEn: haceDias(1, 17), adjuntos: [] },
      { ...base, id: crypto.randomUUID(), avanceAnterior: 0, avanceNuevo: mitad, horas: Math.max(1, Math.round(t.horasReales / 2)),
        fechaTrabajo: haceDias(4).slice(0, 10), nota: 'Diseño técnico revisado con el líder.', evidenciaUrl: null,
        estadoAnterior: 'PENDIENTE', estadoNuevo: 'EN_PROGRESO', creadoEn: haceDias(4, 16), adjuntos: [] },
    );
  }
  return { subtareas, bitacora, creadaPor: null };
}

async function extras(t: MiTarea): Promise<ExtrasDemo> {
  const guardado = (await dbLocal.meta.get(claveExtras(t.id)))?.valor as ExtrasDemo | undefined;
  if (guardado) return guardado;
  const nuevo = extrasIniciales(t);
  await dbLocal.meta.put({ clave: claveExtras(t.id), valor: nuevo });
  return nuevo;
}
const guardarExtras = (id: string, e: ExtrasDemo) => dbLocal.meta.put({ clave: claveExtras(id), valor: e });

interface ProyectoDemoMin { id: string; codigo: string; nombre: string; estado: string; tareasProyecto?: TareaVista[] }
const proyectosDemoLeidos = async () => {
  await proyectosDemo.listado(); // asegura que existan los proyectos de ejemplo
  return ((await dbLocal.meta.get('pm:proyectos'))?.valor as ProyectoDemoMin[] | undefined) ?? [];
};

/** Todas las tareas del demo (de solicitudes y de proyectos) con checklist y bitácora. */
async function todasDemo(actor: Actor): Promise<MiTarea[]> {
  const deSolicitudes = await evaluacionDemo.misTareas('__todas__');
  const deProyectos: MiTarea[] = (await proyectosDemoLeidos()).flatMap((p) => (p.tareasProyecto ?? []).map((t) => ({
    ...t, solicitudId: null, solicitudCodigo: null, solicitudTitulo: null, proyectoId: p.id, proyectoCodigo: p.codigo,
    proyectoNombre: p.nombre, editable: !['CERRADO', 'CANCELADO'].includes(p.estado),
    subtareasTotal: 0, subtareasHechas: 0, ultimoRegistro: null, creadaPorMi: false,
  })));
  const lista = [...deSolicitudes, ...deProyectos];
  return Promise.all(lista.map(async (t) => {
    const e = await extras(t);
    return {
      ...t,
      responsable: t.responsable ?? (e.creadaPor === actor.id ? actor.nombre : null),
      subtareasTotal: e.subtareas.length, subtareasHechas: e.subtareas.filter((s) => s.completada).length,
      ultimoRegistro: e.bitacora[0]?.creadoEn ?? null, creadaPorMi: e.creadaPor === actor.id,
    };
  }));
}

async function tareaDemo(id: string, actor: Actor): Promise<MiTarea> {
  const t = (await todasDemo(actor)).find((x) => x.id === id);
  if (!t) throw new Error('La tarea no existe');
  return t;
}

async function detalleDemo(id: string, actor: Actor): Promise<DetalleTarea> {
  const tarea = await tareaDemo(id, actor);
  const e = await extras(tarea);
  const s = tarea.solicitudId ? await dbLocal.solicitudes.get(tarea.solicitudId) : null;
  // Evidencias en archivo de cada registro (en demo quedan en IndexedDB)
  const archivos = (await dbLocal.adjuntos.where('tareaId').equals(id).toArray()).filter((a) => a.estado === 'DEMO');
  const bitacora = e.bitacora.map((r) => ({
    ...r, adjuntos: archivos.filter((a) => a.avanceId === r.id).sort((a, b) => a.creadoEn.localeCompare(b.creadoEn)).map(vistaLocal),
  }));
  return {
    tarea, subtareas: e.subtareas, bitacora, estadoSolicitud: s?.estado ?? null,
    permisos: { registrar: tarea.editable, checklist: tarea.editable },
  };
}

export const fuenteDemo: FuenteAvances = {
  // En demo los responsables son ingenieros ficticios: se muestran las tareas de todo el equipo
  misTareas: (actor) => todasDemo(actor),
  detalle: detalleDemo,

  async registrar(id, entrada, actor) {
    const datos = esquemaRegistroAvance.parse(entrada);
    const t = await tareaDemo(id, actor);
    if (!t.editable) throw new Error('La solicitud o el proyecto ya no admite cambios');
    if (t.version !== datos.version) throw new Error('La tarea cambió; recarga e intenta de nuevo');
    const r = aplicarRegistro(t, datos);
    const cambio = { version: t.version, estado: r.estado, avancePct: r.avancePct, horasReales: r.horasReales };
    if (t.solicitudId) await evaluacionDemo.actualizarTarea(id, cambio);
    else await proyectosDemo.actualizarTareaProyecto(id, cambio);
    const e = await extras(t);
    e.bitacora.unshift({
      id: crypto.randomUUID(), tareaId: id, tareaTitulo: t.titulo, usuarioId: actor.id, usuario: actor.nombre, tipo: 'AVANCE',
      avanceAnterior: t.avancePct, avanceNuevo: r.avancePct,
      estadoAnterior: r.estado !== t.estado ? t.estado : null, estadoNuevo: r.estado !== t.estado ? (r.estado as EstadoTarea) : null,
      horas: datos.horas, fechaTrabajo: datos.fechaTrabajo ?? hoy(), nota: datos.nota || null, evidenciaUrl: datos.evidenciaUrl || null,
      creadoEn: ahora(), adjuntos: [],
    });
    await guardarExtras(id, e);
    return { ...(await detalleDemo(id, actor)), registroId: e.bitacora[0]!.id };
  },

  async crearSubtarea(tareaId, titulo, actor) {
    const e = await extras(await tareaDemo(tareaId, actor));
    e.subtareas.push({ id: crypto.randomUUID(), titulo: titulo.trim(), completada: false, completadaEn: null, completadaPor: null,
      orden: (e.subtareas.at(-1)?.orden ?? 0) + 1 });
    await guardarExtras(tareaId, e);
    return e.subtareas;
  },

  async actualizarSubtarea(tareaId, id, cambio, actor) {
    const t = await tareaDemo(tareaId, actor);
    const e = await extras(t);
    const st = e.subtareas.find((s) => s.id === id);
    if (!st) throw new Error('La subtarea no existe');
    if (cambio.titulo !== undefined) st.titulo = cambio.titulo.trim();
    if (cambio.completada !== undefined && cambio.completada !== st.completada) {
      st.completada = cambio.completada;
      st.completadaEn = cambio.completada ? ahora() : null;
      st.completadaPor = cambio.completada ? actor.nombre : null;
      if (cambio.completada) {
        e.bitacora.unshift({
          id: crypto.randomUUID(), tareaId, tareaTitulo: t.titulo, usuarioId: actor.id, usuario: actor.nombre, tipo: 'SUBTAREA',
          avanceAnterior: null, avanceNuevo: null, estadoAnterior: null, estadoNuevo: null, horas: 0, fechaTrabajo: hoy(),
          nota: `Completó: ${st.titulo}`, evidenciaUrl: null, creadoEn: ahora(), adjuntos: [],
        });
      }
    }
    await guardarExtras(tareaId, e);
    return e.subtareas;
  },

  async eliminarSubtarea(tareaId, id) {
    const e = (await dbLocal.meta.get(claveExtras(tareaId)))?.valor as ExtrasDemo | undefined;
    if (!e) return [];
    e.subtareas = e.subtareas.filter((s) => s.id !== id);
    await guardarExtras(tareaId, e);
    return e.subtareas;
  },

  async miActividad(actor) {
    const todas = (await dbLocal.meta.where('clave').startsWith('avances:').toArray())
      .flatMap((m) => (m.valor as ExtrasDemo).bitacora).map((r) => ({ ...r, adjuntos: r.adjuntos ?? [] }));
    todas.sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
    const propias = todas.filter((r) => r.usuarioId === actor.id);
    const base = propias.length ? propias : todas;
    return {
      recientes: base.slice(0, 15),
      horasPorDia: serieHoras(base.map((r) => ({ fecha: r.fechaTrabajo, horas: r.horas })), hoy(), 14),
    };
  },

  async opciones() {
    const sols = await dbLocal.solicitudes.where('estado').anyOf(ESTADOS_CON_TAREAS).toArray();
    const proyectos = (await proyectosDemoLeidos()).filter((p) => !['CERRADO', 'CANCELADO'].includes(p.estado));
    return {
      contextos: [
        ...sols.map((s) => ({ tipo: 'SOLICITUD' as const, id: s.id, codigo: s.codigo, titulo: s.titulo, proyecto: s.proyectoNombre ?? null })),
        ...proyectos.map((p) => ({ tipo: 'PROYECTO' as const, id: p.id, codigo: p.codigo, titulo: p.nombre, proyecto: null })),
      ],
      grupos: GRUPOS_DEMO.map((g) => ({ id: g.id, nombre: g.nombre })),
    };
  },

  async crearTarea(ctx, datos, actor) {
    const t = ctx.tipo === 'SOLICITUD'
      ? await evaluacionDemo.crearTarea(ctx.id, { ...datos, responsableId: null })
      : await proyectosDemo.crearTareaProyecto(ctx.id, { ...datos, responsableId: null });
    await guardarExtras(t.id, {
      subtareas: [], creadaPor: actor.id,
      bitacora: [{
        id: crypto.randomUUID(), tareaId: t.id, tareaTitulo: t.titulo, usuarioId: actor.id, usuario: actor.nombre, tipo: 'CREACION',
        avanceAnterior: null, avanceNuevo: null, estadoAnterior: null, estadoNuevo: null, horas: 0, fechaTrabajo: hoy(),
        nota: 'Tarea propuesta por el ingeniero', evidenciaUrl: null, creadoEn: ahora(), adjuntos: [],
      }],
    });
    return t.id;
  },

  async eliminarTarea(t) {
    if (t.solicitudId) await evaluacionDemo.eliminarTarea(t.id, t.version);
    else await proyectosDemo.eliminarTareaProyecto(t.id, t.version);
    await dbLocal.meta.delete(claveExtras(t.id));
  },
};
