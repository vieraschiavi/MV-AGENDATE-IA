// Una clave guardada VACÍA no puede tapar a su variable de entorno.
//
// setConfig persiste las 49 claves de una sola vez, incluidas las que nadie
// tocó. Si una cadena vacía contara como "configurado", el camino más normal
// del mundo —arrancar la app, ver que falta configurar algo, poner las claves
// en .env, reiniciar— dejaba de funcionar en silencio.
//
// No es teórico: así fue como la verificación de firma de los webhooks de
// Twilio nunca llegaba a activarse, porque el Auth Token del entorno se leía
// como vacío y el canal pasaba a "no hay secreto, dejá pasar".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Carga config.js aislado, con un data/ propio y las env que se le pasen. */
async function cargarConfig({ archivo = {}, env = {} }) {
  const dir = mkdtempSync(join(tmpdir(), 'mv-cfg-'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'config.json'), JSON.stringify(archivo));

  const previo = { ...process.env };
  process.env.MV_DATOS_DIR = dir;
  for (const [k, v] of Object.entries(env)) process.env[k] = v;

  // Import con query única: fuerza una instancia nueva del módulo (y su caché).
  const mod = await import(`../src/store/config.js?t=${Math.random()}`);
  const leer = (clave) => mod.get(clave);
  const restaurar = () => { process.env = previo; };
  return { leer, restaurar };
}

test('una clave guardada vacía deja pasar la variable de entorno', async () => {
  const { leer, restaurar } = await cargarConfig({
    archivo: { twilioAuthToken: '', anthropicApiKey: '' },
    env: { TWILIO_AUTH_TOKEN: 'token-del-entorno', ANTHROPIC_API_KEY: 'sk-del-entorno' }
  });
  try {
    assert.equal(leer('twilioAuthToken'), 'token-del-entorno');
    assert.equal(leer('anthropicApiKey'), 'sk-del-entorno');
  } finally { restaurar(); }
});

test('una clave guardada CON valor le sigue ganando a la variable de entorno', async () => {
  // La prioridad de siempre: lo que el usuario cargó en el panel manda.
  const { leer, restaurar } = await cargarConfig({
    archivo: { twilioAuthToken: 'token-del-panel' },
    env: { TWILIO_AUTH_TOKEN: 'token-del-entorno' }
  });
  try {
    assert.equal(leer('twilioAuthToken'), 'token-del-panel');
  } finally { restaurar(); }
});

test('sin archivo ni entorno, la clave queda vacía', async () => {
  const { leer, restaurar } = await cargarConfig({ archivo: {}, env: {} });
  try {
    assert.equal(leer('twilioAuthToken'), '');
  } finally { restaurar(); }
});

test('el caso que rompía la firma de los webhooks, punta a punta', async () => {
  // Config guardado por una corrida anterior en la que no había credenciales:
  // todas las claves quedaron en ''. Después se cargó el .env.
  const guardadoVacio = Object.fromEntries(
    ['twilioAuthToken', 'twilioAccountSid', 'whatsappToken', 'whatsappAppSecret', 'mercadopagoToken']
      .map((k) => [k, ''])
  );
  const { leer, restaurar } = await cargarConfig({
    archivo: guardadoVacio,
    env: {
      TWILIO_AUTH_TOKEN: 'auth-token-real',
      WHATSAPP_APP_SECRET: 'app-secret-real',
      MERCADOPAGO_TOKEN: 'mp-token-real'
    }
  });
  try {
    // Si alguno de estos vuelve '', el canal cree que no hay secreto y deja
    // entrar cualquier webhook sin firmar.
    assert.equal(leer('twilioAuthToken'), 'auth-token-real');
    assert.equal(leer('whatsappAppSecret'), 'app-secret-real');
    assert.equal(leer('mercadopagoToken'), 'mp-token-real');
  } finally { restaurar(); }
});
