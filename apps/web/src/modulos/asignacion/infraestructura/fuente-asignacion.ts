import type { Asignacion, EntradaHistorialSync, EstadoSolicitud, GrupoTrabajo, IngenieroCarga, MiembroEquipo } from '@sierraflow/contratos';
import type { Asignado } from '@/lib/offline/db';
import { apiFetch } from '@/lib/api';
import { dbLocal } from '@/lib/offline/db';
import { motorSync } from '@/lib/offline/sync/motor-sync';

/**
 * Puerto de datos de la asignación (Clean Architecture): la pantalla no sabe si habla con la API
 * o con los datos de demostración. La asignación necesita conexión en modo real porque depende
 * de la carga de trabajo actual de todo el equipo.
 */
export interface FuenteAsignacion {
  ingenieros(): Promise<IngenieroCarga[]>;
  grupos(): Promise<GrupoTrabajo[]>;
  equipo(solicitudId: string): Promise<MiembroEquipo[]>;
  asignar(solicitudId: string, datos: Asignacion, actor: string): Promise<void>;
}

export const fuenteApi: FuenteAsignacion = {
  ingenieros: () => apiFetch<IngenieroCarga[]>('/asignacion/ingenieros'),
  grupos: () => apiFetch<GrupoTrabajo[]>('/asignacion/grupos'),
  equipo: (id) => apiFetch<MiembroEquipo[]>(`/asignacion/solicitudes/${id}/equipo`),
  async asignar(id, datos) {
    await apiFetch(`/asignacion/solicitudes/${id}`, { method: 'PUT', body: datos });
    await motorSync.sincronizarAhora(); // trae el nuevo estado y el equipo a IndexedDB
  },
};

// ---------------------------------------------------------------------
// Modo demo
// ---------------------------------------------------------------------
const G = {
  backend: '0000000a-0000-4000-8000-000000000001',
  frontend: '0000000a-0000-4000-8000-000000000002',
  qa: '0000000a-0000-4000-8000-000000000003',
  devops: '0000000a-0000-4000-8000-000000000004',
};
export const GRUPOS_DEMO: GrupoTrabajo[] = [
  { id: G.backend, nombre: 'Backend', descripcion: 'APIs, integraciones y servicios', miembros: 3 },
  { id: G.devops, nombre: 'DevOps', descripcion: 'Infraestructura y despliegues', miembros: 1 },
  { id: G.frontend, nombre: 'Frontend', descripcion: 'Interfaces web y móviles', miembros: 2 },
  { id: G.qa, nombre: 'QA', descripcion: 'Aseguramiento de calidad', miembros: 1 },
];
export const INGENIEROS_DEMO: IngenieroCarga[] = [
  { usuarioId: '0000000b-0000-4000-8000-000000000001', nombre: 'Luis F.', avatar: null, grupos: ['Backend'], tecnologias: ['Node.js', 'NestJS', 'PostgreSQL', '.NET'], solicitudesActivas: 2, horasPendientes: 26, capacidadSemana: 40, cargaPct: 65 },
  { usuarioId: '0000000b-0000-4000-8000-000000000002', nombre: 'María T.', avatar: null, grupos: ['Frontend'], tecnologias: ['Next.js', 'React'], solicitudesActivas: 1, horasPendientes: 16, capacidadSemana: 40, cargaPct: 40 },
  { usuarioId: '0000000b-0000-4000-8000-000000000003', nombre: 'Andrés S.', avatar: null, grupos: ['Backend', 'Frontend'], tecnologias: ['Next.js', 'Node.js', 'Python/FastAPI'], solicitudesActivas: 3, horasPendientes: 34, capacidadSemana: 40, cargaPct: 85 },
  { usuarioId: '0000000b-0000-4000-8000-000000000004', nombre: 'Diego P.', avatar: null, grupos: ['Backend'], tecnologias: ['Node.js', 'Next.js', 'JavaScript'], solicitudesActivas: 0, horasPendientes: 8, capacidadSemana: 40, cargaPct: 20 },
  { usuarioId: '0000000b-0000-4000-8000-000000000005', nombre: 'Marcela J.', avatar: null, grupos: ['QA'], tecnologias: ['React', 'HTML/CSS', 'JavaScript'], solicitudesActivas: 1, horasPendientes: 12, capacidadSemana: 40, cargaPct: 30 },
  { usuarioId: '0000000b-0000-4000-8000-000000000006', nombre: 'Camilo R.', avatar: null, grupos: ['DevOps'], tecnologias: ['Nginx', 'PostgreSQL'], solicitudesActivas: 4, horasPendientes: 44, capacidadSemana: 40, cargaPct: 110 },
];

export const fuenteDemo: FuenteAsignacion = {
  ingenieros: async () => INGENIEROS_DEMO,
  grupos: async () => GRUPOS_DEMO,
  async equipo(id) {
    const s = await dbLocal.solicitudes.get(id);
    return (s?.asignados ?? []).map((a) => {
      const ing = INGENIEROS_DEMO.find((i) => i.usuarioId === a.usuarioId || i.nombre === a.nombre);
      return { usuarioId: ing?.usuarioId ?? null, grupoId: ing ? null : GRUPOS_DEMO.find((g) => g.nombre === a.nombre)?.id ?? null,
        nombre: a.nombre, rol: (a.rol as MiembroEquipo['rol']) ?? 'DESARROLLADOR', horasEstimadas: null };
    });
  },
  async asignar(id, datos, actor) {
    const s = await dbLocal.solicitudes.get(id);
    if (!s) throw new Error('La solicitud no existe');
    const ahora = new Date().toISOString();
    const asignados: Asignado[] = [
      ...datos.grupos.map((g) => ({ usuarioId: null, nombre: GRUPOS_DEMO.find((x) => x.id === g)?.nombre ?? 'Grupo', grupo: 'Grupo de trabajo' })),
      ...datos.ingenieros.map((i) => {
        const ing = INGENIEROS_DEMO.find((x) => x.usuarioId === i.usuarioId)!;
        return { usuarioId: ing.usuarioId, nombre: ing.nombre, grupo: ing.grupos[0] ?? '', rol: i.rol };
      }),
    ];
    const pasaAAsignada = s.estado === 'APROBADA';
    const nuevoEstado: EstadoSolicitud = pasaAAsignada ? 'ASIGNADA' : s.estado;
    const historial: EntradaHistorialSync[] = pasaAAsignada
      ? [...s.historial, { estadoAnterior: 'APROBADA', estadoNuevo: 'ASIGNADA', usuario: actor, comentario: datos.comentario ?? null, fecha: ahora }]
      : s.historial;
    await dbLocal.transaction('rw', dbLocal.solicitudes, dbLocal.notificaciones, async () => {
      await dbLocal.solicitudes.update(id, {
        asignados,
        estado: nuevoEstado,
        historial,
        actualizadoEn: ahora,
      });
      await dbLocal.notificaciones.add({
        id: crypto.randomUUID(), titulo: `${s.codigo}: equipo asignado`, enlace: `/solicitudes/${id}`,
        mensaje: `${asignados.map((a) => a.nombre).join(', ')} trabajarán en "${s.titulo}".`, severidad: 'EXITO', leida: 0, creadoEn: ahora,
      });
    });
  },
};
