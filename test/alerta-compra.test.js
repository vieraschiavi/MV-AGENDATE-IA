// © 2026 Martín Viera. Todos los derechos reservados.

// Aviso por mail cuando alguien inicia un checkout REAL (no cuando solo abre
// /comprar.html). Sirve para decidir en vivo si conviene subir de plan una
// plataforma que cobra por uso, recién cuando hay intención de compra —
// evitando pagar de antemano en proyectos donde todavía no pasó nada.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const J = { 'Content-Type': 'application/json' };
let base, servidor;

// Intercepta las DOS llamadas salientes que dispara un /api/comprar exitoso:
// MercadoPago (crea el checkout) y Resend (el aviso). Se distinguen por
// dominio, no por orden — enviarEmailAsync es fire-and-forget, así que el
// orden real de llegada no está garantizado.
function conFetchMock(fn) {
  const original = globalThis.fetch;
  const llamadasResend = [];
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('api.mercadopago.com')) {
      return { ok: true, json: async () => ({ id: 'MP-123', init_point: 'https://mercadopago.test/pagar/MP-123' }) };
    }
    if (u.includes('api.resend.com')) {
      llamadasResend.push(JSON.parse(opts.body));
      return { ok: true, json: async () => ({ id: 'email-1' }) };
    }
    // Todo lo demás (los propios fetch de este test contra el servidor local
    // de prueba) pasa de largo, sin mockear.
    return original(url, opts);
  };
  return fn(llamadasResend).finally(() => { globalThis.fetch = original; });
}

before(async () => {
  process.env.MV_ESCRITORIO = '1';
  process.env.VERCEL = '1';
  const { default: app } = await import('../src/server.js');
  servidor = app.listen(0);
  await new Promise((listo) => servidor.once('listening', listo));
  base = `http://127.0.0.1:${servidor.address().port}`;
  await fetch(`${base}/api/config`, { method: 'POST', headers: J,
    body: JSON.stringify({ mercadopagoToken: 'TEST-token-1234' }) });
});
after(async () => {
  await fetch(`${base}/api/config`, { method: 'POST', headers: J,
    body: JSON.stringify({ mercadopagoToken: '', emailAlertaCompra: '', emailDemos: '', resendApiKey: '' }) });
  servidor?.close();
  delete process.env.VERCEL;
  delete process.env.MV_ESCRITORIO;
});

test('con EMAIL_ALERTA_COMPRA configurado: un checkout real dispara el aviso, con el plan y el monto correctos', async () => {
  await fetch(`${base}/api/config`, { method: 'POST', headers: J,
    body: JSON.stringify({ emailAlertaCompra: 'dueno@test.com', resendApiKey: 're_test_123' }) });
  try {
    await conFetchMock(async (llamadasResend) => {
      const r = await fetch(`${base}/api/comprar`, { method: 'POST', headers: J,
        body: JSON.stringify({ plan: 'full', email: 'comprador@test.com', version: 'pc' }) });
      assert.equal(r.status, 200);
      const d = await r.json();
      assert.equal(d.ok, true, 'el checkout real tiene que seguir funcionando igual que antes');
      assert.ok(d.init_point);

      // enviarEmailAsync no espera: dar un margen a la microtask antes de revisar.
      await new Promise((res) => setTimeout(res, 30));
      assert.equal(llamadasResend.length, 1, 'tiene que salir EXACTAMENTE un aviso por checkout');
      const aviso = llamadasResend[0];
      assert.equal(aviso.to[0], 'dueno@test.com');
      assert.match(aviso.subject, /Full/i);
      assert.match(aviso.subject, /299/);
      assert.match(aviso.html, /comprador@test\.com/);
    });
  } finally {
    await fetch(`${base}/api/config`, { method: 'POST', headers: J,
      body: JSON.stringify({ emailAlertaCompra: '', resendApiKey: '' }) });
  }
});

test('sin EMAIL_ALERTA_COMPRA pero con EMAIL_DEMOS: cae en la misma bandeja del dueño', async () => {
  await fetch(`${base}/api/config`, { method: 'POST', headers: J,
    body: JSON.stringify({ emailDemos: 'dueno-demos@test.com', resendApiKey: 're_test_123' }) });
  try {
    await conFetchMock(async (llamadasResend) => {
      await fetch(`${base}/api/comprar`, { method: 'POST', headers: J,
        body: JSON.stringify({ plan: 'basico', email: 'otro@test.com', version: 'pc' }) });
      await new Promise((res) => setTimeout(res, 30));
      assert.equal(llamadasResend.length, 1);
      assert.equal(llamadasResend[0].to[0], 'dueno-demos@test.com');
    });
  } finally {
    await fetch(`${base}/api/config`, { method: 'POST', headers: J,
      body: JSON.stringify({ emailDemos: '', resendApiKey: '' }) });
  }
});

test('sin ningún destino configurado: el checkout sigue andando y no rompe nada', async () => {
  await conFetchMock(async (llamadasResend) => {
    const r = await fetch(`${base}/api/comprar`, { method: 'POST', headers: J,
      body: JSON.stringify({ plan: 'basico', email: 'sinaviso@test.com', version: 'pc' }) });
    assert.equal(r.status, 200);
    await new Promise((res) => setTimeout(res, 30));
    assert.equal(llamadasResend.length, 0, 'sin destino configurado no debe intentar mandar nada');
  });
});

test('abrir /comprar.html NO dispara el aviso — solo /api/comprar con checkout real', async () => {
  // El aviso es sobre INTENCIÓN DE PAGO real (MercadoPago ya devolvió un
  // checkout), no sobre "alguien miró la página". El servidor de archivos
  // estáticos ni siquiera pasa por este código, así que esto documenta la
  // garantía en vez de solo probarla.
  await fetch(`${base}/api/config`, { method: 'POST', headers: J,
    body: JSON.stringify({ emailAlertaCompra: 'dueno@test.com', resendApiKey: 're_test_123' }) });
  try {
    await conFetchMock(async (llamadasResend) => {
      const r = await fetch(`${base}/comprar.html`);
      await r.arrayBuffer();
      await new Promise((res) => setTimeout(res, 30));
      assert.equal(llamadasResend.length, 0);
    });
  } finally {
    await fetch(`${base}/api/config`, { method: 'POST', headers: J,
      body: JSON.stringify({ emailAlertaCompra: '', resendApiKey: '' }) });
  }
});

test('un pedido inválido (plan inexistente) no llega a crear checkout ni a avisar', async () => {
  await fetch(`${base}/api/config`, { method: 'POST', headers: J,
    body: JSON.stringify({ emailAlertaCompra: 'dueno@test.com', resendApiKey: 're_test_123' }) });
  try {
    await conFetchMock(async (llamadasResend) => {
      const r = await fetch(`${base}/api/comprar`, { method: 'POST', headers: J,
        body: JSON.stringify({ plan: 'no-existe', email: 'x@test.com' }) });
      assert.equal(r.status, 400);
      await new Promise((res) => setTimeout(res, 30));
      assert.equal(llamadasResend.length, 0);
    });
  } finally {
    await fetch(`${base}/api/config`, { method: 'POST', headers: J,
      body: JSON.stringify({ emailAlertaCompra: '', resendApiKey: '' }) });
  }
});
