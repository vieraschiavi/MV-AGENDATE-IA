#!/usr/bin/env node
// Genera el paquete de escritorio (Electron) para Windows →
// public/descargas/MV-Agendate-IA-Windows.zip. Adentro: "MV Agendate IA.exe"
// — doble clic, sin instalar Node.js aparte (Electron lo trae embebido) y
// sin ventana de terminal ni pestaña de navegador.
//
// Node puro (sin bash): corre igual en Windows, Mac y Linux.
// Requiere que `npm install` ya haya corrido en la raíz (electron y
// electron-packager como devDependencies). Regeneralo con
// `npm run empaquetar-exe` cuando cambie el código.
import { existsSync, mkdirSync, mkdtempSync, cpSync, rmSync, readFileSync, writeFileSync, createWriteStream, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ZipArchive } from 'archiver';

const RAIZ = join(fileURLToPath(import.meta.url), '../..');
process.chdir(RAIZ);

const OUT = join(RAIZ, 'public/descargas');
const NOMBRE_ZIP = 'MV-Agendate-IA-Windows.zip';
const NOMBRE_APP = 'MV Agendate IA';
mkdirSync(OUT, { recursive: true });

const stage = mkdtempSync(join(tmpdir(), 'mv-exe-'));
const app = join(stage, 'app');
mkdirSync(app, { recursive: true });

// Código (igual que empaquetar-pc.sh: sin video promo ni la carpeta de descargas).
for (const carpeta of ['src', 'api', 'electron']) cpSync(join(RAIZ, carpeta), join(app, carpeta), { recursive: true });
mkdirSync(join(app, 'public'), { recursive: true });
for (const item of readDirNames(join(RAIZ, 'public'))) {
  if (item === 'video' || item === 'descargas') continue;
  cpSync(join(RAIZ, 'public', item), join(app, 'public', item), { recursive: true });
}

// package.json de empaquetado: mismo que el real, pero apuntando a Electron
// como entrypoint (el real sigue apuntando a src/server.js para Vercel/PC).
const pkg = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8'));
const electronVersion = JSON.parse(readFileSync(join(RAIZ, 'node_modules/electron/package.json'), 'utf8')).version;
pkg.main = 'electron/main.cjs';
pkg.author = 'MV Agendate IA';
delete pkg.scripts;
pkg.devDependencies = { electron: electronVersion };
writeFileSync(join(app, 'package.json'), JSON.stringify(pkg, null, 2));

// node_modules ya instalados. electron-packager necesita poder resolver el
// módulo "electron" desde acá para validar la versión (aunque el binario que
// termina empaquetado es el de la plataforma destino, descargado aparte); lo
// excluye solo del paquete final por su propia lista de ignorados.
const nmOrigen = join(RAIZ, 'node_modules');
const nmDestino = join(app, 'node_modules');
mkdirSync(nmDestino, { recursive: true });
for (const item of readDirNames(nmOrigen)) {
  if (item === 'electron-packager') continue;
  cpSync(join(nmOrigen, item), join(nmDestino, item), { recursive: true });
}

console.log('Empaquetando para Windows x64 (baja el binario de Electron la primera vez)...');
// Fijar el ícono/metadata del .exe en Windows requiere rcedit, que en Linux/Mac
// a su vez requiere Wine para correr (en Windows nativo no hace falta nada más).
const distDir = join(stage, 'dist');
execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', [
  '--yes', 'electron-packager', app, NOMBRE_APP,
  '--platform=win32', '--arch=x64',
  `--electron-version=${electronVersion}`,
  `--out=${distDir}`,
  `--icon=${join(RAIZ, 'build/logo-mv.ico')}`,
  `--app-version=${pkg.version}`,
  '--overwrite', '--quiet',
], {
  // Sin forzar un mirror: usa la descarga oficial de GitHub, que funciona
  // normal en GitHub Actions y en una PC con internet sin restricciones. Si
  // hace falta un mirror (red restringida), definí ELECTRON_MIRROR antes de
  // correr el script.
  stdio: 'inherit',
  env: process.env,
});

const carpetaEmpaquetada = join(distDir, `${NOMBRE_APP}-win32-x64`);
const zipDestino = join(OUT, NOMBRE_ZIP);
await zipearCarpeta(carpetaEmpaquetada, `${NOMBRE_APP}-win32-x64`, zipDestino);
rmSync(stage, { recursive: true, force: true });
console.log(`Generado: public/descargas/${NOMBRE_ZIP}`);

function readDirNames(dir) {
  return existsSync(dir) ? readdirSync(dir) : [];
}
function zipearCarpeta(carpetaOrigen, nombreDentroDelZip, destino) {
  return new Promise((resolve, reject) => {
    const out = createWriteStream(destino);
    const archivo = new ZipArchive({ zlib: { level: 6 } });
    out.on('close', resolve);
    archivo.on('error', reject);
    archivo.pipe(out);
    archivo.directory(carpetaOrigen, nombreDentroDelZip);
    archivo.finalize();
  });
}
