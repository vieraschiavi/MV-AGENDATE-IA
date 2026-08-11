// Prueba gratis de la copia DESCARGADA (PC/APK) — MV Agendate IA.
// Modelo: al primer arranque se estampa la fecha de inicio; la app funciona
// completa durante DIAS_PRUEBA días (default 7) y después se BLOQUEA (el panel/
// workspace deja de responder) hasta que se ingrese la licencia que llega al
// pagar en MercadoPago. El chatbot/demo público no se toca — es la vidriera de
// venta.
//
// El instalador que se vende trae los 7 días FIJADOS adentro (scripts/ofuscar.js
// escribe electron/owner-config.cjs y electron/main.cjs los inyecta como
// DIAS_PRUEBA): así la variable de entorno de la máquina del comprador no puede
// estirar la prueba ni desactivarla poniendo DIAS_PRUEBA=0.
//
// NO aplica en el sitio hosteado (Vercel): ahí conviven la landing/demo de
// marketing y el modo SaaS online, que tiene su propio trial POR CUENTA
// (14 días, ver store/cuentas.js). El discriminador es process.env.VERCEL.
import { get as cfg, setConfig } from './config.js';
import { DIAS_PRUEBA_CLIENTE, DIAS_FIJADOS } from './dias-prueba.js';

const MS_DIA = 86400000;

/**
 * Días de prueba. 0 o negativo = sin límite.
 * Orden: lo que fijó el empaquetador (manda siempre, es lo que hace que el
 * candado no dependa de la máquina del cliente) → env DIAS_PRUEBA (solo en
 * desarrollo y tests, donde nada está fijado) → default de la versión que se
 * vende.
 */
function diasPrueba() {
  if (Number.isFinite(DIAS_FIJADOS)) return DIAS_FIJADOS;
  const n = Number(process.env.DIAS_PRUEBA);
  return Number.isFinite(n) ? n : DIAS_PRUEBA_CLIENTE;
}

/** Largo mínimo de un código de licencia (el que emite la compra es más largo). */
const MIN_LICENCIA = 6;

/** true si el código guardado puede ser una licencia de verdad. */
function licenciaValida(codigo) {
  return String(codigo || '').trim().length >= MIN_LICENCIA;
}

/**
 * true si la fecha guardada sirve para contar la prueba: parseable y no futura.
 * Una fecha futura solo sale de tocar el reloj o la config a mano, y estiraría
 * la prueba; se descarta igual que una basura.
 */
function fechaUsable(valor) {
  if (!valor) return false;
  const ms = new Date(valor).getTime();
  return Number.isFinite(ms) && ms <= Date.now();
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
  // Se exige el mismo mínimo que activarLicencia: si no, un MV_LICENCIA=x en el
  // entorno de la máquina alcanzaba para hacer pasar por paga una copia que no
  // lo está.
  if (licenciaValida(cfg('licenciaLocal'))) return { ...base, aplica: true, licenciada: true };
  // Prueba desactivada (el vendedor corre su propia copia sin límite).
  if (diasPrueba() <= 0) return base;

  // El inicio se estampa la primera vez. Se re-estampa también cuando lo que
  // hay guardado no es una fecha usable: sin esto, un PRUEBA_INICIO basura en
  // el entorno daba NaN (y `NaN <= 0` es false → nunca vencía) y uno con fecha
  // futura regalaba años de prueba.
  let inicio = cfg('pruebaInicio');
  if (!fechaUsable(inicio)) {
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
  if (!licenciaValida(c)) return { ok: false, error: 'Ingresá un código de licencia válido (el que te llegó al comprar).' };
  setConfig({ licenciaLocal: c });
  return { ok: true, estado: estadoPrueba() };
}
