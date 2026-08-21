// © 2026 Martín Viera. Todos los derechos reservados.

// GET /api/admin/resumen — el monitor del dueño: cuánta gente descargó,
// cuánto pagó y cuántas cuentas SaaS hay, en una sola llamada.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { crearPedido, confirmarPago, resumenVentas, resumenDescargas, contarDescarga } from '../src/store/licencias.js';

test('resumenVentas: cuenta pagados/pendientes y suma revenue por plan, no por el total de pedidos', async () => {
  const { pedido: p1 } = await crearPedido({ plan: 'basico', email: 'a@test.com' });
  const { pedido: p2 } = await crearPedido({ plan: 'full', email: 'b@test.com' });
  await crearPedido({ plan: 'basico', email: 'c@test.com' }); // queda sin pagar, a propósito

  await confirmarPago(p1.id);
  await confirmarPago(p2.id);

  const r = await resumenVentas();
  assert.ok(r.pedidos_pagados >= 2, 'los dos pagados tienen que contar');
  assert.ok(r.pedidos_pendientes >= 1, 'el que no se pagó no puede desaparecer ni sumar plata');
  assert.equal(r.por_plan.basico.cantidad >= 1, true);
  assert.equal(r.por_plan.full.cantidad >= 1, true);
  // El pendiente NUNCA aporta a revenue_usd_total, aunque tenga un total_usd fijado.
  assert.equal(r.revenue_usd_total, r.pedidos_pagados > 0
    ? Object.values(r.por_plan).reduce((s, p) => s + p.revenue_usd, 0)
    : 0);
});

test('contarDescarga/resumenDescargas: solo suma nombres de archivo reales, basura no crea claves nuevas', async () => {
  const antes = await resumenDescargas();
  await contarDescarga('MV-Agendate-IA.apk');
  await contarDescarga('MV-Agendate-IA.apk');
  await contarDescarga('../../etc/passwd'); // intento de nombre arbitrario: se ignora
  const despues = await resumenDescargas();

  assert.equal(despues['MV-Agendate-IA.apk'], (antes['MV-Agendate-IA.apk'] || 0) + 2);
  assert.ok(!('../../etc/passwd' in despues), 'un nombre fuera de la lista fija no puede aparecer en el resumen');
});

let base, servidor;
before(async () => {
  // MV_ESCRITORIO abierto para poder setear la clave admin sin el problema del
  // huevo-y-la-gallina (soloAdmin sin MV_ESCRITORIO Y sin clave configurada
  // corta con 401 en Vercel, así que no habría forma de cargar la primera vez).
  process.env.MV_ESCRITORIO = '1';
  process.env.VERCEL = '1'; // que importar server.js no levante su propio servidor real
  const { default: app } = await import('../src/server.js');
  servidor = app.listen(0);
  await new Promise((listo) => servidor.once('listening', listo));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
after(() => {
  servidor?.close();
  delete process.env.VERCEL;
  delete process.env.MV_ESCRITORIO;
});

test('GET /api/admin/resumen exige X-Admin-Key cuando hay una configurada', async () => {
  const J = { 'Content-Type': 'application/json' };
  await fetch(`${base}/api/config`, { method: 'POST', headers: J, body: JSON.stringify({ adminKey: 'clave-del-dueño' }) });
  delete process.env.MV_ESCRITORIO; // recién ahora se activa el gateo real, igual que en un deploy hosteado
  try {
    const sinClave = await fetch(`${base}/api/admin/resumen`);
    assert.equal(sinClave.status, 401);

    const conClave = await fetch(`${base}/api/admin/resumen`, { headers: { 'X-Admin-Key': 'clave-del-dueño' } });
    assert.equal(conClave.status, 200);
    const d = await conClave.json();
    assert.ok('ventas' in d && 'descargas' in d && 'cuentas_saas' in d);
    assert.ok(typeof d.ventas.revenue_usd_total === 'number');
    assert.ok(typeof d.cuentas_saas.total === 'number');
  } finally {
    process.env.MV_ESCRITORIO = '1';
    await fetch(`${base}/api/config`, { method: 'POST', headers: J, body: JSON.stringify({ adminKey: '' }) });
  }
});

test('GET /descargas/<archivo-conocido> suma al contador aunque el archivo no exista en este entorno de test', async () => {
  const antes = (await resumenDescargas())['MV-Agendate-IA-Setup.exe'] || 0;
  await fetch(`${base}/descargas/MV-Agendate-IA-Setup.exe`);
  // El middleware cuenta ANTES del estático y no espera a que termine: un
  // pequeño margen evita una carrera contra el fetch recién hecho.
  await new Promise((r) => setTimeout(r, 50));
  const despues = (await resumenDescargas())['MV-Agendate-IA-Setup.exe'] || 0;
  assert.equal(despues, antes + 1);
});
