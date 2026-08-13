// © 2026 Martín Viera. Todos los derechos reservados.
// Tests del chequeo periódico de suscripción Pro IA para la copia descargada
// (PC/APK) — node --test. Es el que decide si se corta el chat/voz con IA;
// la regla de negocio central es "nunca cortar por las dudas" (sin config,
// sin servidor central, o con error de red, sigue habilitado).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { iaHabilitada, motivoSuspension, _internos } from '../src/store/estadoLicencia.js';
import { setConfig } from '../src/store/config.js';

after(() => { setConfig({ licenciaLocal: '' }); delete process.env.MV_SERVIDOR_LICENCIAS; });

function conFetchMock(respuesta, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = respuesta instanceof Function ? respuesta : async () => respuesta;
  return fn().finally(() => { globalThis.fetch = original; });
}

test('sin licenciaLocal configurada, la IA nunca se suspende (no es una copia con suscripción gestionada)', async () => {
  setConfig({ licenciaLocal: '' });
  assert.equal(iaHabilitada(), true);
  await _internos.chequear();
  assert.equal(iaHabilitada(), true, 'sin licencia, ni siquiera intenta chequear contra el servidor central');
});

test('con licenciaLocal pero sin MV_SERVIDOR_LICENCIAS configurado, tampoco corta nunca', async () => {
  setConfig({ licenciaLocal: 'MV-FULL-TEST' });
  delete process.env.MV_SERVIDOR_LICENCIAS;
  await _internos.chequear();
  assert.equal(iaHabilitada(), true);
});

test('el servidor central dice "no gestionada" → nunca se corta (ej: el profesional usa su propia API key)', async () => {
  setConfig({ licenciaLocal: 'MV-FULL-TEST' });
  process.env.MV_SERVIDOR_LICENCIAS = 'https://licencias.test';
  await conFetchMock(
    { ok: true, json: async () => ({ ok: true, gestionada: false }) },
    async () => { await _internos.chequear(); }
  );
  assert.equal(iaHabilitada(), true);
});

test('el servidor central confirma la suscripción activa → IA habilitada', async () => {
  setConfig({ licenciaLocal: 'MV-FULL-TEST' });
  process.env.MV_SERVIDOR_LICENCIAS = 'https://licencias.test';
  await conFetchMock(
    { ok: true, json: async () => ({ ok: true, gestionada: true, activo: true }) },
    async () => { await _internos.chequear(); }
  );
  assert.equal(iaHabilitada(), true);
});

test('el servidor central confirma que la suscripción NO está activa → se corta la IA, con motivo explicado', async () => {
  setConfig({ licenciaLocal: 'MV-FULL-TEST' });
  process.env.MV_SERVIDOR_LICENCIAS = 'https://licencias.test';
  await conFetchMock(
    { ok: true, json: async () => ({ ok: true, gestionada: true, activo: false }) },
    async () => { await _internos.chequear(); }
  );
  assert.equal(iaHabilitada(), false);
  assert.match(motivoSuspension(), /prueba|pago|suscripci/i);

  // Se recupera al volver a estar activa (no queda cortada para siempre).
  await conFetchMock(
    { ok: true, json: async () => ({ ok: true, gestionada: true, activo: true }) },
    async () => { await _internos.chequear(); }
  );
  assert.equal(iaHabilitada(), true);
});

test('fail-open: un error de red o un 500 del servidor central NUNCA corta el acceso a IA', async () => {
  setConfig({ licenciaLocal: 'MV-FULL-TEST' });
  process.env.MV_SERVIDOR_LICENCIAS = 'https://licencias.test';

  await conFetchMock(async () => { throw new Error('ECONNRESET'); }, async () => { await _internos.chequear(); });
  assert.equal(iaHabilitada(), true, 'error de red: no se corta por las dudas');

  await conFetchMock({ ok: false, json: async () => ({}) }, async () => { await _internos.chequear(); });
  assert.equal(iaHabilitada(), true, 'servidor central caído (no-ok): no se corta por las dudas');
});
