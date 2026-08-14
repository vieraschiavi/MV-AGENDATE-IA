// © 2026 Martín Viera. Todos los derechos reservados.

// Deja el programa listo para mostrarle a un cliente el circuito COMPLETO en
// vivo: chatear con el bot → que cotice → que agende → cobrar por MercadoPago →
// ver la cita marcada como pagada.
//
//   npm run demo-caso
//
// No inventa ningún monto: carga en el CATÁLOGO del profesional un servicio de
// demostración de $100, y a partir de ahí el chatbot cotiza esos $100 igual que
// cotizaría cualquier otro trabajo. Es la misma regla de siempre —el precio
// sale del catálogo, no del modelo— solo que con un catálogo pensado para que
// la demo salga barata de pagar de verdad.
//
// Deja además una cita YA agendada con ese trabajo, para poder mostrar el cobro
// sin tener que conversar primero.
import { get as cfg, setConfig } from '../src/store/config.js';
import { crearCita, listarCitas } from '../src/store/trabajos.js';

const CLIENTE = {
  nombre: 'Martín Viera',
  telefono: '098576279',
  email: 'vieraschiavi@gmail.com',
  direccion: 'Montevideo, Uruguay'
};

// El servicio de demostración: $100 para que la prueba de pago real cueste eso
// y no una cotización de verdad de varios miles.
const OFICIO_DEMO = 'demo_visita';
const TRABAJO_DEMO = 'visita_demo';
const PRECIO_DEMO = 100;

const catalogoDemo = {
  [OFICIO_DEMO]: {
    nombre: 'Demostración MV Agendate IA',
    // Sin traslado: la demo tiene que costar exactamente $100, y el traslado
    // se suma aparte según la distancia.
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

async function main() {
  // 1) Catálogo: se FUSIONA con lo que ya haya cargado, no lo pisa.
  let custom = {};
  try { custom = JSON.parse(cfg('oficiosCustom') || '{}'); } catch { /* config rota: se arranca de cero */ }
  setConfig({
    oficiosCustom: JSON.stringify({ ...custom, ...catalogoDemo }),
    // El país fija la moneda de la cotización ($ UYU) — sin esto cotizaría en
    // la moneda de otro país y el cobro no coincidiría con lo que se muestra.
    pais: cfg('pais') || 'uy',
    oficioProfesional: OFICIO_DEMO,
    nombreProfesional: cfg('nombreProfesional') || 'Martín Viera',
    agenciaNombre: cfg('agenciaNombre') || 'MV Agendate IA',
    agenciaTelefono: cfg('agenciaTelefono') || CLIENTE.telefono
  });

  // 2) Cita de muestra, ya agendada y lista para cobrar. Si ya existe una de
  //    una corrida anterior, no se duplica.
  const fecha = manana();
  const yaHay = (await listarCitas({}))
    .find((c) => c.trabajo === TRABAJO_DEMO && c.cobro?.estado !== 'pagado' && c.fecha >= fecha);

  let cita = yaHay;
  if (!cita) {
    cita = await crearCita({
      clienteNombre: CLIENTE.nombre,
      telefono: CLIENTE.telefono,
      oficio: OFICIO_DEMO,
      oficioNombre: catalogoDemo[OFICIO_DEMO].nombre,
      trabajo: TRABAJO_DEMO,
      trabajoNombre: catalogoDemo[OFICIO_DEMO].trabajos[TRABAJO_DEMO].nombre,
      fecha,
      inicio: '10:00',
      fin: '10:30',
      direccion: CLIENTE.direccion,
      direccionConfirmada: true,
      // El monto sale del catálogo de arriba, no de acá: es el mismo número.
      cotizacion: { mano_obra: PRECIO_DEMO, materiales: 0, traslado: 0, total: PRECIO_DEMO },
      canal: 'webchat'
    });
  }

  const listo = (v) => (v ? '✔' : '✘');
  console.log(`
  Caso de demostración listo
  ==========================

  Catálogo      "${catalogoDemo[OFICIO_DEMO].trabajos[TRABAJO_DEMO].nombre}" a $${PRECIO_DEMO}
  Cliente       ${CLIENTE.nombre} · ${CLIENTE.telefono} · ${CLIENTE.email}
  Cita          ${cita.id} — ${cita.fecha} ${cita.inicio}${yaHay ? '  (ya existía, no se duplicó)' : ''}

  Para mostrarlo en vivo
  ----------------------
  1. Chat:    abrí /demo.html y pedí "una visita de demostración".
              El bot cotiza $${PRECIO_DEMO} del catálogo y agenda solo.
  2. Cobro:   POST /api/citas/${cita.id}/cobrar  → devuelve el link de MercadoPago.
  3. Pago:    abrí ese link y pagá los $${PRECIO_DEMO} de verdad.
  4. Registro: al confirmar MercadoPago, la cita queda marcada como PAGADA sola.

  Lo que hace falta configurar para que el paso 3 y 4 funcionen de verdad
  ----------------------------------------------------------------------
  ${listo(cfg('mercadopagoToken'))} mercadopagoToken   Access Token de TU cuenta de MercadoPago (/config.html)
  ${listo(cfg('sitioUrl'))} sitioUrl           dominio público, para que MercadoPago avise el pago
  ${listo(cfg('anthropicApiKey') || cfg('openaiApiKey') || cfg('geminiApiKey'))} API key de IA      para que el chatbot conteste de verdad (si no, responde en modo demo)

  El dinero entra a TU cuenta de MercadoPago. El retiro al banco (Itaú u otro)
  se hace desde MercadoPago: el programa no mueve plata entre cuentas.
`);
}

main().catch((e) => { console.error('No pude preparar el caso de demostración:', e.message); process.exit(1); });
