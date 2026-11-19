import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularFinanzas, escalaGantt, nivelExposicion, posicionGantt, saludCronograma } from '../src/pm';

test('finanzas: costo de trabajo, consumo, desviación y ROI', () => {
  const f = calcularFinanzas({ presupuesto: 10_000_000, costoOtros: 1_000_000, tarifaHora: 50_000, horasReales: 100, horasEstimadas: 200, beneficioEsperado: 30_000_000 });
  assert.equal(f.costoTrabajo, 5_000_000);
  assert.equal(f.costoTotal, 6_000_000);
  assert.equal(f.consumoPresupuestoPct, 60);
  assert.equal(f.costoEstimadoTotal, 11_000_000);  // 200 h × 50.000 + 1.000.000
  assert.equal(f.desviacionPct, 10);               // proyección 10 % sobre presupuesto
  assert.equal(f.roiPct, 400);                     // (30 − 6) / 6
  assert.equal(f.beneficioNeto, 24_000_000);
});

test('finanzas sin presupuesto, tarifa ni beneficio → indicadores en null', () => {
  const f = calcularFinanzas({ presupuesto: null, costoOtros: 0, tarifaHora: null, horasReales: 40, horasEstimadas: 0, beneficioEsperado: null });
  assert.deepEqual([f.costoTotal, f.consumoPresupuestoPct, f.desviacionPct, f.roiPct], [0, null, null, null]);
});

test('salud: en tiempo, en riesgo, atrasado, vencido y sin plan', () => {
  const hoy = Date.parse('2026-06-11T12:00:00'); // ~mitad de un plan de 1–20 de junio
  assert.equal(saludCronograma(55, '2026-06-01', '2026-06-20', hoy).salud, 'EN_TIEMPO');
  assert.equal(saludCronograma(40, '2026-06-01', '2026-06-20', hoy).salud, 'EN_RIESGO');
  assert.equal(saludCronograma(20, '2026-06-01', '2026-06-20', hoy).salud, 'ATRASADO');
  assert.equal(saludCronograma(95, '2026-05-01', '2026-06-01', hoy).salud, 'ATRASADO'); // plazo vencido
  assert.equal(saludCronograma(10, null, '2026-06-20', hoy).salud, 'SIN_PLAN');
  assert.equal(saludCronograma(100, '2026-06-01', '2026-06-20', hoy).salud, 'TERMINADO');
});

test('exposición de riesgos (probabilidad × impacto)', () => {
  assert.deepEqual([[1, 4], [2, 3], [2, 5], [3, 5], [5, 5]].map(([p, i]) => nivelExposicion(p!, i!)), ['BAJO', 'MEDIO', 'ALTO', 'CRITICO', 'CRITICO']);
});

test('gantt: escala con margen y posiciones en %', () => {
  const hoy = Date.parse('2026-06-05T12:00:00');
  const e = escalaGantt([{ id: 'a', inicio: '2026-06-01', fin: '2026-06-10' }], hoy);
  assert.equal(e.dias, 16); // 3 días antes + 10 del plan + 3 después
  const p = posicionGantt('2026-06-01', '2026-06-10', e)!;
  assert.ok(Math.abs(p.left - (3 / 16) * 100) < 0.01);
  assert.ok(Math.abs(p.width - (10 / 16) * 100) < 0.01);
  assert.equal(posicionGantt(null, '2026-06-10', e), null);
});
