// © 2026 Martín Viera. Todos los derechos reservados.

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
import { get as cfg } from '../store/config.js';
import { runConCuenta } from '../store/contextoCuenta.js';
import { cuentaPorNumeroVoz, obtenerOverrides } from '../store/configCuentas.js';
import { listarCuentaIds } from '../store/cuentas.js';
import { limitar } from '../store/limites.js';
import { firmaTwilioValida, permitirSinSecreto } from './firmas.js';

const router = Router();

// Credenciales vía config (panel /config.html — con fallback a las env de
// siempre) y sensibles a la cuenta SaaS activa del contexto.
const DG = () => cfg('deepgramApiKey');
const EL = () => cfg('elevenlabsApiKey');
const VOZ_ID = () => cfg('elevenlabsVoiceId');
const AGENCIA = () => cfg('nombreProfesional') || cfg('agenciaNombre') || 'tu profesional de confianza';

const MAX_REINTENTOS_DG = 6; // ~30 s de backoff antes de rendirse con el ASR

const ttsElevenLabs = () => Boolean(EL() && VOZ_ID());
// El pipeline vive con Deepgram (ASR) + alguna voz (Piper gratis, o ElevenLabs).
const disponible = () => Boolean(DG() && (piperDisponible() || ttsElevenLabs()));
const motorVoz = () => (piperDisponible() ? 'Piper (es_AR-daniela, gratis)' : ttsElevenLabs() ? 'ElevenLabs' : 'ninguno');

// --- TwiML: conecta la llamada al stream de audio bidireccional ---
// Multi-cuenta (SaaS): si el número llamado ("To") es de una cuenta, la
// disponibilidad se evalúa con SU config y el stream lleva su cuentaId para
// que el WebSocket atienda con su asistente.
router.post('/webhook/voz-premium', limitar({ nombre: 'webhook-voz-premium', max: 120, ventanaSeg: 60 }), async (req, res) => {
  const duenio = await cuentaPorNumeroVoz(req.body?.To, await listarCuentaIds().catch(() => [])).catch(() => null);

  // Misma verificación que la vía rápida: el "To" dice de quién es la llamada,
  // la firma prueba que la mandó Twilio y no cualquiera con ese número.
  const token = duenio?.overrides?.twilioAuthToken || cfg('twilioAuthToken');
  if (token) {
    if (!firmaTwilioValida(req, token)) {
      console.warn(`[voz-premium] Webhook con firma inválida (To: ${req.body?.To || 'desconocido'}) — descartado.`);
      return res.sendStatus(403);
    }
  } else if (!permitirSinSecreto('voz-premium', 'Cargá el Auth Token de Twilio en /config.html (o TWILIO_AUTH_TOKEN).')) {
    return res.sendStatus(403);
  }

  const responder = () => {
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
        `<Stream url="wss://${host}/voz-stream"><Parameter name="from" value="${from}"/>` +
        `<Parameter name="cuenta" value="${duenio?.cuentaId || ''}"/></Stream>` +
        `</Connect></Response>`
    );
  };
  if (duenio) return runConCuenta(duenio.cuentaId, duenio.overrides, responder);
  responder();
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
      }),
      // Imprescindible: si ElevenLabs se cuelga sin timeout, este await no
      // resuelve nunca — no corre ni el catch ni el finally que libera
      // `respondiendo`, y la llamada queda muda y sorda hasta que el cliente
      // corta. Con timeout, tira error y el turno se recupera.
      signal: AbortSignal.timeout(15000)
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
    let reintentosDg = 0;     // reconexiones seguidas a Deepgram (se resetea al conectar)
    // Cuenta SaaS dueña del número llamado (viene como Parameter del Stream):
    // cada turno corre con SU config (asistente, catálogo, voz, datos).
    let ctxCuenta = null;
    const enCuenta = (fn) => (ctxCuenta ? runConCuenta(ctxCuenta.cuentaId, ctxCuenta.overrides, fn) : fn());

    const log = (...a) => console.log('[voz-premium]', ...a);

    function abrirDeepgram() {
      const url =
        'wss://api.deepgram.com/v1/listen?model=nova-2&language=es&encoding=mulaw&sample_rate=8000' +
        '&punctuate=true&smart_format=true&interim_results=false&endpointing=400';
      dgWs = new WebSocket(url, { headers: { Authorization: `Token ${DG()}` } });
      // Una conexión que llegó a abrirse limpia la cuenta de reintentos: el
      // tope es para el que NUNCA conecta, no para una caída puntual.
      dgWs.on('open', () => { reintentosDg = 0; });

      dgWs.on('message', async (data) => {
        if (cerrado || respondiendo) return;
        let ev;
        try { ev = JSON.parse(data.toString()); } catch { return; }
        const texto = ev?.channel?.alternatives?.[0]?.transcript?.trim();
        if (!texto || !ev.is_final) return;

        respondiendo = true;
        log(`🎤 ${llamante}: ${texto}`);
        try {
          await enCuenta(async () => {
            const respuesta = await conversar(`tel:${llamante}`, texto, 'voz');
            log(`🗣️ MV: ${respuesta.slice(0, 120)}`);
            const audio = await sintetizar(respuesta);
            if (!cerrado && streamSid) enviarAudio(twilioWs, streamSid, audio);
          });
        } catch (err) {
          console.error('[voz-premium] Error en turno:', err.message);
        } finally {
          respondiendo = false;
        }
      });

      dgWs.on('error', (e) => console.error('[voz-premium] Deepgram:', e.message));
      dgWs.on('close', () => {
        // Reconexión automática mientras la llamada siga viva (con la config
        // de la cuenta de la llamada, si corresponde). Con backoff y tope: si
        // la API key es inválida el socket cierra al instante, y reintentar
        // cada 500 ms sin límite era martillar a Deepgram toda la llamada.
        if (cerrado) return;
        if (reintentosDg >= MAX_REINTENTOS_DG) {
          console.error('[voz-premium] Deepgram no reconecta — se abandona el ASR de esta llamada (¿API key inválida?).');
          return;
        }
        const espera = Math.min(500 * 2 ** reintentosDg, 8000);
        reintentosDg += 1;
        setTimeout(() => enCuenta(abrirDeepgram), espera);
      });
    }

    twilioWs.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      switch (msg.event) {
        case 'start': {
          streamSid = msg.start.streamSid;
          llamante = msg.start.customParameters?.from || 'desconocido';
          const cuentaId = msg.start.customParameters?.cuenta;
          if (cuentaId) {
            const overrides = await obtenerOverrides(cuentaId).catch(() => ({}));
            ctxCuenta = { cuentaId, overrides };
          }
          log(`📞 Llamada iniciada de ${llamante}${ctxCuenta ? ` (cuenta ${ctxCuenta.cuentaId})` : ''}`);
          await enCuenta(async () => {
            abrirDeepgram(); // toma la API key de Deepgram de la config activa
            try {
              const saludo = await sintetizar(
                `Hola, te comunicaste con ${AGENCIA()}. Soy tu asistente virtual. Contame qué trabajo necesitás.`
              );
              enviarAudio(twilioWs, streamSid, saludo);
            } catch (err) {
              console.error('[voz-premium] Error en saludo:', err.message);
            }
          });
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
