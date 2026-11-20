import {
  avancePonderado, calcularFinanzas, saludCronograma,
  type CambioDeuda, type CambioTarea, type NuevaTarea, type CambioProyecto, type CambioRiesgo, type CatalogosProyecto, type DetalleProyecto, type DeudaVista,
  type EstadoProyecto, type NuevaDeuda, type NuevoProyecto, type NuevoRiesgo, type ResumenProyecto, type RiesgoVista,
  type SolicitudDeProyecto, type TareaVista,
  transicionesProyecto, type CambioEstadoProyecto, type HistorialEstadoProyecto, type Rol,
} from '@sierraflow/contratos';
import { apiFetch } from '@/lib/api';
import { dbLocal, type SolicitudLocal } from '@/lib/offline/db';
import { GRUPOS_DEMO, INGENIEROS_DEMO } from '@/modulos/asignacion/infraestructura/fuente-asignacion';

/** Puerto de datos de la PM Suite: API real (requiere conexión) o datos locales en modo demo. */
export interface FuenteProyectos {
  listado(): Promise<ResumenProyecto[]>;
  detalle(id: string): Promise<DetalleProyecto>;
  catalogos(): Promise<CatalogosProyecto>;
  crear(datos: NuevoProyecto): Promise<DetalleProyecto>;
  actualizar(id: string, datos: CambioProyecto): Promise<DetalleProyecto>;
  eliminar(id: string): Promise<void>;
  vincular(id: string, agregar: string[], quitar: string[]): Promise<DetalleProyecto>;
  crearRiesgo(proyectoId: string, datos: NuevoRiesgo): Promise<RiesgoVista>;
  actualizarRiesgo(id: string, datos: CambioRiesgo): Promise<RiesgoVista>;
  eliminarRiesgo(id: string): Promise<void>;
  crearDeuda(proyectoId: string, datos: NuevaDeuda): Promise<DeudaVista>;
  actualizarDeuda(id: string, datos: CambioDeuda): Promise<DeudaVista>;
  eliminarDeuda(id: string): Promise<void>;
  /** Proyectos en los que participa el usuario (menú del ingeniero). */
  mios(): Promise<ResumenProyecto[]>;
  /** Regla 3: tareas propias del proyecto. */
  crearTareaProyecto(proyectoId: string, datos: NuevaTarea): Promise<TareaVista>;
  actualizarTareaProyecto(id: string, datos: CambioTarea): Promise<TareaVista>;
  eliminarTareaProyecto(id: string, version: number): Promise<void>;
  /** Ciclo de vida (incluye "Regresar a desarrollo" desde validación, con motivo). */
  cambiarEstado(id: string, datos: CambioEstadoProyecto, actor: { nombre: string; roles: readonly Rol[] }): Promise<DetalleProyecto>;
}

export const fuenteApi: FuenteProyectos = {
  listado: () => apiFetch('/proyectos'),
  detalle: (id) => apiFetch(`/proyectos/${id}`),
  catalogos: () => apiFetch('/proyectos/catalogos'),
  crear: (datos) => apiFetch('/proyectos', { method: 'POST', body: datos }),
  actualizar: (id, datos) => apiFetch(`/proyectos/${id}`, { method: 'PATCH', body: datos }),
  eliminar: (id) => apiFetch(`/proyectos/${id}`, { method: 'DELETE' }),
  vincular: (id, agregar, quitar) => apiFetch(`/proyectos/${id}/solicitudes`, { method: 'PUT', body: { agregar, quitar } }),
  crearRiesgo: (id, datos) => apiFetch(`/proyectos/${id}/riesgos`, { method: 'POST', body: datos }),
  actualizarRiesgo: (id, datos) => apiFetch(`/proyectos/riesgos/${id}`, { method: 'PATCH', body: datos }),
  eliminarRiesgo: (id) => apiFetch(`/proyectos/riesgos/${id}`, { method: 'DELETE' }),
  crearDeuda: (id, datos) => apiFetch(`/proyectos/${id}/deuda`, { method: 'POST', body: datos }),
  actualizarDeuda: (id, datos) => apiFetch(`/proyectos/deuda/${id}`, { method: 'PATCH', body: datos }),
  eliminarDeuda: (id) => apiFetch(`/proyectos/deuda/${id}`, { method: 'DELETE' }),
  mios: () => apiFetch('/proyectos/mios'),
  crearTareaProyecto: (id, datos) => apiFetch(`/evaluacion/proyectos/${id}/tareas`, { method: 'POST', body: datos }),
  actualizarTareaProyecto: (id, datos) => apiFetch(`/evaluacion/tareas/${id}`, { method: 'PATCH', body: datos }),
  eliminarTareaProyecto: (id, version) => apiFetch(`/evaluacion/tareas/${id}?version=${version}`, { method: 'DELETE' }),
  cambiarEstado: (id, datos) => apiFetch(`/proyectos/${id}/estado`, { method: 'PATCH', body: datos }),
};

