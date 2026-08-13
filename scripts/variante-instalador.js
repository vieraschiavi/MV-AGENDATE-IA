// © 2026 Martín Viera. Todos los derechos reservados.

// Qué prueba lleva adentro cada variante de lo que se entrega (instalador .exe
// y paquete portable .bat).
//
// scripts/ofuscar.js escribe estos contenidos en la copia empaquetada. Que el
// número viaje FIJADO adentro de la entrega es lo que hace que el candado sea
// real: si saliera sin fijar, alcanzaría con poner DIAS_PRUEBA=0 en las
// variables de entorno de Windows para dejar la app abierta sin pagar.
//
// Son dos archivos porque hay dos formas de arrancar el programa:
//   - owner-config.cjs → lo lee electron/main.cjs (la ventana de escritorio)
//   - dias-prueba.js   → lo lee src/store/prueba.js, o sea TAMBIÉN el paquete
//     .bat, que corre src/ con node y nunca pasa por Electron.
import { DIAS_PRUEBA_CLIENTE } from '../src/store/dias-prueba.js';
import { firmarLicencia, payloadLicencia } from './firmar-licencia.js';

const DIAS_DEMO = 3;   // demo de vidriera: prueba corta, no se vende

// La variante dueño lleva los MISMOS días que la que se vende, no cero.
//
// Antes era 0, porque "cero días de prueba" significaba "sin límite", y ésa era
// toda la marca de la copia del dueño: una línea de texto que cualquiera
// escribía con el Bloc de notas. Ahora lo que la distingue es la licencia
// perpetua FIRMADA que lleva adentro (ver licenciaVariante).
//
// Que quede en 7 y no en 0 es a propósito: si a un build del dueño le sacan la
// licencia, cae a una prueba normal de 7 días en vez de a una prueba vencida.
const DIAS_OWNER = DIAS_PRUEBA_CLIENTE;

/** Días de prueba de la variante que se está armando. */
export function diasDeVariante({ owner = false, demo = false } = {}) {
  if (owner && demo) throw new Error('--owner y --demo son excluyentes: elegí una variante.');
  return owner ? DIAS_OWNER : demo ? DIAS_DEMO : DIAS_PRUEBA_CLIENTE;
}

/**
 * Contenido de src/store/licencia-incluida.js para la variante.
 *
 * Sólo la variante dueño lleva licencia adentro, y firmarla necesita la clave
 * privada: sin ella esto TIRA, no sale una entrega a medias. Un instalador de
 * dueño sin licencia es un instalador de cliente disfrazado — se descubriría al
 * abrirlo y ver que pide la clave.
 *
 * @param {{owner?: boolean, demo?: boolean, legado?: boolean}} variante
 * @returns {string}
 */
export function licenciaVariante(variante = {}) {
  const { owner = false, demo = false, legado = false } = variante;
  if (owner && demo) throw new Error('--owner y --demo son excluyentes: elegí una variante.');
  const licencia = owner
    ? firmarLicencia(payloadLicencia({ nombre: 'Uso propio', email: 'uso-propio@local', plan: 'full' }))
    : '';
  return '// Generado por scripts/ofuscar.js — licencia fijada en la entrega.\n' +
    `export const LICENCIA_INCLUIDA = '${licencia}';\n` +
    `export const ACEPTA_LEGADO = ${legado ? 'true' : 'false'};\n`;
}

/**
 * Contenido de electron/owner-config.cjs para la variante.
 * @param {{owner?: boolean, demo?: boolean}} variante
 * @returns {string}
 */
export function configVariante(variante = {}) {
  return `module.exports = { diasPrueba: ${diasDeVariante(variante)} };\n`;
}

/**
 * Contenido de src/store/dias-prueba.js para la variante: mismo módulo, pero
 * con DIAS_FIJADOS en un número en vez de null.
 * @param {{owner?: boolean, demo?: boolean}} variante
 * @returns {string}
 */
export function diasPruebaVariante(variante = {}) {
  const dias = diasDeVariante(variante);
  return `// Generado por scripts/ofuscar.js — días de prueba fijados en la entrega.\n` +
    `export const DIAS_PRUEBA_CLIENTE = ${DIAS_PRUEBA_CLIENTE};\n` +
    `export const DIAS_FIJADOS = ${dias};\n`;
}
