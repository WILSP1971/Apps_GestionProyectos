import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarRegistro, esquemaRegistroAvance, porcentajeSugerido, serieHoras } from '../src/avances';

test('checklist: % sugerido en múltiplos de 5 y null sin subtareas', () => {
  assert.equal(porcentajeSugerido([]), null);
  assert.equal(porcentajeSugerido([{ completada: true }, { completada: false }, { completada: false }]), 35); // 33,3 → 35
  assert.equal(porcentajeSugerido([{ completada: true }, { completada: true }]), 100);
});

test('serie de horas: rellena días vacíos y suma registros del mismo día', () => {
  const s = serieHoras([{ fecha: '2026-11-20', horas: 2 }, { fecha: '2026-11-20', horas: 1.5 }, { fecha: '2026-11-18', horas: 4 }], '2026-11-20', 3);
  assert.deepEqual(s, [{ fecha: '2026-11-18', horas: 4 }, { fecha: '2026-11-19', horas: 0 }, { fecha: '2026-11-20', horas: 3.5 }]);
});

test('aplicar registro: mismas reglas que el trigger de la BD', () => {
  const base = { estado: 'PENDIENTE' as const, avancePct: 0, horasReales: 2 };
  assert.deepEqual(aplicarRegistro(base, { avancePct: 20, horas: 1.5 }), { estado: 'EN_PROGRESO', avancePct: 20, horasReales: 3.5 });
  assert.deepEqual(aplicarRegistro(base, { avancePct: 100 }), { estado: 'COMPLETADA', avancePct: 100, horasReales: 2 });
  assert.equal(aplicarRegistro({ ...base, avancePct: 40 }, { estado: 'COMPLETADA' }).avancePct, 100);
  assert.equal(aplicarRegistro({ estado: 'COMPLETADA', avancePct: 100, horasReales: 0 }, { estado: 'EN_PROGRESO' }).avancePct, 90);
});

test('registro de avance: exige algún cambio y valida el enlace de evidencia', () => {
  assert.equal(esquemaRegistroAvance.safeParse({ version: 1 }).success, false);
  assert.equal(esquemaRegistroAvance.safeParse({ version: 1, horas: 2 }).success, true);
  assert.equal(esquemaRegistroAvance.safeParse({ version: 1, evidenciaUrl: 'javascript:alert(1)' }).success, false);
  assert.equal(esquemaRegistroAvance.safeParse({ version: 1, evidenciaUrl: 'https://github.com/org/repo/pull/12' }).success, true);
});
