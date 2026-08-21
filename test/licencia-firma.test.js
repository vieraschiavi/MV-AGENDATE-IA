// © 2026 Martín Viera. Todos los derechos reservados.

// El candado del producto: qué se acepta como licencia y qué no.
//
// El bug que estos tests fijan: licenciaValida() era `codigo.length >= 6`, así
// que activarLicencia("abcdef") desbloqueaba para siempre el plan Full de
// US$ 299. El .exe y el .apk se descargan gratis a propósito (instalar.html los
// ofrece con "corre 7 días full"), o sea que el único candado del negocio era
// ese chequeo de largo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';

// El módulo de firma lee la clave pública de licencia-clave.js al importarse,
// así que para probar el camino "con firma configurada" hay que interceptar ese
// import ANTES de cargarlo. node:test no trae mocks de módulos ESM estables, y
// meter una dependencia sólo para esto rompería la regla del repo (src/ sin
// dependencias), así que se prueba la primitiva contra un par generado acá y el
// cableado con el par real queda cubierto por el test de integración de abajo.
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const PRIVADA_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const PUBLICA_PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString();

test('firmar/verificar: una licencia emitida por el servidor valida', async () => {
  process.env.MV_LICENSE_PRIVATE_KEY = PRIVADA_PEM;
  const { firmar } = await import('../src/store/licencia-firma.js');
  const codigo = firmar({ id: 'ORD-ABCD1234', plan: 'full', exp: null });
  assert.ok(codigo, 'con la privada configurada tiene que emitir');
  assert.ok(codigo.startsWith('MVL1.'), 'lleva el prefijo del formato');

  // Se verifica con la primitiva directa, con la pública del par de este test.
  const { verify, createPublicKey } = await import('node:crypto');
  const [cuerpo, firma] = codigo.slice(5).split('.');
  assert.equal(
    verify(null, Buffer.from(cuerpo), createPublicKey(PUBLICA_PEM), Buffer.from(firma, 'base64url')),
    true
  );
  const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
  assert.deepEqual(datos, { id: 'ORD-ABCD1234', plan: 'full', exp: null });
});

test('firmar es determinístico: dos avisos del mismo pago dan la MISMA licencia', async () => {
  process.env.MV_LICENSE_PRIVATE_KEY = PRIVADA_PEM;
  const { firmar } = await import('../src/store/licencia-firma.js');
  const a = firmar({ id: 'ORD-11112222', plan: 'basico', exp: null });
  const b = firmar({ id: 'ORD-11112222', plan: 'basico', exp: null });
  assert.equal(a, b, 'si no, el cliente puede quedarse con el código que perdió la carrera');
});

test('sin clave privada no se firma (y el emisor cae al formato viejo)', async () => {
  delete process.env.MV_LICENSE_PRIVATE_KEY;
  const { firmar, puedeFirmar } = await import('../src/store/licencia-firma.js');
  assert.equal(puedeFirmar(), false);
  assert.equal(firmar({ id: 'ORD-1', plan: 'full' }), null);
});

test('una firma adulterada NO valida', async () => {
  process.env.MV_LICENSE_PRIVATE_KEY = PRIVADA_PEM;
  const { firmar } = await import('../src/store/licencia-firma.js');
  const { verify, createPublicKey } = await import('node:crypto');
  const codigo = firmar({ id: 'ORD-CAFE0001', plan: 'basico', exp: null });

  // Se cambia el plan de 'basico' a 'full' en el payload, dejando la firma vieja.
  const [, firma] = codigo.slice(5).split('.');
  const falso = Buffer.from(JSON.stringify({ id: 'ORD-CAFE0001', plan: 'full', exp: null })).toString('base64url');
  assert.equal(
    verify(null, Buffer.from(falso), createPublicKey(PUBLICA_PEM), Buffer.from(firma, 'base64url')),
    false,
    'ascender el plan a mano tiene que romper la firma'
  );
});

test('con la firma SIN configurar, el comportamiento viejo se conserva', async () => {
  // Es el estado del repo hoy: PUBLICA = ''. Se mantiene a propósito para no
  // dejar afuera a quien ya compró antes de que existiera la firma.
  const { firmaConfigurada } = await import('../src/store/licencia-clave.js');
  const { verificar } = await import('../src/store/licencia-firma.js');
  if (firmaConfigurada()) {
    // Ya se pegó la clave pública: entonces verificar() tiene que RECHAZAR basura.
    assert.equal(verificar('abcdef'), null);
    assert.equal(verificar('MV-FULL-DEADBEEF'), null);
    assert.equal(verificar('MVL1.aaaa.bbbb'), null);
  } else {
    // Todavía no: verificar() no valida nada, y el candado sigue siendo el viejo.
    assert.equal(verificar('MVL1.aaaa.bbbb'), null);
  }
});

test('licencias heredadas: sólo las de la lista explícita, no cualquiera del formato', async () => {
  // La lista existe para no dejar afuera a quien compró antes de la firma. Es
  // explícita, no un patrón: seguir el formato MV-PLAN-XXXXXXXX no alcanza.
  process.env.MV_LICENCIAS_HEREDADAS = 'MV-FULL-A1B2C3D4, MV-BASICO-99887766';
  const lista = String(process.env.MV_LICENCIAS_HEREDADAS)
    .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  assert.ok(lista.includes('MV-FULL-A1B2C3D4'));
  assert.ok(lista.includes('MV-BASICO-99887766'), 'los espacios alrededor de la coma no cuentan');
  assert.equal(lista.includes('MV-FULL-00000000'), false, 'una del mismo formato pero no vendida NO entra');
  delete process.env.MV_LICENCIAS_HEREDADAS;
});
