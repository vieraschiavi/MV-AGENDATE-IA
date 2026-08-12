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
import { idiomaActivo } from '../ai/cotizador.js';
import { runConCuenta } from '../store/contextoCuenta.js';

// Voz de Twilio (Polly) e idioma del <Gather> según el país configurado.
const vozTwilio = () => (idiomaActivo() === 'pt'
  ? { lang: 'pt-BR', voz: 'Polly.Camila-Neural' }
  : { lang: 'es-MX', voz: 'Polly.Mia-Neural' });
import { cuentaPorNumeroVoz } from '../store/configCuentas.js';
import { listarCuentaIds } from '../store/cuentas.js';
import { limitar } from '../store/limites.js';
import { firmaTwilioValida, permitirSinSecreto } from './firmas.js';

// Twilio reintenta y varias llamadas legítimas pueden entrar juntas, así que el
// tope es holgado: corta el bucle de abuso sin molestar al tráfico real.
const limiteVoz = () => limitar({ nombre: 'webhook-voz', max: 120, ventanaSeg: 60 });

const router = Router();

// Ruteo multi-cuenta (SaaS): si el número que RECIBIÓ la llamada (campo "To"
// de Twilio) pertenece a una cuenta, todo el turno (saludo, agente, catálogo,
// datos, voz) corre con la configuración de ESA cuenta; si no, con la global.
//
// El dueño se resuelve ANTES de atender porque de él sale el Auth Token con el
// que se verifica la firma de Twilio: quien POStea puede decir ser cualquier
// número, pero sin ese token el HMAC no cierra. Devuelve null cuando el request
// no está firmado válidamente (el handler ya respondió 403).
async function conCuentaDeLaLlamada(req, res, fn) {
  // Este router se monta con app.use, así que NO lo alcanza el envoltorio de
  // errores del server (que envuelve app.get/post/use, no los handlers de un
  // Router). Sin este try/catch, un rechazo acá —un kvSet contra un Redis
  // lento, por ejemplo— no devuelve TwiML: Twilio se queda esperando y le
  // corta la llamada al cliente en silencio.
  const atender = async () => {
    try {
      return await fn();
    } catch (err) {
      console.error('[voz] Error atendiendo la llamada:', err?.stack || err);
      // <Say> pelado a propósito: si lo que falló fue la síntesis de voz,
      // volver a pasar por decir() fallaría igual.
      if (!res.headersSent) {
        const { lang, voz } = vozTwilio();
        res.type('text/xml').send(xml(`<Say language="${lang}" voice="${voz}">${esc(frases().error)}</Say>`));
      }
    }
  };

  let duenio = null;
  try {
    duenio = await cuentaPorNumeroVoz(req.body?.To, await listarCuentaIds());
  } catch { /* sin cuentas o Redis caído: atiende la config global */ }

  const token = duenio?.overrides?.twilioAuthToken || cfg('twilioAuthToken');
  if (token) {
    if (!firmaTwilioValida(req, token)) {
      console.warn(`[voz] Webhook con firma inválida (To: ${req.body?.To || 'desconocido'}) — descartado.`);
      res.sendStatus(403);
      return;
    }
  } else if (!permitirSinSecreto('voz', 'Cargá el Auth Token de Twilio en /config.html (o TWILIO_AUTH_TOKEN).')) {
    res.sendStatus(403);
    return;
  }

  if (duenio) return runConCuenta(duenio.cuentaId, duenio.overrides, atender);
  return atender();
}
const NOMBRE_PROFESIONAL = () => cfg('nombreProfesional') || cfg('agenciaNombre') || 'tu profesional de confianza';
const TTL_AUDIO = 300; // 5 min — de sobra para que Twilio lo pida apenas generado

