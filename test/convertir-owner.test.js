// © 2026 Martín Viera. Todos los derechos reservados.

// Tests del conversor a versión dueño. Igual que
// test/instaladores.test.js: NADA de esto lo corre nadie en CI —ni siquiera
// el .ps1, porque este entorno no tiene PowerShell— así que son chequeos
// ESTÁTICOS sobre el texto de los archivos, pensados para agarrar el tipo de
// error que un `node --test` en Linux jamás vería solo: un archivo que se
// mencionan y no existe, una constante que se desincroniza de
// scripts/variante-instalador.js, o que el archivo se filtre a donde no debe.
//
// Esta herramienta es la "llave maestra" del producto (saca el límite de
// prueba y el pedido de licencia de cualquier copia instalada) — antes de
// confiar en un cambio acá hace falta probarlo en Windows de verdad.
//
// SON DOS ARCHIVOS Y VIVEN EN LUGARES DISTINTOS, a propósito:
//   - el .bat es el punto de entrada y no lleva nada adentro → va al repo;
//   - el .ps1 hace la detección y lleva la LICENCIA PERPETUA FIRMADA → se
//     GENERA (`npm run activador-dueno`), porque commitear una licencia en un
//     repo público es publicar la versión completa del producto.
// Por eso acá se testea la PLANTILLA del .ps1 y, aparte, la salida real del
// generador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { verificarLicencia } from '../src/store/licencia-firma.js';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const BAT = join(RAIZ, 'INSTALADOR/OWNER/Convertir-a-version-dueno.bat');
const PS1 = join(RAIZ, 'scripts/plantillas/convertir-a-version-dueno.ps1');

const leerBat = () => readFileSync(BAT, 'utf8');
const leerPs1 = () => readFileSync(PS1, 'utf8');

// La salida real del generador, una sola vez (firmar es barato, lanzar un
// proceso por test no).
const GENERADO = (() => {
  const dir = mkdtempSync(join(tmpdir(), 'mv-conversor-'));
  try {
    execFileSync(process.execPath, [join(RAIZ, 'scripts/licencias-firma.js'), 'activador', '--salida', dir],
      { cwd: RAIZ, encoding: 'utf8' });
    return {
      ps1: readFileSync(join(dir, 'Convertir-a-version-dueno.ps1'), 'utf8'),
      bat: readFileSync(join(dir, 'Convertir-a-version-dueno.bat'), 'utf8')
    };
  } finally { rmSync(dir, { recursive: true, force: true }); }
})();

test('el .bat vive en el repo y la plantilla del .ps1 también', () => {
  assert.ok(existsSync(BAT), 'falta Convertir-a-version-dueno.bat');
  assert.ok(existsSync(PS1), 'falta Convertir-a-version-dueno.ps1');
});

test('el .bat comprueba que el .ps1 existe antes de invocarlo', () => {
  const texto = leerBat();
  assert.match(texto, /if not exist "%~dp0Convertir-a-version-dueno\.ps1"/,
    'sin este chequeo, si el .ps1 no viaja junto al .bat, PowerShell falla con un error críptico en vez de un aviso claro');
});

test('el .bat invoca el .ps1 con -ExecutionPolicy Bypass acotado a esa corrida', () => {
  const texto = leerBat();
  assert.match(texto, /-ExecutionPolicy Bypass/, 'sin esto, la política de PowerShell del sistema puede bloquear el script');
  assert.match(texto, /-File "%~dp0Convertir-a-version-dueno\.ps1"/, 'tiene que invocar el .ps1 con ruta anclada a su propia carpeta');
});

test('el .bat es ASCII puro', () => {
  // Los .bat de este repo no todos hacen chcp 65001; éste en particular no lo
  // hace (sigue el estilo del archivo que reemplaza), así que un acento se
  // podría mostrar mal en cmd.exe según la code page de la máquina.
  const lineas = leerBat().split('\n');
  const conNoAscii = lineas
    .map((l, i) => ({ n: i + 1, l, raros: [...l].filter((c) => c.charCodeAt(0) > 127) }))
    .filter((x) => x.raros.length > 0);
  assert.deepEqual(conNoAscii, [], `hay caracteres fuera de ASCII: ${JSON.stringify(conNoAscii)}`);
});

