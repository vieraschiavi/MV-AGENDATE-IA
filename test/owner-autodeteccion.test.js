// © 2026 Martín Viera. Todos los derechos reservados.

// El activador de la versión DUEÑO tiene que encontrar solo dónde quedó
// instalado el programa.
//
// Por qué: el instalador es `oneClick:false` + `allowToChangeInstallationDirectory`
// (ver instaladores.test.js), o sea que la carpeta la elige el cliente y puede
// estar en cualquier disco. La versión anterior de este .bat exigía que alguien
// lo copiara A MANO al lado del ejecutable y, si no acertaba, cortaba con un
// "no encontré el programa" — sobre una instalación que estaba ahí nomás.
//
// El riesgo del arreglo es el opuesto y es peor: buscar de más y terminar
// escribiendo en una carpeta que NO es la del programa. Por eso la mitad de
// estos tests no verifican que encuentre, sino que NO toque nada sin confirmar
// primero el archivo marcador.
//
// Estos .bat no los corre nadie en CI —sólo el cliente, en su Windows, cuando ya
// compró— así que se verifican leyendo el texto del script.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const BAT = 'INSTALADOR/OWNER/Convertir-a-version-dueno.bat';

const TEXTO = readFileSync(join(RAIZ, BAT), 'utf8');