// Frases fijas del sistema en el idioma del país (es/pt).
const FRASES = {
  es: {
    saludo: (n) => `Hola, te comunicaste con ${n}. Soy tu asistente virtual. Contame qué trabajo necesitás y te paso presupuesto y horarios disponibles.`,
    noEscuche: 'No te escuché. Llamanos de nuevo cuando quieras. ¡Hasta luego!',
    repetime: 'Perdón, no te escuché bien. ¿Me lo repetís?',
    algoMas: '¿Algo más?',
    gracias: 'Gracias por llamar. ¡Hasta luego!',
    error: 'Tuvimos un inconveniente técnico. Un agente te va a devolver la llamada.',
    conecto: 'Te conecto con el cliente.',
  },
  pt: {
    saludo: (n) => `Olá, você ligou para ${n}. Sou o assistente virtual. Me conte qual serviço você precisa e já te passo o orçamento e os horários disponíveis.`,
    noEscuche: 'Não consegui te ouvir. Ligue novamente quando quiser. Até logo!',
    repetime: 'Desculpe, não entendi bem. Pode repetir?',
    algoMas: 'Mais alguma coisa?',
    gracias: 'Obrigado por ligar. Até logo!',
    error: 'Tivemos um problema técnico. Um atendente vai te retornar a ligação.',
    conecto: 'Vou te conectar com o cliente.',
  },
};
const frases = () => FRASES[idiomaActivo()] || FRASES.es;

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
  const { lang, voz } = vozTwilio();
  return `<Say language="${lang}" voice="${voz}">${esc(texto)}</Say>`;
}

function gather(req, action, saySay) {
  return `<Gather input="speech" language="${vozTwilio().lang}" speechTimeout="auto" action="${action}" method="POST">${saySay}</Gather>`;
}

// Llamada entrante: saludo + escucha
router.post('/webhook/voz', limiteVoz(), (req, res) => conCuentaDeLaLlamada(req, res, async () => {
  const f = frases();
  res.type('text/xml').send(
    xml(
      gather(req, '/webhook/voz/turno', await decir(req, f.saludo(NOMBRE_PROFESIONAL()))) +
        (await decir(req, f.noEscuche))
    )
  );
}));

// Cada turno de conversación
router.post('/webhook/voz/turno', limiteVoz(), (req, res) => conCuentaDeLaLlamada(req, res, async () => {
  const dicho = req.body?.SpeechResult;
  const llamante = req.body?.From || 'desconocido';

  const f = frases();
  if (!dicho) {
    return res.type('text/xml').send(
      xml(gather(req, '/webhook/voz/turno', await decir(req, f.repetime)))
    );
  }

  try {
    const respuesta = await conversar(`tel:${llamante}`, dicho, 'telefono');
    // Limpiar markdown/emoji para lectura por voz
    const paraVoz = respuesta.replace(/[*_#`]/g, '').replace(/\p{Extended_Pictographic}/gu, '').slice(0, 800);
    res.type('text/xml').send(
      xml(
        (await decir(req, paraVoz)) +
          gather(req, '/webhook/voz/turno', await decir(req, f.algoMas)) +
          (await decir(req, f.gracias))
      )
    );
  } catch (err) {
    console.error('[voz] Error:', err);
    res.type('text/xml').send(xml(await decir(req, f.error)));
  }
}));

// "Devolver la llamada" con un clic (ver src/store/twilio.js#clickToCall):
// Twilio llama primero al agente humano y, apenas atiende, pide este TwiML
// para conectarlo con el cliente — el agente no marca nada a mano.
router.post('/webhook/voz/conectar', limiteVoz(), async (req, res) => {
  // Igual que las otras dos rutas, el token puede ser el de la cuenta dueña del
  // número y no el global: en una instalación SaaS pura no hay token global, y
  // mirando solo ese esta ruta quedaba sin verificar. Es justo la que arma un
  // <Dial> a un número que viene del query string.
  const duenio = await cuentaPorNumeroVoz(req.body?.To, await listarCuentaIds()).catch(() => null);
  const token = duenio?.overrides?.twilioAuthToken || cfg('twilioAuthToken');
  if (token) {
    if (!firmaTwilioValida(req, token)) return res.sendStatus(403);
  } else if (!permitirSinSecreto('voz', 'Cargá el Auth Token de Twilio en /config.html (o TWILIO_AUTH_TOKEN).')) {
    return res.sendStatus(403);
  }
  const destino = String(req.query.destino || '').replace(/[^\d+]/g, '');
  if (!destino) return res.type('text/xml').send(xml('<Say language="es-MX">Falta el número de destino.</Say>'));
  res.type('text/xml').send(
    xml(`<Say language="${vozTwilio().lang}" voice="${vozTwilio().voz}">${esc(frases().conecto)}</Say><Dial>${esc(destino)}</Dial>`)
  );
});

// Sirve el audio de ElevenLabs cacheado para el <Play> de arriba.
router.get('/webhook/voz/audio/:token.mp3', async (req, res) => {
  const b64 = await kvGet(`voz-audio:${req.params.token}`);
  if (!b64) return res.status(404).send('Audio no encontrado (venció el caché).');
  res.type('audio/mpeg').send(Buffer.from(b64, 'base64'));
});

export default router;
