// Integridad de la agenda y del precio que queda escrito en una cita.
//
// Dos cosas que el modelo NO puede decidir solo:
//   - el horario: dos clientes distintos no pueden quedar a la misma hora;
//   - el monto: lo pone el catálogo del profesional o su aprobación, nunca el
//     texto que devuelva la IA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearCita, citasDelDia } from '../src/store/trabajos.js';
import { proponerHorarios, diaDeLaFecha } from '../src/store/agenda.js';
import { TOOLS } from '../src/ai/agente.js';

const cuenta = () => 'cta-agenda-' + Math.random().toString(36).slice(2, 9);

const citaBase = (extra = {}) => ({
  clienteNombre: 'Cliente', telefono: '+59899' + Math.floor(Math.random() * 1e6),
  profesionalId: 'default', oficio: 'electricista', trabajo: 'instalacion',
  fecha: '2026-09-15', inicio: '10:00', fin: '11:00',
  direccion: 'Av. Siempreviva 742', ...extra
});

// ---------- Doble turno ----------

test('dos citas en el mismo horario y profesional: la segunda se rechaza', async () => {
  const c = cuenta();
  await crearCita(citaBase(), c);
  await assert.rejects(
    () => crearCita(citaBase({ clienteNombre: 'Otro' }), c),
    (e) => e.codigo === 'HORARIO_OCUPADO'
  );
  assert.equal((await citasDelDia('2026-09-15', c)).length, 1);
});

test('una cita que se superpone PARCIALMENTE también se rechaza', async () => {
  const c = cuenta();
  await crearCita(citaBase({ inicio: '10:00', fin: '11:00' }), c);
  // Arranca antes de que termine la primera: es un choque igual.
  await assert.rejects(
    () => crearCita(citaBase({ inicio: '10:30', fin: '11:30' }), c),
    (e) => e.codigo === 'HORARIO_OCUPADO'
  );
});

test('una cita que empieza justo cuando termina la anterior SÍ entra', async () => {
  const c = cuenta();
  await crearCita(citaBase({ inicio: '10:00', fin: '11:00' }), c);
  const seguida = await crearCita(citaBase({ inicio: '11:00', fin: '12:00' }), c);
  assert.ok(seguida.id, 'pegar dos trabajos no es superponerlos');
});

test('el mismo horario para OTRO profesional del equipo entra sin problema', async () => {
  const c = cuenta();
  await crearCita(citaBase({ profesionalId: 'ana' }), c);
  const otro = await crearCita(citaBase({ profesionalId: 'beto' }), c);
  assert.ok(otro.id, 'cada profesional tiene su propia agenda');
});

test('el horario de una cita CANCELADA se puede reusar', async () => {
  const c = cuenta();
  const primera = await crearCita(citaBase(), c);
  primera.estado = 'cancelada';
  const reemplazo = await crearCita(citaBase({ clienteNombre: 'Nuevo' }), c);
  assert.ok(reemplazo.id);
});

test('un choque se detecta aunque la hora venga sin el cero adelante', async () => {
  // '9:00' < '10:00' es FALSO comparando strings: sin normalizar a minutos,
  // este choque pasaba de largo.
  const c = cuenta();
  await crearCita(citaBase({ inicio: '9:00', fin: '10:30' }), c);
  await assert.rejects(
    () => crearCita(citaBase({ inicio: '10:00', fin: '11:00' }), c),
    (e) => e.codigo === 'HORARIO_OCUPADO'
  );
});

test('una cita con horario ilegible se guarda en vez de inventar un choque', async () => {
  const c = cuenta();
  await crearCita(citaBase(), c);
  const rara = await crearCita(citaBase({ inicio: '', fin: '' }), c);
  assert.ok(rara.id, 'sin horario comparable no se bloquea nada');
});

test('el mismo horario en otra FECHA entra', async () => {
  const c = cuenta();
  await crearCita(citaBase({ fecha: '2026-09-15' }), c);
  const otroDia = await crearCita(citaBase({ fecha: '2026-09-16' }), c);
  assert.ok(otroDia.id);
});

test('el choque no cruza cuentas: la agenda de una no bloquea la de otra', async () => {
  const unaCuenta = cuenta();
  const otraCuenta = cuenta();
  await crearCita(citaBase(), unaCuenta);
  const enLaOtra = await crearCita(citaBase(), otraCuenta);
  assert.ok(enLaOtra.id, 'dos profesionales distintos no comparten agenda');
});

// ---------- Día de la semana derivado de la fecha ----------

test('diaDeLaFecha calcula el día correcto', () => {
  assert.equal(diaDeLaFecha('2026-09-15'), 2); // martes
  assert.equal(diaDeLaFecha('2026-09-13'), 0); // domingo
  assert.equal(diaDeLaFecha('no-es-fecha'), null);
});

test('un diaSemana equivocado NO logra reservar en el día libre del profesional', () => {
  // El ataque involuntario: el modelo calcula mal qué día cae la fecha y ofrece
  // turnos un domingo que el profesional tiene marcado como libre.
  const config = {
    horario_laboral: { inicio: '09:00', fin: '18:00' },
    almuerzo: { inicio: '13:00', fin: '14:00' },
    buffer_entre_citas_min: 15,
    dias_libres: [0] // domingo
  };
  const r = proponerHorarios({
    fecha: '2026-09-13',   // es domingo
    diaSemana: 3,          // el modelo dice que es miércoles
    duracionMin: 60,
    citasDelDia: [],
    configuracion: config
  });
  assert.equal(r.propuestas.length, 0, 'manda la fecha, no lo que dijo el modelo');
  assert.match(r.motivo_descarte, /descanso/i);
});

test('con la fecha y el día coherentes, sigue proponiendo horarios normalmente', () => {
  const config = {
    horario_laboral: { inicio: '09:00', fin: '18:00' },
    almuerzo: { inicio: '13:00', fin: '14:00' },
    buffer_entre_citas_min: 15,
    dias_libres: [0]
  };
  const r = proponerHorarios({
    fecha: '2026-09-15', diaSemana: 2, duracionMin: 60, citasDelDia: [], configuracion: config
  });
  assert.ok(r.propuestas.length > 0);
});

// ---------- El precio no lo pone el modelo ----------

test('confirmar_cita ya no acepta un monto del modelo', () => {
  // Gate estructural: mientras el schema no tenga estos campos, no hay forma de
  // que un total inventado entre por ahí. El monto lo pone el servidor.
  const confirmar = TOOLS.find((t) => t.name === 'confirmar_cita');
  assert.ok(confirmar, 'la herramienta tiene que seguir existiendo');
  const props = Object.keys(confirmar.input_schema.properties);
  assert.ok(!props.includes('totalCotizado'), 'totalCotizado no puede volver al schema');
  assert.ok(!props.includes('desgloseCotizacion'), 'desgloseCotizacion tampoco');
  assert.ok(props.includes('fecha') && props.includes('inicio'), 'el resto del schema sigue igual');
});
