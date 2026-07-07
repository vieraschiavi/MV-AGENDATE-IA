// Tests de soporte multi-profesional (varios trabajadores por cuenta) — node --test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { listarProfesionales, guardarProfesionales, obtenerProfesional, profesionalesGuardados } from '../src/store/config.js';
import { crearCita, listarCitas, agendaDelDiaConUbicacion } from '../src/store/trabajos.js';
import { construirTools, TOOLS } from '../src/ai/agente.js';

// Deja la config de profesionales como estaba (sin equipo) al terminar, para no
// contaminar data/config.json de quien corra los tests localmente sin limpiar.
after(() => { guardarProfesionales([]); });

test('listarProfesionales devuelve un único profesional implícito si no se cargó ningún equipo', () => {
  guardarProfesionales([]);
  const lista = listarProfesionales();
  assert.equal(lista.length, 1);
  assert.equal(lista[0].id, 'default');
});

test('profesionalesGuardados devuelve vacío cuando no hay equipo cargado', () => {
  guardarProfesionales([]);
  assert.deepEqual(profesionalesGuardados(), []);
});

test('guardarProfesionales guarda y slugifica ids a partir del nombre (sin acentos)', () => {
  const lista = guardarProfesionales([
    { nombre: 'Juan Pérez', oficio: 'electricista', horarioInicio: '08:00', horarioFin: '17:00' },
    { nombre: 'María Gómez', oficio: 'plomero', horarioInicio: '09:00', horarioFin: '18:00' }
  ]);
  assert.equal(lista.length, 2);
  assert.equal(lista[0].id, 'juan-perez');
  assert.equal(lista[1].id, 'maria-gomez');
  assert.deepEqual(listarProfesionales(), lista);
  assert.deepEqual(profesionalesGuardados(), lista);
});

test('guardarProfesionales descarta entradas sin nombre', () => {
  const lista = guardarProfesionales([{ nombre: '', oficio: 'electricista' }, { nombre: 'Ana Silva', oficio: 'pintor' }]);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].nombre, 'Ana Silva');
});

test('obtenerProfesional busca por id o cae al primero', () => {
  guardarProfesionales([
    { nombre: 'Juan Pérez', oficio: 'electricista' },
    { nombre: 'María Gómez', oficio: 'plomero' }
  ]);
  assert.equal(obtenerProfesional('maria-gomez').nombre, 'María Gómez');
  assert.equal(obtenerProfesional('no-existe').nombre, 'Juan Pérez');
});

test('construirTools suma elegir_profesional solo cuando hay más de un profesional', () => {
  guardarProfesionales([]);
  assert.ok(!construirTools().some((t) => t.name === 'elegir_profesional'));
  assert.deepEqual(construirTools().map((t) => t.name), TOOLS.map((t) => t.name));

  guardarProfesionales([{ nombre: 'Juan Pérez', oficio: 'electricista' }, { nombre: 'María Gómez', oficio: 'plomero' }]);
  assert.ok(construirTools().some((t) => t.name === 'elegir_profesional'));
  guardarProfesionales([]);
});

test('las citas quedan aisladas por profesionalId para el cálculo de traslados', async () => {
  const fecha = '2031-03-10'; // fecha lejana para no chocar con la agenda demo sembrada
  await crearCita({
    clienteNombre: 'Cliente Juan', telefono: '099000001', profesionalId: 'prof-a',
    oficio: 'electricista', oficioNombre: 'Electricista', trabajo: 'diagnostico', trabajoNombre: 'Diagnóstico',
    fecha, inicio: '09:00', fin: '10:00', direccion: 'Dir A', lat: -34.90, lng: -56.15
  });
  await crearCita({
    clienteNombre: 'Cliente María', telefono: '099000002', profesionalId: 'prof-b',
    oficio: 'plomero', oficioNombre: 'Plomero', trabajo: 'destape_caneria', trabajoNombre: 'Destape',
    fecha, inicio: '09:30', fin: '10:30', direccion: 'Dir B', lat: -34.91, lng: -56.16
  });

  const citasA = await listarCitas({ fecha, profesionalId: 'prof-a' });
  const citasB = await listarCitas({ fecha, profesionalId: 'prof-b' });
  assert.equal(citasA.length, 1);
  assert.equal(citasA[0].clienteNombre, 'Cliente Juan');
  assert.equal(citasB.length, 1);
  assert.equal(citasB[0].clienteNombre, 'Cliente María');

  const agendaA = await agendaDelDiaConUbicacion(fecha, undefined, 'prof-a');
  const agendaB = await agendaDelDiaConUbicacion(fecha, undefined, 'prof-b');
  assert.equal(agendaA.length, 1);
  assert.equal(agendaA[0].inicio, '09:00');
  assert.equal(agendaB.length, 1);
  assert.equal(agendaB[0].inicio, '09:30');
});

test('crearCita cae al primer profesional configurado si no se especifica profesionalId', async () => {
  guardarProfesionales([{ nombre: 'Único Profesional', oficio: 'electricista' }]);
  const cita = await crearCita({
    clienteNombre: 'Cliente Sin Prof', telefono: '099000003',
    oficio: 'electricista', oficioNombre: 'Electricista', trabajo: 'diagnostico', trabajoNombre: 'Diagnóstico',
    fecha: '2031-03-11', inicio: '09:00', fin: '10:00', direccion: 'Dir C'
  });
  assert.equal(cita.profesionalId, 'unico-profesional');
  guardarProfesionales([]);
});
