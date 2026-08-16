// © 2026 Martín Viera. Todos los derechos reservados.

// GET /api/diagnostico — chequeo de despliegue sin exponer secretos.
//
// Sirve para confirmar desde afuera (curl, sin clave admin) que un deploy
// nuevo quedó conectado a MercadoPago, a Redis y con la URL pública
// correcta, sin tener que abrir el panel de Vercel ni pegar un token en un
// chat. Por eso el contrato central del test es negativo: el token de
// MercadoPago JAMÁS puede aparecer en la respuesta, solo un booleano.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let base, servidor;
const J = { 'Content-Type': 'application/json' };

before(async () => {
  process.env.MV_DATOS_DIR = mkdtempSync(join(tmpdir(), 'mv-diagnostico-'));
  process.env.MV_ESCRITORIO = '1';
  // Sin esto, al importar server.js arranca SU PROPIO servidor real (además
  // del que levantamos abajo) y el chequeo periódico de licencia/retrasos:
  // el proceso queda vivo de más y el test tarda minutos en cerrar.
  process.env.VERCEL = '1';

  const { default: app } = await import('../src/server.js');
  servidor = app.listen(0);
  await new Promise((listo) => servidor.once('listening', listo));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => {
  servidor?.close();
  delete process.env.VERCEL;
});

test('sin nada configurado, informa todo en false/null y no rompe', async () => {
  const r = await fetch(`${base}/api/diagnostico`);
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.deepEqual(d, { mercadopago: false, modoCobro: null, sitioUrl: null, almacenPersistente: false });
});

test('distingue el token de prueba del de producción', async () => {
  // Con credenciales de producción cada cobro de la demo sale de una tarjeta
  // real. Los dos casos daban `mercadopago: true` idéntico, así que creer que
  // se está en prueba estando en producción se pagaba con dinero.
  await fetch(`${base}/api/config`, { method: 'POST', headers: J,
    body: JSON.stringify({ mercadopagoToken: 'TEST-1234-abcd' }) });
  assert.equal((await (await fetch(`${base}/api/diagnostico`)).json()).modoCobro, 'prueba');

  await fetch(`${base}/api/config`, { method: 'POST', headers: J,
    body: JSON.stringify({ mercadopagoToken: 'APP_USR-1234-abcd' }) });
  assert.equal((await (await fetch(`${base}/api/diagnostico`)).json()).modoCobro, 'produccion');
});

test('refleja MercadoPago y sitioUrl configurados, sin exponer el token', async () => {
  await fetch(`${base}/api/config`, { method: 'POST', headers: J, body: JSON.stringify({
    mercadopagoToken: 'TEST-token-bien-secreto', sitioUrl: 'https://www.mvbusinesscalendar.com'
  }) });
  const r = await fetch(`${base}/api/diagnostico`);
  const d = await r.json();
  assert.equal(d.mercadopago, true);
  assert.equal(d.sitioUrl, 'https://www.mvbusinesscalendar.com');
  assert.ok(!JSON.stringify(d).includes('TEST-token-bien-secreto'), 'el token nunca puede viajar en esta respuesta');
});

test('sin Twilio configurado, la telefonía responde 200 y no un error', async () => {
  // Que Twilio no esté configurado es el estado normal de una instalación
  // recién hecha. Con un status de error, el navegador marcaba rojo en la
  // consola del panel en CADA carga —indistinguible de una falla real— y en
  // monitoreo figuraba como error. El panel ya trata `ok:false` como "no hay
  // nada que mostrar", así que el 200 no le cambia nada.
  await fetch(`${base}/api/config`, { method: 'POST', headers: J,
    body: JSON.stringify({ twilioAccountSid: '', twilioAuthToken: '' }) });
  const r = await fetch(`${base}/api/telefonia/mis-numeros`);
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.ok, false);
  assert.equal(d.configurado, false);
  assert.deepEqual(d.numeros, [], 'el panel itera esta lista: no puede venir sin definir');
});

test('es pública: no exige clave de administración', async () => {
  await fetch(`${base}/api/config`, { method: 'POST', headers: J, body: JSON.stringify({ adminKey: 'clave-secreta' }) });
  delete process.env.MV_ESCRITORIO;
  try {
    const r = await fetch(`${base}/api/diagnostico`);
    assert.equal(r.status, 200, 'sirve para chequear un deploy desde afuera, sin clave');
  } finally {
    process.env.MV_ESCRITORIO = '1';
    await fetch(`${base}/api/config`, { method: 'POST', headers: J, body: JSON.stringify({ adminKey: '' }) });
  }
});