// ---------------------------------------------------------------------
// Modo demo: proyectos, riesgos y deuda en la tabla "meta" de IndexedDB.
// Las solicitudes y tareas son las del modo demo (evaluación).
// ---------------------------------------------------------------------
interface ProyectoDemo {
  id: string; codigo: string; nombre: string; descripcion: string | null; estado: EstadoProyecto;
  departamentoId: string | null; departamento: string | null; departamentoColor: string | null;
  directorId: string | null; director: string | null; fechaInicio: string | null; fechaFinPlan: string | null;
  presupuesto: number | null; costoOtros: number; tarifaHora: number | null; beneficioEsperado: number | null;
  moneda: string; version: number; solicitudes: string[]; riesgos: RiesgoVista[]; deuda: DeudaVista[];
  tareasProyecto?: TareaVista[];
  historialEstados?: HistorialEstadoProyecto[];
}
const CLAVE = 'pm:proyectos';
const hoyIso = (d = 0) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

async function leer(): Promise<ProyectoDemo[]> {
  const guardado = (await dbLocal.meta.get(CLAVE))?.valor as ProyectoDemo[] | undefined;
  if (guardado) return guardado;
  const solicitudes = await dbLocal.solicitudes.toArray();
  const pagos = solicitudes.filter((s) => /pago/i.test(s.titulo)).map((s) => s.id);
  const inicial: ProyectoDemo[] = [{
    id: crypto.randomUUID(), codigo: 'PRY-0001', nombre: 'Plataforma de pagos regionales',
    descripcion: 'Cobros en COP/USD, conciliación y reportes para Finanzas.', estado: 'EN_EJECUCION',
    departamentoId: null, departamento: 'Finanzas y Contabilidad', departamentoColor: '#EAB308',
    directorId: 'demo', director: 'Usuario demo', fechaInicio: hoyIso(-30), fechaFinPlan: hoyIso(45),
    presupuesto: 120_000_000, costoOtros: 8_500_000, tarifaHora: 85_000, beneficioEsperado: 300_000_000,
    moneda: 'COP', version: 1, solicitudes: pagos,
    riesgos: [
      riesgoDemo('Cambios en la API del procesador de pagos', 3, 5, 'Encapsular la integración y monitorear el changelog del proveedor.'),
      riesgoDemo('Disponibilidad del equipo de QA en diciembre', 4, 3, 'Adelantar pruebas de regresión y automatizar los casos críticos.'),
      riesgoDemo('Retraso en aprobación de Seguridad de la Información', 2, 2, null),
    ],
    deuda: [
      deudaDemo('Pruebas de integración del webhook de pagos sin automatizar', 5),
      deudaDemo('Configuración de tasas de cambio quemada en el código', 3),
    ],
  }];
  await dbLocal.meta.put({ clave: CLAVE, valor: inicial });
  return inicial;
}
function riesgoDemo(titulo: string, probabilidad: number, impacto: number, plan: string | null): RiesgoVista {
  return { id: crypto.randomUUID(), titulo, descripcion: null, probabilidad, impacto, exposicion: probabilidad * impacto,
    planMitigacion: plan, responsableId: null, responsable: null, solicitudId: null, solicitudCodigo: null,
    estado: 'ABIERTO', version: 1, actualizadoEn: new Date().toISOString() };
}
function deudaDemo(descripcion: string, storyPoints: number): DeudaVista {
  return { id: crypto.randomUUID(), descripcion, storyPoints, solicitudId: null, solicitudCodigo: null,
    resuelta: false, creadoEn: new Date().toISOString(), resueltaEn: null };
}
const guardar = (lista: ProyectoDemo[]) => dbLocal.meta.put({ clave: CLAVE, valor: lista });

