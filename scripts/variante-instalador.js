// Qué prueba lleva adentro cada variante del instalador de Windows.
//
// scripts/ofuscar.js escribe el resultado en electron/owner-config.cjs de la
// copia empaquetada, y electron/main.cjs lo inyecta como DIAS_PRUEBA al
// servidor. Que el número viaje FIJADO adentro del .exe es lo que hace que el
// candado sea real: si el instalador del cliente saliera con diasPrueba:null,
// alcanzaría con poner DIAS_PRUEBA=0 en las variables de entorno de Windows
// para dejar la app abierta sin pagar.
import { DIAS_PRUEBA_CLIENTE } from '../src/store/dias-prueba.js';

const DIAS_DEMO = 3;   // demo de vidriera: prueba corta, no se vende
const DIAS_OWNER = 0;  // copia del dueño: sin límite (0 = prueba desactivada)

/**
 * Contenido de electron/owner-config.cjs para la variante que se está armando.
 * @param {{owner?: boolean, demo?: boolean}} variante
 * @returns {string}
 */
export function configVariante({ owner = false, demo = false } = {}) {
  if (owner && demo) throw new Error('--owner y --demo son excluyentes: elegí una variante.');
  const dias = owner ? DIAS_OWNER : demo ? DIAS_DEMO : DIAS_PRUEBA_CLIENTE;
  return `module.exports = { diasPrueba: ${dias} };\n`;
}
