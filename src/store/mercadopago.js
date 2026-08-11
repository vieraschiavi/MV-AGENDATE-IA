// Integración con MercadoPago (Checkout Pro).
// Flujo: creamos una "preferencia" de pago → el cliente paga en MercadoPago con
// tarjeta/saldo → el dinero entra a TU cuenta de MercadoPago → vos hacés el
// payout/retiro a tu banco (Itaú) desde MercadoPago. Un webhook nos avisa cuando
// el pago se aprueba y ahí habilitamos la descarga.
//
// Configurá tu Access Token en /config.html (campo MercadoPago) o env MERCADOPAGO_TOKEN.
import { get as cfg, setConfig } from './config.js';

const API = 'https://api.mercadopago.com';

export function mercadopagoActivo() { return !!cfg('mercadopagoToken'); }

// --- Moneda de cobro ---
// Confirmado contra la cuenta real: MercadoPago RECHAZA cobros en USD para
// cuentas de Uruguay ("Cannot operate with currency id USD in MLU"). Vale para
// las suscripciones (preapproval) Y para las preferencias de pago único: la
// API devuelve error y no llega init_point, así que el checkout muere con
// "No pude crear la preferencia".
//
// Esto estaba aplicado sólo en el camino recurrente. Las preferencias de pago
// único — que son los DOS productos estrella, Básico US$129 y Full US$299 —
// mandaban currency_id 'USD' igual, ocho líneas debajo del comentario que
// explica por qué eso no funciona. El precio público sigue en USD; el cobro
// real va en UYU, convertido acá con un tipo de cambio de referencia
// (env TIPO_CAMBIO_UYU).
const tipoCambioUyu = () => Number(process.env.TIPO_CAMBIO_UYU) || 42;

/**
 * Traduce un precio de lista en USD al monto y la moneda con que se cobra.
 * Un solo lugar para que los caminos de pago único y recurrente no se
 * desincronicen otra vez.
 */
export function montoDeCobro(precioUsd) {
  const moneda = process.env.MP_CURRENCY || 'UYU';
  if (moneda === 'USD') return { currency_id: 'USD', unit_price: Number(precioUsd) };
  return { currency_id: moneda, unit_price: Math.round(Number(precioUsd) * tipoCambioUyu()) };
}

/**
 * Crea (o reutiliza, cacheado en config) el plan recurrente de un tier.
 * Un solo plan por tier alcanza — todos los suscriptores de ese plan
 * comparten el mismo link de checkout de MercadoPago.
 */
