// © 2026 Martín Viera. Todos los derechos reservados.

// Aviso automático de retraso — MV Agendate IA
//
// Se ejecuta periódicamente (cron cada 5-10 min, o al cerrar cada trabajo
// desde la app/APK del profesional) comparando la hora real estimada de
// fin del trabajo en curso contra la hora de inicio de la próxima cita.
// Si detecta que va a llegar tarde, dispara un mensaje de WhatsApp al
// próximo cliente avisando la demora — sin que el profesional tenga que
// escribir nada.
//
// Reutiliza el mismo canal de WhatsApp (Meta Cloud API) que ya está
// implementado en src/channels/whatsapp.js del proyecto base: solo hace
// falta importar su función enviarWhatsApp() y llamarla desde acá.

import { estimarTiempoTrasladoMin, calcularDistanciaKm } from '../store/agenda.js';

const UMBRAL_AVISO_MIN = 30; // recién avisa si el retraso estimado supera esto
const ANTICIPACION_MIN = 30; // avisa con esta anticipación antes de la hora pactada

/**
 * @param {object} citaActual        - { finEstimado: Date, ubicacion: {lat,lng} }
 * @param {object} citaSiguiente     - { telefono: string, nombre: string, inicioPactado: Date, ubicacion: {lat,lng} }
 * @param {Date}   [ahora]           - permite inyectar la hora actual en tests
 * @returns {{ hayRetraso: boolean, minutosRetraso?: number, mensaje?: string, debeAvisarAhora?: boolean }}
 */
export function evaluarRetraso(citaActual, citaSiguiente, ahora = new Date()) {
  const trasladoMin = estimarTiempoTrasladoMin(
    calcularDistanciaKm(citaActual.ubicacion, citaSiguiente.ubicacion)
  );

  const llegadaEstimada = new Date(citaActual.finEstimado.getTime() + trasladoMin * 60000);
  const minutosRetraso = Math.round((llegadaEstimada - citaSiguiente.inicioPactado) / 60000);

  if (minutosRetraso <= 0) {
    return { hayRetraso: false };
  }

  const minutosHastaLaCita = Math.round((citaSiguiente.inicioPactado - ahora) / 60000);
  const debeAvisarAhora = minutosRetraso >= UMBRAL_AVISO_MIN && minutosHastaLaCita <= ANTICIPACION_MIN;

  return {
    hayRetraso: true,
    minutosRetraso,
    debeAvisarAhora,
    mensaje: construirMensajeDisculpa(citaSiguiente.nombre, minutosRetraso),
  };
}

function construirMensajeDisculpa(nombre, minutosRetraso) {
  const primerNombre = (nombre || '').split(' ')[0] || '';
  const saludo = primerNombre ? `Hola ${primerNombre},` : 'Hola,';
  return (
    `${saludo} te escribo porque el trabajo anterior se extendió un poco más de lo previsto. ` +
    `Voy a llegar con una demora aproximada de ${minutosRetraso} minutos. ` +
    `Disculpá la molestia, ¡ya estoy en camino!`
  );
}

/**
 * Recorre la agenda del día y dispara los avisos que correspondan.
 * Pensado para llamarse desde un cron o desde el hook "cerrar trabajo" de
 * la app/APK. `enviarWhatsApp` se inyecta para no acoplar este módulo al
 * canal concreto (facilita testear sin credenciales reales).
 */
export async function revisarYAvisarAgendaDelDia(citasOrdenadas, enviarWhatsApp, ahora = new Date()) {
  const avisos = [];
  for (let i = 0; i < citasOrdenadas.length - 1; i++) {
    const actual = citasOrdenadas[i];
    const siguiente = citasOrdenadas[i + 1];
    if (actual.estado !== 'en_curso' && actual.estado !== 'completado_recien') continue;

    const resultado = evaluarRetraso(actual, siguiente, ahora);
    if (resultado.hayRetraso && resultado.debeAvisarAhora && !siguiente.avisoRetrasoEnviado) {
      await enviarWhatsApp(siguiente.telefono, resultado.mensaje);
      siguiente.avisoRetrasoEnviado = true; // evita mandar el aviso duplicado
      avisos.push({ cliente: siguiente.nombre, ...resultado });
    }
  }
  return avisos;
}
