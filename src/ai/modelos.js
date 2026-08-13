// Catálogo de proveedores de IA y sus modelos disponibles.
//
// Por qué existe: el modelo lo elige el profesional, no el programa. Entre el
// más caro y el más barato de un mismo proveedor hay diferencias de 10× o más
// por token, y para atender "¿cuánto sale cambiar un tomacorriente?" casi
// siempre alcanza el barato. Antes el modelo estaba fijo en el código: para
// bajar el gasto había que tocar una variable de entorno y redeployar.
//
// Y la lista NO se hardcodea: cada proveedor saca modelos nuevos (y jubila los
// viejos) todo el tiempo, así que una lista escrita acá nace vencida. El
// botón "Actualizar" le pregunta a la API del proveedor, con la clave del
// propio profesional, qué modelos tiene HOY disponibles esa cuenta.
import { get as cfg } from '../store/config.js';

/**
 * Un proveedor por entrada:
 *  - claveApi     : clave de config donde vive su API key
 *  - claveModelo  : clave de config donde se guarda el modelo elegido
 *  - porDefecto   : modelo a usar mientras el profesional no elija otro
 *  - listar       : cómo pedirle la lista de modelos a su API
 *  - compatibleOpenAI: si habla el protocolo de OpenAI (chat/completions)
 */
export const PROVEEDORES = {
  claude: {
    nombre: 'Claude (Anthropic)',
    claveApi: 'anthropicApiKey',
    claveModelo: 'modeloClaude',
    porDefecto: 'claude-sonnet-5',
    consola: 'https://console.anthropic.com/settings/keys',
    compatibleOpenAI: false,
  },
  openai: {
    nombre: 'ChatGPT (OpenAI)',
    claveApi: 'openaiApiKey',
    claveModelo: 'modeloOpenai',
    porDefecto: 'gpt-4o',
    baseUrl: 'https://api.openai.com/v1',
    consola: 'https://platform.openai.com/api-keys',
    compatibleOpenAI: true,
  },
  gemini: {
    nombre: 'Gemini (Google)',
    claveApi: 'geminiApiKey',
    claveModelo: 'modeloGemini',
    porDefecto: 'gemini-1.5-flash',
    consola: 'https://aistudio.google.com/app/apikey',
    compatibleOpenAI: false,
  },
  grok: {
    nombre: 'Grok (xAI)',
    claveApi: 'grokApiKey',
    claveModelo: 'modeloGrok',
    porDefecto: 'grok-2-latest',
    baseUrl: 'https://api.x.ai/v1',
    consola: 'https://console.x.ai',
    compatibleOpenAI: true,
  },
  // GitHub Models, no "Copilot" a secas: Copilot es un producto de
  // autocompletado dentro del editor y no expone una API general que una app
  // de terceros pueda usar para conversar. Lo que sí se puede usar con una
  // cuenta de GitHub es GitHub Models, que habla el protocolo de OpenAI y da
  // acceso a modelos de OpenAI, Meta, Mistral y otros con un token de GitHub.
  copilot: {
    nombre: 'GitHub Models (Copilot)',
    claveApi: 'copilotApiKey',
    claveModelo: 'modeloCopilot',
    porDefecto: 'gpt-4o',
    baseUrl: 'https://models.github.ai/inference',
    urlCatalogo: 'https://models.github.ai/catalog/models',
    consola: 'https://github.com/settings/tokens',
    compatibleOpenAI: true,
  },
  // Comodín para todo lo demás: casi todos los proveedores nuevos (DeepSeek,
  // Groq, Mistral, OpenRouter, Together…) y los servidores locales (Ollama,
  // LM Studio) exponen la misma API que OpenAI. Con la URL configurable no
  // hace falta tocar el código para sumar uno.
  compatible: {
    nombre: 'Otro compatible con OpenAI',
    claveApi: 'compatibleApiKey',
    claveModelo: 'modeloCompatible',
    claveBaseUrl: 'compatibleBaseUrl',
    porDefecto: '',
    compatibleOpenAI: true,
  },
};

export const IDS_PROVEEDORES = Object.keys(PROVEEDORES);

/** Datos del proveedor, o null si el id no existe. */
export function datosProveedor(id) { return PROVEEDORES[id] || null; }

