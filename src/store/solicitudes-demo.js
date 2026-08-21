// © 2026 Martín Viera. Todos los derechos reservados.

// Solicitudes de acceso a la demo.
//
// POR QUÉ EXISTE
// La demo era pública: cualquiera entraba a /demo.html y conversaba con el
// agente REAL. Eso tiene tres problemas, y el tercero es el caro:
//   1. Regala el artefacto de ingeniería. Lo que diferencia al producto no es
//      la pantalla, es cómo el agente cotiza, repregunta y arma la agenda.
//      Conversando un rato eso se copia; mirando una captura, no.
//   2. No distingue al prospecto serio del que vino a mirar cómo está hecho.
//      Sin pedir nada, tampoco queda rastro de quién pasó.
//   3. Cada conversación de un desconocido se le factura al dueño como tokens
//      de IA.
// Ahora la demo se muestra 1:1 y agendada: para pedirla hay que dejar nombre,
// email, país y empresa. El pedido queda guardado acá (el rastro) y además se
// avisa por email.
//
// La solicitud se guarda SIEMPRE, aunque el email no esté configurado o falle:
// un lead perdido por un problema de infraestructura no se recupera.
import { kvGet, kvSet } from './redis.js';

const CLAVE = 'mvagendate:solicitudes-demo';

// Tope de solicitudes guardadas. Todo vive en una sola clave de Redis; sin
// tope crece sin límite hasta que deja de entrar. 500 es holgado para el
// volumen de un producto que se vende 1:1.
const MAX = 500;

// Tope de largo por campo. El body parser acepta hasta 2 MB: sin esto, un
// bot puede llenar la clave de Redis con un solo POST.
const LARGO = { nombre: 120, email: 160, pais: 80, empresa: 160, oficio: 120, mensaje: 1000 };
const recortar = (v, campo) => String(v ?? '').trim().slice(0, LARGO[campo]);

const EMAIL_OK = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function leer() {
  const db = (await kvGet(CLAVE)) || {};
  db.solicitudes ??= [];
  return db;
}

/**
 * Registra un pedido de demo.
 * @returns {{ok:true, solicitud:object, repetida:boolean}|{ok:false, error:string}}
 */
export async function registrarSolicitud({ nombre, email, pais, empresa, oficio, mensaje }) {
  const n = recortar(nombre, 'nombre');
  const mail = recortar(email, 'email').toLowerCase();
  const p = recortar(pais, 'pais');
  const emp = recortar(empresa, 'empresa');

  // Los cuatro campos son obligatorios a propósito: son justamente el filtro
  // entre "prospecto serio" y "curiosidad de la competencia".
  if (n.length < 3) return { ok: false, error: 'Poné tu nombre y apellido.' };
  if (!EMAIL_OK.test(mail)) return { ok: false, error: 'Revisá el email: no parece válido.' };
  if (!p) return { ok: false, error: 'Falta el país.' };
  if (!emp) return { ok: false, error: 'Falta la empresa. Si trabajás por tu cuenta, poné tu oficio.' };

  const db = await leer();
  const ahora = new Date().toISOString();
  const yaEstaba = db.solicitudes.find((s) => s.email === mail);

  if (yaEstaba) {
    // Insistir no crea una entrada nueva: la lista tiene que seguir siendo de
    // PERSONAS interesadas, no de clics. Pero sí se anota que volvió a pedir,
    // que es señal de interés real.
    yaEstaba.pedidos = (yaEstaba.pedidos || 1) + 1;
    yaEstaba.ultimo = ahora;
    yaEstaba.nombre = n;
    yaEstaba.pais = p;
    yaEstaba.empresa = emp;
    if (oficio) yaEstaba.oficio = recortar(oficio, 'oficio');
    if (mensaje) yaEstaba.mensaje = recortar(mensaje, 'mensaje');
    await kvSet(CLAVE, db);
    return { ok: true, solicitud: yaEstaba, repetida: true };
  }

  const solicitud = {
    nombre: n, email: mail, pais: p, empresa: emp,
    oficio: recortar(oficio, 'oficio'), mensaje: recortar(mensaje, 'mensaje'),
    estado: 'pendiente', pedidos: 1, creado: ahora, ultimo: ahora,
  };
  db.solicitudes.unshift(solicitud);
  db.solicitudes = db.solicitudes.slice(0, MAX);
  await kvSet(CLAVE, db);
  return { ok: true, solicitud, repetida: false };
}

/** Todas las solicitudes, de la más nueva a la más vieja. */
export async function listarSolicitudes() {
  const db = await leer();
  return [...db.solicitudes].sort((a, b) => (b.ultimo || '').localeCompare(a.ultimo || ''));
}

/** Marca una solicitud como atendida (demo ya mostrada) o descartada. */
export async function marcarSolicitud(email, estado) {
  if (!['pendiente', 'agendada', 'mostrada', 'descartada'].includes(estado)) {
    return { ok: false, error: 'Estado inválido.' };
  }
  const db = await leer();
  const s = db.solicitudes.find((x) => x.email === String(email || '').trim().toLowerCase());
  if (!s) return { ok: false, error: 'No encontré esa solicitud.' };
  s.estado = estado;
  await kvSet(CLAVE, db);
  return { ok: true, solicitud: s };
}

/** Totales para el monitor del dueño. */
export async function resumenSolicitudes() {
  const lista = await listarSolicitudes();
  const porEstado = lista.reduce((acc, s) => {
    acc[s.estado] = (acc[s.estado] || 0) + 1;
    return acc;
  }, {});
  return { total: lista.length, por_estado: porEstado };
}
