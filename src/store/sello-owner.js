// © 2026 Martín Viera. Todos los derechos reservados.
// Software propietario. Uso sujeto a LICENSE.
//
// SELLO DE DUEÑO en runtime — la metodología de Buscador-Inmobiliario.
//
// Antes la edición del dueño se fabricaba COMPILANDO un binario aparte
// (ofuscar.js --owner reescribía owner-config.cjs) y el .bat de conversión
// reescribía archivos del código fuente con la receta publicada adentro. Tres
// binarios de ~90 MB que podían divergir, y una "llave maestra" que era texto
// plano legible por cualquiera.
//
// Ahora la edición se decide en runtime con UN archivo sellado y FIRMADO
// (Ed25519, misma clave del dueño que en los demás productos MV):
//
//     licencia-owner.json  →  {"token": "MV1.<payload>.<firma>"}
//
// Sin la clave privada del dueño no se puede fabricar ni retocar. El sello se
// busca en DOS lugares, y ese orden es la respuesta a "que detecte solo dónde
// se instaló":
//
//   1. El PERFIL del usuario (~/.mv-agendate-ia). No depende de dónde quedó
//      instalado el programa: el .bat del dueño escribe acá y funciona sea
//      cual sea la carpeta de instalación. Además sobrevive a reinstalaciones
//      y actualizaciones.
//   2. La carpeta de datos JUNTO AL CÓDIGO (resources/app/data en el .exe).
//      Es la única ruta que el instalador NSIS conoce con certeza: ahí escribe
//      el instalador OWNER.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { leerToken } from './firma.js';

const here = dirname(fileURLToPath(import.meta.url));

// MV_ANCLA_DIR ya existe para los tests del ancla de la prueba: se reusa para
// no inventar una segunda variable que haga lo mismo.
const DIR_PERFIL = () => process.env.MV_ANCLA_DIR || join(homedir(), '.mv-agendate-ia');

const RUTAS_SELLO = () => [
  join(DIR_PERFIL(), 'licencia-owner.json'),
  join(here, '../../data/licencia-owner.json'),
];

const leerJson = (ruta) => {
  try { return existsSync(ruta) ? JSON.parse(readFileSync(ruta, 'utf8')) : null; } catch { return null; }
};

/**
 * ¿Esta copia es la del dueño? Solo si el sello está FIRMADO con la clave del
 * dueño. Un {"edicion":"owner"} escrito a mano no pasa.
 */
export function esOwner() {
  for (const ruta of RUTAS_SELLO()) {
    const crudo = leerJson(ruta);
    const token = typeof crudo === 'string' ? crudo : crudo?.token;
    if (leerToken(token)?.tipo === 'owner') return true;
  }
  return false;
}
