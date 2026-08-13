// Elección de modelo de IA por proveedor.
//
// Lo que se cuida: el modelo lo elige el profesional para regular su gasto de
// tokens. Si la elección no llega hasta la llamada real, o si la lista de
// modelos queda pegada a lo que estaba escrito en el código, la función no
// sirve — el profesional cree que bajó el costo y sigue pagando lo mismo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// data/ propio ANTES de importar nada: config.js resuelve su ruta al cargarse.
process.env.MV_DATOS_DIR = mkdtempSync(join(tmpdir(), 'mv-modelos-'));
// Que ninguna MODELO_* heredada del entorno enturbie los defaults.
for (const k of ['MODELO_CLAUDE', 'MODELO_OPENAI', 'MODELO_GEMINI', 'MODELO_GROK']) delete process.env[k];

const { setConfig } = await import('../src/store/config.js');
const mod = await import('../src/ai/modelos.js');

// Las claves que tocan estos tests, para dejarlas limpias entre casos.
const CLAVES = [
  'modeloClaude', 'modeloOpenai', 'modeloGemini', 'modeloGrok', 'modeloCompatible',
  'anthropicApiKey', 'openaiApiKey', 'geminiApiKey', 'grokApiKey', 'compatibleApiKey',
  'compatibleBaseUrl'
];

/** Deja la config con exactamente lo que pide el caso. */
function cargar(valores = {}) {
  setConfig(Object.fromEntries(CLAVES.map((k) => [k, valores[k] ?? ''])));
  return { mod, restaurar: () => setConfig(Object.fromEntries(CLAVES.map((k) => [k, '']))) };
}

/** Reemplaza fetch por uno que devuelve `cuerpo`, y registra qué se le pidió. */
function stubFetch(cuerpo, { ok = true, status = 200 } = {}) {
  const llamadas = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opciones) => {
    llamadas.push({ url: String(url), opciones });
    return { ok, status, text: async () => JSON.stringify(cuerpo) };
  };
  return { llamadas, restaurar: () => { globalThis.fetch = original; } };
}

// ---------- Qué modelo se usa ----------

test('sin elección, se usa el modelo por defecto del proveedor', async () => {
  const { restaurar } = cargar();
  try {
    assert.equal(mod.modeloDe('claude'), 'claude-sonnet-5');
    assert.equal(mod.modeloDe('openai'), 'gpt-4o');
  } finally { restaurar(); }
});

test('el modelo elegido por el profesional le gana al default', async () => {
  const { restaurar } = cargar({ modeloClaude: 'claude-haiku-4-5-20251001' });
  try {
    assert.equal(mod.modeloDe('claude'), 'claude-haiku-4-5-20251001');
  } finally { restaurar(); }
});

test('la elección de un proveedor no pisa la del otro', async () => {
  // Cambiar de proveedor no puede borrar lo que ya habías elegido en el anterior.
  const { restaurar } = cargar({ modeloClaude: 'claude-haiku-4-5-20251001', modeloOpenai: 'gpt-4o-mini' });
  try {
    assert.equal(mod.modeloDe('claude'), 'claude-haiku-4-5-20251001');
    assert.equal(mod.modeloDe('openai'), 'gpt-4o-mini');
    assert.equal(mod.modeloDe('gemini'), 'gemini-1.5-flash', 'el que no se tocó sigue en su default');
  } finally { restaurar(); }
});

test('la variable de entorno sigue funcionando si nadie eligió nada', async () => {
  // Compatibilidad: quien ya configuraba el modelo por entorno no se rompe.
  // Pero el modelo elegido en el panel le gana, que es lo que espera alguien
  // que acaba de tocarlo ahí.
  const { restaurar } = cargar();
  process.env.MODELO_CLAUDE = 'claude-de-la-env';
  try {
    assert.equal(mod.modeloDe('claude'), 'claude-de-la-env');
    cargar({ modeloClaude: 'claude-del-panel' });
    assert.equal(mod.modeloDe('claude'), 'claude-del-panel', 'lo elegido en el panel manda');
  } finally { delete process.env.MODELO_CLAUDE; restaurar(); }
});

test('la URL base del comodín sale de la config y se le saca la barra final', async () => {
  const { restaurar } = cargar({ compatibleBaseUrl: 'https://api.deepseek.com/v1/' });
  try {
    assert.equal(mod.baseUrlDe('compatible'), 'https://api.deepseek.com/v1');
    assert.equal(mod.baseUrlDe('openai'), 'https://api.openai.com/v1', 'los fijos no se tocan');
  } finally { restaurar(); }
});

// ---------- Consultar los modelos disponibles ----------

test('sin API key no se consulta nada y se explica por qué', async () => {
  const { restaurar } = cargar();
  try {
    const r = await mod.listarModelos('claude');
    assert.equal(r.ok, false);
    assert.match(r.error, /API key/i);
  } finally { restaurar(); }
});

