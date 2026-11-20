import {
  calcularFrentes, ESTADOS_CON_TAREAS, ESTADOS_EVALUABLES, letraCalificacion, notaGlobal, promedio1a5,
  type CambioTarea, type ContextoEvaluacion, type CriterioCalificacion, type EvaluacionVista, type MiTarea, type NuevaEvaluacion,
  type NuevaTarea, type ResumenEvaluable, type TareaVista,
} from '@sierraflow/contratos';
import { apiFetch } from '@/lib/api';
import { dbLocal, type SolicitudLocal } from '@/lib/offline/db';
import { motorSync } from '@/lib/offline/sync/motor-sync';
import { GRUPOS_DEMO, INGENIEROS_DEMO } from '@/modulos/asignacion/infraestructura/fuente-asignacion';

/**
 * Puerto de datos de la evaluación. En modo real habla con la API (requiere conexión: la nota
 * y el avance de todo el equipo se calculan en el servidor). En demo guarda todo en IndexedDB.
 */
export interface FuenteEvaluacion {
  listado(): Promise<ResumenEvaluable[]>;
  contexto(solicitudId: string): Promise<ContextoEvaluacion>;
  crearTarea(solicitudId: string, datos: NuevaTarea): Promise<TareaVista>;
  actualizarTarea(tareaId: string, datos: CambioTarea): Promise<TareaVista>;
  eliminarTarea(tareaId: string, version: number): Promise<void>;
  evaluar(solicitudId: string, datos: NuevaEvaluacion, evaluador: string): Promise<EvaluacionVista>;
  /** Tareas de las que es responsable quien consulta (pantalla "Registrar avances"). */
  misTareas(usuarioId: string): Promise<MiTarea[]>;
}

export const fuenteApi: FuenteEvaluacion = {
  listado: () => apiFetch('/evaluacion/solicitudes'),
  contexto: (id) => apiFetch(`/evaluacion/solicitudes/${id}`),
  async crearTarea(id, datos) {
    const t = await apiFetch<TareaVista>(`/evaluacion/solicitudes/${id}/tareas`, { method: 'POST', body: datos });
    motorSync.programar(300); // trae el nuevo avance de la solicitud a IndexedDB
    return t;
  },
  async actualizarTarea(id, datos) {
    const t = await apiFetch<TareaVista>(`/evaluacion/tareas/${id}`, { method: 'PATCH', body: datos });
    motorSync.programar(300);
    return t;
  },
  async eliminarTarea(id, version) {
    await apiFetch(`/evaluacion/tareas/${id}?version=${version}`, { method: 'DELETE' });
    motorSync.programar(300);
  },
  evaluar: (id, datos) => apiFetch(`/evaluacion/solicitudes/${id}/evaluaciones`, { method: 'POST', body: datos }),
  misTareas: () => apiFetch('/evaluacion/mis-tareas'),
};

// ---------------------------------------------------------------------
// Modo demo: tareas y evaluaciones en la tabla "meta" de IndexedDB
// ---------------------------------------------------------------------
const CRITERIOS_DEMO: CriterioCalificacion[] = [
  { id: 1, codigo: 'CRITERIOS', nombre: 'Cumplimiento de criterios de aceptación', descripcion: null, peso: 0.35 },
  { id: 3, codigo: 'PLAZOS', nombre: 'Cumplimiento de plazos', descripcion: null, peso: 0.25 },
  { id: 2, codigo: 'CODIGO_DOC', nombre: 'Código y documentación', descripcion: null, peso: 0.2 },
  { id: 4, codigo: 'IMPACTO_PROD', nombre: 'Impacto en producción (estabilidad)', descripcion: null, peso: 0.2 },
];

interface DatosDemo { tareas: TareaVista[]; evaluaciones: EvaluacionVista[] }
const clave = (id: string) => `evaluacion:${id}`;

