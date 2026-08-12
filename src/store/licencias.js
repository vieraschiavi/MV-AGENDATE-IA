// Pedidos, pagos y licencias de descarga.
// Flujo: el cliente crea un pedido (elige plan/versión y medio de pago) → paga
// (tarjeta vía PSP, MercadoPago o transferencia a Itaú) → al confirmarse el pago
// se emite una LICENCIA y un TOKEN de descarga que habilita bajar el software.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { redisDisponible, kvGet, kvSet } from './redis.js';

const here = dirname(fileURLToPath(import.meta.url));
const DIR = process.env.MV_DATOS_DIR || (process.env.VERCEL ? '/tmp/mvdata' : join(here, '../../data'));
const FILE = join(DIR, 'licencias.json');
// Clave única de los pedidos en Redis. Los demás stores del repo (cuentas,
// creditos, suscripciones…) ya persisten así; éste era el único que no.
const CLAVE_REDIS = 'mvagendate:pedidos';

// Planes y precios (USD, pago único vía la tienda). Editables. version: 'pc' | 'apk' | 'ios' | 'todas'.
// Precio de referencia según relevamiento de competencia LATAM/Uruguay (ver README
// "Competencia y precios"): el software es pago único; el plan Full agrega IA
// conversacional, cuyo costo de uso (Claude + WhatsApp Business + Twilio) es
// aparte y directo del profesional con sus propias cuentas — no se revende.
export const PLANES = {
  basico: {
    nombre: 'Básico', precio: 129,
    incluye: 'Agenda con optimización de traslados y descansos + cotizador multi-oficio + CRM de clientes + dashboards (trabajos por día/semana/mes/año, facturación) + exportación Excel/PDF + app PC/APK',
    ia: false
  },
  full: {
    nombre: 'Full (con IA)', precio: 299,
    incluye: 'Todo lo del plan Básico + chatbot y ChatVoice con IA (WhatsApp/voz) que cotiza y agenda solo, con voz rioplatense + aviso automático de retraso al próximo cliente',
    ia: true,
    nota_costo_variable: 'El uso de IA (Claude), WhatsApp Business API y telefonía (Twilio) corre con las cuentas propias del profesional; costo de referencia US$ 20-40/mes según volumen de conversaciones — no incluido en el precio del software.'
  },
  // Modo SaaS hosteado: sin descarga — cuenta online con datos propios aislados,
  // 14 días de prueba gratis y suscripción mensual. Siempre recurrente.
  saas: {
    nombre: 'SaaS online (mensual)', precio: 15, mensual: true,
    incluye: 'Cuenta online lista para usar (sin instalar nada): agenda optimizada + cotizador + CRM + dashboards + exportación, con tus datos privados y aislados. 14 días de prueba gratis. Cancelás cuando quieras.',
    ia: false,
    nota_costo_variable: 'Los canales con IA (WhatsApp/voz) en modo SaaS se habilitan por cuenta en una fase posterior; hoy el chatbot/ChatVoice corre en las versiones descargables.'
  }
};
// Único medio de pago: MercadoPago (tarjeta, saldo, etc. dentro de su checkout).
export const MEDIOS = ['mercadopago'];

// Persistencia. En serverless (Vercel) el pedido se crea en un lambda y el
// webhook de MercadoPago llega a OTRO: con los pedidos en /tmp, el webhook
// buscaba el pedido, no lo encontraba y el cliente que ya había pagado se
// quedaba sin licencia ni email ("No encontré tu pedido" en gracias.html).
// Por eso van a Redis, que es lo que comparten todas las invocaciones.
let db = null;

async function cargar() {
  if (redisDisponible()) {
    // Siempre se relee: otra invocación pudo haber escrito mientras tanto,
    // y un caché en memoria acá reintroduce exactamente el bug de arriba.
    const crudo = await kvGet(CLAVE_REDIS);
    db = (typeof crudo === 'string' ? JSON.parse(crudo) : crudo) || { pedidos: {} };
    if (!db.pedidos) db.pedidos = {};
    return db;
  }
  if (!db) db = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { pedidos: {} };
  return db;
}

async function guardar() {
  if (redisDisponible()) { await kvSet(CLAVE_REDIS, JSON.stringify(db)); return; }
  mkdirSync(DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(db, null, 2));
}

/** Crea un pedido pendiente de pago (siempre MercadoPago). */
export async function crearPedido({ plan, version = 'pc', email, nombre, recurrente }) {
  await cargar();
  if (!PLANES[plan]) return { ok: false, error: 'Plan inválido.' };
  if (!email) return { ok: false, error: 'Falta el email.' };
  const id = 'ORD-' + randomBytes(4).toString('hex').toUpperCase();
  const pedido = {
    id, plan, version, email, nombre: nombre || '', medio: 'mercadopago',
    // El plan SaaS es suscripción mensual siempre; los demás según lo pedido.
    recurrente: plan === 'saas' || !!recurrente,
    total_usd: PLANES[plan].precio, estado: 'pendiente',
    creado: new Date().toISOString(), licencia: null, token: null
  };
  db.pedidos[id] = pedido;
  await guardar();
  return { ok: true, pedido };
}

