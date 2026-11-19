/**
 * Recomendación de ingenieros para una solicitud (lógica pura, probada con node:test).
 * Favorece a quien domina las tecnologías pedidas, pertenece a los grupos elegidos y tiene menos carga.
 */
export interface Candidato {
  usuarioId: string;
  nombre: string;
  grupos: string[];
  tecnologias: string[];
  cargaPct: number;
  solicitudesActivas: number;
}

export interface ContextoRecomendacion {
  tecnologias: string[]; // stack de la solicitud
  grupos: string[];      // nombres de los grupos seleccionados
}

export type NivelCarga = 'baja' | 'media' | 'alta' | 'sobrecargado';

export interface Puntuacion {
  puntaje: number;
  coincidencias: string[];
  enGrupo: boolean;
  nivel: NivelCarga;
}

const normal = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export function nivelCarga(pct: number): NivelCarga {
  if (pct >= 100) return 'sobrecargado';
  if (pct >= 80) return 'alta';
  if (pct >= 50) return 'media';
  return 'baja';
}

export function puntuar(c: Candidato, ctx: ContextoRecomendacion): Puntuacion {
  const pedidas = new Set(ctx.tecnologias.map(normal));
  const coincidencias = c.tecnologias.filter((t) => pedidas.has(normal(t)));
  const grupos = new Set(ctx.grupos.map(normal));
  const enGrupo = c.grupos.some((g) => grupos.has(normal(g)));
  const carga = Math.max(0, Math.min(c.cargaPct, 150));
  const nivel = nivelCarga(carga);
  const puntaje =
    coincidencias.length * 25 +
    (enGrupo ? 15 : 0) +
    (100 - Math.min(carga, 100)) * 0.5 -
    (nivel === 'sobrecargado' ? 30 : 0);
  return { puntaje: Math.round(puntaje), coincidencias, enGrupo, nivel };
}

/** Ordena de más a menos recomendado (empate: por nombre). */
export function ordenarRecomendados<T extends Candidato>(lista: T[], ctx: ContextoRecomendacion): (T & { puntuacion: Puntuacion })[] {
  return lista
    .map((c) => ({ ...c, puntuacion: puntuar(c, ctx) }))
    .sort((a, b) => b.puntuacion.puntaje - a.puntuacion.puntaje || a.nombre.localeCompare(b.nombre, 'es'));
}
