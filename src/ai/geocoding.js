// Geocoding gratuito (Nominatim / OpenStreetMap).
//
// Convierte una dirección de texto en coordenadas {lat, lng} (geocoding
// directo) o unas coordenadas en una dirección legible (geocoding inverso,
// para cuando el cliente comparte su ubicación nativa de WhatsApp). No
// requiere API key — solo un User-Agent identificable, como exige la
// política de uso de Nominatim: https://operations.osmfoundation.org/policies/nominatim/
//
// Para más precisión o mayor volumen, esto se puede reemplazar por Google
// Geocoding API o Mapbox sin tocar el resto del motor (agenda.js solo
// consume {lat, lng}).
const USER_AGENT = 'MV-Agendate-IA/1.0 (+https://github.com/vieraschiavi/MV-AGENDATE-IA)';
const BASE = 'https://nominatim.openstreetmap.org';

// Nominatim pide como máximo 1 request/segundo desde una misma app. Esta
// cola simple serializa los pedidos y espaciar uno del otro; alcanza de
// sobra para el volumen de un profesional independiente.
let colaLibre = Promise.resolve();
function encolar(tarea) {
  const resultado = colaLibre.then(async () => {
    const r = await tarea();
    await new Promise((res) => setTimeout(res, 1000));
    return r;
  });
  colaLibre = resultado.catch(() => {});
  return resultado;
}

// Cache simple en memoria (por proceso) para no re-geocodificar la misma
// dirección varias veces en la misma conversación/sesión.
const cacheDirecta = new Map();
const cacheInversa = new Map();

async function pedir(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'es' },
    signal: AbortSignal.timeout(10000)
  });
  if (!r.ok) throw new Error(`Nominatim respondió ${r.status}`);
  return r.json();
}

/**
 * Geocodifica una dirección de texto a coordenadas.
 * @param {string} direccion
 * @returns {Promise<{ok:true, lat:number, lng:number, direccion_normalizada:string} | {ok:false, error:string}>}
 */
export async function geocodificar(direccion) {
  const texto = String(direccion || '').trim();
  if (!texto) return { ok: false, error: 'Falta la dirección a geocodificar.' };
  const clave = texto.toLowerCase();
  if (cacheDirecta.has(clave)) return cacheDirecta.get(clave);

  try {
    const url = `${BASE}/search?format=jsonv2&limit=1&q=${encodeURIComponent(texto)}`;
    const datos = await encolar(() => pedir(url));
    if (!datos.length) {
      const r = { ok: false, error: 'No encontré esa dirección. Probá con más detalle (calle, número, ciudad).' };
      cacheDirecta.set(clave, r);
      return r;
    }
    const d = datos[0];
    const r = { ok: true, lat: Number(d.lat), lng: Number(d.lon), direccion_normalizada: d.display_name };
    cacheDirecta.set(clave, r);
    return r;
  } catch (e) {
    return { ok: false, error: 'No pude consultar el mapa ahora mismo: ' + String(e.message || e).slice(0, 200) };
  }
}

/**
 * Geocodifica en reversa: de coordenadas a una dirección legible. Se usa
 * cuando el cliente comparte su ubicación nativa por WhatsApp (llega con
 * lat/lng exactos, sin necesidad de geocoding directo).
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<{ok:true, direccion:string} | {ok:false, error:string}>}
 */
export async function geocodificarInverso(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, error: 'Coordenadas inválidas.' };
  const clave = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (cacheInversa.has(clave)) return cacheInversa.get(clave);

  try {
    const url = `${BASE}/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
    const d = await encolar(() => pedir(url));
    const r = d?.display_name
      ? { ok: true, direccion: d.display_name }
      : { ok: false, error: 'No pude determinar la dirección de esa ubicación.' };
    cacheInversa.set(clave, r);
    return r;
  } catch (e) {
    return { ok: false, error: 'No pude consultar el mapa ahora mismo: ' + String(e.message || e).slice(0, 200) };
  }
}

// Definición de la "tool" para el agente de Claude: le permite convertir una
// dirección que el cliente escribió en texto a coordenadas, antes de llamar
// a buscar_horarios_disponibles (que necesita lat/lng).
export const geocodificarToolDef = {
  name: 'geocodificar_direccion',
  description:
    'Convierte una dirección escrita en texto (calle, número, barrio/ciudad) en coordenadas lat/lng. Llamala cuando tengas la dirección del cliente en texto y necesites sus coordenadas para buscar horarios disponibles. Si el cliente ya compartió su ubicación de WhatsApp, no hace falta llamarla — esas coordenadas ya vienen en el mensaje.',
  input_schema: {
    type: 'object',
    properties: {
      direccion: { type: 'string', description: 'Dirección en texto, ej: "Av. Brasil 2450, Pocitos, Montevideo"' }
    },
    required: ['direccion']
  }
};