/** URL base efectiva (el comodín la trae de la config del profesional). */
export function baseUrlDe(id) {
  const p = PROVEEDORES[id];
  if (!p) return '';
  if (p.claveBaseUrl) return String(cfg(p.claveBaseUrl) || '').trim().replace(/\/+$/, '');
  return p.baseUrl || '';
}

/**
 * Modelo que hay que usar con un proveedor: el que eligió el profesional o,
 * si no eligió, el default. La variable de entorno sigue mandando en último
 * término para no romper instalaciones que la usaban.
 */
export function modeloDe(id) {
  const p = PROVEEDORES[id];
  if (!p) return '';
  const elegido = String(cfg(p.claveModelo) || '').trim();
  if (elegido) return elegido;
  const porEnv = process.env[`MODELO_${id.toUpperCase()}`];
  return porEnv || p.porDefecto;
}

// ==================== Consultar los modelos disponibles ====================

const TIMEOUT = 15000;

async function traer(url, headers) {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT) });
  const texto = await r.text();
  if (!r.ok) {
    let detalle = texto.slice(0, 200);
    try { detalle = JSON.parse(texto).error?.message || detalle; } catch { /* no era JSON */ }
    throw new Error(`${r.status}: ${detalle}`);
  }
  return JSON.parse(texto);
}

/** Solo los modelos que sirven para conversar (no embeddings, audio o imagen). */
function esDeChat(id) {
  return !/embed|whisper|tts|dall-e|moderation|image|audio|realtime|transcribe|search|rerank/i.test(id);
}

/**
 * Le pregunta al proveedor qué modelos tiene disponibles esa API key.
 * Devuelve { ok, modelos: [{id, nombre}] } o { ok:false, error }.
 */
export async function listarModelos(id) {
  const p = PROVEEDORES[id];
  if (!p) return { ok: false, error: 'Proveedor desconocido.' };
  const key = String(cfg(p.claveApi) || '').trim();
  if (!key) return { ok: false, error: 'Falta cargar la API key de este proveedor.' };

  try {
    if (id === 'claude') {
      const d = await traer('https://api.anthropic.com/v1/models?limit=100', {
        'x-api-key': key, 'anthropic-version': '2023-06-01'
      });
      return { ok: true, modelos: (d.data || []).map((m) => ({ id: m.id, nombre: m.display_name || m.id })) };
    }

    if (id === 'gemini') {
      const d = await traer(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=200`, {});
      const modelos = (d.models || [])
        // Solo los que saben generar contenido: la lista trae también los de
        // embeddings, que no sirven para conversar.
        .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map((m) => ({ id: String(m.name || '').replace(/^models\//, ''), nombre: m.displayName || m.name }));
      return { ok: true, modelos };
    }

    if (id === 'copilot') {
      const d = await traer(p.urlCatalogo, { Authorization: `Bearer ${key}`, Accept: 'application/vnd.github+json' });
      const lista = Array.isArray(d) ? d : (d.models || d.data || []);
      return {
        ok: true,
        modelos: lista.map((m) => ({ id: m.id || m.name, nombre: m.name || m.friendly_name || m.id })).filter((m) => m.id)
      };
    }

    // Resto: protocolo de OpenAI — GET {base}/models
    const base = baseUrlDe(id);
    if (!base) return { ok: false, error: 'Falta la URL base del proveedor.' };
    const d = await traer(`${base}/models`, { Authorization: `Bearer ${key}` });
    const modelos = (d.data || [])
      .map((m) => ({ id: m.id, nombre: m.id }))
      .filter((m) => m.id && esDeChat(m.id));
    return { ok: true, modelos };
  } catch (e) {
    return { ok: false, error: String(e.message || e).slice(0, 300) };
  }
}

// ==================== Caché de la última consulta ====================
// Se guarda lo que devolvió cada proveedor para que el desplegable tenga
// opciones sin volver a salir a internet en cada carga del panel.

const CLAVE_CACHE = 'modelosDisponibles';

export function modelosCacheados() {
  try {
    const c = JSON.parse(cfg(CLAVE_CACHE) || '{}');
    return c && typeof c === 'object' ? c : {};
  } catch { return {}; }
}

/** Mezcla lo recién consultado con lo que ya había (por proveedor). */
export function fusionarCache(previo, nuevos) {
  const salida = { ...previo };
  for (const [id, r] of Object.entries(nuevos)) {
    if (r.ok) salida[id] = { modelos: r.modelos, actualizado: new Date().toISOString() };
  }
  return salida;
}
