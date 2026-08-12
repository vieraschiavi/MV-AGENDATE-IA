// Verificación de firma de los webhooks entrantes (Meta y Twilio).
//
// Por qué existe: /webhook/whatsapp y /webhook/voz son públicos y deciden a qué
// cuenta pertenece el mensaje MIRANDO EL PROPIO CUERPO del request (el
// phone_number_id de Meta, el campo "To" de Twilio). Sin verificar la firma,
// cualquiera que sepa el número de un profesional puede POSTear un mensaje
// falso "a nombre de" esa cuenta: le mete citas y clientes truchos en el CRM,
// le gasta los créditos de IA y de voz, y le inyecta texto al agente.
//
// La firma cierra ese agujero: el atacante puede AFIRMAR ser cualquier cuenta,
// pero el HMAC solo cierra si tiene la clave secreta de esa cuenta. Por eso el
// orden correcto es: leer de quién dice ser → buscar SU secreto → verificar.
//
// Cuando todavía no hay secreto cargado no se rechaza nada (rompería las
// instalaciones que ya están andando), pero se avisa fuerte por consola una vez
// por proceso. Con MV_WEBHOOKS_ESTRICTOS=1 se rechaza también en ese caso, que
// es lo que conviene en un deploy serio; ver docs/CANALES.md.
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Comparación en tiempo constante (evita filtrar la firma esperada por timing). */
function igualSeguro(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * URL pública tal como la llamó el proveedor, que es sobre la que Twilio firma.
 * Atraviesa el proxy de Vercel (x-forwarded-*) y conserva el query string.
 */
export function urlPublica(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  return `${proto}://${host}${req.originalUrl || req.url || ''}`;
}

/**
 * Firma de Meta (WhatsApp Cloud API): HMAC-SHA256 del cuerpo CRUDO con el App
 * Secret de la app, en el header X-Hub-Signature-256.
 *
 * Necesita el cuerpo sin parsear: `JSON.stringify(req.body)` NO sirve porque no
 * reproduce byte a byte lo que mandó Meta (espacios, orden, escapes). El server
 * lo guarda en req.rawBody con la opción `verify` de express.json.
 */
export function firmaMetaValida(req, appSecret) {
  const recibida = String(req.headers['x-hub-signature-256'] || '');
  if (!recibida.startsWith('sha256=')) return false;
  if (!Buffer.isBuffer(req.rawBody)) return false; // sin cuerpo crudo no se puede verificar
  const esperada = 'sha256=' + createHmac('sha256', appSecret).update(req.rawBody).digest('hex');
  return igualSeguro(recibida, esperada);
}

/**
 * Firma de Twilio: HMAC-SHA1 en base64 sobre la URL completa concatenada con
 * los pares del POST form-encoded ordenados por clave, en X-Twilio-Signature.
 */
export function firmaTwilioValida(req, authToken, url = urlPublica(req)) {
  const recibida = String(req.headers['x-twilio-signature'] || '');
  if (!recibida) return false;
  const cuerpo = req.body && typeof req.body === 'object' ? req.body : {};
  let datos = url;
  for (const clave of Object.keys(cuerpo).sort()) datos += clave + cuerpo[clave];
  const esperada = createHmac('sha1', authToken).update(Buffer.from(datos, 'utf8')).digest('base64');
  return igualSeguro(recibida, esperada);
}

/** Modo estricto: sin secreto cargado, el webhook se rechaza en vez de pasar. */
export function webhooksEstrictos() {
  return /^(1|true|si|sí)$/i.test(String(process.env.MV_WEBHOOKS_ESTRICTOS || ''));
}

const yaAvisado = new Set();

/**
 * Decide qué hacer cuando no hay secreto configurado para ese canal.
 * Devuelve true si el request puede seguir, false si hay que rechazarlo.
 */
export function permitirSinSecreto(canal, comoConfigurarlo) {
  if (!yaAvisado.has(canal)) {
    yaAvisado.add(canal);
    const queda = webhooksEstrictos()
      ? 'MV_WEBHOOKS_ESTRICTOS=1 → se rechazan los webhooks hasta configurarlo.'
      : 'Hasta configurarlo, CUALQUIERA que sepa tu número puede simular mensajes entrantes: gastarte créditos de IA y meterte citas falsas en la agenda.';
    console.warn(`[${canal}] ⚠️  Webhook SIN verificación de firma. ${comoConfigurarlo} ${queda}`);
  }
  return !webhooksEstrictos();
}

/** Solo para tests: olvida qué canales ya avisaron. */
export function _reiniciarAvisos() { yaAvisado.clear(); }
