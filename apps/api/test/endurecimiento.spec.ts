import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esInterna, LimitadorVentana } from '../src/compartido/infraestructura/limitador';
import { validarEntorno } from '../src/compartido/infraestructura/entorno';

test('limitador: permite hasta el límite y bloquea con tiempo de espera', () => {
  const l = new LimitadorVentana(3, 60_000);
  const t0 = 1_000_000;
  assert.deepEqual([1, 2, 3].map(() => l.permitir('ip', t0).permitido), [true, true, true]);
  const r = l.permitir('ip', t0 + 15_000);
  assert.equal(r.permitido, false);
  assert.equal(r.reintentarEnSeg, 45);
  assert.equal(l.permitir('otra', t0).permitido, true, 'cada cliente tiene su propia cuenta');
  assert.equal(l.permitir('ip', t0 + 60_000).permitido, true, 'la ventana se reinicia');
});

test('limitador: acota la memoria limpiando ventanas', () => {
  const l = new LimitadorVentana(10, 1000, 100);
  for (let i = 0; i < 100; i++) l.permitir(`c${i}`, 0);
  l.permitir('nuevo', 5000); // todas vencidas → se limpian
  assert.equal(l.tamano, 1);
  for (let i = 0; i < 150; i++) l.permitir(`d${i}`, 6000); // sin vencer: recorta a la mitad
  assert.ok(l.tamano <= 100);
});

test('solo el tráfico local es interno', () => {
  assert.deepEqual(['127.0.0.1', '::1', '::ffff:127.0.0.1', '190.1.2.3', undefined].map(esInterna), [true, true, true, false, false]);
});

test('entorno de producción incompleto o inseguro', () => {
  const { errores, avisos } = validarEntorno({ NODE_ENV: 'production', DATABASE_URL: 'postgres://app:postgres@localhost/x', WEB_URL: 'http://x' });
  assert.ok(errores.some((e) => e.includes('JWT_CLAVE_PRIVADA')), 'lo indispensable impide arrancar');
  assert.ok(avisos.some((e) => e.includes('https')), 'lo inseguro se advierte');
  assert.ok(avisos.some((e) => e.includes('insegura')));
});

test('entorno de producción correcto', () => {
  const r = validarEntorno({
    NODE_ENV: 'production', DATABASE_URL: 'postgres://app:Xk29s!aQ@localhost/sierraflow', WEB_URL: 'https://proyectos.sierrainnova.tech',
    JWT_CLAVE_PRIVADA: '-----BEGIN PRIVATE KEY-----\\nabc', JWT_CLAVE_PUBLICA: 'x', AUTH_GOOGLE_ID: 'g', VAPID_PUBLICA: 'a', VAPID_PRIVADA: 'b',
  });
  assert.deepEqual(r, { errores: [], avisos: [] });
});
