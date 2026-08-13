// © 2026 Martín Viera. Todos los derechos reservados.

// Pedidos en el almacén compartido: un pedido por clave, sin pisarse.
//
// El bug que cuida: antes TODOS los pedidos vivían en una sola clave de Redis y
// guardar era leer-modificar-reescribir el blob entero. Mientras el webhook de
// MercadoPago confirmaba un pago, otra invocación creando un pedido distinto
// leía la versión de antes y la reescribía encima: el pago confirmado volvía a
// 'pendiente'. El cliente pagaba, gracias.html le decía que no encontraba su
// pedido, y no le llegaba ni el email ni la licencia.
//
// MV_KV_MEMORIA=1 hace que el fallback en memoria cuente como almacén
// compartido: es la única forma de ejercitar acá el camino de serverless.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.MV_KV_MEMORIA = '1';
const lic = await import('../src/store/licencias.js');
const { kvSet, kvGet, kvSMembers } = await import('../src/store/redis.js');

after(() => { delete process.env.MV_KV_MEMORIA; });

const nuevoPedido = (extra = {}) =>
  lic.crearPedido({ plan: 'full', email: `c${Math.random().toString(36).slice(2, 8)}@ejemplo.com`, ...extra });

test('confirmar un pago mientras se crean OTROS pedidos no lo revierte', async () => {
  // El escenario del bug: invocaciones simultáneas sobre pedidos distintos.
  const a = await nuevoPedido();

  const [confirmado] = await Promise.all([
    lic.confirmarPago(a.pedido.id),
    ...Array.from({ length: 10 }, () => nuevoPedido())
  ]);
  assert.equal(confirmado.ok, true);

  const relectura = await lic.obtenerPedido(a.pedido.id);
  assert.equal(relectura.estado, 'pagado', 'el pago confirmado no puede volver a pendiente');
  assert.ok(relectura.licencia, 'y tiene que conservar su licencia');
});

test('muchas creaciones en paralelo no se pierden entre sí', async () => {
  const antes = (await lic.listarPedidos()).length;
  const creados = await Promise.all(Array.from({ length: 25 }, () => nuevoPedido()));
  const ids = creados.map((r) => r.pedido.id);

  const despues = await lic.listarPedidos();
  assert.equal(despues.length, antes + 25, 'no se puede perder ningún pedido');
  for (const id of ids) {
    assert.ok(despues.find((p) => p.id === id), `falta el pedido ${id}`);
  }
});

test('dos confirmaciones simultáneas del MISMO pago dan la misma licencia', async () => {
  // MercadoPago reintenta el aviso. Con una licencia al azar, cada intento
  // emitía un código distinto y el cliente podía quedarse con el que perdió:
  // una licencia que el servidor no reconoce.
  const p = await nuevoPedido();
  const [uno, dos] = await Promise.all([
    lic.confirmarPago(p.pedido.id),
    lic.confirmarPago(p.pedido.id)
  ]);
  assert.equal(uno.ok, true);
  assert.equal(dos.ok, true);
  assert.equal(uno.pedido.licencia, dos.pedido.licencia, 'la licencia tiene que ser la misma');

  const guardado = await lic.obtenerPedido(p.pedido.id);
  assert.equal(guardado.licencia, uno.pedido.licencia, 'y coincidir con la guardada');
});

