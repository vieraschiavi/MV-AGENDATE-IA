// Seguimiento de uso de APIs (tokens) y catálogo de servicios/costos.
// Sirve para: (a) cubrirte por uso si vendés con TU API embebida (trackeás cuánto
// consume cada cliente), y (b) mostrarle a cada cliente qué API necesita cada
// función, para qué sirve y su costo aproximado si prefiere poner la suya.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { get as cfg } from './config.js';

const here = dirname(fileURLToPath(import.meta.url));
const DIR = process.env.VERCEL ? '/tmp/mvdata' : join(here, '../../data');
const FILE = join(DIR, 'uso.json');

// Catálogo de APIs: qué hace cada una, para qué y costo de referencia (editable).
export const CATALOGO = [
  { api: 'anthropic', nombre: 'Motor de IA principal', para_que: 'Chatbot, análisis de fotos, anuncios y sugerencias con IA', unidad: 'por tokens', requiere: 'CLAVE DE IA', incluida: true,
    nota: 'Es el corazón del sistema. Costo por uso (tokens de entrada/salida).' },
  { api: 'elevenlabs', nombre: 'ElevenLabs (voz clonada)', para_que: 'ChatVoice y videos con voz natural/clonada de la marca', unidad: 'por caracteres/min', requiere: 'ELEVENLABS_API_KEY', incluida: false,
    nota: 'Opcional. Necesaria para voz clonada y locución de videos.' },
  { api: 'deepgram', nombre: 'Deepgram (voz→texto)', para_que: 'Transcripción en el pipeline de teléfono (ChatVoice)', unidad: 'por minuto de audio', requiere: 'DEEPGRAM_API_KEY', incluida: false,
    nota: 'Opcional. Para atención telefónica con IA.' },
  { api: 'twilio', nombre: 'Twilio (telefonía)', para_que: 'Llamadas entrantes/salientes del ChatVoice', unidad: 'por minuto', requiere: 'TWILIO_ACCOUNT_SID', incluida: false,
    nota: 'Opcional. Número y minutos de teléfono.' },
  { api: 'whatsapp', nombre: 'WhatsApp Business (Meta)', para_que: 'Atención por WhatsApp oficial', unidad: 'por conversación', requiere: 'WHATSAPP_TOKEN', incluida: false,
    nota: 'Opcional. Requiere cuenta de Meta Business.' }
];

// Costo de referencia de Claude (USD por millón de tokens). Editable en config.
function tarifas() {
  return {
    inMusd: Number(cfg('costoInputMusd')) || 15,   // entrada
    outMusd: Number(cfg('costoOutputMusd')) || 75  // salida
  };
}

let db = null;
function cargar() {
  if (db) return db;
  db = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { total: { input: 0, output: 0, llamadas: 0 }, dias: {}, porCliente: {} };
  return db;
}
function guardar() { mkdirSync(DIR, { recursive: true }); writeFileSync(FILE, JSON.stringify(db, null, 2)); }

/** Registra el consumo de una llamada a Claude. usage = {input_tokens, output_tokens}. */
export function registrarUso(usage, cliente = 'default') {
  if (!usage) return;
  cargar();
  const inp = usage.input_tokens || 0, out = usage.output_tokens || 0;
  const dia = new Date().toISOString().slice(0, 10);
  db.total.input += inp; db.total.output += out; db.total.llamadas += 1;
  const d = (db.dias[dia] ??= { input: 0, output: 0, llamadas: 0 });
  d.input += inp; d.output += out; d.llamadas += 1;
  const c = (db.porCliente[cliente] ??= { input: 0, output: 0, llamadas: 0 });
  c.input += inp; c.output += out; c.llamadas += 1;
  guardar();
}

const costo = (input, output) => {
  const t = tarifas();
  return Math.round((input / 1e6 * t.inMusd + output / 1e6 * t.outMusd) * 100) / 100;
};

/** Resumen de uso + costo estimado (para el panel del vendedor). */
export function resumenUso() {
  cargar();
  const ultimos = Object.entries(db.dias).sort().slice(-30).map(([dia, v]) => ({ dia, ...v, costo_usd: costo(v.input, v.output) }));
  return {
    total: { ...db.total, costo_usd: costo(db.total.input, db.total.output) },
    tarifas: tarifas(),
    por_dia: ultimos,
    por_cliente: Object.entries(db.porCliente).map(([cliente, v]) => ({ cliente, ...v, costo_usd: costo(v.input, v.output) })).sort((a, b) => b.costo_usd - a.costo_usd)
  };
}

export function catalogoConEstado() {
  return CATALOGO.map((c) => ({ ...c, configurada: !!cfg(c.requiere ? mapaEnv(c.requiere) : '') }));
}
// Mapea el nombre de env al de config (anthropicApiKey, etc.)
function mapaEnv(env) {
  const m = { ANTHROPIC_API_KEY: 'anthropicApiKey', ELEVENLABS_API_KEY: 'elevenlabsApiKey', DEEPGRAM_API_KEY: 'deepgramApiKey', TWILIO_ACCOUNT_SID: 'twilioAccountSid', WHATSAPP_TOKEN: 'whatsappToken' };
  return m[env] || '';
}
