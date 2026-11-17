import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Solicitud } from '../src/modulos/solicitudes/dominio/solicitud.agregado';
import { UsuarioActual } from '../src/compartido/dominio/usuario-actual';

const solicitante: UsuarioActual = { id: 'u1', roles: ['SOLICITANTE'], departamentoId: 'd1' };
const otro: UsuarioActual = { id: 'u9', roles: ['SOLICITANTE'], departamentoId: 'd1' };
const lider: UsuarioActual = { id: 'u2', roles: ['LIDER'], departamentoId: 'd1' };
const ingeniero: UsuarioActual = { id: 'u3', roles: ['INGENIERO'], departamentoId: 'd1' };

const nueva = (criterios = [{ id: 'c1', orden: 1, descripcion: 'Pago aprobado', cumplido: false }]) =>
  Solicitud.crear('s1', {
    titulo: 'Integración pagos regionales', descripcion: 'Pasarela COP/USD', tipo: 'FUNCIONAL',
    prioridad: 'ALTA', solicitanteId: 'u1', departamentoId: 'd1', criterios, tecnologias: [],
  });

test('se crea en BORRADOR y registra el evento solicitud.creada', () => {
  const s = nueva();
  assert.equal(s.estado, 'BORRADOR');
  assert.deepEqual(s.extraerEventos().map((e) => e.tipo), ['solicitud.creada']);
});

test('rechaza títulos cortos', () => {
  assert.throws(() => Solicitud.crear('s2', {
    titulo: 'abc', descripcion: 'x', tipo: 'MEJORA', prioridad: 'BAJA',
    solicitanteId: 'u1', departamentoId: 'd1', criterios: [], tecnologias: [],
  }), /al menos 5/);
});

test('no se puede enviar sin criterios de aceptación', () => {
  assert.throws(() => nueva([]).cambiarEstado('ENVIADA', solicitante), /criterio/);
});

test('otro solicitante no puede enviar una solicitud ajena', () => {
  assert.throws(() => nueva().cambiarEstado('ENVIADA', otro), /Solo el solicitante/);
});

test('el solicitante no puede aprobar', () => {
  const s = nueva();
  s.cambiarEstado('ENVIADA', solicitante);
  s.cambiarEstado('EN_REVISION', lider);
  assert.throws(() => s.cambiarEstado('APROBADA', solicitante), /rol no permite/);
});

test('rechazar exige comentario', () => {
  const s = nueva();
  s.cambiarEstado('ENVIADA', solicitante);
  s.cambiarEstado('EN_REVISION', lider);
  assert.throws(() => s.cambiarEstado('RECHAZADA', lider), /requiere un comentario/);
  s.cambiarEstado('RECHAZADA', lider, 'Fuera del alcance del trimestre');
  assert.equal(s.estado, 'RECHAZADA');
});

test('no se puede saltar estados', () => {
  assert.throws(() => nueva().cambiarEstado('CERRADA', lider), /No se puede pasar/);
});

test('no se puede cerrar con criterios pendientes; sí cuando se cumplen', () => {
  const s = nueva();
  s.cambiarEstado('ENVIADA', solicitante);
  s.cambiarEstado('EN_REVISION', lider);
  s.cambiarEstado('APROBADA', lider);
  s.cambiarEstado('ASIGNADA', lider);
  s.cambiarEstado('EN_DESARROLLO', ingeniero);
  s.cambiarEstado('EN_VALIDACION', ingeniero);
  assert.throws(() => s.cambiarEstado('CERRADA', solicitante), /criterios/);
  s.marcarCriterio('c1', true, ingeniero);
  s.cambiarEstado('CERRADA', solicitante);
  assert.equal(s.estado, 'CERRADA');
  const tipos = s.extraerEventos().map((e) => e.tipo);
  assert.equal(tipos.at(-1), 'solicitud.cerrada');
});

test('solo se edita en borrador', () => {
  const s = nueva();
  s.editar({ prioridad: 'CRITICA' }, solicitante);
  assert.equal(s.datos.prioridad, 'CRITICA');
  s.cambiarEstado('ENVIADA', solicitante);
  assert.throws(() => s.editar({ prioridad: 'BAJA' }, solicitante), /borrador/);
});
