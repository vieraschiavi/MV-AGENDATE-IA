// © 2026 Martín Viera. Todos los derechos reservados.

// Que el nombre de variable que alguien carga a mano en Vercel sea el nombre
// que el código realmente lee.
//
// EL BUG QUE ESTO CIERRA: el manual de puesta en producción (el que se sigue
// a mano, y que cubre los 15 proyectos) pide `TWILIO_PHONE_NUMBER` — que es
// además como lo llama la consola de Twilio. El código leía sólo
// `TWILIO_NUMERO`. O sea: cargabas la variable siguiendo el manual, quedaba
// bien escrita en Vercel, y el ChatVoice no atendía. Sin ningún error que lo
// explicara, porque para el código la variable simplemente no existía.
//
// Un desfasaje así no lo agarra ningún test de lógica: los dos lados están
// "bien", sólo que no se hablan. Por eso se verifica el mapeo en sí.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';


const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const CONFIG_JS = readFileSync(join(RAIZ, 'src/store/config.js'), 'utf8');

// Variables que el manual de producción lista para MV Agendate IA. Si el
// manual agrega una, va acá y el test dice si el código la lee o no.
const DEL_MANUAL = [
  'ANTHROPIC_API_KEY', 'MERCADOPAGO_TOKEN', 'ADMIN_KEY', 'SITIO_URL',
  'WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID', 'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_APP_SECRET',
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER',
  'DEEPGRAM_API_KEY', 'ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID',
  'CRM_WEBHOOK_URL', 'EMAIL_DEMOS', 'RESEND_API_KEY', 'EMAIL_FROM',
];

test('toda variable del manual de producción la lee alguien en el código', () => {
  const fuentes = ['src/store/config.js', 'src/store/redis.js', 'src/server.js',
    'src/store/prueba.js', 'src/channels/firmas.js', 'src/store/licencias.js']
    .map((r) => readFileSync(join(RAIZ, r), 'utf8')).join('\n');
  const huerfanas = DEL_MANUAL.filter((v) => !fuentes.includes(v));
  assert.deepEqual(
    huerfanas, [],
    `El manual manda cargar ${huerfanas.join(', ')} pero ningún archivo lo lee. ` +
    'Quien siga el manual va a cargar esa variable en Vercel y no va a pasar nada, ' +
    'sin ningún error que lo explique.'
  );
});

test('una clave puede aceptar más de un nombre de variable', () => {
  // El mecanismo, no sólo el caso puntual: ENV[k] admite un array y gana el
  // primero DEFINIDO. Sin esto, cada alias nuevo habría que cablearlo a mano.
  assert.match(CONFIG_JS, /function desdeEntorno/, 'se perdió el resolvedor de alias');
  assert.match(CONFIG_JS, /Array\.isArray\(nombres\)/, 'desdeEntorno dejó de aceptar varios nombres');
});

// config.js cachea el valor en la primera lectura, así que cambiar una
// variable de entorno "en caliente" no se ve. Se importa el módulo de nuevo
// con una query única: en ESM eso da una instancia fresca, con el caché
// vacío, que lee el entorno tal como está ahora. Es lo mismo que pasa de
// verdad en producción, donde el proceso arranca con las variables ya
// cargadas — y evita agregarle a config.js una API de invalidación que sólo
// existiría para los tests.
let n = 0;
async function leerConEntorno(vars) {
  const previo = {};
  for (const [k, v] of Object.entries(vars)) {
    previo[k] = process.env[k];
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  try {
    const mod = await import(`../src/store/config.js?fresco=${++n}`);
    return mod.get('twilioNumero');
  } finally {
    for (const [k, v] of Object.entries(previo)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
}

test('el número de Twilio se toma con cualquiera de los dos nombres', async () => {
  assert.equal(
    await leerConEntorno({ TWILIO_NUMERO: undefined, TWILIO_PHONE_NUMBER: '+59899111222' }),
    '+59899111222', 'no tomó TWILIO_PHONE_NUMBER, que es el nombre que pide el manual'
  );
  assert.equal(
    await leerConEntorno({ TWILIO_NUMERO: '+59899333444', TWILIO_PHONE_NUMBER: undefined }),
    '+59899333444', 'no tomó TWILIO_NUMERO, el nombre histórico'
  );
  // Con los dos cargados gana el histórico: a nadie que hoy tenga el ChatVoice
  // andando se le puede cambiar el número por culpa de este alias nuevo.
  assert.equal(
    await leerConEntorno({ TWILIO_NUMERO: '+59899333444', TWILIO_PHONE_NUMBER: '+59899111222' }),
    '+59899333444', 'con ambos puestos tiene que ganar TWILIO_NUMERO'
  );
});
