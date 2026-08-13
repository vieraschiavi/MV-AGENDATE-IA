// © 2026 Martín Viera. Todos los derechos reservados.

// Tests del módulo de MercadoPago (checkout, preferencias, suscripción
// recurrente) — node --test. Mockea fetch para no depender de la red real ni
// de una cuenta de MercadoPago de verdad.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mercadopagoActivo, planRecurrente, consultarPreapproval, consultarPagoRecurrente,
  crearPreferencia, crearPreferenciaCreditos, consultarPago,
} from '../src/store/mercadopago.js';
import { setConfig } from '../src/store/config.js';

after(() => { setConfig({ mercadopagoToken: '', sitioUrl: '', preapprovalPlanFull: '', preapprovalPlanSaas: '' }); });

function conFetchMock(respuestas, fn) {
  const original = globalThis.fetch;
  const cola = Array.isArray(respuestas) ? [...respuestas] : null;
  globalThis.fetch = async (url, opts) => {
    const r = cola ? (cola.shift() ?? respuestas) : respuestas;
    if (typeof r === 'function') return r(url, opts);
    return { ok: r.ok !== false, json: async () => r.body ?? r };
  };
  return fn().finally(() => { globalThis.fetch = original; });
}

test('mercadopagoActivo refleja si hay Access Token configurado', () => {
  setConfig({ mercadopagoToken: '' });
  assert.equal(mercadopagoActivo(), false);
  setConfig({ mercadopagoToken: 'TEST-token-123' });
  assert.equal(mercadopagoActivo(), true);
});

test('sin Access Token, ninguna función de cobro hace la llamada real ni inventa un resultado', async () => {
  setConfig({ mercadopagoToken: '' });
  const r1 = await crearPreferencia({ id: 'ORD-1', plan: 'basico', total_usd: 129, email: 'a@b.com' }, 'https://x.test');
  assert.equal(r1.ok, false);
  const r2 = await planRecurrente('full', 299);
  assert.equal(r2.ok, false);
  const r3 = await crearPreferenciaCreditos({ cuentaId: 'c1', monto: 10, email: 'a@b.com' }, 'https://x.test');
  assert.equal(r3.ok, false);
  assert.equal(await consultarPreapproval('pre-1'), null);
  assert.equal(await consultarPagoRecurrente('pago-1'), null);
  assert.equal(await consultarPago('pago-1'), null);
});

test('crearPreferencia manda el precio EXACTO del pedido, nunca uno recalculado', async () => {
  setConfig({ mercadopagoToken: 'TEST-token' });
  let bodyEnviado = null;
  await conFetchMock(
    (url, opts) => {
      bodyEnviado = JSON.parse(opts.body);
      assert.match(String(url), /checkout\/preferences$/);
      return { ok: true, json: async () => ({ id: 'pref-1', init_point: 'https://mp.test/pref-1' }) };
    },
    async () => {
      const r = await crearPreferencia({ id: 'ORD-99', plan: 'full', total_usd: 299, email: 'cliente@test.com' }, 'https://mv.test');
      assert.equal(r.ok, true);
      assert.equal(r.init_point, 'https://mp.test/pref-1');
      assert.equal(r.preference_id, 'pref-1');
    }
  );
  // El monto sale del pedido (no de un recálculo del catálogo), pero se cobra
  // en UYU: MercadoPago rechaza USD en cuentas de Uruguay ("Cannot operate with
  // currency id USD in MLU"), así que mandar 299 USD hacía fallar la creación
  // de la preferencia y el checkout moría con "No pude crear la preferencia".
  assert.equal(bodyEnviado.items[0].currency_id, 'UYU', 'una cuenta MLU no acepta USD');
  assert.equal(bodyEnviado.items[0].unit_price, 299 * 42,
    'el monto cobrado tiene que derivar del pedido, convertido a UYU');
  assert.equal(bodyEnviado.external_reference, 'ORD-99', 'para poder reconciliar el webhook con el pedido correcto');
  assert.equal(bodyEnviado.notification_url, 'https://mv.test/api/pago/mercadopago');
});

test('crearPreferencia propaga el error de MercadoPago sin inventar un init_point', async () => {
  setConfig({ mercadopagoToken: 'TEST-token' });
  await conFetchMock(
    { ok: false, body: { message: 'invalid_token' } },
    async () => {
      const r = await crearPreferencia({ id: 'ORD-1', plan: 'basico', total_usd: 129, email: 'a@b.com' }, 'https://mv.test');
      assert.equal(r.ok, false);
      assert.equal(r.error, 'invalid_token');
    }
  );
});

test('crearPreferencia no revienta si MercadoPago está caído (error de red)', async () => {
  setConfig({ mercadopagoToken: 'TEST-token' });
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('ECONNRESET'); };
  try {
    const r = await crearPreferencia({ id: 'ORD-1', plan: 'basico', total_usd: 129, email: 'a@b.com' }, 'https://mv.test');
    assert.equal(r.ok, false);
    assert.match(r.error, /ECONNRESET/);
  } finally { globalThis.fetch = original; }
});

