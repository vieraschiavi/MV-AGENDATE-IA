// Canal de voz (ChatVoice) — atención telefónica con el mismo agente.
//
// Twilio Voice con <Gather input="speech"> hace el reconocimiento de voz
// (ASR es/UY) — sin infra propia, funciona igual en Vercel que en un VPS.
// Para la respuesta hablada, en orden:
//   1) ElevenLabs (voz clonada del profesional), si está configurada:
//      se sintetiza el turno completo con UNA llamada REST (sin streaming,
//      compatible con serverless — ver src/channels/tts-elevenlabs.js), se
//      cachea el MP3 (Redis, 5 min) y se sirve a Twilio con <Play>.
//   2) Si no hay ElevenLabs o falla, <Say> con voz neural de Twilio (Polly)
//      — nunca corta la llamada por un problema de síntesis.
// Ver docs/CANALES.md para atención telefónica avanzada (central/Zoom/Meet).
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { conversar } from '../ai/agente.js';
import { sintetizar, elevenlabsDisponible } from './tts-elevenlabs.js';
import { kvGet, kvSet } from '../store/redis.js';
import { get as cfg } from '../store/config.js';

const router = Router();
const NOMBRE_PROFESIONAL = () => cfg('nombreProfesional') || cfg('agenciaNombre') || 'tu profesional de confianza';
const TTL_AUDIO = 300; // 5 min — de sobra para que Twilio lo pida apenas generado

const xml = (body) => `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const base = (req) => `${req.protocol}://${req.headers['x-forwarded-host'] || req.headers.host}`;

// Devuelve el TwiML de una frase: <Play> con voz clonada si hay ElevenLabs,
// si no <Say> con voz neural de Twilio. Nunca lanza excepción.
async function decir(req, texto) {
  if (elevenlabsDisponible()) {
    const r = await sintetizar(texto);
    if (r.ok) {
      const token = randomUUID();
      await kvSet(`voz-audio:${token}`, r.audio.toString('base64'), { ex: TTL_AUDIO });
      return `<Play>${base(req)}/webhook/voz/audio/${token}.mp3</Play>`;
    }
    console.warn('[voz] ElevenLabs falló, cae a Polly:', r.error);
  }
  return `<Say language="es-MX" voice="Polly.Mia-Neural">${esc(texto)}</Say>`;
}

function gather(req, action, saySay) {
  return `<Gather input="speech" language="es-MX" speechTimeout="auto" action="${action}" method="POST">${saySay}</Gather>`;
}

// Llamada entrante: saludo + escucha
router.post('/webhook/voz', async (req, res) => {
  const saludo = `Hola, te comunicaste con ${NOMBRE_PROFESIONAL()}. Soy tu asistente virtual. Contame qué trabajo necesitás y te paso presupuesto y horarios disponibles.`;
  res.type('text/xml').send(
    xml(
      gather(req, '/webhook/voz/turno', await decir(req, saludo)) +
        (await decir(req, 'No te escuché. Llamanos de nuevo cuando quieras. ¡Hasta luego!'))
    )
  );
});

// Cada turno de conversación
router.post('/webhook/voz/turno', async (req, res) => {
  const dicho = req.body?.SpeechResult;
  const llamante = req.body?.From || 'desconocido';

  if (!dicho) {
    return res.type('text/xml').send(
      xml(gather(req, '/webhook/voz/turno', await decir(req, 'Perdón, no te escuché bien. ¿Me lo repetís?')))
    );
  }

  try {
    const respuesta = await conversar(`tel:${llamante}`, dicho, 'telefono');
    // Limpiar markdown/emoji para lectura por voz
    const paraVoz = respuesta.replace(/[*_#`]/g, '').replace(/\p{Extended_Pictographic}/gu, '').slice(0, 800);
    res.type('text/xml').send(
      xml(
        (await decir(req, paraVoz)) +
          gather(req, '/webhook/voz/turno', await decir(req, '¿Algo más?')) +
          (await decir(req, 'Gracias por llamar. ¡Hasta luego!'))
      )
    );
  } catch (err) {
    console.error('[voz] Error:', err);
    res.type('text/xml').send(xml(await decir(req, 'Tuvimos un inconveniente técnico. Un agente te va a devolver la llamada.')));
  }
});

// "Devolver la llamada" con un clic (ver src/store/twilio.js#clickToCall):
// Twilio llama primero al agente humano y, apenas atiende, pide este TwiML
// para conectarlo con el cliente — el agente no marca nada a mano.
router.post('/webhook/voz/conectar', (req, res) => {
  const destino = String(req.query.destino || '').replace(/[^\d+]/g, '');
  if (!destino) return res.type('text/xml').send(xml('<Say language="es-MX">Falta el número de destino.</Say>'));
  res.type('text/xml').send(
    xml(`<Say language="es-MX" voice="Polly.Mia-Neural">Te conecto con el cliente.</Say><Dial>${esc(destino)}</Dial>`)
  );
});

// Sirve el audio de ElevenLabs cacheado para el <Play> de arriba.
router.get('/webhook/voz/audio/:token.mp3', async (req, res) => {
  const b64 = await kvGet(`voz-audio:${req.params.token}`);
  if (!b64) return res.status(404).send('Audio no encontrado (venció el caché).');
  res.type('audio/mpeg').send(Buffer.from(b64, 'base64'));
});

export default router;