async function tareasDe(s: SolicitudLocal): Promise<TareaVista[]> {
  return ((await dbLocal.meta.get(`evaluacion:${s.id}`))?.valor as { tareas?: TareaVista[] } | undefined)?.tareas ?? [];
}

async function armar(p: ProyectoDemo): Promise<DetalleProyecto> {
  const sols = (await dbLocal.solicitudes.bulkGet(p.solicitudes)).filter((s): s is SolicitudLocal => !!s);
  const detalle: SolicitudDeProyecto[] = await Promise.all(sols.map(async (s) => {
    const fecha = (estado: string) => [...s.historial].reverse().find((h) => h.estadoNuevo === estado)?.fecha?.slice(0, 10) ?? null;
    const tareas = await tareasDe(s);
    const inicio = fecha('EN_DESARROLLO') ?? fecha('APROBADA') ?? fecha('ENVIADA') ?? s.creadoEn.slice(0, 10);
    return {
      id: s.id, codigo: s.codigo, titulo: s.titulo, estado: s.estado, avancePct: s.avancePct,
      inicio, fin: fecha('CERRADA') ?? s.fechaDeseada ?? null, cerrada: s.estado === 'CERRADA',
      tareas: tareas.map((t, i) => ({
        id: t.id, titulo: t.titulo, grupo: t.grupo, responsable: t.responsable, estado: t.estado, avancePct: t.avancePct,
        // en demo, las tareas sin fechas se reparten en bloques de una semana desde el inicio de la solicitud
        inicio: t.fechaInicio ?? sumarDias(inicio, i * 5), fin: t.fechaFinPlan ?? sumarDias(inicio, i * 5 + 7), dependeDe: null,
      })),
    };
  }));
  const propias = p.tareasProyecto ?? [];
  const todas = [...(await Promise.all(sols.map(tareasDe))).flat(), ...propias];
  const horasReales = todas.reduce((a, t) => a + t.horasReales, 0);
  const horasEstimadas = todas.reduce((a, t) => a + (t.horasEstimadas ?? 0), 0);
  // Igual que v_proyectos_indicadores: promedio de solicitudes + avance de las tareas propias como un componente más
  const componentes = [...sols.filter((s) => !['CANCELADA', 'RECHAZADA'].includes(s.estado)).map((s) => s.avancePct),
    ...(propias.length ? [avancePonderado(propias)] : [])];
  const avancePct = componentes.length ? Math.round((componentes.reduce((a, b) => a + b, 0) / componentes.length) * 100) / 100 : 0;
  return {
    ...p, solicitudes: sols.length, avancePct, horasReales, horasEstimadas,
    riesgosAltos: p.riesgos.filter((r) => ['ABIERTO', 'MATERIALIZADO'].includes(r.estado) && r.exposicion >= 10).length,
    deudaPendiente: p.deuda.filter((d) => !d.resuelta).reduce((a, d) => a + d.storyPoints, 0),
    salud: saludCronograma(avancePct, p.fechaInicio, p.fechaFinPlan, Date.now(), p.estado === 'CERRADO' || p.estado === 'CANCELADO'),
    finanzas: calcularFinanzas({ presupuesto: p.presupuesto, costoOtros: p.costoOtros, tarifaHora: p.tarifaHora, horasReales, horasEstimadas, beneficioEsperado: p.beneficioEsperado }),
    solicitudesDetalle: detalle,
    tareasProyecto: propias,
    historialEstados: p.historialEstados ?? [],
    riesgos: [...p.riesgos].sort((a, b) => b.exposicion - a.exposicion),
    deuda: p.deuda,
    permisos: { editar: true },
  };
}
function sumarDias(iso: string, dias: number) {
  return new Date(Date.parse(`${iso}T12:00:00`) + dias * 86_400_000).toISOString().slice(0, 10);
}

async function buscar(pred: (p: ProyectoDemo) => boolean) {
  const lista = await leer();
  const p = lista.find(pred);
  if (!p) throw new Error('No existe');
  return { lista, p };
}

