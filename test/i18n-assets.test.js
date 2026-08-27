// © 2026 Martín Viera. Todos los derechos reservados.

// Los assets del sitio tienen que existir en los TRES idiomas, y las páginas
// dedicadas (/en/, /pt/) tienen que apuntar cada una a los suyos.
//
// EL BUG QUE ESTO CIERRA (dos veces, la misma raíz): el sitio tiene una copia
// del HTML por idioma, y un cambio hecho sobre una sola de ellas no llega a
// las otras. Pasó con el <source> del video —/en/ y /pt/ reproducían el mp4
// en español, con la narración en español, durante meses— y volvió a pasar
// con el poster, que es lo ÚNICO que se ve hasta que alguien toca play: un
// visitante en inglés veía una captura del cotizador en español, con precios
// en pesos, antes de darle play al video en inglés que sí existía.
//
// Los tres .mp4 son el mismo montaje con distinta narración y distintos
// textos en pantalla, así que el poster correcto de cada idioma ya estaba
// adentro de su propio video (ver scripts/generar-posters.sh).
//
// Nada de esto lo agarra un test de servidor: son archivos estáticos y
// atributos de HTML. Por eso se verifican acá, leyendo los archivos reales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const leer = (rel) => readFileSync(join(RAIZ, rel), 'utf8');

// idioma → [archivo de video, archivo de poster] tal como los nombra i18n.js
const ASSETS = {
  es: ['public/video/mv-agendate-ia.mp4', 'public/video/poster.jpg'],
  en: ['public/video/mv-agendate-ia-en.mp4', 'public/video/poster-en.jpg'],
  pt: ['public/video/mv-agendate-ia-pt.mp4', 'public/video/poster-pt.jpg'],
};

test('existe el video Y el poster de cada idioma', () => {
  for (const [idioma, archivos] of Object.entries(ASSETS)) {
    for (const rel of archivos) {
      assert.ok(existsSync(join(RAIZ, rel)), `falta ${rel} (idioma ${idioma})`);
    }
  }
});

test('i18n.js arma las rutas de video y poster de los tres idiomas', () => {
  const js = leer('public/js/i18n.js');
  // Las rutas se arman con template strings, así que se verifica el patrón,
  // no la ruta literal: `${base}-${idi}.mp4` y `/video/poster-${idi}.jpg`.
  assert.match(js, /const base = '\/video\/mv-agendate-ia'/, 'cambió la base del video');
  assert.match(js, /\$\{base\}-\$\{idi\}\.mp4/, 'el video ya no varía por idioma');
  assert.match(js, /\/video\/poster-\$\{idi\}\.jpg/, 'el poster ya no varía por idioma');
  // El poster tiene que ajustarse aunque el <source> ya sea el correcto: son
  // dos atributos independientes (este orden fue un bug real).
  const cuerpo = js.slice(js.indexOf('function ajustarVideo'));
  const posPoster = cuerpo.indexOf("setAttribute('poster'");
  const posReturn = cuerpo.indexOf('return;');
  assert.ok(posPoster !== -1, 'ajustarVideo ya no toca el poster');
  assert.ok(
    posPoster < posReturn,
    'el poster se ajusta DESPUÉS del early-return: si el <source> ya está bien, el poster queda viejo'
  );
});

test('cada página dedicada trae ya servido el video y el poster de SU idioma', () => {
  // Sin esto, el visitante ve el asset en español hasta que corre el JS — y
  // si el JS no corre (o tarda), lo ve para siempre. Es la misma razón por la
  // que los <meta> del <head> están traducidos en el archivo, no por JS.
  const paginas = { en: 'public/en/index.html', pt: 'public/pt/index.html' };
  for (const [idioma, ruta] of Object.entries(paginas)) {
    const html = leer(ruta);
    assert.match(
      html, new RegExp(`poster="/video/poster-${idioma}\\.jpg"`),
      `${ruta}: el poster no es el de ${idioma}`
    );
    assert.match(
      html, new RegExp(`<source src="/video/mv-agendate-ia-${idioma}\\.mp4"`),
      `${ruta}: el video no es el de ${idioma}`
    );
  }
  // Y la raíz sigue siendo la española.
  const raiz = leer('public/index.html');
  assert.match(raiz, /poster="\/video\/poster\.jpg"/, 'la raíz dejó de servir el poster en español');
  assert.match(raiz, /<source src="\/video\/mv-agendate-ia\.mp4"/, 'la raíz dejó de servir el video en español');
});

test('ninguna página promete una demo en vivo: /demo.html es un formulario', () => {
  // La demo dejó de ser pública (ahora se pide por formulario), pero el texto
  // de los botones siguió diciendo "ver la demo en vivo" en los tres idiomas
  // mucho después. Un CTA que promete algo que no pasa al hacer clic.
  const paginas = [
    'public/index.html', 'public/en/index.html', 'public/pt/index.html',
    'public/clasica.html',
  ];
  for (const ruta of paginas) {
    const html = leer(ruta);
    for (const frase of ['demo en vivo', 'demo ao vivo', 'live demo']) {
      assert.ok(
        !html.toLowerCase().includes(frase),
        `${ruta}: sigue prometiendo "${frase}" — /demo.html es un formulario, no una demo en vivo`
      );
    }
  }
});

test('el selector de idioma solo ofrece idiomas que la página sabe aplicar', () => {
  // clasica.html ofrecía "🇬🇧 EN" en el <select> pero su código forzaba
  // cualquier valor que no fuera 'pt' a español: quien elegía inglés veía
  // español, sin ningún aviso.
  const html = leer('public/clasica.html');
  const opciones = [...html.matchAll(/<option value="(\w+)"/g)].map((m) => m[1]);
  const delSelector = opciones.filter((v) => ['es', 'pt', 'en'].includes(v));
  // clasica.html es anterior a /js/i18n.js y trae su propio diccionario
  // (`const PT = {...}`); las demás páginas usan `window.MV_PT`. Se aceptan
  // las dos convenciones para no atarse a una sola.
  const soporta = (idi) => idi === 'es' // el español está escrito en el HTML
    || new RegExp(`(MV_|const )${idi.toUpperCase()}\\b`).test(html);
  for (const idi of delSelector) {
    assert.ok(soporta(idi), `clasica.html ofrece "${idi}" en el selector pero no tiene diccionario para ese idioma`);
  }
});