test('el .bat se ancla a su propia carpeta (cd /d "%~dp0")', () => {
  // Mismo criterio que test/instaladores.test.js: el cliente puede correr
  // esto desde "D:\PROGRAMAS MV\..." con espacios en la ruta.
  assert.match(leerBat(), /cd \/d "%~dp0"/);
});

test('el .bat reenvía un argumento (arrastrar una carpeta encima) al .ps1', () => {
  assert.match(leerBat(), /"%~1"/, 'si alguien arrastra la carpeta del programa sobre el .bat, tiene que llegar al .ps1');
});

test('el .bat no promete un "modo sin PowerShell" que ya no existe', () => {
  // Guarda contra el error real: prometer una alternativa que el script no
  // implementa de verdad (el fallback anterior a este cambio detectaba la
  // instalación con lógica pura de .bat; este ya no la tiene).
  const texto = leerBat();
  const seccionFallo = texto.split(':fallo_powershell')[1]?.split(':sin_ps1')[0] || '';
  assert.ok(!/copia este archivo a la carpeta/i.test(seccionFallo),
    'el mensaje de fallback no puede prometer la detección manual vieja: ya no está implementada en el .bat');
});

test('el .ps1 declara el parámetro de ruta como PRIMERA sentencia ejecutable', () => {
  // Regla dura de PowerShell: si `param(...)` no es lo primero (dejando de
  // lado comentarios), el script ni siquiera arranca.
  const lineas = leerPs1().split('\n');
  let vistoParam = false;
  for (const linea of lineas) {
    const l = linea.trim();
    if (l === '' || l.startsWith('#')) continue;
    assert.ok(l.startsWith('param('), `la primera sentencia real tiene que ser "param(...)", encontré: "${l}"`);
    vistoParam = true;
    break;
  }
  assert.ok(vistoParam, 'no encontré ninguna sentencia ejecutable');
});

test('el .ps1 no tiene llaves, paréntesis ni corchetes desbalanceados', () => {
  // Chequeo tosco pero real: un desbalance en el CÓDIGO es sinónimo de "el
  // script no corre". Hace falta descartar antes los comentarios (líneas que
  // empiezan con #: la explicación en prosa abre paréntesis sin cerrarlos en
  // la misma línea todo el tiempo) y el contenido de strings simples (los
  // mensajes al usuario tienen paréntesis de verdad, como "(portable...)") —
  // si no, el conteo se dispara con texto que nunca fue código.
  const sinComentarios = leerPs1()
    .split('\n')
    .filter((l) => !l.trim().startsWith('#'))
    .join('\n');
  // Los strings de este archivo son todos comillas simples y sin comillas
  // escapadas (''), así que un regex no-goloso alcanza para vaciarlos.
  const sinStrings = sinComentarios.replace(/'[^']*'/g, "''");

  const contar = (abre, cierra) => {
    let nivel = 0, minimo = 0;
    for (const c of sinStrings) {
      if (c === abre) nivel++;
      else if (c === cierra) { nivel--; if (nivel < minimo) minimo = nivel; }
    }
    return { nivel, minimo };
  };
  const llaves = contar('{', '}');
  const parentesis = contar('(', ')');
  const corchetes = contar('[', ']');
  assert.equal(llaves.nivel, 0, `llaves { } desbalanceadas en el código (nivel final ${llaves.nivel})`);
  assert.ok(llaves.minimo >= 0, 'hay un "}" antes que su "{" en el código');
  assert.equal(parentesis.nivel, 0, `paréntesis ( ) desbalanceados en el código (nivel final ${parentesis.nivel})`);
  assert.ok(parentesis.minimo >= 0, 'hay un ")" antes que su "(" en el código');
  assert.equal(corchetes.nivel, 0, `corchetes [ ] desbalanceados en el código (nivel final ${corchetes.nivel})`);
  assert.ok(corchetes.minimo >= 0, 'hay un "]" antes que su "[" en el código');
});

