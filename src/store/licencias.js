// © 2026 Martín Viera. Todos los derechos reservados.

// Pedidos, pagos y licencias de descarga.
// Flujo: el cliente crea un pedido (elige plan/versión y medio de pago) → paga
// (tarjeta vía PSP, MercadoPago o transferencia a Itaú) → al confirmarse el pago
// se emite una LICENCIA y un TOKEN de descarga que habilita bajar el software.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomBytes, createHmac, timingSafeEqual, createPrivateKey, sign } from 'node:crypto';
import { redisDisponible, kvGet, kvSet, kvDel, kvMGet, kvSAdd, kvSRem, kvSMembers, kvIncrBy } from './redis.js';

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
 * Código de licencia de un pedido: una licencia MVA1 FIRMADA con Ed25519.
 *
 * POR QUÉ CAMBIÓ. Antes era un HMAC (`MV-BASICO-A1B2C3D4`). El HMAC sirve para
 * lo que hace el servidor consigo mismo, pero tiene un problema de raíz acá:
 * para comprobarlo hay que tener el secreto, y el que necesita comprobarlo es
 * el programa instalado en la PC del cliente. Meter ese secreto adentro del
 * .exe sería entregarle la máquina de fabricar licencias — así que la app nunca
 * lo comprobó: aceptaba cualquier texto de 6 caracteres. O sea que el código
 * que se emitía acá era decorativo; el candado no lo miraba.
 *
 * Con firma asimétrica eso se acomoda: firma la PRIVADA (que se queda en el
 * servidor, en MV_LICENCIA_PRIVADA_PEM) y verifica la PÚBLICA, que puede viajar
 * dentro de cada copia entregada sin ningún riesgo. Ver store/licencia-firma.js.
 *
 * SIGUE SIENDO DETERMINÍSTICO, que es lo que ya resolvía el HMAC: Ed25519 firma
 * de forma determinística (RFC 8032) y el payload se arma sólo con datos fijos
 * del pedido — nada de Date.now(). Si dos avisos del mismo pago se confirman a
 * la vez, los dos generan EXACTAMENTE el mismo código y da igual cuál gane; con
 * un random, el cliente podía quedarse con el que perdió.
 */
function licenciaDePedido(pedido) {
  const pem = process.env.MV_LICENCIA_PRIVADA_PEM;
  if (!pem) {
    // Sin clave privada no se puede emitir nada que la app vaya a aceptar. Se
    // devuelve null y el pedido queda "pagado, licencia pendiente": es
    // preferible eso —que se ve en /api/licencias y se arregla reemitiendo a
    // mano— que entregarle al cliente un código que su programa va a rechazar.
    console.error('[licencias] FALTA MV_LICENCIA_PRIVADA_PEM: el pedido ' + pedido.id +
      ' quedó pagado SIN licencia. Emitila a mano:\n' +
      '  node scripts/licencias-firma.js emitir --email ' + pedido.email + ' --plan ' + pedido.plan);
    return null;
  }
  const payload = {
    n: pedido.nombre || pedido.email,
    e: pedido.email,
    p: pedido.plan,
    // Pago único = perpetua. La suscripción se corta aparte, desde el servidor
    // central (ver store/estadoLicencia.js): no se codifica un vencimiento acá
    // porque al emitir todavía no se sabe hasta cuándo va a pagar.
    x: null,
    i: String(pedido.creado || '').slice(0, 10),   // fijo: el pedido ya existía
    o: pedido.id
  };
  const datos = Buffer.from(JSON.stringify(payload), 'utf8');
  const firma = sign(null, datos, createPrivateKey(pem.replace(/\\n/g, '\n')));
  return 'MVA1.' + datos.toString('base64url') + '.' + firma.toString('base64url');
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

// --- Monitor: cuántas veces se bajó cada paquete, y cuánto entró por ventas ---
//
// Lista fija (no un contador por nombre arbitrario): así un GET a
// /descargas/../../lo-que-sea no crea claves nuevas en Redis por cada intento
// de un bot, y el resumen siempre muestra los mismos cuatro nombres aunque
// nunca se hayan descargado.
const ARCHIVOS_DESCARGABLES = [
  'MV-Agendate-IA-Setup.exe', 'MV-Agendate-IA-Setup-Demo.exe',
  'MV-Agendate-IA-PC.zip', 'MV-Agendate-IA.apk'
];
const claveDescarga = (archivo) => `mvagendate:descargas:${archivo}`;

/** Suma una descarga del paquete dado. Nombres fuera de la lista se ignoran. */
export async function contarDescarga(archivo) {
  if (!ARCHIVOS_DESCARGABLES.includes(archivo)) return;
  await kvIncrBy(claveDescarga(archivo), 1);
}

/** Cuántas veces se bajó cada paquete desde que existe este contador. */
export async function resumenDescargas() {
  const valores = await kvMGet(ARCHIVOS_DESCARGABLES.map(claveDescarga));
  const out = {};
  ARCHIVOS_DESCARGABLES.forEach((archivo, i) => { out[archivo] = Number(valores[i]) || 0; });
  return out;
}

/** Pedidos y plata: cuántos se pagaron, cuánto entró, desglosado por plan. */
export async function resumenVentas() {
  const pedidos = await listarPedidos();
  const pagados = pedidos.filter((p) => p.estado === 'pagado');
  const porPlan = {};
  for (const plan of Object.keys(PLANES)) {
    const deEsePlan = pagados.filter((p) => p.plan === plan);
    porPlan[plan] = {
      nombre: PLANES[plan].nombre,
      cantidad: deEsePlan.length,
      revenue_usd: deEsePlan.reduce((suma, p) => suma + (p.total_usd || 0), 0)
    };
  }
  return {
    pedidos_totales: pedidos.length,
    pedidos_pagados: pagados.length,
    pedidos_pendientes: pedidos.length - pagados.length,
    revenue_usd_total: pagados.reduce((suma, p) => suma + (p.total_usd || 0), 0),
    por_plan: porPlan
  };
}
