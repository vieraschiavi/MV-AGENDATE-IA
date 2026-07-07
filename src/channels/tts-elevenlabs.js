// Síntesis de voz premium (ElevenLabs) para ChatVoice — vía REST, sin streaming.
//
// La versión anterior de la voz clonada dependía de un WebSocket persistente
// (Twilio Media Streams + Deepgram + ElevenLabs en tiempo real), que NO puede
// correr en Vercel (funciones serverless, sin conexiones de larga duración).
//
// Esta versión evita ese problema: en vez de transmitir audio en vivo, se sintetiza el turno
// COMPLETO con una sola llamada REST a ElevenLabs (pedido/respuesta normal,
// compatible con serverless), se cachea el MP3 resultante (Redis, TTL corto)
// y se lo sirve a Twilio con <Play>, mientras el reconocimiento de voz sigue
// a cargo de Twilio (<Gather input="speech">). Se pierde la latencia mínima
// del streaming en vivo, pero la voz clonada sí funciona en Vercel.
import { get as cfg } from '../store/config.js';

const MODELO_DEFAULT = 'eleven_multilingual_v2';
const BASE_URL = 'https://api.elevenlabs.io/v1';

function apiKey() { return cfg('elevenlabsApiKey') || process.env.ELEVENLABS_API_KEY || ''; }
function voiceId() { return cfg('elevenlabsVoiceId') || process.env.ELEVENLABS_VOICE_ID || ''; }

export function elevenlabsDisponible() { return Boolean(apiKey() && voiceId()); }

/**
 * Sintetiza `texto` con la voz clonada. Nunca lanza excepción (para no cortar
 * una llamada en curso si ElevenLabs falla) — devuelve { ok, audio (Buffer), error }.
 */
export async function sintetizar(texto, { modelo = MODELO_DEFAULT, estabilidad = 0.5, similaridad = 0.75 } = {}) {
  const key = apiKey(), voz = voiceId();
  if (!key || !voz) return { ok: false, audio: null, error: 'Falta ELEVENLABS_API_KEY o ELEVENLABS_VOICE_ID.' };
  if (!texto) return { ok: false, audio: null, error: 'Falta texto.' };
  try {
    const r = await fetch(`${BASE_URL}/text-to-speech/${voz}`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text: texto, model_id: modelo, voice_settings: { stability: estabilidad, similarity_boost: similaridad } }),
      signal: AbortSignal.timeout(20000)
    });
    if (!r.ok) return { ok: false, audio: null, error: `ElevenLabs respondió ${r.status}.` };
    const audio = Buffer.from(await r.arrayBuffer());
    return { ok: true, audio, error: null };
  } catch (e) {
    return { ok: false, audio: null, error: String(e.message || e).slice(0, 300) };
  }
}
