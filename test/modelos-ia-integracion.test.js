// El selector de modelos contra el SERVIDOR REAL, no contra las funciones sueltas.
//
// Existe además de test/modelos-ia.test.js porque la lección anterior fue esa:
// unos tests unitarios sobre funciones puras daban verde mientras la
// funcionalidad no se activaba nunca en la ruta. Acá se levanta el server, se
// pega por HTTP y se comprueba el circuito entero: elegir, guardar, persistir
// y que el modelo elegido sea el que efectivamente se va a usar.
//
// El fetch a los proveedores está stubeado (no se sale a internet); todo lo
// demás —rutas, persistencia, contexto de cuenta— es de verdad.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let base, servidor, fetchOriginal;
const J = { 'Content-Type': 'application/json' };

const leerModelos = async () => (await fetch(`${base}/api/ia/modelos`)).json();
const proveedor = (d, id) => d.proveedores.find((p) => p.id === id);
const guardar = (patch) => fetch(`${base}/api/config`, { method: 'POST', headers: J, body: JSON.stringify(patch) });

before(async () => {
  process.env.MV_DATOS_DIR = mkdtempSync(join(tmpdir(), 'mv-modelos-e2e-'));
  process.env.MV_ESCRITORIO = '1';   // sin clave de admin ni rate limit
  process.env.VERCEL = '1';          // que no abra su propio listener
  delete process.env.MODELO_CLAUDE;

  const { default: app } = await import('../src/server.js');
  servidor = app.listen(0);
  await new Promise((listo) => servidor.once('listening', listo));
  base = `http://127.0.0.1:${servidor.address().port}`;

  // Las llamadas a los proveedores se responden acá; las nuestras pasan derecho.
  fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (u.startsWith(base)) return fetchOriginal(url, opts);
    if (u.includes('api.anthropic.com')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ data: [
        { id: 'claude-opus-5', display_name: 'Claude Opus 5' },
        { id: 'claude-sonnet-5', display_name: 'Claude Sonnet 5' },
        { id: 'claude-haiku-4-5-20251001', display_name: 'Claude Haiku 4.5' },
      ] }) };
    }
    return { ok: false, status: 404, text: async () => '{"error":{"message":"sin stub"}}' };
  };
});

after(() => {
  globalThis.fetch = fetchOriginal;
  servidor?.close();
  delete process.env.VERCEL;
});

test('lista todos los proveedores con su modelo por defecto', async () => {
  const d = await leerModelos();
  assert.equal(d.proveedores.length, 6);
  for (const id of ['claude', 'openai', 'gemini', 'grok', 'copilot', 'compatible']) {
    assert.ok(proveedor(d, id), `falta el proveedor ${id}`);
  }
  assert.equal(proveedor(d, 'claude').enUso, 'claude-sonnet-5');
});

test('actualizar sin ninguna API key cargada explica qué falta', async () => {
  const r = await fetch(`${base}/api/ia/modelos/actualizar`, { method: 'POST', headers: J, body: '{}' });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /API key/i);
});

test('el botón Actualizar trae los modelos y quedan cacheados', async () => {
  await guardar({ anthropicApiKey: 'sk-ant-prueba' });

  const r = await fetch(`${base}/api/ia/modelos/actualizar`, {
    method: 'POST', headers: J, body: JSON.stringify({ proveedor: 'claude' })
  });
  const d = await r.json();
  assert.equal(d.ok, true);
  assert.equal(d.proveedores.claude.modelos.length, 3);

  // Y en la siguiente carga del panel ya están, sin volver a consultar.
  const guardado = proveedor(await leerModelos(), 'claude');
  assert.equal(guardado.modelos.length, 3);
  assert.ok(guardado.actualizado, 'queda fechado para poder mostrar cuándo se consultó');
});

test('el modelo elegido es el que se va a usar de verdad', async () => {
  await guardar({ modeloClaude: 'claude-haiku-4-5-20251001' });
  const p = proveedor(await leerModelos(), 'claude');
  assert.equal(p.modeloElegido, 'claude-haiku-4-5-20251001');
  assert.equal(p.enUso, 'claude-haiku-4-5-20251001', 'si no llega hasta acá, el ahorro no existe');
});

test('volver a "Automático" deshace la elección', async () => {
  // Vacío tiene que poder guardarse: si no, la primera elección queda pegada
  // para siempre y no hay forma de volver al default desde el panel.
  await guardar({ modeloClaude: '' });
  const p = proveedor(await leerModelos(), 'claude');
  assert.equal(p.modeloElegido, '');
  assert.equal(p.enUso, 'claude-sonnet-5');
});

test('elegir modelo en un proveedor no pisa el del otro', async () => {
  await guardar({ modeloClaude: 'claude-haiku-4-5-20251001', modeloOpenai: 'gpt-4o-mini' });
  const d = await leerModelos();
  assert.equal(proveedor(d, 'claude').enUso, 'claude-haiku-4-5-20251001');
  assert.equal(proveedor(d, 'openai').enUso, 'gpt-4o-mini');
  assert.equal(proveedor(d, 'gemini').enUso, 'gemini-1.5-flash');
});

test('la respuesta nunca incluye la API key', async () => {
  const crudo = JSON.stringify(await leerModelos());
  assert.ok(!crudo.includes('sk-ant-prueba'), 'la clave no puede viajar al navegador');
  assert.equal(proveedor(await leerModelos(), 'claude').tieneClave, true, 'pero sí que hay una cargada');
});

test('un proveedor que responde error no rompe la actualización', async () => {
  await guardar({ grokApiKey: 'xai-invalida' });
  const r = await fetch(`${base}/api/ia/modelos/actualizar`, {
    method: 'POST', headers: J, body: JSON.stringify({ proveedor: 'grok' })
  });
  const d = await r.json();
  assert.equal(d.proveedores.grok.ok, false);
  assert.ok(d.proveedores.grok.error, 'tiene que decir qué pasó');

  // Y lo que ya estaba cacheado de Claude sigue intacto.
  assert.equal(proveedor(await leerModelos(), 'claude').modelos.length, 3);
});