export const fuenteDemo: FuenteProyectos = {
  async listado() {
    return Promise.all((await leer()).map(armar));
  },
  async detalle(id) {
    return armar((await buscar((p) => p.id === id)).p);
  },
  async catalogos() {
    const usadas = new Set((await leer()).flatMap((p) => p.solicitudes));
    const sols = await dbLocal.solicitudes.toArray();
    return {
      departamentos: [...new Set(sols.map((s) => s.departamento))].map((d) => ({ id: d, nombre: d })),
      directores: [{ id: 'demo', nombre: 'Usuario demo' }],
      responsables: [{ id: 'demo', nombre: 'Usuario demo' }, ...INGENIEROS_DEMO.map((i) => ({ id: i.usuarioId, nombre: i.nombre }))],
      grupos: GRUPOS_DEMO.map((g) => ({ id: g.id, nombre: g.nombre })),
      solicitudesDisponibles: sols.filter((s) => !usadas.has(s.id) && !['BORRADOR', 'RECHAZADA', 'CANCELADA'].includes(s.estado))
        .map((s) => ({ id: s.id, codigo: s.codigo, titulo: s.titulo, estado: s.estado, departamento: s.departamento })),
    };
  },
  async crear(d) {
    const lista = await leer();
    const p: ProyectoDemo = {
      id: crypto.randomUUID(), codigo: `PRY-${String(lista.length + 1).padStart(4, '0')}`, nombre: d.nombre,
      descripcion: d.descripcion ?? null, estado: 'PLANEACION', departamentoId: d.departamentoId ?? null,
      departamento: d.departamentoId ?? null, departamentoColor: null, directorId: 'demo', director: 'Usuario demo',
      fechaInicio: d.fechaInicio ?? null, fechaFinPlan: d.fechaFinPlan ?? null, presupuesto: d.presupuesto ?? null,
      costoOtros: d.costoOtros ?? 0, tarifaHora: d.tarifaHora ?? null, beneficioEsperado: d.beneficioEsperado ?? null,
      moneda: d.moneda ?? 'COP', version: 1, solicitudes: [], riesgos: [], deuda: [],
    };
    lista.push(p);
    await guardar(lista);
    return armar(p);
  },
  async actualizar(id, c) {
    const { lista, p } = await buscar((x) => x.id === id);
    if (p.version !== c.version) throw new Error('El proyecto cambió; recarga e intenta de nuevo');
    const { version: _v, ...resto } = c;
    Object.assign(p, Object.fromEntries(Object.entries(resto).filter(([, v]) => v !== undefined)), { version: p.version + 1 });
    if (c.departamentoId !== undefined) p.departamento = c.departamentoId;
    await guardar(lista);
    return armar(p);
  },
  async eliminar(id) {
    const { lista, p } = await buscar((x) => x.id === id);
    if (p.solicitudes.length) throw new Error('Quita primero las solicitudes del proyecto (o márcalo como cancelado)');
    await guardar(lista.filter((x) => x.id !== id));
  },
  async vincular(id, agregar, quitar) {
    const { lista, p } = await buscar((x) => x.id === id);
    p.solicitudes = [...new Set([...p.solicitudes.filter((s) => !quitar.includes(s)), ...agregar])];
    await guardar(lista);
    return armar(p);
  },
  async crearRiesgo(id, d) {
    const { lista, p } = await buscar((x) => x.id === id);
    const r = { ...riesgoDemo(d.titulo, d.probabilidad, d.impacto, d.planMitigacion ?? null), descripcion: d.descripcion ?? null };
    p.riesgos.push(r);
    await guardar(lista);
    return r;
  },
  async actualizarRiesgo(id, c) {
    const { lista, p } = await buscar((x) => x.riesgos.some((r) => r.id === id));
    const r = p.riesgos.find((x) => x.id === id)!;
    const { version: _v, ...resto } = c;
    Object.assign(r, Object.fromEntries(Object.entries(resto).filter(([, v]) => v !== undefined)), { version: r.version + 1, actualizadoEn: new Date().toISOString() });
    r.exposicion = r.probabilidad * r.impacto;
    await guardar(lista);
    return r;
  },
  async eliminarRiesgo(id) {
    const { lista, p } = await buscar((x) => x.riesgos.some((r) => r.id === id));
    p.riesgos = p.riesgos.filter((r) => r.id !== id);
    await guardar(lista);
  },
  async crearDeuda(id, d) {
    const { lista, p } = await buscar((x) => x.id === id);
    const dt = deudaDemo(d.descripcion, d.storyPoints);
    p.deuda.push(dt);
    await guardar(lista);
    return dt;
  },
  async actualizarDeuda(id, c) {
    const { lista, p } = await buscar((x) => x.deuda.some((d) => d.id === id));
    const d = p.deuda.find((x) => x.id === id)!;
    if (c.resuelta !== undefined && c.resuelta !== d.resuelta) d.resueltaEn = c.resuelta ? new Date().toISOString() : null;
    Object.assign(d, Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined)));
    await guardar(lista);
    return d;
  },
  async eliminarDeuda(id) {
    const { lista, p } = await buscar((x) => x.deuda.some((d) => d.id === id));
    p.deuda = p.deuda.filter((d) => d.id !== id);
    await guardar(lista);
  },
  async mios() {
    return Promise.all((await leer()).map(armar));
  },
  async crearTareaProyecto(id, d) {
    const { lista, p } = await buscar((x) => x.id === id);
    if (p.estado === 'CERRADO' || p.estado === 'CANCELADO') throw new Error('El proyecto está cerrado o cancelado');
    const resp = INGENIEROS_DEMO.find((i) => i.usuarioId === d.responsableId);
    const t: TareaVista = {
      id: crypto.randomUUID(), titulo: d.titulo, descripcion: d.descripcion ?? null, grupoId: d.grupoId ?? null,
      grupo: GRUPOS_DEMO.find((g) => g.id === d.grupoId)?.nombre ?? null, responsableId: d.responsableId ?? null,
      responsable: resp?.nombre ?? (d.responsableId === 'demo' ? 'Usuario demo' : null), estado: 'PENDIENTE', peso: d.peso ?? 1,
      avancePct: 0, horasEstimadas: d.horasEstimadas ?? null, horasReales: 0, fechaInicio: d.fechaInicio ?? null,
      fechaFinPlan: d.fechaFinPlan ?? null, version: 1,
    };
    p.tareasProyecto = [...(p.tareasProyecto ?? []), t];
    await guardar(lista);
    return t;
  },
  async actualizarTareaProyecto(id, c) {
    const { lista, p } = await buscar((x) => (x.tareasProyecto ?? []).some((t) => t.id === id));
    const t = p.tareasProyecto!.find((x) => x.id === id)!;
    if (t.version !== c.version) throw new Error('La tarea cambió; recarga e intenta de nuevo');
    const { version: _v, ...resto } = c;
    Object.assign(t, Object.fromEntries(Object.entries(resto).filter(([, v]) => v !== undefined)), { version: t.version + 1 });
    if (t.estado === 'COMPLETADA') t.avancePct = 100;
    else if (t.avancePct >= 100) t.estado = 'COMPLETADA';
    else if (t.avancePct > 0 && t.estado === 'PENDIENTE') t.estado = 'EN_PROGRESO';
    if (c.responsableId !== undefined) t.responsable = INGENIEROS_DEMO.find((i) => i.usuarioId === c.responsableId)?.nombre ?? null;
    if (c.grupoId !== undefined) t.grupo = GRUPOS_DEMO.find((g) => g.id === c.grupoId)?.nombre ?? null;
    await guardar(lista);
    return t;
  },
  async eliminarTareaProyecto(id) {
    const { lista, p } = await buscar((x) => (x.tareasProyecto ?? []).some((t) => t.id === id));
    p.tareasProyecto = p.tareasProyecto!.filter((t) => t.id !== id);
    await guardar(lista);
  },
  async cambiarEstado(id, c, actor) {
    const { lista, p } = await buscar((x) => x.id === id);
    if (p.version !== c.version) throw new Error('El proyecto cambió; recarga e intenta de nuevo');
    const regla = transicionesProyecto(p.estado, actor.roles).find((r) => r.hacia === c.estado);
    if (!regla) throw new Error('Tu rol no permite ese cambio de estado desde el estado actual');
    if (regla.requiereMotivo && !c.motivo?.trim()) throw new Error(`"${regla.accion}" requiere un motivo`);
    p.historialEstados = [{ estadoAnterior: p.estado, estadoNuevo: c.estado, usuario: actor.nombre, motivo: c.motivo?.trim() || null,
      fecha: new Date().toISOString() }, ...(p.historialEstados ?? [])];
    p.estado = c.estado;
    p.version += 1;
    await guardar(lista);
    return armar(p);
  },

};
