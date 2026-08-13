// © 2026 Martín Viera. Todos los derechos reservados.

// Dos formas de perder plata en el cobro, cada una con su gate.
//
// 1) Acreditar el mismo pago más de una vez: MercadoPago REINTENTA la
//    notificación y /api/pago/mercadopago es público. Sin marca de "este pago
//    ya se procesó", un pago real de US$10 se convertía en saldo infinito.
// 2) Dejar pedidos pendientes de un pago que nunca va a llegar, cuando la
//    llamada a MercadoPago falla después de haber guardado el pedido.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acreditar, estadoCreditos } from '../src/store/creditos.js';
import * as lic from '../src/store/licencias.js';

const cuentaNueva = () => 'cta-' + Math.random().toString(36).slice(2, 10);

test('acreditar dos veces el MISMO pago suma una sola vez', async () => {
  const cuenta = cuentaNueva();
  const pagoId = 'mp-pago-12345';

  const primera = await acreditar(cuenta, 10, pagoId);
  assert.equal(primera.ok, true);
  assert.equal(primera.yaEstaba, undefined);
  const saldoTrasPrimera = primera.saldo;

  // El mismo aviso llega de nuevo (reintento de MercadoPago, o alguien que
  // repite el POST a mano: la ruta no pide autenticación).
  const segunda = await acreditar(cuenta, 10, pagoId);
  assert.equal(segunda.ok, true);
  assert.equal(segunda.yaEstaba, true, 'debe reconocer que ya lo había procesado');
  assert.equal(segunda.saldo, saldoTrasPrimera, 'el saldo no puede haber crecido');
});

test('diez reintentos del mismo pago no multiplican el saldo', async () => {
  const cuenta = cuentaNueva();
  const antes = await estadoCreditos(cuenta);
  for (let i = 0; i < 10; i++) await acreditar(cuenta, 25, 'mp-pago-unico');
  const despues = await estadoCreditos(cuenta);
  const acreditado = despues.saldo - antes.saldo;
  // 25 + bonificación del pack, pero UNA sola vez — nunca 250.
  assert.ok(acreditado < 50, `se acreditó ${acreditado}, se esperaba una sola recarga de 25`);
});

test('pagos DISTINTOS de la misma cuenta se acreditan los dos', async () => {
  const cuenta = cuentaNueva();
  const uno = await acreditar(cuenta, 10, 'mp-pago-A');
  const dos = await acreditar(cuenta, 10, 'mp-pago-B');
  assert.equal(dos.yaEstaba, undefined, 'un pago nuevo no puede confundirse con el anterior');
  assert.ok(dos.saldo > uno.saldo, 'el segundo pago real tiene que sumar');
});

test('sin id de pago se acredita igual (no rompe a quien llame sin la marca)', async () => {
  const cuenta = cuentaNueva();
  const r = await acreditar(cuenta, 5);
  assert.equal(r.ok, true);
  assert.ok(r.saldo > 0);
});

test('un pedido pendiente se puede descartar cuando MercadoPago falla', async () => {
  const r = await lic.crearPedido({ plan: 'full', email: 'cliente@ejemplo.com', nombre: 'Cliente' });
  assert.equal(r.ok, true);

  const descartado = await lic.descartarPedidoPendiente(r.pedido.id);
  assert.equal(descartado.ok, true);
  assert.equal(await lic.obtenerPedido(r.pedido.id), null, 'no debe quedar basura pendiente');
});

test('un pedido YA PAGADO nunca se descarta', async () => {
  // Si el webhook confirmó el pago antes que nuestra respuesta al navegador,
  // borrarlo le sacaría al cliente la licencia que acaba de comprar.
  const r = await lic.crearPedido({ plan: 'full', email: 'pagador@ejemplo.com', nombre: 'Pagador' });
  await lic.confirmarPago(r.pedido.id);

  const intento = await lic.descartarPedidoPendiente(r.pedido.id);
  assert.equal(intento.ok, false);
  assert.equal(intento.estado, 'pagado');

  const sigue = await lic.obtenerPedido(r.pedido.id);
  assert.ok(sigue && sigue.licencia, 'la licencia pagada tiene que seguir viva');
});

test('descartar un pedido no borra los pedidos de otros clientes', async () => {
  const mio = await lic.crearPedido({ plan: 'full', email: 'yo@ejemplo.com' });
  const ajeno = await lic.crearPedido({ plan: 'full', email: 'otro@ejemplo.com' });
  await lic.descartarPedidoPendiente(mio.pedido.id);
  assert.ok(await lic.obtenerPedido(ajeno.pedido.id), 'el pedido del otro cliente sigue');
});
