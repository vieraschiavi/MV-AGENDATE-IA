// © 2026 Martín Viera. Todos los derechos reservados.

// Tests del adaptador multi-proveedor de IA: selección de proveedor y los
// traductores de formato (Anthropic ↔ OpenAI / Gemini) — node --test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { proveedorActivo, claveProveedor, iaConfigurada, PROVEEDORES, _internos } from '../src/ai/llm.js';
import { setConfig } from '../src/store/config.js';

after(() => { setConfig({ proveedorIA: 'claude', anthropicApiKey: '', openaiApiKey: '', geminiApiKey: '' }); });

const TOOLS = [{ name: 'cotizar', description: 'Cotiza un trabajo', input_schema: { type: 'object', properties: { trabajo: { type: 'string' } }, required: ['trabajo'] } }];
const MENSAJES = [
  { role: 'user', content: 'hola, cuánto sale un toma?' },
  { role: 'assistant', content: [
    { type: 'text', text: 'Dejame cotizarlo.' },
    { type: 'tool_use', id: 'call_1', name: 'cotizar', input: { trabajo: 'instalacion_toma' } },
  ] },
  { role: 'user', content: [
    { type: 'tool_result', tool_use_id: 'call_1', content: JSON.stringify({ total: 1400, moneda: 'UYU' }) },
  ] },
];

test('proveedorActivo/claveProveedor respetan la config y validan', () => {
  setConfig({ proveedorIA: 'openai', openaiApiKey: 'sk-openai', anthropicApiKey: 'sk-ant' });
  assert.equal(proveedorActivo(), 'openai');
  assert.equal(claveProveedor(), 'sk-openai');
  assert.equal(claveProveedor('claude'), 'sk-ant');
  assert.equal(iaConfigurada(), true);
  setConfig({ proveedorIA: 'gemini', geminiApiKey: '' });
  assert.equal(proveedorActivo(), 'gemini');
  assert.equal(iaConfigurada(), false, 'gemini elegido pero sin key → no configurada');
  setConfig({ proveedorIA: 'inventado' });
  assert.equal(proveedorActivo(), 'claude', 'proveedor inválido cae a claude');
  assert.ok(PROVEEDORES.includes('claude') && PROVEEDORES.includes('openai') && PROVEEDORES.includes('gemini'));
});

test('traductor OpenAI: system + tool_use → tool_calls, tool_result → role tool', () => {
  const msgs = _internos.mensajesOpenAI('Sos el asistente', MENSAJES);
  assert.equal(msgs[0].role, 'system');
  assert.equal(msgs[1].role, 'user');
  const asst = msgs.find((m) => m.role === 'assistant');
  assert.equal(asst.content, 'Dejame cotizarlo.');
  assert.equal(asst.tool_calls[0].function.name, 'cotizar');
  assert.equal(JSON.parse(asst.tool_calls[0].function.arguments).trabajo, 'instalacion_toma');
  const toolMsg = msgs.find((m) => m.role === 'tool');
  assert.equal(toolMsg.tool_call_id, 'call_1');
  assert.match(toolMsg.content, /1400/);
  const tools = _internos.toolsOpenAI(TOOLS);
  assert.equal(tools[0].type, 'function');
  assert.equal(tools[0].function.name, 'cotizar');
  assert.equal(tools[0].function.parameters.type, 'object');
});

test('traductor Gemini: roles model/user, functionCall y functionResponse por nombre', () => {
  const contents = _internos.contenidosGemini(MENSAJES);
  assert.equal(contents[0].role, 'user');
  const model = contents.find((c) => c.role === 'model');
  assert.ok(model.parts.some((p) => p.text === 'Dejame cotizarlo.'));
  const fc = model.parts.find((p) => p.functionCall);
  assert.equal(fc.functionCall.name, 'cotizar');
  assert.equal(fc.functionCall.args.trabajo, 'instalacion_toma');
  // el tool_result se resuelve al NOMBRE de la función (Gemini no usa id)
  const userResp = contents[contents.length - 1];
  const fr = userResp.parts.find((p) => p.functionResponse);
  assert.equal(fr.functionResponse.name, 'cotizar');
  assert.equal(fr.functionResponse.response.total, 1400);
  const tools = _internos.toolsGemini(TOOLS);
  assert.equal(tools[0].functionDeclarations[0].name, 'cotizar');
});
