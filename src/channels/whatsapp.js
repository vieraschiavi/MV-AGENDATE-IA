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

const router = Router();

const TOKEN = () => cfg('whatsappToken');
const PHONE_ID = () => cfg('whatsappPhoneId');
const VERIFY = () => cfg('whatsappVerifyToken') || 'mv-agendate-verify';

// Verificación del webhook (la hace Meta una sola vez)
router.get('/webhook/whatsapp', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token === VERIFY()) return res.status(200).send(challenge);
  return res.sendStatus(403);
});

// Mensajes entrantes
router.post('/webhook/whatsapp', async (req, res) => {
  res.sendStatus(200); // responder rápido; procesar async

  try {
    const cambios = req.body?.entry?.flatMap((e) => e.changes ?? []) ?? [];
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
      const respuesta = await conversar(`wa:${de}`, texto, 'whatsapp');
      await enviarWhatsApp(de, respuesta);
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
  const resp = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID()}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: numero,
      type: 'text',
      text: { body: texto.slice(0, 4096) }
    })
  });
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
