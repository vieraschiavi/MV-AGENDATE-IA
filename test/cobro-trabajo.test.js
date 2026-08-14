// © 2026 Martín Viera. Todos los derechos reservados.

// Cobrarle al cliente el trabajo cotizado, contra el SERVIDOR REAL.
//
// Es plata: acá el profesional le cobra a SU cliente y el dinero va a la cuenta
// de MercadoPago del profesional. Por eso se prueba el circuito entero por HTTP
// —cotizar, agendar, generar el link, recibir el webhook— y no las funciones
// sueltas: un error en el medio significa cobrar de más, cobrar dos veces, o
// que el cliente pague y la cita quede figurando impaga.
//
// MercadoPago está stubeado (no se mueve dinero de verdad); rutas,
// persistencia y webhook son reales.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let base, servidor, fetchOriginal, ultimaPreferencia;
const J = { 'Content-Type': 'application/json' };

const crearCita = async (datos) => (await (await fetch(`${base}/api/citas`, {
  method: 'POST', headers: J, body: JSON.stringify(datos)
})).json()).cita;
const verCita = async (id) => (await fetch(`${base}/api/citas/${id}`)).json();
const cobrar = (id, body = {}) => fetch(`${base}/api/citas/${id}/cobrar`, {
  method: 'POST', headers: J, body: JSON.stringify(body)
});
const avisarPago = (pagoId) => fetch(`${base}/api/pago/mercadopago`, {
  method: 'POST', headers: J, body: JSON.stringify({ type: 'payment', data: { id: pagoId } })
});

const citaBase = (extra = {}) => ({
  clienteNombre: 'Martin Viera', telefono: '098576279',
  trabajo: 'instalacion', trabajoNombre: 'Instalacion de tomacorriente',
  fecha: '2026-09-20', inicio: '11:00', fin: '12:00', direccion: 'Montevideo',
  cotizacion: { total: 100 }, ...extra
});

before(async () => {
  process.env.MV_DATOS_DIR = mkdtempSync(join(tmpdir(), 'mv-cobro-'));
  process.env.MV_ESCRITORIO = '1';
  process.env.VERCEL = '1';

  const { default: app } = await import('../src/server.js');
  servidor = app.listen(0);
  await new Promise((listo) => servidor.once('listening', listo));
  base = `http://127.0.0.1:${servidor.address().port}`;

  fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (u.startsWith(base)) return fetchOriginal(url, opts);
    if (u.includes('/checkout/preferences')) {
      ultimaPreferencia = JSON.parse(opts.body);
      return { ok: true, status: 200, json: async () => ({ id: 'PREF-1', init_point: 'https://mp.com/pagar/PREF-1' }) };
    }
    if (u.includes('/v1/payments/')) {
      return { ok: true, status: 200, json: async () => ({
        status: 'approved',
        external_reference: ultimaPreferencia.external_reference,
        transaction_amount: ultimaPreferencia.items[0].unit_price,
        currency_id: ultimaPreferencia.items[0].currency_id
      }) };
    }
    return { ok: false, status: 404, text: async () => '{}', json: async () => ({}) };
  };

  await fetch(`${base}/api/config`, { method: 'POST', headers: J, body: JSON.stringify({
    mercadopagoToken: 'TEST-token', sitioUrl: base, agenciaNombre: 'MV Agendate IA', pais: 'uy'
  }) });
});

after(() => {
  globalThis.fetch = fetchOriginal;
  servidor?.close();
  delete process.env.VERCEL;
});

test('una cita sin monto cotizado no se puede cobrar', async () => {
  // El monto sale SIEMPRE de la cotización. Sin cotización no hay nada que
  // cobrar: inventar un número acá sería exactamente lo que el producto promete
  // que nunca pasa.
  const cita = await crearCita(citaBase({ cotizacion: undefined, inicio: '09:00', fin: '10:00' }));
  const r = await cobrar(cita.id);
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /cotizado/i);
});

test('el link de pago cobra el monto cotizado, en la moneda del profesional', async () => {
  const cita = await crearCita(citaBase());
  const r = await cobrar(cita.id, { email: 'vieraschiavi@gmail.com' });
  const d = await r.json();
  assert.equal(d.ok, true);
  assert.ok(d.link, 'tiene que devolver el link para mandarle al cliente');

  // Que el monto NO pase por la conversión USD→UYU de las licencias: una
  // cotización ya viene en moneda local, y convertirla otra vez le
  // multiplicaría el precio al cliente por el tipo de cambio.
  assert.equal(ultimaPreferencia.items[0].unit_price, 100, 'cobró un monto distinto al cotizado');
  assert.equal(ultimaPreferencia.items[0].currency_id, 'UYU');
  assert.equal(ultimaPreferencia.external_reference, `trabajo:default:${cita.id}`,
    'sin esta referencia, el webhook no sabe qué cita marcar como pagada');
});