test('la licencia emitida al cobrar está FIRMADA y la app la acepta', async () => {
  // Punta a punta, que es lo único que prueba que la cadena del cobro sirve:
  // el servidor firma con la privada, el cliente pega el código y su programa
  // lo verifica con la pública. Si estas dos puntas se desalinean, el cliente
  // paga, recibe su clave, la pega y el programa se la rechaza — y no hay
  // ningún test unitario de cada lado que lo note.
  const p = await nuevoPedido();
  const r = await lic.confirmarPago(p.pedido.id);
  assert.match(r.pedido.licencia, /^MVA1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

  const { verificarLicencia } = await import('../src/store/licencia-firma.js');
  const v = verificarLicencia(r.pedido.licencia);
  assert.equal(v.ok, true, 'el cliente que pagó tiene que poder activar con lo que se le mandó');
  assert.equal(v.datos.e, p.pedido.email, 'la licencia dice a quién se le emitió');
  assert.equal(v.datos.x, null, 'el pago único es perpetuo: no puede vencerse solo');
});

test('la licencia no es adivinable a partir del id del pedido', async () => {
  const p = await nuevoPedido();
  const r = await lic.confirmarPago(p.pedido.id);
  const firma = r.pedido.licencia.split('.')[2];
  assert.ok(!firma.includes(p.pedido.id.replace('ORD-', '')), 'no puede ser el id disfrazado');
});

test('descartar un pendiente lo saca también del índice', async () => {
  const p = await nuevoPedido();
  await lic.descartarPedidoPendiente(p.pedido.id);
  assert.equal(await lic.obtenerPedido(p.pedido.id), null);
  const listados = await lic.listarPedidos();
  assert.ok(!listados.find((x) => x.id === p.pedido.id), 'no puede seguir apareciendo listado');
});

test('validarToken y buscarPedidoPendientePorEmail siguen funcionando', async () => {
  const email = `busca${Math.random().toString(36).slice(2, 8)}@ejemplo.com`;
  const recurrente = await lic.crearPedido({ plan: 'saas', email });
  const encontrado = await lic.buscarPedidoPendientePorEmail(email);
  assert.equal(encontrado?.id, recurrente.pedido.id);

  const pagado = await lic.confirmarPago(recurrente.pedido.id);
  assert.equal((await lic.validarToken(pagado.pedido.token))?.id, recurrente.pedido.id);
});

test('los pedidos del blob viejo se migran solos al formato nuevo', async () => {
  // Simula una instancia que venía con el formato anterior: todo junto en
  // 'mvagendate:pedidos'. Al leer, tiene que quedar accesible igual.
  const viejo = {
    pedidos: {
      'ORD-VIEJO01': {
        id: 'ORD-VIEJO01', plan: 'full', version: 'pc', email: 'viejo@ejemplo.com',
        medio: 'mercadopago', recurrente: false, total_usd: 299, estado: 'pagado',
        creado: '2026-01-01T00:00:00.000Z', licencia: 'MV-FULL-ANTIGUA', token: 'tok-viejo'
      },
      'ORD-VIEJO02': {
        id: 'ORD-VIEJO02', plan: 'saas', version: 'pc', email: 'otro@ejemplo.com',
        medio: 'mercadopago', recurrente: true, total_usd: 15, estado: 'pendiente',
        creado: '2026-01-02T00:00:00.000Z', licencia: null, token: null
      }
    }
  };
  await kvSet('mvagendate:pedidos', JSON.stringify(viejo));

  // Import nuevo para que la migración (una vez por proceso) vuelva a correr.
  const lic2 = await import(`../src/store/licencias.js?migracion=${Math.random()}`);

  const migrado = await lic2.obtenerPedido('ORD-VIEJO01');
  assert.ok(migrado, 'el pedido viejo tiene que seguir existiendo');
  assert.equal(migrado.estado, 'pagado');
  assert.equal(migrado.licencia, 'MV-FULL-ANTIGUA', 'la licencia ya emitida no se toca');

  const ids = await kvSMembers('mvagendate:pedidos:ids');
  assert.ok(ids.includes('ORD-VIEJO01') && ids.includes('ORD-VIEJO02'), 'los dos quedan indexados');
  assert.equal(await kvGet('mvagendate:pedidos'), null, 'el blob viejo se borra tras migrar');

  // Y el pendiente migrado sigue siendo reconciliable por email.
  assert.equal((await lic2.buscarPedidoPendientePorEmail('otro@ejemplo.com'))?.id, 'ORD-VIEJO02');
});