test('Anthropic: se leen id y nombre para mostrar', async () => {
  const { restaurar } = cargar({ anthropicApiKey: 'sk-ant-x' });
  const f = stubFetch({ data: [{ id: 'claude-sonnet-5', display_name: 'Claude Sonnet 5' }] });
  try {
    const r = await mod.listarModelos('claude');
    assert.equal(r.ok, true);
    assert.deepEqual(r.modelos, [{ id: 'claude-sonnet-5', nombre: 'Claude Sonnet 5' }]);
    assert.equal(f.llamadas[0].opciones.headers['x-api-key'], 'sk-ant-x');
    assert.ok(f.llamadas[0].opciones.headers['anthropic-version'], 'Anthropic exige la versión de API');
  } finally { f.restaurar(); restaurar(); }
});

test('OpenAI: se filtran los modelos que no sirven para conversar', async () => {
  const { restaurar } = cargar({ openaiApiKey: 'sk-x' });
  const f = stubFetch({
    data: [
      { id: 'gpt-4o' }, { id: 'gpt-4o-mini' },
      { id: 'text-embedding-3-small' }, { id: 'whisper-1' },
      { id: 'dall-e-3' }, { id: 'tts-1' }
    ]
  });
  try {
    const r = await mod.listarModelos('openai');
    assert.equal(r.ok, true);
    assert.deepEqual(r.modelos.map((m) => m.id), ['gpt-4o', 'gpt-4o-mini'],
      'embeddings, audio e imagen no van al desplegable de conversación');
  } finally { f.restaurar(); restaurar(); }
});

test('Gemini: solo los que saben generar contenido', async () => {
  const { restaurar } = cargar({ geminiApiKey: 'AIza-x' });
  const f = stubFetch({
    models: [
      { name: 'models/gemini-1.5-flash', displayName: 'Gemini 1.5 Flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/text-embedding-004', displayName: 'Embeddings', supportedGenerationMethods: ['embedContent'] }
    ]
  });
  try {
    const r = await mod.listarModelos('gemini');
    assert.deepEqual(r.modelos, [{ id: 'gemini-1.5-flash', nombre: 'Gemini 1.5 Flash' }]);
    assert.ok(!f.llamadas[0].url.includes('undefined'));
  } finally { f.restaurar(); restaurar(); }
});

test('Grok pega a la API de xAI con el protocolo de OpenAI', async () => {
  const { restaurar } = cargar({ grokApiKey: 'xai-x' });
  const f = stubFetch({ data: [{ id: 'grok-2-latest' }] });
  try {
    const r = await mod.listarModelos('grok');
    assert.equal(r.ok, true);
    assert.equal(f.llamadas[0].url, 'https://api.x.ai/v1/models');
    assert.equal(f.llamadas[0].opciones.headers.Authorization, 'Bearer xai-x');
  } finally { f.restaurar(); restaurar(); }
});

test('el comodín consulta la URL que cargó el profesional', async () => {
  const { restaurar } = cargar({ compatibleApiKey: 'k', compatibleBaseUrl: 'https://api.deepseek.com/v1' });
  const f = stubFetch({ data: [{ id: 'deepseek-chat' }] });
  try {
    const r = await mod.listarModelos('compatible');
    assert.equal(r.ok, true);
    assert.equal(f.llamadas[0].url, 'https://api.deepseek.com/v1/models');
  } finally { f.restaurar(); restaurar(); }
});

test('el comodín sin URL base avisa en vez de pegarle a cualquier lado', async () => {
  const { restaurar } = cargar({ compatibleApiKey: 'k' });
  try {
    const r = await mod.listarModelos('compatible');
    assert.equal(r.ok, false);
    assert.match(r.error, /URL base/i);
  } finally { restaurar(); }
});

test('un error del proveedor vuelve explicado, no como excepción', async () => {
  const { restaurar } = cargar({ openaiApiKey: 'sk-vencida' });
  const f = stubFetch({ error: { message: 'Incorrect API key provided' } }, { ok: false, status: 401 });
  try {
    const r = await mod.listarModelos('openai');
    assert.equal(r.ok, false);
    assert.match(r.error, /Incorrect API key/);
  } finally { f.restaurar(); restaurar(); }
});

test('un proveedor inventado no rompe nada', async () => {
  const { restaurar } = cargar();
  try {
    assert.equal((await mod.listarModelos('inventado')).ok, false);
    assert.equal(mod.modeloDe('inventado'), '');
  } finally { restaurar(); }
});

// ---------- Caché ----------

test('la caché conserva los proveedores que fallaron', async () => {
  // Si actualizar Grok falla, no se puede perder la lista de Claude que ya
  // estaba: el profesional se quedaría sin opciones sin haber tocado nada.
  const { restaurar } = cargar();
  try {
    const previo = { claude: { modelos: [{ id: 'claude-sonnet-5', nombre: 'Sonnet' }], actualizado: '2026-01-01T00:00:00.000Z' } };
    const fusionado = mod.fusionarCache(previo, {
      grok: { ok: false, error: 'clave inválida' },
      openai: { ok: true, modelos: [{ id: 'gpt-4o', nombre: 'gpt-4o' }] }
    });
    assert.deepEqual(fusionado.claude.modelos, previo.claude.modelos, 'lo que ya había no se toca');
    assert.equal(fusionado.claude.actualizado, previo.claude.actualizado);
    assert.ok(fusionado.openai.actualizado, 'lo nuevo queda fechado');
    assert.ok(!fusionado.grok, 'el que falló no se guarda vacío');
  } finally { restaurar(); }
});
