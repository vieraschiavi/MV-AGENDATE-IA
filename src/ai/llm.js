// © 2026 Martín Viera. Todos los derechos reservados.

// Adaptador multi-proveedor de IA — MV Agendate IA.
// El profesional elige su proveedor (Claude / ChatGPT-OpenAI / Gemini) y pega
// SU propia API key en /config.html; el agente conversacional funciona igual
// con cualquiera. Internamente todo el historial se guarda en el formato de
// bloques de Anthropic (text / tool_use / tool_result) y acá lo traducimos al
// formato de cada proveedor de ida y el resultado de vuelta — así el resto del
// agente no cambia según el proveedor.
//
// Claude usa el SDK oficial (ya es dependencia). OpenAI y Gemini se llaman por
// REST con fetch (sin sumar dependencias). Funciona idéntico en PC y en la APK
// Android, porque corre en el mismo servidor.
import Anthropic from '@anthropic-ai/sdk';
import { get as cfg } from '../store/config.js';
import { PROVEEDORES as CATALOGO, IDS_PROVEEDORES, modeloDe, baseUrlDe } from './modelos.js';

export const PROVEEDORES = IDS_PROVEEDORES;

export class LLMError extends Error {}

/** Proveedor de IA elegido (default claude). */
export function proveedorActivo() {
  const p = String(cfg('proveedorIA') || 'claude').toLowerCase();
  return PROVEEDORES.includes(p) ? p : 'claude';
}

/** API key del proveedor indicado (o del activo). */
export function claveProveedor(p = proveedorActivo()) {
  const datos = CATALOGO[p] || CATALOGO.claude;
  return cfg(datos.claveApi);
}

/** true si hay IA lista para usar con el proveedor activo. */
export function iaConfigurada() { return !!claveProveedor(); }

/** Nombre lindo del proveedor, para mostrar en la UI. */
export const NOMBRE_PROVEEDOR = Object.fromEntries(
  Object.entries(CATALOGO).map(([id, p]) => [id, p.nombre])
);

// ==================== Claude (SDK) ====================
const _anthropic = new Map();
async function chatClaude(key, { system, tools, mensajes }) {
  if (!_anthropic.has(key)) _anthropic.set(key, new Anthropic({ apiKey: key }));
  const r = await _anthropic.get(key).messages.create({
    model: modeloDe('claude'),
    max_tokens: 8000,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    tools,
    messages: mensajes,
  });
  return { content: r.content, stop_reason: r.stop_reason, usage: r.usage };
}

// ==================== OpenAI (REST) ====================
function toolsOpenAI(tools) {
  return tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
}
function mensajesOpenAI(system, mensajes) {
  const out = [{ role: 'system', content: system }];
  for (const m of mensajes) {
    if (typeof m.content === 'string') { out.push({ role: m.role, content: m.content }); continue; }
    if (m.role === 'assistant') {
      const text = m.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      const calls = m.content.filter((b) => b.type === 'tool_use')
        .map((b) => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input || {}) } }));
      const msg = { role: 'assistant', content: text || null };
      if (calls.length) msg.tool_calls = calls;
      out.push(msg);
    } else {
      // user con bloques: los tool_result van como mensajes role:'tool'
      for (const b of m.content) {
        if (b.type === 'tool_result') out.push({ role: 'tool', tool_call_id: b.tool_use_id, content: typeof b.content === 'string' ? b.content : JSON.stringify(b.content) });
        else if (b.type === 'text' && b.text) out.push({ role: 'user', content: b.text });
      }
    }
  }
  return out;
}
/**
 * Un turno con cualquier proveedor que hable el protocolo de OpenAI.
 *
 * Sirve para OpenAI, Grok (xAI), GitHub Models y el comodín "compatible": lo
 * único que cambia entre ellos es la URL base y el modelo, así que un solo
 * adaptador los cubre a todos en vez de copiar esta función cuatro veces.
 */
