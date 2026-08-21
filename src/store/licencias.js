// © 2026 Martín Viera. Todos los derechos reservados.

// Pedidos, pagos y licencias de descarga.
// Flujo: el cliente crea un pedido (elige plan/versión y medio de pago) → paga
// (tarjeta vía PSP, MercadoPago o transferencia a Itaú) → al confirmarse el pago
// se emite una LICENCIA y un TOKEN de descarga que habilita bajar el software.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { redisDisponible, kvGet, kvSet, kvDel, kvMGet, kvSAdd, kvSRem, kvSMembers } from './redis.js';
import { firmar as firmarLicencia } from './licencia-firma.js';

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
//
// UN PEDIDO POR CLAVE, no todos en un blob. Con el blob único, guardar era
// leer-modificar-reescribir TODO: mientras el webhook confirmaba un pago,
// otra invocación creando un pedido distinto leía la versión de antes y la
// reescribía encima. El pago confirmado volvía a 'pendiente' — el cliente
// pagaba, gracias.html le decía que no encontraba su pedido, y no le llegaba
// ni el email ni la licencia. Con una clave por pedido, dos pedidos distintos
// no pueden pisarse nunca; el índice es un SET de Redis, donde agregar y sacar
// también son atómicos.
//
// Sin Redis (la copia descargada) sigue siendo un archivo con todo junto: ahí
// hay un solo proceso y ninguna carrera que evitar.
const clavePedido = (id) => `mvagendate:pedido:${id}`;
const CLAVE_INDICE = 'mvagendate:pedidos:ids';

let db = null;

/** Modo archivo (sin Redis): carga perezosa del JSON local. */
function cargarArchivo() {
  if (!db) db = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { pedidos: {} };
  return db;
}

function guardarArchivo() {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(db, null, 2));
}

// Migración del blob viejo a claves por pedido. Corre una vez por proceso y es
// segura si dos instancias la hacen a la vez: cada pedido se escribe con su
// propio contenido y nunca pisa uno que ya exista (que sería más nuevo).
// Se guarda la PROMESA, no un booleano: con un flag, el segundo request que
// entra mientras la migración está a mitad de camino la daría por hecha y
// leería pedidos que todavía no se escribieron. Así todos esperan la misma.
let migracion = null;
function migrarBlobSiHaceFalta() {
  if (!migracion) {
    migracion = (async () => {
      try {
        const crudo = await kvGet(CLAVE_REDIS);
        if (!crudo) return;
        const viejo = (typeof crudo === 'string' ? JSON.parse(crudo) : crudo) || {};
        for (const [id, p] of Object.entries(viejo.pedidos || {})) {
          if (!(await kvGet(clavePedido(id)))) await kvSet(clavePedido(id), JSON.stringify(p));
          await kvSAdd(CLAVE_INDICE, id);
        }
        await kvDel(CLAVE_REDIS);
      } catch (e) {
        console.error('[licencias] No pude migrar los pedidos al formato nuevo:', e.message);
        // Se limpia para que el próximo request lo reintente: dejarla marcada
        // como hecha escondería los pedidos viejos hasta el próximo reinicio.
        migracion = null;
      }
    })();
  }
  return migracion;
}

const parsear = (crudo) => (typeof crudo === 'string' ? JSON.parse(crudo) : crudo) || null;

async function leerPedido(id) {
  if (!redisDisponible()) return cargarArchivo().pedidos[id] || null;
  await migrarBlobSiHaceFalta();
  try { return parsear(await kvGet(clavePedido(id))); } catch { return null; }
}

async function escribirPedido(p) {
  if (!redisDisponible()) { cargarArchivo().pedidos[p.id] = p; guardarArchivo(); return; }
  // El pedido primero y el índice después: si algo falla en el medio, queda un
  // pedido que no aparece listado (recuperable) y no una entrada del índice
  // apuntando a algo que no existe.
  await kvSet(clavePedido(p.id), JSON.stringify(p));
  await kvSAdd(CLAVE_INDICE, p.id);
}

async function borrarPedido(id) {
  if (!redisDisponible()) { delete cargarArchivo().pedidos[id]; guardarArchivo(); return; }
  await kvSRem(CLAVE_INDICE, id);
  await kvDel(clavePedido(id));
}

