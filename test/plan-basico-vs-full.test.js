// © 2026 Martín Viera. Todos los derechos reservados.

// El plan que se pagó tiene que cambiar lo que el programa hace.
//
// EL AGUJERO QUE ESTOS TESTS FIJAN: la licencia firmada lleva el plan adentro
// (payload `p`) y estadoPrueba() lo exponía, pero NADA lo miraba. Quien pagaba
// el Básico (US$ 129, "sin IA") recibía el mismo producto que quien pagaba el
// Full (US$ 299): chatbot y ChatVoice le andaban igual. La diferencia entre los
// planes existía sólo en la página de precios.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _fijarClavePublica } from '../src/store/licencia-firma.js';
import { setConfig } from '../src/store/config.js';
import { incluyeAgenteIA, planLicenciado } from '../src/store/plan.js';
import { PLANES } from '../src/store/licencias.js';

// Par propio: se firma como firmaría el servidor de ventas, y se fija la
// pública para que la copia "instalada" de este test la pueda verificar.
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const PUB_B64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

/** Emite una licencia MVA1 firmada, igual que licenciaDePedido() en el server. */
function licenciaDe(plan, { vence = null } = {}) {
  const payload = Buffer.from(JSON.stringify({
    n: 'Cliente Test', e: 'cliente@test.com', p: plan, x: vence, i: '2026-01-01', o: 'ORD-TEST'
  }), 'utf8');
  const firma = sign(null, payload, privateKey);
  return `MVA1.${payload.toString('base64url')}.${firma.toString('base64url')}`;
}

let pubOriginal;
before(() => {
  // Aislar el ancla de prueba: si no, estos tests escriben en el perfil real.
  process.env.MV_ANCLA_DIR = mkdtempSync(join(tmpdir(), 'mv-plan-ancla-'));
  delete process.env.VERCEL; // simular la copia INSTALADA, no el host
  pubOriginal = _fijarClavePublica(PUB_B64);
});
after(() => {
  _fijarClavePublica(pubOriginal);
  setConfig({ licenciaLocal: '' });
});

test('el catálogo declara que Básico NO tiene IA y Full SÍ (la fuente de verdad del gate)', () => {
  assert.equal(PLANES.basico.ia, false);
  assert.equal(PLANES.full.ia, true);
});

test('LICENCIA BÁSICO: no incluye el agente con IA — es lo que separa los US$ 129 de los US$ 299', () => {
  setConfig({ licenciaLocal: licenciaDe('basico') });
  assert.equal(planLicenciado(), 'basico');
  assert.equal(incluyeAgenteIA(), false,
    'con licencia Básico el chatbot/ChatVoice con IA NO puede quedar habilitado');
});

test('LICENCIA FULL: sí incluye el agente con IA', () => {
  setConfig({ licenciaLocal: licenciaDe('full') });
  assert.equal(planLicenciado(), 'full');
  assert.equal(incluyeAgenteIA(), true);
});

test('PRUEBA en curso: corre TODO, como se promete en instalar.html ("7 días full")', () => {
  setConfig({ licenciaLocal: '' });
  assert.equal(planLicenciado(), '', 'sin licencia no hay plan');
  assert.equal(incluyeAgenteIA(), true,
    'recortar la IA durante la prueba sería cambiarle el trato al que está probando');
});

test('licencia SIN plan adentro (las viejas): se toma como completa, no se le saca nada al que ya compró', () => {
  const payload = Buffer.from(JSON.stringify({
    n: 'Cliente Viejo', e: 'viejo@test.com', x: null, o: 'ORD-VIEJO'   // sin `p`
  }), 'utf8');
  const firma = sign(null, payload, privateKey);
  setConfig({ licenciaLocal: `MVA1.${payload.toString('base64url')}.${firma.toString('base64url')}` });
  assert.equal(incluyeAgenteIA(), true);
});

test('plan desconocido (catálogo cambiado): no rompe, deja pasar', () => {
  setConfig({ licenciaLocal: licenciaDe('plan-que-no-existe') });
  assert.equal(incluyeAgenteIA(), true, 'ante la duda se da de más, nunca se rompe una copia paga');
});

test('en el host (Vercel) el candado de planes descargables no rige', () => {
  setConfig({ licenciaLocal: licenciaDe('basico') });
  process.env.VERCEL = '1';
  try {
    assert.equal(incluyeAgenteIA(), true, 'el SaaS tiene su propio control por cuenta');
  } finally {
    delete process.env.VERCEL;
  }
});

test('el gate está en conversar(), el único punto por el que pasan los cuatro canales', async () => {
  // Si alguien mueve el chequeo a los canales de a uno, agregar un canal nuevo
  // vuelve a abrir el agujero. Este test fija que viva en el choke point.
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/ai/agente.js', import.meta.url), 'utf8');
  const cuerpo = src.slice(src.indexOf('export async function conversar'));
  assert.match(cuerpo.slice(0, 900), /incluyeAgenteIA\(\)/,
    'conversar() tiene que chequear el plan antes de llamar al LLM');
});
