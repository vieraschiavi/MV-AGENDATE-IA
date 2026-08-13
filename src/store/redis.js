// © 2026 Martín Viera. Todos los derechos reservados.

// Cliente Redis (Upstash, vía integración "Storage" de Vercel) para estado
// persistente entre invocaciones serverless: cuota de tokens por licencia,
// estado de suscripción, etc. Sin esto, cualquier dato en memoria/archivo se
// pierde en cada cold start de Vercel (ya documentado como limitación conocida).
//
// Si todavía no conectaste la integración (o estás en desarrollo local), cae
// a un Map en memoria — la demo sigue funcionando, pero no persiste entre
// reinicios/despliegues. Se activa solo apenas Vercel inyecte las variables
// de entorno (KV_REST_API_URL/KV_REST_API_TOKEN o UPSTASH_REDIS_REST_*).
import { Redis } from '@upstash/redis';

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const cliente = (url && token) ? new Redis({ url, token }) : null;
const memoria = new Map();

/**
 * true si hay un almacén COMPARTIDO entre invocaciones (Redis real).
 *
 * MV_KV_MEMORIA=1 hace que el fallback en memoria cuente como tal. Es la única
 * forma de ejercitar en los tests el camino de almacén compartido —claves por
 * pedido, índice, migración—, que en serverless es justamente donde aparecen
 * las carreras; sin esto, los tests corren siempre por el camino de archivo y
 * ese código no lo prueba nadie.
 */
export function redisDisponible() {
  return !!cliente || process.env.MV_KV_MEMORIA === '1';
}

export async function kvGet(clave) {
  if (cliente) return await cliente.get(clave);
  return memoria.has(clave) ? memoria.get(clave) : null;
}

export async function kvSet(clave, valor, opciones) {
  if (cliente) return await cliente.set(clave, valor, opciones);
  memoria.set(clave, valor);
  if (opciones?.ex) setTimeout(() => memoria.delete(clave), opciones.ex * 1000).unref();
  return 'OK';
}

export async function kvIncrBy(clave, cantidad) {
  if (cliente) return await cliente.incrby(clave, cantidad);
  const nuevo = (memoria.get(clave) || 0) + cantidad;
  memoria.set(clave, nuevo);
  return nuevo;
}

/** Fija (o refresca) el vencimiento de una clave ya existente, en segundos. */
export async function kvExpire(clave, segundos) {
  if (cliente) return await cliente.expire(clave, segundos);
  if (memoria.has(clave)) setTimeout(() => memoria.delete(clave), segundos * 1000).unref();
  return 1;
}

export async function kvDel(clave) {
  if (cliente) return await cliente.del(clave);
  memoria.delete(clave);
  return 1;
}

/** Varias claves de una: devuelve un array alineado con `claves`. */
export async function kvMGet(claves) {
  if (!claves.length) return [];
  if (cliente) return await cliente.mget(...claves);
  return claves.map((c) => (memoria.has(c) ? memoria.get(c) : null));
}

// --- Conjuntos ---
// Sirven de índice sin carrera: agregar y sacar un miembro son operaciones
// atómicas del servidor, así que dos invocaciones simultáneas no se pisan la
// lista entera como pasaría leyendo, modificando y reescribiendo un array.

export async function kvSAdd(clave, miembro) {
  if (cliente) return await cliente.sadd(clave, miembro);
  const s = memoria.get(clave) instanceof Set ? memoria.get(clave) : new Set();
  s.add(miembro);
  memoria.set(clave, s);
  return 1;
}

export async function kvSRem(clave, miembro) {
  if (cliente) return await cliente.srem(clave, miembro);
  const s = memoria.get(clave);
  if (s instanceof Set) s.delete(miembro);
  return 1;
}

export async function kvSMembers(clave) {
  if (cliente) return (await cliente.smembers(clave)) || [];
  const s = memoria.get(clave);
  return s instanceof Set ? [...s] : [];
}
