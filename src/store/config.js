// Configuración en caliente del servidor MV.
// Permite que el profesional cargue su propia API key de Claude y sus datos
// desde el panel de administración, sin editar archivos ni reiniciar el
// servidor. Persiste en data/config.json (no se versiona: es privado).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const FILE = join(process.env.VERCEL ? '/tmp/mvdata' : join(here, '../../data'), 'config.json');

// Claves de configuración y su variable de entorno equivalente (para defaults).
const ENV = {
  anthropicApiKey: 'ANTHROPIC_API_KEY',
  nombreProfesional: 'NOMBRE_PROFESIONAL', // a quién representa el agente (ej: "Juan Pérez")
  oficioProfesional: 'OFICIO_PROFESIONAL', // clave de src/data/oficios.json (ej: "electricista")
  pais: 'PAIS',                            // clave de src/data/paises.js (ej: "uy", "ar", "mx")
  moneda: 'MONEDA',                        // '' = moneda local del país | 'USD' = facturar en dólares
  // Profesiones/oficios creados por el usuario (JSON con el mismo formato de
  // oficios.json) — se fusionan con el catálogo base: cualquier profesional
  // (médico, abogado, taller, etc.) puede armar el suyo desde /config.html.
  oficiosCustom: 'OFICIOS_CUSTOM',
  agenciaNombre: 'AGENCIA_NOMBRE',         // nombre comercial mostrado en fichas/exportaciones
  agenciaTelefono: 'AGENCIA_TELEFONO',
  sitioUrl: 'SITIO_URL',                   // dominio público del deploy (para back_urls de MercadoPago, ej. https://mv-agendate-ia.vercel.app)
  logoUrl: 'LOGO_URL',            // logo del profesional (URL o data-URI) para fichas/exportaciones
  horarioInicio: 'HORARIO_INICIO',       // HH:MM inicio de la jornada laboral
  horarioFin: 'HORARIO_FIN',             // HH:MM fin de la jornada laboral
  almuerzoInicio: 'ALMUERZO_INICIO',
  almuerzoFin: 'ALMUERZO_FIN',
  diasLibres: 'DIAS_LIBRES',             // ej: "0,6" (domingo y sábado), 0=domingo
  // Equipo de profesionales de la cuenta (JSON: [{id,nombre,oficio,horarioInicio,
  // horarioFin,almuerzoInicio,almuerzoFin,diasLibres}]) — para estudios con más
  // de un trabajador (ej. 3 electricistas), cada uno con su propia agenda.
  // Vacío = un solo profesional implícito armado con los campos sueltos de arriba.
  profesionales: 'PROFESIONALES',
  whatsappToken: 'WHATSAPP_TOKEN',
  whatsappPhoneId: 'WHATSAPP_PHONE_ID',
  whatsappVerifyToken: 'WHATSAPP_VERIFY_TOKEN',
  twilioAccountSid: 'TWILIO_ACCOUNT_SID',
  twilioAuthToken: 'TWILIO_AUTH_TOKEN',
  deepgramApiKey: 'DEEPGRAM_API_KEY',
  elevenlabsApiKey: 'ELEVENLABS_API_KEY',
  elevenlabsVoiceId: 'ELEVENLABS_VOICE_ID',
  crmWebhookUrl: 'CRM_WEBHOOK_URL',
  adminKey: 'ADMIN_KEY',
  demoLimite: 'DEMO_LIMITE',      // '1' = instancia de demostración con cupo
  demoMaxUsos: 'DEMO_MAX_USOS',   // usos gratis antes de bloquear (default 3)
  costoInputMusd: 'COSTO_INPUT_MUSD',   // USD por millón de tokens de entrada (ref)
  costoOutputMusd: 'COSTO_OUTPUT_MUSD', // USD por millón de tokens de salida (ref)
  mercadopagoToken: 'MERCADOPAGO_TOKEN', // Access Token de MercadoPago (cobros → payout a tu banco)
  piperBin: 'PIPER_BIN',          // binario de Piper (default 'piper' en el PATH)
  piperVoz: 'PIPER_VOZ',          // ruta al modelo de voz .onnx (default voces/es_AR-daniela-high.onnx)
  // ID del plan recurrente (Preapproval) de MercadoPago para el plan Full —
  // se crea solo la primera vez que alguien elige suscripción y se cachea acá
  // para no crear un plan nuevo en cada intento de compra.
  preapprovalPlanFull: 'PREAPPROVAL_PLAN_FULL',
  // Licencia de ESTA copia descargada (si se vendió con suscripción Pro IA):
  // se usa para chequear periódicamente contra el servidor central si sigue
  // activa. Se completa en /config.html con el código que llegó al comprar.
  licenciaLocal: 'MV_LICENCIA'
};
const CLAVES = Object.keys(ENV);
const SECRETAS = new Set([
  'anthropicApiKey', 'whatsappToken', 'whatsappVerifyToken',
  'twilioAuthToken', 'deepgramApiKey', 'elevenlabsApiKey', 'adminKey', 'mercadopagoToken'
]);

