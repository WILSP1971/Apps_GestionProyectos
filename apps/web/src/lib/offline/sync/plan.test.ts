import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SolicitudSync } from '@sierraflow/contratos';
import type { OperacionPendiente } from '../db';
import { planificarResultados } from './plan';

const op = (id: string, tipo: OperacionPendiente['tipo'], entidadId = 's1', extra: Partial<OperacionPendiente> = {}): OperacionPendiente => ({
  idOperacion: id, entidad: tipo === 'comentar' ? 'comentario' : 'solicitud', tipo, entidadId,
  payload: tipo === 'comentar' ? { id: `c-${id}`, contenido: 'hola' } : {}, versionBase: 3, creadoEn: 0, intentos: 0, ...extra,
});
const sol = (version: number, codigo = 'SOL-000010'): SolicitudSync => ({ id: 's1', codigo, version } as SolicitudSync);

test('ok de la última operación: reemplaza la copia local con la del servidor', () => {
  const p = planificarResultados([op('a', 'crear', 's1', { versionBase: 0 })], [{ idOperacion: 'a', estado: 'ok', solicitud: sol(1) }]);
  assert.deepEqual(p.eliminarOps, ['a']);
  assert.equal(p.guardarSolicitudes.length, 1);
  assert.equal(p.guardarSolicitudes[0]!.pendiente, false);
  assert.equal(p.detener, false);
});

test('ok con más operaciones locales pendientes: solo confirma versión y rebasa las siguientes', () => {
  const pend = [op('a', 'crear', 's1', { versionBase: 0 }), op('b', 'cambiar_estado', 's1', { versionBase: 0 })];
  const p = planificarResultados(pend, [{ idOperacion: 'a', estado: 'ok', solicitud: sol(1, 'SOL-000099') }]);
  assert.deepEqual(p.guardarSolicitudes, []);
  assert.deepEqual(p.confirmarVersion, [{ id: 's1', version: 1, codigo: 'SOL-000099' }]);
  assert.deepEqual(p.rebasarOps, [{ idOperacion: 'b', versionBase: 1 }]);
});

test('lote completo encadenado: al final se guarda el estado del servidor', () => {
  const pend = [op('a', 'cambiar_estado'), op('b', 'cambiar_estado'), op('c', 'comentar')];
  const p = planificarResultados(pend, [
    { idOperacion: 'a', estado: 'ok', solicitud: sol(4) },
    { idOperacion: 'b', estado: 'ok', solicitud: sol(5) },
    { idOperacion: 'c', estado: 'ok', solicitud: sol(5) },
  ]);
  assert.deepEqual(p.eliminarOps, ['a', 'b', 'c']);
  assert.deepEqual(p.rebasarOps, []);
  assert.deepEqual(p.confirmarVersion, []);
  assert.equal(p.guardarSolicitudes[0]!.solicitud.version, 5);
  assert.deepEqual(p.comentariosConfirmados, ['c-c']);
});

test('conflicto: registra el conflicto y aplica la versión del servidor', () => {
  const p = planificarResultados([op('a', 'cambiar_estado')], [
    { idOperacion: 'a', estado: 'conflicto', mensaje: 'modificada por otro usuario', solicitud: sol(8) },
  ]);
  assert.equal(p.conflictos[0]!.motivo, 'conflicto');
  assert.equal(p.guardarSolicitudes[0]!.solicitud.version, 8);
  assert.deepEqual(p.eliminarOps, ['a']);
});

test('rechazo de una creación sin solicitud en el servidor: marca error en la copia local', () => {
  const p = planificarResultados([op('a', 'crear', 's1', { versionBase: 0 })], [
    { idOperacion: 'a', estado: 'rechazada', mensaje: 'Sin departamento', solicitud: null },
  ]);
  assert.deepEqual(p.erroresCrear, [{ id: 's1', mensaje: 'Sin departamento' }]);
  assert.equal(p.conflictos[0]!.motivo, 'rechazada');
});

test('comentario rechazado se elimina de la copia local', () => {
  const p = planificarResultados([op('c', 'comentar')], [{ idOperacion: 'c', estado: 'rechazada', mensaje: 'x', solicitud: sol(3) }]);
  assert.deepEqual(p.comentariosRechazados, ['c-c']);
});

test('error temporal: detiene el lote y suma un intento, sin borrar nada', () => {
  const pend = [op('a', 'cambiar_estado'), op('b', 'cambiar_estado')];
  const p = planificarResultados(pend, [{ idOperacion: 'a', estado: 'error', mensaje: 'BD caída' }]);
  assert.equal(p.detener, true);
  assert.deepEqual(p.eliminarOps, []);
  assert.deepEqual(p.reintentar, [{ idOperacion: 'a', intentos: 1, error: 'BD caída' }]);
});

test('operaciones de otras solicitudes no se rebasan', () => {
  const pend = [op('a', 'cambiar_estado', 's1'), op('b', 'cambiar_estado', 's2')];
  const p = planificarResultados(pend, [{ idOperacion: 'a', estado: 'ok', solicitud: sol(4) }]);
  assert.deepEqual(p.rebasarOps, []);
  assert.equal(p.guardarSolicitudes.length, 1);
});
