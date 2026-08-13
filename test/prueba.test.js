// © 2026 Martín Viera. Todos los derechos reservados.

// Tests de la prueba gratis de la copia descargada (7 días → se corta) — node --test
import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, mkdtempSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateKeyPairSync, createPrivateKey, sign } from 'node:crypto';
import { estadoPrueba, pruebaBloqueada, activarLicencia } from '../src/store/prueba.js';
import { DIAS_PRUEBA_CLIENTE } from '../src/store/dias-prueba.js';
import { _fijarClavePublica, _claveActiva } from '../src/store/licencia-firma.js';
import { setConfig } from '../src/store/config.js';

const DIA = 86400000;

// --- Claves de prueba ---
// El par lo arma scripts/aislar-datos-test.js (el --import de `npm test`),
// porque las dos puntas tienen que quedar alineadas: el cobro firma con
// MV_LICENCIA_PRIVADA_PEM y la app verifica con la pública. Acá sólo se toma la
// privada para poder fabricar licencias a mano.
const PRIVADA = createPrivateKey(process.env.MV_LICENCIA_PRIVADA_PEM);
const CLAVE_PUB = _claveActiva();
const firmarCon = (privada, payload) => {
  const datos = Buffer.from(JSON.stringify(payload), 'utf8');
  return 'MVA1.' + datos.toString('base64url') + '.' + sign(null, datos, privada).toString('base64url');
};
const licenciaDe = (extra = {}) => firmarCon(PRIVADA,
  { n: 'Cliente', e: 'c@mail.com', p: 'full', x: null, i: '2026-01-01', ...extra });
const LICENCIA = licenciaDe();
const envVercel = process.env.VERCEL;
const envDias = process.env.DIAS_PRUEBA;
const envAncla = process.env.MV_ANCLA_DIR;

// El ancla del inicio de la prueba vive en el perfil del usuario. Sin aislarla,
// estos tests escribirían en el HOME real y se contaminarían entre sí (y entre
// corridas): el primero dejaría una fecha que el siguiente leería como propia.
const ANCLA_DIR = mkdtempSync(join(tmpdir(), 'mv-test-ancla-'));
const limpiarAncla = () => rmSync(join(ANCLA_DIR, 'prueba.json'), { force: true });

