import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nivelCarga, ordenarRecomendados, puntuar, type Candidato } from './recomendacion';

const c = (nombre: string, tecnologias: string[], cargaPct: number, grupos: string[] = []): Candidato =>
  ({ usuarioId: nombre, nombre, grupos, tecnologias, cargaPct, solicitudesActivas: 0 });

test('niveles de carga', () => {
  assert.deepEqual([10, 50, 85, 100, 140].map(nivelCarga), ['baja', 'media', 'alta', 'sobrecargado', 'sobrecargado']);
});

test('coincidencias de tecnología sin importar mayúsculas ni tildes', () => {
  const p = puntuar(c('Ana', ['next.js', 'Python/FastAPI'], 0), { tecnologias: ['Next.js'], grupos: [] });
  assert.deepEqual(p.coincidencias, ['next.js']);
});

test('domina el stack y tiene poca carga → primero; sobrecargado → último', () => {
  const ctx = { tecnologias: ['Next.js', 'Node.js'], grupos: ['Frontend'] };
  const orden = ordenarRecomendados([
    c('Sobrecargado', ['Next.js', 'Node.js'], 120, ['Frontend']),
    c('Libre sin stack', [], 0),
    c('Experto', ['Next.js', 'Node.js'], 30, ['Frontend']),
  ], ctx).map((x) => x.nombre);
  // Experto: 2×25 + 15 + 35 = 100 · Libre: 50 · Sobrecargado: 50 + 15 + 0 − 30 = 35
  assert.deepEqual(orden, ['Experto', 'Libre sin stack', 'Sobrecargado']);
});

test('pertenecer al grupo elegido suma', () => {
  const ctx = { tecnologias: [], grupos: ['QA'] };
  assert.ok(puntuar(c('A', [], 50, ['QA']), ctx).puntaje > puntuar(c('B', [], 50, ['Backend']), ctx).puntaje);
});

test('empate: orden alfabético', () => {
  const orden = ordenarRecomendados([c('Zoe', [], 0), c('Ana', [], 0)], { tecnologias: [], grupos: [] }).map((x) => x.nombre);
  assert.deepEqual(orden, ['Ana', 'Zoe']);
});
