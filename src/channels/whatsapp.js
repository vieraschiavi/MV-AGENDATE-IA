// Canal WhatsApp — webhook de Meta Cloud API.
// Configuración: cargar token/phone id/verify token en /config.html (panel
// admin, sin tocar archivos ni redeploy) o, alternativamente, como variables
// de entorno WHATSAPP_TOKEN/WHATSAPP_PHONE_ID/WHATSAPP_VERIFY_TOKEN. Luego, en
// Meta for Developers → WhatsApp → Webhooks, apuntar a
//   GET/POST https://tu-dominio/webhook/whatsapp  con el mismo verify token.
import { Router } from 'express';
import { conversar } from '../ai/agente.js';
import { geocodificarInverso } from '../ai/geocoding.js';
import { get as cfg } from '../store/config.js';
import { runConCuenta } from '../store/contextoCuenta.js';
import { cuentaPorPhoneId, obtenerOverrides } from '../store/configCuentas.js';
import { listarCuentaIds } from '../store/cuentas.js';
import { limitar } from '../store/limites.js';
import { firmaMetaValida, permitirSinSecreto } from './firmas.js';

const router = Router();

const TOKEN = () => cfg('whatsappToken');
const PHONE_ID = () => cfg('whatsappPhoneId');
const APP_SECRET = () => cfg('whatsappAppSecret');
const VERIFY = () => cfg('whatsappVerifyToken') || 'mv-agendate-verify';

// Verificación del webhook (la hace Meta una sola vez). Además del verify token
// global de la instancia, vale el de cualquier cuenta SaaS que haya conectado
// su propia app de WhatsApp Business (fase 2).
router.get('/webhook/whatsapp', async (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode !== 'subscribe' || !token) return res.sendStatus(403);
  if (token === VERIFY()) return res.status(200).send(challenge);
  try {
    for (const id of await listarCuentaIds()) {
      const ov = await obtenerOverrides(id);
      if (ov.whatsappVerifyToken && token === ov.whatsappVerifyToken) return res.status(200).send(challenge);
    }
  } catch { /* sin cuentas: cae al 403 */ }
  return res.sendStatus(403);
});

// Mensajes entrantes
router.post('/webhook/whatsapp', limitar({
  nombre: 'webhook-whatsapp', max: 300, ventanaSeg: 60,
  mensaje: 'Demasiados mensajes seguidos.'
}), async (req, res) => {
  // Ruteo multi-cuenta (fase 2): si el Phone Number ID que recibió el mensaje
  // pertenece a una cuenta SaaS, TODO el manejo (agente, catálogo, datos,
  // respuesta) corre con la configuración y los datos de ESA cuenta. Si no
  // matchea ninguna, es el número global de la instancia (modo clásico).
  //
  // Se resuelve ANTES de contestar 200 porque de la cuenta dueña sale el App
  // Secret con el que se verifica la firma: el atacante puede decir ser
  // cualquiera, pero sin esa clave el HMAC no cierra.
  const cambios = req.body?.entry?.flatMap((e) => e.changes ?? []) ?? [];
  const phoneId = cambios.find((c) => c.value?.metadata?.phone_number_id)?.value?.metadata?.phone_number_id;
  const duenio = phoneId && phoneId !== PHONE_ID()
    ? await cuentaPorPhoneId(phoneId, await listarCuentaIds()).catch(() => null)
    : null;

  const secreto = duenio?.overrides?.whatsappAppSecret || APP_SECRET();
  if (secreto) {
    if (!firmaMetaValida(req, secreto)) {
      console.warn(`[whatsapp] Webhook con firma inválida (phone_number_id: ${phoneId || 'desconocido'}) — descartado.`);
      return res.sendStatus(403);
    }
  } else if (!permitirSinSecreto('whatsapp', 'Cargá el App Secret de Meta en /config.html (o WHATSAPP_APP_SECRET).')) {
    return res.sendStatus(403);
  }

  res.sendStatus(200); // responder rápido; procesar async

  try {
    const procesar = duenio
      ? (fn) => runConCuenta(duenio.cuentaId, duenio.overrides, fn)
      : (fn) => fn();
    for (const c of cambios) {
      const msg = c.value?.messages?.[0];
      if (!msg) continue;
      const de = msg.from; // ej: 59899123456
      let texto;
      if (msg.type === 'text') {
        texto = msg.text.body;
      } else if (msg.type === 'location') {
        // El cliente compartió su ubicación nativa: llegan lat/lng exactos,
        // sin necesidad de geocoding. Se lo describimos al agente como texto
        // (mismo canal de "conversación") para que use esas coordenadas
        // directo en vez de pedirle la dirección o geocodificarla.
        const { latitude, longitude, name, address } = msg.location;
        let direccionAprox = [name, address].filter(Boolean).join(', ');
        if (!direccionAprox) {
          const inv = await geocodificarInverso(latitude, longitude).catch(() => null);
          direccionAprox = inv?.ok ? inv.direccion : '';
        }
        texto = `[Ubicación compartida: lat ${latitude}, lng ${longitude}${direccionAprox ? ` — dirección aproximada: ${direccionAprox}` : ''}]`;
      } else {
        continue; // otros tipos (imagen, audio, etc.) no se procesan por ahora
      }
      await procesar(async () => {
        const respuesta = await conversar(`wa:${de}`, texto, 'whatsapp');
        await enviarWhatsApp(de, respuesta); // con cuenta activa usa SUS credenciales
      });
    }
  } catch (err) {
    console.error('[whatsapp] Error procesando webhook:', err);
  }
});

