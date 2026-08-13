// © 2026 Martín Viera. Todos los derechos reservados.
// Los dos bugs que impedían cobrar y entregar los productos estrella
// (Básico US$129 y Full US$299), fijados como contrato.
//
// 1. MONEDA. El archivo mercadopago.js documenta arriba de todo que MercadoPago
//    RECHAZA cobros en USD para cuentas de Uruguay ("Cannot operate with
//    currency id USD in MLU"), y define un tipo de cambio para eso. Pero la
//    conversión estaba aplicada SOLO en el camino recurrente: las preferencias
//    de pago único mandaban currency_id 'USD' igual, ocho líneas debajo del
//    comentario que explica por qué no funciona.
//
// 2. PERSISTENCIA. Los pedidos vivían en /tmp. En Vercel el pedido se crea en
//    un lambda y el webhook de MercadoPago llega a OTRO, así que confirmarPago
//    no encontraba el pedido: el cliente pagaba y se quedaba sin licencia ni
//    email, con "No encontré tu pedido" en gracias.html.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montoDeCobro } from '../src/store/mercadopago.js';
import { crearPedido, confirmarPago, obtenerPedido } from '../src/store/licencias.js';

test('el cobro se convierte a UYU: una cuenta de Uruguay no acepta USD', () => {
  const c = montoDeCobro(299);
  assert.equal(c.currency_id, 'UYU');
  assert.equal(c.unit_price, 299 * 42);
});

test('el monto convertido siempre es entero (MercadoPago rechaza decimales raros en UYU)', () => {
  for (const usd of [15, 99, 129, 299, 12.5]) {
    const c = montoDeCobro(usd);
    assert.equal(c.unit_price, Math.round(usd * 42), `falló con ${usd}`);
    assert.ok(Number.isInteger(c.unit_price));
  }
});

test('MP_CURRENCY=USD permite volver a USD sin tocar código (cuenta no uruguaya)', () => {
  const previo = process.env.MP_CURRENCY;
  try {
    process.env.MP_CURRENCY = 'USD';
    const c = montoDeCobro(299);
    assert.equal(c.currency_id, 'USD');
    assert.equal(c.unit_price, 299, 'en USD no se convierte nada');
  } finally {
    if (previo === undefined) delete process.env.MP_CURRENCY; else process.env.MP_CURRENCY = previo;
  }
});

test('TIPO_CAMBIO_UYU manda sobre el valor por defecto', () => {
  const previo = process.env.TIPO_CAMBIO_UYU;
  try {
    process.env.TIPO_CAMBIO_UYU = '45';
    assert.equal(montoDeCobro(100).unit_price, 4500);
  } finally {
    if (previo === undefined) delete process.env.TIPO_CAMBIO_UYU; else process.env.TIPO_CAMBIO_UYU = previo;
  }
});

test('un pedido creado sigue existiendo para confirmarlo después (el caso del webhook)', async () => {
  // Con los pedidos en /tmp esto pasaba igual en local, pero en Vercel el
  // webhook cae en otra invocación. La prueba fija el contrato que importa:
  // crear y confirmar tienen que poder ocurrir por separado.
  const { pedido } = await crearPedido({ plan: 'full', email: 'webhook@test.com' });
  assert.equal((await obtenerPedido(pedido.id)).estado, 'pendiente');

  const r = await confirmarPago(pedido.id);
  assert.equal(r.ok, true, 'el webhook tiene que poder encontrar el pedido y confirmarlo');
  assert.ok(r.pedido.licencia, 'confirmar el pago emite la licencia');
  assert.ok(r.pedido.token, 'y el token de descarga');

  const releido = await obtenerPedido(pedido.id);
  assert.equal(releido.estado, 'pagado');
  assert.equal(releido.licencia, r.pedido.licencia);
});

test('confirmar dos veces (reintento del webhook) no re-emite la licencia', async () => {
  const { pedido } = await crearPedido({ plan: 'basico', email: 'reintento@test.com' });
  const primera = await confirmarPago(pedido.id);
  const segunda = await confirmarPago(pedido.id);
  assert.equal(segunda.yaEstaba, true);
  assert.equal(segunda.pedido.licencia, primera.pedido.licencia);
  assert.equal(segunda.pedido.token, primera.pedido.token);
});
