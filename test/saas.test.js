// Tests del modo SaaS multi-cliente (fase 1): cuentas con login, tokens,
// aislamiento de datos por cuenta y aprobación de cotizaciones — node --test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { registrar, login, verificarToken, firmarToken, obtenerCuenta, actualizarEstado, listarCuentas } from '../src/store/cuentas.js';
import { crearCita, listarCitas, listarClientes, guardarCliente, resumenDashboard } from '../src/store/trabajos.js';
import { crearCotizacion, cotizacionDeSesion, listarCotizaciones, resolverCotizacion, aprobacionRequerida } from '../src/store/cotizaciones.js';
import { setConfig } from '../src/store/config.js';

after(() => { setConfig({ aprobarCotizaciones: '', demoLimite: '' }); });

test('registro y login de cuentas SaaS con token verificable', async () => {
  const mail = `prueba-${Date.now()}@mv.test`;
  const r = await registrar({ email: mail, password: 'secreta123', nombre: 'Prueba' });
  assert.equal(r.ok, true);
  assert.equal(r.cuenta.estado, 'trial');
  assert.ok(new Date(r.cuenta.trialHasta) > new Date(), 'el trial arranca con días por delante');
  const sesion = verificarToken(r.token);
  assert.equal(sesion.cuentaId, r.cuenta.id);
  assert.equal(sesion.email, mail);

  const dup = await registrar({ email: mail, password: 'secreta123' });
  assert.equal(dup.ok, false, 'no puede repetirse el email');

  const mal = await login({ email: mail, password: 'incorrecta' });
  assert.equal(mal.ok, false);
  const bien = await login({ email: mail, password: 'secreta123' });
  assert.equal(bien.ok, true);
  assert.equal((await obtenerCuenta(r.cuenta.id)).email, mail);
  // password nunca sale en la versión pública
  assert.equal(bien.cuenta.password, undefined);
});

test('los tokens inválidos o adulterados se rechazan', async () => {
  assert.equal(verificarToken('basura'), null);
  assert.equal(verificarToken(''), null);
  const token = firmarToken('cta-x', 'a@b.c');
  const [h, p] = token.split('.');
  assert.equal(verificarToken(`${h}.${p}.firmafalsa`), null);
  const vencido = firmarToken('cta-x', 'a@b.c', -1);
  assert.equal(verificarToken(vencido), null, 'un token vencido no vale');
});

test('actualizarEstado marca la suscripción de la cuenta', async () => {
  const r = await registrar({ email: `estado-${Date.now()}@mv.test`, password: 'secreta123' });
  const upd = await actualizarEstado(r.cuenta.id, 'activa', 'pre-123');
  assert.equal(upd.ok, true);
  assert.equal(upd.cuenta.estado, 'activa');
});

test('listarCuentas (panel del vendedor) expone la versión pública, sin password', async () => {
  const lista = await listarCuentas();
  assert.ok(lista.length >= 1);
  for (const c of lista) {
    assert.ok(c.id && c.email && c.estado);
    assert.equal(c.password, undefined, 'el hash de password nunca sale del store');
  }
});

test('los datos de cada cuenta quedan aislados entre sí y de la cuenta default', async () => {
  const a = (await registrar({ email: `a-${Date.now()}@mv.test`, password: 'secreta123' })).cuenta.id;
  const b = (await registrar({ email: `b-${Date.now()}@mv.test`, password: 'secreta123' })).cuenta.id;

  // Las cuentas SaaS arrancan VACÍAS (sin datos demo)
  assert.equal((await listarClientes(a)).length, 0);
  assert.equal((await listarCitas({}, a)).length, 0);

  const cita = await crearCita({
    clienteNombre: 'Cliente de A', telefono: '+598 91 111 111',
    oficio: 'electricista', oficioNombre: 'Electricista', trabajo: 'diagnostico', trabajoNombre: 'Diagnóstico',
    fecha: '2026-08-01', inicio: '10:00', fin: '11:00', direccion: 'Calle A 123', canal: 'test'
  }, a);
  assert.ok(cita.id);

  assert.equal((await listarCitas({}, a)).length, 1);
  assert.equal((await listarCitas({}, b)).length, 0, 'la cita de A no se ve desde B');
  assert.ok(!(await listarCitas({})).some((c) => c.clienteNombre === 'Cliente de A'), 'ni desde la cuenta default');
  assert.equal((await listarClientes(a)).length, 1);
  assert.equal((await listarClientes(b)).length, 0);
  assert.ok((await listarClientes()).length > 0, 'la cuenta default conserva sus datos demo');

  const dash = await resumenDashboard({}, a);
  assert.equal(dash.total, 1, 'el dashboard de A solo cuenta lo de A');

  await guardarCliente({ nombre: 'Cliente de B', telefono: '+598 92 222 222' }, b);
  assert.equal((await listarClientes(b)).length, 1);
  assert.equal((await listarClientes(a)).length, 1, 'el cliente de B no contamina a A');
});

test('la cotización nace pendiente, el chatbot la ve aprobada recién cuando el profesional resuelve', async () => {
  setConfig({ aprobarCotizaciones: '', demoLimite: '' });
  assert.equal(aprobacionRequerida(), true, 'la aprobación es el default');

  const cot = await crearCotizacion({
    sessionId: 'wa:59891234567', canal: 'whatsapp', telefono: '59891234567',
    oficio: 'electricista', oficioNombre: 'Electricista', trabajo: 'diagnostico', trabajoNombre: 'Diagnóstico',
    detalle: { total: 1400, moneda: 'UYU', simbolo: '$', tipo_cobro: 'mano_obra_y_materiales' }
  });
  assert.equal(cot.estado, 'pendiente');
  assert.equal((await cotizacionDeSesion('wa:59891234567', 'diagnostico')).estado, 'pendiente');
  assert.ok((await listarCotizaciones('pendiente')).some((c) => c.id === cot.id));

  // El profesional aprueba AJUSTANDO el precio
  const r = await resolverCotizacion(cot.id, { aprobar: true, total: 1600, nota: 'Incluye materiales' });
  assert.equal(r.ok, true);
  assert.equal(r.cotizacion.estado, 'aprobada');
  assert.equal(r.cotizacion.totalAprobado, 1600);

  const vista = await cotizacionDeSesion('wa:59891234567', 'diagnostico');
  assert.equal(vista.estado, 'aprobada');
  assert.equal(vista.totalAprobado, 1600);

  const repetida = await resolverCotizacion(cot.id, { aprobar: false });
  assert.equal(repetida.ok, false, 'una cotización resuelta no se resuelve dos veces');
});

test('la aprobación se puede desactivar por config y se auto-desactiva en la demo pública', () => {
  setConfig({ aprobarCotizaciones: '0' });
  assert.equal(aprobacionRequerida(), false);
  setConfig({ aprobarCotizaciones: '', demoLimite: '1' });
  assert.equal(aprobacionRequerida(), false, 'en la demo pública fluye sin aprobación');
  setConfig({ demoLimite: '' });
  assert.equal(aprobacionRequerida(), true);
});
