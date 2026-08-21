// © 2026 Martín Viera. Todos los derechos reservados.

// Test de regresión: un payload XSS que llega por el canal de mensajes
// (widget embebible) tiene que mostrarse como texto, nunca ejecutarse. Usa
// jsdom para correr el HTML/JS real (no una reimplementación de la lógica) —
// así un cambio futuro de textContent a innerHTML lo agarra este test, no un
// usuario en producción.
//
// ANTES ESTE ARCHIVO TAMBIÉN CUBRÍA EL CHAT DE /demo.html. Se sacó esa parte
// porque esa página dejó de tener chat: la demo ya no es pública, ahora es un
// formulario para pedirla y se muestra en vivo (ver store/solicitudes-demo.js).
// El canal en sí sigue cubierto por los tests de agregarMensaje() y del
// widget, que son los dos lugares donde hoy se pinta un mensaje.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = dirname(AQUI);

const MENSAJES_SRC = readFileSync(join(RAIZ, 'public/js/mensajes.js'), 'utf8');
const WIDGET_SRC = readFileSync(join(RAIZ, 'public/widget.js'), 'utf8');

// Payloads clásicos de XSS almacenado/reflejado — el mismo tipo de dato que
// ya se demostró real en /api/cotizar (ver test/seguro.test.js).
const PAYLOADS = [
  '<img src=x onerror="window.__xss=true">',
  '<script>window.__xss=true</script>',
  '"><svg onload="window.__xss=true">',
  "<img src=x onerror='window.__xss=true'>",
];

function sinElementosPeligrosos(contenedor) {
  return contenedor.querySelectorAll('img, script, svg, iframe').length === 0;
}

test('public/js/mensajes.js — agregarMensaje nunca ejecuta un payload, lo muestra como texto', () => {
  for (const payload of PAYLOADS) {
    const dom = new JSDOM('<!doctype html><html><body><div id="cont"></div></body></html>', { runScripts: 'outside-only' });
    dom.window.eval(MENSAJES_SRC);
    const cont = dom.window.document.getElementById('cont');
    const div = dom.window.agregarMensaje(cont, payload, 'msg user');
    assert.equal(div.textContent, payload, 'el texto se preserva tal cual, sin alterarlo');
    assert.ok(sinElementosPeligrosos(cont), `"${payload}" no debería crear ningún elemento vivo`);
    assert.equal(dom.window.__xss, undefined, 'el payload no debe ejecutarse nunca');
  }
});

// --- widget.js: mismo canal, pero el script embebible autocontenido ---
async function correrWidget(payloadUsuario, payloadRespuesta) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only', url: 'https://cliente-del-profesional.test/' });
  const { window } = dom;
  window.fetch = async (url) => {
    if (String(url).includes('/api/chat')) return { ok: true, json: async () => ({ sessionId: 's1', respuesta: payloadRespuesta }) };
    return { ok: false, json: async () => ({}) };
  };
  window.eval(WIDGET_SRC);
  // Abrir el widget (crea el primer mensaje de saludo) y mandar el mensaje.
  window.document.getElementById('mv-burbuja').dispatchEvent(new window.Event('click', { bubbles: true }));
  const input = window.document.getElementById('mv-in');
  input.value = payloadUsuario;
  window.document.getElementById('mv-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  return dom;
}

test('widget.js — el mensaje del visitante y la respuesta del servidor se muestran como texto, nunca ejecutan', async () => {
  for (const payload of PAYLOADS) {
    const dom = await correrWidget(payload, payload);
    const msgs = dom.window.document.getElementById('mv-msgs');
    assert.ok(sinElementosPeligrosos(msgs), `"${payload}" no debe crear elementos vivos en el widget`);
    assert.equal(dom.window.__xss, undefined);
    const textos = [...msgs.children].map((el) => el.textContent);
    assert.ok(textos.includes(payload), 'el mensaje se muestra tal cual, como texto');
  }
});