test('el .ps1 no tiene NINGÚN carácter fuera de ASCII (más allá de la cabecera)', () => {
  // Convención deliberada de esta herramienta puntual (a diferencia de
  // INSTALAR.bat/INICIAR.bat, que sí usan chcp 65001 + acentos): sin BOM ni
  // control de code page garantizados, cualquier carácter no-ASCII —una
  // tilde, una "ñ", una raya "—" en un comentario— puede llegar mal a
  // PowerShell 5.1 o mostrarse mal en cmd.exe. Más simple prohibirlos todos
  // que andar afinando encoding a ciegas sin poder probarlo en Windows real.
  // Se excluye solo la primera línea (nombre propio "Martín Viera").
  const lineas = leerPs1().split('\n').slice(1);
  const conNoAscii = lineas
    .map((l, i) => ({ n: i + 2, l, raros: [...l].filter((c) => c.charCodeAt(0) > 127) }))
    .filter((x) => x.raros.length > 0);
  assert.deepEqual(conNoAscii, [], `hay caracteres fuera de ASCII: ${JSON.stringify(conNoAscii)}`);
});

test('el conversor generado lleva una licencia perpetua FIRMADA que la app acepta', () => {
  // Es LA comprobación: sin una licencia válida adentro, el conversor deja un
  // licencia.txt que el programa rechaza, y el dueño se entera recién al abrirlo.
  const codigo = (GENERADO.ps1.match(/MVA1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/) || [])[0];
  assert.ok(codigo, 'el .ps1 generado no lleva ninguna licencia adentro');
  const v = verificarLicencia(codigo);
  assert.equal(v.ok, true, 'la licencia del conversor no verifica contra la clave pública de la entrega');
  assert.equal(v.datos.x, null, 'la del dueño es perpetua: no se le puede vencer sola');
  assert.ok(!GENERADO.ps1.includes('@@LICENCIA'), 'quedó el marcador sin reemplazar');
});

test('la PLANTILLA del repo no lleva ninguna licencia, y se planta si la corren', () => {
  // Este repo es público: una licencia perpetua commiteada acá sería el
  // producto completo regalado a quien clone.
  assert.doesNotMatch(leerPs1(), /MVA1\.[A-Za-z0-9_-]{20,}/,
    'hay una licencia de verdad commiteada en la plantilla');
  assert.match(leerPs1(), /@@LICENCIA_MVA1@@/, 'falta el hueco donde va la licencia');
  assert.match(leerPs1(), /notmatch\s+'\^MVA1\\\.'/,
    'la plantilla tiene que cortar si la corren tal cual, en vez de "convertir" sin activar nada');
});

test('el conversor deja una licencia.txt, NO la bandera vieja de texto', () => {
  // El cambio de fondo. `diasPrueba: 0` era una llave que cualquiera escribía
  // con el Bloc de notas; y desde que cero días significa "prueba de cero
  // días", escribir eso ya no libera: bloquea. Un conversor que siguiera
  // escribiéndolo dejaría la copia del dueño VENCIDA.
  const codigo = leerPs1().split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  assert.match(codigo, /licencia\.txt/, 'no escribe el licencia.txt que el motor lee');
  assert.ok(!/diasPrueba/.test(codigo), 'sigue escribiendo la bandera vieja, que ahora BLOQUEA la copia');
  assert.ok(!/DIAS_FIJADOS/.test(codigo), 'sigue tocando dias-prueba.js, que ahora BLOQUEA la copia');
});

test('el conversor comprueba que la licencia quedó escrita antes de decir [OK]', () => {
  // Carpeta protegida o antivirus: la escritura no pasa, el dueño lee
  // "convertida" y abre un programa que le sigue pidiendo la clave.
  const texto = leerPs1();
  const aplicar = texto.slice(texto.indexOf('Set-Content -LiteralPath $l.Lic'));
  assert.match(aplicar, /Select-String[^\n]*\$l\.Lic/, 'no relee el archivo después de escribirlo');
  assert.ok(aplicar.indexOf('throw') < aplicar.indexOf('Convertida a version DUENO'),
    'anuncia el éxito antes de comprobarlo');
});

