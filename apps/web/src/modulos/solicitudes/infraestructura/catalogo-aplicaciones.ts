import type { AplicacionVista, NuevaAplicacion } from '@sierraflow/contratos';
import { apiFetch } from '@/lib/api';
import { dbLocal } from '@/lib/offline/db';
import { nuevoId } from '@/lib/utils';

const CLAVE_CACHE = 'cat:aplicaciones';
const CLAVE_DEMO = 'demo:aplicaciones';

/** Aplicaciones de ejemplo del modo demo (el administrador las gestiona en Usuarios y equipos → Aplicaciones). */
export const APLICACIONES_DEMO: AplicacionVista[] = [
  { id: 'app-esculapio', nombre: 'Esculapio (historia clínica)', descripcion: 'Historia clínica electrónica', tipos: ['NORMATIVO', 'MEJORA', 'INCIDENTE'], tecnologias: ['.NET', 'PostgreSQL'], activo: true },
  { id: 'app-facturacion', nombre: 'Facturación electrónica', descripcion: 'Emisión de facturas ante la DIAN', tipos: ['NORMATIVO', 'MEJORA', 'INCIDENTE'], tecnologias: ['.NET', 'PostgreSQL'], activo: true },
  { id: 'app-portal', nombre: 'Portal de pacientes', descripcion: 'Citas y resultados en línea', tipos: ['MEJORA', 'INCIDENTE'], tecnologias: ['Next.js', 'React', 'Node.js'], activo: true },
  { id: 'app-nomina', nombre: 'Nómina y talento humano', descripcion: null, tipos: ['NORMATIVO', 'MEJORA', 'INCIDENTE'], tecnologias: ['Python/FastAPI', 'PostgreSQL'], activo: true },
  { id: 'app-nueva', nombre: 'Nueva aplicación o módulo', descripcion: 'Para desarrollos que aún no existen', tipos: ['NUEVO'], tecnologias: [], activo: true },
];

async function demo(): Promise<AplicacionVista[]> {
  return ((await dbLocal.meta.get(CLAVE_DEMO))?.valor as AplicacionVista[] | undefined) ?? APLICACIONES_DEMO;
}

/**
 * Aplicaciones activas para el asistente. Con conexión se piden al servidor y se guardan en el
 * navegador; sin conexión se usa la última copia, para poder crear solicitudes igual.
 */
export async function obtenerAplicaciones(modoDemo: boolean): Promise<AplicacionVista[]> {
  if (modoDemo) return (await demo()).filter((a) => a.activo);
  const guardadas = (await dbLocal.meta.get(CLAVE_CACHE))?.valor as AplicacionVista[] | undefined;
  if (!navigator.onLine) return guardadas ?? [];
  try {
    const apps = await apiFetch<AplicacionVista[]>('/catalogos/aplicaciones');
    await dbLocal.meta.put({ clave: CLAVE_CACHE, valor: apps });
    return apps;
  } catch {
    return guardadas ?? [];
  }
}

/** Administración del catálogo (ADMIN). */
export interface FuenteAplicaciones {
  listar(): Promise<AplicacionVista[]>;
  tecnologias(): Promise<string[]>;
  guardar(id: string | null, datos: NuevaAplicacion): Promise<AplicacionVista>;
}

export const adminApi: FuenteAplicaciones = {
  listar: () => apiFetch('/admin/aplicaciones'),
  tecnologias: async () => (await apiFetch<{ tecnologias: { nombre: string }[] }>('/admin/catalogos')).tecnologias.map((t) => t.nombre),
  guardar: (id, datos) => apiFetch(id ? `/admin/aplicaciones/${id}` : '/admin/aplicaciones', { method: id ? 'PATCH' : 'POST', body: datos }),
};

export const adminDemo: FuenteAplicaciones = {
  listar: demo,
  tecnologias: async () => ['Next.js', 'React', 'JavaScript', 'HTML/CSS', 'Node.js', 'NestJS', '.NET', 'Python/FastAPI', 'PostgreSQL', 'Nginx'],
  async guardar(id, d) {
    const lista = await demo();
    if (lista.some((a) => a.id !== id && a.nombre.trim().toLowerCase() === d.nombre.trim().toLowerCase())) {
      throw new Error(`Ya existe una aplicación llamada "${d.nombre.trim()}"`);
    }
    const app: AplicacionVista = {
      id: id ?? nuevoId(), nombre: d.nombre.trim(), descripcion: d.descripcion?.trim() || null, tipos: d.tipos,
      tecnologias: d.tecnologias ?? [], activo: d.activo ?? true,
    };
    await dbLocal.meta.put({ clave: CLAVE_DEMO, valor: id ? lista.map((a) => (a.id === id ? app : a)) : [...lista, app] });
    return app;
  },
};