test('el link queda anotado en la cita, como pendiente', async () => {
  const cita = await crearCita(citaBase({ inicio: '13:00', fin: '14:00' }));
  const { link } = await (await cobrar(cita.id)).json();
  const guardada = await verCita(cita.id);
  assert.equal(guardada.cobro.link, link);
  assert.equal(guardada.cobro.estado, 'pendiente');
  assert.equal(guardada.cobro.monto, 100);
});

test('cuando el cliente paga, la cita queda cobrada sola', async () => {
  const cita = await crearCita(citaBase({ inicio: '15:00', fin: '16:00' }));
  await cobrar(cita.id);

  const r = await avisarPago('PAGO-A');
  assert.equal(r.status, 200);

  const pagada = await verCita(cita.id);
  assert.equal(pagada.cobro.estado, 'pagado');
  assert.equal(pagada.cobro.pagoId, 'PAGO-A');
  // El monto que confirmó MercadoPago, no el que esperábamos.
  assert.equal(pagada.cobro.montoPagado, 100);
  assert.ok(pagada.cobro.pagado, 'queda fechado');
});

test('un reintento del mismo pago no vuelve a registrarlo', async () => {
  // MercadoPago reintenta la notificación y esta ruta es pública: sin la marca
  // por id de pago, el mismo trabajo se sumaría dos veces a lo facturado.
  const cita = await crearCita(citaBase({ inicio: '17:00', fin: '18:00' }));
  await cobrar(cita.id);
  await avisarPago('PAGO-B');
  const primera = await verCita(cita.id);

  await avisarPago('PAGO-B');
  const segunda = await verCita(cita.id);
  assert.equal(segunda.cobro.pagado, primera.cobro.pagado, 'la fecha de pago no puede cambiar en un reintento');
});

test('a quien ya pagó no se le genera otro link', async () => {
  const cita = await crearCita(citaBase({ fecha: '2026-09-21' }));
  await cobrar(cita.id);
  await avisarPago('PAGO-C');

  const d = await (await cobrar(cita.id)).json();
  assert.equal(d.yaPagado, true);
  assert.ok(!d.link, 'no puede devolver un link nuevo para algo ya cobrado');
});

test('sin MercadoPago configurado, lo dice claro en vez de romper', async () => {
  await fetch(`${base}/api/config`, { method: 'POST', headers: J, body: JSON.stringify({ mercadopagoToken: '' }) });
  const cita = await crearCita(citaBase({ fecha: '2026-09-22' }));
  const r = await cobrar(cita.id);
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /MercadoPago/i);
  await fetch(`${base}/api/config`, { method: 'POST', headers: J, body: JSON.stringify({ mercadopagoToken: 'TEST-token' }) });
});

test('cobrar una cita que no existe no rompe', async () => {
  const r = await cobrar('CITA-INVENTADA');
  assert.equal(r.status, 404);
});

test('emitir un cobro exige la clave de administración', async () => {
  // Emitir un cobro es escribir en la cita y llamar a la API de MercadoPago del
  // profesional. Sin esta guardia, cualquiera que adivine el id de una cita
  // podría hacerlo desde afuera. El resto de los tests corre con MV_ESCRITORIO
  // (un solo usuario en su propia máquina), donde la clave no se pide.
  const cita = await crearCita(citaBase({ fecha: '2026-09-23' }));
  await fetch(`${base}/api/config`, { method: 'POST', headers: J, body: JSON.stringify({ adminKey: 'clave-secreta' }) });
  delete process.env.MV_ESCRITORIO;
  try {
    assert.equal((await cobrar(cita.id)).status, 401, 'sin la clave no puede emitir el cobro');
    assert.equal((await fetch(`${base}/api/citas/${cita.id}/cobrar`, {
      method: 'POST', headers: { ...J, 'X-Admin-Key': 'clave-secreta' }, body: '{}'
    })).status, 200, 'con la clave correcta sí');
  } finally {
    process.env.MV_ESCRITORIO = '1';
    await fetch(`${base}/api/config`, { method: 'POST', headers: J, body: JSON.stringify({ adminKey: '' }) });
  }
});
