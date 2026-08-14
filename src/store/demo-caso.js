// © 2026 Martín Viera. Todos los derechos reservados.

// Arma el caso de demostración: catálogo de $100, cliente y una cita ya
// agendada lista para cobrar.
//
// Vive acá (y no sólo en scripts/demo-caso.js) porque el script escribe en el
// almacén de la máquina donde corre — inútil para el deploy de Vercel, que es
// justamente donde se muestra la demo. Desde el panel esto corre en el
// servidor, contra el almacén de verdad.
//
// No inventa ningún monto: carga el precio en el CATÁLOGO del profesional y a
// partir de ahí el chatbot cotiza esos $100 como cotizaría cualquier trabajo.
// La regla de siempre —el precio sale del catálogo, no del modelo— sigue
// intacta; sólo que con un catálogo pensado para que la prueba de pago real
// cueste poco.
import { get as cfg, setConfig } from './config.js';
import { crearCita, listarCitas } from './trabajos.js';

export const OFICIO_DEMO = 'demo_visita';
export const TRABAJO_DEMO = 'visita_demo';
export const PRECIO_DEMO = 100;

export const CLIENTE_DEMO = {
  nombre: 'Martín Viera',
  telefono: '098576279',
  email: 'vieraschiavi@gmail.com',
  direccion: 'Montevideo, Uruguay'
};

export const CATALOGO_DEMO = {
  [OFICIO_DEMO]: {
    nombre: 'Demostración MV Agendate IA',
    // Sin traslado: la demo tiene que costar exactamente $100, y el traslado
    // se sumaría aparte según la distancia.
    traslado_por_km: 0,
    traslado_minimo: 0,
    trabajos: {
      [TRABAJO_DEMO]: {
        nombre: 'Visita de demostración',
        duracion_min: 30,
        mano_obra: PRECIO_DEMO,
        materiales_base: 0
      }
    }
  }
};

/** Fecha de mañana en YYYY-MM-DD (que la cita de muestra no quede en el pasado). */
function manana() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Deja todo listo para mostrar el circuito. Es idempotente: si ya hay una cita
 * de demo sin cobrar, la reutiliza en vez de llenar la agenda de duplicados
 * cada vez que se aprieta el botón.
 */
export async function prepararCasoDemo(cuentaId) {
  // El catálogo se FUSIONA con lo que ya haya cargado el profesional: esto es
  // una demo, no puede pisarle sus precios de verdad.
  let custom = {};
  try { custom = JSON.parse(cfg('oficiosCustom') || '{}'); } catch { /* config rota: se arranca de cero */ }
  setConfig({
    oficiosCustom: JSON.stringify({ ...custom, ...CATALOGO_DEMO }),
    // El país fija la moneda de la cotización; sin esto cotizaría en la moneda
    // de otro país y el cobro no coincidiría con lo que se muestra en pantalla.
    pais: cfg('pais') || 'uy'
  });

  const fecha = manana();
  const yaHay = (await listarCitas({}, cuentaId))
    .find((c) => c.trabajo === TRABAJO_DEMO && c.cobro?.estado !== 'pagado' && c.fecha >= fecha);
  if (yaHay) return { ok: true, cita: yaHay, yaExistia: true, precio: PRECIO_DEMO };

  // Si el horario fijo está ocupado se prueban los siguientes: la demo no
  // puede fallar porque el profesional ya tenga algo agendado a esa hora.
  let ultimoError;
  for (let hora = 10; hora <= 17; hora++) {
    try {
      const cita = await crearCita({
        clienteNombre: CLIENTE_DEMO.nombre,
        telefono: CLIENTE_DEMO.telefono,
        oficio: OFICIO_DEMO,
        oficioNombre: CATALOGO_DEMO[OFICIO_DEMO].nombre,
        trabajo: TRABAJO_DEMO,
        trabajoNombre: CATALOGO_DEMO[OFICIO_DEMO].trabajos[TRABAJO_DEMO].nombre,
        fecha,
        inicio: `${String(hora).padStart(2, '0')}:00`,
        fin: `${String(hora).padStart(2, '0')}:30`,
        direccion: CLIENTE_DEMO.direccion,
        direccionConfirmada: true,
        // El monto sale del catálogo de arriba, no de acá: es el mismo número.
        cotizacion: { mano_obra: PRECIO_DEMO, materiales: 0, traslado: 0, total: PRECIO_DEMO },
        canal: 'webchat'
      }, cuentaId);
      return { ok: true, cita, yaExistia: false, precio: PRECIO_DEMO };
    } catch (e) {
      if (e.codigo !== 'HORARIO_OCUPADO') throw e;
      ultimoError = e;
    }
  }
  return { ok: false, error: `No hay hueco libre mañana para la cita de demostración. ${ultimoError?.message || ''}`.trim() };
}
