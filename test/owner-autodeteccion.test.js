// © 2026 Martín Viera. Todos los derechos reservados.

// El activador de la versión DUEÑO: qué deja escrito y dónde lo busca.
//
// DOS COSAS CAMBIARON Y LAS DOS SE PRUEBAN ACÁ.
//
// 1. QUÉ ESCRIBE. Antes escribía `module.exports = { diasPrueba: 0 };` — o sea
//    que la "llave" del producto era un archivo de texto de una línea que
//    cualquiera reproducía con el Bloc de notas. Ahora deja una licencia
//    perpetua FIRMADA con Ed25519, que la app verifica igual que la de un
//    cliente que pagó. Por eso el .bat ya no vive en el repo: se GENERA, porque
//    lleva una licencia adentro y este repo es público.
//
// 2. DÓNDE BUSCA. El instalador deja elegir carpeta y disco (oneClick:false +
//    allowToChangeInstallationDirectory, ver instaladores.test.js), así que la
//    instalación puede estar en cualquier lado. Antes había que copiar el .bat
//    a mano al lado del ejecutable y, si no acertabas, cortaba con un "no
//    encontré el programa" sobre una instalación que estaba ahí nomás.
//
// El riesgo que introduce buscar solo es el opuesto y es peor: escribir en la
// carpeta de otro programa. Por eso varios de estos tests no verifican que
// encuentre, sino que NO toque nada sin confirmar primero el archivo marcador.
//
// Estos .bat no los corre nadie en CI —sólo el dueño, en su Windows— así que se
// verifican leyendo el texto del script generado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { verificarLicencia } from '../src/store/licencia-firma.js';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));

// Se genera UNA vez: firmar es barato pero lanzar un proceso por test no.
const TEXTO = (() => {
  const dir = mkdtempSync(join(tmpdir(), 'mv-activador-'));
  try {
    const salida = join(dir, 'Convertir-a-version-dueno.bat');
    execFileSync(process.execPath, [join(RAIZ, 'scripts', 'licencias-firma.js'), 'activador', '--salida', salida],
      { cwd: RAIZ, encoding: 'utf8' });
    return readFileSync(salida, 'utf8');
  } finally { rmSync(dir, { recursive: true, force: true }); }
})();

