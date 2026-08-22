#!/usr/bin/env node
// © 2026 Martín Viera. Todos los derechos reservados.

// ============================================================
// Deja el sistema de licencias listo para vender, de una sola corrida.
//
//   node scripts/configurar-licencias.js
//   (o doble clic en CONFIGURAR-LICENCIAS.bat, en Windows)
//
// POR QUÉ ESTE PASO NO PUEDE ESTAR ADENTRO DEL PROGRAMA QUE SE VENDE
// Las licencias se firman con un par Ed25519, que son dos mitades con destinos
// opuestos:
//   - la PRIVADA firma. Vive sólo en el servidor de ventas. Si viajara dentro
//     del .exe, cualquier cliente la saca con un editor hexadecimal y se emite
//     las licencias que quiera: el negocio entero es la licencia.
//   - la PÚBLICA verifica. Esa SÍ va adentro de cada copia entregada, y
//     publicarla no habilita nada — es exactamente para lo que existe.
// Por eso el par se genera acá, en la máquina del dueño, y no en el producto.
//
// Lo que este script sí hace es que ese paso deje de ser "abrí una terminal y
// acordate de cuatro comandos": genera el par si falta, imprime la privada
// lista para pegar en Vercel, emite la licencia de dueño y dice exactamente
// qué commitear. Nada más que copiar y pegar.
//
// NO SE EMPAQUETA EN LA ENTREGA: ni package.json (build.files) ni
// scripts/empaquetar-pc.sh copian scripts/ ni los .bat de la raíz. Es
// herramienta del dueño, no del cliente.
// ============================================================
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PEM_FILE, PUB_FILE, clavePublicaDelRepo } from './firmar-licencia.js';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const rel = (p) => relative(RAIZ, p).replace(/\\/g, '/');

const linea = (c = '─') => console.log(c.repeat(72));
const paso = (n, t) => { console.log(''); linea('━'); console.log(`  PASO ${n} — ${t}`); linea('━'); };

// Corre otro script del repo y devuelve su salida. stderr se deja pasar a la
// consola: licencias-firma.js manda ahí sus avisos, y perderlos sería esconder
// justamente el motivo cuando algo no sale.
function correr(args) {
  return execFileSync(process.execPath, [join(RAIZ, 'scripts', 'licencias-firma.js'), ...args],
    { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
}

console.log('');
linea('═');
console.log('  MV AGENDATE IA — dejar las licencias listas para vender');
linea('═');

const yaHabiaPar = existsSync(PEM_FILE);
const yaHabiaPublica = !!clavePublicaDelRepo();

// ── 1. El par de claves ────────────────────────────────────────────────────
paso(1, 'Par de claves de firma');

if (yaHabiaPar) {
  console.log(`  Ya existe ${rel(PEM_FILE)} — no se toca.`);
  console.log('');
  console.log('  Generar un par nuevo INVALIDA todas las licencias ya vendidas: el');
  console.log('  cliente que pagó se queda con un código que la app rechaza. Si de');
  console.log('  verdad hace falta rotarlo (se filtró la privada), es a mano:');
  console.log('      node scripts/licencias-firma.js init --reemplazar-par');
} else {
  console.log('  No había par. Generando uno nuevo…');
  console.log('');
  correr(['init']);
  console.log(`  ✔ Privada → ${rel(PEM_FILE)}  (en .gitignore: NO se sube)`);
  console.log(`  ✔ Pública → ${rel(PUB_FILE)}  (esta SÍ se commitea)`);
}

// ── 2. La privada, para pegar en Vercel ────────────────────────────────────
paso(2, 'Pegar la clave PRIVADA en Vercel');

if (!existsSync(PEM_FILE)) {
  console.log('  ✘ No encuentro la clave privada y no la pude generar. Abortando.');
  process.exit(1);
}

console.log('  Vercel → tu proyecto → Settings → Environment Variables → Add New');
console.log('');
console.log('    Nombre : MV_LICENCIA_PRIVADA_PEM');
console.log('    Valor  : todo el bloque de abajo, saltos de línea incluidos');
console.log('    Marcá  : Production, Preview y Development');
console.log('');
console.log('  Sin esto, el cliente paga y el pedido queda "pagado sin licencia".');
console.log('');
linea();
console.log(readFileSync(PEM_FILE, 'utf8').trim());
linea();
console.log('  ⚠ Esto es lo único que separa "vendí una licencia" de "cualquiera');
console.log('    se fabrica una". No la pegues en un chat, un issue ni un mail.');

// ── 3. Commitear la pública ────────────────────────────────────────────────
paso(3, 'Commitear la clave PÚBLICA');

const publica = clavePublicaDelRepo();
if (!publica) {
  console.log('  ✘ La clave pública quedó VACÍA. Sin ella el programa entregado');
  console.log('    rechaza TODA licencia: el cliente paga, pega el código y no activa.');
  console.log('    Revisá que el paso 1 haya terminado bien y volvé a correr esto.');
  process.exit(1);
}

if (yaHabiaPublica && yaHabiaPar) {
  console.log('  Ya estaba cargada y commiteada. Nada que hacer acá.');
} else {
  console.log('  La clave pública viaja adentro de cada copia entregada, así que');
  console.log('  tiene que estar en el repo ANTES de que CI arme el instalador:');
  console.log('');
  console.log(`      git add ${rel(PUB_FILE)}`);
  console.log('      git commit -m "Cargar la clave pública de licencias"');
  console.log('      git push');
  console.log('');
  console.log('  Recién con ese push el .exe que se descarga del sitio puede');
  console.log('  verificar una licencia. Hasta entonces, el candado está roto.');
}

// ── 4. La licencia de dueño ────────────────────────────────────────────────
paso(4, 'Tu licencia de dueño (para probar el producto completo)');

let ownerOk = true;
try {
  const codigo = correr(['propia']);
  console.log('  Perpetua, plan Full. Pegala en el programa instalado:');
  console.log('  Configuración → Licencia → Activar.');
  console.log('');
  linea();
  console.log(codigo);
  linea();
} catch (e) {
  ownerOk = false;
  console.log('  ✘ No se pudo emitir: ' + String(e.message).split('\n')[0]);
  console.log('    Probá a mano con:  node scripts/licencias-firma.js propia');
}

// ── Cierre ─────────────────────────────────────────────────────────────────
console.log('');
linea('═');
console.log('  QUÉ QUEDA POR HACER');
linea('═');
console.log(`  ${yaHabiaPublica && yaHabiaPar ? '✔' : '☐'} Commitear y pushear la clave pública (paso 3)`);
console.log('  ☐ Pegar MV_LICENCIA_PRIVADA_PEM en Vercel (paso 2) y redeployar');
console.log(`  ${ownerOk ? '✔' : '☐'} Guardar tu licencia de dueño (paso 4)`);
console.log('');
console.log('  Después, la prueba de fuego: comprar en el sitio con una tarjeta');
console.log('  de prueba, recibir el código y activarlo en un instalador bajado');
console.log('  del sitio. Si activa, el circuito de venta está cerrado.');
console.log('');