/** Todos los pedidos, sin garantía de orden. */
async function todosLosPedidos() {
  if (!redisDisponible()) return Object.values(cargarArchivo().pedidos);
  await migrarBlobSiHaceFalta();
  const ids = await kvSMembers(CLAVE_INDICE);
  if (!ids.length) return [];
  const crudos = await kvMGet(ids.map(clavePedido));
  return crudos.map((c) => { try { return parsear(c); } catch { return null; } }).filter(Boolean);
}

/** Crea un pedido pendiente de pago (siempre MercadoPago). */
export async function crearPedido({ plan, version = 'pc', email, nombre, recurrente }) {
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
  await escribirPedido(pedido);
  return { ok: true, pedido };
}

/**
 * Código de licencia de un pedido. Determinístico a propósito: sale de un HMAC
 * del id del pedido, no de un random.
 *
 * Así, si dos avisos del mismo pago se confirman a la vez, los dos generan
 * EXACTAMENTE la misma licencia y da igual cuál gane — con un random, cada uno
 * emitía un código distinto y el cliente podía quedarse con el que perdió, o
 * sea con una licencia que el servidor no reconoce. No es adivinable sin el
 * secreto, así que seguir el patrón no sirve para fabricarse una.
 */
function licenciaDePedido(pedido) {
  // Camino bueno: licencia FIRMADA con Ed25519, que la copia instalada puede
  // verificar sola con la clave pública embebida. El código de abajo (HMAC) no
  // es verificable del lado del cliente —el cliente no tiene ni debe tener el
  // secreto—, así que con él la app terminaba aceptando cualquier cosa.
  // Ver store/licencia-clave.js.
  //
  // Es igual de determinístico que el viejo: para el mismo pedido, Ed25519
  // firma siempre lo mismo, así que dos avisos del mismo pago que se confirmen
  // a la vez siguen emitiendo EXACTAMENTE la misma licencia.
  const firmada = firmarLicencia({
    id: pedido.id,
    plan: pedido.plan,
    // El pago único no vence. La suscripción tampoco vence por firma: la corta
    // estadoLicencia.js consultando al servidor central, que es lo que sabe si
    // el cobro del mes entró.
    exp: null
  });
  if (firmada) return firmada;

  // Sin MV_LICENSE_PRIVATE_KEY configurada se sigue emitiendo el código viejo,
  // para no romper el flujo de compra mientras el par de claves no exista.
  const firma = createHmac('sha256', secretoDescarga())
    .update(`licencia:${pedido.id}`)
    .digest('hex')
    .slice(0, 8)
    .toUpperCase();
  return `MV-${pedido.plan.toUpperCase()}-${firma}`;
}

/** Marca un pedido como pagado y emite licencia + token de descarga. */
export async function confirmarPago(id) {
  const p = await leerPedido(id);
  if (!p) return { ok: false, error: 'Pedido no encontrado.' };
  if (p.estado === 'pagado') return { ok: true, pedido: p, yaEstaba: true };
  p.estado = 'pagado';
  p.pagado = new Date().toISOString();
  p.licencia = licenciaDePedido(p);
  // Token SIN ESTADO (funciona aunque el pedido no persista, ej. serverless).
  p.token = firmarDescarga(p.version);
  await escribirPedido(p);
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
  const p = await leerPedido(id);
  if (!p) return { ok: false, error: 'Pedido no encontrado.' };
  if (p.estado !== 'pendiente') return { ok: false, error: 'El pedido ya no está pendiente.', estado: p.estado };
  await borrarPedido(id);
  return { ok: true };
}

/** Valida un token de descarga → pedido pagado. */
export async function validarToken(token) {
  const todos = await todosLosPedidos();
  return todos.find((x) => x.token === token && x.estado === 'pagado') || null;
}

export async function obtenerPedido(id) { return await leerPedido(id); }
export async function listarPedidos() {
  return (await todosLosPedidos()).sort((a, b) => (b.creado || '').localeCompare(a.creado));
}

/**
 * Busca el pedido pendiente más reciente de MercadoPago recurrente para un
 * email (y opcionalmente plan). Se usa para reconciliar el webhook de
 * preapproval: el checkout de suscripción es un link compartido por plan (no
 * hay forma de pasarle el external_reference de nuestro pedido), así que el
 * único dato que MercadoPago nos devuelve para identificar al cliente es el
 * email que tipeó él mismo en su checkout.
 */
export async function buscarPedidoPendientePorEmail(email, plan) {
  const candidatos = (await todosLosPedidos()).filter((p) =>
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
