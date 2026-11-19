import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canalesActivos, extracto, PLANTILLAS } from '../src/modulos/notificaciones/dominio/plantillas';

const ctx = { codigo: 'SOL-000234', titulo: 'Pagos COP/USD', actor: 'Carlos Ruiz', comentario: 'Fuera de alcance' };

test('cada estado de la máquina que afecta a personas tiene plantilla', () => {
  for (const e of ['enviada', 'en_revision', 'aprobada', 'rechazada', 'borrador', 'asignada', 'en_desarrollo', 'en_validacion', 'cerrada', 'cancelada']) {
    assert.ok(PLANTILLAS[`solicitud.${e}`]?.length, `falta plantilla para solicitud.${e}`);
  }
  assert.equal(PLANTILLAS['solicitud.creada'], undefined, 'un borrador recién creado no notifica a nadie');
});

test('el rechazo llega al solicitante con el motivo', () => {
  const [r] = PLANTILLAS['solicitud.rechazada']!;
  assert.equal(r!.quien, 'SOLICITANTE');
  assert.equal(r!.severidad, 'ALERTA');
  assert.match(r!.mensaje(ctx), /Carlos Ruiz.*Motivo: Fuera de alcance/);
});

test('la asignación avisa al solicitante y a los asignados con textos distintos', () => {
  const reglas = PLANTILLAS['solicitud.asignada']!;
  assert.deepEqual(reglas.map((r) => r.quien), ['SOLICITANTE', 'ASIGNADOS']);
  assert.notEqual(reglas[0]!.titulo(ctx), reglas[1]!.titulo(ctx));
});

test('el SLA vencido es crítico y va a líderes y directores', () => {
  const [r] = PLANTILLAS['sla.vencido']!;
  assert.equal(r!.quien, 'GESTORES');
  assert.equal(r!.severidad, 'CRITICA');
  assert.match(r!.mensaje({ ...ctx, consumoPct: 130 }), /130%/);
});

test('canales: APP siempre; correo y push según preferencia o valor por defecto', () => {
  const def = { EMAIL: false, PUSH: true };
  assert.deepEqual(canalesActivos(def, []), ['APP', 'PUSH']);
  assert.deepEqual(canalesActivos(def, [{ canal: 'EMAIL', activo: true }]), ['APP', 'EMAIL', 'PUSH']);
  assert.deepEqual(canalesActivos(def, [{ canal: 'PUSH', activo: false }]), ['APP']);
});

test('extracto recorta y normaliza espacios', () => {
  assert.equal(extracto('  hola\n\n mundo  '), 'hola mundo');
  assert.equal(extracto('x'.repeat(200), 10).length, 10);
});
