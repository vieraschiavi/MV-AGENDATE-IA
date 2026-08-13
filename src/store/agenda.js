// © 2026 Martín Viera. Todos los derechos reservados.
// Motor de agenda con optimización de traslados — MV Agendate IA
//
// Dado el mapa de citas de un día (con dirección/coordenadas y duración),
// propone horarios que:
//   1) dejan tiempo real de viaje entre una cita y la siguiente (no solo
//      el tiempo del trabajo en sí),
//   2) respetan los bloques de descanso que el profesional configuró
//      (días libres, almuerzo, horario de corte),
//   3) minimizan el traslado total del día.
//
// La distancia se estima con Haversine + una velocidad promedio urbana
// configurable. Es una aproximación razonable para ordenar la agenda sin
// depender de una API externa; si más adelante se quiere precisión real
// (tránsito, rutas), se reemplaza soloEstimarTiempoTrasladoMin() por una
// llamada a Google Distance Matrix / OSRM sin tocar el resto del motor.

const RADIO_TIERRA_KM = 6371;

function aRadianes(grados) {
  return (grados * Math.PI) / 180;
}

/** Distancia en línea recta entre dos puntos {lat, lng} (Haversine). */
export function calcularDistanciaKm(a, b) {
  if (!a || !b) return 0;
  const dLat = aRadianes(b.lat - a.lat);
  const dLng = aRadianes(b.lng - a.lng);
  const lat1 = aRadianes(a.lat);
  const lat2 = aRadianes(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return RADIO_TIERRA_KM * 2 * Math.asin(Math.sqrt(h));
}

/**
 * Estima minutos de traslado. Multiplica la distancia recta por un factor
 * de "ruta real" (las calles no son línea recta) y divide por velocidad
 * promedio configurada para la ciudad/franja horaria.
 */
export function estimarTiempoTrasladoMin(distanciaKm, { velocidadKmH = 25, factorRuta = 1.3 } = {}) {
  if (distanciaKm <= 0) return 0;
  const kmReales = distanciaKm * factorRuta;
  return Math.ceil((kmReales / velocidadKmH) * 60);
}

/**
 * Config por defecto de descansos del profesional. El profesional la
 * ajusta una vez desde el dashboard (config.html en el proyecto base).
 */
export const configuracionDescansoPorDefecto = {
  dias_libres: [0], // 0 = domingo
  horario_laboral: { inicio: '08:00', fin: '19:00' },
  almuerzo: { inicio: '12:30', fin: '13:30' },
  buffer_entre_citas_min: 10, // colchón mínimo aunque el traslado sea corto
};

function horaAMinutos(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function minutosAHora(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function seSuperponeConDescanso(inicioMin, finMin, config) {
  const almuerzoInicio = horaAMinutos(config.almuerzo.inicio);
  const almuerzoFin = horaAMinutos(config.almuerzo.fin);
  return inicioMin < almuerzoFin && finMin > almuerzoInicio;
}

/**
 * Propone horarios para una nueva cita en un día dado.
 *
 * @param {object} opts
 * @param {string} opts.fecha - "YYYY-MM-DD"
 * @param {number} opts.diaSemana - 0(domingo)-6(sábado), para chequear días libres
 * @param {{lat:number,lng:number}} opts.ubicacionCliente
 * @param {number} opts.duracionMin - duración estimada del trabajo
 * @param {Array<{inicio:string,fin:string,ubicacion:{lat:number,lng:number}}>} opts.citasDelDia
 *        horas en formato "HH:MM", ya ordenadas cronológicamente
 * @param {object} [opts.configuracion] - ver configuracionDescansoPorDefecto
 * @returns {{propuestas: Array<object>, motivo_descarte?: string}}
 */
/** Día de la semana (0=domingo) de un 'YYYY-MM-DD', o null si no es una fecha. */
export function diaDeLaFecha(fecha) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fecha || ''));
  if (!m) return null;
  // UTC a propósito: con hora local, un servidor en otro huso puede correr la
  // fecha un día para atrás o para adelante.
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d.getUTCDay();
}

