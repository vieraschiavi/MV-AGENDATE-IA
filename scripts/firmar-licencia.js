// © 2026 Martín Viera. Todos los derechos reservados.

// Firma de licencias MVA1. Es la mitad PRIVADA del mecanismo: vive en scripts/,
// nunca se empaqueta en la entrega y nunca se importa desde src/.
//
// La usan dos cosas: el CLI (scripts/licencias-firma.js) y el empaquetador de la
// variante dueño (scripts/variante-instalador.js).
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
export const PEM_FILE = join(RAIZ, 'scripts', 'licencia-privada.pem');
export const PUB_FILE = join(RAIZ, 'src', 'store', 'clave-publica.js');

/**
 * Clave privada, o null si no está. Primero el entorno —así la tiene el
 * servidor en Vercel y el runner de GitHub Actions— y después el .pem local.
 */
export function clavePrivada() {
  const env = process.env.MV_LICENCIA_PRIVADA_PEM;
  if (env) return env.replace(/\\n/g, '\n');
  return existsSync(PEM_FILE) ? readFileSync(PEM_FILE, 'utf8') : null;
}

/**
 * Clave pública tal como quedó escrita en el repo (la que viaja en la entrega).
 *
 * MV_CLAVE_PUBLICA_TEST la pisa, y sólo la usan los tests: el repo se publica
 * con la clave vacía, así que sin esto no habría forma de comprobar que el
 * empaquetador arma una licencia de dueño que la app después acepta.
 *
 * No es un agujero: este archivo es herramienta de BUILD y nunca se empaqueta
 * en la entrega. La app verifica con src/store/licencia-firma.js, que no mira
 * ninguna variable de entorno justamente para que no alcance con tocar la
 * máquina del cliente.
 */
export function clavePublicaDelRepo() {
  if (process.env.MV_CLAVE_PUBLICA_TEST) return process.env.MV_CLAVE_PUBLICA_TEST;
  if (!existsSync(PUB_FILE)) return '';
  return (readFileSync(PUB_FILE, 'utf8').match(/CLAVE_PUBLICA_B64\s*=\s*'([^']*)'/) || [])[1] || '';
}

/** payload estándar de una licencia. dias null/0 → perpetua. */
export function payloadLicencia({ nombre, email, plan = 'full', dias = null }) {
  return {
    n: nombre, e: email, p: plan,
    x: dias ? new Date(Date.now() + Number(dias) * 86400000).toISOString().slice(0, 10) : null,
    i: new Date().toISOString().slice(0, 10)
  };
}

/**
 * Firma un payload y devuelve el código MVA1 completo.
 *
 * Antes de devolverlo lo VERIFICA contra la clave pública que va en la entrega.
 * Sin ese control, un .pem que quedó de otro par produce licencias con pinta
 * perfecta que la app rechaza — y eso se descubre recién cuando el cliente que
 * ya pagó escribe diciendo que su código no anda.
 *
 * @throws {Error} si no hay clave privada, si no hay pública, o si no verifica.
 */
export function firmarLicencia(payload) {
  const priv = clavePrivada();
  if (!priv) {
    throw new Error(
      'Falta la clave privada: sin ella no se puede firmar ninguna licencia.\n' +
      '  Si ya la tenías:      copiala a ' + PEM_FILE + '\n' +
      '  Si es la primera vez: node scripts/licencias-firma.js init\n' +
      '  (o cargá el PEM en la variable de entorno MV_LICENCIA_PRIVADA_PEM)\n' +
      '  No hay atajo: una licencia sin firma no activa nada.'
    );
  }
  const pub = clavePublicaDelRepo();
  if (!pub) {
    throw new Error('src/store/clave-publica.js está vacío: no hay contra qué verificar.\n' +
      '  Corré primero: node scripts/licencias-firma.js init');
  }

  const datos = Buffer.from(JSON.stringify(payload), 'utf8');
  const firma = sign(null, datos, createPrivateKey(priv));
  const codigo = 'MVA1.' + datos.toString('base64url') + '.' + firma.toString('base64url');

  const ok = verify(null, datos,
    createPublicKey({ key: Buffer.from(pub, 'base64'), format: 'der', type: 'spki' }), firma);
  if (!ok) {
    throw new Error(
      'La licencia firmada NO verifica contra la clave pública del repo.\n' +
      '  Tu licencia-privada.pem es de OTRO par de claves: esa licencia no activaría nada.\n' +
      '  Salida: borrá el .pem y corré  node scripts/licencias-firma.js init --reemplazar-par\n' +
      '  (ojo: eso invalida las licencias ya emitidas con el par viejo).'
    );
  }
  return codigo;
}
