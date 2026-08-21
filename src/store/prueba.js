// © 2026 Martín Viera. Todos los derechos reservados.

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
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { get as cfg, setConfig } from './config.js';
import { DIAS_PRUEBA_CLIENTE, DIAS_FIJADOS } from './dias-prueba.js';
import { firmaConfigurada } from './licencia-clave.js';
import { verificar as verificarFirma } from './licencia-firma.js';

const MS_DIA = 86400000;

// --- Ancla del inicio de la prueba, FUERA de la carpeta del programa ---
// El inicio se guarda en data/config.json, que vive adentro de la carpeta de
// instalación: borrando ese archivo (o la carpeta data/ entera) la prueba
// arrancaba de cero, y se podía repetir para siempre. La copia de acá vive en
// el perfil del usuario, así que borrar los datos del programa ya no regala
// días nuevos. No es a prueba de todo —quien conozca las dos ubicaciones puede
// borrar ambas— pero saca el reseteo de "borrar una carpeta a ojo".
const ANCLA_DIR = () => process.env.MV_ANCLA_DIR || join(homedir(), '.mv-agendate-ia');
const ANCLA = () => join(ANCLA_DIR(), 'prueba.json');

function leerAncla() {
  try { return JSON.parse(readFileSync(ANCLA(), 'utf8')).inicio || null; } catch { return null; }
}
function escribirAncla(inicio) {
  // Nunca bloquea el arranque: si el perfil es de solo lectura, la prueba
  // sigue funcionando con lo que hay en config.json.
  try {
    mkdirSync(dirname(ANCLA()), { recursive: true });
    writeFileSync(ANCLA(), JSON.stringify({ inicio }));
  } catch { /* sin ancla, el candado igual funciona */ }
}

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

/** Largo mínimo de un código de licencia del formato VIEJO (sin firma). */
const MIN_LICENCIA = 6;

/**
 * Licencias del formato viejo que se siguen aceptando, separadas por coma.
 *
 * Existe para no dejar afuera a quien compró ANTES de que las licencias se
 * firmaran: su código no tiene firma y nunca va a poder tenerla. Es una lista
 * explícita —no un patrón— justamente para que nadie pueda fabricarse una
 * propia siguiendo el formato. Los códigos salen del panel: /api/licencias.
 *
 *   MV_LICENCIAS_HEREDADAS=MV-FULL-A1B2C3D4,MV-BASICO-99887766
 */
function heredadas() {
  return String(process.env.MV_LICENCIAS_HEREDADAS || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

/**
 * true si el código es una licencia de verdad.
 *
 * ANTES ESTO ERA `codigo.length >= 6`, y punto. Verificado corriendo el módulo:
 * activarLicencia("abcdef") devolvía ok y dejaba licenciada:true para siempre.
 * O sea que el candado de los 7 días se levantaba tipeando cualquier cosa y el
 * plan Full de US$ 299 quedaba desbloqueado sin pagar. Ahora la licencia se
 * verifica contra la clave pública embebida (store/licencia-clave.js), que sólo
 * puede haber firmado el servidor de ventas con su clave privada.
 *
 * Mientras la clave pública no esté pegada, el candado firmado está apagado y
 * se conserva el criterio viejo — así el repo tal cual está hoy no cambia de
 * comportamiento ni deja a nadie afuera. Ver licencia-clave.js: "Cómo se
 * enciende".
 */
function licenciaValida(codigo) {
  const c = String(codigo || '').trim();
  if (!c) return false;
  if (!firmaConfigurada()) return c.length >= MIN_LICENCIA;
  if (verificarFirma(c)) return true;
  return heredadas().includes(c.toUpperCase());
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

  // El inicio se estampa la primera vez. Se descarta lo que no sea una fecha
  // usable: sin esto, un PRUEBA_INICIO basura en el entorno daba NaN (y
  // `NaN <= 0` es false → nunca vencía) y uno con fecha futura regalaba años.
  //
  // Se miran DOS lugares y gana el MÁS VIEJO: el config del programa y el ancla
  // en el perfil del usuario. Así, borrar data/config.json ya no reinicia la
  // prueba — el ancla sigue ahí y vuelve a imponer la fecha original.
  const guardados = [cfg('pruebaInicio'), leerAncla()]
    .filter(fechaUsable)
    .sort((a, b) => new Date(a) - new Date(b));
  const inicio = guardados[0] || new Date().toISOString();
  // Se reescriben los dos lados solo si hacía falta (primer arranque, o uno de
  // los dos borrado/adulterado): sin esto, cada consulta escribiría a disco.
  if (cfg('pruebaInicio') !== inicio) setConfig({ pruebaInicio: inicio });
  if (leerAncla() !== inicio) escribirAncla(inicio);
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
