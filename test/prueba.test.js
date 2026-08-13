// © 2026 Martín Viera. Todos los derechos reservados.
// Tests de la prueba gratis de la copia descargada (7 días → se corta) — node --test
import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, mkdtempSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { estadoPrueba, pruebaBloqueada, activarLicencia } from '../src/store/prueba.js';
import { DIAS_PRUEBA_CLIENTE } from '../src/store/dias-prueba.js';
import { setConfig } from '../src/store/config.js';

const DIA = 86400000;
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

test('con licencia cargada nunca se bloquea, aunque el inicio sea viejo', () => {
  setConfig({ pruebaInicio: new Date(Date.now() - 30 * DIA).toISOString(), licenciaLocal: 'MV-FULL-ABC123' });
  const e = estadoPrueba();
  assert.equal(e.licenciada, true);
  assert.equal(pruebaBloqueada(), false);
});

test('activarLicencia levanta el candado y rechaza códigos inválidos', () => {
  setConfig({ pruebaInicio: new Date(Date.now() - 9 * DIA).toISOString() });
  assert.equal(pruebaBloqueada(), true);
  assert.equal(activarLicencia('xx').ok, false, 'código corto rechazado');
  const r = activarLicencia('MV-FULL-A1B2C3D4');
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

test('un código de licencia inventado no destraba la copia', () => {
  // Sin el mínimo de largo, un MV_LICENCIA=x en el entorno de la máquina daba
  // licenciada:true y levantaba el candado sin haber pagado nunca.
  setConfig({ pruebaInicio: new Date(Date.now() - 9 * DIA).toISOString(), licenciaLocal: 'x' });
  const e = estadoPrueba();
  assert.equal(e.licenciada, false);
  assert.equal(pruebaBloqueada(), true);
});

test('DIAS_PRUEBA=0 desactiva la prueba (copia del vendedor, sin límite)', () => {
  process.env.DIAS_PRUEBA = '0';
  const e = estadoPrueba();
  assert.equal(e.aplica, false);
  assert.equal(pruebaBloqueada(), false);
});

test('en el host (Vercel) la prueba local no aplica', () => {
  process.env.VERCEL = '1';
  setConfig({ pruebaInicio: new Date(Date.now() - 10 * DIA).toISOString() });
  const e = estadoPrueba();
  assert.equal(e.aplica, false);
  assert.equal(pruebaBloqueada(), false);
});
