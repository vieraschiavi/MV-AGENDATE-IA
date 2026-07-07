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
