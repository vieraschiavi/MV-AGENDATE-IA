// Tests de los créditos de IA por cuenta SaaS — node --test
import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { estadoCreditos, haySaldo, consumir, acreditar, creditosHabilitado } from '../src/store/creditos.js';
import { setConfig } from '../src/store/config.js';

beforeEach(() => setConfig({ creditosSaas: '', creditosMargen: '2.5', creditosBono: '3', costoInputMusd: '15', costoOutputMusd: '75' }));
after(() => setConfig({ creditosSaas: '', creditosMargen: '', creditosBono: '' }));

test('una cuenta nueva arranca con el bono de bienvenida', async () => {
  assert.equal(creditosHabilitado(), true);
  const e = await estadoCreditos(`c-${Date.now()}-a`);
  assert.equal(e.saldo, 3);
  assert.equal(e.habilitado, true);
});

test('consumir descuenta costo×margen y haySaldo corta al llegar a 0', async () => {
  const id = `c-${Date.now()}-b`;
  await estadoCreditos(id); // saldo 3
  assert.equal(await haySaldo(id), true);
  // costo crudo: 1M in *15 + 1M out *75 = 90 USD; ×2.5 = 225 → deja negativo
  await consumir(id, { input_tokens: 1_000_000, output_tokens: 1_000_000 });
  const e = await estadoCreditos(id);
  assert.ok(e.saldo < 0, 'saldo quedó negativo tras un consumo grande');
  assert.equal(await haySaldo(id), false, 'sin saldo → no hay IA');
});

test('acreditar suma saldo y reactiva la IA', async () => {
  const id = `c-${Date.now()}-c`;
  await estadoCreditos(id); // saldo 3
  // consumo moderado que deja el saldo apenas en negativo (~-4.5)
  await consumir(id, { input_tokens: 100_000, output_tokens: 20_000 });
  assert.equal(await haySaldo(id), false);
  const r = await acreditar(id, 10);
  assert.equal(r.ok, true);
  assert.equal(await haySaldo(id), true);
  assert.equal(await acreditar(id, 0).then((x) => x.ok), false, 'monto inválido rechazado');
});

test('con creditosSaas=0 (BYOK) nunca corta', async () => {
  setConfig({ creditosSaas: '0' });
  assert.equal(creditosHabilitado(), false);
  const id = `c-${Date.now()}-d`;
  await consumir(id, { input_tokens: 9_000_000, output_tokens: 9_000_000 });
  assert.equal(await haySaldo(id), true, 'sin modo créditos, siempre hay "saldo"');
  setConfig({ creditosSaas: '' });
});
