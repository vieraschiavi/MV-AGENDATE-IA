// Prueba gratis de la copia DESCARGADA (PC/APK) — MV Agendate IA.
// Modelo: al primer arranque se estampa la fecha de inicio; la app funciona
// completa durante DIAS_PRUEBA días (default 3) y después se BLOQUEA (el panel/
// workspace deja de responder) hasta que se ingrese la licencia que llega al
// pagar. El chatbot/demo público no se toca — es la vidriera de venta.
//
// NO aplica en el sitio hosteado (Vercel): ahí conviven la landing/demo de
// marketing y el modo SaaS online, que tiene su propio trial POR CUENTA
// (14 días, ver store/cuentas.js). El discriminador es process.env.VERCEL.
import { get as cfg, setConfig } from './config.js';

const MS_DIA = 86400000;

/** Días de prueba (env DIAS_PRUEBA, default 3). 0 o negativo = sin límite. */
function diasPrueba() {
  const n = Number(process.env.DIAS_PRUEBA);
  return Number.isFinite(n) ? n : 3;
}

/**
 * Estado de la prueba de la copia descargada. Estampa el inicio la primera vez.
 * @returns {{aplica:boolean, licenciada:boolean, vencida:boolean, diasRestantes:number, diasPrueba:number, inicio:string|null}}
 */
export function estadoPrueba() {
  const base = { aplica: false, licenciada: false, vencida: false, diasRestantes: 0, diasPrueba: diasPrueba(), inicio: null };
  // En el host (Vercel) no hay prueba local: es la vidriera + SaaS por cuenta.
  if (process.env.VERCEL) return base;
  // Con licencia cargada, la copia está activada (pago único / suscripción).
  if (cfg('licenciaLocal')) return { ...base, aplica: true, licenciada: true };
  // Prueba desactivada (el vendedor corre su propia copia sin límite).
  if (diasPrueba() <= 0) return base;

  let inicio = cfg('pruebaInicio');
  if (!inicio) {
    inicio = new Date().toISOString();
    setConfig({ pruebaInicio: inicio });
  }
  const transcurridosMs = Date.now() - new Date(inicio).getTime();
  const restantes = diasPrueba() - transcurridosMs / MS_DIA;
  return {
    aplica: true,
    licenciada: false,
    vencida: restantes <= 0,
    diasRestantes: Math.max(0, Math.ceil(restantes)),
    diasPrueba: diasPrueba(),
    inicio
  };
}

/** true si hay que cortar el workspace: prueba vencida y sin licencia. */
export function pruebaBloqueada() {
  const e = estadoPrueba();
  return e.aplica && !e.licenciada && e.vencida;
}

/**
 * Activa la copia con el código de licencia que llegó al pagar. Lo guarda como
 * licenciaLocal (lo que levanta el candado). La validación real contra el
 * servidor central, si se configuró, la sigue haciendo store/estadoLicencia.js.
 */
export function activarLicencia(codigo) {
  const c = String(codigo || '').trim();
  if (c.length < 6) return { ok: false, error: 'Ingresá un código de licencia válido (el que te llegó al comprar).' };
  setConfig({ licenciaLocal: c });
  return { ok: true, estado: estadoPrueba() };
}
