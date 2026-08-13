// © 2026 Martín Viera. Todos los derechos reservados.

// Países de LATAM soportados: moneda local, símbolo y locale de formateo.
// El profesional elige su país en /config.html; la moneda de cotización sale
// de acá (o USD, si prefiere facturar en dólares — común en varios rubros).
export const PAISES = {
  uy: { nombre: 'Uruguay', moneda: 'UYU', simbolo: '$', locale: 'es-UY' },
  ar: { nombre: 'Argentina', moneda: 'ARS', simbolo: '$', locale: 'es-AR' },
  br: { nombre: 'Brasil', moneda: 'BRL', simbolo: 'R$', locale: 'pt-BR' },
  cl: { nombre: 'Chile', moneda: 'CLP', simbolo: '$', locale: 'es-CL' },
  py: { nombre: 'Paraguay', moneda: 'PYG', simbolo: '₲', locale: 'es-PY' },
  bo: { nombre: 'Bolivia', moneda: 'BOB', simbolo: 'Bs', locale: 'es-BO' },
  pe: { nombre: 'Perú', moneda: 'PEN', simbolo: 'S/', locale: 'es-PE' },
  ec: { nombre: 'Ecuador', moneda: 'USD', simbolo: 'US$', locale: 'es-EC' },
  co: { nombre: 'Colombia', moneda: 'COP', simbolo: '$', locale: 'es-CO' },
  ve: { nombre: 'Venezuela', moneda: 'VES', simbolo: 'Bs.', locale: 'es-VE' },
  pa: { nombre: 'Panamá', moneda: 'USD', simbolo: 'US$', locale: 'es-PA' },
  cr: { nombre: 'Costa Rica', moneda: 'CRC', simbolo: '₡', locale: 'es-CR' },
  ni: { nombre: 'Nicaragua', moneda: 'NIO', simbolo: 'C$', locale: 'es-NI' },
  hn: { nombre: 'Honduras', moneda: 'HNL', simbolo: 'L', locale: 'es-HN' },
  sv: { nombre: 'El Salvador', moneda: 'USD', simbolo: 'US$', locale: 'es-SV' },
  gt: { nombre: 'Guatemala', moneda: 'GTQ', simbolo: 'Q', locale: 'es-GT' },
  mx: { nombre: 'México', moneda: 'MXN', simbolo: '$', locale: 'es-MX' },
  do: { nombre: 'Rep. Dominicana', moneda: 'DOP', simbolo: 'RD$', locale: 'es-DO' },
  cu: { nombre: 'Cuba', moneda: 'CUP', simbolo: '$', locale: 'es-CU' },
};

/** Lista para selects de UI: [{clave, nombre, moneda, simbolo}] */
export function listarPaises() {
  return Object.entries(PAISES).map(([clave, p]) => ({ clave, ...p, idioma: p.locale.startsWith('pt') ? 'pt' : 'es' }));
}

/** Idioma del país (del locale): 'pt' para Brasil, 'es' para el resto. */
export function idiomaDePais(paisClave) {
  const p = PAISES[paisClave] || PAISES.uy;
  return p.locale.startsWith('pt') ? 'pt' : 'es';
}

/** Descripción del idioma para instruir a la IA y elegir la voz. */
export const NOMBRE_IDIOMA = {
  es: 'español (rioplatense vos/tenés si es Uruguay o Argentina; neutro en el resto de LATAM)',
  pt: 'portugués de Brasil (português do Brasil)',
  en: 'English (natural, friendly US English)',
};

/**
 * Parámetros de facturación activos según la config del profesional.
 * @param {string} paisClave — clave de PAISES (default 'uy')
 * @param {string} monedaPref — '' = moneda local del país | 'USD' = dólares
 */
export function parametrosMoneda(paisClave, monedaPref) {
  const pais = PAISES[paisClave] || PAISES.uy;
  const enUsd = String(monedaPref || '').toUpperCase() === 'USD' && pais.moneda !== 'USD';
  return {
    pais: paisClave in PAISES ? paisClave : 'uy',
    nombrePais: pais.nombre,
    moneda: enUsd ? 'USD' : pais.moneda,
    simbolo: enUsd ? 'US$' : pais.simbolo,
    locale: pais.locale,
    idioma: pais.locale.startsWith('pt') ? 'pt' : 'es',
  };
}
