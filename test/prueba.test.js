// Tests de la prueba gratis de la copia descargada (3 días → se corta) — node --test
import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { estadoPrueba, pruebaBloqueada, activarLicencia } from '../src/store/prueba.js';
import { setConfig } from '../src/store/config.js';

const DIA = 86400000;
const envVercel = process.env.VERCEL;
const envDias = process.env.DIAS_PRUEBA;

beforeEach(() => {
  delete process.env.VERCEL;
  process.env.DIAS_PRUEBA = '3';
  setConfig({ licenciaLocal: '', pruebaInicio: '' });
});
after(() => {
  if (envVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = envVercel;
  if (envDias === undefined) delete process.env.DIAS_PRUEBA; else process.env.DIAS_PRUEBA = envDias;
  setConfig({ licenciaLocal: '', pruebaInicio: '' });
});

test('primer arranque: estampa el inicio y la prueba está vigente', () => {
  const e = estadoPrueba();
  assert.equal(e.aplica, true);
  assert.equal(e.licenciada, false);
  assert.equal(e.vencida, false);
  assert.ok(e.inicio, 'debe estampar la fecha de inicio');
  assert.ok(e.diasRestantes >= 2 && e.diasRestantes <= 3);
  assert.equal(pruebaBloqueada(), false);
});

test('pasados los 3 días sin licencia: vencida y bloqueada', () => {
  setConfig({ pruebaInicio: new Date(Date.now() - 4 * DIA).toISOString() });
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
  setConfig({ pruebaInicio: new Date(Date.now() - 5 * DIA).toISOString() });
  assert.equal(pruebaBloqueada(), true);
  assert.equal(activarLicencia('xx').ok, false, 'código corto rechazado');
  const r = activarLicencia('MV-FULL-A1B2C3D4');
  assert.equal(r.ok, true);
  assert.equal(pruebaBloqueada(), false);
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
