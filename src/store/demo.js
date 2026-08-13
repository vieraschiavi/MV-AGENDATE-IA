// © 2026 Martín Viera. Todos los derechos reservados.
// Cupo de la DEMO: cuando la instancia es de demostración (demoLimite='1'),
// las funciones con IA (chat y análisis de fotos) son gratis pero limitadas a
// N usos por visitante (default 3), con todas las opciones. Superado el cupo,
// se invita a comprar el producto. En el producto vendido (demoLimite apagado)
// no hay límite.
import { get as cfg } from './config.js';

const usos = new Map(); // visitante -> cantidad usada

export function demoLimitada() {
  return cfg('demoLimite') === '1' || cfg('demoLimite') === 'true';
}

function maxUsos() {
  const n = parseInt(cfg('demoMaxUsos'), 10);
  return Number.isFinite(n) && n > 0 ? n : 3;
}

/** Usos restantes para un visitante (Infinity si no hay límite). */
export function usosRestantes(visitante) {
  if (!demoLimitada()) return Infinity;
  return Math.max(0, maxUsos() - (usos.get(visitante) || 0));
}

/**
 * Intenta consumir un uso. Devuelve { permitido, restantes, max }.
 * Sin límite → siempre permitido.
 */
export function consumirUso(visitante) {
  if (!demoLimitada()) return { permitido: true, restantes: Infinity, max: Infinity };
  const max = maxUsos();
  const actual = usos.get(visitante) || 0;
  if (actual >= max) return { permitido: false, restantes: 0, max };
  usos.set(visitante, actual + 1);
  return { permitido: true, restantes: max - (actual + 1), max };
}

export function mensajeLimite() {
  return `🔒 Llegaste al límite de la demostración gratuita (${maxUsos()} usos con todas las funciones). ` +
    'Para uso ilimitado, con tu marca y tu oficio, adquirí MV Agendate IA. ¡Escribinos y lo activamos hoy!';
}
