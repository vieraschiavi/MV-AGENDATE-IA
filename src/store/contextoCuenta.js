// Contexto de cuenta activa (modo SaaS) — AsyncLocalStorage.
// Permite que TODO el código que hoy lee la configuración global (cotizador,
// agente, agenda, canales) resuelva automáticamente la configuración de la
// cuenta SaaS que está atendiendo, sin pasar cuentaId por cada función:
// el middleware del server (o el webhook de WhatsApp) envuelve el manejo del
// request en runConCuenta() y, dentro, config.get() superpone los overrides
// de esa cuenta sobre los defaults globales.
import { AsyncLocalStorage } from 'node:async_hooks';

const als = new AsyncLocalStorage();

/**
 * Ejecuta fn con una cuenta activa. `overrides` es el objeto de configuración
 * propio de la cuenta (subset de claves de store/config.js).
 */
export function runConCuenta(cuentaId, overrides, fn) {
  return als.run({ cuentaId, overrides: overrides || {} }, fn);
}

/** Id de la cuenta activa del contexto actual ('default' si no hay ninguna). */
export function cuentaActiva() {
  return als.getStore()?.cuentaId || 'default';
}

/** Overrides de configuración de la cuenta activa (null fuera de contexto). */
export function overridesActivos() {
  const ctx = als.getStore();
  return ctx && ctx.cuentaId !== 'default' ? ctx.overrides : null;
}

/**
 * Ejecuta fn forzando el país (y por lo tanto el idioma/moneda) SOLO para la
 * demo pública, sin tocar el modelo de cuentas: cuentaActiva() sigue siendo
 * 'default'. Sirve para que el visitante de la web elija es/pt y el asistente
 * de demostración responda en ese idioma con la moneda de ese país.
 */
export function runConDemoPais(pais, fn) {
  return als.run({ cuentaId: 'default', overrides: {}, paisDemo: pais }, fn);
}

/** País forzado por la demo pública (null si no hay ninguno en contexto). */
export function paisDemoActivo() {
  return als.getStore()?.paisDemo || null;
}

/**
 * Ejecuta fn forzando el IDIOMA de la demo pública (para inglés, que no tiene
 * país en LATAM). No cambia moneda ni país — solo el idioma de las respuestas.
 */
export function runConDemoIdioma(idi, fn) {
  return als.run({ cuentaId: 'default', overrides: {}, idiomaDemo: idi }, fn);
}

/** Idioma forzado por la demo pública (null si no hay ninguno). */
export function idiomaDemoActivo() {
  return als.getStore()?.idiomaDemo || null;
}
