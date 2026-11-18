import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VersionesLote } from '../src/modulos/sincronizacion/aplicacion/versiones-lote';

test('sin versionBase (creada sin conexión) no se verifica versión', () => {
  const v = new VersionesLote();
  assert.equal(v.resolver('s1', 0), undefined);
  assert.equal(v.resolver('s1', undefined), undefined);
});

test('la primera operación se verifica contra su versionBase', () => {
  assert.equal(new VersionesLote().resolver('s1', 4), 4);
});

test('operaciones encadenadas sin conexión sobre la misma base usan la versión resultante', () => {
  const v = new VersionesLote();
  // "Tomar en revisión" con base 4 → servidor queda en 5
  assert.equal(v.resolver('s1', 4), 4);
  v.registrar('s1', 4, 5);
  // "Aprobar" también con base 4 (el cliente no conocía la 5) → se verifica contra 5
  assert.equal(v.resolver('s1', 4), 5);
  v.registrar('s1', 4, 6);
  // una tercera, aún con base 4 → 6
  assert.equal(v.resolver('s1', 4), 6);
  // si el cliente ya conocía la 5, también se encadena
  assert.equal(v.resolver('s1', 5), 6);
});

test('una base desconocida (otro usuario cambió la solicitud) se verifica tal cual → conflicto', () => {
  const v = new VersionesLote();
  v.registrar('s1', 4, 5);
  assert.equal(v.resolver('s1', 2), 2);
});

test('las entidades son independientes', () => {
  const v = new VersionesLote();
  v.registrar('s1', 4, 5);
  assert.equal(v.resolver('s2', 4), 4);
});
