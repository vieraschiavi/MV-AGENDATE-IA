// © 2026 Martín Viera. Todos los derechos reservados.

// Lo que se le manda al cliente NO puede llevar la clave privada de licencias.
//
// Por qué esto merece un test y no un comentario: con Ed25519 la privada es lo
// único que separa "vendí una licencia" de "cualquiera se fabrica una". Si
// alguna vez alguien afloja el filtro de electron-builder a `["**/*"]` —que es
// lo más natural del mundo cuando falta un archivo en el paquete— el .env se
// cuela adentro del .exe que se descarga público, y el negocio entero se
// regala sin que falle ningún otro test ni ningún build.
//
// El test mira la CONFIGURACIÓN de empaquetado, no un .exe ya compilado: así
// corre en CI, en segundos, y sin necesitar Windows ni electron-builder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8'));

test('electron-builder empaqueta por lista blanca, no "todo"', () => {
  const files = pkg.build && pkg.build.files;
  assert.ok(Array.isArray(files) && files.length, 'build.files tiene que estar declarado');

  // Un patrón que agarre la raíz entera se lleva .env puesto.
  const peligrosos = ['**/*', '**', '.', './**/*', '*'];
  for (const f of files) {
    const patron = typeof f === 'string' ? f : null; // los objetos {from,to} están acotados a su carpeta
    if (patron === null) continue;
    assert.ok(
      !peligrosos.includes(patron),
      `build.files incluye "${patron}", que empaqueta la raíz del repo y con ella .env`
    );
  }
});

test('ninguna entrada de build.files apunta a la raíz del repo', () => {
  for (const f of pkg.build.files) {
    const from = typeof f === 'string' ? f : f.from;
    if (typeof from !== 'string') continue;
    assert.ok(
      !['.', './', ''].includes(from.trim()),
      `build.files tiene una entrada con from="${from}": eso arrastra .env`
    );
  }
});

test('el .env no aparece en la configuración de empaquetado', () => {
  const comoTexto = JSON.stringify(pkg.build || {});
  assert.ok(!/\.env/.test(comoTexto), 'build no debería nombrar .env en ningún lado');
  assert.ok(!pkg.build.extraResources, 'extraResources copia archivos crudos: revisar a mano si se agrega');
});

test('el script del paquete PC tampoco copia el .env', () => {
  const sh = readFileSync(join(raiz, 'scripts', 'empaquetar-pc.sh'), 'utf8');
  // Se buscan copias del .env, no la palabra suelta (el script usa variables
  // de entorno para armar el LEEME y eso es legítimo).
  const copiaEnv = /\b(cp|rsync|install)\b[^\n]*\.env\b/;
  assert.ok(!copiaEnv.test(sh), 'empaquetar-pc.sh no puede copiar .env al paquete del cliente');
});

test('la clave PÚBLICA sí viaja: está adentro de src/, que se empaqueta', () => {
  // El espejo del test anterior. Si la pública no viajara, la copia del cliente
  // no podría verificar NADA y una licencia legítima sería rechazada — el
  // fallo opuesto, igual de caro: alguien que pagó no entra.
  const fuente = readFileSync(join(raiz, 'src', 'store', 'licencia-clave.js'), 'utf8');
  assert.match(fuente, /export const PUBLICA/, 'la clave pública vive en src/store/, que se empaqueta');
  assert.ok(
    !/BEGIN (RSA )?PRIVATE KEY/.test(fuente),
    'licencia-clave.js NUNCA puede tener una clave privada: viaja adentro del instalador'
  );
});
