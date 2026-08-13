// © 2026 Martín Viera. Todos los derechos reservados.

// Autoconfiguración de Twilio (ChatVoice) desde el panel — sin que la
// profesional no tenga que entrar nunca a la consola de Twilio. Usa las mismas
// credenciales (Account SID / Auth Token) que ya se cargan en /config.html.
import { get as cfg } from './config.js';

const API = 'https://api.twilio.com/2010-04-01';

function credenciales() {
  const sid = cfg('twilioAccountSid');
  const token = cfg('twilioAuthToken');
  if (!sid || !token) return null;
  return { sid, token, auth: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64') };
}

export function twilioActivo() { return !!credenciales(); }

async function llamarTwilio(metodo, ruta, params) {
  const cred = credenciales();
  if (!cred) return { ok: false, error: 'Falta configurar Account SID / Auth Token de Twilio en /config.html.' };
  try {
    const opciones = { method: metodo, headers: { Authorization: cred.auth } };
    let url = `${API}/Accounts/${cred.sid}${ruta}`;
    if (params && metodo === 'GET') url += '?' + new URLSearchParams(params);
    if (params && metodo === 'POST') {
      opciones.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      opciones.body = new URLSearchParams(params);
    }
    const r = await fetch(url, { ...opciones, signal: AbortSignal.timeout(20000) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: d.message || `Twilio respondió ${r.status}.` };
    return { ok: true, datos: d };
  } catch (e) {
    return { ok: false, error: String(e.message || e).slice(0, 300) };
  }
}

/** Números disponibles para comprar en un país (código ISO2, ej. "UY", "US"). */
export async function numerosDisponibles(pais = 'UY') {
  const r = await llamarTwilio('GET', `/AvailablePhoneNumbers/${pais}/Local.json`, { VoiceEnabled: 'true', PageSize: '10' });
  if (!r.ok) return r;
  const numeros = (r.datos.available_phone_numbers || []).map((n) => ({
    numero: n.phone_number, region: n.locality || n.region || pais, precio_ref_usd: 1.15
  }));
  return { ok: true, numeros };
}

/** Números que ya son de esta cuenta (para mostrar cuál está activo). */
export async function misNumeros() {
  const r = await llamarTwilio('GET', '/IncomingPhoneNumbers.json', { PageSize: '20' });
  if (!r.ok) return r;
  const numeros = (r.datos.incoming_phone_numbers || []).map((n) => ({
    numero: n.phone_number, sid: n.sid, voiceUrl: n.voice_url || null, amigo: n.friendly_name
  }));
  return { ok: true, numeros };
}

/** Compra un número y lo deja configurado apuntando a /webhook/voz de este mismo deploy. */
export async function comprarNumero(numero, urlBase) {
  const voiceUrl = `${urlBase.replace(/\/$/, '')}/webhook/voz`;
  const r = await llamarTwilio('POST', '/IncomingPhoneNumbers.json', {
    PhoneNumber: numero, VoiceUrl: voiceUrl, VoiceMethod: 'POST'
  });
  if (!r.ok) return r;
  return { ok: true, numero: r.datos.phone_number, sid: r.datos.sid, voiceUrl };
}

/** Re-apunta el webhook de voz de un número ya comprado (por si cambia el dominio). */
export async function configurarWebhook(sid, urlBase) {
  const voiceUrl = `${urlBase.replace(/\/$/, '')}/webhook/voz`;
  const r = await llamarTwilio('POST', `/IncomingPhoneNumbers/${sid}.json`, { VoiceUrl: voiceUrl, VoiceMethod: 'POST' });
  if (!r.ok) return r;
  return { ok: true, voiceUrl };
}

/** Dispara una llamada de PRUEBA real a un teléfono, para validar ChatVoice sin publicar el número todavía. */
export async function llamarPrueba(telefonoDestino, urlBase) {
  const cred = credenciales();
  if (!cred) return { ok: false, error: 'Falta configurar Account SID / Auth Token de Twilio en /config.html.' };
  const mios = await misNumeros();
  const from = mios.ok && mios.numeros[0]?.numero;
  if (!from) return { ok: false, error: 'Todavía no hay ningún número Twilio activo — comprá uno primero.' };
  const url = `${urlBase.replace(/\/$/, '')}/webhook/voz`;
  return llamarTwilio('POST', '/Calls.json', { To: telefonoDestino, From: from, Url: url, Method: 'POST' });
}

/**
 * "Devolver la llamada" con un clic: Twilio llama primero al AGENTE humano
 * (el teléfono del profesional); apenas atiende, lo conecta con el
 * cliente/lead — el agente no tiene que marcar el número a mano.
 */
export async function clickToCall(numeroAgente, numeroDestino, urlBase) {
  const cred = credenciales();
  if (!cred) return { ok: false, error: 'Falta configurar Account SID / Auth Token de Twilio en /config.html.' };
  const mios = await misNumeros();
  const from = mios.ok && mios.numeros[0]?.numero;
  if (!from) return { ok: false, error: 'Todavía no hay ningún número Twilio activo — comprá uno primero.' };
  const url = `${urlBase.replace(/\/$/, '')}/webhook/voz/conectar?destino=${encodeURIComponent(numeroDestino)}`;
  return llamarTwilio('POST', '/Calls.json', { To: numeroAgente, From: from, Url: url, Method: 'POST' });
}
