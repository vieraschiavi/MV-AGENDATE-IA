// Motor de cotización — MV Agendate IA
//
// Calcula un presupuesto (mano de obra + materiales + traslado) para un
// oficio y tipo de trabajo predefinido, ANTES de que el chatbot converse
// con el cliente. Así el agente de IA cotiza con precios ya cargados por
// el profesional, en vez de inventar números.
//
// Uso típico desde el agente (agente-agendate.js) como "tool" de Claude:
//   cotizar({ oficio: "electricista", trabajo: "instalacion_toma", distanciaKm: 6 })

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const oficios = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'data', 'oficios.json'), 'utf-8')
);

// Factor de mercado: ajusta el precio base según franja horaria / urgencia.
// Estos multiplicadores son un punto de partida — conviene calibrarlos con
// precios reales de la competencia en la zona del profesional.
const FACTORES_URGENCIA = {
  normal: 1.0,      // agendado con anticipación
  mismo_dia: 1.15,  // pide para hoy
  urgente: 1.35,    // fuera de horario / feriado / "cuanto antes"
};

const FACTORES_HORARIO = {
  habil: 1.0,       // horario normal del profesional
  nocturno: 1.25,   // después de las 20:00
  feriado: 1.4,
};

/**
 * @param {object} opts
 * @param {string} opts.oficio        - clave de oficios.json (ej. "electricista")
 * @param {string} opts.trabajo       - clave del trabajo dentro del oficio (ej. "instalacion_toma")
 * @param {number} [opts.distanciaKm] - distancia estimada ida desde la base del profesional
 * @param {"normal"|"mismo_dia"|"urgente"} [opts.urgencia]
 * @param {"habil"|"nocturno"|"feriado"} [opts.horario]
 * @returns {object} desglose de la cotización
 */
export function cotizar({
  oficio,
  trabajo,
  distanciaKm = 0,
  urgencia = 'normal',
  horario = 'habil',
}) {
  const datosOficio = oficios[oficio];
  if (!datosOficio) {
    return { error: `Oficio no encontrado: ${oficio}`, oficios_disponibles: Object.keys(oficios) };
  }
  const datosTrabajo = datosOficio.trabajos[trabajo];
  if (!datosTrabajo) {
    return {
      error: `Trabajo no encontrado para ${oficio}: ${trabajo}`,
      trabajos_disponibles: Object.keys(datosOficio.trabajos),
    };
  }

  const factorUrgencia = FACTORES_URGENCIA[urgencia] ?? 1.0;
  const factorHorario = FACTORES_HORARIO[horario] ?? 1.0;
  const factorTotal = factorUrgencia * factorHorario;

  const manoObra = Math.round(datosTrabajo.mano_obra * factorTotal);
  const materiales = datosTrabajo.materiales_base; // los materiales no llevan sobreprecio por urgencia
  const traslado = Math.max(
    Math.round(distanciaKm * datosOficio.traslado_por_km),
    distanciaKm > 0 ? datosOficio.traslado_minimo : 0
  );
  const total = manoObra + materiales + traslado;

  return {
    oficio: datosOficio.nombre,
    trabajo: datosTrabajo.nombre,
    duracion_estimada_min: datosTrabajo.duracion_min,
    moneda: 'UYU',
    desglose: { mano_obra: manoObra, materiales, traslado },
    factor_aplicado: { urgencia, horario, multiplicador: Number(factorTotal.toFixed(2)) },
    total,
    // Texto listo para mandar por WhatsApp
    mensaje_whatsapp:
      `Presupuesto estimado para *${datosTrabajo.nombre}* (${datosOficio.nombre}):\n` +
      `- Mano de obra: $${manoObra}\n` +
      (materiales > 0 ? `- Materiales (estimado): $${materiales}\n` : '') +
      (traslado > 0 ? `- Traslado: $${traslado}\n` : '') +
      `*Total estimado: $${total}*\n` +
      `Duración aproximada del trabajo: ${datosTrabajo.duracion_min} minutos.\n` +
      `Este valor es una estimación; puede ajustarse al ver el trabajo en el lugar.`,
  };
}

export function listarOficios() {
  return Object.entries(oficios)
    .filter(([clave]) => clave !== '_nota')
    .map(([clave, datos]) => ({
      clave,
      nombre: datos.nombre,
      trabajos: Object.entries(datos.trabajos).map(([tclave, t]) => ({ clave: tclave, nombre: t.nombre })),
    }));
}

// Definición de la "tool" para pasarle directamente al SDK de Claude
// (mismo patrón usado en agente.js).
export const cotizarToolDef = {
  name: 'cotizar_trabajo',
  description:
    'Calcula el presupuesto estimado (mano de obra + materiales + traslado) para un trabajo predefinido de un oficio, antes de confirmar la cita. Usar apenas el cliente cuenta qué necesita.',
  input_schema: {
    type: 'object',
    properties: {
      oficio: { type: 'string', description: 'Clave del oficio, ej: electricista, plomero, pintor, mecanico, abogado, escribano, psicologo' },
      trabajo: { type: 'string', description: 'Clave del tipo de trabajo dentro del oficio (ver listarOficios)' },
      distanciaKm: { type: 'number', description: 'Distancia estimada en km desde la base del profesional hasta el domicilio del cliente' },
      urgencia: { type: 'string', enum: ['normal', 'mismo_dia', 'urgente'] },
      horario: { type: 'string', enum: ['habil', 'nocturno', 'feriado'] },
    },
    required: ['oficio', 'trabajo'],
  },
};
