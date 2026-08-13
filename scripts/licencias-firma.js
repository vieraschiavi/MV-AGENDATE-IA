#!/usr/bin/env node
// © 2026 Martín Viera. Todos los derechos reservados.

// ============================================================
// Claves de firma y emisión de licencias MVA1 (Ed25519).
//
//   node scripts/licencias-firma.js init [--reemplazar-par]
//   node scripts/licencias-firma.js emitir --email cliente@mail.com [--nombre "..."] [--plan full] [--dias 365]
//   node scripts/licencias-firma.js propia [--nombre "..."]
//   node scripts/licencias-firma.js activador [--salida dist/]
//
// La clave PRIVADA es lo que vale: quien la tenga puede fabricar licencias de
// tu producto. Se guarda en scripts/licencia-privada.pem, que está en
// .gitignore, o en la variable de entorno MV_LICENCIA_PRIVADA_PEM (que es como
// la lee el servidor en Vercel). Nunca va al repo — y este repo es PÚBLICO.
//
// La PÚBLICA no es secreta: se escribe en src/store/clave-publica.js y viaja
// dentro de cada copia entregada.
// ============================================================
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PEM_FILE, PUB_FILE, clavePrivada, firmarLicencia, payloadLicencia } from './firmar-licencia.js';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
// El hueco que la plantilla del conversor tiene reservado para la licencia.
const MARCA_LICENCIA = '@@LICENCIA_MVA1@@';

const argv = process.argv.slice(2);
const comando = argv[0] || '';
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);

const salir = (msg, ...extra) => { console.error(msg); for (const e of extra) console.error(e); process.exit(1); };

