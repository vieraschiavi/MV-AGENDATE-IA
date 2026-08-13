#!/usr/bin/env node
// © 2026 Martín Viera. Todos los derechos reservados.

// ============================================================
// Claves de firma y emisión de licencias MVA1 (Ed25519).
//
//   node scripts/licencias-firma.js init [--reemplazar-par]
//   node scripts/licencias-firma.js emitir --email cliente@mail.com [--nombre "..."] [--plan full] [--dias 365]
//   node scripts/licencias-firma.js propia [--nombre "..."]
//   node scripts/licencias-firma.js activador [--salida dist/Convertir-a-version-dueno.bat]
//
// La clave PRIVADA es lo que vale: quien la tenga puede fabricar licencias de
// tu producto. Se guarda en scripts/licencia-privada.pem, que está en
// .gitignore, o en la variable de entorno MV_LICENCIA_PRIVADA_PEM (que es como
// la lee el servidor en Vercel). Nunca va al repo — y este repo es PÚBLICO.
//
// La PÚBLICA no es secreta: se escribe en src/store/clave-publica.js y viaja
// dentro de cada copia entregada.
// ============================================================
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { PEM_FILE, PUB_FILE, clavePrivada, firmarLicencia, payloadLicencia } from './firmar-licencia.js';

const argv = process.argv.slice(2);
const comando = argv[0] || '';
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);

const salir = (msg, ...extra) => { console.error(msg); for (const e of extra) console.error(e); process.exit(1); };

