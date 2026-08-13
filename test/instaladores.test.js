// © 2026 Martín Viera. Todos los derechos reservados.

// Tests de los lanzadores de Windows (.bat) que usa el cliente en su PC.
// Existen porque estos archivos NO los corre nadie en CI —solo el cliente, en
// su máquina, cuando ya compró— así que un error acá se descubre tarde y mal.
// Un caso real: INSTALAR.bat mandaba a ejecutar INICIAR.bat, que no existía,
// copiaba un .env.example inexistente (y avisaba "[OK] creado" igual), y
// bajaba 568 MB de herramientas de desarrollo hasta llenar el disco del
// cliente — reportando el error como "revisa tu conexion a internet".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));

// Los .bat que toca un usuario final (no los de node_modules).
const BATS = ['INSTALAR.bat', 'INICIAR.bat', 'scripts/pc/Iniciar-MV-Agendate.bat'];

const leer = (rel) => readFileSync(join(RAIZ, rel), 'utf8');

/**
 * Devuelve sólo las líneas ejecutables: sin comentarios de .bat (REM / ::) ni
 * de shell (#). Hace falta porque varios de estos scripts explican EN UN
 * COMENTARIO qué error se corrigió ("antes esto usaba where node…"), y un
 * chequeo sobre el texto crudo se dispararía con la explicación en vez de con
 * el código.
 */
const soloCodigo = (rel) => leer(rel)
  .split('\n')
  .filter((l) => !/^\s*(REM\b|::|#)/i.test(l))
  .join('\n');

test('todos los lanzadores .bat esperados existen', () => {
  for (const bat of BATS) {
    assert.ok(existsSync(join(RAIZ, bat)), `falta ${bat}`);
  }
});

test('los .bat no mandan a ejecutar otro .bat que no existe', () => {
  // El bug real: INSTALAR.bat terminaba diciendo "ejecuta INICIAR.bat" y ese
  // archivo no estaba en el repo — el cliente quedaba sin forma de arrancar.
  for (const bat of BATS) {
    const texto = leer(bat);
    const mencionados = texto.match(/\b[\w-]+\.bat\b/g) || [];
    for (const nombre of new Set(mencionados)) {
      const enRaiz = existsSync(join(RAIZ, nombre));
      const enPc = existsSync(join(RAIZ, 'scripts/pc', nombre));
      assert.ok(enRaiz || enPc, `${bat} menciona "${nombre}", que no existe en el repo`);
    }
  }
});

test('los .bat no copian archivos plantilla que no existen', () => {
  // El bug real: `copy .env.example .env >nul` con .env.example inexistente.
  // El >nul se tragaba el error y el script igual imprimía "[OK] creado".
  for (const bat of BATS) {
    const texto = leer(bat);
    const copias = [...texto.matchAll(/^\s*copy\s+"?([^"\s]+)"?\s+/gim)];
    for (const [, origen] of copias) {
      assert.ok(
        existsSync(join(RAIZ, origen)),
        `${bat} copia "${origen}", que no existe en el repo`
      );
    }
  }
});

test('los .bat instalan SOLO dependencias de producción (--omit=dev)', () => {
  // Sin --omit=dev npm baja Electron, empaquetadores y tests: ~568 MB contra
  // ~25 MB. Eso es lo que llenó el disco de un cliente real. El programa no
  // necesita NADA de eso para funcionar.
  for (const bat of BATS) {
    const texto = leer(bat);
    const instalaciones = [...texto.matchAll(/npm\s+(?:install|ci)([^\r\n]*)/gi)];
    for (const [linea, flags] of instalaciones) {
      assert.match(
        flags,
        /--omit=dev/,
        `${bat} corre "${linea.trim()}" sin --omit=dev: bajaría ~568 MB en vez de ~25 MB`
      );
    }
  }
});

test('los .bat se anclan a su propia carpeta y toleran rutas con espacios', () => {
  // Los clientes instalan en rutas como "D:\PROGRAMAS MV\...". Sin
  // cd /d "%~dp0" el script trabaja sobre la carpeta equivocada; sin las
  // comillas, se parte en el espacio.
  for (const bat of BATS) {
    const texto = leer(bat);
    assert.match(texto, /cd \/d "%~dp0"/, `${bat} no hace cd /d "%~dp0"`);
  }
});

test('los lanzadores no detectan Node.js con "where" (falla si ese comando no está)', () => {
  // "where node" contesta si node figura en el PATH, no si se puede ejecutar.
  // Cuando "where" no estaba disponible, el script seguía de largo y el cliente
  // veía errores crudos de npm en vez del aviso claro de instalar Node.js.
  for (const bat of BATS) {
    assert.ok(
      !/where\s+node/i.test(soloCodigo(bat)),
      `${bat} usa "where node": usá "node -v" y mirá el errorlevel`
    );
  }
});

test('ningún lanzador abre el navegador en un puerto fijo', () => {
  // Si otra app ocupa el 3000, el programa arranca en el siguiente puerto libre
  // (ver src/arranque.js). Un lanzador que abra localhost:3000 a ciegas le
  // muestra al cliente LA OTRA APLICACIÓN. Lo abre el servidor, que sabe el puerto.
  const lanzadores = [...BATS, 'scripts/pc/Iniciar-MV-Agendate.command'];
  for (const archivo of lanzadores) {
    const codigo = soloCodigo(archivo);
    const abreFijo = /(?:start|open|xdg-open)[^\r\n]*localhost:\d+/i;
    assert.ok(!abreFijo.test(codigo), `${archivo} abre el navegador en un puerto fijo`);
    if (archivo !== 'INSTALAR.bat') {
      // INSTALAR.bat sólo prepara; no arranca el programa ni abre nada.
      assert.match(codigo, /MV_ABRIR_NAVEGADOR/, `${archivo} debe delegar la apertura al programa`);
    }
  }
});

test('el instalador de Windows deja elegir carpeta y disco, y crea accesos directos', () => {
  // Requisito explícito del producto: el cliente instala donde quiere, con
  // icono en el escritorio, entrada en el menú de programas y desinstalador.
  const pkg = JSON.parse(leer('package.json'));
  const nsis = pkg.build?.nsis ?? {};
  assert.equal(nsis.oneClick, false, 'oneClick:true saltea el asistente y no deja elegir carpeta');
  assert.equal(nsis.allowToChangeInstallationDirectory, true, 'sin esto no puede elegir carpeta ni disco');
  assert.equal(nsis.createDesktopShortcut, true, 'falta el icono en el escritorio');
  assert.equal(nsis.createStartMenuShortcut, true, 'falta la entrada en el menú de programas');
  assert.ok(nsis.uninstallDisplayName, 'falta el nombre del desinstalador en Windows');
  assert.equal(pkg.build?.win?.target, 'nsis', 'el instalador de Windows debe ser NSIS');
});

test('INSTALAR.bat no culpa a la conexión de internet ante cualquier error', () => {
  // El mensaje viejo era siempre "Fallo npm install. Revisa tu conexion a
  // internet." — incluso cuando el disco estaba lleno (ENOSPC), mandando al
  // cliente a revisar el lugar equivocado. Ahora debe distinguir la causa.
  const texto = leer('INSTALAR.bat');
  assert.match(texto, /espacio/i, 'INSTALAR.bat debe contemplar la falta de espacio en disco');
  const culpaInternet = /Revisa tu conexion a internet\.?\s*\r?\n\s*pause\s*\r?\n\s*exit/i;
  assert.ok(!culpaInternet.test(texto), 'INSTALAR.bat sigue culpando a internet sin diagnosticar');
});