function escribirPublica(b64) {
  const texto = readFileSync(PUB_FILE, 'utf8');
  const nuevo = texto.replace(/(CLAVE_PUBLICA_B64\s*=\s*')[^']*(')/, `$1${b64}$2`);
  if (nuevo === texto) salir('✘ No pude escribir la clave pública en ' + PUB_FILE + ': ¿cambió el formato del archivo?');
  writeFileSync(PUB_FILE, nuevo);
}

// --- init: genera el par ---------------------------------------------------
if (comando === 'init') {
  // Pisar la privada invalida TODAS las licencias ya vendidas: los clientes que
  // pagaron se quedan con un código que la app nueva rechaza. Por eso hay que
  // pedirlo explícitamente.
  if (existsSync(PEM_FILE) && !flag('reemplazar-par')) {
    salir('✘ Ya existe ' + PEM_FILE + '.',
      '  Generar un par nuevo INVALIDA todas las licencias ya emitidas: el cliente que pagó',
      '  se queda con un código que la app rechaza.',
      '  Si de verdad querés reemplazarlo: --reemplazar-par');
  }
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  mkdirSync(dirname(PEM_FILE), { recursive: true });
  writeFileSync(PEM_FILE, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  const pub = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  escribirPublica(pub);
  console.log('✔ Par Ed25519 generado.');
  console.log('  Privada  → ' + PEM_FILE + '   (NO se sube: está en .gitignore)');
  console.log('  Pública  → ' + PUB_FILE);
  console.log('');
  console.log('  Para que el servidor pueda emitir licencias al cobrar, cargá la privada como');
  console.log('  variable de entorno MV_LICENCIA_PRIVADA_PEM en Vercel (pegá el PEM entero).');
  process.exit(0);
}

// --- Todo lo demás necesita la privada -------------------------------------
// Se corta ACÁ, antes de hacer nada, con el camino de salida escrito. Un
// generador que corre a medias y falla al final deja al que emite la licencia
// sin saber si tiene que rehacer algo.
if (!clavePrivada()) {
  salir('✘ Falta la clave privada: sin ella no se puede firmar ninguna licencia.',
    '',
    '  Si ya la tenías:      copiala a ' + PEM_FILE,
    '  Si es la primera vez: node scripts/licencias-firma.js init',
    '',
    '  No hay atajo: una licencia sin firma no activa nada.');
}

/** Firma, o corta con el mensaje de firmar-licencia.js (que ya explica la salida). */
const firmar = (payload) => { try { return firmarLicencia(payload); } catch (e) { salir('✘ ' + e.message); } };
const payloadDe = payloadLicencia;

if (comando === 'emitir') {
  const email = arg('email');
  if (!email) salir('✘ Falta --email: la licencia se emite a nombre de alguien.');
  const dias = arg('dias', null);
  const codigo = firmar(payloadDe({
    nombre: arg('nombre', email), email, plan: arg('plan', 'full'), dias
  }));
  console.log(codigo);
  console.error('');
  console.error('✔ Licencia ' + (dias ? `por ${dias} días` : 'PERPETUA') + ' para ' + email + '.');
  console.error('  Mandásela al cliente: la pega en el programa, en Licencia → Activar.');
  process.exit(0);
}

if (comando === 'propia') {
  const codigo = firmar(payloadDe({
    nombre: arg('nombre', 'Uso propio'), email: 'uso-propio@local', plan: 'full', dias: null
  }));
  console.log(codigo);
  console.error('');
  console.error('✔ Licencia PERPETUA de uso propio.');
  console.error('  La usa el empaquetador de la variante dueño (npm run empaquetar-exe-owner).');
  process.exit(0);
}

if (comando === 'activador') {
  const codigo = firmar(payloadDe({
    nombre: arg('nombre', 'Uso propio'), email: 'uso-propio@local', plan: 'full', dias: null
  }));

  // El conversor son DOS archivos que viajan juntos: el .bat (punto de entrada,
  // sin nada adentro) y el .ps1 (el motor de deteccion, que SI lleva la
  // licencia). Por eso el .bat vive en el repo y el .ps1 se genera: commitear
  // un .ps1 con la licencia adentro seria publicar la version completa, y este
  // repo es publico.
  const destino = resolve(process.cwd(), arg('salida', 'dist'));
  mkdirSync(destino, { recursive: true });

  const plantilla = readFileSync(join(RAIZ, 'scripts', 'plantillas', 'convertir-a-version-dueno.ps1'), 'utf8');
  if (!plantilla.includes(MARCA_LICENCIA)) {
    salir('✘ La plantilla del conversor no tiene el marcador ' + MARCA_LICENCIA + '.',
      '  Sin eso saldria un .ps1 sin licencia adentro, que no activa nada.');
  }
  // CRLF: los archivos de Windows que el cliente puede llegar a abrir con el
  // Bloc de notas viejo quedan ilegibles con LF.
  writeFileSync(join(destino, 'Convertir-a-version-dueno.ps1'),
    plantilla.replaceAll(MARCA_LICENCIA, codigo).replace(/\r?\n/g, '\r\n'));
  const batOrigen = join(RAIZ, 'INSTALADOR', 'OWNER', 'Convertir-a-version-dueno.bat');
  if (!existsSync(batOrigen)) {
    salir('✘ Falta ' + batOrigen + '.',
      '  El .ps1 solo no sirve: el punto de entrada es el .bat, y tienen que viajar juntos.');
  }
  copyFileSync(batOrigen, join(destino, 'Convertir-a-version-dueno.bat'));

  console.log('OK: ' + destino);
  console.log('    Convertir-a-version-dueno.bat  (punto de entrada)');
  console.log('    Convertir-a-version-dueno.ps1  (lleva la licencia PERPETUA firmada)');
  console.log('    Tienen que viajar juntos, en la misma carpeta.');
  console.log('    NO los repartas: activan cualquier instalacion, para siempre.');
  process.exit(0);
}

salir('Uso:',
  '  node scripts/licencias-firma.js init [--reemplazar-par]',
  '  node scripts/licencias-firma.js emitir --email cliente@mail.com [--nombre "..."] [--plan full] [--dias 365]',
  '  node scripts/licencias-firma.js propia [--nombre "..."]',
  '  node scripts/licencias-firma.js activador [--salida dist/]');
