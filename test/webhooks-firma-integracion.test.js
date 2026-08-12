// Verificación de firma contra el SERVIDOR REAL, no contra las funciones sueltas.
//
// Por qué existe además de test/firmas-webhook.test.js: aquel prueba el HMAC
// como función pura, y eso deja pasar el error que importa. De hecho ya pasó:
// con TWILIO_AUTH_TOKEN cargado, el webhook de voz igual dejaba entrar todo sin
// firmar (una clave guardada vacía tapaba la variable de entorno) y los tests
// unitarios seguían en verde, porque nunca llegaban a la ruta.
//
// Este archivo levanta el server con credenciales de prueba y le pega por HTTP
// como lo haría un atacante y como lo haría Twilio o Meta.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const AUTH_TOKEN = 'token-twilio-de-prueba';
const APP_SECRET = 'app-secret-de-prueba';

let base;
let servidor;

before(async () => {
  // data/ propio para no pisar el del repo ni heredar claves guardadas.
  const datos = mkdtempSync(join(tmpdir(), 'mv-firma-'));
  process.env.MV_DATOS_DIR = datos;

  // A propósito: un config.json como el que deja una corrida anterior sin
  // credenciales, con las claves guardadas VACÍAS. Es el escenario que rompía
  // todo esto en silencio —la cadena vacía tapaba a la variable de entorno, el
  // canal creía que no había secreto y dejaba pasar cualquier webhook sin
  // firmar— y que los tests unitarios de firmas.js no podían ver.
  writeFileSync(join(datos, 'config.json'), JSON.stringify({
    twilioAuthToken: '', twilioAccountSid: '', whatsappToken: '',
    whatsappPhoneId: '', whatsappAppSecret: ''
  }));
  process.env.MV_ESCRITORIO = '1';        // saltea el rate limit del entorno de test
  // Importar server.js en modo serverless: así exporta la app pero no abre su
  // propio listener ni deja intervalos corriendo, que dejarían el test colgado.
  process.env.VERCEL = '1';
  process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;
  process.env.WHATSAPP_APP_SECRET = APP_SECRET;
  process.env.WHATSAPP_TOKEN = 'token-wa';
  process.env.WHATSAPP_PHONE_ID = '111';
  delete process.env.MV_WEBHOOKS_ESTRICTOS;

  const { default: app } = await import('../src/server.js');
  await new Promise((listo) => { servidor = app.listen(0, listo); });
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => { servidor?.close(); delete process.env.VERCEL; });

// --- helpers de firma (los mismos algoritmos, escritos aparte a propósito) ---

function firmarTwilio(url, params, token = AUTH_TOKEN) {
  let datos = url;
  for (const k of Object.keys(params).sort()) datos += k + params[k];
  return createHmac('sha1', token).update(Buffer.from(datos, 'utf8')).digest('base64');
}
const firmarMeta = (cuerpo, secreto = APP_SECRET) =>
  'sha256=' + createHmac('sha256', secreto).update(Buffer.from(cuerpo, 'utf8')).digest('hex');

const postVoz = (cuerpo, firma) => fetch(`${base}/webhook/voz`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    ...(firma ? { 'X-Twilio-Signature': firma } : {})
  },
  body: new URLSearchParams(cuerpo).toString()
});

const postWhatsapp = (cuerpo, firma) => fetch(`${base}/webhook/whatsapp`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(firma ? { 'X-Hub-Signature-256': firma } : {}) },
  body: cuerpo
});

const CUERPO_VOZ = { To: '+59891234567', From: '+59899999999', SpeechResult: 'hola' };
const cuerpoWhatsapp = (texto = 'hola') => JSON.stringify({
  entry: [{ changes: [{ value: { metadata: { phone_number_id: '111' }, messages: [{ from: '598999', type: 'text', text: { body: texto } }] } }] }]
});

// ---------- Twilio ----------

test('voz: un POST sin firma se rechaza', async () => {
  assert.equal((await postVoz(CUERPO_VOZ)).status, 403);
});

test('voz: un POST con firma inventada se rechaza', async () => {
  assert.equal((await postVoz(CUERPO_VOZ, 'firmaInventada==')).status, 403);
});

test('voz: firmar con OTRO auth token no sirve', async () => {
  const firma = firmarTwilio(`${base}/webhook/voz`, CUERPO_VOZ, 'token-del-atacante');
  assert.equal((await postVoz(CUERPO_VOZ, firma)).status, 403);
});

test('voz: cambiar el "To" después de firmar se rechaza', async () => {
  // El ataque que importa: "To" es lo que decide de qué cuenta es la llamada.
  const firma = firmarTwilio(`${base}/webhook/voz`, { ...CUERPO_VOZ, To: '+59891111111' });
  assert.equal((await postVoz(CUERPO_VOZ, firma)).status, 403);
});

test('voz: con la firma correcta atiende normalmente', async () => {
  const r = await postVoz(CUERPO_VOZ, firmarTwilio(`${base}/webhook/voz`, CUERPO_VOZ));
  assert.equal(r.status, 200);
  assert.match(await r.text(), /<Response>/, 'tiene que devolver TwiML');
});

// ---------- Meta ----------

test('whatsapp: un POST sin firma se rechaza', async () => {
  assert.equal((await postWhatsapp(cuerpoWhatsapp())).status, 403);
});

test('whatsapp: firmar con OTRO secreto no sirve', async () => {
  const cuerpo = cuerpoWhatsapp();
  assert.equal((await postWhatsapp(cuerpo, firmarMeta(cuerpo, 'otro-secreto'))).status, 403);
});

test('whatsapp: alterar el cuerpo después de firmar se rechaza', async () => {
  const original = cuerpoWhatsapp('hola');
  const firma = firmarMeta(original);
  assert.equal((await postWhatsapp(cuerpoWhatsapp('chau'), firma)).status, 403);
});

test('whatsapp: con la firma correcta acepta', async () => {
  const cuerpo = cuerpoWhatsapp();
  assert.equal((await postWhatsapp(cuerpo, firmarMeta(cuerpo))).status, 200);
});
