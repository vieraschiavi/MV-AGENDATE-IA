// © 2026 Martín Viera. Todos los derechos reservados.
// Estado persistente de las suscripciones "Pro IA" (MercadoPago Preapproval):
// cuota de tokens consumidos este mes por licencia, y si la suscripción sigue
// activa. Antes de esto, el proyecto no tenía ninguna base de datos real en la
// web (las licencias son HMAC sin estado) — sin esto, no hay forma confiable
// de saber "a quién le cobro" ni "a quién le corto el acceso a IA".
import { kvGet, kvSet, kvIncrBy, redisDisponible } from './redis.js';

const mesActual = () => new Date().toISOString().slice(0, 7); // 'YYYY-MM'

/** Suma tokens consumidos por una licencia en el mes en curso. Devuelve el total acumulado. */
export async function registrarUsoTokens(licenciaId, tokens) {
  if (!licenciaId || !tokens) return 0;
  return await kvIncrBy(`uso:${licenciaId}:${mesActual()}`, tokens);
}

/** Tokens consumidos por una licencia en el mes en curso. */
export async function usoDelMes(licenciaId) {
  return (await kvGet(`uso:${licenciaId}:${mesActual()}`)) || 0;
}

/** Guarda/actualiza el estado de la suscripción de una licencia. */
export async function guardarSuscripcion(licenciaId, datos) {
  const actual = (await obtenerSuscripcion(licenciaId)) || {};
  const nueva = { ...actual, ...datos, actualizado: new Date().toISOString() };
  await kvSet(`sub:${licenciaId}`, nueva);
  return nueva;
}

/** Estado completo de la suscripción de una licencia (o null si no existe). */
export async function obtenerSuscripcion(licenciaId) {
  return await kvGet(`sub:${licenciaId}`);
}

/** true si la licencia tiene una suscripción activa (no cancelada/pausada/vencida). */
export async function suscripcionActiva(licenciaId) {
  const s = await obtenerSuscripcion(licenciaId);
  return !!s && s.estado === 'activo';
}

/** Vincula el ID de preapproval de MercadoPago con la licencia interna (índice inverso para el webhook). */
export async function vincularPreapproval(preapprovalId, licenciaId) {
  await kvSet(`pre:${preapprovalId}`, licenciaId);
}

/** Encuentra la licencia asociada a un preapproval ya vinculado antes (o null la primera vez). */
export async function buscarLicenciaPorPreapproval(preapprovalId) {
  return await kvGet(`pre:${preapprovalId}`);
}

export { redisDisponible };