const ingeniero = (nombre: string) => INGENIEROS_DEMO.find((i) => i.nombre === nombre);
const equipoDemo = (s: SolicitudLocal) =>
  s.asignados.filter((a) => a.rol !== undefined || ingeniero(a.nombre)).map((a) => ({
    usuarioId: a.usuarioId ?? ingeniero(a.nombre)?.usuarioId ?? a.nombre,
    nombre: a.nombre,
    rol: (a.rol as 'DESARROLLADOR' | 'QA' | 'REVISOR' | undefined) ?? 'DESARROLLADOR',
  }));

/** Primera visita a una solicitud en demo: tareas de ejemplo que reproducen su avance. */
function tareasIniciales(s: SolicitudLocal): TareaVista[] {
  if (!ESTADOS_CON_TAREAS.includes(s.estado) && s.estado !== 'CERRADA') return [];
  const equipo = equipoDemo(s);
  const g = (nombre: string) => GRUPOS_DEMO.find((x) => x.nombre === nombre)!;
  const base = [
    { titulo: 'Diseño técnico y modelo de datos', grupo: 'Backend', peso: 2 },
    { titulo: 'API e integración', grupo: 'Backend', peso: 3 },
    { titulo: 'Pantallas y flujo de usuario', grupo: 'Frontend', peso: 3 },
    { titulo: 'Pruebas funcionales y de regresión', grupo: 'QA', peso: 2 },
  ];
  const meta = s.estado === 'CERRADA' ? 100 : s.avancePct;
  return base.map((b, i) => {
    // reparte el avance: las primeras tareas van más adelantadas
    const avance = Math.max(0, Math.min(100, Math.round(meta * (1.4 - i * 0.25))));
    const resp = equipo[i % Math.max(equipo.length, 1)];
    return {
      id: crypto.randomUUID(), titulo: b.titulo, descripcion: null, grupoId: g(b.grupo).id, grupo: b.grupo,
      responsableId: resp?.usuarioId ?? null, responsable: resp?.nombre ?? null,
      estado: avance >= 100 ? 'COMPLETADA' : avance > 0 ? 'EN_PROGRESO' : 'PENDIENTE',
      peso: b.peso, avancePct: avance, horasEstimadas: b.peso * 8, horasReales: Math.round((b.peso * 8 * avance) / 100),
      fechaInicio: null, fechaFinPlan: null, version: 1,
    };
  });
}

async function leer(s: SolicitudLocal): Promise<DatosDemo> {
  const guardado = (await dbLocal.meta.get(clave(s.id)))?.valor as DatosDemo | undefined;
  if (guardado) return guardado;
  const nuevo: DatosDemo = { tareas: tareasIniciales(s), evaluaciones: [] };
  await dbLocal.meta.put({ clave: clave(s.id), valor: nuevo });
  return nuevo;
}

async function solicitud(id: string): Promise<SolicitudLocal> {
  const s = await dbLocal.solicitudes.get(id);
  if (!s) throw new Error('La solicitud no existe');
  return s;
}

/** Guarda tareas y recalcula el avance ponderado de la solicitud (como el trigger de la BD). */
async function guardarTareas(s: SolicitudLocal, datos: DatosDemo) {
  await dbLocal.meta.put({ clave: clave(s.id), valor: datos });
  const frentes = calcularFrentes(datos.tareas);
  const total = datos.tareas.reduce((a, t) => a + t.peso, 0);
  const avance = total ? Math.round((datos.tareas.reduce((a, t) => a + t.avancePct * t.peso, 0) / total) * 100) / 100 : 0;
  if (s.estado !== 'CERRADA') await dbLocal.solicitudes.update(s.id, { avancePct: avance, actualizadoEn: new Date().toISOString() });
  return frentes;
}

/** Mismas reglas que el trigger fn_tarea_completada. */
function normalizarTarea(t: TareaVista, anterior?: TareaVista): TareaVista {
  if (t.estado === 'COMPLETADA') return { ...t, avancePct: 100 };
  if (anterior?.estado === 'COMPLETADA' && t.avancePct === 100) return { ...t, avancePct: 90 };
  if (t.avancePct >= 100) return { ...t, avancePct: 100, estado: 'COMPLETADA' };
  if (t.avancePct > 0 && t.estado === 'PENDIENTE') return { ...t, estado: 'EN_PROGRESO' };
  return t;
}

