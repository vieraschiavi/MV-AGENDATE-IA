// © 2026 Martín Viera. Todos los derechos reservados.

// El ChatVoice tiene que escuchar y hablar en el idioma del profesional.
//
// EL BUG QUE ESTO CIERRA: el pipeline premium (Deepgram + Piper/ElevenLabs)
// tenía los dos extremos clavados en español, sin mirar el país configurado.
// Un profesional brasileño —cuenta en portugués, clientes que hablan
// portugués— tenía las llamadas transcriptas con un modelo de ASR en español
// y contestadas con voz rioplatense leyendo texto en portugués. El canal
// estándar (voz.js, Twilio Polly) ya elegía bien pt-BR/Camila desde siempre;
// el premium, que se supone que es el mejor, era el que sonaba peor.
//
// La regla que fija este archivo: NUNCA hablar en el idioma equivocado. Si no
// hay voz para el idioma activo, Piper se declara no disponible y el turno
// cae a ElevenLabs o al canal estándar, que sí lo hablan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vozDelIdioma } from '../src/channels/tts-piper.js';
import { VOZ_POLLY, FRASES } from '../src/channels/voz.js';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const leer = (rel) => readFileSync(join(RAIZ, rel), 'utf8');

test('cada idioma soportado tiene su propia voz, y ninguna se repite', () => {
  const es = vozDelIdioma('es');
  const pt = vozDelIdioma('pt');
  assert.match(es, /^es[_-]/, `la voz de español no parece española: ${es}`);
  assert.match(pt, /^pt[_-]/, `la voz de portugués no parece portuguesa: ${pt}`);
  assert.notEqual(es, pt, 'español y portugués comparten voz: uno de los dos suena mal');
});

test('un idioma sin voz propia no toma prestada la de otro', () => {
  // Inglés no tiene voz Piper en el proyecto. Antes, cualquier idioma no
  // mapeado caía al modelo español por defecto — hablar inglés con voz
  // rioplatense. Ahora devuelve vacío, que arriba significa "no disponible".
  assert.equal(vozDelIdioma('en'), '', 'inglés está tomando la voz de otro idioma');
  assert.equal(vozDelIdioma('xx'), '', 'un idioma desconocido está tomando una voz ajena');
});

test('el ASR de Deepgram sigue el idioma activo, no una constante', () => {
  const js = leer('src/channels/voz-premium.js');
  assert.match(js, /idiomaActivo\(\)/, 'voz-premium ya no mira el idioma configurado');
  assert.ok(
    !/language=es[&'"]/.test(js),
    'el idioma del ASR volvió a quedar fijo en español en la URL de Deepgram'
  );
  assert.match(js, /pt-BR/, 'el ASR ya no contempla portugués');
});

test('en el canal estándar, cada idioma tiene voz Y frases (o ninguna de las dos)', () => {
  // Son las dos mitades de hablar un idioma: voz sin frases lee español con
  // acento ajeno; frases sin voz hace lo inverso. Cuando esto era un ternario
  // (`=== 'pt' ? pt-BR : es-MX`) el desfasaje era invisible.
  const conVoz = Object.keys(VOZ_POLLY).sort();
  const conFrases = Object.keys(FRASES).sort();
  assert.deepEqual(
    conVoz, conFrases,
    `voz.js: idiomas con voz [${conVoz}] != idiomas con frases [${conFrases}] — ` +
    'agregar el que falta, o sacar el que sobra'
  );
  // Y el locale de cada voz tiene que ser de ese idioma, no de otro.
  for (const [idioma, { lang }] of Object.entries(VOZ_POLLY)) {
    assert.ok(
      lang.toLowerCase().startsWith(idioma),
      `voz.js: el idioma "${idioma}" usa el locale "${lang}", que es de otro idioma`
    );
  }
});

test('nada informa el nombre de la voz con una constante en español', () => {
  // /api/voz/estado y el diagnóstico del premium decían "es_AR-daniela"
  // siempre — incluso en una cuenta en portugués, donde esa voz ni se carga.
  for (const ruta of ['src/server.js', 'src/channels/voz-premium.js']) {
    // Solo código: se descartan los comentarios (explican el bug a propósito
    // y nombran la voz vieja). Y la string no puede cruzar saltos de línea,
    // si no el `[^']*` se come medio archivo entre dos comillas lejanas.
    const js = leer(ruta)
      .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    const enDuro = js.match(/'[^'\n]*es_AR-daniela[^'\n]*'/g) || [];
    assert.deepEqual(
      enDuro, [],
      `${ruta}: el nombre de la voz sigue hardcodeado (${enDuro.join(', ')}) — usar vozDelIdioma()`
    );
  }
});
