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
//   (sin flag)  cliente pago: prueba de 3 días por defecto, se activa con la licencia del pago
//   --demo      demo: prueba de 3 días fijada explícitamente (ignora DIAS_PRUEBA del entorno)
//   --owner     dueño: SIN límite de prueba, para uso propio del vendedor
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import JavaScriptObfuscator from 'javascript-obfuscator';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const SALIDA = join(RAIZ, 'dist-protegido');
const CARPETAS = ['src', 'electron'];
const ES_OWNER = process.argv.includes('--owner');
const ES_DEMO = process.argv.includes('--demo');
if (ES_OWNER && ES_DEMO) {
  console.error('✘ --owner y --demo son excluyentes: elegí una variante.');
  process.exit(1);
}
const OWNER_CONFIG_RUTA = join(RAIZ, 'electron', 'owner-config.cjs');
// Línea que reemplaza a owner-config.cjs según la variante (null = dejar el archivo tal cual).
const CONFIG_VARIANTE = ES_OWNER ? 'module.exports = { diasPrueba: 0 };\n'
  : ES_DEMO ? 'module.exports = { diasPrueba: 3 };\n'
  : null;

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

for (const carpeta of CARPETAS) {
  const origen = join(RAIZ, carpeta);
  recorrer(origen, (rutaOrigen) => {
    const rutaRelativa = rutaOrigen.slice(RAIZ.length + 1);
    const rutaDestino = join(SALIDA, rutaRelativa);
    mkdirSync(dirname(rutaDestino), { recursive: true });

    const ext = extname(rutaOrigen);
    if (ext === '.js' || ext === '.cjs' || ext === '.mjs') {
      const esConfigVariante = CONFIG_VARIANTE !== null && rutaOrigen === OWNER_CONFIG_RUTA;
      const codigo = esConfigVariante
        ? CONFIG_VARIANTE
        : readFileSync(rutaOrigen, 'utf8');
      const resultado = JavaScriptObfuscator.obfuscate(codigo, OPCIONES);
      writeFileSync(rutaDestino, resultado.getObfuscatedCode());
      ofuscados++;
    } else {
      writeFileSync(rutaDestino, readFileSync(rutaOrigen));
      copiados++;
    }
  });
}

const etiqueta = ES_OWNER ? ' [OWNER — sin límite de prueba]' : ES_DEMO ? ' [DEMO — prueba de 3 días fija]' : ' [CLIENTE]';
console.log(`✔ Ofuscados ${ofuscados} archivos .js/.cjs, copiados ${copiados} archivos de datos → ${SALIDA}${etiqueta}`);
