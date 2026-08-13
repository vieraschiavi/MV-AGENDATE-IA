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
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { get as cfg, setConfig } from './config.js';
import { DIAS_PRUEBA_CLIENTE, DIAS_FIJADOS } from './dias-prueba.js';
import { verificarLicencia, sinClavePublica, diasRestantesDe } from './licencia-firma.js';
import { LICENCIA_INCLUIDA, ACEPTA_LEGADO } from './licencia-incluida.js';

const MS_DIA = 86400000;
const aqui = dirname(fileURLToPath(import.meta.url));

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
 * Días de prueba.
 *
 * OJO con el cero: antes significaba "sin límite" y era así como se marcaba la
 * copia del dueño. Ya no. Cero días es una prueba de cero días — vence
 * enseguida. La edición dueño es una licencia firmada (licencia-incluida.js),
 * no un número en un archivo de texto que cualquiera escribe.
 *
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

// --- Qué cuenta como licencia de verdad ---
//
// EL AGUJERO QUE ESTO CIERRA: acá había un `length >= 6`. Cualquier texto de
// seis caracteres —"aaaaaa"— pasaba por licencia y levantaba el candado para
// siempre. El cliente al que se le vencía la prueba se quedaba con el programa
// completo sin pagar, sin necesitar ninguna herramienta ni leer nada del
// código: probando en el campo de licencia se caía solo.
//
// Ahora la única llave es una firma Ed25519 que sólo puede hacer la clave
// privada (ver licencia-firma.js). El texto inventado no verifica.
const FORMATO_LEGADO = /^MV-[A-Z]+-[0-9A-F]{8}$/;

/**
 * Verifica un código de licencia.
 * @returns {{ok: boolean, motivo?: string, datos?: object, legado?: boolean}}
 */
function chequearLicencia(codigo) {
  const texto = String(codigo || '').trim();
  if (!texto) return { ok: false, motivo: 'vacia' };

  const v = verificarLicencia(texto);
  if (v.ok) return v;

  // Códigos VIEJOS (MV-PLAN-XXXXXXXX), sólo si esta entrega los acepta.
  //
  // No se pueden verificar acá: son un HMAC que necesita el secreto del
  // servidor, y meter ese secreto en el .exe del cliente sería entregarle la
  // máquina de fabricar licencias. O sea que aceptarlos es aceptar cualquier
  // texto con esa forma. Por eso ACEPTA_LEGADO viene en false y sólo se
  // enciende para una entrega de transición, mientras se les reemite una
  // licencia firmada a los que ya habían comprado.
  if (ACEPTA_LEGADO && FORMATO_LEGADO.test(texto)) return { ok: true, legado: true, datos: {} };

  return v;
}

// --- Licencia suelta en un archivo (licencia.txt) ---
//
// Existe para que algo externo al programa —el .bat que convierte una copia a
// la versión dueño— pueda activar una instalación YA HECHA sin reinstalar.
// Se lee en cada consulta, no una vez al arrancar.
//
// No abre ningún agujero: el contenido pasa por la MISMA verificación de firma
// que un código tecleado. Un licencia.txt escrito a mano no habilita nada.
function leerLicenciaArchivo() {
  for (const ruta of [
    join(process.env.MV_DATOS_DIR || join(aqui, '../../data'), 'licencia.txt'),
    join(aqui, '../..', 'licencia.txt')   // al lado del programa instalado
  ]) {
    try {
      const texto = readFileSync(ruta, 'utf8').trim();
      if (texto) return texto;
    } catch { /* no está: se sigue con el próximo */ }
  }
  return '';
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

  // Con licencia FIRMADA la copia está activada. Se prueban tres orígenes, en
  // este orden: la que activó el usuario a mano, la del licencia.txt suelto (la
  // que deja el .bat del dueño) y la que viaja dentro del build (variante
  // dueño). Las tres pasan por la misma verificación de firma.
  let vencidaPorLicencia = null;
  for (const codigo of [cfg('licenciaLocal'), leerLicenciaArchivo(), LICENCIA_INCLUIDA]) {
    if (!codigo) continue;
    const v = chequearLicencia(codigo);
    if (v.ok) {
      return {
        ...base, aplica: true, licenciada: true,
        diasRestantes: diasRestantesDe(v.datos) ?? 0,
        plan: v.datos?.p || '', nombre: v.datos?.n || ''
      };
    }
    // Una licencia que ERA válida y se venció no es lo mismo que una inventada:
    // hay que decirle al cliente que renueve, no que su código es falso.
    if (v.motivo === 'vencida' && !vencidaPorLicencia) vencidaPorLicencia = v;
  }
  if (vencidaPorLicencia) {
    return { ...base, aplica: true, vencida: true, licenciaVencida: true, diasRestantes: 0 };
  }

  // Sin clave pública configurada no se puede verificar ninguna licencia, así
  // que tampoco se puede vender: es un checkout de desarrollo, y ahí la app no
  // se bloquea.
  //
  // Pero SÓLO corriendo desde el código fuente. En una entrega empaquetada
  // (DIAS_FIJADOS es un número) que falte la clave pública no es una comodidad
  // de desarrollo sino un error de empaquetado, y devolver "sin límite" lo
  // convertiría en el peor final posible: el producto regalado a todo el que lo
  // descargue, sin que nada se vea roto. Empaquetado y sin clave se cae a la
  // prueba normal: sigue roto (ninguna licencia va a verificar) pero vence, y
  // que venza es lo que hace que el error se note.
  if (sinClavePublica() && !Number.isFinite(DIAS_FIJADOS)) return base;

  // OJO: acá había un `if (diasPrueba() <= 0) return base;` — o sea "cero días
  // de prueba = sin límite", que era como se marcaba la copia del dueño.
  // Escribir `diasPrueba: 0` en un archivo de texto de una línea desbloqueaba
  // el programa entero. Ahora cero días significa lo que dice: una prueba de
  // cero días, que vence enseguida. La edición dueño es una licencia firmada,
  // no un número.

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
  const v = chequearLicencia(c);
  if (!v.ok) return { ok: false, motivo: v.motivo, error: MENSAJE[v.motivo] || MENSAJE.formato };
  setConfig({ licenciaLocal: c });
  return { ok: true, estado: estadoPrueba() };
}

// Un solo "código inválido" para todo obliga al cliente a adivinar si se
// equivocó al copiar, si se le venció o si el problema es de la instalación —
// y en los tres casos escribe a soporte.
const MENSAJE = {
  vacia: 'Pegá el código de licencia que te llegó al comprar.',
  formato: 'Ese código no tiene el formato de una licencia (empieza con MVA1). Copialo completo del mail de la compra, sin espacios.',
  firma: 'Ese código no es una licencia válida de MV Agendate IA.',
  vencida: 'Tu licencia venció. Renovala para volver a usar el programa.',
  invalida: 'El código está incompleto o mal copiado. Copialo entero del mail de la compra.',
  'sin-clave-publica': 'Esta copia del programa salió mal armada y no puede comprobar licencias. Descargala de nuevo del sitio oficial.'
};
