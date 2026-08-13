// © 2026 Martín Viera. Todos los derechos reservados.

// Tests del asistente de ayuda (dudas sobre el programa) — node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { responderAyuda, TEMAS_AYUDA } from '../src/ai/ayuda.js';

test('la base de conocimiento cubre los temas centrales del producto', () => {
  const titulos = TEMAS_AYUDA.map((t) => t.titulo.toLowerCase()).join(' | ');
  for (const esperado of ['primeros pasos', 'cotizador', 'agenda', 'whatsapp', 'chatvoice', 'retraso', 'dashboards', 'clientes', 'profesionales', 'planes', 'android', 'seguridad']) {
    assert.ok(titulos.includes(esperado), `falta el tema "${esperado}"`);
  }
  for (const t of TEMAS_AYUDA) {
    assert.ok(t.claves instanceof RegExp, `claves de "${t.titulo}" debe ser RegExp`);
    assert.ok(t.texto.length > 80, `el texto de "${t.titulo}" es demasiado corto para ser útil`);
  }
});

// La guía es para el profesional que compró o está probando el programa, no
// para quien lo instala/despliega — no debe asumir vocabulario técnico.
test('la base de conocimiento no expone jerga técnica de desarrollador', () => {
  const JERGA = /\.(html|json|js|sh)\b|webhook|X-Admin-Key|vercel|redis|npm run|src\/|api\/|cron ?job/i;
  for (const t of TEMAS_AYUDA) {
    assert.ok(!JERGA.test(t.texto), `"${t.titulo}" tiene jerga técnica: "${t.texto}"`);
  }
});

test('sin API key responde desde la guía local según palabras clave', async () => {
  const r = await responderAyuda('test:1', '¿Cómo conecto WhatsApp?');
  assert.match(r, /WhatsApp Business/);
  const r2 = await responderAyuda('test:1', '¿Cuánto sale el plan full?');
  assert.match(r2, /USD 299/);
});

test('sin coincidencia de tema devuelve el índice de temas disponibles (nunca en blanco)', async () => {
  const r = await responderAyuda('test:2', 'xyzzy pregunta sin relación');
  assert.ok(r.length > 50);
  assert.match(r, /primeros pasos/i);
});
