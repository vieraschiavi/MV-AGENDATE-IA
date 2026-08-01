// Test de regresión: un payload XSS que llega por el canal de mensajes (chat
// de la demo, widget embebible) tiene que mostrarse como texto, nunca
// ejecutarse. Usa jsdom para correr el HTML/JS real de las páginas (no una
// reimplementación de la lógica) — así un cambio futuro de textContent a
// innerHTML en cualquiera de los dos archivos lo agarra este test, no un
// usuario en producción.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = dirname(AQUI);

const SEGURO_SRC = readFileSync(join(RAIZ, 'public/js/seguro.js'), 'utf8');
const MENSAJES_SRC = readFileSync(join(RAIZ, 'public/js/mensajes.js'), 'utf8');
const DEMO_HTML = readFileSync(join(RAIZ, 'public/demo.html'), 'utf8');
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

// --- demo.html: flujo real de chat (mensaje del usuario + respuesta que
// devuelve /api/chat, exactamente el vector real que se encontró en
// /api/cotizar con d.trabajo/d.oficio) ---
function extraerScriptPrincipal(html) {
  const inicio = html.indexOf('<script src="/js/mensajes.js"></script>');
  const desdeScript = html.indexOf('<script>', inicio);
  const cierre = html.indexOf('</script>', desdeScript);
  return html.slice(desdeScript + '<script>'.length, cierre);
}

async function correrChatDemo(payloadUsuario, payloadRespuesta) {
  const dom = new JSDOM(DEMO_HTML, { runScripts: 'outside-only', url: 'https://mv.test/demo.html' });
  const { window } = dom;
  window.fetch = async (url) => {
    if (String(url).includes('/api/oficios')) return { ok: true, json: async () => [{ clave: 'electricista', nombre: 'Electricista', trabajos: [{ clave: 'diagnostico', nombre: 'Diagnóstico' }] }] };
    if (String(url).includes('/api/chat')) return { ok: true, json: async () => ({ sessionId: 's1', respuesta: payloadRespuesta }) };
    return { ok: false, json: async () => ({}) };
  };
  window.eval(SEGURO_SRC);
  window.eval(MENSAJES_SRC);
  window.eval(extraerScriptPrincipal(DEMO_HTML));

  const entrada = window.document.getElementById('entrada');
  const form = window.document.getElementById('formChat');
  entrada.value = payloadUsuario;
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

  // El handler del submit es async (espera el fetch mockeado) — flushear microtasks.
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  return dom;
}

test('demo.html — un payload XSS escrito por el visitante se muestra como texto en #mensajes', async () => {
  for (const payload of PAYLOADS) {
    const dom = await correrChatDemo(payload, 'respuesta normal del asistente');
    const mensajes = dom.window.document.getElementById('mensajes');
    assert.ok(sinElementosPeligrosos(mensajes), `mensaje del usuario "${payload}" no debe crear elementos vivos`);
    assert.equal(dom.window.__xss, undefined);
    const textos = [...mensajes.children].map((el) => el.textContent);
    assert.ok(textos.includes(payload), 'el mensaje del usuario se muestra tal cual, como texto');
  }
});

test('demo.html — un payload XSS que devuelve /api/chat (ej. eco de la IA) también se muestra como texto', async () => {
  for (const payload of PAYLOADS) {
    const dom = await correrChatDemo('hola', payload);
    const mensajes = dom.window.document.getElementById('mensajes');
    assert.ok(sinElementosPeligrosos(mensajes), `respuesta "${payload}" no debe crear elementos vivos`);
    assert.equal(dom.window.__xss, undefined);
    const textos = [...mensajes.children].map((el) => el.textContent);
    assert.ok(textos.includes(payload), 'la respuesta del servidor se muestra tal cual, como texto');
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
