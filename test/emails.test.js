// Tests de los emails transaccionales — node --test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { enviarEmail, emailsActivos, PLANTILLAS } from '../src/store/emails.js';
import { consumir, acreditar, estadoCreditos } from '../src/store/creditos.js';
import { setConfig } from '../src/store/config.js';

after(() => setConfig({ resendApiKey: '', emailFrom: '', creditosBono: '' }));

test('sin API key configurada, enviar es un no-op que no rompe', async () => {
  setConfig({ resendApiKey: '' });
  assert.equal(emailsActivos(), false);
  const r = await enviarEmail({ para: 'x@x.com', asunto: 'test', html: '<p>hola</p>' });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'sin_config');
});

test('las plantillas renderizan en español y portugués con sus datos', () => {
  for (const [nombre, tpl] of Object.entries(PLANTILLAS)) {
    for (const idi of ['es', 'pt']) {
      const { asunto, html } = tpl(idi, {
        nombre: 'Ana', url: 'https://x', dias: 2, plan: 'full',
        licencia: 'MV-FULL-ABC', urlDescarga: 'https://x/d', monto: 10, saldo: 12.5,
      });
      assert.ok(asunto.length > 5, `${nombre}/${idi} tiene asunto`);
      assert.ok(html.includes('MV'), `${nombre}/${idi} tiene marco`);
      assert.ok(!html.includes('undefined'), `${nombre}/${idi} sin undefined`);
    }
  }
  // Verificación puntual de idioma
  assert.match(PLANTILLAS.bienvenida('pt', { nombre: 'A', url: 'u' }).asunto, /Bem-vindo/);
  assert.match(PLANTILLAS.trialPorVencer('es', { dias: 1, url: 'u' }).asunto, /mañana/);
});

test('consumir avisa UNA sola vez al cruzar el umbral de saldo bajo', async () => {
  setConfig({ creditosSaas: '', creditosBono: '3', creditosMargen: '2.5', costoInputMusd: '15', costoOutputMusd: '75' });
  const id = `c-${Date.now()}-umbral`;
  await estadoCreditos(id); // saldo 3
  // Gasto chico: sigue arriba de 1 → no cruza. (10k in + 2k out ≈ 0.75 con margen)
  const g1 = await consumir(id, { input_tokens: 10_000, output_tokens: 2_000 });
  assert.equal(g1.cruzoUmbral, false, 'todavía arriba del umbral');
  // Otro gasto igual: baja de ~2.25 a ~1.5 → sigue arriba.
  const g2 = await consumir(id, { input_tokens: 10_000, output_tokens: 2_000 });
  assert.equal(g2.cruzoUmbral, false);
  // Tercero: cruza 1 → avisa.
  const g3 = await consumir(id, { input_tokens: 10_000, output_tokens: 2_000 });
  assert.equal(g3.cruzoUmbral, true, 'cruce detectado');
  // Cuarto: ya está abajo → NO vuelve a avisar.
  const g4 = await consumir(id, { input_tokens: 10_000, output_tokens: 2_000 });
  assert.equal(g4.cruzoUmbral, false, 'no repite el aviso');
  // Recarga y nuevo cruce → puede avisar otra vez (comportamiento deseado).
  await acreditar(id, 10);
  const g5 = await consumir(id, { input_tokens: 500_000, output_tokens: 100_000 });
  assert.equal(g5.cruzoUmbral, true, 'tras recargar, un nuevo cruce vuelve a avisar');
  setConfig({ creditosSaas: '', creditosMargen: '', creditosBono: '' });
});
