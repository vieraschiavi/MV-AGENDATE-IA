// © 2026 Martín Viera. Todos los derechos reservados.

// Cobrarle al cliente el trabajo cotizado, por MercadoPago.
//
// Ojo con no confundirlo con store/licencias.js: eso es el profesional
// pagándole la LICENCIA a MV Agendate IA. Esto es al revés — el profesional le
// cobra a SU cliente el trabajo que le cotizó, y la plata entra a la cuenta de
// MercadoPago del profesional.
//
// Vive en su propio módulo porque lo usan dos entradas distintas: la ruta
// POST /api/citas/:id/cobrar (el botón del panel) y la herramienta
// cobrar_trabajo del agente (el chatbot pasándole el link al cliente en la
// misma conversación). Duplicarlo sería la forma segura de que un día uno de
// los dos empiece a cobrar distinto que el otro.
import { obtenerCita, registrarLinkDeCobro } from './trabajos.js';
import { crearPreferenciaTrabajo, mercadopagoActivo } from './mercadopago.js';
import { get as cfg } from './config.js';
import { monedaActiva } from '../ai/cotizador.js';

/**
 * Genera (o reutiliza) el link de pago de una cita ya agendada.
 *
 * El monto NO se recibe por parámetro a propósito: sale de la cotización que
 * ya tiene la cita, que a su vez salió del catálogo de precios del profesional.
 * Si se pudiera pasar desde afuera, cualquiera con el id de una cita podría
 * cobrarse lo que quisiera a nombre del profesional — y el modelo de IA podría
 * inventar un precio, que es justo lo que el resto del programa evita.
 *
 * @param {string} citaId
 * @param {string} [email] del cliente, para el comprobante de MercadoPago
 * @param {string} [cuentaId]
 * @param {string} [baseUrl] dominio público; sin él se usa el configurado
 * @returns {Promise<{ok:boolean, link?:string, monto?:number, moneda?:string, yaPagado?:boolean, error?:string}>}
 */
export async function generarLinkDeCobro(citaId, email, cuentaId, baseUrl) {
  if (!mercadopagoActivo()) {
    return { ok: false, error: 'Falta configurar el Access Token de MercadoPago para poder cobrar.' };
  }
  const cita = await obtenerCita(citaId, cuentaId);
  if (!cita) return { ok: false, error: 'No encontré esa cita.' };
  if (cita.cobro?.estado === 'pagado') {
    return { ok: true, yaPagado: true, monto: cita.cobro.montoPagado, moneda: cita.cobro.moneda };
  }

  const monto = Number(cita.cotizacion?.total);
  if (!Number.isFinite(monto) || monto <= 0) {
    return { ok: false, error: 'Esa cita no tiene un monto cotizado: no hay nada que cobrar.' };
  }

  // El dominio público hace falta para las back_urls y para que MercadoPago
  // sepa a dónde avisar el pago. Sin él, el cobro se crearía sin webhook y la
  // cita nunca se marcaría como pagada.
  const base = baseUrl || cfg('sitioUrl');
  if (!base) {
    return { ok: false, error: 'Falta configurar la URL pública del sitio (sitioUrl) para poder cobrar por MercadoPago.' };
  }

  const { moneda } = monedaActiva();
  const negocio = cfg('agenciaNombre') || cfg('nombreProfesional') || 'MV Agendate IA';
  const pago = await crearPreferenciaTrabajo({
    cuentaId: cuentaId || 'default',
    citaId: cita.id,
    titulo: `${cita.trabajoNombre || cita.trabajo} — ${negocio}`,
    monto, moneda,
    email: email || undefined
  }, String(base).replace(/\/+$/, ''));
  if (!pago.ok) return { ok: false, error: pago.error };

  await registrarLinkDeCobro(cita.id, {
    link: pago.init_point, preferenceId: pago.preference_id, monto, moneda
  }, cuentaId);

  return { ok: true, link: pago.init_point, monto, moneda };
}
