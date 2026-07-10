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

/** Estado de créditos de la cuenta (saldo en USD, etc.). */
export async function estadoCreditos(cuentaId) {
  const c = await cargar(cuentaId);
  return { habilitado: creditosHabilitado(), saldo: Math.round(c.saldo * 100) / 100, recargado: c.recargado || 0, consumido: Math.round((c.consumido || 0) * 100) / 100, margen: margen() };
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
  await kvSet(clave(cuentaId), c);
  return { saldo: c.saldo, cruzoUmbral: antes > UMBRAL_BAJO && c.saldo <= UMBRAL_BAJO };
}

/** Acredita una recarga (USD) — desde el webhook de MercadoPago. */
export async function acreditar(cuentaId, montoUsd) {
  const monto = Number(montoUsd) || 0;
  if (monto <= 0) return { ok: false, error: 'Monto inválido.' };
  const c = await cargar(cuentaId);
  c.saldo = Math.round((c.saldo + monto) * 1e6) / 1e6;
  c.recargado = (c.recargado || 0) + monto;
  await kvSet(clave(cuentaId), c);
  return { ok: true, saldo: Math.round(c.saldo * 100) / 100 };
}

// Packs de recarga sugeridos (USD) — editables. El saldo se descuenta al costo
// real × margen, así que "rinde" mucho más que el número en mensajes.
export const PACKS = [5, 10, 20, 50];