async function buscarTarea(tareaId: string) {
  for (const s of await dbLocal.solicitudes.toArray()) {
    const datos = (await dbLocal.meta.get(clave(s.id)))?.valor as DatosDemo | undefined;
    const i = datos?.tareas.findIndex((t) => t.id === tareaId) ?? -1;
    if (datos && i >= 0) return { s, datos, i };
  }
  throw new Error('La tarea no existe');
}

export const fuenteDemo: FuenteEvaluacion = {
  async listado() {
    const lista = await dbLocal.solicitudes.where('estado').anyOf(['ASIGNADA', 'EN_DESARROLLO', 'EN_VALIDACION', 'CERRADA']).toArray();
    return Promise.all(lista.map(async (s) => {
      const d = await leer(s);
      const ultima = d.evaluaciones[0];
      return {
        id: s.id, codigo: s.codigo, titulo: s.titulo, estado: s.estado, departamento: s.departamento,
        departamentoColor: s.departamentoColor ?? null, avancePct: s.avancePct,
        tareas: d.tareas.length, tareasCompletadas: d.tareas.filter((t) => t.estado === 'COMPLETADA').length,
        ultimaNota: ultima?.calificacionGlobal ?? null, ultimaLetra: ultima?.calificacionLetra ?? null, ultimaFecha: ultima?.fecha ?? null,
      };
    }));
  },

  async contexto(id) {
    const s = await solicitud(id);
    const d = await leer(s);
    return {
      solicitud: {
        id: s.id, codigo: s.codigo, titulo: s.titulo, estado: s.estado, departamento: s.departamento,
        departamentoColor: s.departamentoColor ?? null, solicitante: s.solicitanteNombre, avancePct: s.avancePct,
        fechaDeseada: s.fechaDeseada ?? null,
      },
      criterios: CRITERIOS_DEMO,
      tareas: d.tareas,
      frentes: calcularFrentes(d.tareas),
      equipo: equipoDemo(s),
      grupos: GRUPOS_DEMO.map((g) => ({ id: g.id, nombre: g.nombre })),
      evaluaciones: d.evaluaciones,
      permisos: { evaluar: true, gestionarTareas: true },
    };
  },

  async crearTarea(id, datos) {
    const s = await solicitud(id);
    if (!ESTADOS_CON_TAREAS.includes(s.estado)) throw new Error('Las tareas solo se gestionan en solicitudes asignadas, en desarrollo o en validación');
    const d = await leer(s);
    const equipo = equipoDemo(s);
    const t: TareaVista = normalizarTarea({
      id: crypto.randomUUID(), titulo: datos.titulo, descripcion: datos.descripcion ?? null,
      grupoId: datos.grupoId ?? null, grupo: GRUPOS_DEMO.find((g) => g.id === datos.grupoId)?.nombre ?? null,
      responsableId: datos.responsableId ?? null, responsable: equipo.find((e) => e.usuarioId === datos.responsableId)?.nombre ?? null,
      estado: 'PENDIENTE', peso: datos.peso ?? 1, avancePct: 0, horasEstimadas: datos.horasEstimadas ?? null, horasReales: 0,
      fechaInicio: datos.fechaInicio ?? null, fechaFinPlan: datos.fechaFinPlan ?? null, version: 1,
    });
    d.tareas.push(t);
    await guardarTareas(s, d);
    return t;
  },

  async actualizarTarea(tareaId, cambio) {
    const { s, datos, i } = await buscarTarea(tareaId);
    const anterior = datos.tareas[i]!;
    if (anterior.version !== cambio.version) throw new Error('La tarea cambió; recarga e intenta de nuevo');
    const equipo = equipoDemo(s);
    const { version: _v, ...resto } = cambio;
    const definidos = Object.fromEntries(Object.entries(resto).filter(([, v]) => v !== undefined)) as Partial<TareaVista>;
    let t: TareaVista = { ...anterior, ...definidos, version: anterior.version + 1 };
    if (cambio.grupoId !== undefined) t.grupo = GRUPOS_DEMO.find((g) => g.id === cambio.grupoId)?.nombre ?? null;
    if (cambio.responsableId !== undefined) t.responsable = equipo.find((e) => e.usuarioId === cambio.responsableId)?.nombre ?? null;
    t = normalizarTarea(t, anterior);
    datos.tareas[i] = t;
    await guardarTareas(s, datos);
    if (s.estado === 'ASIGNADA' && (t.avancePct > 0 || t.estado !== 'PENDIENTE')) {
      await dbLocal.solicitudes.update(s.id, {
        estado: 'EN_DESARROLLO',
        historial: [...s.historial, { estadoAnterior: 'ASIGNADA', estadoNuevo: 'EN_DESARROLLO', usuario: 'Sistema',
          comentario: 'Inicio automático: primer avance de tareas', fecha: new Date().toISOString() }],
      });
    }
    return t;
  },

  async eliminarTarea(tareaId) {
    const { s, datos, i } = await buscarTarea(tareaId);
    datos.tareas.splice(i, 1);
    await guardarTareas(s, datos);
  },

  async misTareas(usuarioId) {
    const lista = await dbLocal.solicitudes.where('estado').anyOf(['ASIGNADA', 'EN_DESARROLLO', 'EN_VALIDACION', 'CERRADA']).toArray();
    const todas: MiTarea[] = [];
    for (const s of lista) {
      for (const t of (await leer(s)).tareas) {
        todas.push({
          ...t, solicitudId: s.id, solicitudCodigo: s.codigo, solicitudTitulo: s.titulo,
          proyectoId: s.proyectoId ?? null, proyectoCodigo: s.proyectoCodigo ?? null, proyectoNombre: s.proyectoNombre ?? null,
          editable: ESTADOS_CON_TAREAS.includes(s.estado),
        });
      }
    }
    // En demo los responsables son ingenieros ficticios: si ninguna tarea es del usuario, se muestran todas
    const propias = todas.filter((t) => t.responsableId === usuarioId);
    return propias.length ? propias : todas;
  },

  async evaluar(id, datos, evaluador) {
    const s = await solicitud(id);
    if (!ESTADOS_EVALUABLES[datos.tipo].includes(s.estado)) throw new Error('El estado actual de la solicitud no permite este tipo de evaluación');
    const d = await leer(s);
    const ponderados = CRITERIOS_DEMO.map((c) => ({ codigo: c.codigo, peso: c.peso, puntaje: datos.puntajes[c.codigo] ?? 3 }));
    const nota = notaGlobal(ponderados);
    const equipo = equipoDemo(s);
    const e: EvaluacionVista = {
      id: crypto.randomUUID(), tipo: datos.tipo, avanceReportado: s.avancePct, calificacionGlobal: nota,
      calificacionLetra: letraCalificacion(nota), calificacionTecnica: promedio1a5(ponderados.filter((p) => p.codigo !== 'PLAZOS')),
      calificacionPlazos: datos.puntajes.PLAZOS ?? null, evaluador, comentario: datos.comentario ?? null,
      fecha: new Date().toISOString(),
      detalle: ponderados.map((p) => ({ codigo: p.codigo, puntaje: p.puntaje })),
      individuales: datos.individuales.map((i) => ({
        usuarioId: i.usuarioId, nombre: equipo.find((x) => x.usuarioId === i.usuarioId)?.nombre ?? '—',
        puntaje: i.puntaje, comentario: i.comentario ?? null,
      })),
    };
    d.evaluaciones.unshift(e);
    await dbLocal.transaction('rw', dbLocal.meta, dbLocal.notificaciones, async () => {
      await dbLocal.meta.put({ clave: clave(s.id), valor: d });
      await dbLocal.notificaciones.add({
        id: crypto.randomUUID(), titulo: `${s.codigo}: evaluación registrada`, enlace: `/gestion/evaluacion/${s.id}`,
        mensaje: `Nota ${e.calificacionLetra} (${nota.toFixed(1)}/10) · avance ${Math.round(s.avancePct)}%.`,
        severidad: 'EXITO', leida: 0, creadoEn: e.fecha,
      });
    });
    return e;
  },
};