/**
 * Prueba la conexión con Meta (sin enviar ningún mensaje): confirma que el
 * token y el Phone Number ID son válidos y devuelve el número de WhatsApp
 * asociado, para que el panel pueda mostrar "conectado: +598 9X XXX XXX".
 */
export async function probarConexion() {
  if (!TOKEN() || !PHONE_ID()) return { ok: false, error: 'Falta cargar el token y el Phone Number ID.' };
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID()}?fields=display_phone_number,verified_name`, {
      headers: { Authorization: `Bearer ${TOKEN()}` },
      signal: AbortSignal.timeout(15000)
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: d.error?.message || `Meta respondió ${r.status}.` };
    return { ok: true, numero: d.display_phone_number, nombre: d.verified_name };
  } catch (e) {
    return { ok: false, error: String(e.message || e).slice(0, 300) };
  }
}

export async function enviarWhatsApp(numero, texto) {
  if (!TOKEN() || !PHONE_ID()) {
    console.log(`[whatsapp][demo] → ${numero}: ${texto}`);
    return;
  }
  let resp;
  try {
    resp = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID()}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: numero,
        type: 'text',
        text: { body: texto.slice(0, 4096) }
      }),
      // Sin timeout, una respuesta lenta de Meta deja la promesa colgada para
      // siempre y el turno del cliente se pierde en silencio.
      signal: AbortSignal.timeout(15000)
    });
  } catch (e) {
    console.error(`[whatsapp] No se pudo enviar a ${numero}:`, String(e.message || e).slice(0, 200));
    return;
  }
  if (!resp.ok) {
    const cuerpo = await resp.text();
    // Código típico de Meta cuando pasaron >24h desde el último mensaje del
    // cliente: un texto libre ya no se puede mandar, hace falta una plantilla
    // (HSM) pre-aprobada — afecta sobre todo al aviso proactivo (ver server.js).
    if (/13104[67]/.test(cuerpo)) {
      console.error(`[whatsapp] No se pudo avisar a ${numero}: pasaron más de 24h desde su último mensaje — hace falta una plantilla de WhatsApp aprobada por Meta para este caso (ver docs/CANALES.md).`);
    } else {
      console.error('[whatsapp] Error enviando:', resp.status, cuerpo);
    }
  }
}

export default router;
