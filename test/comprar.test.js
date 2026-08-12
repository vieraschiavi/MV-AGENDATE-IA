// La ruta de compra, contra el servidor de verdad.
// El caso que motiva el archivo: con MercadoPago sin configurar, /api/comprar
// devolvía 503 PERO ya había guardado el pedido. Cada clic en "Comprar" dejaba
// un pendiente que nadie iba a pagar, y esos pendientes ensucian /api/licencias
// y la reconciliación por email del webhook de suscripciones, que elige el
// pendiente MÁS RECIENTE de ese email.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

let hijo = null;
let base = '';

before(async () => {
  // Sin MERCADOPAGO_TOKEN a propósito: es el estado que reproduce el bug.
  const env = { ...process.env, PORT: '0', MV_ESCRITORIO: '1', MV_DATOS_DIR: mkdtempSync(join(tmpdir(), 'mv-test-comprar-')), MV_ANCLA_DIR: mkdtempSync(join(tmpdir(), 'mv-test-ancla-srv-')) };
  delete env.MERCADOPAGO_TOKEN;
  hijo = spawn(process.execPath, [join(RAIZ, 'src', 'server.js')], { cwd: RAIZ, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let salida = '';
  hijo.stdout.on('data', (c) => { salida += c.toString('utf8'); });
  hijo.stderr.on('data', (c) => { salida += c.toString('utf8'); });
  // 60 s, no 15: `node --test` corre los archivos en paralelo y en una máquina
  // cargada (CI compartido) el arranque del servidor puede pasarse largo de 15 s.
  // Con el margen corto, este before fallaba de vez en cuando y se llevaba
  // puestos los dos tests del archivo — 3 fallos intermitentes sin causa visible.
  for (let i = 0; i < 300 && !base; i++) {
    const m = /MV_PUERTO=(\d+)/.exec(salida);
    if (m) base = `http://localhost:${m[1]}`; else await esperar(200);
  }
  assert.ok(base, 'el servidor de prueba no anunció su puerto en 60s:\n' + salida);
});

after(() => { hijo?.kill(); });

test('sin MercadoPago configurado, comprar avisa y NO deja pedidos huérfanos', async () => {
  for (let i = 1; i <= 3; i++) {
    const r = await fetch(`${base}/api/comprar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'full', version: 'pc', email: `cliente${i}@ejemplo.com` })
    });
    assert.equal(r.status, 503, 'tiene que avisar que el cobro no está activo');
    const d = await r.json();
    assert.match(d.error, /MercadoPago/, 'el error tiene que decir qué falta');
  }
  const pedidos = await (await fetch(`${base}/api/licencias`)).json();
  assert.equal(pedidos.length, 0, 'un intento que no se puede cobrar no debe persistir nada');
});

test('el catálogo de planes se sirve con sus precios y avisa si el cobro está activo', async () => {
  const d = await (await fetch(`${base}/api/planes`)).json();
  assert.equal(d.mercadopago, false, 'sin token, la web tiene que saber que no puede cobrar');
  assert.equal(d.planes.basico.precio, 129);
  assert.equal(d.planes.full.precio, 299);
  assert.deepEqual(d.medios, ['mercadopago']);
});
