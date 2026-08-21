// © 2026 Martín Viera. Todos los derechos reservados.

/**
 * Emisión y verificación de licencias FIRMADAS (Ed25519).
 *
 * Los dos extremos viven acá porque comparten el formato del token y así no se
 * pueden desincronizar: el servidor de ventas usa `firmar()` (necesita la clave
 * privada) y la copia instalada usa `verificar()` (le alcanza la pública de
 * licencia-clave.js).
 *
 * Formato: MVL1.<payload base64url>.<firma base64url>
 * El payload es JSON: { id, plan, exp }
 *   id   — id del pedido, para poder rastrear una licencia filtrada.
 *   plan — 'basico' | 'full' | 'saas'. Lo que se compró.
 *   exp  — vencimiento en ms epoch, o null para el pago único (no vence).
 *
 * Ed25519 y no RSA porque la firma son 64 bytes: el código que el cliente
 * copia y pega queda en ~180 caracteres en vez de ~400. Node lo trae de fábrica
 * (crypto.sign/verify con algoritmo null), así que no suma dependencias — este
 * repo no tiene ninguna en src/ y no vale la pena romper eso por esto.
 */
import { sign, verify, createPrivateKey, createPublicKey } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PUBLICA, PREFIJO, firmaConfigurada } from './licencia-clave.js';

const b64u = (b) => Buffer.from(b).toString('base64url');

/**
 * La clave privada, de donde esté.
 *
 * Dos lugares, en este orden:
 *   1. process.env — es como la recibe el sitio en Vercel.
 *   2. el archivo .env de la raíz — es donde la deja
 *      scripts/configurar-licencias.js en la máquina del dueño.
 *
 * El paso 2 hace falta porque este repo NO carga .env en ningún lado: la
 * configuración del programa vive en data/config.json y la pone /config.html.
 * Sin esta lectura, la clave quedaba escrita en un archivo que nadie mira y
 * `licencia-emitir.js` decía "no hay clave privada" con la clave ahí al lado.
 *
 * Se lee sólo esta variable a propósito, y no se vuelca todo el .env en
 * process.env: un .env con la clave de Anthropic o el token de MercadoPago no
 * tiene por qué terminar expuesto en el entorno de un proceso que sólo
 * necesita firmar.
 */
function pemDeArchivo() {
  try {
    const env = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env');
    if (!existsSync(env)) return null;
    const linea = readFileSync(env, 'utf8')
      .split(/\r?\n/)
      .find((l) => l.trim().startsWith('MV_LICENSE_PRIVATE_KEY='));
    if (!linea) return null;
    const valor = linea.slice(linea.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
    return valor || null;
  } catch { return null; }
}

/** La privada sólo existe en el servidor de ventas. Nunca en la copia vendida. */
function privada() {
  const pem = process.env.MV_LICENSE_PRIVATE_KEY || pemDeArchivo();
  if (!pem) return null;
  try {
    // La variable de entorno suele venir con los saltos de línea escapados
    // (así los pega el panel de Vercel): se restauran antes de parsear, o
    // createPrivateKey tira "unsupported" sobre un PEM perfectamente válido.
    return createPrivateKey(pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem);
  } catch (e) {
    console.error('[licencias] MV_LICENSE_PRIVATE_KEY no es una clave válida:', e.message);
    return null;
  }
}

/** true si este proceso puede emitir licencias firmadas. */
export function puedeFirmar() { return privada() !== null; }

/**
 * Firma una licencia. Devuelve el código para el cliente, o null si esta
 * instancia no tiene la clave privada (ahí el llamador cae al formato viejo).
 */
export function firmar({ id, plan, exp = null }) {
  const clave = privada();
  if (!clave) return null;
  const cuerpo = b64u(JSON.stringify({ id, plan, exp }));
  const firma = sign(null, Buffer.from(cuerpo), clave).toString('base64url');
  return `${PREFIJO}${cuerpo}.${firma}`;
}

/**
 * Verifica una licencia firmada.
 * @returns {{id:string, plan:string, exp:number|null}|null} null si no es
 *   válida: firma que no cierra, formato roto, o vencida.
 */
export function verificar(codigo) {
  if (!firmaConfigurada()) return null;
  const s = String(codigo || '').trim();
  if (!s.startsWith(PREFIJO)) return null;
  const [cuerpo, firma] = s.slice(PREFIJO.length).split('.');
  if (!cuerpo || !firma) return null;
  try {
    const ok = verify(null, Buffer.from(cuerpo), createPublicKey(PUBLICA), Buffer.from(firma, 'base64url'));
    if (!ok) return null;
    const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
    if (datos.exp && Date.now() > datos.exp) return null;
    return datos;
  } catch {
    return null;
  }
}
