// © 2026 Martín Viera. Todos los derechos reservados.
// Créditos de IA por cuenta (modo SaaS) — MV Agendate IA.
// El vendedor pone UNA API key (la global de la instancia) y a cada cuenta le
// vende "créditos": un saldo prepago en USD del que se descuenta el costo real
// de cada mensaje de IA multiplicado por un margen. Cuando el saldo llega a 0,
// la IA se corta hasta que la cuenta recargue (por MercadoPago).
//
// Solo aplica cuando la cuenta usa la key del vendedor (no trajo la suya). Si la
// cuenta cargó SU propia API key, es BYOK: no consume créditos.
import { kvGet, kvSet } from './redis.js';
import { get as cfg } from './config.js';
import { costoDeLlamada } from './uso.js';

const clave = (cuentaId) => `creditos:${cuentaId}`;

/** ¿El modo créditos está activo en esta instancia? (default sí). */
export function creditosHabilitado() { return cfg('creditosSaas') !== '0'; }
/** Margen sobre el costo crudo (default 2.5×). */
function margen() { return Number(cfg('creditosMargen')) || 2.5; }
/** Bono de bienvenida en USD para una cuenta nueva (default 3). */
function bono() {
  const raw = cfg('creditosBono');
  if (raw === '' || raw == null) return 3; // Number('') === 0, así que sin config damos el default
  const b = Number(raw);
  return Number.isFinite(b) ? b : 3;
}

async function cargar(cuentaId) {
  const c = await kvGet(clave(cuentaId));
  if (c) return c;
  const inicial = { saldo: bono(), recargado: 0, consumido: 0, bono: bono(), creado: new Date().toISOString() };
  await kvSet(clave(cuentaId), inicial);
  return inicial;
}

/** Estado de créditos de la cuenta (saldo en USD, resumen semanal, etc.). */
export async function estadoCreditos(cuentaId) {
  const c = await cargar(cuentaId);
  return {
    habilitado: creditosHabilitado(),
    saldo: Math.round(c.saldo * 100) / 100,
    recargado: c.recargado || 0,
    bonificado: c.bonificado || 0,
    consumido: Math.round((c.consumido || 0) * 100) / 100,
    semana: resumenSemana(c),
    margen: margen(),
  };
}

/** true si la cuenta tiene saldo para seguir usando IA. */
export async function haySaldo(cuentaId) {
  if (!creditosHabilitado()) return true;
  const c = await cargar(cuentaId);
  return c.saldo > 0;
}

// Umbral de "saldo bajo" (USD): al cruzarlo hacia abajo se avisa por email.
const UMBRAL_BAJO = 1;

/**
 * Descuenta el costo (con margen) de una llamada de IA.
 * Devuelve { saldo, cruzoUmbral } — cruzoUmbral=true la ÚNICA vez que el
 * saldo pasa de arriba a abajo del umbral (para avisar sin spamear).
 */
export async function consumir(cuentaId, usage) {
  if (!creditosHabilitado()) return { saldo: Infinity, cruzoUmbral: false };
  const c = await cargar(cuentaId);
  const antes = c.saldo;
  const cobro = costoDeLlamada(usage) * margen();
  c.saldo = Math.round((c.saldo - cobro) * 1e6) / 1e6;
  c.consumido = (c.consumido || 0) + cobro;
  // Historial diario (últimos 30 días) para mostrar "esta semana usaste X".
  const dia = new Date().toISOString().slice(0, 10);
  c.historial = c.historial || {};
  const h = c.historial[dia] || { usd: 0, llamadas: 0 };
  c.historial[dia] = { usd: Math.round((h.usd + cobro) * 1e6) / 1e6, llamadas: h.llamadas + 1 };
  const dias = Object.keys(c.historial).sort();
  for (const d of dias.slice(0, Math.max(0, dias.length - 30))) delete c.historial[d];
  await kvSet(clave(cuentaId), c);
  return { saldo: c.saldo, cruzoUmbral: antes > UMBRAL_BAJO && c.saldo <= UMBRAL_BAJO };
}

/** Consumo de los últimos 7 días: { usd, llamadas } (para la UI de la cuenta). */
function resumenSemana(c) {
  const desde = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  let usd = 0, llamadas = 0;
  for (const [dia, h] of Object.entries(c.historial || {})) {
    if (dia >= desde) { usd += h.usd; llamadas += h.llamadas; }
  }
  return { usd: Math.round(usd * 100) / 100, llamadas };
}

/**
 * Acredita una recarga (USD) — desde el webhook de MercadoPago.
 * Si el monto coincide con un pack, suma su bonificación automáticamente.
 *
 * `pagoId` (el id del pago en MercadoPago) hace la operación IDEMPOTENTE, y no
 * es opcional en la práctica: MercadoPago reintenta la notificación de un mismo
 * pago, y /api/pago/mercadopago es una ruta pública sin autenticación. Sin esta
 * marca, cada reintento —o cada POST repetido del mismo id— sumaba saldo otra
 * vez: un pago real de US$10 se convertía en saldo infinito. Es la misma
 * protección que confirmarPago() ya tenía para las licencias.
 */
export async function acreditar(cuentaId, montoUsd, pagoId) {
  const monto = Number(montoUsd) || 0;
  if (monto <= 0) return { ok: false, error: 'Monto inválido.' };

  const marca = pagoId ? `credito:pago:${pagoId}` : null;
  if (marca && await kvGet(marca)) {
    const actual = await cargar(cuentaId);
    return { ok: true, saldo: Math.round(actual.saldo * 100) / 100, bonificado: 0, yaEstaba: true };
  }

  const bonif = bonoDePack(monto);
  const c = await cargar(cuentaId);
  c.saldo = Math.round((c.saldo + monto + bonif) * 1e6) / 1e6;
  c.recargado = (c.recargado || 0) + monto;
  c.bonificado = Math.round(((c.bonificado || 0) + bonif) * 100) / 100;
  await kvSet(clave(cuentaId), c);
  // Después de acreditar: si el proceso muere entre medio, el peor caso es
  // acreditar dos veces un pago (recuperable), no perder una recarga pagada.
  if (marca) await kvSet(marca, { cuentaId, monto, fecha: new Date().toISOString() });
  return { ok: true, saldo: Math.round(c.saldo * 100) / 100, bonificado: bonif };
}

// Packs de recarga (USD) con bonificación creciente: el grande regala +15%
// de saldo extra — el clásico para empujar el ticket alto. El saldo se
// descuenta al costo real × margen, así que rinde mucho más que el número.
export const PACKS = [
  { monto: 5, bonoPct: 0 },
  { monto: 10, bonoPct: 0.05 },
  { monto: 20, bonoPct: 0.10 },
  { monto: 50, bonoPct: 0.15 },
];

/** Bono de bienvenida vigente (0 si el modo créditos está apagado) — para mostrarlo en el email de alta. */
export function bonoBienvenida() { return creditosHabilitado() ? bono() : 0; }

/** Bonificación (USD) que corresponde a una recarga según el pack. */
export function bonoDePack(montoUsd) {
  const pack = PACKS.find((p) => p.monto === Number(montoUsd));
  return pack ? Math.round(pack.monto * pack.bonoPct * 100) / 100 : 0;
}
