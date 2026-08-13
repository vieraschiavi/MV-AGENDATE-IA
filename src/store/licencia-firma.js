// © 2026 Martín Viera. Todos los derechos reservados.

// ============================================================
// Licencias MVA1 (Ed25519): verificación.
//
// POR QUÉ EXISTE ESTE ARCHIVO
//
// El candado de la copia descargada aceptaba como licencia CUALQUIER texto de
// 6 caracteres o más (`String(codigo).trim().length >= 6` en store/prueba.js).
// O sea: el cliente al que se le vencía la prueba escribía "aaaaaa" en el
// campo de licencia y se quedaba con el programa completo, para siempre, sin
// pagar. No hacía falta ninguna herramienta ni saber nada del código.
//
// El servidor SÍ emitía un código con sentido (`MV-BASICO-A1B2C3D4`, un HMAC
// del id del pedido), pero la app nunca lo comprobaba: no puede. Ese HMAC se
// verifica con un secreto que vive en el servidor, y ponerlo adentro del .exe
// que se le entrega al cliente sería regalarle la máquina de fabricar
// licencias. Ese es exactamente el problema que resuelve la firma asimétrica:
// se firma con la clave PRIVADA (que se queda en el servidor) y se verifica
// con la PÚBLICA (que puede viajar dentro de cada copia sin riesgo).
//
// FORMATO — no cambiarlo a la ligera: es el mecanismo real de venta.
//   MVA1.<payload_b64url>.<firma_b64url>
//   payload = { n:nombre, e:email, p:plan, x:vencimiento|null, i:emisión }
//   x: null  →  perpetua (es lo que usan la licencia de USO PROPIO y el pago único)
//
// Este módulo NO firma: sólo verifica. Firmar necesita la clave privada y vive
// en scripts/licencias-firma.js, que nunca se empaqueta en la entrega.
// ============================================================
import { createPublicKey, verify } from 'node:crypto';
import { CLAVE_PUBLICA_B64 } from './clave-publica.js';

/** Prefijo que identifica el formato. Va en claro para poder distinguirlo de
 *  los códigos viejos sin intentar verificarlos. */
export const PREFIJO = 'MVA1';

const desdeB64url = (s) =>
  Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

// Clave pública en uso. Arranca siendo la de la entrega y sólo la cambian los
// tests (ver _fijarClavePublica).
let claveActiva = CLAVE_PUBLICA_B64;

/**
 * Cambia la clave pública contra la que se verifica. ES PARA LOS TESTS.
 *
 * Hace falta porque el repo se publica con la clave pública VACÍA: la de verdad
 * la genera cada dueño con `licencias-firma.js init` y su privada nunca entra
 * acá. Los tests necesitan un par propio para poder firmar y comprobar que la
 * verificación acepta lo bueno y rechaza lo inventado.
 *
 * No debilita nada: para aprovecharla habría que ejecutar código adentro del
 * proceso del programa, y quien puede hacer eso ya puede parchear directamente
 * la función que decide si está licenciado. No se expone por variable de
 * entorno justamente para que no alcance con tocar la máquina desde afuera —
 * con un MV_CLAVE_PUBLICA cualquiera ponía la suya, firmaba con su privada y
 * quedaba licenciado.
 */
export function _fijarClavePublica(b64) {
  claveActiva = String(b64 || '');
}

/** La clave pública en uso. También para los tests: la necesitan para poder
 *  restaurarla después de comprobar qué pasa cuando falta. */
export function _claveActiva() { return claveActiva; }

/** true si todavía no se generó el par de claves (ver scripts/licencias-firma.js init). */
export function sinClavePublica(clave = claveActiva) {
  return !String(clave || '').trim();
}

/** true si el texto tiene la PINTA de una licencia firmada. No prueba nada:
 *  sólo sirve para no confundir un código viejo con uno nuevo mal firmado. */
export function pareceFirmada(codigo) {
  return String(codigo || '').trim().startsWith(PREFIJO + '.');
}

/**
 * Verifica una licencia MVA1.
 *
 * @param {string} codigo
 * @param {{ahora?: () => number, clavePublicaB64?: string}} opciones
 * @returns {{ok: boolean, motivo?: string, datos?: object}}
 *
 * Motivos posibles (para poder dar un mensaje útil en vez de "código inválido"):
 *   vacia | sin-clave-publica | formato | firma | vencida | invalida
 */
export function verificarLicencia(codigo, { ahora = Date.now, clavePublicaB64 = claveActiva } = {}) {
  const texto = String(codigo || '').trim();
  if (!texto) return { ok: false, motivo: 'vacia' };
  // Sin clave pública no se puede verificar NADA. Se responde que no, nunca que
  // sí: un "no hay con qué comprobar, lo dejo pasar" convertiría un error de
  // empaquetado en el producto regalado.
  if (sinClavePublica(clavePublicaB64)) return { ok: false, motivo: 'sin-clave-publica' };

  const partes = texto.split('.');
  if (partes.length !== 3 || partes[0] !== PREFIJO) return { ok: false, motivo: 'formato' };

  try {
    const payload = desdeB64url(partes[1]);
    const firma = desdeB64url(partes[2]);
    const pub = createPublicKey({
      key: Buffer.from(clavePublicaB64, 'base64'), format: 'der', type: 'spki'
    });
    if (!verify(null, payload, pub, firma)) return { ok: false, motivo: 'firma' };
    const datos = JSON.parse(payload.toString('utf8'));
    // x = vencimiento. null/ausente = perpetua.
    if (datos.x && ahora() > new Date(datos.x).getTime()) return { ok: false, motivo: 'vencida', datos };
    return { ok: true, datos };
  } catch {
    // b64 roto, payload que no es JSON, clave pública corrupta: todo cae acá y
    // todo significa lo mismo — esta licencia no vale.
    return { ok: false, motivo: 'invalida' };
  }
}

/** Días que le quedan a una licencia verificada. null = perpetua. */
export function diasRestantesDe(datos, ahora = Date.now) {
  if (!datos || !datos.x) return null;
  return Math.max(0, Math.ceil((new Date(datos.x).getTime() - ahora()) / 86400000));
}
