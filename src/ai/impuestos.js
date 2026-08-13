// Estimador de impuestos por país — MV Agendate IA.
// Dado el país configurado y la facturación mensual del profesional, estima
// la carga impositiva (régimen simplificado típico para independientes) y el
// neto aproximado. Con API key usa Claude (conocimiento de la ley de cada
// país); sin clave responde desde una base local aproximada de LATAM.
// SIEMPRE con descargo: es una orientación, no asesoramiento fiscal.
import Anthropic from '@anthropic-ai/sdk';
import { get as cfg } from '../store/config.js';
import { modeloDe } from './modelos.js';
import { registrarUso } from '../store/uso.js';
import { monedaActiva } from './cotizador.js';

// Sigue el modelo de Claude elegido en la configuración (ver ai/modelos.js).
const MODEL = () => modeloDe('claude');

let _client = null, _clientKey = null;
function getClient() {
  const key = cfg('anthropicApiKey');
  if (!key) { _client = null; _clientKey = null; return null; }
  if (key !== _clientKey) { _client = new Anthropic({ apiKey: key }); _clientKey = key; }
  return _client;
}

// ---------- Base local aproximada (fallback sin API key) ----------
// Porcentajes gruesos del régimen simplificado típico de cada país para un
// trabajador independiente de ingresos bajos/medios. Orientativos.
const REGIMENES = {
  uy: { regimen: 'Monotributo (BPS/DGI)', pct: 0.12, nota: 'Cuota fija mensual de monotributo (aportes BPS incluidos); arriba de ~UYU 60.000/mes conviene evaluar IVA mínimo o Literal E.' },
  ar: { regimen: 'Monotributo (AFIP/ARCA)', pct: 0.10, nota: 'Cuota fija por categoría (impuesto + jubilación + obra social); la categoría sube con la facturación anual.' },
  br: { regimen: 'MEI / Simples Nacional', pct: 0.08, nota: 'MEI hasta ~R$ 81.000/año con cuota fija baja; por encima, Simples Nacional (~6-15%).' },
  cl: { regimen: 'Boleta de honorarios (SII)', pct: 0.135, nota: 'Retención sobre boletas de honorarios (13,75% en 2025, sube gradualmente) que cubre cotizaciones previsionales.' },
  py: { regimen: 'IRE Simple / IVA (SET)', pct: 0.10, nota: 'IVA 10% sobre servicios + IRP si supera el mínimo; hay régimen simplificado para pequeños contribuyentes.' },
  bo: { regimen: 'Régimen General (SIN)', pct: 0.16, nota: 'IVA 13% + IT 3%; los oficios chicos suelen entrar en regímenes simplificados con cuota fija.' },
  pe: { regimen: 'Nuevo RUS / RER (SUNAT)', pct: 0.08, nota: 'Nuevo RUS: cuota fija (S/20-50/mes) hasta S/96.000/año; RER: 1,5% de ingresos + IGV si factura con crédito.' },
  ec: { regimen: 'RIMPE (SRI)', pct: 0.08, nota: 'RIMPE emprendedor: tarifa progresiva baja sobre ingresos; negocio popular: cuota fija.' },
  co: { regimen: 'Régimen Simple (DIAN)', pct: 0.07, nota: 'Régimen Simple de Tributación: 1,2-8,3% según actividad e ingresos, unifica renta e ICA.' },
  ve: { regimen: 'ISLR + IVA (SENIAT)', pct: 0.12, nota: 'ISLR progresivo + IVA 16%; alta informalidad — validá tu caso con un contador local.' },
  pa: { regimen: 'ISR (DGI)', pct: 0.10, nota: 'Exento hasta USD 11.000/año; 15% sobre el excedente hasta 50.000. Microempresa tiene régimen especial.' },
  cr: { regimen: 'Régimen Simplificado (Hacienda)', pct: 0.09, nota: 'Régimen simplificado por factores según actividad + cargas de CCSS (seguro social) que pesan bastante.' },
  ni: { regimen: 'Cuota Fija (DGI)', pct: 0.07, nota: 'Régimen de cuota fija mensual para pequeños contribuyentes según ingresos estimados.' },
  hn: { regimen: 'ISR + ISV (SAR)', pct: 0.10, nota: 'Exento de ISR por debajo del mínimo vital anual; ISV 15% si corresponde facturar.' },
  sv: { regimen: 'IVA + Renta (DGII)', pct: 0.12, nota: 'IVA 13% + renta con retención del 10% sobre servicios profesionales.' },
  gt: { regimen: 'Pequeño Contribuyente (SAT)', pct: 0.05, nota: 'Régimen de pequeño contribuyente: 5% sobre ingresos brutos hasta Q150.000/año.' },
  mx: { regimen: 'RESICO (SAT)', pct: 0.05, nota: 'RESICO personas físicas: 1-2,5% de ISR sobre ingresos + IVA 16% trasladable; muy conveniente para independientes.' },
  do: { regimen: 'RST (DGII)', pct: 0.08, nota: 'Régimen Simplificado de Tributación sobre ingresos; los servicios profesionales llevan retención del 10%.' },
  cu: { regimen: 'TCP (ONAT)', pct: 0.15, nota: 'Trabajador por cuenta propia: cuota mensual + impuesto progresivo sobre ingresos personales.' },
};

