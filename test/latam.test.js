// Tests de la adaptación LATAM: país/moneda, honorarios, oficios custom e
// impuestos (fallback local sin API key) — node --test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { listarPaises, parametrosMoneda, PAISES } from '../src/data/paises.js';
import { cotizar, listarOficios, oficiosActivos, monedaActiva } from '../src/ai/cotizador.js';
import { estimarImpuestos } from '../src/ai/impuestos.js';
import { setConfig } from '../src/store/config.js';

// Restaurar la config tocada por estos tests
after(() => { setConfig({ pais: 'uy', moneda: '', oficiosCustom: '{}' }); });

test('el catálogo de países cubre LATAM con moneda y símbolo', () => {
  const paises = listarPaises();
  assert.ok(paises.length >= 18, `esperaba 18+ países, hay ${paises.length}`);
  for (const clave of ['uy', 'ar', 'br', 'cl', 'mx', 'co', 'pe', 'py', 'bo', 'ec']) {
    assert.ok(PAISES[clave], `falta ${clave}`);
    assert.ok(PAISES[clave].moneda && PAISES[clave].simbolo && PAISES[clave].locale);
  }
});

test('parametrosMoneda respeta la moneda local o el override a USD', () => {
  assert.equal(parametrosMoneda('ar', '').moneda, 'ARS');
  assert.equal(parametrosMoneda('ar', 'USD').moneda, 'USD');
  assert.equal(parametrosMoneda('ec', '').moneda, 'USD'); // Ecuador ya es USD
  assert.equal(parametrosMoneda('inexistente', '').moneda, 'UYU'); // fallback
});

test('cotizar usa la moneda del país configurado', () => {
  setConfig({ pais: 'mx', moneda: '' });
  const r = cotizar({ oficio: 'electricista', trabajo: 'diagnostico' });
  assert.equal(r.moneda, 'MXN');
  setConfig({ pais: 'ar', moneda: 'USD' });
  const r2 = cotizar({ oficio: 'electricista', trabajo: 'diagnostico' });
  assert.equal(r2.moneda, 'USD');
  assert.equal(monedaActiva().moneda, 'USD');
  setConfig({ pais: 'uy', moneda: '' });
});

test('los servicios profesionales cotizan como honorarios, los oficios como mano de obra', () => {
  const abogado = listarOficios().find((o) => o.clave === 'abogado');
  assert.equal(abogado.honorarios, true);
  const trabajo = abogado.trabajos[0].clave;
  const r = cotizar({ oficio: 'abogado', trabajo });
  assert.equal(r.tipo_cobro, 'honorarios');
  assert.equal(r.etiqueta_mano_obra, 'Honorarios');
  assert.match(r.mensaje_whatsapp, /Honorarios/);
  const e = cotizar({ oficio: 'electricista', trabajo: 'diagnostico' });
  assert.equal(e.tipo_cobro, 'mano_obra_y_materiales');
});

test('una profesión custom se fusiona al catálogo y se puede cotizar', () => {
  setConfig({
    oficiosCustom: JSON.stringify({
      medico_domicilio: {
        nombre: 'Médico a domicilio', honorarios: true, traslado_por_km: 30, traslado_minimo: 200,
        trabajos: { consulta: { nombre: 'Consulta a domicilio', duracion_min: 40, mano_obra: 2500, materiales_base: 0 } },
      },
    }),
  });
  const oficios = listarOficios();
  const medico = oficios.find((o) => o.clave === 'medico_domicilio');
  assert.ok(medico, 'la profesión custom debe aparecer en el catálogo');
  assert.equal(medico.custom, true);
  const r = cotizar({ oficio: 'medico_domicilio', trabajo: 'consulta', distanciaKm: 5 });
  assert.equal(r.error, undefined);
  assert.equal(r.tipo_cobro, 'honorarios');
  assert.ok(r.total >= 2500 + 200);
  assert.ok(oficiosActivos().electricista, 'los oficios base siguen presentes');
  setConfig({ oficiosCustom: '{}' });
});

test('estimarImpuestos (sin API key) devuelve régimen, carga y neto para cualquier país', async () => {
  for (const [pais, ingreso] of [['uy', 80000], ['ar', 900000], ['mx', 25000]]) {
    setConfig({ pais, moneda: '' });
    const r = await estimarImpuestos(ingreso);
    assert.equal(r.ok, true, `falló ${pais}`);
    assert.ok(r.regimen_sugerido.length > 3);
    assert.ok(r.total_impuestos > 0 && r.total_impuestos < ingreso);
    assert.equal(r.neto_estimado, ingreso - r.total_impuestos);
    assert.ok(r.descargo.length > 10, 'siempre con descargo');
  }
  setConfig({ pais: 'uy' });
});

test('estimarImpuestos rechaza ingresos inválidos', async () => {
  const r = await estimarImpuestos('no-es-numero');
  assert.equal(r.ok, false);
});
