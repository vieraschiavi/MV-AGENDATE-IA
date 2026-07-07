// Tests del cotizador y del motor de agenda — node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, listarOficios } from '../src/ai/agente.js';
import { cotizar, listarOficios as listarOficiosCotizador } from '../src/ai/cotizador.js';
import { proponerHorarios, calcularDistanciaKm, estimarTiempoTrasladoMin, configuracionDescansoPorDefecto } from '../src/store/agenda.js';
import { evaluarRetraso } from '../src/channels/aviso-retraso.js';

test('cotizar calcula mano de obra + materiales + traslado', () => {
  const r = cotizar({ oficio: 'electricista', trabajo: 'instalacion_toma', distanciaKm: 6 });
  assert.equal(r.oficio, 'Electricista');
  assert.ok(r.desglose.mano_obra > 0);
  assert.equal(r.total, r.desglose.mano_obra + r.desglose.materiales + r.desglose.traslado);
});

test('cotizar aplica factores de urgencia y horario', () => {
  const normal = cotizar({ oficio: 'electricista', trabajo: 'diagnostico' });
  const urgente = cotizar({ oficio: 'electricista', trabajo: 'diagnostico', urgencia: 'urgente', horario: 'nocturno' });
  assert.ok(urgente.desglose.mano_obra > normal.desglose.mano_obra);
});

test('cotizar devuelve error para oficio/trabajo inexistente', () => {
  assert.ok(cotizar({ oficio: 'inexistente', trabajo: 'x' }).error);
  assert.ok(cotizar({ oficio: 'electricista', trabajo: 'inexistente' }).error);
});

test('listarOficios devuelve al menos los oficios base con sus trabajos', () => {
  const oficios = listarOficiosCotizador();
  assert.ok(oficios.length >= 7);
  for (const clave of ['electricista', 'plomero', 'abogado', 'psicologo']) {
    assert.ok(oficios.some((o) => o.clave === clave), `falta el oficio ${clave}`);
  }
  assert.ok(oficios.every((o) => o.trabajos.length > 0));
});

test('proponerHorarios respeta el día libre configurado', () => {
  const r = proponerHorarios({
    fecha: '2026-07-12', diaSemana: 0, // domingo
    ubicacionCliente: { lat: -34.9, lng: -56.16 }, duracionMin: 45, citasDelDia: []
  });
  assert.deepEqual(r.propuestas, []);
  assert.ok(r.motivo_descarte);
});

test('proponerHorarios propone huecos considerando el traslado a citas vecinas', () => {
  const r = proponerHorarios({
    fecha: '2026-07-13', diaSemana: 1,
    ubicacionCliente: { lat: -34.9, lng: -56.16 },
    duracionMin: 45,
    citasDelDia: [{ inicio: '09:00', fin: '10:00', ubicacion: { lat: -34.91, lng: -56.15 } }]
  });
  assert.ok(r.propuestas.length > 0);
  for (const p of r.propuestas) assert.ok(p.inicio < p.fin);
});

test('calcularDistanciaKm y estimarTiempoTrasladoMin son 0 en el mismo punto', () => {
  const a = { lat: -34.9, lng: -56.16 };
  assert.equal(calcularDistanciaKm(a, a), 0);
  assert.equal(estimarTiempoTrasladoMin(0), 0);
});

test('evaluarRetraso detecta demora y arma un mensaje de disculpa', () => {
  const citaActual = { finEstimado: new Date('2026-07-13T10:00:00'), ubicacion: { lat: -34.9, lng: -56.16 } };
  const citaSiguiente = { nombre: 'Juan', telefono: '099111222', inicioPactado: new Date('2026-07-13T10:10:00'), ubicacion: { lat: -34.95, lng: -56.20 } };
  const r = evaluarRetraso(citaActual, citaSiguiente, new Date('2026-07-13T09:50:00'));
  assert.equal(r.hayRetraso, true);
  assert.ok(r.mensaje.includes('Juan'));
});

test('las herramientas del agente tienen esquemas válidos', () => {
  const nombres = TOOLS.map((t) => t.name);
  for (const esperado of ['cotizar_trabajo', 'buscar_horarios_disponibles', 'confirmar_direccion_cliente', 'registrar_persona_receptora', 'confirmar_cita']) {
    assert.ok(nombres.includes(esperado), `falta la herramienta ${esperado}`);
  }
  for (const t of TOOLS) {
    assert.equal(t.input_schema.type, 'object');
    assert.ok(t.description.length > 20, `descripción útil en ${t.name}`);
  }
});

test('listarOficios expuesto por el agente coincide con el del cotizador', () => {
  assert.deepEqual(listarOficios(), listarOficiosCotizador());
});

test('configuracionDescansoPorDefecto tiene la forma esperada', () => {
  assert.ok(Array.isArray(configuracionDescansoPorDefecto.dias_libres));
  assert.ok(configuracionDescansoPorDefecto.horario_laboral.inicio);
});