export function proponerHorarios({
  fecha,
  diaSemana,
  ubicacionCliente,
  duracionMin,
  citasDelDia = [],
  configuracion = configuracionDescansoPorDefecto,
}) {
  // El día de la semana se deriva de la fecha, no se cree el que vino: calcular
  // "qué día cae el 14" es justo lo que un modelo de lenguaje hace mal, y
  // equivocarse acá significa ofrecer turnos en el día libre del profesional
  // (o bloquearle un día hábil). La fecha es el dato duro; el resto se calcula.
  const dia = diaDeLaFecha(fecha) ?? diaSemana;

  if (configuracion.dias_libres.includes(dia)) {
    return { propuestas: [], motivo_descarte: 'Día de descanso configurado por el profesional.' };
  }

  const inicioJornada = horaAMinutos(configuracion.horario_laboral.inicio);
  const finJornada = horaAMinutos(configuracion.horario_laboral.fin);
  const buffer = configuracion.buffer_entre_citas_min;

  // Huecos candidatos: antes de la primera cita, entre cada par consecutivo,
  // y después de la última.
  const bloques = [
    { desde: inicioJornada, hasta: citasDelDia[0] ? horaAMinutos(citasDelDia[0].inicio) : finJornada, anterior: null, siguiente: citasDelDia[0] ?? null },
    ...citasDelDia.slice(0, -1).map((cita, i) => ({
      desde: horaAMinutos(cita.fin),
      hasta: horaAMinutos(citasDelDia[i + 1].inicio),
      anterior: cita,
      siguiente: citasDelDia[i + 1],
    })),
    ...(citasDelDia.length
      ? [{ desde: horaAMinutos(citasDelDia[citasDelDia.length - 1].fin), hasta: finJornada, anterior: citasDelDia[citasDelDia.length - 1], siguiente: null }]
      : []),
  ];

  const propuestas = [];
  const almuerzoFinMin = horaAMinutos(configuracion.almuerzo.fin);

  for (const bloque of bloques) {
    const traslado_desde_min = bloque.anterior
      ? estimarTiempoTrasladoMin(calcularDistanciaKm(bloque.anterior.ubicacion, ubicacionCliente))
      : 0;
    const traslado_hacia_min = bloque.siguiente
      ? estimarTiempoTrasladoMin(calcularDistanciaKm(ubicacionCliente, bloque.siguiente.ubicacion))
      : 0;

    // Candidato 1: lo antes posible dentro del bloque.
    const candidatos = [bloque.desde + traslado_desde_min + buffer];
    // Candidato 2: si el almuerzo cae dentro de este bloque, probar también
    // arrancar justo después de comer (por si el candidato 1 choca con el almuerzo).
    if (almuerzoFinMin > bloque.desde && almuerzoFinMin < bloque.hasta) {
      candidatos.push(almuerzoFinMin + buffer);
    }

    for (const inicioPropuesto of candidatos) {
      const finPropuesto = inicioPropuesto + duracionMin;
      const finConTrasladoHaciaSiguiente = finPropuesto + traslado_hacia_min + buffer;

      const cabeEnElBloque = finConTrasladoHaciaSiguiente <= bloque.hasta;
      const chocaConAlmuerzo = seSuperponeConDescanso(inicioPropuesto, finPropuesto, configuracion);

      if (cabeEnElBloque && !chocaConAlmuerzo) {
        propuestas.push({
          inicio: minutosAHora(inicioPropuesto),
          fin: minutosAHora(finPropuesto),
          traslado_previo_min: traslado_desde_min,
          traslado_posterior_min: traslado_hacia_min,
          holgura_min: bloque.hasta - finConTrasladoHaciaSiguiente,
        });
        break; // ya encontramos un horario válido en este bloque
      }
    }
  }

  // Ordenar por menor traslado total (más eficiente para el profesional)
  propuestas.sort((a, b) => (a.traslado_previo_min + a.traslado_posterior_min) - (b.traslado_previo_min + b.traslado_posterior_min));

  return { propuestas: propuestas.slice(0, 3), fecha };
}

// Definición de la "tool" para el agente de Claude
export const proponerHorariosToolDef = {
  name: 'buscar_horarios_disponibles',
  description:
    'Devuelve hasta 3 horarios propuestos para una nueva cita en una fecha dada, considerando el traslado real hacia y desde las citas vecinas, y respetando días libres y almuerzo configurados por el profesional.',
  input_schema: {
    type: 'object',
    properties: {
      fecha: { type: 'string', description: 'YYYY-MM-DD' },
      diaSemana: { type: 'number', description: '0=domingo .. 6=sábado' },
      ubicacionCliente: {
        type: 'object',
        properties: { lat: { type: 'number' }, lng: { type: 'number' } },
        required: ['lat', 'lng'],
      },
      duracionMin: { type: 'number' },
    },
    required: ['fecha', 'diaSemana', 'ubicacionCliente', 'duracionMin'],
  },
};
