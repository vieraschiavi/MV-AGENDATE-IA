// Cotizaciones sugeridas pendientes de aprobación — MV Agendate IA.
// El precio que calcula el cotizador es SIEMPRE un sugerido interno: el chatbot
// no le dice ningún monto al cliente hasta que el profesional lo apruebe (tal
// cual o ajustado) desde el Panel. Al aprobar, si la conversación fue por
// WhatsApp, el cliente recibe el precio confirmado automáticamente.
// Se puede desactivar con la config aprobarCotizaciones='0' (y en la instancia
// de demo pública se auto-aprueba para que la demo fluya sola).
import { kvGet, kvSet } from './redis.js';
import { get as cfg } from './config.js';

const DEFAULT = 'default';
const claveDb = (cuentaId) => (cuentaId && cuentaId !== DEFAULT ? `cotizaciones:db:${cuentaId}` : 'cotizaciones:db');

const dbs = new Map();
async function cargar(cuentaId = DEFAULT) {
  if (dbs.has(cuentaId)) return dbs.get(cuentaId);
  const db = (await kvGet(claveDb(cuentaId))) || { cotizaciones: [], seq: 1 };
  db.cotizaciones ??= [];
  db.seq ??= 1;
  dbs.set(cuentaId, db);
  return db;
}
async function guardar(cuentaId = DEFAULT) { await kvSet(claveDb(cuentaId), dbs.get(cuentaId)); }

/** ¿El flujo exige aprobación del profesional antes de dar precio? (default sí) */
export function aprobacionRequerida() {
  if (cfg('demoLimite') === '1') return false; // demo pública: fluye sola
  return cfg('aprobarCotizaciones') !== '0';
}

// Aviso saliente (WhatsApp) inyectado por server.js para no acoplar el store al
// canal — mismo patrón que channels/aviso-retraso.js.
let notificador = null;
export function setNotificador(fn) { notificador = fn; }

const publica = (c) => ({ ...c });

/**
 * Registra una cotización sugerida pendiente de aprobación y le avisa al
 * profesional por WhatsApp (si tiene su número cargado en agenciaTelefono).
 * `detalle` es el resultado completo de cotizar() — queda guardado para que el
 * Panel muestre el desglose sugerido.
 */
export async function crearCotizacion({ sessionId, canal, telefono, clienteNombre, oficio, oficioNombre, trabajo, trabajoNombre, detalle }, cuentaId = DEFAULT) {
  const db = await cargar(cuentaId);
  const cot = {
    id: `COT-${String(db.seq++).padStart(4, '0')}`,
    estado: 'pendiente', // pendiente → aprobada | rechazada
    sessionId: String(sessionId || ''),
    canal: canal || 'webchat',
    telefono: String(telefono || ''),
    clienteNombre: String(clienteNombre || ''),
    oficio: oficio || '', oficioNombre: oficioNombre || '',
    trabajo: trabajo || '', trabajoNombre: trabajoNombre || trabajo || '',
    sugerido: detalle || {},
    totalAprobado: null, nota: '',
    creado: new Date().toISOString(), resuelto: null
  };
  db.cotizaciones.push(cot);
  await guardar(cuentaId);
  if (notificador && cfg('agenciaTelefono')) {
    const s = detalle?.simbolo || '$';
    const texto = `🔔 Cotización para aprobar (${cot.id})\n` +
      `Trabajo: ${cot.trabajoNombre}${cot.clienteNombre ? `\nCliente: ${cot.clienteNombre}` : ''}${cot.telefono ? ` (${cot.telefono})` : ''}\n` +
      `Sugerido: ${s} ${detalle?.total ?? '-'}\n` +
      `Aprobala o ajustala desde el Panel para que el asistente le confirme el precio al cliente.`;
    try { await notificador(cfg('agenciaTelefono'), texto); } catch (e) { console.error('[cotizaciones] aviso al profesional falló:', e.message); }
  }
  return publica(cot);
}

export async function listarCotizaciones(estado, cuentaId = DEFAULT) {
  const db = await cargar(cuentaId);
  const lista = estado ? db.cotizaciones.filter((c) => c.estado === estado) : db.cotizaciones;
  return lista.slice().reverse().map(publica); // más recientes primero
}

export async function obtenerCotizacion(id, cuentaId = DEFAULT) {
  const db = await cargar(cuentaId);
  const c = db.cotizaciones.find((x) => x.id === id);
  return c ? publica(c) : null;
}

/** Última cotización de una sesión de chat (opcionalmente de un trabajo puntual) — para que el agente sepa si ya fue aprobada. */
export async function cotizacionDeSesion(sessionId, trabajo, cuentaId = DEFAULT) {
  const db = await cargar(cuentaId);
  for (let i = db.cotizaciones.length - 1; i >= 0; i--) {
    const c = db.cotizaciones[i];
    if (c.sessionId === sessionId && (!trabajo || c.trabajo === trabajo)) return publica(c);
  }
  return null;
}

/**
 * El profesional resuelve la cotización: aprueba (tal cual o con otro total)
 * o la rechaza. Devuelve la cotización actualizada; el aviso al cliente lo
 * dispara la ruta del server (que tiene el canal WhatsApp a mano).
 */
export async function resolverCotizacion(id, { aprobar = true, total, nota } = {}, cuentaId = DEFAULT) {
  const db = await cargar(cuentaId);
  const c = db.cotizaciones.find((x) => x.id === id);
  if (!c) return { ok: false, error: 'Cotización no encontrada.' };
  if (c.estado !== 'pendiente') return { ok: false, error: `Ya estaba ${c.estado}.` };
  if (aprobar) {
    const monto = Number(total ?? c.sugerido?.total);
    if (!Number.isFinite(monto) || monto <= 0) return { ok: false, error: 'Total aprobado inválido.' };
    c.estado = 'aprobada';
    c.totalAprobado = Math.round(monto);
  } else {
    c.estado = 'rechazada';
  }
  if (nota !== undefined) c.nota = String(nota || '').trim();
  c.resuelto = new Date().toISOString();
  await guardar(cuentaId);
  return { ok: true, cotizacion: publica(c) };
}