/** Marca un pedido como pagado y emite licencia + token de descarga. */
export async function confirmarPago(id) {
  await cargar();
  const p = db.pedidos[id];
  if (!p) return { ok: false, error: 'Pedido no encontrado.' };
  if (p.estado === 'pagado') return { ok: true, pedido: p, yaEstaba: true };
  p.estado = 'pagado';
  p.pagado = new Date().toISOString();
  p.licencia = 'MV-' + p.plan.toUpperCase() + '-' + randomUUID().slice(0, 8).toUpperCase();
  // Token SIN ESTADO (funciona aunque el pedido no persista, ej. serverless).
  p.token = firmarDescarga(p.version);
  await guardar();
  return { ok: true, pedido: p };
}

/**
 * Borra un pedido que quedó a medias — solo si sigue pendiente.
 *
 * Va de la mano de /api/comprar: el pedido se guarda antes de pedirle el link
 * de pago a MercadoPago, así que si esa llamada falla (timeout, 5xx) el pedido
 * queda pendiente de algo que nunca va a pasar. Esos huérfanos ensucian
 * /api/licencias y, peor, buscarPedidoPendientePorEmail los puede elegir
 * después para reconciliar OTRO pago del mismo email.
 *
 * Nunca toca un pedido pagado: si el pago entró por otro lado (el webhook llegó
 * antes que nuestra respuesta), borrarlo sería quitarle al cliente la licencia
 * que ya compró.
 */
export async function descartarPedidoPendiente(id) {
  await cargar();
  const p = db.pedidos[id];
  if (!p) return { ok: false, error: 'Pedido no encontrado.' };
  if (p.estado !== 'pendiente') return { ok: false, error: 'El pedido ya no está pendiente.', estado: p.estado };
  delete db.pedidos[id];
  await guardar();
  return { ok: true };
}

/** Valida un token de descarga → pedido pagado. */
export async function validarToken(token) {
  await cargar();
  const p = Object.values(db.pedidos).find((x) => x.token === token && x.estado === 'pagado');
  return p || null;
}

export async function obtenerPedido(id) { return (await cargar()).pedidos[id] || null; }
export async function listarPedidos() { return Object.values((await cargar()).pedidos).sort((a, b) => (b.creado || '').localeCompare(a.creado)); }

/**
 * Busca el pedido pendiente más reciente de MercadoPago recurrente para un
 * email (y opcionalmente plan). Se usa para reconciliar el webhook de
 * preapproval: el checkout de suscripción es un link compartido por plan (no
 * hay forma de pasarle el external_reference de nuestro pedido), así que el
 * único dato que MercadoPago nos devuelve para identificar al cliente es el
 * email que tipeó él mismo en su checkout.
 */
export async function buscarPedidoPendientePorEmail(email, plan) {
  await cargar();
  const candidatos = Object.values(db.pedidos).filter((p) =>
    p.estado === 'pendiente' && p.medio === 'mercadopago' && p.recurrente &&
    (email ? p.email?.toLowerCase() === String(email).toLowerCase() : true) &&
    (plan ? p.plan === plan : true)
  );
  candidatos.sort((a, b) => (b.creado || '').localeCompare(a.creado || ''));
  return candidatos[0] || null;
}

// --- Token de descarga SIN ESTADO (HMAC) ---
// En serverless (Vercel) no hay disco persistente, así que el permiso de descarga
// no se puede guardar. En su lugar firmamos un token con HMAC: quien lo tenga
// (emitido tras confirmar el pago) puede descargar, sin necesidad de base de datos.
function secretoDescarga() {
  return process.env.DOWNLOAD_SECRET || process.env.ADMIN_KEY || 'mv-descarga-default-cambiar';
}
const b64u = (b) => Buffer.from(b).toString('base64url');
/** Emite un token firmado para descargar una versión (opcionalmente con vencimiento en días). */
export function firmarDescarga(version, dias = 30) {
  const payload = { v: version, exp: Date.now() + dias * 86400000, n: randomBytes(4).toString('hex') };
  const cuerpo = b64u(JSON.stringify(payload));
  const firma = createHmac('sha256', secretoDescarga()).update(cuerpo).digest('base64url');
  return `${cuerpo}.${firma}`;
}
/** Verifica un token de descarga firmado. Devuelve { version } o null. */
export function verificarDescarga(token) {
  try {
    const [cuerpo, firma] = String(token).split('.');
    if (!cuerpo || !firma) return null;
    const esperada = createHmac('sha256', secretoDescarga()).update(cuerpo).digest('base64url');
    const a = Buffer.from(firma), b = Buffer.from(esperada);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return { version: payload.v };
  } catch { return null; }
}

// Qué archivo de descarga corresponde a cada versión. Los paquetes reales
// viven en public/descargas/ (servidos también como estáticos). La APK es un
// .apk; "pc"/"todas" entregan el instalador de Windows (NSIS, un solo .exe
// que instala la app — ver electron-builder en package.json). "pc_exe" queda
// como alias por compatibilidad con links de descarga ya emitidos.
export function archivoDeVersion(version) {
  return {
    pc: 'MV-Agendate-IA-Setup.exe',
    pc_exe: 'MV-Agendate-IA-Setup.exe',
    // Portable: mismo programa sin instalador, para los clientes cuya empresa
    // no deja abrir ejecutables (ver INSTALADOR/README.md).
    pc_zip: 'MV-Agendate-IA-PC.zip',
    apk: 'MV-Agendate-IA.apk',
    ios: 'MV-Agendate-IA-Setup.exe',
    todas: 'MV-Agendate-IA-Setup.exe',
  }[version] || 'MV-Agendate-IA-Setup.exe';
}
