import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aCsv, agruparPorEtapa, duracion, escalaY } from './indicadores';

test('agrupa estados en etapas por departamento, ignora borradores y ordena por total', () => {
  const r = agruparPorEtapa([
    { departamento: 'TI', color_hex: '#22C55E', estado: 'ENVIADA', total: 2 },
    { departamento: 'TI', color_hex: '#22C55E', estado: 'EN_REVISION', total: 1 },
    { departamento: 'TI', color_hex: '#22C55E', estado: 'EN_DESARROLLO', total: 4 },
    { departamento: 'FIN', color_hex: '#EAB308', estado: 'CERRADA', total: 1 },
    { departamento: 'FIN', color_hex: '#EAB308', estado: 'BORRADOR', total: 9 },
  ]);
  assert.deepEqual(r.map((d) => [d.departamento, d.total]), [['TI', 7], ['FIN', 1]]);
  assert.equal(r[0]!.porEtapa.revision, 3);
  assert.equal(r[0]!.porEtapa.ejecucion, 4);
});

test('duración legible', () => {
  assert.equal(duracion(null), '—');
  assert.equal(duracion(18.4), '18 h');
  assert.equal(duracion(84), '3,5 días');
});

test('escala Y con marcas enteras', () => {
  assert.deepEqual(escalaY(0), { max: 4, ticks: [0, 1, 2, 3, 4] });
  assert.deepEqual(escalaY(7), { max: 8, ticks: [0, 2, 4, 6, 8] });
  assert.equal(escalaY(37).max, 40);
});

test('CSV para Excel: punto y coma, coma decimal, comillas y BOM', () => {
  const csv = aCsv([{ a: 'Hola; "mundo"', b: 7.5 }], [{ clave: 'a', titulo: 'Texto' }, { clave: 'b', titulo: 'Horas' }]);
  assert.equal(csv, '﻿Texto;Horas\r\n"Hola; ""mundo""";7,5');
});
