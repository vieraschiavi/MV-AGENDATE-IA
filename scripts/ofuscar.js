// © 2026 Martín Viera. Todos los derechos reservados.
// Ofusca src/ y electron/ antes de empaquetar el instalador de Windows.
//
// Con asar:false (necesario para que el proceso hijo del servidor arranque
// bien, ver electron/main.cjs) el .exe instalado deja los .js del servidor
// en texto plano dentro de la carpeta de instalación — cualquiera podría
// copiarlos. Este script genera una copia ofuscada 1:1 (misma estructura de
// carpetas, mismos nombres de archivo) en dist-protegido/, para que
// electron-builder empaquete esa copia en vez del código fuente real.
//
// No toca el repo: dist-protegido/ es un artefacto de build (gitignored),
// y el servidor de desarrollo (`npm run dev`, `npm test`) sigue corriendo
// contra src/ tal cual.
//
// Variantes del instalador (ver electron/owner-config.cjs):
//   (sin flag)  cliente pago: prueba de 7 días fijada, se activa con la licencia del pago
//   --demo      demo: prueba de 3 días fijada explícitamente (ignora DIAS_PRUEBA del entorno)
//   --owner     dueño: SIN límite de prueba, para uso propio del vendedor
//
// Las TRES fijan los días adentro del instalador: si el cliente quedara con
// diasPrueba:null, la variable de entorno DIAS_PRUEBA de su propia máquina
// pisaría la prueba (DIAS_PRUEBA=0 la desactiva) y tendría el programa gratis
// para siempre sin pasar por MercadoPago.
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import JavaScriptObfuscator from 'javascript-obfuscator';
import { configVariante, diasPruebaVariante, diasDeVariante } from './variante-instalador.js';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const SALIDA = join(RAIZ, 'dist-protegido');
const CARPETAS = ['src', 'electron'];
const ES_OWNER = process.argv.includes('--owner');
const ES_DEMO = process.argv.includes('--demo');
if (ES_OWNER && ES_DEMO) {
  console.error('✘ --owner y --demo son excluyentes: elegí una variante.');
  process.exit(1);
}
// Los dos archivos que el empaquetador reescribe con los días de la variante.
// Ninguno queda "sin fijar": la entrega siempre sale con el número adentro, y
// se cubren las dos formas de arrancar (ventana Electron y paquete .bat).
const VARIANTE = { owner: ES_OWNER, demo: ES_DEMO };
const REESCRITOS = new Map([
  [join(RAIZ, 'electron', 'owner-config.cjs'), configVariante(VARIANTE)],   // lo lee electron/main.cjs
  [join(RAIZ, 'src', 'store', 'dias-prueba.js'), diasPruebaVariante(VARIANTE)] // lo lee src/store/prueba.js (también en el .bat)
]);

const OPCIONES = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.4,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.2,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  selfDefending: false, // rompe con --inspect y complica el debug de soporte sin sumar protección real
  disableConsoleOutput: false, // los logs de servidor.log siguen siendo legibles para soporte
  target: 'node',
};

function recorrer(dir, cb) {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    const info = statSync(ruta);
    if (info.isDirectory()) recorrer(ruta, cb);
    else cb(ruta);
  }
}

rmSync(SALIDA, { recursive: true, force: true });

let ofuscados = 0;
let copiados = 0;
let configsEscritas = 0;

for (const carpeta of CARPETAS) {
  const origen = join(RAIZ, carpeta);
  recorrer(origen, (rutaOrigen) => {
    const rutaRelativa = rutaOrigen.slice(RAIZ.length + 1);
    const rutaDestino = join(SALIDA, rutaRelativa);
    mkdirSync(dirname(rutaDestino), { recursive: true });

    const ext = extname(rutaOrigen);
    if (ext === '.js' || ext === '.cjs' || ext === '.mjs') {
      const reescrito = REESCRITOS.get(rutaOrigen);
      if (reescrito !== undefined) configsEscritas++;
      const codigo = reescrito !== undefined ? reescrito : readFileSync(rutaOrigen, 'utf8');
      const resultado = JavaScriptObfuscator.obfuscate(codigo, OPCIONES);
      writeFileSync(rutaDestino, resultado.getObfuscatedCode());
      ofuscados++;
    } else {
      writeFileSync(rutaDestino, readFileSync(rutaOrigen));
      copiados++;
    }
  });
}

// Sin este chequeo, que uno de los dos archivos cambie de ruta o de nombre
// haría salir la entrega con el archivo del repo (sin fijar) y el candado
// volvería a depender del DIAS_PRUEBA de la máquina del comprador — en
// silencio, con el build en verde.
if (configsEscritas !== REESCRITOS.size) {
  console.error(`✘ Esperaba fijar los días de la variante en ${REESCRITOS.size} archivos y los fijé en ${configsEscritas}. ` +
    `¿Se movió alguno de estos?\n  ${[...REESCRITOS.keys()].join('\n  ')}\n` +
    `La entrega saldría sin los días de prueba fijados.`);
  process.exit(1);
}

const DIAS = diasDeVariante(VARIANTE);
const etiqueta = ES_OWNER ? ' [OWNER — sin límite de prueba]'
  : ES_DEMO ? ` [DEMO — prueba de ${DIAS} días fija]`
  : ` [CLIENTE — prueba de ${DIAS} días fija]`;
console.log(`✔ Ofuscados ${ofuscados} archivos .js/.cjs, copiados ${copiados} archivos de datos → ${SALIDA}${etiqueta}`);