async function chatOpenAI(key, { system, tools, mensajes }, proveedor = 'openai') {
  const base = baseUrlDe(proveedor);
  if (!base) throw new LLMError(`Falta la URL base de ${NOMBRE_PROVEEDOR[proveedor] || proveedor}.`);
  const modelo = modeloDe(proveedor);
  if (!modelo) throw new LLMError(`Elegí un modelo para ${NOMBRE_PROVEEDOR[proveedor] || proveedor} en la configuración.`);
  const r = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modelo, messages: mensajesOpenAI(system, mensajes), tools: toolsOpenAI(tools), tool_choice: 'auto', max_tokens: 4096 }),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw new LLMError(`${NOMBRE_PROVEEDOR[proveedor] || proveedor} ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  const m = d.choices?.[0]?.message || {};
  const content = [];
  if (m.content) content.push({ type: 'text', text: m.content });
  for (const c of m.tool_calls || []) {
    let input = {};
    try { input = JSON.parse(c.function.arguments || '{}'); } catch { /* args inválidos: {} */ }
    content.push({ type: 'tool_use', id: c.id, name: c.function.name, input });
  }
  const u = d.usage || {};
  return { content, stop_reason: (m.tool_calls && m.tool_calls.length) ? 'tool_use' : 'end_turn', usage: { input_tokens: u.prompt_tokens || 0, output_tokens: u.completion_tokens || 0 } };
}

// ==================== Gemini (REST) ====================
function toolsGemini(tools) {
  return [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.input_schema })) }];
}
function contenidosGemini(mensajes) {
  const idName = {}; // tool_use_id → nombre de función (Gemini responde por nombre, no por id)
  const contents = [];
  for (const m of mensajes) {
    if (typeof m.content === 'string') { contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }); continue; }
    if (m.role === 'assistant') {
      const parts = [];
      for (const b of m.content) {
        if (b.type === 'text' && b.text) parts.push({ text: b.text });
        else if (b.type === 'tool_use') { idName[b.id] = b.name; parts.push({ functionCall: { name: b.name, args: b.input || {} } }); }
      }
      if (parts.length) contents.push({ role: 'model', parts });
    } else {
      const parts = [];
      for (const b of m.content) {
        if (b.type === 'tool_result') {
          let resp;
          try { resp = JSON.parse(typeof b.content === 'string' ? b.content : JSON.stringify(b.content)); } catch { resp = { resultado: b.content }; }
          if (resp === null || typeof resp !== 'object' || Array.isArray(resp)) resp = { resultado: resp };
          parts.push({ functionResponse: { name: idName[b.tool_use_id] || 'herramienta', response: resp } });
        } else if (b.type === 'text' && b.text) parts.push({ text: b.text });
      }
      if (parts.length) contents.push({ role: 'user', parts });
    }
  }
  return contents;
}
async function chatGemini(key, { system, tools, mensajes }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modeloDe('gemini')}:generateContent?key=${encodeURIComponent(key)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: contenidosGemini(mensajes), tools: toolsGemini(tools) }),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw new LLMError(`Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  const parts = d.candidates?.[0]?.content?.parts || [];
  const content = [];
  let n = 0;
  for (const p of parts) {
    if (p.text) content.push({ type: 'text', text: p.text });
    else if (p.functionCall) content.push({ type: 'tool_use', id: `g${n++}_${p.functionCall.name}`, name: p.functionCall.name, input: p.functionCall.args || {} });
  }
  const um = d.usageMetadata || {};
  const hayCall = content.some((b) => b.type === 'tool_use');
  return { content, stop_reason: hayCall ? 'tool_use' : 'end_turn', usage: { input_tokens: um.promptTokenCount || 0, output_tokens: um.candidatesTokenCount || 0 } };
}

// ==================== Entrada unificada ====================
/**
 * Un turno de conversación con el proveedor activo.
 * @param {{system:string, tools:Array, mensajes:Array}} opts (mensajes en formato de bloques Anthropic)
 * @returns {Promise<{content:Array, stop_reason:string, usage:{input_tokens:number,output_tokens:number}}>}
 */
export async function chatearLLM(opts) {
  const p = proveedorActivo();
  const key = claveProveedor(p);
  if (!key) throw new LLMError('No hay una API key de IA configurada.');
  if (p === 'gemini') return chatGemini(key, opts);
  if (p === 'claude') return chatClaude(key, opts);
  // openai, grok, copilot y el comodín: todos hablan el protocolo de OpenAI.
  return chatOpenAI(key, opts, p);
}

// Exportados para tests de los traductores.
export const _internos = { mensajesOpenAI, toolsOpenAI, contenidosGemini, toolsGemini };
