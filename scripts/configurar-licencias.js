#!/usr/bin/env node
// © 2026 Martín Viera. Todos los derechos reservados.

/**
 * Deja las licencias funcionando, sin que haya que copiar ni pegar nada.
 *
 *   node scripts/configurar-licencias.js
 *   (o doble clic en CONFIGURAR-LICENCIAS.bat)
 *
 * Hace las tres cosas que antes eran manuales:
 *   1. Genera el par de claves Ed25519.
 *   2. Escribe la PRIVADA en .env  (que está en .gitignore, no se sube).
 *   3. Escribe la PÚBLICA adentro de src/store/licencia-clave.js.
 *
 * Después de correrlo, el candado está cerrado: la copia instalada deja de
 * aceptar códigos inventados y sólo abre con licencias que firmó esta máquina.
 *
 * ES SEGURO CORRERLO DOS VECES: si ya hay un par configurado, NO lo pisa —
 * avisa y sale. Rotar el par invalida todas las licencias ya vendidas, así que
 * eso se pide a propósito con --rotar y con una advertencia.
 */
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV = join(raiz, '.env');
const CLAVE_JS = join(raiz, 'src', 'store', 'licencia-clave.js');
const VAR = 'MV_LICENSE_PRIVATE_KEY';
const rotar = process.argv.includes('--rotar');

const leer = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '');

// --- ¿ya está configurado? ---------------------------------------------------
const fuenteActual = leer(CLAVE_JS);
const yaTienePublica = /export const PUBLICA = `[^`]*BEGIN PUBLIC KEY/.test(fuenteActual);
const yaTienePrivada = new RegExp(`^${VAR}=.+`, 'm').test(leer(ENV));

if ((yaTienePublica || yaTienePrivada) && !rotar) {
  console.log(`
  ✅ Las licencias YA están configuradas en esta copia.

     Clave pública en el programa : ${yaTienePublica ? 'sí' : 'NO — falta'}
     Clave privada en .env        : ${yaTienePrivada ? 'sí' : 'NO — falta'}
${yaTienePublica && yaTienePrivada ? '' : `
     ⚠ Falta una de las dos mitades. Corré:  node scripts/configurar-licencias.js --rotar
       (genera un par nuevo y completo)
`}
     Para emitirle una licencia a un cliente:
       node scripts/licencia-emitir.js full

     No hace falta volver a correr esto. Si lo corrés con --rotar, TODAS las
     licencias que ya vendiste dejan de funcionar.
`);
  process.exit(0);
}

if (rotar && (yaTienePublica || yaTienePrivada)) {
  console.log(`
  ⚠️  ROTANDO EL PAR DE CLAVES.

     Todas las licencias emitidas hasta ahora van a dejar de validar. Si ya le
     vendiste a alguien, va a tener que pegar un código nuevo.

     Se guardan copias de respaldo con extensión .bak por las dudas.
`);
  if (existsSync(ENV)) copyFileSync(ENV, ENV + '.bak');
  copyFileSync(CLAVE_JS, CLAVE_JS + '.bak');
}

// --- generar -----------------------------------------------------------------
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const privada = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString().trim();
const publica = publicKey.export({ type: 'spki', format: 'pem' }).toString().trim();

// --- 1) privada -> .env ------------------------------------------------------
// En una sola línea con \n escapados: así el mismo valor se puede pegar tal cual
// en el panel de Vercel, que no acepta saltos de línea en el formulario.
const privadaUnaLinea = privada.replace(/\n/g, '\\n');
let env = leer(ENV);
if (new RegExp(`^${VAR}=`, 'm').test(env)) {
  env = env.replace(new RegExp(`^${VAR}=.*$`, 'm'), `${VAR}=${privadaUnaLinea}`);
} else {
  if (env && !env.endsWith('\n')) env += '\n';
  env += `\n# Clave privada de licencias. La escribió scripts/configurar-licencias.js.\n`;
  env += `# NO la compartas ni la subas: es lo único que impide que cualquiera se\n`;
  env += `# fabrique licencias de tu producto.\n${VAR}=${privadaUnaLinea}\n`;
}
writeFileSync(ENV, env);

// --- 2) pública -> el código -------------------------------------------------
const fuenteNueva = fuenteActual.replace(
  /export const PUBLICA = (?:''|`[^`]*`);/,
  'export const PUBLICA = `' + publica + '\n`;'
);
if (fuenteNueva === fuenteActual) {
  console.error(`
  ❌ No pude escribir la clave pública en:
     ${CLAVE_JS}

     Esperaba encontrar la línea:  export const PUBLICA = '';
     Si la editaste a mano, dejala así y volvé a correr esto.
`);
  process.exit(1);
}
writeFileSync(CLAVE_JS, fuenteNueva);

console.log(`
  ✅ LISTO. Las licencias quedaron configuradas.

  Lo que hice, para que sepas qué cambió:

    .env                          ← la clave PRIVADA (firma). No se sube a git.
    src/store/licencia-clave.js   ← la clave PÚBLICA (verifica). Esta sí se sube.

  ─────────────────────────────────────────────────────────────────────
  AHORA FALTAN DOS COSAS, Y LAS HACÉS VOS
  ─────────────────────────────────────────────────────────────────────

  1) COMMITEAR la clave pública, para que viaje adentro del instalador:

       git add src/store/licencia-clave.js
       git commit -m "Clave pública de licencias"

     ⚠ Tiene que estar ANTES de compilar el .exe/.apk que le mandás al
       cliente. Es la clave con la que su copia va a verificar.

  2) Si además tenés el sitio en Vercel, copiar la privada allá:

       Vercel → tu proyecto → Settings → Environment Variables
       Nombre : ${VAR}
       Valor  : la línea que quedó en .env (copiala entera, tal cual)

     Eso es sólo para que el checkout del sitio emita licencias solo.
     Si vendés con link de pago de MercadoPago, no hace falta.

  ─────────────────────────────────────────────────────────────────────
  PROBALO AHORA
  ─────────────────────────────────────────────────────────────────────

    node scripts/licencia-emitir.js full

  Te imprime un código. Pegalo en el programa (Configuración → Licencia) y
  el candado se abre. Pegá cualquier otra cosa y no.
`);
