// Pedidos, pagos y licencias de descarga.
// Flujo: el cliente crea un pedido (elige plan/versión y medio de pago) → paga
// (tarjeta vía PSP, MercadoPago o transferencia a Itaú) → al confirmarse el pago
// se emite una LICENCIA y un TOKEN de descarga que habilita bajar el software.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const DIR = process.env.VERCEL ? '/tmp/mvdata' : join(here, '../../data');
const FILE = join(DIR, 'licencias.json');

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

let db = null;
function cargar() { if (!db) db = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { pedidos: {} }; return db; }
function guardar() { mkdirSync(DIR, { recursive: true }); writeFileSync(FILE, JSON.stringify(db, null, 2)); }

/** Crea un pedido pendiente de pago (siempre MercadoPago). */
export function crearPedido({ plan, version = 'pc', email, nombre, recurrente }) {
  cargar();
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
  guardar();
  return { ok: true, pedido };
}

/** Marca un pedido como pagado y emite licencia + token de descarga. */
export function confirmarPago(id) {
  cargar();
  const p = db.pedidos[id];
  if (!p) return { ok: false, error: 'Pedido no encontrado.' };
  if (p.estado === 'pagado') return { ok: true, pedido: p, yaEstaba: true };
  p.estado = 'pagado';
  p.pagado = new Date().toISOString();
  p.licencia = 'MV-' + p.plan.toUpperCase() + '-' + randomUUID().slice(0, 8).toUpperCase();
  // Token SIN ESTADO (funciona aunque el pedido no persista, ej. serverless).
  p.token = firmarDescarga(p.version);
  guardar();
  return { ok: true, pedido: p };
}

/** Valida un token de descarga → pedido pagado. */
export function validarToken(token) {
  cargar();
  const p = Object.values(db.pedidos).find((x) => x.token === token && x.estado === 'pagado');
  return p || null;
}

export function obtenerPedido(id) { return cargar().pedidos[id] || null; }
export function listarPedidos() { return Object.values(cargar().pedidos).sort((a, b) => (b.creado || '').localeCompare(a.creado)); }

/**
 * Busca el pedido pendiente más reciente de MercadoPago recurrente para un
 * email (y opcionalmente plan). Se usa para reconciliar el webhook de
 * preapproval: el checkout de suscripción es un link compartido por plan (no
 * hay forma de pasarle el external_reference de nuestro pedido), así que el
 * único dato que MercadoPago nos devuelve para identificar al cliente es el
 * email que tipeó él mismo en su checkout.
 */
export function buscarPedidoPendientePorEmail(email, plan) {
  cargar();
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
// .apk; el resto entrega el paquete PC (que incluye instrucciones y arranque).
export function archivoDeVersion(version) {
  return {
    pc: 'MV-Agendate-IA-PC.zip',
    pc_exe: 'MV-Agendate-IA-Setup.exe',
    apk: 'MV-Agendate-IA.apk',
    ios: 'MV-Agendate-IA-PC.zip',
    todas: 'MV-Agendate-IA-PC.zip',
  }[version] || 'MV-Agendate-IA-PC.zip';
}
