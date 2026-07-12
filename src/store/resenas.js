// Reseñas del producto MV Agendate IA (para la web pública).
// Las deja cualquier visitante; NO se publican hasta que el vendedor las
// aprueba desde el panel de moderación (evita spam y reseñas falsas). Se
// guardan globalmente (son del producto, no de una cuenta SaaS).
import { kvGet, kvSet } from './redis.js';
import { randomUUID } from 'node:crypto';

const CLAVE = 'resenas';

async function cargar() {
  const r = await kvGet(CLAVE);
  return Array.isArray(r) ? r : [];
}
async function guardar(lista) { await kvSet(CLAVE, lista); }

const limpio = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Crea una reseña pendiente de aprobación. Devuelve { ok }. */
export async function crearResena({ nombre, oficio, estrellas, comentario, idioma }) {
  const texto = limpio(comentario, 600);
  const nom = limpio(nombre, 60);
  const est = Math.min(5, Math.max(1, Math.round(Number(estrellas) || 0)));
  if (!nom || !texto || !est) return { ok: false, error: 'Faltan datos (nombre, estrellas y comentario).' };
  const lista = await cargar();
  lista.unshift({
    id: randomUUID().slice(0, 8),
    nombre: nom,
    oficio: limpio(oficio, 40),
    estrellas: est,
    comentario: texto,
    idioma: idioma === 'pt' ? 'pt' : 'es',
    aprobada: false,
    fecha: new Date().toISOString(),
  });
  await guardar(lista.slice(0, 500)); // tope defensivo
  return { ok: true };
}

/** Reseñas aprobadas para mostrar en la web + promedio y total. */
export async function resenasPublicas() {
  const aprobadas = (await cargar()).filter((r) => r.aprobada);
  const total = aprobadas.length;
  const promedio = total ? Math.round((aprobadas.reduce((s, r) => s + r.estrellas, 0) / total) * 10) / 10 : 0;
  const publicas = aprobadas.map(({ id, nombre, oficio, estrellas, comentario, idioma, fecha }) =>
    ({ id, nombre, oficio, estrellas, comentario, idioma, fecha }));
  return { resenas: publicas, promedio, total };
}

/** Todas las reseñas (para el panel de moderación del vendedor). */
export async function resenasTodas() {
  return { resenas: await cargar() };
}

/** Aprueba / rechaza / elimina una reseña. accion: 'aprobar' | 'ocultar' | 'eliminar'. */
export async function moderarResena(id, accion) {
  let lista = await cargar();
  const i = lista.findIndex((r) => r.id === id);
  if (i === -1) return { ok: false, error: 'Reseña no encontrada.' };
  if (accion === 'eliminar') lista = lista.filter((r) => r.id !== id);
  else if (accion === 'aprobar') lista[i].aprobada = true;
  else if (accion === 'ocultar') lista[i].aprobada = false;
  else return { ok: false, error: 'Acción inválida.' };
  await guardar(lista);
  return { ok: true };
}
