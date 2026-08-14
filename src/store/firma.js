// © 2026 Martín Viera. Todos los derechos reservados.
// Software propietario. Uso sujeto a LICENSE y EULA.txt.
// FIRMA DE SELLOS DE LICENCIA (Ed25519) — portado de Buscador-Inmobiliario.
//
// La clave publica es LA MISMA en todos los productos MV: una sola llave del
// dueno firma los sellos de todos. Rotarla en un producto implica rotarla en
// todos (los sellos viejos dejan de valer en todos a la vez).
//
// El problema que resuelve: hasta acá los sellos eran JSON plano. El archivo
//
//     data/licencia-owner.json   →  {"edicion":"owner"}
//
// desbloqueaba el producto entero para siempre, y la receta estaba publicada en
// Hacer-Owner.bat y legible en el código aunque esté ofuscado. Lo mismo con
// licencia-validada.json: escribir {"pagada":true} a mano daba la versión paga.
// No hacía falta romper nada, solo escribir un archivo de veinte caracteres.
//
// Ahora los sellos son TOKENS FIRMADOS. La clave privada la tiene una sola
// persona (el dueño, fuera del repo, en MV_LICENCIAS_PRIVADA); la pública viaja
// con el programa, que es exactamente para lo que sirve una clave pública.
// Falsificar un sello pasa de "escribir un archivo" a "romper Ed25519".
//
// Formato del token, en una línea, fácil de pegar en un .bat o un mail:
//
//     MV1.<payload en base64url>.<firma en base64url>
//
// La firma cubre los BYTES del payload ya codificado, no el objeto: así no
// dependemos de que dos JSON.stringify ordenen las claves igual.
import { createPublicKey, createPrivateKey, sign, verify } from 'node:crypto';

const PREFIJO = 'MV1';

// Clave PÚBLICA del emisor (SPKI DER en base64). Va en el código a propósito:
// solo sirve para VERIFICAR. Si algún día se rota, se cambia acá y los sellos
// viejos dejan de valer — que es justamente lo que se quiere de una rotación.
const CLAVE_PUBLICA_OFICIAL = 'MCowBQYDK2VwAyEAcKw6/XFpnkYfVogIE4iFgPqPjbVthWd8c5ZKGBQPc7I=';

// Se puede apuntar a otra clave SOLO en desarrollo y en los tests. Si se
// respetara siempre, cambiar una variable de entorno alcanzaría para firmar
// sellos propios y darse la versión paga: sería el mismo agujero que cierra
// este archivo, abierto por la puerta de al lado.
export const CLAVE_PUBLICA_B64 =
  (process.env.MV_MODO_DESARROLLO === '1' && process.env.MV_LICENCIAS_PUBLICA)
  || CLAVE_PUBLICA_OFICIAL;

const b64url = (buf) => Buffer.from(buf).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const desdeB64url = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

let publica = null;
function clavePublica() {
  if (publica) return publica;
  try {
    publica = createPublicKey({
      key: Buffer.from(CLAVE_PUBLICA_B64, 'base64'), format: 'der', type: 'spki',
    });
  } catch { publica = null; }
  return publica;
}

/**
 * Emite un token firmado. Solo del lado del emisor: necesita la clave privada
 * (PEM en MV_LICENCIAS_PRIVADA), que nunca viaja con el producto.
 * @param {object} datos contenido del sello
 * @param {string} [pem] clave privada; por defecto MV_LICENCIAS_PRIVADA
 * @returns {string} token MV1.<payload>.<firma>
 */
export function emitirToken(datos, pem = process.env.MV_LICENCIAS_PRIVADA) {
  if (!pem) throw new Error('Falta la clave privada (MV_LICENCIAS_PRIVADA).');
  const privada = createPrivateKey(pem);
  const payload = b64url(Buffer.from(JSON.stringify(datos), 'utf8'));
  const firma = b64url(sign(null, Buffer.from(payload, 'utf8'), privada));
  return `${PREFIJO}.${payload}.${firma}`;
}

/**
 * Verifica un token y devuelve su contenido. Devuelve null ante CUALQUIER
 * problema — token mal formado, firma inválida, JSON roto — sin lanzar: esto lo
 * llama código que corre en cada arranque y no puede tumbar el programa.
 * @returns {object|null}
 */
export function leerToken(token) {
  const partes = String(token || '').trim().split('.');
  if (partes.length !== 3 || partes[0] !== PREFIJO) return null;
  const [, payload, firma] = partes;
  const pub = clavePublica();
  if (!pub) return null;
  try {
    if (!verify(null, Buffer.from(payload, 'utf8'), pub, desdeB64url(firma))) return null;
    const datos = JSON.parse(desdeB64url(payload).toString('utf8'));
    return (datos && typeof datos === 'object') ? datos : null;
  } catch { return null; }
}

/** ¿Hay clave privada configurada? (para saber si esta copia puede EMITIR) */
export function puedeEmitir() { return !!process.env.MV_LICENCIAS_PRIVADA; }
