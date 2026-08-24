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

// El teléfono es BYO: la cuenta de Twilio es del cliente, y el número y los
// minutos los paga él. Verificado en el código: config.get() superpone los
// overrides de cada cuenta y las claves de Twilio NO están en NUNCA_OVERRIDE,
// así que cuando el cliente carga sus credenciales, hasta la compra del número
// va contra SU cuenta. La guía tiene que decirlo, porque si el cliente cree que
// el número se lo damos nosotros, el reclamo llega igual.
test('la guía del teléfono deja claro que la cuenta y el gasto son del cliente', async () => {
  const tema = TEMAS_AYUDA.find((t) => /twilio/i.test(t.titulo));
  assert.ok(tema, 'desapareció el tema de conexión del teléfono');
  assert.match(tema.texto, /tuy[ao]|vos/i, 'no dice que la cuenta es del cliente');
  assert.match(tema.texto, /pag[aá]s|pag[aá]/i, 'no dice quién paga el número y los minutos');
});

// Los dos tropiezos que hacen que un cliente abandone el alta, y que no son
// técnicos: el mensaje grabado del modo de prueba (arruina la primera llamada
// delante de un cliente) y la documentación que piden en UY/LATAM para un
// número local (puede demorar días). Si la guía no los anticipa, el cliente
// cree que el programa está roto.
test('la guía del teléfono anticipa el modo de prueba y el trámite del número local', async () => {
  const tema = TEMAS_AYUDA.find((t) => /twilio/i.test(t.titulo));
  assert.match(tema.texto, /modo de prueba/i, 'no avisa del modo de prueba');
  // Nombrar el modo de prueba sin decir QUÉ pasa no sirve: el cliente lo saltea.
  // Lo que lo hace actuar es enterarse de que Twilio le mete un mensaje grabado
  // antes de cada llamada, delante de su propio cliente.
  assert.match(tema.texto, /grabad|mensaje/i, 'avisa del modo de prueba pero no dice que mete un mensaje grabado');
  assert.match(tema.texto, /documentaci[oó]n/i, 'no avisa del trámite para el número local');
  assert.match(tema.texto, /Uruguay/i, 'no menciona el caso de Uruguay, que es el mercado principal');
});

// Se pregunta "cómo conecto el teléfono", no "cómo configuro Twilio": la guía
// tiene que aparecer con las palabras que usa un cliente real.
test('la guía del teléfono aparece preguntando como pregunta un cliente', async () => {
  for (const pregunta of ['¿cómo compro un número de teléfono?', 'quiero contratar el teléfono', '¿qué es el Account SID?']) {
    const r = await responderAyuda('test:tw', pregunta);
    assert.match(r, /Twilio/i, 'no encontró la guía preguntando: ' + pregunta);
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