// Sólo las líneas ejecutables. Igual que en instaladores.test.js: este .bat
// explica EN COMENTARIOS qué hacía antes y por qué se cambió ("antes escribía
// diasPrueba: 0…"), así que un chequeo sobre el texto crudo se dispararía con
// la explicación en vez de con el código.
const CODIGO = TEXTO.split('\n')
  .filter((l) => !/^\s*(rem\b|::|#)/i.test(l))
  .join('\n');
const lineasCodigo = CODIGO.split('\n');

// --- Lo que deja escrito ---

test('deja una licencia FIRMADA, no una bandera en un archivo de texto', () => {
  // El corazón del cambio. Con la bandera, la llave del producto era
  // `diasPrueba: 0`: cualquiera la escribía a mano y tenía la versión completa.
  const codigo = (TEXTO.match(/MVA1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/) || [])[0];
  assert.ok(codigo, 'el .bat tiene que llevar una licencia adentro: sin eso no activa nada');

  const v = verificarLicencia(codigo);
  assert.equal(v.ok, true, 'si la licencia no verifica, el .bat deja un archivo que la app rechaza');
  assert.equal(v.datos.x, null, 'la del dueño es perpetua: no se le puede vencer sola');
});

test('ya no escribe la bandera vieja por ningún lado', () => {
  assert.ok(!/diasPrueba/i.test(CODIGO),
    'volver a escribir diasPrueba reabre el agujero: esa línea la reproduce cualquiera con el Bloc de notas');
  assert.match(CODIGO, /licencia\.txt/, 'la licencia va a un licencia.txt que la app lee y verifica');
});

test('el .bat generado NO puede vivir en el repo', () => {
  // Lleva una licencia perpetua adentro y este repo es público: commitearlo
  // sería publicar la versión completa del producto.
  const gitignore = readFileSync(join(RAIZ, '.gitignore'), 'utf8');
  assert.match(gitignore, /INSTALADOR\/OWNER\//,
    'la carpeta del dueño tiene que estar ignorada: ahí van el .bat y el .exe sin límite');
});

// --- Dónde busca la instalación ---

test('busca la instalación en el registro de Windows, no sólo al lado del .bat', () => {
  // Ahí es donde el instalador anota la carpeta que el cliente ELIGIÓ. Es la
  // única fuente que sabe de un "D:\\Mis Programas\\..." elegido hace meses:
  // barrer discos a ciegas no escala y adivinar el nombre de la carpeta falla
  // apenas alguien la renombra.
  assert.match(CODIGO, /reg query/i, 'sin leer el registro no puede saber dónde eligió instalar');
  assert.match(CODIGO, /InstallLocation/i, 'el valor que guarda la carpeta elegida es InstallLocation');
  assert.match(CODIGO, /CurrentVersion\\Uninstall/i, 'las entradas de "Agregar o quitar programas" son las que traen InstallLocation');
});

test('mira el registro del usuario Y el de la máquina', () => {
  // El instalador es perMachine:false (por usuario) → HKCU. Pero una copia
  // instalada como admin, o una futura para todos los usuarios, queda en HKLM.
  assert.match(CODIGO, /HKCU/, 'falta el registro por usuario, que es donde instala esta app');
  assert.match(CODIGO, /HKLM/, 'falta el de máquina: una instalación como admin quedaría invisible');
});

test('tiene alternativas por si el registro no dice nada', () => {
  // Una instalación reparada a mano, o una carpeta copiada de otra PC, no deja
  // entrada de desinstalación. Con el registro como única vía, ahí se rinde.
  assert.match(CODIGO, /LOCALAPPDATA/i, 'falta la carpeta por defecto del instalador por usuario');
  assert.match(CODIGO, /ProgramFiles/i, 'falta Archivos de programa, donde cae una instalación para todos');
});

// EL test del riesgo que introduce buscar solo.
test('NUNCA da por buena una carpeta sin confirmar el archivo del programa', () => {
  // Escribir en la carpeta equivocada es peor que no encontrar nada: deja
  // basura en el disco de otro programa y el dueño igual se queda sin su
  // versión completa.
  //
  // Se comprueba estructuralmente: la ÚNICA asignación de APP con contenido
  // tiene que estar en la misma línea que el `if exist` del marcador. Así el
  // chequeo sigue valiendo aunque mañana se agregue una quinta estrategia.
  const asignaciones = lineasCodigo.filter((l) => /set\s+"?APP=[^"\s]/i.test(l));
  assert.ok(asignaciones.length > 0, 'el script no asigna APP en ningún lado: no encontraría nunca');
  for (const linea of asignaciones) {
    assert.match(linea, /if exist/i, `fija APP sin verificar que la carpeta exista: ${linea.trim()}`);
    assert.match(linea, /%MARCA%|owner-config\.cjs/, `fija APP sin confirmar el archivo del programa: ${linea.trim()}`);
  }
});

test('si no encontró nada, corta ANTES de escribir', () => {
  // Sin este corte, %APP% queda vacío y la escritura se resuelve a una ruta
  // relativa: el script "funcionaría" dejando un licencia.txt suelto en la
  // carpeta desde donde se hizo doble clic, y diría LISTO.
  const corte = CODIGO.search(/if not defined APP goto/i);
  const escritura = CODIGO.search(/^\s*>\s*"%APP%\\licencia\.txt"/m);
  assert.ok(corte >= 0, 'falta el corte "if not defined APP" antes de escribir');
  assert.ok(escritura >= 0, 'el script no escribe el licencia.txt');
  assert.ok(corte < escritura, 'se escribe antes de haber confirmado que la instalación existe');
});

test('cierra el programa antes de tocarle los archivos', () => {
  // La app lee la licencia AL ARRANCAR: con la ventana abierta el cambio no se
  // ve y el dueño cree que no funcionó. Pedírselo en un echo y confiar no
  // alcanza.
  assert.match(CODIGO, /taskkill/i, 'hay que cerrar la app, no pedir que la cierren');
  for (const linea of lineasCodigo.filter((l) => /taskkill/i.test(l))) {
    assert.match(linea, /MV Agendate IA\.exe/i, `taskkill sin apuntar al ejecutable propio: ${linea.trim()}`);
  }
  assert.ok(CODIGO.search(/taskkill/i) < CODIGO.search(/^\s*>\s*"%APP%\\licencia\.txt"/m),
    'se escribe con el programa todavía abierto');
});

test('comprueba que la licencia quedó escrita, en vez de anunciar LISTO a ciegas', () => {
  // El modo de fallo caro: carpeta protegida o antivirus, la escritura no pasa,
  // el dueño lee "LISTO" y abre un programa que le sigue pidiendo la clave.
  const escritura = CODIGO.search(/^\s*>\s*"%APP%\\licencia\.txt"/m);
  const despues = CODIGO.slice(escritura);
  assert.match(despues, /findstr[^\r\n]*licencia\.txt/i, 'no relee el archivo después de escribirlo');
  assert.match(despues, /if errorlevel 1 goto :fallo/i, 'si la relectura falla tiene que irse por el camino de error');
  assert.ok(despues.search(/goto :fallo/) < despues.search(/LISTO/),
    'el cartel de éxito aparece antes de comprobar que se escribió algo');
  const fallo = CODIGO.slice(CODIGO.indexOf('\n:fallo'));
  assert.match(fallo, /antivirus/i, 'el antivirus es una de las dos causas y no se adivina');
  assert.match(fallo, /administrador/i, 'la otra es instalar en Archivos de programa sin permisos');
});

test('el mensaje de "no encontré" dice dónde buscó y no termina en éxito', () => {
  const noEncontre = CODIGO.slice(CODIGO.indexOf('\n:no_encontre'));
  assert.ok(noEncontre.length > 0, 'falta la etiqueta :no_encontre');
  assert.match(noEncontre, /registro/i, 'no dice que ya miró el registro');
  assert.match(noEncontre, /LOCALAPPDATA|Programs/i, 'no dice las carpetas donde miró');
  assert.match(noEncontre, /Copia ESTE archivo/i,
    'falta la salida manual para una carpeta suelta (disco externo), que es el caso que la búsqueda no cubre');
  assert.match(noEncontre, /exit \/b 1/, 'no encontrar la instalación no puede reportarse como éxito');
});

test('el barrido del registro escapa el pipe y el redirect dentro del for /f', () => {
  // Detalle de batch que rompe en silencio: adentro de un `for /f (' ... ')` el
  // `|` y el `2>` hay que escribirlos `^|` y `2^>`. Sin escapar, cmd los procesa
  // al parsear la línea y el comando queda partido — el for no itera nada y la
  // detección por registro se vuelve un no-op, sin ningún mensaje de error.
  const forRegistro = lineasCodigo.filter((l) => /for \/f/i.test(l) && /reg query/i.test(l));
  assert.ok(forRegistro.length > 0, 'no se encontró el for /f que recorre el registro');
  for (const linea of forRegistro) {
    assert.match(linea, /\^\|/, `pipe sin escapar en el for /f: ${linea.trim()}`);
    assert.match(linea, /2\^>nul/i, `redirección de error sin escapar en el for /f: ${linea.trim()}`);
  }
});

test('se ancla a su carpeta, soporta rutas con espacios y sale con CRLF', () => {
  assert.match(CODIGO, /cd \/d "%~dp0"/, 'sin cd /d "%~dp0" la búsqueda "al lado del .bat" mira otra carpeta');
  assert.match(TEXTO, /\r\n/, 'los .bat necesitan CRLF: con LF los bloques ( ) fallan en Windows');
});

test('sin clave privada no se genera ningún activador', () => {
  // Un .bat sin licencia firmada adentro no activa nada: generarlo igual sería
  // entregar una herramienta que no hace lo que dice.
  let err = null;
  try {
    execFileSync(process.execPath, [join(RAIZ, 'scripts', 'licencias-firma.js'), 'activador'],
      { cwd: RAIZ, encoding: 'utf8', env: { ...process.env, MV_LICENCIA_PRIVADA_PEM: '' } });
  } catch (e) { err = e; }
  assert.ok(err, 'generó un activador sin poder firmar');
  assert.match(String(err.stderr || ''), /licencias-firma\.js init/, 'no dice cómo conseguir la clave');
});
