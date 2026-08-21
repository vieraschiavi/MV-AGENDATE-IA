// © 2026 Martín Viera. Todos los derechos reservados.

// La demo dejó de ser pública: se pide por formulario y se muestra en vivo.
// Lo que fija este archivo es el candado (que un desconocido NO pueda
// conversar con el agente desde la web) y que ningún lead se pierda.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { registrarSolicitud, listarSolicitudes, marcarSolicitud } from '../src/store/solicitudes-demo.js';

const J = { 'Content-Type': 'application/json' };
const base_datos = { nombre: 'Ana Pérez', email: 'ana@taller.com', pais: 'Uruguay', empresa: 'Taller Pérez' };

test('los cuatro campos obligatorios son el filtro: sin ellos no se registra nada', async () => {
  for (const falta of ['nombre', 'email', 'pais', 'empresa']) {
    const datos = { ...base_datos, [falta]: '' };
    const r = await registrarSolicitud(datos);
    assert.equal(r.ok, false, `sin ${falta} no debería registrar`);
    assert.ok(r.error, 'tiene que decir qué falta, no fallar en silencio');
  }
  assert.equal((await registrarSolicitud({ ...base_datos, email: 'no-es-un-email' })).ok, false);
});

test('insistir NO duplica el lead: se actualiza y se cuenta que volvió a pedir', async () => {
  const uno = await registrarSolicitud({ ...base_datos, email: 'repite@taller.com' });
  assert.equal(uno.ok, true);
  assert.equal(uno.repetida, false);
  assert.equal(uno.solicitud.pedidos, 1);

  const dos = await registrarSolicitud({ ...base_datos, email: 'repite@taller.com', empresa: 'Taller Nuevo' });
  assert.equal(dos.repetida, true);
  assert.equal(dos.solicitud.pedidos, 2, 'volver a pedir es señal de interés: se anota');
  assert.equal(dos.solicitud.empresa, 'Taller Nuevo', 'se queda con el dato más nuevo');

  const lista = await listarSolicitudes();
  assert.equal(lista.filter((s) => s.email === 'repite@taller.com').length, 1, 'una PERSONA, una fila');
});

test('los campos se recortan: un bot no puede llenar Redis con un solo POST', async () => {
  const r = await registrarSolicitud({ ...base_datos, email: 'largo@taller.com', empresa: 'x'.repeat(5000) });
  assert.equal(r.ok, true);
  assert.ok(r.solicitud.empresa.length <= 160, 'el campo tiene que quedar recortado');
});

test('marcarSolicitud sólo acepta estados conocidos', async () => {
  await registrarSolicitud({ ...base_datos, email: 'estado@taller.com' });
  assert.equal((await marcarSolicitud('estado@taller.com', 'mostrada')).ok, true);
  assert.equal((await marcarSolicitud('estado@taller.com', 'inventado')).ok, false);
  assert.equal((await marcarSolicitud('no-existe@taller.com', 'mostrada')).ok, false);
});

let base, servidor;
before(async () => {
  process.env.MV_ESCRITORIO = '1'; // para poder cargar la clave admin la primera vez
  process.env.VERCEL = '1';        // que importar server.js no levante su propio servidor
  const { default: app } = await import('../src/server.js');
  servidor = app.listen(0);
  await new Promise((listo) => servidor.once('listening', listo));
  base = `http://127.0.0.1:${servidor.address().port}`;
  await fetch(`${base}/api/config`, { method: 'POST', headers: J, body: JSON.stringify({ adminKey: 'clave-dueño' }) });
});
after(async () => {
  process.env.MV_ESCRITORIO = '1';
  await fetch(`${base}/api/config`, { method: 'POST', headers: J, body: JSON.stringify({ adminKey: '', demoPublica: '' }) });
  servidor?.close();
  delete process.env.VERCEL;
  delete process.env.MV_ESCRITORIO;
});

