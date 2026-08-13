// © 2026 Martín Viera. Todos los derechos reservados.
// Tests del módulo de pedidos/pagos/licencias (el que toca dinero real: precio,
// emisión de licencia y token de descarga) — node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLANES, crearPedido, confirmarPago, validarToken, obtenerPedido,
  buscarPedidoPendientePorEmail, firmarDescarga, verificarDescarga, archivoDeVersion,
} from '../src/store/licencias.js';

test('crearPedido valida plan y email antes de cobrar nada', async () => {
  const sinPlan = await crearPedido({ plan: 'inventado', email: 'a@b.com' });
  assert.equal(sinPlan.ok, false);
  const sinEmail = await crearPedido({ plan: 'basico' });
  assert.equal(sinEmail.ok, false);
});

test('crearPedido usa el precio del catálogo, nunca uno inventado', async () => {
  const r = await crearPedido({ plan: 'basico', email: 'cliente@test.com' });
  assert.equal(r.ok, true);
  assert.equal(r.pedido.total_usd, PLANES.basico.precio);
  assert.equal(r.pedido.estado, 'pendiente');
  assert.equal(r.pedido.medio, 'mercadopago');
  assert.equal(r.pedido.licencia, null, 'no hay licencia hasta que se confirme el pago');
});

test('el plan SaaS siempre es recurrente aunque no se pida explícitamente', async () => {
  const r = await crearPedido({ plan: 'saas', email: 'cliente@test.com' });
  assert.equal(r.pedido.recurrente, true);
});

test('confirmarPago emite licencia y token solo después del pago, es idempotente', async () => {
  const { pedido } = await crearPedido({ plan: 'full', email: 'full@test.com' });
  assert.equal((await obtenerPedido(pedido.id)).estado, 'pendiente');

  const r1 = await confirmarPago(pedido.id);
  assert.equal(r1.ok, true);
  assert.ok(r1.pedido.licencia.startsWith('MV-FULL-'));
  assert.ok(r1.pedido.token, 'confirmar el pago emite un token de descarga');
  assert.equal(r1.pedido.estado, 'pagado');

  // Confirmar dos veces (ej. reintento del webhook) no debe re-emitir ni romper nada.
  const r2 = await confirmarPago(pedido.id);
  assert.equal(r2.ok, true);
  assert.equal(r2.yaEstaba, true);
  assert.equal(r2.pedido.licencia, r1.pedido.licencia, 'no se emite una licencia nueva en el reintento');
  assert.equal(r2.pedido.token, r1.pedido.token);
});

test('confirmarPago sobre un pedido inexistente no inventa nada', async () => {
  const r = await confirmarPago('ORD-NO-EXISTE');
  assert.equal(r.ok, false);
});

test('validarToken solo reconoce tokens de pedidos realmente pagados', async () => {
  const { pedido } = await crearPedido({ plan: 'basico', email: 'validar@test.com' });
  assert.equal(await validarToken('token-inventado-cualquiera'), null, 'sin pagar, ningún token es válido');

  const { pedido: pagado } = await confirmarPago(pedido.id);
  const encontrado = await validarToken(pagado.token);
  assert.ok(encontrado, 'el token real de un pedido pagado sí valida');
  assert.equal(encontrado.id, pedido.id);
});

test('buscarPedidoPendientePorEmail solo devuelve pendientes recurrentes de MercadoPago de ese email/plan', async () => {
  const email = 'recurrente-' + Date.now() + '@test.com';
  const { pedido: a } = await crearPedido({ plan: 'saas', email });
  const { pedido: b } = await crearPedido({ plan: 'saas', email });
  // Un pedido no-recurrente del mismo email no debe interferir.
  await crearPedido({ plan: 'basico', email });
  // Ni uno recurrente de otro email.
  await crearPedido({ plan: 'saas', email: 'otro-' + email });

  const idsValidos = new Set([a.id, b.id]);
  const primero = await buscarPedidoPendientePorEmail(email, 'saas');
  assert.ok(idsValidos.has(primero.id), 'solo puede devolver uno de los dos pendientes de ese email');

  // Al pagar el que encontró, el buscador tiene que caer en el otro (el único
  // que sigue pendiente) — sin asumir cuál de los dos "ganó" el desempate.
  await confirmarPago(primero.id);
  const restante = [...idsValidos].find((id) => id !== primero.id);
  const segundo = await buscarPedidoPendientePorEmail(email, 'saas');
  assert.equal(segundo.id, restante, 'al pagar uno, el buscador cae al que sigue pendiente');

  // Al pagar los dos, no queda ningún pendiente para ese email/plan.
  await confirmarPago(restante);
  assert.equal(await buscarPedidoPendientePorEmail(email, 'saas'), null);
});

test('firmarDescarga / verificarDescarga: el token es autocontenido y no se puede falsificar', () => {
  const token = firmarDescarga('pc', 30);
  const v = verificarDescarga(token);
  assert.ok(v);
  assert.equal(v.version, 'pc');

  // Adulterar la firma invalida el token.
  const [cuerpo, firma] = token.split('.');
  const firmaAdulterada = firma.slice(0, -1) + (firma.at(-1) === 'a' ? 'b' : 'a');
  assert.equal(verificarDescarga(`${cuerpo}.${firmaAdulterada}`), null);

  // Formato roto o vacío nunca revienta, solo devuelve null.
  assert.equal(verificarDescarga(''), null);
  assert.equal(verificarDescarga('sin-punto'), null);
  assert.equal(verificarDescarga(undefined), null);
});

test('verificarDescarga rechaza un token vencido', () => {
  const token = firmarDescarga('apk', -1); // "vencido" desde ya (exp en el pasado)
  assert.equal(verificarDescarga(token), null);
});

test('archivoDeVersion: pc/pc_exe/ios/todas y cualquier cosa desconocida bajan el instalador de Windows; apk baja la APK', () => {
  // Este mapeo es el que causó el bug real (ver PR #10/#11): la compra
  // registraba version:'pc' pero el archivo servido no coincidía con el
  // instalador NSIS real. Se fija acá el contrato explícito.
  assert.equal(archivoDeVersion('pc'), 'MV-Agendate-IA-Setup.exe');
  assert.equal(archivoDeVersion('pc_exe'), 'MV-Agendate-IA-Setup.exe');
  assert.equal(archivoDeVersion('ios'), 'MV-Agendate-IA-Setup.exe');
  assert.equal(archivoDeVersion('todas'), 'MV-Agendate-IA-Setup.exe');
  assert.equal(archivoDeVersion('apk'), 'MV-Agendate-IA.apk');
  assert.equal(archivoDeVersion('version-inexistente'), 'MV-Agendate-IA-Setup.exe', 'default seguro: nunca deja sin archivo');
});
