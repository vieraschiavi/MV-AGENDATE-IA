// Tests de reseñas del producto — node --test
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { crearResena, resenasPublicas, resenasTodas, moderarResena } from '../src/store/resenas.js';
import { kvSet } from '../src/store/redis.js';

beforeEach(async () => { await kvSet('resenas', []); }); // arrancar limpio

test('una reseña nueva queda pendiente y no se publica hasta aprobarla', async () => {
  const r = await crearResena({ nombre: 'Ana', oficio: 'Electricista', estrellas: 5, comentario: 'Me salvó la agenda.' });
  assert.equal(r.ok, true);
  const pub = await resenasPublicas();
  assert.equal(pub.total, 0, 'sin aprobar no aparece');
  const todas = await resenasTodas();
  assert.equal(todas.resenas.length, 1);
  const id = todas.resenas[0].id;
  await moderarResena(id, 'aprobar');
  const pub2 = await resenasPublicas();
  assert.equal(pub2.total, 1);
  assert.equal(pub2.promedio, 5);
  assert.equal(pub2.resenas[0].nombre, 'Ana');
  assert.ok(!('aprobada' in pub2.resenas[0]), 'no filtra campos internos');
});

test('valida datos y acota estrellas 1..5', async () => {
  assert.equal((await crearResena({ nombre: '', comentario: 'x', estrellas: 5 })).ok, false, 'sin nombre no');
  assert.equal((await crearResena({ nombre: 'Juan', comentario: '', estrellas: 5 })).ok, false, 'sin texto no');
  await crearResena({ nombre: 'Juan', comentario: 'Buenísimo', estrellas: 9 });
  const t = await resenasTodas();
  assert.equal(t.resenas[0].estrellas, 5, 'estrella > 5 se acota a 5');
});

test('promedio con varias aprobadas', async () => {
  for (const e of [5, 4, 3]) await crearResena({ nombre: 'C' + e, comentario: 'ok', estrellas: e });
  const t = await resenasTodas();
  for (const r of t.resenas) await moderarResena(r.id, 'aprobar');
  const pub = await resenasPublicas();
  assert.equal(pub.total, 3);
  assert.equal(pub.promedio, 4); // (5+4+3)/3
});

test('ocultar y eliminar', async () => {
  await crearResena({ nombre: 'D', comentario: 'ok', estrellas: 4 });
  let t = await resenasTodas();
  const id = t.resenas[0].id;
  await moderarResena(id, 'aprobar');
  assert.equal((await resenasPublicas()).total, 1);
  await moderarResena(id, 'ocultar');
  assert.equal((await resenasPublicas()).total, 0, 'ocultada no aparece');
  await moderarResena(id, 'eliminar');
  t = await resenasTodas();
  assert.equal(t.resenas.length, 0, 'eliminada desaparece');
});
