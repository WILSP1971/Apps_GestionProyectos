/**
 * Reglas puras de avance y calificación (Sprint 6), compartidas por la web (vista previa en vivo,
 * también sin conexión) y la API (valor que se guarda). Deben coincidir con:
 *  - services/analitica/app/dominio/calificacion.py  (nota_global, letra, avance_ponderado)
 *  - gestion.fn_letra_calificacion() y gestion.fn_recalcular_avance() en PostgreSQL
 */
export interface PuntajePonderado {
  peso: number;    // > 0 (los criterios activos suman 1.00)
  puntaje: number; // 1..5
}

/** Promedio ponderado (1–5) llevado a escala 0–10. Todo 5 → 10.0, todo 1 → 0.0. */
export function notaGlobal(puntajes: PuntajePonderado[]): number {
  const totalPeso = puntajes.reduce((s, p) => s + p.peso, 0);
  if (totalPeso <= 0) return 0;
  const promedio = puntajes.reduce((s, p) => s + p.puntaje * p.peso, 0) / totalPeso;
  return redondear(((promedio - 1) / 4) * 10);
}

export function letraCalificacion(nota: number): string {
  for (const [umbral, l] of [[9.5, 'A+'], [9.0, 'A'], [8.0, 'B+'], [7.0, 'B'], [6.0, 'C']] as const) {
    if (nota >= umbral) return l;
  }
  return 'D';
}

/** Promedio ponderado simple en escala 1–5 (p. ej. calificación técnica). null si no hay datos. */
export function promedio1a5(puntajes: PuntajePonderado[]): number | null {
  const totalPeso = puntajes.reduce((s, p) => s + p.peso, 0);
  if (totalPeso <= 0) return null;
  return redondear(puntajes.reduce((s, p) => s + p.puntaje * p.peso, 0) / totalPeso);
}

export interface TareaParaAvance {
  grupoId: string | null;
  grupo: string | null;
  peso: number;
  avancePct: number;
  estado: string;
}

export interface FrenteAvance {
  grupoId: string | null;
  grupo: string;
  tareas: number;
  completadas: number;
  bloqueadas: number;
  avancePct: number;
}

/** Avance total ponderado por peso de tarea (igual que el trigger de la base de datos). */
export function avancePonderado(tareas: Pick<TareaParaAvance, 'peso' | 'avancePct'>[]): number {
  const total = tareas.reduce((s, t) => s + t.peso, 0);
  if (total <= 0) return 0;
  return redondear(tareas.reduce((s, t) => s + t.avancePct * t.peso, 0) / total);
}

/** Agrupa las tareas por frente (grupo de trabajo) con su avance ponderado. Orden: por nombre, "Sin frente" al final. */
export function calcularFrentes(tareas: TareaParaAvance[]): FrenteAvance[] {
  const mapa = new Map<string, TareaParaAvance[]>();
  for (const t of tareas) {
    const clave = t.grupoId ?? '';
    mapa.set(clave, [...(mapa.get(clave) ?? []), t]);
  }
  return [...mapa.entries()]
    .map(([clave, lista]) => ({
      grupoId: clave || null,
      grupo: lista[0].grupo ?? 'Sin frente',
      tareas: lista.length,
      completadas: lista.filter((t) => t.estado === 'COMPLETADA').length,
      bloqueadas: lista.filter((t) => t.estado === 'BLOQUEADA').length,
      avancePct: avancePonderado(lista),
    }))
    .sort((a, b) => (a.grupoId === null ? 1 : b.grupoId === null ? -1 : a.grupo.localeCompare(b.grupo, 'es')));
}

const redondear = (n: number) => Math.round(n * 100) / 100;