// `_simbolo` se recibe por simetría con la variante que usa IA, pero acá no se
// usa: el consumidor formatea con `moneda`. Se deja en la firma para no cambiar
// la aridad en los 3 call sites.
function estimarLocal(ingresos, paisClave, nombrePais, moneda, _simbolo) {
  const r = REGIMENES[paisClave] || REGIMENES.uy;
  const impuestos = Math.round(ingresos * r.pct);
  return {
    ok: true,
    fuente: 'guia_local',
    pais: nombrePais,
    moneda,
    regimen_sugerido: r.regimen,
    ingresos_brutos: ingresos,
    detalle: [{ concepto: `${r.regimen} (≈${Math.round(r.pct * 100)}% estimado)`, monto: impuestos }],
    total_impuestos: impuestos,
    neto_estimado: ingresos - impuestos,
    notas: `${r.nota} Estimación gruesa sin API key — cargá tu clave de Claude en /config.html para un cálculo detallado según la ley vigente de ${nombrePais}.`,
    descargo: `Orientación general, no asesoramiento fiscal — confirmá tu situación con un contador de ${nombrePais}.`,
  };
}

const estimacionToolDef = {
  name: 'entregar_estimacion_impuestos',
  description: 'Entrega la estimación final de impuestos para el profesional.',
  input_schema: {
    type: 'object',
    properties: {
      regimen_sugerido: { type: 'string', description: 'Régimen tributario más conveniente para este nivel de ingresos (nombre oficial local)' },
      detalle: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            concepto: { type: 'string', description: 'Impuesto o aporte (ej. "Monotributo BPS", "IVA mínimo", "Aporte jubilatorio")' },
            monto: { type: 'number', description: 'Monto mensual estimado en la moneda indicada' },
          },
          required: ['concepto', 'monto'],
        },
      },
      total_impuestos: { type: 'number', description: 'Suma mensual de impuestos y aportes' },
      neto_estimado: { type: 'number', description: 'Ingreso neto mensual después de impuestos y aportes' },
      notas: { type: 'string', description: 'Aclaraciones importantes (topes del régimen, cuándo conviene cambiar, etc.) en 2-4 oraciones' },
    },
    required: ['regimen_sugerido', 'detalle', 'total_impuestos', 'neto_estimado', 'notas'],
  },
};

/**
 * Estima impuestos y neto mensual para el país configurado.
 * @param {number} ingresosMensuales — facturación bruta mensual en la moneda activa
 */
export async function estimarImpuestos(ingresosMensuales) {
  const ingresos = Number(ingresosMensuales);
  if (!Number.isFinite(ingresos) || ingresos < 0) return { ok: false, error: 'Ingresos mensuales inválidos.' };

  const { pais, nombrePais, moneda, simbolo } = monedaActiva();
  const client = getClient();
  if (!client) return estimarLocal(ingresos, pais, nombrePais, moneda, simbolo);

  const prompt = `Sos un contador especializado en trabajadores independientes de ${nombrePais}. Un profesional/oficio independiente factura aproximadamente ${simbolo}${ingresos.toLocaleString('es')} ${moneda} POR MES por servicios a clientes finales.

Según la ley tributaria vigente de ${nombrePais}: elegí el régimen más conveniente para ese nivel de ingresos (régimen simplificado si califica), detallá los impuestos y aportes mensuales típicos (impuesto a la renta o cuota del régimen, IVA si corresponde, aportes jubilatorios/seguridad social), y calculá el neto mensual estimado. Montos mensuales en ${moneda}, números redondos. En las notas: topes del régimen y cuándo le convendría cambiar. Entregá el resultado ÚNICAMENTE con la herramienta entregar_estimacion_impuestos.`;

  try {
    const r = await client.messages.create({
      model: MODEL(),
      max_tokens: 2000,
      tools: [estimacionToolDef],
      tool_choice: { type: 'tool', name: 'entregar_estimacion_impuestos' },
      messages: [{ role: 'user', content: prompt }],
    });
    registrarUso(r.usage, 'impuestos');
    const uso = r.content.find((b) => b.type === 'tool_use');
    if (!uso) return estimarLocal(ingresos, pais, nombrePais, moneda, simbolo);
    return {
      ok: true,
      fuente: 'ia',
      pais: nombrePais,
      moneda,
      ingresos_brutos: ingresos,
      ...uso.input,
      descargo: `Estimación generada por IA según la normativa general de ${nombrePais} — no es asesoramiento fiscal; confirmá tu situación puntual con un contador local.`,
    };
  } catch (err) {
    console.error('[impuestos] Error de API:', err.status || '', err.message);
    return estimarLocal(ingresos, pais, nombrePais, moneda, simbolo);
  }
}