function escribirPublica(b64) {
  const texto = readFileSync(PUB_FILE, 'utf8');
  const nuevo = texto.replace(/(CLAVE_PUBLICA_B64\s*=\s*')[^']*(')/, `$1${b64}$2`);
  if (nuevo === texto) salir('✘ No pude escribir la clave pública en ' + PUB_FILE + ': ¿cambió el formato del archivo?');
  writeFileSync(PUB_FILE, nuevo);
}

// --- init: genera el par ---------------------------------------------------
if (comando === 'init') {
  // Pisar la privada invalida TODAS las licencias ya vendidas: los clientes que
  // pagaron se quedan con un código que la app nueva rechaza. Por eso hay que
  // pedirlo explícitamente.
  if (existsSync(PEM_FILE) && !flag('reemplazar-par')) {
    salir('✘ Ya existe ' + PEM_FILE + '.',
      '  Generar un par nuevo INVALIDA todas las licencias ya emitidas: el cliente que pagó',
      '  se queda con un código que la app rechaza.',
      '  Si de verdad querés reemplazarlo: --reemplazar-par');
  }
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  mkdirSync(dirname(PEM_FILE), { recursive: true });
  writeFileSync(PEM_FILE, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  const pub = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  escribirPublica(pub);
  console.log('✔ Par Ed25519 generado.');
  console.log('  Privada  → ' + PEM_FILE + '   (NO se sube: está en .gitignore)');
  console.log('  Pública  → ' + PUB_FILE);
  console.log('');
  console.log('  Para que el servidor pueda emitir licencias al cobrar, cargá la privada como');
  console.log('  variable de entorno MV_LICENCIA_PRIVADA_PEM en Vercel (pegá el PEM entero).');
  process.exit(0);
}

// --- Todo lo demás necesita la privada -------------------------------------
// Se corta ACÁ, antes de hacer nada, con el camino de salida escrito. Un
// generador que corre a medias y falla al final deja al que emite la licencia
// sin saber si tiene que rehacer algo.
if (!clavePrivada()) {
  salir('✘ Falta la clave privada: sin ella no se puede firmar ninguna licencia.',
    '',
    '  Si ya la tenías:      copiala a ' + PEM_FILE,
    '  Si es la primera vez: node scripts/licencias-firma.js init',
    '',
    '  No hay atajo: una licencia sin firma no activa nada.');
}

/** Firma, o corta con el mensaje de firmar-licencia.js (que ya explica la salida). */
const firmar = (payload) => { try { return firmarLicencia(payload); } catch (e) { salir('✘ ' + e.message); } };
const payloadDe = payloadLicencia;

if (comando === 'emitir') {
  const email = arg('email');
  if (!email) salir('✘ Falta --email: la licencia se emite a nombre de alguien.');
  const dias = arg('dias', null);
  const codigo = firmar(payloadDe({
    nombre: arg('nombre', email), email, plan: arg('plan', 'full'), dias
  }));
  console.log(codigo);
  console.error('');
  console.error('✔ Licencia ' + (dias ? `por ${dias} días` : 'PERPETUA') + ' para ' + email + '.');
  console.error('  Mandásela al cliente: la pega en el programa, en Licencia → Activar.');
  process.exit(0);
}

if (comando === 'propia') {
  const codigo = firmar(payloadDe({
    nombre: arg('nombre', 'Uso propio'), email: 'uso-propio@local', plan: 'full', dias: null
  }));
  console.log(codigo);
  console.error('');
  console.error('✔ Licencia PERPETUA de uso propio.');
  console.error('  La usa el empaquetador de la variante dueño (npm run empaquetar-exe-owner).');
  process.exit(0);
}

if (comando === 'activador') {
  const codigo = firmar(payloadDe({
    nombre: arg('nombre', 'Uso propio'), email: 'uso-propio@local', plan: 'full', dias: null
  }));
  const salida = resolve(process.cwd(), arg('salida', join('dist', 'Convertir-a-version-dueno.bat')));
  mkdirSync(dirname(salida), { recursive: true });
  writeFileSync(salida, batActivador(codigo).replace(/\n/g, '\r\n'));  // CRLF: los bloques ( ) de batch fallan con LF
  console.log('OK: ' + salida);
  console.log('    Lleva adentro una licencia PERPETUA firmada y verificada.');
  console.log('    NO lo repartas: activa cualquier instalación, para siempre.');
  process.exit(0);
}

salir('Uso:',
  '  node scripts/licencias-firma.js init [--reemplazar-par]',
  '  node scripts/licencias-firma.js emitir --email cliente@mail.com [--nombre "..."] [--plan full] [--dias 365]',
  '  node scripts/licencias-firma.js propia [--nombre "..."]',
  '  node scripts/licencias-firma.js activador [--salida dist/Convertir-a-version-dueno.bat]');

// ---------------------------------------------------------------------------
// El .bat que convierte una instalación ya hecha en la versión dueño.
//
// Antes escribía `module.exports = { diasPrueba: 0 };` — o sea que la "llave"
// era un archivo de texto que cualquiera reproducía con el Bloc de notas.
// Ahora deja un licencia.txt con una licencia perpetua FIRMADA adentro, que la
// app verifica igual que la de un cliente que pagó.
//
// Busca solo dónde quedó instalado el programa (registro de Windows incluido):
// el instalador deja elegir carpeta y disco, así que puede estar en cualquier
// lado. Cada candidato se confirma con un archivo del programa antes de
// escribir nada.
// ---------------------------------------------------------------------------
function batActivador(licencia) {
  return `@echo off
rem ============================================================
rem  MV Agendate IA - ACTIVAR VERSION DUENO
rem
rem  Doble clic. Nada mas: busca solo donde quedo instalado el programa.
rem
rem  DONDE BUSCA, en este orden:
rem    1. Al lado de este archivo   -> si ya lo copiaste, sigue andando
rem    2. El registro de Windows    -> la carpeta que ELEGISTE al instalar
rem    3. %%LOCALAPPDATA%%\\Programs   -> el lugar por defecto
rem    4. Archivos de programa      -> por si se instalo para todos
rem  Cada candidato se CONFIRMA con un archivo del programa antes de escribir.
rem
rem  Lo que deja es una LICENCIA PERPETUA FIRMADA (Ed25519), no una bandera.
rem  Antes esto escribia "diasPrueba: 0" en un archivo de texto: cualquiera lo
rem  hacia con el Bloc de notas y tenia el producto completo gratis.
rem
rem  NO lo repartas: activa cualquier instalacion, para siempre.
rem ============================================================
setlocal
cd /d "%~dp0"
title Activar MV Agendate IA - version dueno

set "MARCA=electron\\owner-config.cjs"
set "APP="

echo.
echo  Buscando la instalacion...

call :probar "resources\\app"
if not defined APP call :probar "..\\resources\\app"
if not defined APP call :probar "."
if not defined APP call :registro "HKCU"
if not defined APP call :registro "HKLM"
if not defined APP if exist "%LOCALAPPDATA%\\Programs" for /d %%D in ("%LOCALAPPDATA%\\Programs\\*") do if not defined APP call :probar "%%~fD\\resources\\app"
if not defined APP if exist "%ProgramFiles%" for /d %%D in ("%ProgramFiles%\\*") do if not defined APP call :probar "%%~fD\\resources\\app"
if not defined APP if exist "%ProgramFiles(x86)%" for /d %%D in ("%ProgramFiles(x86)%\\*") do if not defined APP call :probar "%%~fD\\resources\\app"

if not defined APP goto :no_encontre

echo  [OK] Encontrada en:
echo       %APP%
echo.
pause

rem El programa lee la licencia al arrancar: con la ventana abierta el cambio no
rem se ve hasta reiniciarlo. Se cierra aca en vez de pedirselo al usuario.
taskkill /F /IM "MV Agendate IA.exe" /T >nul 2>&1

> "%APP%\\licencia.txt" echo ${licencia}
findstr /c:"MVA1." "%APP%\\licencia.txt" >nul 2>nul
if errorlevel 1 goto :fallo

echo.
echo  ============================================================
echo   LISTO. Esta copia quedo en version DUENO, sin vencimiento.
echo  ============================================================
echo   - No pide clave de licencia.
echo   - No tiene limite de dias.
echo.
echo   Para volver a la version normal: borra este archivo
echo     %APP%\\licencia.txt
echo.
pause
exit /b 0

:probar
if defined APP exit /b 0
if exist "%~1\\%MARCA%" set "APP=%~1"
exit /b 0

:registro
for /f "tokens=2,*" %%A in ('reg query "%~1\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall" /s /v InstallLocation 2^>nul ^| findstr /i "REG_SZ"') do (
  if not defined APP call :probar "%%B\\resources\\app"
  if not defined APP call :probar "%%B"
)
exit /b 0

:no_encontre
echo.
echo  [X] No encontre MV Agendate IA instalado en esta PC.
echo.
echo      Busque al lado de este archivo, en el registro de Windows, en
echo      %%LOCALAPPDATA%%\\Programs y en Archivos de programa.
echo.
echo      Las dos razones habituales:
echo        - Todavia no esta instalado: instalalo primero y volve a correr esto.
echo        - Lo instalaste en una carpeta suelta (un disco externo, una carpeta
echo          propia). Copia ESTE archivo adentro de esa carpeta y volve a
echo          hacer doble clic.
echo.
echo      Para encontrarla: clic derecho en el acceso directo del escritorio
echo      -^> "Abrir ubicacion del archivo".
echo.
pause
exit /b 1

:fallo
echo.
echo  [X] No pude escribir la licencia en:
echo      %APP%
echo.
echo      Suele ser una de estas:
echo        - Se instalo en "Archivos de programa" y hace falta ejecutar este
echo          .bat como administrador (clic derecho -^> "Ejecutar como
echo          administrador").
echo        - El antivirus bloquea la escritura en esa carpeta.
echo.
pause
exit /b 1
`;
}
