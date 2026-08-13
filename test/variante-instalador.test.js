// © 2026 Martín Viera. Todos los derechos reservados.
// Tests de lo que va adentro de cada entrega (instalador .exe y paquete
// portable .bat) — node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { configVariante, diasPruebaVariante, diasDeVariante } from '../scripts/variante-instalador.js';
import { DIAS_PRUEBA_CLIENTE, DIAS_FIJADOS } from '../src/store/dias-prueba.js';

test('la entrega que se vende lleva 7 días; demo 3 y dueño sin límite', () => {
  assert.equal(diasDeVariante(), DIAS_PRUEBA_CLIENTE);
  assert.equal(diasDeVariante(), 7);
  assert.equal(diasDeVariante({ demo: true }), 3);
  assert.equal(diasDeVariante({ owner: true }), 0);
});

test('el config de Electron sale con los días fijados, nunca en null', () => {
  // Que salga un número (y no null) es lo que impide que el comprador estire
  // la prueba con DIAS_PRUEBA en las variables de entorno de su Windows.
  assert.match(configVariante(), /diasPrueba: 7 /);
  assert.match(configVariante({ demo: true }), /diasPrueba: 3 /);
  assert.match(configVariante({ owner: true }), /diasPrueba: 0 /);
  for (const v of [{}, { demo: true }, { owner: true }]) {
    assert.doesNotMatch(configVariante(v), /null/, 'diasPrueba:null dejaría el candado a merced del entorno');
  }
});

test('el módulo de días sale con DIAS_FIJADOS en un número, que es lo que blinda el paquete .bat', () => {
  // El portable corre src/ con node y NO pasa por electron/main.cjs: si esto
  // saliera en null, un DIAS_PRUEBA=0 en el entorno lo abriría gratis.
  assert.match(diasPruebaVariante(), /export const DIAS_FIJADOS = 7;/);
  assert.match(diasPruebaVariante({ demo: true }), /export const DIAS_FIJADOS = 3;/);
  assert.match(diasPruebaVariante({ owner: true }), /export const DIAS_FIJADOS = 0;/);
});

test('lo generado para cada variante es JS válido y con los dos exports que espera prueba.js', async () => {
  for (const v of [{}, { demo: true }, { owner: true }]) {
    const modulo = await import(`data:text/javascript,${encodeURIComponent(diasPruebaVariante(v))}`);
    assert.equal(typeof modulo.DIAS_FIJADOS, 'number');
    assert.equal(modulo.DIAS_FIJADOS, diasDeVariante(v));
    assert.equal(modulo.DIAS_PRUEBA_CLIENTE, DIAS_PRUEBA_CLIENTE);
  }
});

test('en el repo DIAS_FIJADOS queda en null: solo el empaquetador lo fija', () => {
  // Si alguien commitea un número acá, el modo dev y los tests dejarían de
  // poder simular otras duraciones y el default de venta quedaría escondido.
  assert.equal(DIAS_FIJADOS, null);
});

test('--owner y --demo juntos son un error, no una variante silenciosa', () => {
  assert.throws(() => diasDeVariante({ owner: true, demo: true }), /excluyentes/);
  assert.throws(() => configVariante({ owner: true, demo: true }), /excluyentes/);
});

test('el empaquetador reescribe los DOS archivos: el de Electron y el del .bat', () => {
  // Guarda contra volver a fijar solo uno y dejar media entrega sin candado.
  const ofuscar = readFileSync(new URL('../scripts/ofuscar.js', import.meta.url), 'utf8');
  assert.match(ofuscar, /owner-config\.cjs/, 'falta fijar el config que lee Electron');
  assert.match(ofuscar, /dias-prueba\.js/, 'falta fijar el módulo que lee el paquete .bat');
  assert.match(ofuscar, /configsEscritas !== REESCRITOS\.size/, 'falta el chequeo de que se fijaron todos');
});
