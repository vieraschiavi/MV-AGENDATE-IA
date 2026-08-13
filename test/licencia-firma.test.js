// © 2026 Martín Viera. Todos los derechos reservados.

// El motor de verificación de licencias y el CLI que las emite.
//
// Es el código que decide si se cobra o no: el que menos puede quedar sin
// cobertura. Lo que reemplazó fue un `length >= 6` — cualquier texto de seis
// caracteres pasaba por licencia y levantaba el candado para siempre.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync, cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { generateKeyPairSync, createPrivateKey, sign } from 'node:crypto';
import { verificarLicencia, sinClavePublica, pareceFirmada, diasRestantesDe, _claveActiva } from '../src/store/licencia-firma.js';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const PUB = _claveActiva();
const PRIVADA = createPrivateKey(process.env.MV_LICENCIA_PRIVADA_PEM);

const firmarCon = (privada, payload) => {
  const datos = Buffer.from(JSON.stringify(payload), 'utf8');
  return 'MVA1.' + datos.toString('base64url') + '.' + sign(null, datos, privada).toString('base64url');
};
const licencia = (extra = {}) => firmarCon(PRIVADA,
  { n: 'Cliente', e: 'c@mail.com', p: 'full', x: null, i: '2026-01-01', ...extra });

// --- Verificación ---

test('acepta una licencia bien firmada y devuelve sus datos', () => {
  // La mitad que se olvida: una verificación que rechaza TODO también pasaría
  // los tests de rechazo, y dejaría a los clientes que pagaron sin poder activar.
  const v = verificarLicencia(licencia());
  assert.equal(v.ok, true);
  assert.equal(v.datos.e, 'c@mail.com');
  assert.equal(v.datos.p, 'full');
});

test('rechaza cualquier texto que no sea una licencia', () => {
  for (const basura of ['', '   ', 'x', 'aaaaaa', 'licencia-valida-por-favor', 'MV-FULL-A1B2C3D4']) {
    assert.equal(verificarLicencia(basura).ok, false, `"${basura}" no puede pasar`);
  }
});

test('rechaza una licencia firmada con OTRA clave privada', () => {
  // El intento serio: el formato está en el código, que es público. Alguien se
  // arma su propio par y firma una licencia impecable. Sólo vale contra la
  // clave pública que viaja en la entrega, y ésa es una sola.
  const otro = generateKeyPairSync('ed25519');
  const v = verificarLicencia(firmarCon(otro.privateKey, { n: 'Vivo', e: 'v@mail.com', p: 'full', x: null }));
  assert.equal(v.ok, false);
  assert.equal(v.motivo, 'firma');
});

test('un solo byte cambiado en el payload la invalida', () => {
  // La firma cubre el payload entero. Sin esto, el cliente del plan básico se
  // editaba el suyo a "full" y se llevaba la IA de regalo.
  const [, payload, firma] = licencia({ p: 'basico' }).split('.');
  const datos = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  datos.p = 'full';
  const trucha = 'MVA1.' + Buffer.from(JSON.stringify(datos)).toString('base64url') + '.' + firma;
  assert.equal(verificarLicencia(trucha).motivo, 'firma');
});

test('una firma pegada de otra licencia válida tampoco sirve', () => {
  const a = licencia({ e: 'a@mail.com' }).split('.');
  const b = licencia({ e: 'b@mail.com' }).split('.');
  assert.equal(verificarLicencia(`MVA1.${a[1]}.${b[2]}`).motivo, 'firma');
});

test('distingue VENCIDA de inventada, que son dos problemas distintos', () => {
  // Al cliente hay que mandarlo a renovar, no a revisar si copió mal el código.
  assert.equal(verificarLicencia(licencia({ x: '2020-01-01' })).motivo, 'vencida');
  assert.equal(verificarLicencia('cualquier cosa').motivo, 'formato');
});

test('una perpetua no vence nunca, ni con el reloj adelantado 100 años', () => {
  const dentroDe100 = () => Date.now() + 100 * 365 * 86400000;
  assert.equal(verificarLicencia(licencia({ x: null }), { ahora: dentroDe100 }).ok, true);
});