// Sólo las líneas ejecutables. Igual que en instaladores.test.js: este .bat
// explica EN COMENTARIOS qué hacía antes y por qué se cambió ("antes había que
// copiarlo a mano..."), así que un chequeo sobre el texto crudo se dispararía
// con la explicación en vez de con el código.
const CODIGO = TEXTO.split('\n')
  .filter((l) => !/^\s*(REM\b|::|#)/i.test(l))
  .join('\n');

const lineasCodigo = CODIGO.split('\n');

// El archivo que este script tiene que reescribir. Sirve de marcador: si está,
// la carpeta es la del programa; si no está, no lo es.
const MARCADOR = /owner-config\.cjs/;

test('busca la instalación en el registro de Windows, no sólo al lado del .bat', () => {
  // Ahí es donde el instalador anota la carpeta que el cliente ELIGIÓ. Es la
  // única fuente que sabe de un "D:\Mis Programas\..." elegido hace meses:
  // barrer discos a ciegas no escala y adivinar el nombre de la carpeta falla
  // apenas alguien la renombra.
  assert.match(CODIGO, /reg query/i, 'sin leer el registro no puede saber dónde eligió instalar el cliente');
  assert.match(CODIGO, /InstallLocation/i, 'el valor que guarda la carpeta elegida es InstallLocation');
  assert.match(CODIGO, /CurrentVersion\\Uninstall/i, 'las entradas de "Agregar o quitar programas" son las que traen InstallLocation');
});

test('mira el registro del usuario Y el de la máquina', () => {
  // El instalador es perMachine:false (por usuario) → HKCU. Pero una copia vieja
  // instalada como admin, o una futura para todos los usuarios, queda en HKLM.
  // Mirar sólo uno deja media base de clientes sin detección.
  assert.match(CODIGO, /HKCU/, 'falta el registro por usuario, que es donde instala esta app');
  assert.match(CODIGO, /HKLM/, 'falta el registro de máquina: una instalación como admin quedaría invisible');
});

test('tiene alternativas por si el registro no dice nada', () => {
  // Una instalación reparada a mano, o una carpeta copiada de otra PC, no deja
  // entrada de desinstalación. Con el registro como única vía, ahí se rinde.
  assert.match(CODIGO, /LOCALAPPDATA/i, 'falta la carpeta por defecto del instalador por usuario');
  assert.match(CODIGO, /ProgramFiles/i, 'falta Archivos de programa, donde cae una instalación para todos');
});

// EL test del riesgo que introduce buscar solo.
test('NUNCA da por buena una carpeta sin confirmar el archivo del programa', () => {
  // Escribir en la carpeta equivocada es peor que no encontrar nada: deja basura
  // en el disco de otro programa y el cliente igual se queda sin su versión
  // dueño, ahora con un archivo ajeno pisado.
  //
  // Se comprueba estructuralmente: la ÚNICA asignación de APP con contenido
  // tiene que estar en la misma línea que el `if exist` del marcador. Así el
  // chequeo sigue valiendo aunque mañana se agregue una quinta estrategia.
  const asignaciones = lineasCodigo.filter((l) => /set\s+"?APP=[^"\s]/i.test(l));
  assert.ok(asignaciones.length > 0, 'el script no asigna APP en ningún lado: no encontraría nunca');
  for (const linea of asignaciones) {
    assert.match(linea, /if exist/i, `esta línea fija APP sin verificar que la carpeta exista: ${linea.trim()}`);
    assert.match(linea, MARCADOR, `esta línea fija APP sin confirmar el archivo del programa: ${linea.trim()}`);
  }
});

test('si no encontró nada, corta ANTES de escribir un solo archivo', () => {
  // Sin este corte, %APP% queda vacío y las escrituras se resuelven a rutas
  // relativas: el script "funcionaría" creando archivos sueltos en la carpeta
  // desde donde se hizo doble clic, y diría [OK].
  const corte = CODIGO.search(/if not defined APP goto/i);
  assert.ok(corte >= 0, 'falta el corte "if not defined APP" antes de tocar archivos');

  // La primera escritura real (redirección a un archivo) tiene que venir después.
  const escritura = CODIGO.search(/^\s*>+\s*"%(CFG|DIAS)%"/m);
  assert.ok(escritura >= 0, 'el script no escribe los archivos de la variante dueño');
  assert.ok(corte < escritura, 'se escribe antes de haber confirmado que la instalación existe');
});

test('cierra el programa antes de tocarle los archivos', () => {
  // Dos razones, las dos reales: Electron lee owner-config.cjs AL ARRANCAR (con
  // la app abierta el cambio no se ve y el cliente cree que no funcionó), y los
  // archivos pueden estar bloqueados en pleno uso. Pedírselo al usuario en un
  // echo y confiar no alcanza.
  assert.match(CODIGO, /taskkill/i, 'hay que cerrar la app, no pedir que la cierren');
  const conTaskkill = lineasCodigo.filter((l) => /taskkill/i.test(l));
  for (const linea of conTaskkill) {
    assert.match(linea, /MV Agendate IA\.exe/i, `taskkill sin apuntar al ejecutable propio: ${linea.trim()}`);
  }
  const matar = CODIGO.search(/taskkill/i);
  const escritura = CODIGO.search(/^\s*>+\s*"%(CFG|DIAS)%"/m);
  assert.ok(matar < escritura, 'se escriben los archivos con el programa todavía abierto');
});

test('guarda copia de respaldo antes de pisar, y sólo la primera vez', () => {
  // Sin respaldo no hay vuelta atrás a la versión con prueba. Y sin el
  // "if not exist", correrlo dos veces respaldaría el archivo YA convertido:
  // el .original pasaría a ser otra copia dueño y la reversión no revertiría nada.
  const copias = lineasCodigo.filter((l) => /^\s*copy\b/i.test(l) && /\.original"/i.test(l));
  assert.ok(copias.length >= 2, 'faltan respaldos de los dos archivos que se reescriben');
  const respaldos = copias.filter((l) => /copy\s+\/y\s+"%\w+%"\s+"%\w+%\.original"/i.test(l));
  for (const linea of respaldos) {
    assert.match(linea, /^\s*if not exist\s+"%\w+%\.original"/i,
      `respaldo incondicional: al segundo uso pisaría el original con la versión ya convertida — ${linea.trim()}`);
  }
});

test('comprueba que lo escrito quedó escrito, en vez de anunciar [OK] a ciegas', () => {
  // Es el modo de fallo caro: carpeta protegida o antivirus, la escritura no
  // pasa, el cliente lee "[OK] listo" y abre un programa que le sigue pidiendo
  // licencia. Sin este chequeo el script miente con toda confianza.
  //
  // Se mira sólo lo que viene DESPUÉS de la última escritura: antes de escribir
  // ya hay un findstr, pero ese detecta si la copia YA estaba convertida — no
  // prueba nada sobre lo que se acaba de escribir.
  const ultimaEscritura = CODIGO.lastIndexOf('>> "%DIAS%"');
  assert.ok(ultimaEscritura > 0, 'no se encontró la escritura de los archivos');
  const despues = CODIGO.slice(ultimaEscritura);
  for (const archivo of ['CFG', 'DIAS']) {
    assert.match(despues, new RegExp(`findstr[^\\r\\n]*"%${archivo}%"`, 'i'),
      `no se relee %${archivo}% después de escribirlo: si esa escritura falló, nadie se entera`);
  }
  assert.match(despues, /if errorlevel 1 goto :fallo/i, 'si la relectura falla tiene que irse por el camino de error');
  assert.match(CODIGO, /:fallo\b/, 'falta la etiqueta que explica el fallo de escritura');
  // Y el diagnóstico útil: los dos motivos reales por los que no pudo escribir.
  const fallo = CODIGO.slice(CODIGO.indexOf('\n:fallo'));
  assert.match(fallo, /antivirus/i, 'el antivirus es una de las dos causas y el cliente no la va a adivinar');
  assert.match(fallo, /administrador/i, 'la otra es instalar en Archivos de programa sin permisos');
});

test('el mensaje de "no encontré" dice dónde buscó y no termina en éxito', () => {
  // Si igual falla, el cliente tiene que poder descartar causas solo. Un "no lo
  // encontré" pelado lo deja sin nada que probar.
  const noEncontre = CODIGO.slice(CODIGO.indexOf('\n:no_encontre'));
  assert.ok(noEncontre.length > 0, 'falta la etiqueta :no_encontre');
  assert.match(noEncontre, /registro/i, 'no dice que ya miró el registro');
  assert.match(noEncontre, /LOCALAPPDATA|Programs/i, 'no dice las carpetas donde miró');
  assert.match(noEncontre, /copia ESTE archivo|copi\w* este archivo/i,
    'falta la salida manual para una carpeta suelta (disco externo), que es el caso que la búsqueda no cubre');
  assert.match(noEncontre, /exit \/b 1/, 'no encontrar la instalación no puede reportarse como éxito');
});

test('el barrido del registro escapa el pipe y el redirect dentro del for /f', () => {
  // Detalle de batch que rompe en silencio: adentro de un `for /f (' ... ')` el
  // `|` y el `2>` hay que escribirlos `^|` y `2^>`. Sin escapar, cmd los procesa
  // al parsear la línea y el comando queda partido — el for no itera nada y la
  // detección por registro se vuelve un no-op sin ningún mensaje de error.
  const forRegistro = lineasCodigo.filter((l) => /for \/f/i.test(l) && /reg query/i.test(l));
  assert.ok(forRegistro.length > 0, 'no se encontró el for /f que recorre el registro');
  for (const linea of forRegistro) {
    assert.match(linea, /\^\|/, `pipe sin escapar en el for /f: ${linea.trim()}`);
    assert.match(linea, /2\^>nul/i, `redirección de error sin escapar en el for /f: ${linea.trim()}`);
  }
});

test('se ancla a su carpeta y soporta rutas con espacios', () => {
  // Mismas reglas que el resto de los .bat del repo: el cliente instala en
  // "D:\PROGRAMAS MV\..." y hay que sobrevivir al espacio.
  assert.match(CODIGO, /cd \/d "%~dp0"/, 'sin cd /d "%~dp0" trabaja sobre la carpeta equivocada');
  const usaRetardada = /![A-Za-z_]\w*!/.test(CODIGO);
  if (usaRetardada) {
    assert.match(CODIGO, /setlocal enabledelayedexpansion/i,
      'usa !VAR! sin habilitar la expansión retardada: se leería el valor viejo');
  }
});

test('reescribe los dos archivos de la variante, no sólo el de Electron', () => {
  // El mismo par que fija el empaquetador (ver variante-instalador.test.js):
  // owner-config.cjs lo lee Electron y dias-prueba.js lo lee el paquete .bat.
  // Convertir sólo uno deja media copia en modo dueño.
  assert.match(CODIGO, /owner-config\.cjs/, 'falta el config que lee Electron');
  assert.match(CODIGO, /dias-prueba\.js/, 'falta el módulo que lee el paquete portable');
  assert.match(CODIGO, /diasPrueba: 0/, 'el sello de la variante dueño es diasPrueba en 0');
  assert.match(CODIGO, /DIAS_FIJADOS = 0/, 'y DIAS_FIJADOS en 0 para el portable');
});
