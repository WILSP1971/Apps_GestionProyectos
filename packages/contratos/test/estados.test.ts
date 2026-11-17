import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAQUINA_ESTADOS, transicionesDisponibles, ESTADOS_FINALES } from '../src/estados';

test('un solicitante no puede aprobar', () => {
  const t = transicionesDisponibles('EN_REVISION', ['SOLICITANTE']).map((r) => r.hacia);
  assert.deepEqual(t, []);
});

test('un líder puede aprobar, rechazar o devolver', () => {
  const t = transicionesDisponibles('EN_REVISION', ['LIDER']).map((r) => r.hacia);
  assert.deepEqual(t.sort(), ['APROBADA', 'BORRADOR', 'RECHAZADA']);
});

test('los estados finales no tienen salida', () => {
  for (const e of ESTADOS_FINALES) assert.equal(MAQUINA_ESTADOS[e].length, 0);
});
