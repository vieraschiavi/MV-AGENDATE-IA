// ChatVoice premium — pipeline en tiempo real:
//   Twilio Media Streams (audio mulaw 8k por WebSocket)
//     → Deepgram nova (ASR streaming en español, endpointing automático)
//     → Agente MV (Claude, mismas herramientas que chat)
//     → ElevenLabs eleven_flash_v2_5 (voz clonada, salida ulaw_8000)
//     → de vuelta a la llamada.
//
// Requiere en .env: DEEPGRAM_API_KEY (ASR). Para la voz (TTS) usa, en orden:
//   1) Piper — voz es_AR-daniela rioplatense, GRATIS y offline (sin ElevenLabs).
//   2) ElevenLabs (voz clonada) si hay ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID.
// Sin Deepgram, /webhook/voz-premium redirige a la vía rápida (/webhook/voz).
import { Router } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { conversar } from '../ai/agente.js';
import { piperDisponible, sintetizarUlaw as piperUlaw } from './tts-piper.js';

const router = Router();

const DG = () => process.env.DEEPGRAM_API_KEY;
const EL = () => process.env.ELEVENLABS_API_KEY;
const VOZ_ID = () => process.env.ELEVENLABS_VOICE_ID;
const AGENCIA = () => process.env.NOMBRE_PROFESIONAL || process.env.AGENCIA_NOMBRE || 'tu profesional de confianza';

const ttsElevenLabs = () => Boolean(EL() && VOZ_ID());
// El pipeline vive con Deepgram (ASR) + alguna voz (Piper gratis, o ElevenLabs).
const disponible = () => Boolean(DG() && (piperDisponible() || ttsElevenLabs()));
const motorVoz = () => (piperDisponible() ? 'Piper (es_AR-daniela, gratis)' : ttsElevenLabs() ? 'ElevenLabs' : 'ninguno');

// --- TwiML: conecta la llamada al stream de audio bidireccional ---
router.post('/webhook/voz-premium', (req, res) => {
  if (!disponible()) {
    // Fallback a la vía rápida (Twilio <Gather> + voz Polly)
    return res.type('text/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Redirect method="POST">/webhook/voz</Redirect></Response>`
    );
  }
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const from = String(req.body?.From || 'desconocido').replace(/[^+\d]/g, '');
  res.type('text/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Connect>` +
      `<Stream url="wss://${host}/voz-stream"><Parameter name="from" value="${from}"/></Stream>` +
      `</Connect></Response>`
  );
});

// --- Texto → audio ulaw_8000. Preferimos Piper (voz Daniela, gratis); si no hay
// modelo Piper, caemos a ElevenLabs (voz clonada). ---
async function sintetizar(texto) {
  if (piperDisponible()) return piperUlaw(texto);
  const limpio = texto.replace(/[*_#`]/g, '').replace(/\p{Extended_Pictographic}/gu, '').slice(0, 900);
  const resp = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOZ_ID()}/stream?output_format=ulaw_8000`,
    {
      method: 'POST',
      headers: { 'xi-api-key': EL(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: limpio,
        model_id: 'eleven_flash_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.8 }
      })
    }
  );
  if (!resp.ok) throw new Error(`ElevenLabs ${resp.status}: ${await resp.text()}`);
  return Buffer.from(await resp.arrayBuffer());
}

// Envía audio ulaw a Twilio en mensajes "media" (base64)
function enviarAudio(twilioWs, streamSid, ulaw) {
  const CHUNK = 3200; // 400 ms por mensaje
  for (let i = 0; i < ulaw.length; i += CHUNK) {
    twilioWs.send(
      JSON.stringify({
        event: 'media',
        streamSid,
        media: { payload: ulaw.subarray(i, i + CHUNK).toString('base64') }
      })
    );
  }
}

// --- Servidor WebSocket para Twilio Media Streams ---
export function montarVozPremium(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/voz-stream' });

  wss.on('connection', (twilioWs) => {
    let streamSid = null;
    let llamante = 'desconocido';
    let dgWs = null;
    let respondiendo = false; // evita pisarse: no procesar ASR mientras habla el agente
    let cerrado = false;

    const log = (...a) => console.log('[voz-premium]', ...a);

    function abrirDeepgram() {
      const url =
        'wss://api.deepgram.com/v1/listen?model=nova-2&language=es&encoding=mulaw&sample_rate=8000' +
        '&punctuate=true&smart_format=true&interim_results=false&endpointing=400';
      dgWs = new WebSocket(url, { headers: { Authorization: `Token ${DG()}` } });

      dgWs.on('message', async (data) => {
        if (cerrado || respondiendo) return;
        let ev;
        try { ev = JSON.parse(data.toString()); } catch { return; }
        const texto = ev?.channel?.alternatives?.[0]?.transcript?.trim();
        if (!texto || !ev.is_final) return;

        respondiendo = true;
        log(`🎤 ${llamante}: ${texto}`);
        try {
          const respuesta = await conversar(`tel:${llamante}`, texto, 'voz');
          log(`🗣️ MV: ${respuesta.slice(0, 120)}`);
          const audio = await sintetizar(respuesta);
          if (!cerrado && streamSid) enviarAudio(twilioWs, streamSid, audio);
        } catch (err) {
          console.error('[voz-premium] Error en turno:', err.message);
        } finally {
          respondiendo = false;
        }
      });

      dgWs.on('error', (e) => console.error('[voz-premium] Deepgram:', e.message));
      dgWs.on('close', () => {
        // Reconexión automática mientras la llamada siga viva
        if (!cerrado) setTimeout(abrirDeepgram, 500);
      });
    }

    twilioWs.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      switch (msg.event) {
        case 'start': {
          streamSid = msg.start.streamSid;
          llamante = msg.start.customParameters?.from || 'desconocido';
          log(`📞 Llamada iniciada de ${llamante}`);
          abrirDeepgram();
          try {
            const saludo = await sintetizar(
              `Hola, te comunicaste con ${AGENCIA()}. Soy tu asistente virtual. Contame qué trabajo necesitás.`
            );
            enviarAudio(twilioWs, streamSid, saludo);
          } catch (err) {
            console.error('[voz-premium] Error en saludo:', err.message);
          }
          break;
        }
        case 'media':
          if (dgWs?.readyState === WebSocket.OPEN && !respondiendo) {
            dgWs.send(Buffer.from(msg.media.payload, 'base64'));
          }
          break;
        case 'stop':
          log(`📴 Llamada finalizada de ${llamante}`);
          cerrado = true;
          dgWs?.close();
          break;
      }
    });

    twilioWs.on('close', () => {
      cerrado = true;
      dgWs?.close();
    });
    twilioWs.on('error', (e) => console.error('[voz-premium] Twilio WS:', e.message));
  });

  console.log(`   ChatVoice premium: ${disponible() ? `ACTIVO (Deepgram + ${motorVoz()})` : 'inactivo — falta Deepgram, usando vía rápida'}`);
}

export default router;