test('crearPreferenciaCreditos arma la external_reference "credito:cuenta:monto" para que el webhook la reconozca', async () => {
  setConfig({ mercadopagoToken: 'TEST-token' });
  let bodyEnviado = null;
  await conFetchMock(
    (url, opts) => { bodyEnviado = JSON.parse(opts.body); return { ok: true, json: async () => ({ init_point: 'https://mp.test/x' }) }; },
    async () => {
      const r = await crearPreferenciaCreditos({ cuentaId: 'cta-42', monto: 15, email: 'a@b.com' }, 'https://mv.test');
      assert.equal(r.ok, true);
    }
  );
  assert.equal(bodyEnviado.external_reference, 'credito:cta-42:15');
  assert.equal(bodyEnviado.items[0].currency_id, 'UYU');
  assert.equal(bodyEnviado.items[0].unit_price, 15 * 42, 'el pack de créditos también se cobra en UYU');
});

test('planRecurrente reutiliza el plan ya creado y cacheado si sigue activo (no duplica el cobro mensual)', async () => {
  setConfig({ mercadopagoToken: 'TEST-token', preapprovalPlanFull: 'plan-existente-123' });
  let seLlamoAlCreate = false;
  await conFetchMock(
    (url) => {
      if (String(url).includes('/preapproval_plan/plan-existente-123')) {
        return { ok: true, json: async () => ({ status: 'active', id: 'plan-existente-123', init_point: 'https://mp.test/plan-existente' }) };
      }
      seLlamoAlCreate = true;
      return { ok: true, json: async () => ({ id: 'plan-nuevo', init_point: 'https://mp.test/plan-nuevo' }) };
    },
    async () => {
      const r = await planRecurrente('full', 299);
      assert.equal(r.ok, true);
      assert.equal(r.id, 'plan-existente-123');
    }
  );
  assert.equal(seLlamoAlCreate, false, 'con un plan activo cacheado, no debe crear uno nuevo');
});

test('planRecurrente crea uno nuevo si no hay cacheado, convierte a UYU y rechaza un tier sin suscripción', async () => {
  setConfig({ mercadopagoToken: 'TEST-token', preapprovalPlanFull: '', preapprovalPlanSaas: '', sitioUrl: 'https://mv.test' });
  process.env.TIPO_CAMBIO_UYU = '40';
  let bodyEnviado = null;
  try {
    await conFetchMock(
      (url, opts) => { bodyEnviado = JSON.parse(opts.body); return { ok: true, json: async () => ({ id: 'plan-nuevo', init_point: 'https://mp.test/plan-nuevo' }) }; },
      async () => {
        const r = await planRecurrente('full', 299);
        assert.equal(r.ok, true);
        assert.equal(r.id, 'plan-nuevo');
      }
    );
  } finally { delete process.env.TIPO_CAMBIO_UYU; }
  assert.equal(bodyEnviado.auto_recurring.currency_id, 'UYU', 'MercadoPago Uruguay rechaza cobros recurrentes en USD');
  assert.equal(bodyEnviado.auto_recurring.transaction_amount, 299 * 40);

  const r2 = await planRecurrente('basico', 129);
  assert.equal(r2.ok, false, 'el plan básico (pago único, sin cuota mensual) no admite suscripción recurrente');
});

test('consultarPreapproval devuelve el detalle de la suscripción, o null si MercadoPago responde no-ok', async () => {
  setConfig({ mercadopagoToken: 'TEST-token' });
  await conFetchMock(
    { ok: true, body: { id: 'pre-1', status: 'authorized' } },
    async () => {
      const r = await consultarPreapproval('pre-1');
      assert.equal(r.status, 'authorized');
    }
  );
  await conFetchMock({ ok: false }, async () => {
    assert.equal(await consultarPreapproval('pre-inexistente'), null);
  });
});

test('consultarPagoRecurrente devuelve el cobro del mes, o null si MercadoPago responde no-ok', async () => {
  setConfig({ mercadopagoToken: 'TEST-token' });
  await conFetchMock(
    { ok: true, body: { id: 'auth-1', status: 'processed' } },
    async () => {
      const r = await consultarPagoRecurrente('auth-1');
      assert.equal(r.status, 'processed');
    }
  );
  await conFetchMock({ ok: false }, async () => {
    assert.equal(await consultarPagoRecurrente('auth-inexistente'), null);
  });
});

test('consultarPago devuelve status/external_reference/monto tal cual los manda MercadoPago', async () => {
  setConfig({ mercadopagoToken: 'TEST-token' });
  await conFetchMock(
    { ok: true, body: { status: 'approved', external_reference: 'ORD-7', transaction_amount: 129 } },
    async () => {
      const r = await consultarPago('pago-7');
      assert.deepEqual(r, { status: 'approved', external_reference: 'ORD-7', monto: 129 });
    }
  );
});