test('sin clave pública NO se da nada por bueno', () => {
  // La tentación es "no tengo con qué comprobar, lo dejo pasar". Eso convierte
  // un error de empaquetado en el producto regalado a todo el que lo descargue.
  const v = verificarLicencia(licencia(), { clavePublicaB64: '' });
  assert.equal(v.ok, false);
  assert.equal(v.motivo, 'sin-clave-publica');
  assert.equal(sinClavePublica(''), true);
  assert.equal(sinClavePublica(PUB), false);
});

test('el repo se publica SIN clave pública: la genera cada dueño', () => {
  // Si acá quedara commiteada una clave pública, sería la del dueño que la
  // generó — y cualquiera que clonara el repo armaría builds que aceptan las
  // licencias de ESE dueño. Vacía es lo correcto.
  const archivo = readFileSync(join(RAIZ, 'src', 'store', 'clave-publica.js'), 'utf8');
  assert.match(archivo, /CLAVE_PUBLICA_B64 = '';/,
    'la clave pública del repo tiene que quedar vacía: la escribe "licencias-firma.js init"');
});

test('entradas rotas no revientan el arranque del programa', () => {
  // Todo esto corre al abrir la app: una excepción acá es una ventana que no
  // abre, que es peor que una licencia rechazada.
  for (const roto of ['MVA1.@@@.@@@', 'MVA1..', 'MVA1.' + Buffer.from('no soy json').toString('base64url') + '.x',
    'MVA1.a.b.c', null, undefined, 123, {}]) {
    assert.doesNotThrow(() => verificarLicencia(roto));
    assert.equal(verificarLicencia(roto).ok, false);
  }
});

test('pareceFirmada y diasRestantesDe', () => {
  assert.equal(pareceFirmada('MVA1.x.y'), true);
  assert.equal(pareceFirmada('MV-FULL-A1B2C3D4'), false);
  assert.equal(diasRestantesDe({ x: null }), null, 'perpetua = sin días que contar');
  const dentroDe10 = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  assert.ok(diasRestantesDe({ x: dentroDe10 }) >= 9);
  assert.equal(diasRestantesDe({ x: '2020-01-01' }), 0, 'nunca negativo');
});

// --- El CLI que emite ---

