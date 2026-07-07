// CRM de MV Agendate IA: clientes, citas/trabajos y dashboard.
// Persiste en Redis (Upstash) — en Vercel cualquier dato en memoria/archivo se
// pierde en cada cold start; con Redis sobrevive entre invocaciones serverless.
import { randomUUID } from 'node:crypto';
import { kvGet, kvSet } from './redis.js';
import { listarOficios } from '../ai/cotizador.js';
import { listarProfesionales } from './config.js';

const CLAVE = 'trabajos:db';

export const ESTADOS_CITA = ['pendiente', 'confirmada', 'en_curso', 'completada', 'cancelada'];

let db = null; // caché en memoria dentro de una misma instancia tibia (warm start)
async function cargar() {
  if (db) return db;
  db = await kvGet(CLAVE);
  if (db) { db.clientes ??= []; db.citas ??= []; return db; }
  db = { clientes: [], citas: [], seq: 1 };
  sembrarDemo();
  await guardar();
  return db;
}
async function guardar() { await kvSet(CLAVE, db); }

const hoy = () => new Date();
const iso = (d) => d.toISOString();
const nuevoId = (pref) => `${pref}-${String(db.seq++).padStart(4, '0')}`;
const n = (s) => String(s ?? '').toLowerCase();

function hash(s) { let h = 0; s = String(s); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

// Webhook saliente opcional (Zapier/Make/Sheets), mismo patrón que el resto de la plataforma.
function notificarCRM(evento, datos) {
  const url = process.env.CRM_WEBHOOK_URL;
  if (!url) return;
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ evento, origen: 'mv-agendate-ia', datos })
  }).catch((err) => console.error('[crm-webhook] Error notificando:', err.message));
}

const demoVisitas = [];
export function notificarDemo(datos) {
  const v = { t: new Date().toISOString(), ...datos };
  demoVisitas.push(v);
  if (demoVisitas.length > 500) demoVisitas.splice(0, demoVisitas.length - 500);
  console.log(`[demo] ${v.canal || 'web'} · ${v.visitante || 'anon'} · restantes:${v.restantes} · "${String(v.detalle || '').slice(0, 60)}"`);
  notificarCRM('demo.visita', v);
}
export function resumenDemo() {
  return { total: demoVisitas.length, ultimas: demoVisitas.slice(-50).reverse() };
}

