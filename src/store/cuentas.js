// Cuentas del modo SaaS multi-cliente — MV Agendate IA.
// Registro/login con email+contraseña (scrypt de node:crypto, sin libs) y
// tokens JWT firmados con HMAC-SHA256. Cada cuenta aísla sus datos del
// workspace (clientes/citas/dashboards) vía cuentaId; sin token, todo opera
// sobre la cuenta 'default' — así el modo single-tenant descargable (pago
// único) sigue funcionando exactamente igual que siempre.
import { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import { kvGet, kvSet } from './redis.js';
import { get as cfg, setConfig } from './config.js';

const CLAVE_DB = 'cuentas:db';
const TRIAL_DIAS = 14;

let db = null;
async function cargar() {
  if (db) return db;
  db = (await kvGet(CLAVE_DB)) || { cuentas: [] };
  db.cuentas ??= [];
  return db;
}
async function guardar() { await kvSet(CLAVE_DB, db); }

// Secreto de firma de tokens: autogenerado y persistido la primera vez
// (o JWT_SECRET por entorno si se quiere fijar).
function secreto() {
  let s = process.env.JWT_SECRET || cfg('jwtSecret');
  if (!s) {
    s = randomBytes(32).toString('hex');
    setConfig({ jwtSecret: s });
  }
  return s;
}

// ---------- Password hashing (scrypt) ----------
function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verificarPassword(password, guardado) {
  const [salt, hash] = String(guardado).split(':');
  if (!salt || !hash) return false;
  const calc = scryptSync(String(password), salt, 64);
  const orig = Buffer.from(hash, 'hex');
  return calc.length === orig.length && timingSafeEqual(calc, orig);
}

// ---------- JWT mínimo (HS256) ----------
const b64u = (buf) => Buffer.from(buf).toString('base64url');

export function firmarToken(cuentaId, email, dias = 30) {
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64u(JSON.stringify({ sub: cuentaId, email, exp: Date.now() + dias * 86400000 }));
  const firma = createHmac('sha256', secreto()).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${firma}`;
}

/** Devuelve { cuentaId, email } si el token es válido y no expiró; null si no. */
export function verificarToken(token) {
  try {
    const [header, payload, firma] = String(token || '').split('.');
    if (!header || !payload || !firma) return null;
    const esperada = createHmac('sha256', secreto()).update(`${header}.${payload}`).digest('base64url');
    const a = Buffer.from(firma), b = Buffer.from(esperada);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const datos = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!datos.sub || Date.now() > datos.exp) return null;
    return { cuentaId: datos.sub, email: datos.email };
  } catch { return null; }
}

// ---------- Cuentas ----------
const publica = (c) => ({
  id: c.id, email: c.email, nombre: c.nombre, estado: c.estado,
  trialHasta: c.trialHasta, creado: c.creado,
});

export async function registrar({ email, password, nombre }) {
  const mail = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return { ok: false, error: 'Email inválido.' };
  if (String(password || '').length < 8) return { ok: false, error: 'La contraseña debe tener al menos 8 caracteres.' };
  await cargar();
  if (db.cuentas.some((c) => c.email === mail)) return { ok: false, error: 'Ya existe una cuenta con ese email.' };
  const cuenta = {
    id: `cta-${randomUUID().slice(0, 8)}`,
    email: mail,
    nombre: String(nombre || '').trim(),
    password: hashPassword(password),
    estado: 'trial', // trial → activa (suscripción al día) → suspendida
    trialHasta: new Date(Date.now() + TRIAL_DIAS * 86400000).toISOString(),
    preapprovalId: null, // se vincula cuando paga la suscripción por MercadoPago
    creado: new Date().toISOString(),
  };
  db.cuentas.push(cuenta);
  await guardar();
  return { ok: true, cuenta: publica(cuenta), token: firmarToken(cuenta.id, mail) };
}

export async function login({ email, password }) {
  await cargar();
  const mail = String(email || '').trim().toLowerCase();
  const cuenta = db.cuentas.find((c) => c.email === mail);
  if (!cuenta || !verificarPassword(password, cuenta.password)) {
    return { ok: false, error: 'Email o contraseña incorrectos.' };
  }
  return { ok: true, cuenta: publica(cuenta), token: firmarToken(cuenta.id, mail) };
}

/** Ids de todas las cuentas (para rutear webhooks de canales por cuenta). */
export async function listarCuentaIds() {
  await cargar();
  return db.cuentas.map((c) => c.id);
}

/** Cuenta por email (para vincular la suscripción de MercadoPago del webhook). */
export async function buscarCuentaPorEmail(email) {
  await cargar();
  const mail = String(email || '').trim().toLowerCase();
  const c = db.cuentas.find((x) => x.email === mail);
  return c ? publica(c) : null;
}

export async function obtenerCuenta(cuentaId) {
  await cargar();
  const c = db.cuentas.find((x) => x.id === cuentaId);
  return c ? publica(c) : null;
}

/** Marca el estado de suscripción de la cuenta (webhook de MercadoPago, fase 2). */
export async function actualizarEstado(cuentaId, estado, preapprovalId) {
  await cargar();
  const c = db.cuentas.find((x) => x.id === cuentaId);
  if (!c) return { ok: false, error: 'Cuenta no encontrada.' };
  c.estado = estado;
  if (preapprovalId !== undefined) c.preapprovalId = preapprovalId;
  await guardar();
  return { ok: true, cuenta: publica(c) };
}
