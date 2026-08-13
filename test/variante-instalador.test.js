// © 2026 Martín Viera. Todos los derechos reservados.

// Tests de lo que va adentro de cada entrega (instalador .exe y paquete
// portable .bat) — node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { configVariante, diasPruebaVariante, diasDeVariante, licenciaVariante } from '../scripts/variante-instalador.js';
import { DIAS_PRUEBA_CLIENTE, DIAS_FIJADOS } from '../src/store/dias-prueba.js';
import { LICENCIA_INCLUIDA, ACEPTA_LEGADO } from '../src/store/licencia-incluida.js';
import { verificarLicencia } from '../src/store/licencia-firma.js';

test('la entrega que se vende lleva 7 días y la demo 3', () => {
  assert.equal(diasDeVariante(), DIAS_PRUEBA_CLIENTE);
  assert.equal(diasDeVariante(), 7);
  assert.equal(diasDeVariante({ demo: true }), 3);
});

test('la variante dueño ya NO se marca con "cero días de prueba"', () => {
  // Ése era todo el candado: `diasPrueba: 0` significaba "sin límite", en un
  // archivo de texto de una línea que cualquiera escribía con el Bloc de notas.
  // Ahora lo que la distingue es una licencia FIRMADA (ver el test de abajo), y
  // los días quedan en los mismos 7 que la copia que se vende: si a un build
  // del dueño le sacan la licencia, cae a una prueba normal en vez de a "sin
  // límite".
  assert.equal(diasDeVariante({ owner: true }), 7);
  assert.notEqual(diasDeVariante({ owner: true }), 0,
    'volver a poner 0 acá reabre el agujero: cero pasaría a ser la llave otra vez');
});

test('el config de Electron sale con los días fijados, nunca en null', () => {
  // Que salga un número (y no null) es lo que impide que el comprador estire
  // la prueba con DIAS_PRUEBA en las variables de entorno de su Windows.
  assert.match(configVariante(), /diasPrueba: 7 /);
  assert.match(configVariante({ demo: true }), /diasPrueba: 3 /);
  assert.match(configVariante({ owner: true }), /diasPrueba: 7 /);
  for (const v of [{}, { demo: true }, { owner: true }]) {
    assert.doesNotMatch(configVariante(v), /null/, 'diasPrueba:null dejaría el candado a merced del entorno');
    assert.doesNotMatch(configVariante(v), /diasPrueba: 0\b/,
      'cero días era la vieja llave del dueño: ninguna variante puede volver a salir así');
  }
});

test('el módulo de días sale con DIAS_FIJADOS en un número, que es lo que blinda el paquete .bat', () => {
  // El portable corre src/ con node y NO pasa por electron/main.cjs: si esto
  // saliera en null, un DIAS_PRUEBA=0 en el entorno lo abriría gratis.
  assert.match(diasPruebaVariante(), /export const DIAS_FIJADOS = 7;/);
  assert.match(diasPruebaVariante({ demo: true }), /export const DIAS_FIJADOS = 3;/);
  assert.match(diasPruebaVariante({ owner: true }), /export const DIAS_FIJADOS = 7;/);
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

test('el empaquetador reescribe los TRES archivos de la entrega', () => {
  // Guarda contra volver a fijar solo uno y dejar media entrega sin candado.
  const ofuscar = readFileSync(new URL('../scripts/ofuscar.js', import.meta.url), 'utf8');
  assert.match(ofuscar, /owner-config\.cjs/, 'falta fijar el config que lee Electron');
  assert.match(ofuscar, /dias-prueba\.js/, 'falta fijar el módulo que lee el paquete .bat');
  assert.match(ofuscar, /licencia-incluida\.js/, 'falta fijar la licencia de la variante dueño');
  assert.match(ofuscar, /configsEscritas !== REESCRITOS\.size/, 'falta el chequeo de que se fijaron todos');
});

// --- La variante dueño, ahora, es una licencia firmada ---

test('en el repo no viaja NINGUNA licencia: la del dueño se firma al empaquetar', () => {
  // Este repo es público. Una licencia perpetua commiteada acá sería el
  // producto completo regalado a quien clone.
  assert.equal(LICENCIA_INCLUIDA, '');
  assert.equal(ACEPTA_LEGADO, false, 'aceptar los códigos viejos por default reabre el agujero');
});

test('la variante dueño lleva una licencia perpetua FIRMADA que la app acepta', () => {
  const modulo = licenciaVariante({ owner: true });
  const codigo = (modulo.match(/LICENCIA_INCLUIDA = '([^']*)'/) || [])[1];
  assert.ok(codigo, 'la variante dueño tiene que llevar una licencia adentro');

  const v = verificarLicencia(codigo);
  assert.equal(v.ok, true, 'si no verifica, el build del dueño le pide la clave al dueño');
  assert.equal(v.datos.x, null, 'la del dueño es perpetua: no se le puede vencer sola');
});

test('las variantes que se venden NO llevan licencia adentro', () => {
  // Una licencia perpetua dentro del instalador del cliente sería el producto
  // gratis para todo el que lo descargue del sitio.
  for (const v of [{}, { demo: true }]) {
    assert.match(licenciaVariante(v), /LICENCIA_INCLUIDA = '';/,
      'la copia que se vende no puede salir ya activada');
  }
});

test('--legado se tiene que pedir explícitamente', () => {
  assert.match(licenciaVariante({}), /ACEPTA_LEGADO = false;/);
  assert.match(licenciaVariante({ legado: true }), /ACEPTA_LEGADO = true;/);
});