// Últimos N meses como ['YYYY-MM', ...] (más viejo → actual)
function ultimosMeses(n = 12) {
  const d = hoy(), out = [];
  for (let i = n - 1; i >= 0; i--) { const m = new Date(d.getFullYear(), d.getMonth() - i, 1); out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`); }
  return out;
}

// ---------- Demo seed (para que el dashboard y la agenda no arranquen vacíos) ----------
function sembrarDemo() {
  const oficios = listarOficios();
  const hace = (dias) => new Date(hoy().getTime() - dias * 86400000);
  const clientesDemo = [
    { nombre: 'María Fernández', telefono: '099 123 456', email: 'maria.fernandez@email.com', direccion: 'Av. Brasil 2450, Pocitos', lat: -34.9122, lng: -56.1490 },
    { nombre: 'Diego Rodríguez', telefono: '098 765 432', email: 'diego.rod@email.com', direccion: 'Bulevar Artigas 1120, Malvín', lat: -34.8965, lng: -56.1350 },
    { nombre: 'Lucía Methol', telefono: '091 234 567', email: 'lucia.methol@email.com', direccion: '18 de Julio 1830, Centro', lat: -34.9058, lng: -56.1889 },
    { nombre: 'Andrés Píriz', telefono: '094 888 111', email: 'andres.piriz@email.com', direccion: 'Rambla Williman, Punta del Este', lat: -34.9670, lng: -54.9500 },
    { nombre: 'Valentina Suárez', telefono: '099 555 222', email: 'valen.suarez@email.com', direccion: 'Sarandí 470, Ciudad Vieja', lat: -34.9070, lng: -56.2080 },
    { nombre: 'Gastón Techera', telefono: '092 700 900', email: 'gaston.techera@email.com', direccion: 'Ruta Interbalnearia km 22, Solymar', lat: -34.8100, lng: -55.9700 }
  ];
  for (const c of clientesDemo) db.clientes.push(normalizarCliente(c));

  const meses = ultimosMeses(12);
  let i = 0;
  for (const mes of meses) {
    const [y, m] = mes.split('-').map(Number);
    const cantidad = 3 + (hash(mes) % 5); // 3 a 7 trabajos por mes, determinístico
    for (let k = 0; k < cantidad; k++) {
      const cliente = clientesDemo[(i + k) % clientesDemo.length];
      const of = oficios[(i + k) % oficios.length];
      const trabajo = of.trabajos[(i + k) % of.trabajos.length];
      const dia = 3 + ((hash(mes + k) % 24));
      const fecha = new Date(y, m - 1, Math.min(dia, 27));
      const totalBase = 800 + (hash(mes + k + 'total') % 6000);
      db.citas.push({
        id: nuevoId('CITA'),
        clienteId: db.clientes[i % db.clientes.length].id,
        clienteNombre: cliente.nombre,
        profesionalId: 'default',
        oficio: of.clave,
        oficioNombre: of.nombre,
        trabajo: trabajo.clave,
        trabajoNombre: trabajo.nombre,
        fecha: fecha.toISOString().slice(0, 10),
        inicio: `${String(9 + (k % 8)).padStart(2, '0')}:00`,
        fin: `${String(10 + (k % 8)).padStart(2, '0')}:00`,
        direccion: cliente.direccion,
        direccionConfirmada: true,
        lat: cliente.lat,
        lng: cliente.lng,
        receptor: null,
        estado: 'completada',
        cotizacion: { mano_obra: Math.round(totalBase * 0.65), materiales: Math.round(totalBase * 0.2), traslado: Math.round(totalBase * 0.15), total: totalBase },
        canal: ['whatsapp', 'webchat', 'voz'][k % 3],
        creado: iso(fecha),
        actualizada: iso(fecha)
      });
    }
    i++;
  }
}

function normalizarCliente(c) {
  return {
    id: c.id || nuevoId('CLI'),
    nombre: c.nombre || '',
    telefono: c.telefono || '',
    email: c.email || '',
    direccion: c.direccion || '',
    lat: c.lat ?? null,
    lng: c.lng ?? null,
    receptorHabitual: c.receptorHabitual || null, // nombre de quien suele atender si no es el titular
    notas: c.notas || '',
    profesionalId: c.profesionalId || null, // qué profesional del equipo suele atenderlo (cuentas multi-profesional)
    creado: c.creado || iso(hoy())
  };
}

// ---------- Clientes ----------
export async function listarClientes() { await cargar(); return db.clientes; }
export async function obtenerCliente(id) { await cargar(); return db.clientes.find((c) => c.id === id) || null; }
export async function buscarClientePorTelefono(telefono) {
  await cargar();
  const t = String(telefono || '').replace(/[^\d]/g, '');
  return db.clientes.find((c) => String(c.telefono).replace(/[^\d]/g, '').endsWith(t.slice(-8))) || null;
}
export async function guardarCliente(c) {
  await cargar();
  const cli = normalizarCliente(c);
  const i = db.clientes.findIndex((x) => x.id === cli.id || (x.telefono && x.telefono === cli.telefono));
  if (i >= 0) { cli.id = db.clientes[i].id; cli.creado = db.clientes[i].creado; db.clientes[i] = { ...db.clientes[i], ...cli }; }
  else db.clientes.push(cli);
  await guardar();
  return cli;
}

/**
 * Confirma si la dirección del trabajo coincide con la que figura en la base
 * del cliente, o actualiza la dirección si cambió (lo pide el flujo del
 * agente antes de cerrar la cita — ver ai/agente.js).
 */
export async function confirmarDireccionCliente(clienteId, direccionInformada, lat, lng) {
  await cargar();
  const cli = db.clientes.find((c) => c.id === clienteId);
  if (!cli) return { ok: false, coincide: false, error: 'Cliente no encontrado.' };
  const coincide = !direccionInformada || n(direccionInformada) === n(cli.direccion);
  let cambio = false;
  if (!coincide && direccionInformada) { cli.direccion = direccionInformada; cambio = true; }
  // Actualiza las coordenadas si nos las pasaron (geocoding directo de un texto
  // nuevo, o ubicación nativa que compartió el cliente por WhatsApp) — incluso
  // si la dirección no cambió, sirve para completar coordenadas que faltaban.
  if (Number.isFinite(lat) && Number.isFinite(lng)) { cli.lat = lat; cli.lng = lng; cambio = true; }
  if (cambio) await guardar();
  return { ok: true, coincide, direccionEnBase: cli.direccion, lat: cli.lat, lng: cli.lng };
}

/** Asigna qué profesional del equipo atiende habitualmente a este cliente (cuentas multi-profesional). */
export async function asignarProfesionalCliente(clienteId, profesionalId) {
  await cargar();
  const cli = db.clientes.find((c) => c.id === clienteId);
  if (!cli) return { ok: false, error: 'Cliente no encontrado.' };
  cli.profesionalId = profesionalId || null;
  await guardar();
  return { ok: true, profesionalId: cli.profesionalId };
}

// ---------- Citas / trabajos ----------
export async function listarCitas(filtro = {}) {
  await cargar();
  let cs = db.citas;
  if (filtro.fecha) cs = cs.filter((c) => c.fecha === filtro.fecha);
  if (filtro.desde) cs = cs.filter((c) => c.fecha >= filtro.desde);
  if (filtro.hasta) cs = cs.filter((c) => c.fecha <= filtro.hasta);
  if (filtro.oficio) cs = cs.filter((c) => n(c.oficio) === n(filtro.oficio));
  if (filtro.estado) cs = cs.filter((c) => n(c.estado) === n(filtro.estado));
  if (filtro.clienteId) cs = cs.filter((c) => c.clienteId === filtro.clienteId);
  if (filtro.anio) cs = cs.filter((c) => c.fecha.slice(0, 4) === String(filtro.anio));
  if (filtro.mes) cs = cs.filter((c) => c.fecha.slice(0, 7) === filtro.mes);
  if (filtro.profesionalId) cs = cs.filter((c) => c.profesionalId === filtro.profesionalId);
  return cs.sort((a, b) => (a.fecha + a.inicio).localeCompare(b.fecha + b.inicio));
}
export async function citasDelDia(fecha) { return listarCitas({ fecha }); }
export async function obtenerCita(id) { await cargar(); return db.citas.find((c) => c.id === id) || null; }

export async function crearCita(datos) {
  await cargar();
  let cliente = datos.clienteId ? db.clientes.find((c) => c.id === datos.clienteId) : null;
  if (!cliente && datos.telefono) cliente = db.clientes.find((c) => c.telefono === datos.telefono);
  if (!cliente) {
    cliente = normalizarCliente({ nombre: datos.clienteNombre, telefono: datos.telefono, direccion: datos.direccion, lat: datos.lat, lng: datos.lng });
    db.clientes.push(cliente);
  } else if (Number.isFinite(datos.lat) && Number.isFinite(datos.lng)) {
    // Mantiene al cliente con la última ubicación conocida, para reusarla en
    // el siguiente trabajo sin tener que volver a geocodificar.
    cliente.lat = datos.lat;
    cliente.lng = datos.lng;
  }
  const lat = Number.isFinite(datos.lat) ? datos.lat : cliente.lat;
  const lng = Number.isFinite(datos.lng) ? datos.lng : cliente.lng;
  // Profesional del equipo que atiende (cuentas multi-profesional): si no se
  // especifica, cae en el único configurado (o el primero de la lista).
  const profesionalId = datos.profesionalId || listarProfesionales()[0]?.id || 'default';
  const cita = {
    id: nuevoId('CITA'),
    clienteId: cliente.id,
    clienteNombre: cliente.nombre,
    profesionalId,
    oficio: datos.oficio,
    oficioNombre: datos.oficioNombre || datos.oficio,
    trabajo: datos.trabajo,
    trabajoNombre: datos.trabajoNombre || datos.trabajo,
    fecha: datos.fecha,
    inicio: datos.inicio,
    fin: datos.fin,
    direccion: datos.direccion || cliente.direccion,
    direccionConfirmada: !!datos.direccionConfirmada,
    lat: lat ?? null,
    lng: lng ?? null,
    receptor: datos.receptor || null, // nombre de quien atiende si no es el titular
    estado: 'confirmada',
    cotizacion: datos.cotizacion || null,
    canal: datos.canal || 'webchat',
    creado: iso(hoy()),
    actualizada: iso(hoy())
  };
  db.citas.push(cita);
  await guardar();
  notificarCRM('cita.confirmada', cita);
  return cita;
}

/**
 * Agenda de un día en el formato que necesita el motor de traslados
 * (store/agenda.js#proponerHorarios): citas ordenadas con su ubicación, para
 * calcular el viaje real hacia y desde cada hueco disponible. Excluye citas
 * canceladas y las que todavía no tienen coordenadas (no se puede estimar su
 * traslado, mejor no asumir 0).
 */
export async function agendaDelDiaConUbicacion(fecha, excluirCitaId, profesionalId) {
  const cs = await citasDelDia(fecha);
  return cs
    .filter((c) => c.estado !== 'cancelada' && c.id !== excluirCitaId && Number.isFinite(c.lat) && Number.isFinite(c.lng)
      && (!profesionalId || c.profesionalId === profesionalId))
    .map((c) => ({ inicio: c.inicio, fin: c.fin, ubicacion: { lat: c.lat, lng: c.lng } }));
}

export async function cambiarEstadoCita(id, estado) {
  await cargar();
  if (!ESTADOS_CITA.includes(estado)) return { ok: false, error: `Estado inválido. Opciones: ${ESTADOS_CITA.join(', ')}` };
  const c = db.citas.find((x) => x.id === id);
  if (!c) return { ok: false, error: 'Cita no encontrada.' };
  c.estado = estado;
  c.actualizada = iso(hoy());
  await guardar();
  return { ok: true, cita: c };
}

export async function registrarReceptor(id, nombreReceptor) {
  await cargar();
  const c = db.citas.find((x) => x.id === id);
  if (!c) return { ok: false, error: 'Cita no encontrada.' };
  c.receptor = nombreReceptor || null;
  await guardar();
  return { ok: true, cita: c };
}

// ---------- Dashboard ----------
export async function opcionesFiltros() {
  await cargar();
  const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort();
  return {
    oficios: uniq(db.citas.map((c) => c.oficio)),
    anios: uniq(db.citas.map((c) => c.fecha.slice(0, 4))),
    estados: ESTADOS_CITA
  };
}

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** Resumen general: trabajos por oficio/estado, por día de semana, y facturación. */
export async function resumenDashboard(f = {}) {
  await cargar();
  const cs = await listarCitas(f);
  const completadas = cs.filter((c) => c.estado === 'completada');
  const cont = (campo) => cs.reduce((m, c) => { const k = c[campo] || 's/d'; m[k] = (m[k] || 0) + 1; return m; }, {});
  const porDiaSemana = DIAS_SEMANA.map((nombre, idx) => ({
    dia: nombre,
    cantidad: cs.filter((c) => new Date(c.fecha + 'T12:00:00').getDay() === idx).length
  }));
  const facturado = (arr) => arr.reduce((a, c) => a + (c.cotizacion?.total || 0), 0);
  return {
    total: cs.length,
    por_oficio: cont('oficioNombre'),
    por_estado: cont('estado'),
    por_dia_semana: porDiaSemana,
    sueldo_total: facturado(completadas),
    ticket_promedio: completadas.length ? Math.round(facturado(completadas) / completadas.length) : 0,
    completadas: completadas.length,
    canceladas: cs.filter((c) => c.estado === 'cancelada').length
  };
}

/** Evolución mensual (12 meses): cantidad de trabajos y facturación, para comparar mes a mes / año a año. */
export async function serieMensual(f = {}) {
  await cargar();
  const meses = ultimosMeses(12);
  const idsFiltrados = new Set((await listarCitas({ oficio: f.oficio, estado: f.estado, profesionalId: f.profesionalId })).map((c) => c.id));
  const usarFiltro = !!(f.oficio || f.estado || f.profesionalId);
  const cant = Object.fromEntries(meses.map((m) => [m, 0]));
  const fact = Object.fromEntries(meses.map((m) => [m, 0]));
  for (const c of db.citas) {
    const mes = c.fecha.slice(0, 7);
    if (!(mes in cant)) continue;
    if (usarFiltro && !idsFiltrados.has(c.id)) continue;
    cant[mes] += 1;
    if (c.estado === 'completada') fact[mes] += c.cotizacion?.total || 0;
  }
  return {
    meses,
    trabajos: meses.map((m) => cant[m]),
    facturacion: meses.map((m) => fact[m]),
    total_trabajos: Object.values(cant).reduce((a, b) => a + b, 0),
    total_facturado: Object.values(fact).reduce((a, b) => a + b, 0)
  };
}

/** Evolución anual: totales por año calendario, para comparar año contra año. */
export async function serieAnual(f = {}) {
  await cargar();
  const todas = f.profesionalId ? db.citas.filter((c) => c.profesionalId === f.profesionalId) : db.citas;
  const anios = [...new Set(todas.map((c) => c.fecha.slice(0, 4)))].sort();
  return anios.map((anio) => {
    const cs = todas.filter((c) => c.fecha.slice(0, 4) === anio);
    const completadas = cs.filter((c) => c.estado === 'completada');
    return { anio, trabajos: cs.length, facturado: completadas.reduce((a, c) => a + (c.cotizacion?.total || 0), 0) };
  });
}

export { DIAS_SEMANA };
