// © 2026 Martín Viera. Todos los derechos reservados.

// Tests del conversor a versión dueño (INSTALADOR/OWNER/). Igual que
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
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configVariante, diasPruebaVariante } from '../scripts/variante-instalador.js';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const DIR = join(RAIZ, 'INSTALADOR/OWNER');
const BAT = join(DIR, 'Convertir-a-version-dueno.bat');
const PS1 = join(DIR, 'Convertir-a-version-dueno.ps1');

const leerBat = () => readFileSync(BAT, 'utf8');
const leerPs1 = () => readFileSync(PS1, 'utf8');

test('el .bat y el .ps1 existen juntos en INSTALADOR/OWNER/', () => {
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

test('el .ps1 escribe EXACTAMENTE lo mismo que la variante --owner del empaquetador', () => {
  // Esta es la comprobación que más importa: si scripts/variante-instalador.js
  // cambia el contenido de la variante dueño (por ejemplo, si DIAS_PRUEBA_CLIENTE
  // deja de ser 7) y este .ps1 no se actualiza junto, la conversión "a mano"
  // dejaría un resultado distinto al de instalar MV-Agendate-IA-Setup-Dueno.exe
  // directamente — que es exactamente lo que este archivo promete evitar.
  const owner = { owner: true, demo: false };
  const cfgEsperado = configVariante(owner).trim();          // module.exports = { diasPrueba: 0 };
  const diasEsperado = diasPruebaVariante(owner)
    .split('\n')
    .filter((l) => l.startsWith('export const'))              // sin el comentario "Generado por..."
    .join('\n');

  const texto = leerPs1();
  assert.ok(texto.includes(cfgEsperado), `el .ps1 no escribe "${cfgEsperado}" para owner-config.cjs`);
  for (const linea of diasEsperado.split('\n')) {
    assert.ok(texto.includes(linea), `el .ps1 no escribe "${linea}" para dias-prueba.js`);
  }
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

test('el .ps1 hace backup .original antes de escribir, y no lo pisa si ya existe', () => {
  const texto = leerPs1();
  assert.match(texto, /-not \(Test-Path -LiteralPath "\$\(\$l\.Dias\)\.original"\)/,
    'sin este chequeo, correrlo dos veces pisaría el backup real con la copia ya convertida — perdiendo la forma de volver atrás');
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
