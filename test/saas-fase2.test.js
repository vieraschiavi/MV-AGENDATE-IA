// © 2026 Martín Viera. Todos los derechos reservados.
// Tests de la fase 2 del modo SaaS: configuración propia por cuenta resuelta
// por contexto (AsyncLocalStorage) y ruteo de canales por cuenta — node --test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { runConCuenta, cuentaActiva } from '../src/store/contextoCuenta.js';
import { obtenerOverrides, guardarOverrides, configPublicaCuenta, cuentaPorPhoneId, CLAVES_CUENTA } from '../src/store/configCuentas.js';
import { get as cfg, setConfig, listarProfesionales } from '../src/store/config.js';
import { cotizar, monedaActiva } from '../src/ai/cotizador.js';
import { aprobacionRequerida } from '../src/store/cotizaciones.js';

after(() => { setConfig({ pais: 'uy', moneda: '' }); });

test('la config de la cuenta activa pisa la global (y fuera de contexto no)', async () => {
  setConfig({ pais: 'uy', moneda: '', oficioProfesional: 'electricista' });
  await guardarOverrides('cta-test-1', { pais: 'mx', oficioProfesional: 'plomero', nombreProfesional: 'Rosa' });

  assert.equal(cfg('pais'), 'uy', 'sin contexto rige la global');
  await runConCuenta('cta-test-1', await obtenerOverrides('cta-test-1'), async () => {
    assert.equal(cuentaActiva(), 'cta-test-1');
    assert.equal(cfg('pais'), 'mx');
    assert.equal(cfg('oficioProfesional'), 'plomero');
    assert.equal(cfg('moneda'), '', 'clave sin override cae a la global');
    // y todo lo construido sobre cfg() la sigue: moneda de cotización, equipo…
    assert.equal(monedaActiva().moneda, 'MXN');
    const r = cotizar({ oficio: 'electricista', trabajo: 'diagnostico' });
    assert.equal(r.moneda, 'MXN');
    assert.equal(listarProfesionales()[0].nombre, 'Rosa');
    assert.equal(listarProfesionales()[0].oficio, 'plomero');
  });
  assert.equal(cfg('pais'), 'uy', 'al salir del contexto vuelve la global');
  assert.equal(cuentaActiva(), 'default');
});

test('las claves del vendedor no se pueden pisar desde una cuenta', async () => {
  assert.ok(!CLAVES_CUENTA.includes('adminKey'));
  assert.ok(!CLAVES_CUENTA.includes('mercadopagoToken'));
  assert.ok(!CLAVES_CUENTA.includes('jwtSecret'));
  const guardado = await guardarOverrides('cta-test-2', { adminKey: 'hackeada', pais: 'ar' });
  assert.equal(guardado.adminKey, undefined, 'la clave prohibida se descarta');
  assert.equal(guardado.pais, 'ar');
});

test('la aprobación de cotizaciones se resuelve por cuenta', async () => {
  setConfig({ aprobarCotizaciones: '0', demoLimite: '' }); // global: precio directo
  await guardarOverrides('cta-test-3', { aprobarCotizaciones: '' }); // cuenta: (default → aprobar)
  assert.equal(aprobacionRequerida(), false);
  await runConCuenta('cta-test-3', await obtenerOverrides('cta-test-3'), () => {
    // la cuenta no seteó nada => hereda la global '0'
    assert.equal(aprobacionRequerida(), false);
  });
  await guardarOverrides('cta-test-3', { aprobarCotizaciones: '1' });
  await runConCuenta('cta-test-3', await obtenerOverrides('cta-test-3'), () => {
    assert.equal(aprobacionRequerida(), true, 'la cuenta exige aprobación aunque la global no');
  });
  setConfig({ aprobarCotizaciones: '' });
});

test('configPublicaCuenta enmascara secretos y arma el estado de canales', async () => {
  await guardarOverrides('cta-test-4', { anthropicApiKey: 'sk-ant-secreta', whatsappToken: 'tok', whatsappPhoneId: '123' });
  const pub = await configPublicaCuenta('cta-test-4');
  assert.equal(pub.anthropicApiKey, '(configurada)');
  assert.equal(pub.whatsappPhoneId, '123');
  assert.equal(pub.estado.claude, true);
  assert.equal(pub.estado.whatsapp, true);
  assert.equal(pub.estado.voz, false);
});

test('cuentaPorPhoneId encuentra a la cuenta dueña del número de WhatsApp', async () => {
  await guardarOverrides('cta-wa-1', { whatsappPhoneId: '111111' });
  await guardarOverrides('cta-wa-2', { whatsappPhoneId: '222222' });
  const duenio = await cuentaPorPhoneId('222222', ['cta-wa-1', 'cta-wa-2']);
  assert.equal(duenio.cuentaId, 'cta-wa-2');
  assert.equal(await cuentaPorPhoneId('999999', ['cta-wa-1', 'cta-wa-2']), null);
  assert.equal(await cuentaPorPhoneId('', ['cta-wa-1']), null);
});

test('cuentaPorNumeroVoz matchea el número llamado en E.164 sin importar el formato', async () => {
  const { cuentaPorNumeroVoz } = await import('../src/store/configCuentas.js');
  await guardarOverrides('cta-voz-1', { twilioNumero: '+598 99 123 456' });
  await guardarOverrides('cta-voz-2', { twilioNumero: '+5491155550000' });
  const ids = ['cta-voz-1', 'cta-voz-2'];
  assert.equal((await cuentaPorNumeroVoz('+59899123456', ids)).cuentaId, 'cta-voz-1');
  assert.equal((await cuentaPorNumeroVoz('549-11-5555-0000', ids)).cuentaId, 'cta-voz-2');
  assert.equal(await cuentaPorNumeroVoz('+59800000000', ids), null);
  assert.equal(await cuentaPorNumeroVoz('', ids), null);
});

test('twilioNumero es una clave de cuenta permitida (para el ruteo de voz)', () => {
  assert.ok(CLAVES_CUENTA.includes('twilioNumero'));
});
