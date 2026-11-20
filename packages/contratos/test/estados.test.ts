import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAQUINA_ESTADOS, transicionesDisponibles, ESTADOS_FINALES, normalizarRoles } from '../src/estados';

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

test('administrador, director y líder pueden regresar a desarrollo desde validación', () => {
  for (const rol of ['ADMIN', 'DIRECTOR', 'LIDER'] as const) {
    const r = transicionesDisponibles('EN_VALIDACION', [rol]).find((x) => x.hacia === 'EN_DESARROLLO');
    assert.ok(r, rol);
    assert.equal(r.requiereComentario, true);
  }
  assert.equal(transicionesDisponibles('EN_VALIDACION', ['INGENIERO']).length, 0);
});

test('login: solicitante es todo correo que no es del equipo; los roles de equipo excluyen el de solicitante', () => {
  assert.deepEqual(normalizarRoles([]), ['SOLICITANTE']);
  assert.deepEqual(normalizarRoles(['SOLICITANTE']), ['SOLICITANTE']);
  assert.deepEqual(normalizarRoles(['SOLICITANTE', 'INGENIERO']), ['INGENIERO']);
  assert.deepEqual(normalizarRoles(['ADMIN', 'SOLICITANTE', 'DIRECTOR', 'LIDER']), ['LIDER', 'DIRECTOR', 'ADMIN']);
});
