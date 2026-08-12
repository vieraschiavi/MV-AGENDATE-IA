// TTS con Piper — voz neuronal es_AR-daniela (rioplatense), OFFLINE y GRATIS.
// Es la voz del gestor IA (ChatVoice) sin depender de ElevenLabs ni de créditos.
//
// Piper genera PCM crudo s16le a 22050 Hz (--output-raw). Para el teléfono (Twilio)
// lo convertimos a mu-law 8000 Hz con ffmpeg; para reproducción web devolvemos WAV.
//
// Instalación (una vez):  bash promo/instalar-voz.sh
// Config: piperBin (binario), piperVoz (ruta al modelo .onnx). Por defecto busca
// ./voces/es_AR-daniela-high.onnx y el binario 'piper' en el PATH.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { get as cfg } from '../store/config.js';

const RAIZ = process.cwd();

function binPiper() { return cfg('piperBin') || process.env.PIPER_BIN || 'piper'; }
function rutaVoz() {
  const c = cfg('piperVoz') || process.env.PIPER_VOZ;
  if (c) return c;
  const local = path.join(RAIZ, 'voces', 'es_AR-daniela-high.onnx');
  return existsSync(local) ? local : '/tmp/voces/es_AR-daniela-high.onnx';
}

/** ¿Está el motor Piper disponible? (existe el modelo de voz). */
export function piperDisponible() {
  try { return existsSync(rutaVoz()); } catch { return false; }
}

// Limpia markdown/emoji para que la voz no lea símbolos.
function limpiar(texto) {
  return String(texto).replace(/[*_#`]/g, '').replace(/\p{Extended_Pictographic}/gu, '').replace(/\s+/g, ' ').trim().slice(0, 900);
}

// Cuánto se le da a piper/ffmpeg antes de darlo por colgado. Sintetizar un
// turno son milisegundos; si a los 20 s no terminó, no va a terminar.
const TIMEOUT_MS = 20000;

// Ejecuta un comando alimentando stdin y devuelve el stdout como Buffer.
//
// El timeout no es decorativo: sin él, un piper trabado (modelo corrupto,
// proceso zombie) deja esta promesa sin resolver NUNCA, y arriba eso significa
// una llamada telefónica muda que no se recupera ni cortando el turno.
function correr(cmd, args, stdinBuf) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    const out = [], err = [];
    let listo = false;
    const terminar = (fn, arg) => { if (!listo) { listo = true; clearTimeout(reloj); fn(arg); } };
    const reloj = setTimeout(() => {
      p.kill('SIGKILL');
      terminar(reject, new Error(`${cmd} no respondió en ${TIMEOUT_MS / 1000}s — se abortó.`));
    }, TIMEOUT_MS);
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => err.push(d));
    p.on('error', (e) => terminar(reject, e));
    p.on('close', (code) => {
      if (code === 0) terminar(resolve, Buffer.concat(out));
      else terminar(reject, new Error(`${cmd} salió ${code}: ${Buffer.concat(err).toString().slice(0, 300)}`));
    });
    if (stdinBuf != null) { p.stdin.write(stdinBuf); }
    p.stdin.end();
  });
}

/** Sintetiza texto → PCM crudo s16le mono 22050 Hz (lo que produce Piper). */
export async function sintetizarPCM(texto) {
  const limpio = limpiar(texto);
  if (!limpio) return Buffer.alloc(0);
  return correr(binPiper(), ['--model', rutaVoz(), '--output-raw'], Buffer.from(limpio + '\n', 'utf8'));
}

/** Sintetiza texto → WAV (22050 Hz) para reproducir en la web/app. */
export async function sintetizarWav(texto) {
  const pcm = await sintetizarPCM(texto);
  return correr('ffmpeg', ['-nostdin', '-v', 'error', '-f', 's16le', '-ar', '22050', '-ac', '1', '-i', 'pipe:0', '-f', 'wav', 'pipe:1'], pcm);
}

/** Sintetiza texto → mu-law 8000 Hz (formato de audio de Twilio para el teléfono). */
export async function sintetizarUlaw(texto) {
  const pcm = await sintetizarPCM(texto);
  return correr('ffmpeg', ['-nostdin', '-v', 'error', '-f', 's16le', '-ar', '22050', '-ac', '1', '-i', 'pipe:0', '-ar', '8000', '-ac', '1', '-f', 'mulaw', 'pipe:1'], pcm);
}

export default { piperDisponible, sintetizarPCM, sintetizarWav, sintetizarUlaw };