// Clave/config EMBEBIDA por el vendedor (oculta, base64) que viaja con el
// producto. Es el default de más baja prioridad: nunca se expone por la API.
const EMBEBIDA_FILE = join(here, '../clave-embebida.b64');
function leerEmbebida() {
  try {
    if (!existsSync(EMBEBIDA_FILE)) return {};
    const json = Buffer.from(readFileSync(EMBEBIDA_FILE, 'utf8').trim(), 'base64').toString('utf8');
    return JSON.parse(json);
  } catch { return {}; }
}

let cache = null;
function cargar() {
  if (cache) return cache;
  const archivo = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : {};
  const embebida = leerEmbebida();
  cache = {};
  // Prioridad: config.json (runtime) > variable de entorno > clave embebida.
  for (const k of CLAVES) cache[k] = archivo[k] ?? process.env[ENV[k]] ?? embebida[k] ?? '';
  return cache;
}

/** Valor actual de una clave (''si no está configurada). */
export function get(clave) { return cargar()[clave] || ''; }

/** Copia de toda la configuración (con secretos en claro; uso interno). */
export function getConfig() { return { ...cargar() }; }

/** Actualiza y persiste. Solo toca las claves presentes en el patch. */
export function setConfig(patch = {}) {
  const actual = cargar();
  for (const k of CLAVES) {
    if (k in patch && patch[k] !== undefined && patch[k] !== null) {
      actual[k] = String(patch[k]).trim();
    }
  }
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(actual, null, 2));
  cache = actual;
  return getConfigPublico();
}

/**
 * Lista de profesionales/trabajadores de la cuenta (para estudios con más de
 * uno, ej. 3 electricistas). Si no se cargó ninguno, devuelve un único
 * profesional implícito armado con los campos sueltos de siempre
 * (nombreProfesional/oficioProfesional/horarioInicio.../almuerzoInicio.../diasLibres) — así
 * las cuentas de un solo profesional no necesitan migrar nada.
 */
export function listarProfesionales() {
  const c = cargar();
  try {
    const lista = JSON.parse(c.profesionales || '[]');
    if (Array.isArray(lista) && lista.length) return lista;
  } catch { /* config guardada inválida: cae al default de abajo */ }
  return [{
    id: 'default',
    nombre: c.nombreProfesional || 'Profesional',
    oficio: c.oficioProfesional || 'electricista',
    horarioInicio: c.horarioInicio || '08:00',
    horarioFin: c.horarioFin || '19:00',
    almuerzoInicio: c.almuerzoInicio || '12:30',
    almuerzoFin: c.almuerzoFin || '13:30',
    diasLibres: c.diasLibres || '0'
  }];
}

/** Lista cruda guardada (sin sintetizar el default) — para el editor de equipo de /config.html: vacía si no se cargó ningún profesional todavía. */
export function profesionalesGuardados() {
  try {
    const lista = JSON.parse(cargar().profesionales || '[]');
    return Array.isArray(lista) ? lista : [];
  } catch { return []; }
}

/** Un profesional puntual por id (o el primero de la lista si no se especifica/no existe). */
export function obtenerProfesional(id) {
  const lista = listarProfesionales();
  return lista.find((p) => p.id === id) || lista[0];
}

/** Guarda la lista completa de profesionales del equipo (reemplaza la anterior). */
function slug(texto) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function guardarProfesionales(lista) {
  const limpia = (Array.isArray(lista) ? lista : [])
    .map((p, i) => ({
      id: slug(p.id || p.nombre) || `prof-${i + 1}`,
      nombre: String(p.nombre || '').trim(),
      oficio: String(p.oficio || '').trim(),
      horarioInicio: String(p.horarioInicio || '08:00').trim(),
      horarioFin: String(p.horarioFin || '19:00').trim(),
      almuerzoInicio: String(p.almuerzoInicio || '12:30').trim(),
      almuerzoFin: String(p.almuerzoFin || '13:30').trim(),
      diasLibres: String(p.diasLibres ?? '0').trim()
    }))
    .filter((p) => p.nombre);
  setConfig({ profesionales: JSON.stringify(limpia) });
  return limpia;
}

// Nunca exponemos ni un fragmento del secreto: solo si está configurado o no.
const mask = (v) => (v ? '(configurada)' : '');

/**
 * Configuración para mostrar en el panel: secretos enmascarados + un resumen
 * de qué canales quedan activos con lo cargado.
 */
export function getConfigPublico() {
  const c = cargar();
  const out = {};
  for (const k of CLAVES) out[k] = SECRETAS.has(k) ? mask(c[k]) : c[k];
  out.estado = {
    claude: !!c.anthropicApiKey,
    whatsapp: !!(c.whatsappToken && c.whatsappPhoneId),
    voz: !!(c.twilioAccountSid && c.twilioAuthToken),
    vozPremium: !!(c.deepgramApiKey && c.elevenlabsApiKey && c.twilioAccountSid),
    crm: !!c.crmWebhookUrl
  };
  return out;
}