beforeEach(() => {
  delete process.env.VERCEL;
  process.env.DIAS_PRUEBA = String(DIAS_PRUEBA_CLIENTE);
  process.env.MV_ANCLA_DIR = ANCLA_DIR;
  limpiarAncla();
  setConfig({ licenciaLocal: '', pruebaInicio: '' });
});
after(() => {
  if (envVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = envVercel;
  if (envDias === undefined) delete process.env.DIAS_PRUEBA; else process.env.DIAS_PRUEBA = envDias;
  if (envAncla === undefined) delete process.env.MV_ANCLA_DIR; else process.env.MV_ANCLA_DIR = envAncla;
  rmSync(ANCLA_DIR, { recursive: true, force: true });
  setConfig({ licenciaLocal: '', pruebaInicio: '' });
});

test('primer arranque: estampa el inicio y la prueba está vigente', () => {
  const e = estadoPrueba();
  assert.equal(e.aplica, true);
  assert.equal(e.licenciada, false);
  assert.equal(e.vencida, false);
  assert.ok(e.inicio, 'debe estampar la fecha de inicio');
  assert.equal(e.diasPrueba, 7);
  assert.ok(e.diasRestantes >= 6 && e.diasRestantes <= 7);
  assert.equal(pruebaBloqueada(), false);
});

test('la versión que se vende arranca con 7 días de prueba', () => {
  assert.equal(DIAS_PRUEBA_CLIENTE, 7);
  delete process.env.DIAS_PRUEBA; // sin override: el default es el de la venta
  assert.equal(estadoPrueba().diasPrueba, 7);
});

test('al sexto día todavía anda: no se corta antes de tiempo', () => {
  setConfig({ pruebaInicio: new Date(Date.now() - 6 * DIA).toISOString() });
  const e = estadoPrueba();
  assert.equal(e.vencida, false);
  assert.equal(e.diasRestantes, 1);
  assert.equal(pruebaBloqueada(), false);
});

test('pasados los 7 días sin licencia: vencida y bloqueada', () => {
  setConfig({ pruebaInicio: new Date(Date.now() - 8 * DIA).toISOString() });
  const e = estadoPrueba();
  assert.equal(e.vencida, true);
  assert.equal(e.diasRestantes, 0);
  assert.equal(pruebaBloqueada(), true);
});

test('con licencia FIRMADA nunca se bloquea, aunque el inicio sea viejo', () => {
  setConfig({ pruebaInicio: new Date(Date.now() - 30 * DIA).toISOString(), licenciaLocal: LICENCIA });
  const e = estadoPrueba();
  assert.equal(e.licenciada, true);
  assert.equal(pruebaBloqueada(), false);
});

test('activarLicencia levanta el candado con una licencia firmada y rechaza el resto', () => {
  setConfig({ pruebaInicio: new Date(Date.now() - 9 * DIA).toISOString() });
  assert.equal(pruebaBloqueada(), true);
  assert.equal(activarLicencia('xx').ok, false, 'código corto rechazado');
  assert.equal(activarLicencia('MV-FULL-A1B2C3D4').ok, false,
    'el formato viejo no se puede verificar en la máquina del cliente: aceptarlo es aceptar cualquier texto con esa forma');
  const r = activarLicencia(LICENCIA);
  assert.equal(r.ok, true);
  assert.equal(pruebaBloqueada(), false);
});

// --- Intentos de zafar del candado sin pagar ---

test('un inicio de prueba ilegible no deja la copia abierta para siempre', () => {
  // new Date('cualquiercosa') da NaN y `NaN <= 0` es false: sin validar, la
  // prueba no vencía nunca. Se descarta y se cuenta desde ahora.
  setConfig({ pruebaInicio: 'cualquiercosa' });
  const e = estadoPrueba();
  assert.equal(e.vencida, false);
  assert.equal(e.diasRestantes, 7, 'arranca de cero, no da NaN');
  assert.notEqual(e.inicio, 'cualquiercosa', 'debe re-estampar el inicio');
});

test('un inicio con fecha futura no regala años de prueba', () => {
  setConfig({ pruebaInicio: '2099-01-01T00:00:00.000Z' });
  const e = estadoPrueba();
  assert.equal(e.diasRestantes, 7, 'se descarta la fecha futura');
  assert.ok(new Date(e.inicio).getTime() <= Date.now());
});

test('un inicio adulterado no impide que el candado corte a los 7 días', () => {
  setConfig({ pruebaInicio: '2099-01-01T00:00:00.000Z' });
  estadoPrueba();                                    // re-estampa el inicio
  const inicio = new Date(Date.now() - 8 * DIA).toISOString();
  setConfig({ pruebaInicio: inicio });
  assert.equal(pruebaBloqueada(), true);
});

test('borrar la config del programa NO reinicia la prueba', () => {
  // El agujero: el inicio vivía solo en data/config.json, adentro de la carpeta
  // de instalación. Al aparecer el candado, bastaba con borrar ese archivo para
  // tener otros 7 días, repetible para siempre.
  setConfig({ pruebaInicio: new Date(Date.now() - 8 * DIA).toISOString() });
  assert.equal(pruebaBloqueada(), true, 'arranca vencida');

  setConfig({ pruebaInicio: '' });          // el usuario borra data/config.json
  const e = estadoPrueba();
  assert.equal(e.vencida, true, 'el ancla del perfil vuelve a imponer la fecha original');
  assert.equal(pruebaBloqueada(), true);
});

test('el ancla se escribe sola en el primer arranque', () => {
  assert.equal(existsSync(join(ANCLA_DIR, 'prueba.json')), false);
  estadoPrueba();
  assert.equal(existsSync(join(ANCLA_DIR, 'prueba.json')), true, 'sin ancla, borrar la config regalaría días');
});

test('si el ancla no se puede escribir, la prueba igual funciona', () => {
  // Perfil de solo lectura / permisos raros: el candado no puede depender de
  // eso. Se simula con una ruta cuyo padre es un ARCHIVO (ENOTDIR), que falla
  // igual en Windows, Mac y Linux.
  const archivo = join(ANCLA_DIR, 'esto-es-un-archivo');
  writeFileSync(archivo, 'x');
  process.env.MV_ANCLA_DIR = join(archivo, 'sub');
  try {
    const e = estadoPrueba();
    assert.equal(e.aplica, true, 'la prueba tiene que seguir andando sin ancla');
    assert.equal(e.diasRestantes, 7);
  } finally {
    process.env.MV_ANCLA_DIR = ANCLA_DIR;
  }
});

// --- EL agujero que cierra la firma ---
//
// El chequeo era `String(codigo).trim().length >= 6`. Cualquier texto de seis
// caracteres pasaba por licencia y levantaba el candado PARA SIEMPRE. No hacía
// falta ninguna herramienta ni leer el código: al cliente al que se le vencía
// la prueba le alcanzaba con probar cualquier cosa en el campo de licencia.
test('un texto cualquiera ya no pasa por licencia', () => {
  const vencida = () => setConfig({ pruebaInicio: new Date(Date.now() - 9 * DIA).toISOString() });
  for (const basura of ['x', 'aaaaaa', 'licencia', '123456789012345678', 'MV-FULL-ABC123', 'MVA1.x.y']) {
    vencida();
    setConfig({ licenciaLocal: basura });
    const e = estadoPrueba();
    assert.equal(e.licenciada, false, `"${basura}" no puede pasar por licencia`);
    assert.equal(pruebaBloqueada(), true, `"${basura}" no puede levantar el candado`);
  }
});

test('una licencia firmada con OTRA clave privada no sirve', () => {
  // Es el intento serio: alguien ve el formato en el código (que es público),
  // se arma su propio par de claves y firma una licencia perfecta. Sólo verifica
  // contra la clave pública que viaja en la entrega, y ésa es una sola.
  const otro = generateKeyPairSync('ed25519');
  setConfig({
    pruebaInicio: new Date(Date.now() - 9 * DIA).toISOString(),
    licenciaLocal: firmarCon(otro.privateKey, { n: 'Vivo', e: 'v@mail.com', p: 'full', x: null, i: '2026-01-01' })
  });
  assert.equal(estadoPrueba().licenciada, false);
  assert.equal(pruebaBloqueada(), true);
});

test('cambiarle el plan a una licencia válida la invalida', () => {
  // La firma cubre el payload entero: tocar un byte —el plan, el nombre, la
  // fecha de vencimiento— rompe la firma. Sin esto, un cliente del plan básico
  // se editaba el suyo a "full" y se llevaba la IA de regalo.
  const [, payload, firma] = LICENCIA.split('.');
  const datos = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  datos.p = 'full-trucho';
  const trucha = 'MVA1.' + Buffer.from(JSON.stringify(datos)).toString('base64url') + '.' + firma;
  setConfig({ pruebaInicio: new Date(Date.now() - 9 * DIA).toISOString(), licenciaLocal: trucha });
  assert.equal(pruebaBloqueada(), true);
});

test('una licencia vencida bloquea, pero se distingue de una inventada', () => {
  // Al cliente hay que decirle "renová", no "tu código es falso": son dos
  // problemas distintos y mandarlo al lugar equivocado le cuesta un mail a
  // soporte y a vos una venta.
  setConfig({
    pruebaInicio: new Date(Date.now() - 9 * DIA).toISOString(),
    licenciaLocal: licenciaDe({ x: '2020-01-01' })
  });
  const e = estadoPrueba();
  assert.equal(e.licenciada, false);
  assert.equal(e.licenciaVencida, true, 'hay que poder decirle que RENUEVE, no que su código es falso');
  assert.equal(pruebaBloqueada(), true);
  assert.match(activarLicencia(licenciaDe({ x: '2020-01-01' })).error, /venci/i);
});

test('una licencia con vencimiento futuro anda y dice cuánto le queda', () => {
  const dentroDe30 = new Date(Date.now() + 30 * DIA).toISOString().slice(0, 10);
  setConfig({ pruebaInicio: new Date(Date.now() - 9 * DIA).toISOString(), licenciaLocal: licenciaDe({ x: dentroDe30 }) });
  const e = estadoPrueba();
  assert.equal(e.licenciada, true);
  assert.ok(e.diasRestantes >= 29 && e.diasRestantes <= 30, 'tiene que poder avisar antes de que se corte');
  assert.equal(pruebaBloqueada(), false);
});

test('sin clave pública, NINGUNA licencia se da por buena', () => {
  // Si una entrega sale sin la clave pública, no hay con qué verificar. La
  // tentación es dejar pasar todo "total no puedo comprobar" — y eso convierte
  // un error de empaquetado en el peor final posible: el producto gratis para
  // todo el que lo descargue, sin que nada se vea roto.
  //
  // (Corriendo desde el código fuente eso además es lo normal: el repo se
  // publica con la clave vacía. Por eso acá se comprueba lo que vale en los dos
  // casos — que la licencia NO se honre — y el corte por prueba vencida queda
  // cubierto por el test de la entrega empaquetada, donde DIAS_FIJADOS es un
  // número.)
  _fijarClavePublica('');
  try {
    setConfig({ pruebaInicio: new Date(Date.now() - 9 * DIA).toISOString(), licenciaLocal: LICENCIA });
    assert.equal(estadoPrueba().licenciada, false, 'sin clave pública NO se puede caer en "todo permitido"');
    assert.equal(activarLicencia(LICENCIA).ok, false);
  } finally { _fijarClavePublica(CLAVE_PUB); }
});

test('poner los días de prueba en 0 ya NO regala el programa: lo bloquea', () => {
  // ÉSTE era el candado de la versión dueño: un archivo de texto de una línea
  // con `diasPrueba: 0`, que significaba "sin límite". Cualquiera lo escribía
  // con el Bloc de notas —o ponía DIAS_PRUEBA=0 en sus variables de entorno— y
  // tenía el producto completo gratis, para siempre.
  //
  // Ahora cero días significa lo que dice: una prueba de cero días, o sea
  // vencida. El cambio exacto que hacía el que quería zafar es el que ahora lo
  // deja afuera. La copia del dueño se distingue por una licencia FIRMADA.
  process.env.DIAS_PRUEBA = '0';
  const e = estadoPrueba();
  assert.equal(e.aplica, true, 'la prueba tiene que seguir aplicando: "cero días" no es "sin candado"');
  assert.equal(e.vencida, true);
  assert.equal(pruebaBloqueada(), true);
});

test('en el host (Vercel) la prueba local no aplica', () => {
  process.env.VERCEL = '1';
  setConfig({ pruebaInicio: new Date(Date.now() - 10 * DIA).toISOString() });
  const e = estadoPrueba();
  assert.equal(e.aplica, false);
  assert.equal(pruebaBloqueada(), false);
});
