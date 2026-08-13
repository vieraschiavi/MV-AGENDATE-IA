// © 2026 Martín Viera. Todos los derechos reservados.
// Tests del estado de suscripciones "Pro IA" (a quién le cobro, a quién le
// corto el acceso a IA si el pago falla) — node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  registrarUsoTokens, usoDelMes, guardarSuscripcion, obtenerSuscripcion,
  suscripcionActiva, vincularPreapproval, buscarLicenciaPorPreapproval,
} from '../src/store/suscripciones.js';

test('registrarUsoTokens acumula, no reemplaza, y usoDelMes lo devuelve', async () => {
  const licencia = 'MV-TEST-' + Date.now();
  assert.equal(await usoDelMes(licencia), 0, 'sin uso previo, arranca en 0');
  await registrarUsoTokens(licencia, 100);
  await registrarUsoTokens(licencia, 250);
  assert.equal(await usoDelMes(licencia), 350);
});

test('registrarUsoTokens ignora llamadas vacías (sin licencia o sin tokens) sin romper el acumulado', async () => {
  const licencia = 'MV-TEST-' + Date.now() + '-b';
  assert.equal(await registrarUsoTokens('', 100), 0);
  assert.equal(await registrarUsoTokens(licencia, 0), 0);
  assert.equal(await usoDelMes(licencia), 0);
});

test('guardarSuscripcion/obtenerSuscripcion persisten y hacen merge (no pisan campos que no se tocan)', async () => {
  const licencia = 'MV-TEST-' + Date.now() + '-c';
  assert.equal(await obtenerSuscripcion(licencia), null);
  await guardarSuscripcion(licencia, { estado: 'activo', plan: 'full' });
  const s1 = await obtenerSuscripcion(licencia);
  assert.equal(s1.estado, 'activo');
  assert.equal(s1.plan, 'full');
  assert.ok(s1.actualizado);

  await guardarSuscripcion(licencia, { estado: 'pausado' });
  const s2 = await obtenerSuscripcion(licencia);
  assert.equal(s2.estado, 'pausado', 'el campo tocado se actualiza');
  assert.equal(s2.plan, 'full', 'un campo no tocado en el segundo guardado no se pierde');
});

test('suscripcionActiva: solo "activo" habilita, cualquier otro estado corta el acceso a IA', async () => {
  const activa = 'MV-TEST-' + Date.now() + '-activa';
  const pausada = 'MV-TEST-' + Date.now() + '-pausada';
  const inexistente = 'MV-TEST-' + Date.now() + '-inexistente';

  await guardarSuscripcion(activa, { estado: 'activo' });
  await guardarSuscripcion(pausada, { estado: 'pausado' });

  assert.equal(await suscripcionActiva(activa), true);
  assert.equal(await suscripcionActiva(pausada), false);
  assert.equal(await suscripcionActiva(inexistente), false, 'sin registro, nunca se asume activa');
});

test('vincularPreapproval / buscarLicenciaPorPreapproval: el webhook de MercadoPago encuentra la licencia correcta', async () => {
  const preapprovalId = 'preapproval-' + Date.now();
  const licencia = 'MV-TEST-VINCULADA';
  assert.equal(await buscarLicenciaPorPreapproval(preapprovalId), null, 'sin vincular todavía, no hay a quién cobrarle');
  await vincularPreapproval(preapprovalId, licencia);
  assert.equal(await buscarLicenciaPorPreapproval(preapprovalId), licencia);
});
