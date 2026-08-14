// © 2026 Martín Viera. Todos los derechos reservados.

// Preparar el caso de demostración desde el panel, contra el SERVIDOR REAL.
//
// Escribe en el catálogo y en la agenda del profesional, así que lo que más
// importa probar acá es que NO quede abierto: sin clave de administración,
// cualquiera podría llenarle la agenda de citas de demo desde afuera.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let base, servidor;
const J = { 'Content-Type': 'application/json' };
const preparar = (headers = J) => fetch(`${base}/api/demo/preparar`, { method: 'POST', headers, body: '{}' });

before(async () => {
  process.env.MV_DATOS_DIR = mkdtempSync(join(tmpdir(), 'mv-demo-caso-'));
  process.env.MV_ESCRITORIO = '1';
  process.env.VERCEL = '1';

  const { default: app } = await import('../src/server.js');
  servidor = app.listen(0);
  await new Promise((listo) => servidor.once('listening', listo));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => { servidor?.close(); delete process.env.VERCEL; });

test('deja una cita agendada con el monto del catálogo, no uno inventado', async () => {
  const d = await (await preparar()).json();
  assert.equal(d.ok, true);
  assert.equal(d.yaExistia, false);
  assert.equal(d.cita.cotizacion.total, 100);
  assert.equal(d.cita.clienteNombre, 'Martín Viera');

  // El mismo precio tiene que quedar en el CATÁLOGO: si sólo estuviera en la
  // cita, el chatbot no tendría de dónde cotizar los $100 y la demo mostraría
  // al bot inventando un número — justo lo que el producto promete que no pasa.
  const cfg = await (await fetch(`${base}/api/config`)).json();
  const oficios = JSON.parse(cfg.oficiosCustom);
  assert.equal(oficios.demo_visita.trabajos.visita_demo.mano_obra, 100);
});

test('apretar el botón dos veces no duplica la cita', async () => {
  const primera = await (await preparar()).json();
  const segunda = await (await preparar()).json();
  assert.equal(segunda.yaExistia, true);
  assert.equal(segunda.cita.id, primera.cita.id, 'tiene que reutilizar la cita, no llenar la agenda');
});

test('no le pisa al profesional los precios que ya tenía cargados', async () => {
  await fetch(`${base}/api/config`, { method: 'POST', headers: J, body: JSON.stringify({
    oficiosCustom: JSON.stringify({ mi_oficio: { nombre: 'Lo mío', trabajos: { x: { nombre: 'X', mano_obra: 9999 } } } })
  }) });
  await preparar();
  const cfg = await (await fetch(`${base}/api/config`)).json();
  const oficios = JSON.parse(cfg.oficiosCustom);
  assert.equal(oficios.mi_oficio.trabajos.x.mano_obra, 9999, 'el catálogo propio no se puede perder');
  assert.ok(oficios.demo_visita, 'y el de demo se suma al lado');
});

test('preparar la demo exige la clave de administración', async () => {
  // Escribe en el catálogo y en la agenda: abierto, cualquiera desde afuera
  // podría llenarle la agenda de citas de demostración.
  await fetch(`${base}/api/config`, { method: 'POST', headers: J, body: JSON.stringify({ adminKey: 'clave-secreta' }) });
  delete process.env.MV_ESCRITORIO;
  try {
    assert.equal((await preparar()).status, 401, 'sin la clave no puede preparar nada');
    assert.equal((await preparar({ ...J, 'X-Admin-Key': 'clave-secreta' })).status, 200, 'con la clave correcta sí');
  } finally {
    process.env.MV_ESCRITORIO = '1';
    await fetch(`${base}/api/config`, { method: 'POST', headers: J, body: JSON.stringify({ adminKey: '' }) });
  }
});