test('volver atrás es borrar el licencia.txt, sin tocar archivos del programa', () => {
  // La conversión ya no pisa nada: sólo agrega un archivo. Eso hace que la
  // vuelta atrás sea exacta, sin depender de un backup .original que puede
  // faltar o haberse pisado.
  const texto = leerPs1();
  assert.match(texto, /Remove-Item -LiteralPath \$l\.Lic/, 'no borra el licencia.txt al revertir');
  assert.ok(!/\.original/.test(texto),
    'ya no hay backups que manejar: si vuelven, es que el conversor volvió a pisar archivos del programa');
});

test('el .ps1 valida por resources\\app\\src\\store\\dias-prueba.js y por el mismo archivo suelto', () => {
  // Dos layouts distintos según cómo se llegó a la instalación: el .exe
  // (electron-builder) deja todo bajo resources\app\; el portable (.zip) no
  // tiene esa carpeta intermedia. Si el .ps1 solo supiera de uno de los dos,
  // "todos de instalación" (el pedido original) quedaría a medias.
  const texto = leerPs1();
  assert.match(texto, /resources\\app/, 'no contempla el layout del .exe instalado (resources\\app\\...)');
  assert.match(texto, /src\\store\\dias-prueba\.js/, 'no busca dias-prueba.js, que es lo único que también existe en el portable');
});

test('ninguna variante del producto que se distribuye referencia este conversor', () => {
  // Es la "llave maestra": no puede aparecer mencionada desde nada que viaje
  // a un cliente (los lanzadores del portable, el README que ve el comprador,
  // ni nada bajo public/).
  const candidatos = [
    'scripts/pc/Iniciar-MV-Agendate.bat',
    'scripts/pc/LEEME.txt',
    'INSTALADOR/CLIENTE',
  ];
  for (const rel of candidatos) {
    const ruta = join(RAIZ, rel);
    if (!existsSync(ruta)) continue;
    const stat = statSync(ruta);
    const archivos = stat.isDirectory()
      ? readdirSync(ruta).map((f) => join(ruta, f))
      : [ruta];
    for (const archivo of archivos) {
      if (!statSync(archivo).isFile()) continue;
      const contenido = readFileSync(archivo, 'utf8');
      assert.ok(!contenido.includes('Convertir-a-version-dueno'),
        `${archivo} menciona el conversor a dueño — no puede viajar a un cliente`);
    }
  }
});

test('el conversor no está en public/, así que Vercel nunca lo sirve', () => {
  const publicos = join(RAIZ, 'public');
  const buscar = (dir) => {
    for (const nombre of readdirSync(dir)) {
      if (nombre === 'node_modules') continue;
      const ruta = join(dir, nombre);
      const st = statSync(ruta);
      if (st.isDirectory()) { buscar(ruta); continue; }
      assert.ok(!nombre.includes('Convertir-a-version-dueno'), `${ruta} no puede estar bajo public/`);
    }
  };
  buscar(publicos);
});

test('sin clave privada no se genera ningún conversor', () => {
  // Un conversor sin licencia firmada adentro no activa nada: generarlo igual
  // sería entregar una herramienta que no hace lo que dice.
  let err = null;
  try {
    execFileSync(process.execPath, [join(RAIZ, 'scripts/licencias-firma.js'), 'activador', '--salida', tmpdir()],
      { cwd: RAIZ, encoding: 'utf8', env: { ...process.env, MV_LICENCIA_PRIVADA_PEM: '' } });
  } catch (e) { err = e; }
  assert.ok(err, 'generó un conversor sin poder firmar');
  assert.match(String(err.stderr || ''), /licencias-firma\.js init/, 'no dice cómo conseguir la clave');
});