test('EL CANDADO: un visitante anónimo del sitio NO puede conversar con el agente', async () => {
  // Este es el punto de todo el cambio. Antes cualquiera entraba a /demo.html y
  // le sacaba al agente cómo cotiza y cómo agenda, que es el trabajo de
  // ingeniería del producto — y encima cada charla se le facturaba al dueño.
  delete process.env.MV_ESCRITORIO; // sitio hosteado, no el programa instalado
  const r = await fetch(`${base}/api/chat`, { method: 'POST', headers: J, body: JSON.stringify({ mensaje: 'hola' }) });
  assert.equal(r.status, 403);
  const d = await r.json();
  assert.equal(d.demoBajoPedido, true);
  assert.match(d.error, /demo/i, 'el mensaje tiene que explicar cómo pedirla, no ser un 403 mudo');
  process.env.MV_ESCRITORIO = '1';
});

test('el dueño con su clave SÍ pasa el candado (si no, /config.html no podría probar el agente)', async () => {
  delete process.env.MV_ESCRITORIO;
  const r = await fetch(`${base}/api/chat`, { method: 'POST', headers: { ...J, 'X-Admin-Key': 'clave-dueño' },
    body: JSON.stringify({ mensaje: 'hola' }) });
  const d = await r.json().catch(() => ({}));
  // No se afirma que responda 200 (eso depende de si hay API key de IA cargada),
  // sólo que NO lo frenó el candado de la demo.
  assert.notEqual(d.demoBajoPedido, true, 'el dueño no puede quedar afuera de su propio agente');
  process.env.MV_ESCRITORIO = '1';
});

test('DEMO_PUBLICA=1 reabre el canal, para quien embebe widget.js en su propia web', async () => {
  // widget.js no manda ninguna credencial: sin este escape hatch, cerrar la
  // demo le rompería el chat a un profesional que hostea su propio servidor.
  delete process.env.MV_ESCRITORIO;
  await fetch(`${base}/api/config`, { method: 'POST', headers: { ...J, 'X-Admin-Key': 'clave-dueño' },
    body: JSON.stringify({ demoPublica: '1' }) });
  try {
    const r = await fetch(`${base}/api/chat`, { method: 'POST', headers: J, body: JSON.stringify({ mensaje: 'hola' }) });
    const d = await r.json().catch(() => ({}));
    assert.notEqual(d.demoBajoPedido, true, 'con DEMO_PUBLICA=1 el candado no debe aplicar');
  } finally {
    await fetch(`${base}/api/config`, { method: 'POST', headers: { ...J, 'X-Admin-Key': 'clave-dueño' },
      body: JSON.stringify({ demoPublica: '' }) });
    process.env.MV_ESCRITORIO = '1';
  }
});

test('POST /api/demo/solicitar guarda el lead y es público (no pide credencial)', async () => {
  delete process.env.MV_ESCRITORIO;
  const r = await fetch(`${base}/api/demo/solicitar`, { method: 'POST', headers: J,
    body: JSON.stringify({ nombre: 'Juan Ruiz', email: 'juan@obra.com', pais: 'Chile', empresa: 'Obra SRL' }) });
  assert.equal(r.status, 200, 'el formulario tiene que andar para cualquiera: es la puerta de entrada');
  assert.equal((await r.json()).ok, true);

  const lista = await listarSolicitudes();
  assert.ok(lista.some((s) => s.email === 'juan@obra.com'), 'el lead se guarda aunque el email no esté configurado');
  process.env.MV_ESCRITORIO = '1';
});

test('un pedido inválido responde 400 y no ensucia la lista', async () => {
  delete process.env.MV_ESCRITORIO;
  const antes = (await listarSolicitudes()).length;
  const r = await fetch(`${base}/api/demo/solicitar`, { method: 'POST', headers: J,
    body: JSON.stringify({ nombre: 'X', email: 'roto', pais: '', empresa: '' }) });
  assert.equal(r.status, 400);
  await r.arrayBuffer();
  assert.equal((await listarSolicitudes()).length, antes);
  process.env.MV_ESCRITORIO = '1';
});

test('la lista de leads es privada: GET /api/demo/solicitudes exige clave', async () => {
  delete process.env.MV_ESCRITORIO;
  const sin = await fetch(`${base}/api/demo/solicitudes`);
  assert.equal(sin.status, 401, 'los datos de quién pidió la demo no pueden quedar públicos');
  await sin.arrayBuffer();
  const con = await fetch(`${base}/api/demo/solicitudes`, { headers: { 'X-Admin-Key': 'clave-dueño' } });
  assert.equal(con.status, 200);
  assert.ok(Array.isArray(await con.json()));
  process.env.MV_ESCRITORIO = '1';
});
