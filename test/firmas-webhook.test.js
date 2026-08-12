// Verificación de firma de los webhooks entrantes.
//
// Lo que se cuida: /webhook/whatsapp y /webhook/voz deciden a qué cuenta
// pertenece el mensaje mirando el propio cuerpo del request. Sin firma,
// cualquiera que sepa el número de un profesional puede simular mensajes
// suyos — meterle citas falsas y gastarle los créditos de IA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  firmaMetaValida, firmaTwilioValida, urlPublica,
  permitirSinSecreto, _reiniciarAvisos
} from '../src/channels/firmas.js';

const APP_SECRET = 'secreto-de-la-app-de-meta';
const AUTH_TOKEN = 'token-de-twilio';

/** Request falso al estilo Express. */
function req({ headers = {}, body = {}, rawBody, url = '/webhook/x', host = 'mi-dominio.com' } = {}) {
  return {
    headers: { host, ...headers },
    body,
    rawBody,
    originalUrl: url,
    protocol: 'https'
  };
}

// ---------- Meta (WhatsApp) ----------

test('Meta: la firma correcta sobre el cuerpo crudo se acepta', () => {
  const crudo = Buffer.from(JSON.stringify({ entry: [{ changes: [] }] }), 'utf8');
  const firma = 'sha256=' + createHmac('sha256', APP_SECRET).update(crudo).digest('hex');
  const r = req({ headers: { 'x-hub-signature-256': firma }, rawBody: crudo });
  assert.equal(firmaMetaValida(r, APP_SECRET), true);
});

test('Meta: un cuerpo alterado invalida la firma', () => {
  const original = Buffer.from(JSON.stringify({ monto: 100 }), 'utf8');
  const firma = 'sha256=' + createHmac('sha256', APP_SECRET).update(original).digest('hex');
  const alterado = Buffer.from(JSON.stringify({ monto: 999 }), 'utf8');
  const r = req({ headers: { 'x-hub-signature-256': firma }, rawBody: alterado });
  assert.equal(firmaMetaValida(r, APP_SECRET), false);
});

test('Meta: firmar con otro secreto no sirve (el atacante no tiene el App Secret)', () => {
  const crudo = Buffer.from('{"hola":1}', 'utf8');
  const firma = 'sha256=' + createHmac('sha256', 'secreto-del-atacante').update(crudo).digest('hex');
  const r = req({ headers: { 'x-hub-signature-256': firma }, rawBody: crudo });
  assert.equal(firmaMetaValida(r, APP_SECRET), false);
});

test('Meta: sin header de firma se rechaza', () => {
  const crudo = Buffer.from('{}', 'utf8');
  assert.equal(firmaMetaValida(req({ rawBody: crudo }), APP_SECRET), false);
});

test('Meta: sin cuerpo crudo se rechaza en vez de dar por buena la firma', () => {
  // Si el body parser no guardó rawBody no hay con qué verificar: el camino
  // seguro es rechazar, nunca asumir que está bien.
  const firma = 'sha256=' + createHmac('sha256', APP_SECRET).update(Buffer.from('{}')).digest('hex');
  const r = req({ headers: { 'x-hub-signature-256': firma }, rawBody: undefined });
  assert.equal(firmaMetaValida(r, APP_SECRET), false);
});

// ---------- Twilio (voz) ----------

/** Firma de Twilio: HMAC-SHA1 base64 de la URL + pares ordenados por clave. */
function firmarTwilio(url, params, token = AUTH_TOKEN) {
  let datos = url;
  for (const k of Object.keys(params).sort()) datos += k + params[k];
  return createHmac('sha1', token).update(Buffer.from(datos, 'utf8')).digest('base64');
}

test('Twilio: la firma correcta se acepta', () => {
  const url = 'https://mi-dominio.com/webhook/voz';
  const body = { To: '+59891234567', From: '+59899999999', SpeechResult: 'hola' };
  const r = req({ headers: { 'x-twilio-signature': firmarTwilio(url, body) }, body, url: '/webhook/voz' });
  assert.equal(firmaTwilioValida(r, AUTH_TOKEN), true);
});

test('Twilio: cambiar el campo "To" invalida la firma', () => {
  // Este es EL ataque: "To" es lo que decide de qué cuenta es la llamada.
  const url = 'https://mi-dominio.com/webhook/voz';
  const original = { To: '+59891234567', From: '+59899999999' };
  const firma = firmarTwilio(url, original);
  const suplantado = { To: '+59897777777', From: '+59899999999' };
  const r = req({ headers: { 'x-twilio-signature': firma }, body: suplantado, url: '/webhook/voz' });
  assert.equal(firmaTwilioValida(r, AUTH_TOKEN), false);
});

test('Twilio: firmar con otro auth token no sirve', () => {
  const url = 'https://mi-dominio.com/webhook/voz';
  const body = { To: '+59891234567' };
  const firma = firmarTwilio(url, body, 'token-del-atacante');
  const r = req({ headers: { 'x-twilio-signature': firma }, body, url: '/webhook/voz' });
  assert.equal(firmaTwilioValida(r, AUTH_TOKEN), false);
});

test('Twilio: sin header de firma se rechaza', () => {
  const r = req({ body: { To: '+59891234567' }, url: '/webhook/voz' });
  assert.equal(firmaTwilioValida(r, AUTH_TOKEN), false);
});

test('Twilio: la URL firmada incluye el query string', () => {
  const url = 'https://mi-dominio.com/webhook/voz/conectar?destino=%2B59891234567';
  const body = {};
  const r = req({
    headers: { 'x-twilio-signature': firmarTwilio(url, body) },
    body, url: '/webhook/voz/conectar?destino=%2B59891234567'
  });
  assert.equal(firmaTwilioValida(r, AUTH_TOKEN), true);
});

test('urlPublica reconstruye el destino atravesando el proxy de Vercel', () => {
  const r = req({
    headers: { 'x-forwarded-host': 'app.midominio.com', 'x-forwarded-proto': 'https', host: 'interno.local' },
    url: '/webhook/voz'
  });
  assert.equal(urlPublica(r), 'https://app.midominio.com/webhook/voz');
});

// ---------- Política cuando todavía no hay secreto ----------

test('sin secreto configurado: por defecto deja pasar (no rompe lo que ya andaba) y avisa una sola vez', () => {
  _reiniciarAvisos();
  delete process.env.MV_WEBHOOKS_ESTRICTOS;
  const avisos = [];
  const original = console.warn;
  console.warn = (...a) => avisos.push(a.join(' '));
  try {
    assert.equal(permitirSinSecreto('canal-test', 'Cargá el secreto.'), true);
    assert.equal(permitirSinSecreto('canal-test', 'Cargá el secreto.'), true);
  } finally {
    console.warn = original;
  }
  assert.equal(avisos.length, 1, 'el aviso no debe repetirse en cada request');
  assert.match(avisos[0], /SIN verificación de firma/);
});

test('con MV_WEBHOOKS_ESTRICTOS=1 y sin secreto, el webhook se rechaza', () => {
  _reiniciarAvisos();
  process.env.MV_WEBHOOKS_ESTRICTOS = '1';
  const original = console.warn;
  console.warn = () => {};
  try {
    assert.equal(permitirSinSecreto('canal-test', 'Cargá el secreto.'), false);
  } finally {
    console.warn = original;
    delete process.env.MV_WEBHOOKS_ESTRICTOS;
  }
});
