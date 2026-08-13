// © 2026 Martín Viera. Todos los derechos reservados.
// Tests del geocoding — node --test. Mockea fetch para no depender de red real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geocodificar, geocodificarInverso, geocodificarToolDef } from '../src/ai/geocoding.js';

function conFetchMock(respuesta, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => respuesta });
  return fn().finally(() => { globalThis.fetch = original; });
}

test('geocodificar devuelve error si falta la dirección', async () => {
  const r = await geocodificar('');
  assert.equal(r.ok, false);
});

test('geocodificar devuelve lat/lng cuando Nominatim encuentra resultados', async () => {
  await conFetchMock(
    [{ lat: '-34.9011', lon: '-56.1645', display_name: 'Av. Brasil 2450, Pocitos, Montevideo, Uruguay' }],
    async () => {
      const r = await geocodificar('Av. Brasil 2450, Pocitos, Montevideo, dirección única de prueba');
      assert.equal(r.ok, true);
      assert.equal(r.lat, -34.9011);
      assert.equal(r.lng, -56.1645);
      assert.match(r.direccion_normalizada, /Pocitos/);
    }
  );
});

test('geocodificar devuelve error si Nominatim no encuentra nada', async () => {
  await conFetchMock([], async () => {
    const r = await geocodificar('una dirección inexistente que no matchea nada raro xyz123');
    assert.equal(r.ok, false);
    assert.ok(r.error);
  });
});

test('geocodificarInverso devuelve una dirección legible', async () => {
  await conFetchMock({ display_name: 'Bulevar Artigas 1120, Malvín, Montevideo' }, async () => {
    const r = await geocodificarInverso(-34.8965, -56.135);
    assert.equal(r.ok, true);
    assert.match(r.direccion, /Malvín/);
  });
});

test('geocodificarInverso rechaza coordenadas inválidas sin llamar a la red', async () => {
  const r = await geocodificarInverso(NaN, undefined);
  assert.equal(r.ok, false);
});

test('geocodificarToolDef tiene un esquema válido para el agente', () => {
  assert.equal(geocodificarToolDef.name, 'geocodificar_direccion');
  assert.equal(geocodificarToolDef.input_schema.type, 'object');
  assert.ok(geocodificarToolDef.input_schema.required.includes('direccion'));
});
