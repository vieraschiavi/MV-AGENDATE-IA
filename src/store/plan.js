// © 2026 Martín Viera. Todos los derechos reservados.

// Qué incluye el plan que el cliente efectivamente pagó.
//
// EL AGUJERO QUE ESTO TAPA
// La licencia firmada lleva el plan adentro (payload `p`) y estadoPrueba() ya
// lo exponía, pero NADA en todo el programa lo miraba: `grep` de 'basico' y
// 'full' fuera de licencias.js daba cero. O sea que quien pagaba el Básico
// (US$ 129, "sin IA") recibía exactamente el mismo producto que quien pagaba
// el Full (US$ 299): el chatbot y el ChatVoice le funcionaban igual. La
// diferencia entre los dos planes existía solo en la página de precios.
//
// POR QUÉ NO SE MIRA "TIENE API KEY" EN VEZ DEL PLAN
// Porque la key la pone el profesional (BYOK): cualquiera con una key de
// Anthropic tenía el plan Full por US$ 129.
//
// CRITERIO CONSERVADOR
// Esto sólo puede QUITAR una función a alguien con licencia Básico explícita.
// En cualquier otro caso devuelve "sí": prueba en curso, licencia vieja sin
// plan adentro, plan desconocido, servidor hosteado. Equivocarse para el lado
// de dar de más le cuesta al dueño; equivocarse para el otro lado le rompe el
// programa a alguien que ya pagó.
import { estadoPrueba } from './prueba.js';
import { PLANES } from './licencias.js';

/** El plan de la licencia activa: 'basico' | 'full' | 'saas' | '' (sin licencia). */
export function planLicenciado() {
  const e = estadoPrueba();
  return (e.licenciada && e.plan) ? e.plan : '';
}

/**
 * ¿Esta copia puede usar el agente conversacional con IA (chatbot/ChatVoice)?
 *
 * Es lo que separa al plan Full del Básico según el catálogo — la fuente de
 * verdad es PLANES[plan].ia, no una lista aparte que se desincronice cuando se
 * agregue o renombre un plan.
 */
export function incluyeAgenteIA() {
  const e = estadoPrueba();

  // Servidor hosteado (Vercel) o desarrollo sin clave pública: el candado de
  // planes descargables no rige. El SaaS tiene su propio control por cuenta.
  if (!e.aplica) return true;

  // Prueba en curso. Se vende como "corre 7 días full" (ver instalar.html):
  // recortarla acá sería cambiarle el trato al que todavía está probando. El
  // vencimiento lo corta el candado de prueba, que es otro control.
  if (!e.licenciada) return true;

  // Licencia sin plan adentro: las emitidas antes de que el payload lo llevara,
  // y las del formato legado. No se le saca una función a alguien que ya compró.
  if (!e.plan) return true;

  const plan = PLANES[e.plan];
  if (!plan) return true;   // plan desconocido (catálogo cambiado): no romper

  return plan.ia === true;
}

/** Mensaje para el profesional cuando su plan no incluye el agente. */
export const MOTIVO_SIN_IA =
  'Tu licencia es del plan Básico, que no incluye el chatbot ni el ChatVoice con IA. ' +
  'Podés seguir usando la agenda, el cotizador, el CRM y los dashboards. ' +
  'Para habilitar la IA, comprá el plan Full desde Comprar y activá la licencia nueva.';
