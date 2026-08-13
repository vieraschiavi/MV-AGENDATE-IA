// © 2026 Martín Viera. Todos los derechos reservados.

// Configuración PROPIA de cada cuenta SaaS (fase 2) — persiste en Redis.
// Cada cuenta online guarda sus overrides (oficio, país/moneda, horarios,
// equipo, catálogo custom, aprobación de cotizaciones, credenciales de sus
// canales, su propia API key de Claude…) que se superponen a los defaults
// globales vía el contexto de cuenta (store/contextoCuenta.js).
// Las claves del VENDEDOR (adminKey, mercadopagoToken, licencias, demo,
// jwtSecret) quedan fuera: son de la instancia, no de la cuenta.
import { kvGet, kvSet } from './redis.js';

// Subset de claves de store/config.js que una cuenta puede definir para sí.
export const CLAVES_CUENTA = [
  'proveedorIA', 'anthropicApiKey', 'openaiApiKey', 'geminiApiKey',
  'grokApiKey', 'copilotApiKey', 'compatibleApiKey', 'compatibleBaseUrl',
  // Cada cuenta elige SU modelo: es su gasto de tokens, no el de la instancia.
  'modeloClaude', 'modeloOpenai', 'modeloGemini', 'modeloGrok', 'modeloCopilot',
  'modeloCompatible', 'modelosDisponibles',
  'nombreProfesional', 'oficioProfesional',
  'pais', 'moneda', 'oficiosCustom', 'aprobarCotizaciones',
  'agenciaNombre', 'agenciaTelefono', 'logoUrl',
  'horarioInicio', 'horarioFin', 'almuerzoInicio', 'almuerzoFin', 'diasLibres',
  'profesionales',
  'whatsappToken', 'whatsappPhoneId', 'whatsappVerifyToken',
  'twilioAccountSid', 'twilioAuthToken', 'twilioNumero',
  'deepgramApiKey', 'elevenlabsApiKey', 'elevenlabsVoiceId',
  'crmWebhookUrl'
];
const SECRETAS = new Set([
  'anthropicApiKey', 'openaiApiKey', 'geminiApiKey', 'grokApiKey', 'copilotApiKey',
  'compatibleApiKey', 'whatsappToken', 'whatsappVerifyToken',
  'twilioAuthToken', 'deepgramApiKey', 'elevenlabsApiKey'
]);

const clave = (cuentaId) => `config:cuenta:${cuentaId}`;
const cache = new Map();

/** Overrides de configuración de una cuenta (objeto plano, puede ser {}). */
export async function obtenerOverrides(cuentaId) {
  if (!cuentaId || cuentaId === 'default') return {};
  if (cache.has(cuentaId)) return cache.get(cuentaId);
  const cfg = (await kvGet(clave(cuentaId))) || {};
  cache.set(cuentaId, cfg);
  return cfg;
}

/** Actualiza los overrides de la cuenta (solo claves permitidas; '' borra). */
export async function guardarOverrides(cuentaId, patch = {}) {
  const actual = { ...(await obtenerOverrides(cuentaId)) };
  for (const k of CLAVES_CUENTA) {
    if (k in patch && patch[k] !== undefined && patch[k] !== null) {
      const v = String(patch[k]).trim();
      if (v === '') delete actual[k];
      else actual[k] = v;
    }
  }
  cache.set(cuentaId, actual);
  await kvSet(clave(cuentaId), actual);
  return actual;
}

/** Configuración de la cuenta para mostrar en el panel (secretos enmascarados). */
export async function configPublicaCuenta(cuentaId) {
  const cfg = await obtenerOverrides(cuentaId);
  const out = {};
  for (const k of CLAVES_CUENTA) out[k] = SECRETAS.has(k) ? (cfg[k] ? '(configurada)' : '') : (cfg[k] || '');
  const prov = (cfg.proveedorIA || 'claude').toLowerCase();
  const claveProv = prov === 'openai' ? cfg.openaiApiKey : prov === 'gemini' ? cfg.geminiApiKey : cfg.anthropicApiKey;
  out.estado = {
    ia: !!claveProv,
    claude: !!claveProv,
    whatsapp: !!(cfg.whatsappToken && cfg.whatsappPhoneId),
    voz: !!(cfg.twilioAccountSid && cfg.twilioAuthToken),
    vozPremium: !!(cfg.deepgramApiKey && cfg.elevenlabsApiKey && cfg.twilioAccountSid),
    crm: !!cfg.crmWebhookUrl
  };
  return out;
}

/**
 * Busca qué cuenta SaaS tiene configurado este Phone Number ID de WhatsApp —
 * para rutear los mensajes entrantes del webhook de Meta a la cuenta dueña.
 * Devuelve { cuentaId, overrides } o null si ninguna lo tiene.
 */
export async function cuentaPorPhoneId(phoneId, listaCuentaIds) {
  if (!phoneId) return null;
  for (const id of listaCuentaIds) {
    const cfg = await obtenerOverrides(id);
    if (cfg.whatsappPhoneId === String(phoneId)) return { cuentaId: id, overrides: cfg };
  }
  return null;
}

/**
 * Busca qué cuenta SaaS es dueña del número de teléfono que recibió una
 * llamada (webhook de voz de Twilio, campo "To"). Compara en E.164 ignorando
 * espacios/guiones. Devuelve { cuentaId, overrides } o null.
 */
const soloDigitos = (n) => String(n || '').replace(/[^\d]/g, '');
export async function cuentaPorNumeroVoz(numero, listaCuentaIds) {
  const buscado = soloDigitos(numero);
  if (!buscado) return null;
  for (const id of listaCuentaIds) {
    const cfg = await obtenerOverrides(id);
    if (cfg.twilioNumero && soloDigitos(cfg.twilioNumero) === buscado) return { cuentaId: id, overrides: cfg };
  }
  return null;
}