// Copia mínima del proyecto, para no tocar el repo real ni pisar el .pem de
// nadie. Los tests corren en paralelo: uno solo que escriba en scripts/ del
// repo se lleva puestos a los demás.
function proyecto() {
  const dir = mkdtempSync(join(tmpdir(), 'mv-claves-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  mkdirSync(join(dir, 'src', 'store'), { recursive: true });
  for (const f of ['licencias-firma.js', 'firmar-licencia.js']) {
    cpSync(join(RAIZ, 'scripts', f), join(dir, 'scripts', f));
  }
  cpSync(join(RAIZ, 'src', 'store', 'clave-publica.js'), join(dir, 'src', 'store', 'clave-publica.js'));
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  return dir;
}
// El CLI se corre SIN las claves que arma el preload de los tests: la gracia es
// ejercitar el flujo real de "no tengo nada, corro init".
const correr = (dir, args, env = {}) => execFileSync(
  process.execPath, [join(dir, 'scripts', 'licencias-firma.js'), ...args],
  { cwd: dir, encoding: 'utf8', env: { ...process.env, MV_LICENCIA_PRIVADA_PEM: '', MV_CLAVE_PUBLICA_TEST: '', ...env } });

const publicaDe = (dir) =>
  (readFileSync(join(dir, 'src', 'store', 'clave-publica.js'), 'utf8').match(/CLAVE_PUBLICA_B64 = '([^']*)'/) || [])[1];

test('init deja el proyecto listo para firmar: privada afuera, pública adentro', () => {
  const dir = proyecto();
  try {
    correr(dir, ['init']);
    assert.ok(existsSync(join(dir, 'scripts', 'licencia-privada.pem')), 'falta la clave privada');
    assert.ok(publicaDe(dir), 'no escribió la clave pública en el repo');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('de cero a una licencia que la app acepta, con dos comandos', () => {
  // El circuito completo del que vende: init, emitir, y que el código sirva.
  const dir = proyecto();
  try {
    correr(dir, ['init']);
    const codigo = correr(dir, ['emitir', '--email', 'cliente@mail.com', '--plan', 'basico']).trim();
    const v = verificarLicencia(codigo, { clavePublicaB64: publicaDe(dir) });
    assert.equal(v.ok, true, 'la licencia emitida tiene que verificar contra la pública que se entrega');
    assert.equal(v.datos.e, 'cliente@mail.com');
    assert.equal(v.datos.p, 'basico');
    assert.equal(v.datos.x, null, 'sin --dias es perpetua');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('--dias emite una licencia que vence, y vence de verdad', () => {
  const dir = proyecto();
  try {
    correr(dir, ['init']);
    const codigo = correr(dir, ['emitir', '--email', 'mensual@mail.com', '--dias', '30']).trim();
    const pub = publicaDe(dir);
    assert.equal(verificarLicencia(codigo, { clavePublicaB64: pub }).ok, true);
    const dentroDe60 = () => Date.now() + 60 * 86400000;
    assert.equal(verificarLicencia(codigo, { clavePublicaB64: pub, ahora: dentroDe60 }).motivo, 'vencida');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('init NO pisa una clave privada existente sin pedirlo', () => {
  // Pisarla invalida TODAS las licencias ya vendidas: el cliente que pagó se
  // queda con un código que la app rechaza, y no hay forma de volver atrás.
  const dir = proyecto();
  try {
    correr(dir, ['init']);
    const antes = readFileSync(join(dir, 'scripts', 'licencia-privada.pem'), 'utf8');
    let err = null;
    try { correr(dir, ['init']); } catch (e) { err = e; }
    assert.ok(err, 'un segundo init tendría que cortar');
    assert.match(String(err.stderr || ''), /INVALIDA todas las licencias/i, 'no explica lo que se pierde');
    assert.equal(readFileSync(join(dir, 'scripts', 'licencia-privada.pem'), 'utf8'), antes, 'igual pisó la clave');
    correr(dir, ['init', '--reemplazar-par']);
    assert.notEqual(readFileSync(join(dir, 'scripts', 'licencia-privada.pem'), 'utf8'), antes,
      'con --reemplazar-par sí tiene que cambiarla');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('sin clave privada no se emite nada, y dice cómo conseguirla', () => {
  const dir = proyecto();
  try {
    let err = null;
    try { correr(dir, ['emitir', '--email', 'a@b.com']); } catch (e) { err = e; }
    assert.ok(err, 'emitió una licencia sin poder firmarla');
    assert.match(String(err.stderr || ''), /licencias-firma\.js init/, 'no dice cómo conseguir la clave');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('con el .pem de OTRO par, no emite una licencia que la app va a rechazar', () => {
  // El fallo más caro de todos: el cobro entra, el cliente recibe su clave, la
  // pega y el programa se la rechaza. Ningún build ni test lo nota, porque cada
  // punta funciona bien por separado.
  const dir = proyecto();
  const otro = proyecto();
  try {
    correr(dir, ['init']);
    correr(otro, ['init']);
    // Se ensucia la pública del primero con la del segundo: el .pem ya no corresponde.
    const archivo = join(dir, 'src', 'store', 'clave-publica.js');
    writeFileSync(archivo, readFileSync(archivo, 'utf8').replace(/CLAVE_PUBLICA_B64 = '[^']*'/, `CLAVE_PUBLICA_B64 = '${publicaDe(otro)}'`));

    let err = null;
    try { correr(dir, ['emitir', '--email', 'a@b.com']); } catch (e) { err = e; }
    assert.ok(err, 'emitió una licencia que la entrega va a rechazar');
    assert.match(String(err.stderr || ''), /OTRO par de claves/i);
    assert.match(String(err.stderr || ''), /reemplazar-par/, 'no dice cómo salir del problema');
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(otro, { recursive: true, force: true });
  }
});
