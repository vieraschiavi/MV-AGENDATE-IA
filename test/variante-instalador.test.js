// Tests de la config que va adentro de cada instalador de Windows — node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configVariante } from '../scripts/variante-instalador.js';
import { DIAS_PRUEBA_CLIENTE } from '../src/store/dias-prueba.js';

test('el instalador que se vende fija los 7 días adentro', () => {
  // Que salga un número (y no null) es lo que impide que el comprador estire
  // la prueba con DIAS_PRUEBA en las variables de entorno de su Windows.
  assert.equal(configVariante(), `module.exports = { diasPrueba: ${DIAS_PRUEBA_CLIENTE} };\n`);
  assert.match(configVariante(), /diasPrueba: 7 /);
});

test('la demo queda en 3 días y la copia del dueño sin límite', () => {
  assert.match(configVariante({ demo: true }), /diasPrueba: 3 /);
  assert.match(configVariante({ owner: true }), /diasPrueba: 0 /);
});

test('ninguna variante sale sin días fijados', () => {
  for (const v of [{}, { demo: true }, { owner: true }]) {
    assert.doesNotMatch(configVariante(v), /null/, 'diasPrueba:null dejaría el candado a merced del entorno');
  }
});

test('--owner y --demo juntos son un error, no una variante silenciosa', () => {
  assert.throws(() => configVariante({ owner: true, demo: true }), /excluyentes/);
});
