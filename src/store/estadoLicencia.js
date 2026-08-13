// © 2026 Martín Viera. Todos los derechos reservados.

// Chequeo periódico de la suscripción Pro IA para la copia DESCARGADA del
// programa (PC/APK): si el cliente eligió suscripción mensual y el pago falla
// o se cancela, esto desactiva el chat/fotos con IA — el resto del programa
// (tasador, CRM, dashboards, etc.) sigue funcionando normalmente.
//
// Nunca corta por un problema de red: sólo cuando el servidor central
// confirma explícitamente que la suscripción no está activa. Si esta
// instancia nunca configuró una "licenciaLocal" (porque no es una copia
// vendida con suscripción, o el dueño usa su propia clave de Claude sin
// pasar por nuestro cobro), el chequeo no hace nada — no se corta nunca.
import { get as cfg } from './config.js';

// Función (no constante) para que un test pueda fijar la env var antes de
// llamar a chequear() sin depender del orden de carga del módulo.
const servidorCentral = () => process.env.MV_SERVIDOR_LICENCIAS || '';
const INTERVALO_MS = 6 * 60 * 60 * 1000; // 6 horas

let iaSuspendida = false;
let motivo = '';

/** true si el chat/voz con IA pueden usarse ahora mismo. */
export function iaHabilitada() { return !iaSuspendida; }

/** Texto para mostrarle al usuario cuando la IA está suspendida. */
export function motivoSuspension() {
  return motivo || 'Tu suscripción Pro IA no está activa (pago pendiente o cancelado). Regularizá el pago para volver a usar el chat/voz con IA — el resto del programa sigue funcionando normalmente.';
}

async function chequear() {
  const licencia = cfg('licenciaLocal');
  const servidor = servidorCentral();
  if (!licencia || !servidor) return; // no es una copia con suscripción gestionada: nunca se corta nada
  try {
    const url = `${servidor}/api/licencia/estado?licencia=${encodeURIComponent(licencia)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return; // error del servidor central: no suspendemos por las dudas
    const d = await r.json();
    if (!d.ok || !d.gestionada) { iaSuspendida = false; return; } // no gestionada = siempre activa
    iaSuspendida = !d.activo;
    motivo = d.activo ? '' : motivoSuspension();
  } catch {
    // Sin conexión / timeout: fail-open, no suspendemos por un problema de red.
  }
}

/** Arranca el chequeo periódico. Llamar una vez al iniciar el programa. */
export function iniciarChequeoLicencia() {
  chequear();
  const t = setInterval(chequear, INTERVALO_MS);
  t.unref?.();
}

// Expuesto solo para test/estadoLicencia.test.js: dispara un chequeo puntual
// sin esperar al intervalo de 6 horas.
export const _internos = { chequear };