const CLAVE_PLAN_CFG = {
  full: 'preapprovalPlanFull', // solo el plan con IA admite un cobro mensual (cubre el costo de API si el vendedor la revende con clave propia)
  saas: 'preapprovalPlanSaas'  // suscripción mensual del modo SaaS hosteado (cuenta online)
};
export async function planRecurrente(tier, precioUsd) {
  const token = cfg('mercadopagoToken');
  if (!token) return { ok: false, error: 'MercadoPago no está configurado (falta el Access Token).' };
  const claveCfg = CLAVE_PLAN_CFG[tier];
  if (!claveCfg) return { ok: false, error: 'Ese plan no admite suscripción recurrente.' };
  const existente = cfg(claveCfg);
  if (existente) {
    try {
      const r = await fetch(`${API}/preapproval_plan/${existente}`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) {
        const d = await r.json();
        if (d.status === 'active') return { ok: true, id: d.id, init_point: d.init_point };
      }
    } catch { /* si falla la relectura, creamos uno nuevo abajo */ }
  }
  const cobro = montoDeCobro(precioUsd);
  try {
    const r = await fetch(`${API}/preapproval_plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        reason: `MV Agendate IA — ${tier}`,
        auto_recurring: {
          frequency: 1, frequency_type: 'months',
          transaction_amount: cobro.unit_price, currency_id: cobro.currency_id,
        },
        back_url: `${cfg('sitioUrl') || ''}/gracias.html`
      })
    });
    const d = await r.json();
    if (!r.ok) return { ok: false, error: d.message || 'No pude crear el plan recurrente.' };
    setConfig({ [claveCfg]: d.id });
    return { ok: true, id: d.id, init_point: d.init_point };
  } catch (e) { return { ok: false, error: 'Error conectando con MercadoPago: ' + e.message }; }
}

/** Consulta una suscripción (preapproval) por su id. */
export async function consultarPreapproval(id) {
  const token = cfg('mercadopagoToken');
  if (!token) return null;
  try {
    const r = await fetch(`${API}/preapproval/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

/** Consulta un cobro recurrente puntual (uno por mes) por su id. */
export async function consultarPagoRecurrente(id) {
  const token = cfg('mercadopagoToken');
  if (!token) return null;
  try {
    const r = await fetch(`${API}/authorized_payments/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

/**
 * Crea una preferencia de pago para un pedido. Devuelve { ok, init_point } con
 * la URL a la que redirigir al cliente, o { ok:false } si no está configurado.
 * @param {object} pedido — { id, plan, total_usd, email }
 * @param {string} baseUrl — origen público del servidor (para back_urls/webhook)
 */
export async function crearPreferencia(pedido, baseUrl) {
  const token = cfg('mercadopagoToken');
  if (!token) return { ok: false, error: 'MercadoPago no está configurado (falta el Access Token).' };
  const body = {
    items: [{
      title: `MV Agendate IA — Plan ${pedido.plan}`,
      quantity: 1, ...montoDeCobro(pedido.total_usd)
    }],
    payer: pedido.email ? { email: pedido.email } : undefined,
    external_reference: pedido.id,
    back_urls: {
      success: `${baseUrl}/gracias.html?pedido=${pedido.id}`,
      pending: `${baseUrl}/gracias.html?pedido=${pedido.id}`,
      failure: `${baseUrl}/comprar.html?pedido=${pedido.id}`
    },
    auto_return: 'approved',
    notification_url: `${baseUrl}/api/pago/mercadopago`
  };
  try {
    const r = await fetch(`${API}/checkout/preferences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    });
    const d = await r.json();
    if (!r.ok) return { ok: false, error: d.message || 'No pude crear la preferencia de MercadoPago.' };
    return { ok: true, init_point: d.init_point || d.sandbox_init_point, preference_id: d.id };
  } catch (e) { return { ok: false, error: 'Error conectando con MercadoPago: ' + e.message }; }
}

/**
 * Preferencia de pago para una RECARGA DE CRÉDITOS de IA de una cuenta SaaS.
 * external_reference = "credito:{cuentaId}:{monto}" — el webhook lo acredita.
 */
export async function crearPreferenciaCreditos({ cuentaId, monto, email }, baseUrl) {
  const token = cfg('mercadopagoToken');
  if (!token) return { ok: false, error: 'MercadoPago no está configurado (falta el Access Token).' };
  const ref = `credito:${cuentaId}:${monto}`;
  const body = {
    items: [{ title: `MV Agendate IA — Créditos de IA (US$ ${monto})`, quantity: 1, ...montoDeCobro(monto) }],
    payer: email ? { email } : undefined,
    external_reference: ref,
    back_urls: { success: `${baseUrl}/app/#/cuenta`, pending: `${baseUrl}/app/#/cuenta`, failure: `${baseUrl}/app/#/cuenta` },
    auto_return: 'approved',
    notification_url: `${baseUrl}/api/pago/mercadopago`
  };
  try {
    const r = await fetch(`${API}/checkout/preferences`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    });
    const d = await r.json();
    if (!r.ok) return { ok: false, error: d.message || 'No pude crear la preferencia de MercadoPago.' };
    return { ok: true, init_point: d.init_point || d.sandbox_init_point };
  } catch (e) { return { ok: false, error: 'Error conectando con MercadoPago: ' + e.message }; }
}

/** Consulta el estado de un pago por su id. Devuelve { status, external_reference }. */
export async function consultarPago(paymentId) {
  const token = cfg('mercadopagoToken');
  if (!token) return null;
  try {
    const r = await fetch(`${API}/v1/payments/${paymentId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const d = await r.json();
    return { status: d.status, external_reference: d.external_reference, monto: d.transaction_amount };
  } catch { return null; }
}
