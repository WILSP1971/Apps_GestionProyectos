import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avancePonderado, calcularFrentes, letraCalificacion, notaGlobal, promedio1a5 } from '../src/calificacion';

test('nota global: extremos y caso ponderado (igual que pytest de analítica)', () => {
  assert.equal(notaGlobal([{ peso: 0.5, puntaje: 5 }, { peso: 0.5, puntaje: 5 }]), 10);
  assert.equal(notaGlobal([{ peso: 1, puntaje: 1 }]), 0);
  const n = notaGlobal([{ peso: 0.5, puntaje: 5 }, { peso: 0.5, puntaje: 4 }]);
  assert.equal(n, 8.75);
  assert.equal(letraCalificacion(n), 'B+');
  assert.equal(notaGlobal([]), 0);
});

test('criterios reales de la semilla (35/20/25/20)', () => {
  // 4,4,3,5 → promedio 3.95 → (3.95-1)/4*10 = 7.375 → 7.38
  const n = notaGlobal([{ peso: 0.35, puntaje: 4 }, { peso: 0.2, puntaje: 4 }, { peso: 0.25, puntaje: 3 }, { peso: 0.2, puntaje: 5 }]);
  assert.equal(n, 7.38);
  assert.equal(letraCalificacion(n), 'B');
});

test('letras: mismos umbrales que fn_letra_calificacion', () => {
  assert.deepEqual([9.6, 9.0, 8.2, 7.1, 6.0, 3.0].map(letraCalificacion), ['A+', 'A', 'B+', 'B', 'C', 'D']);
});

test('promedio 1–5', () => {
  assert.equal(promedio1a5([{ peso: 0.35, puntaje: 4 }, { peso: 0.2, puntaje: 5 }]), 4.36);
  assert.equal(promedio1a5([]), null);
});

test('avance ponderado igual al trigger: 90×3, 70×2, 10×1 → 70', () => {
  assert.equal(avancePonderado([{ avancePct: 90, peso: 3 }, { avancePct: 70, peso: 2 }, { avancePct: 10, peso: 1 }]), 70);
  assert.equal(avancePonderado([]), 0);
});

test('frentes: agrupa, cuenta y deja "Sin frente" al final', () => {
  const f = calcularFrentes([
    { grupoId: null, grupo: null, peso: 1, avancePct: 0, estado: 'PENDIENTE' },
    { grupoId: 'q', grupo: 'QA', peso: 1, avancePct: 10, estado: 'BLOQUEADA' },
    { grupoId: 'b', grupo: 'Backend', peso: 3, avancePct: 100, estado: 'COMPLETADA' },
    { grupoId: 'b', grupo: 'Backend', peso: 1, avancePct: 60, estado: 'EN_PROGRESO' },
  ]);
  assert.deepEqual(f.map((x) => [x.grupo, x.tareas, x.completadas, x.bloqueadas, x.avancePct]), [
    ['Backend', 2, 1, 0, 90], ['QA', 1, 0, 1, 10], ['Sin frente', 1, 0, 0, 0],
  ]);
});
