import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aplicacionesPara, categoriaAdjunto, firmaValida, requiereProyecto, TIPOS_SOLICITUD, validarAdjunto, type AplicacionVista,
} from '../src/index';

test('tipos de requerimiento: Nuevo, Normativo, Mejora, Incidente; solo Nuevo exige proyecto', () => {
  assert.deepEqual([...TIPOS_SOLICITUD], ['NUEVO', 'NORMATIVO', 'MEJORA', 'INCIDENTE']);
  assert.equal(requiereProyecto('NUEVO'), true);
  assert.equal(requiereProyecto('MEJORA'), false);
});

test('aplicaciones: solo las activas asignadas al tipo, por nombre', () => {
  const app = (nombre: string, tipos: AplicacionVista['tipos'], activo = true): AplicacionVista =>
    ({ id: nombre, nombre, descripcion: null, tipos, tecnologias: [], activo });
  const apps = [app('Zeus', ['MEJORA']), app('Esculapio', ['MEJORA', 'INCIDENTE']), app('Vieja', ['MEJORA'], false), app('Portal', ['NUEVO'])];
  assert.deepEqual(aplicacionesPara('MEJORA', apps).map((a) => a.nombre), ['Esculapio', 'Zeus']);
  assert.deepEqual(aplicacionesPara('NORMATIVO', apps), []);
});

test('adjuntos: tipos permitidos, tamaño máximo y MIME decidido por la extensión', () => {
  assert.deepEqual(validarAdjunto('captura.PNG', 1000), { ok: true, mime: 'image/png' });
  assert.deepEqual(validarAdjunto('servicio.ts', 10), { ok: true, mime: 'text/plain' });
  assert.deepEqual(validarAdjunto('index.html', 10), { ok: true, mime: 'text/plain' }); // nunca se sirve como HTML
  assert.equal(validarAdjunto('virus.exe', 10).ok, false);
  assert.equal(validarAdjunto('grande.pdf', 11 * 1024 * 1024).ok, false);
  assert.equal(validarAdjunto('vacio.txt', 0).ok, false);
  assert.equal(categoriaAdjunto('a.py', 'text/plain'), 'codigo');
  assert.equal(categoriaAdjunto('a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), 'documento');
});

test('adjuntos: la firma binaria debe coincidir con la extensión en imágenes y PDF', () => {
  assert.equal(firmaValida('application/pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])), true);
  assert.equal(firmaValida('image/png', new Uint8Array([0x25, 0x50, 0x44, 0x46])), false);
  assert.equal(firmaValida('text/plain', new Uint8Array([0x00])), true);
});
