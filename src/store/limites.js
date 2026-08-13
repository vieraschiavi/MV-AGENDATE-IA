// © 2026 Martín Viera. Todos los derechos reservados.

// Rate limiting para los endpoints públicos.
//
// Por qué hace falta: /api/chat, /api/ayuda e /api/impuestos/estimar llaman al
// modelo de IA, y /api/contacto manda mail. Sin límite, cualquiera con un for
// puede gastarle la cuota de IA (o llenar la casilla) al dueño desde afuera,
// sin siquiera tener cuenta.
//
// Usa Redis cuando está disponible (imprescindible en Vercel: cada request
// puede caer en otra instancia serverless, así que un contador en memoria no
// sirve) y cae a memoria cuando no lo está, que es el caso de la copia
// descargable. Ver src/store/redis.js.
import { kvIncrBy, kvExpire } from './redis.js';

/** IP del cliente, atravesando el proxy de Vercel. */
function ipDe(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'desconocida';
}

/**
 * Middleware de límite por IP con ventana fija.
 *
 * @param {object} opciones
 * @param {string} opciones.nombre     Identifica el contador (va en la clave).
 * @param {number} opciones.max        Cuántos requests se permiten por ventana.
 * @param {number} opciones.ventanaSeg Largo de la ventana, en segundos.
 * @param {string} [opciones.mensaje]  Qué se le dice al usuario al cortarlo.
 */
export function limitar({ nombre, max, ventanaSeg, mensaje }) {
  const aviso = mensaje
    || `Estás yendo muy rápido. Esperá un momento y probá de nuevo.`;

  return async function limitador(req, res, next) {
    // La copia de escritorio la usa una sola persona en su propia máquina:
    // limitarla ahí sería molestar al dueño sin proteger nada.
    if (process.env.MV_ESCRITORIO) return next();

    const ventana = Math.floor(Date.now() / 1000 / ventanaSeg);
    const clave = `rl:${nombre}:${ipDe(req)}:${ventana}`;

    let usados;
    try {
      usados = await kvIncrBy(clave, 1);
      // Sólo en el primer request de la ventana hay que ponerle vencimiento;
      // si no, las claves quedarían para siempre.
      if (usados === 1) await kvExpire(clave, ventanaSeg);
    } catch {
      // Si el contador falla (Redis caído), se deja pasar: cortar el servicio
      // por un problema de infraestructura sería peor que el abuso que evita.
      return next();
    }

    if (usados > max) {
      const faltan = ventanaSeg - (Math.floor(Date.now() / 1000) % ventanaSeg);
      res.set('Retry-After', String(faltan));
      return res.status(429).json({
        ok: false,
        error: `${aviso} (podés reintentar en ${faltan} segundo${faltan === 1 ? '' : 's'})`,
      });
    }

    return next();
  };
}
