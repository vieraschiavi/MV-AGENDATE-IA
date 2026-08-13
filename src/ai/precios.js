// © 2026 Martín Viera. Todos los derechos reservados.

// Investigador de precios de mercado — MV Agendate IA.
// Dado un oficio/profesión y el país configurado, la IA estima qué se cobra
// en ese mercado por cada tipo de trabajo (mano de obra/honorarios y
// materiales cuando corresponde) y sugiere valores para el catálogo.
// Son valores de REFERENCIA para arrancar — el profesional siempre puede
// ajustarlos a su zona y su experiencia antes de aplicarlos.
import Anthropic from '@anthropic-ai/sdk';
import { get as cfg } from '../store/config.js';
import { modeloDe } from './modelos.js';
import { registrarUso } from '../store/uso.js';
import { oficiosActivos, monedaActiva } from './cotizador.js';

// Sigue el modelo de Claude que eligió el profesional en la configuración: si
// bajó a uno más barato para gastar menos por token, esta llamada también.
const MODEL = () => modeloDe('claude');

let _client = null, _clientKey = null;
function getClient() {
  const key = cfg('anthropicApiKey');
  if (!key) { _client = null; _clientKey = null; return null; }
  if (key !== _clientKey) { _client = new Anthropic({ apiKey: key }); _clientKey = key; }
  return _client;
}

const sugerenciaToolDef = {
  name: 'entregar_sugerencia_precios',
  description: 'Entrega la sugerencia final de precios de mercado para cada trabajo.',
  input_schema: {
    type: 'object',
    properties: {
      trabajos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            clave: { type: 'string', description: 'Clave exacta del trabajo tal como fue provista' },
            mano_obra: { type: 'number', description: 'Mano de obra u honorarios sugeridos (valor típico de mercado, número redondo)' },
            materiales_base: { type: 'number', description: 'Materiales estimados si el trabajo los suele incluir; 0 si no aplica (ej. honorarios profesionales)' },
            rango_mercado: {
              type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2,
              description: '[mínimo, máximo] que se ve en ese mercado para el trabajo completo',
            },
            nota: { type: 'string', description: 'Aclaración corta si hace falta (ej. "varía mucho según complejidad")' },
          },
          required: ['clave', 'mano_obra', 'materiales_base', 'rango_mercado'],
        },
      },
      notas_generales: { type: 'string', description: 'Contexto del mercado relevado en 2-3 oraciones' },
    },
    required: ['trabajos'],
  },
};

/**
 * Sugiere precios de mercado para todos los trabajos de un oficio, en la
 * moneda y el país configurados. Requiere API key (sin ella devuelve un
 * error claro — no hay forma honesta de "investigar el mercado" offline).
 */
export async function sugerirPrecios(oficioClave) {
  const oficios = oficiosActivos();
  const oficio = oficios[oficioClave];
  if (!oficio) return { ok: false, error: `Oficio no encontrado: ${oficioClave}` };

  const client = getClient();
  const { nombrePais, moneda } = monedaActiva();
  if (!client) {
    return {
      ok: false,
      error: `Para investigar precios de mercado hace falta la API key de Claude (cargala en /config.html). Mientras tanto podés editar los valores a mano — los actuales son de referencia.`,
    };
  }

  const listaTrabajos = Object.entries(oficio.trabajos)
    .map(([clave, t]) => `- ${clave}: "${t.nombre}" (duración típica ${t.duracion_min} min; valores actuales: mano_obra ${t.mano_obra}, materiales ${t.materiales_base})`)
    .join('\n');

  const prompt = `Sos un consultor de precios para profesionales y oficios en ${nombrePais}. Para la profesión/oficio "${oficio.nombre}"${oficio.honorarios ? ' (servicio profesional: se cobran honorarios, sin materiales salvo excepciones)' : ''}, estimá qué se cobra HOY en el mercado de ${nombrePais} por cada uno de estos trabajos, expresado en ${moneda}:

${listaTrabajos}

Reglas: valores típicos de mercado (ni el más caro ni el más barato), números redondos en ${moneda}, y un rango [mínimo, máximo] realista por trabajo. Si un trabajo suele incluir materiales, estimalos por separado; si son honorarios profesionales, materiales_base = 0. Estos son valores de referencia para que el profesional arranque — aclaralo en las notas. Entregá el resultado ÚNICAMENTE con la herramienta entregar_sugerencia_precios.`;

  try {
    const r = await client.messages.create({
      model: MODEL(),
      max_tokens: 4000,
      tools: [sugerenciaToolDef],
      tool_choice: { type: 'tool', name: 'entregar_sugerencia_precios' },
      messages: [{ role: 'user', content: prompt }],
    });
    registrarUso(r.usage, 'precios');
    const uso = r.content.find((b) => b.type === 'tool_use');
    if (!uso) return { ok: false, error: 'La IA no devolvió una sugerencia estructurada; probá de nuevo.' };
    return {
      ok: true,
      pais: nombrePais,
      moneda,
      oficio: oficio.nombre,
      ...uso.input,
      descargo: 'Valores estimados por IA como referencia de mercado — validalos con tu experiencia y tu zona antes de aplicarlos.',
    };
  } catch (err) {
    console.error('[precios] Error de API:', err.status || '', err.message);
    return { ok: false, error: 'No pude consultar la IA en este momento: ' + (err.message || 'error desconocido') };
  }
}
