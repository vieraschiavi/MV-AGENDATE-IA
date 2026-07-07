// MV Agendate IA — servidor principal
// Chatbot/ChatVoice con IA que cotiza y agenda trabajos de cualquier oficio,
// optimizando traslados y descansos, + CRM y dashboards del profesional.
import express from 'express';
import { randomUUID } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { conversar, enModoDemo, listarOficios } from './ai/agente.js';
import { cotizar } from './ai/cotizador.js';
import { geocodificar, geocodificarInverso } from './ai/geocoding.js';
import { proponerHorarios } from './store/agenda.js';
import { revisarYAvisarAgendaDelDia } from './channels/aviso-retraso.js';
import { getConfigPublico, setConfig, get as cfg, listarProfesionales, guardarProfesionales, profesionalesGuardados } from './store/config.js';
import { demoLimitada, consumirUso, usosRestantes, mensajeLimite } from './store/demo.js';
import * as trabajos from './store/trabajos.js';
import { fichaCitaHTML, agendaCSV, agendaExcelHTML, clientesCSV, clientesExcelHTML } from './exports/documentos.js';
import { resumenUso, catalogoConEstado } from './store/uso.js';
import * as lic from './store/licencias.js';
import {
  crearPreferencia, consultarPago, mercadopagoActivo,
  planRecurrente, consultarPreapproval, consultarPagoRecurrente
} from './store/mercadopago.js';
import * as suscripciones from './store/suscripciones.js';
import { existsSync } from 'node:fs';
import whatsapp, { enviarWhatsApp, probarConexion as probarConexionWhatsapp } from './channels/whatsapp.js';
import * as tw from './store/twilio.js';
import voz from './channels/voz.js';
import vozPremium, { montarVozPremium } from './channels/voz-premium.js';
import { piperDisponible, sintetizarWav } from './channels/tts-piper.js';
import { checkBotId } from 'botid/server';
import { iniciarChequeoLicencia, iaHabilitada, motivoSuspension } from './store/estadoLicencia.js';

// Protección antibots (Vercel BotID) para los endpoints públicos más caros/abusables
// (Claude, checkout). Sólo funciona desplegado en Vercel; si falla la verificación
// (local, u otro entorno) no bloqueamos — fail-open.
async function esBot(req) {
  const origin = req.headers.origin;
  const propio = `${req.protocol}://${req.headers.host}`;
  if (origin && origin !== propio) return false;
  try {
    const v = await checkBotId();
    return v.isBot === true;
  } catch (e) {
    console.warn('[botid] verificación no disponible (¿fuera de Vercel?):', e.message);
    return false;
  }
}

const here = dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', true);

// CORS abierto para la app Android (APK) y el widget embebido en sitios de terceros
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false })); // webhooks de Twilio llegan como form-encoded
app.use(express.static(join(here, '../public')));
app.use('/movil', express.static(join(here, '../movil'))); // app Android (PWA instalable)

const visitante = (req) => req.headers['x-visitor-id'] || req.body?.sessionId || req.ip || 'anon';

// --- Canal webchat (usado por la landing y la demo) ---
app.post('/api/chat', async (req, res) => {
  if (await esBot(req)) return res.status(403).json({ error: 'Acceso denegado.' });
  if (!iaHabilitada()) return res.status(402).json({ error: motivoSuspension() });
  const { mensaje, sessionId } = req.body ?? {};
  if (!mensaje || typeof mensaje !== 'string') {
    return res.status(400).json({ error: 'Falta el campo "mensaje".' });
  }
  const sid = sessionId || `web:${randomUUID()}`;
  if (demoLimitada() && !enModoDemo()) {
    const c = consumirUso(visitante(req));
    if (!c.permitido) return res.json({ respuesta: mensajeLimite(), sessionId: sid, demo: false, limiteAlcanzado: true, restantes: 0 });
    res.locals.restantes = c.restantes;
    trabajos.notificarDemo({ canal: 'chat', visitante: visitante(req), restantes: c.restantes, detalle: mensaje });
  }
  try {
    const respuesta = await conversar(sid, mensaje.slice(0, 2000), 'webchat');
    res.json({ respuesta, sessionId: sid, demo: enModoDemo(), restantes: res.locals.restantes });
  } catch (err) {
    console.error('[api/chat]', err);
    res.status(500).json({ error: 'Error interno del agente.' });
  }
});

// --- Cotizador (formulario directo, sin pasar por el chat) ---
app.get('/api/oficios', (_req, res) => res.json(listarOficios()));
app.post('/api/cotizar', (req, res) => {
  const r = cotizar({ oficio: cfg('oficioProfesional') || undefined, ...req.body });
  res.status(r.error ? 400 : 200).json(r);
});

// --- Geocoding gratuito (Nominatim/OSM): dirección de texto ↔ coordenadas ---
app.get('/api/geocoding', async (req, res) => {
  const r = await geocodificar(req.query.direccion);
  res.status(r.ok ? 200 : 400).json(r);
});
app.get('/api/geocoding/inverso', async (req, res) => {
  const r = await geocodificarInverso(Number(req.query.lat), Number(req.query.lng));
  res.status(r.ok ? 200 : 400).json(r);
});

// --- Motor de agenda: horarios propuestos considerando traslados y descansos ---
app.post('/api/agenda/proponer', (req, res) => {
  const r = proponerHorarios(req.body ?? {});
  res.json(r);
});

// --- Voz del profesional (TTS) — Piper es_AR-daniela (rioplatense, gratis). ---
app.get('/api/voz/estado', (_req, res) => res.json({ disponible: piperDisponible(), voz: 'es_AR-daniela (rioplatense)' }));
app.get('/api/voz', async (req, res) => {
  const texto = String(req.query?.texto || '').slice(0, 900).trim();
  if (!texto) return res.status(400).json({ error: 'Falta el parámetro texto.' });
  if (!piperDisponible()) return res.status(503).json({ error: 'La voz Piper no está instalada. Ejecutá promo/instalar-voz.sh' });
  try {
    const wav = await sintetizarWav(texto);
    res.set('Content-Type', 'audio/wav');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(wav);
  } catch (e) { res.status(500).json({ error: 'No pude generar la voz: ' + e.message }); }
});

// --- Buzón de contacto ---
const contactos = [];
app.post('/api/contacto', async (req, res) => {
  if (await esBot(req)) return res.status(403).json({ error: 'Acceso denegado.' });
  const b = req.body ?? {};
  const asunto = String(b.asunto || '').slice(0, 200).trim();
  const pregunta = String(b.pregunta || '').slice(0, 4000).trim();
  if (!asunto || !pregunta) return res.status(400).json({ ok: false, error: 'Falta asunto o pregunta.' });
  const item = {
    id: randomUUID(), fecha: new Date().toISOString(),
    nombre: String(b.nombre || '').slice(0, 120), email: String(b.email || '').slice(0, 160),
    telefono: String(b.telefono || '').slice(0, 60), asunto, pregunta,
  };
  contactos.push(item);
  console.log(`[contacto] ${item.nombre || 's/nombre'} <${item.email || 's/mail'}> tel:${item.telefono || '-'} | ${asunto}`);
  res.json({ ok: true, id: item.id, destino: 'vieraschiavi@gmail.com' });
});
app.get('/api/contacto', soloAdmin, (_req, res) => res.json({ ok: true, total: contactos.length, contactos }));

// --- Visitas del demo (admin): total + últimas, para monitorear el uso/gasto ---
app.get('/api/demo/visitas', soloAdmin, (_req, res) => res.json(trabajos.resumenDemo()));
app.get('/api/demo-estado', (req, res) => {
  res.json({ demoLimitada: demoLimitada(), restantes: usosRestantes(visitante(req)) });
});

// --- Zona admin: con una clave configurada exige X-Admin-Key; sin ella queda
// abierta solo en local (primer arranque/demo). ---
function soloAdmin(req, res, next) {
  const clave = cfg('adminKey');
  if (clave) {
    if (req.headers['x-admin-key'] === clave) return next();
    return res.status(401).json({ error: 'Clave de administración inválida.' });
  }
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    return res.status(401).json({ error: 'Panel deshabilitado: configurá ADMIN_KEY.' });
  }
  return next();
}

// --- Configuración del profesional (oficio, nombre, jornada, canales, API key) ---
app.get('/api/config', soloAdmin, (_req, res) => res.json(getConfigPublico()));
app.post('/api/config', soloAdmin, (req, res) => {
  try {
    res.json({ ok: true, config: setConfig(req.body ?? {}), demo: enModoDemo() });
  } catch (err) {
    console.error('[api/config]', err);
    res.status(500).json({ ok: false, error: 'No pude guardar la configuración.' });
  }
});

// ==================== Telefonía (ChatVoice) y WhatsApp: autoconfiguración ====================
const dominioPropio = (req) => `${req.protocol}://${req.headers['x-forwarded-host'] || req.headers.host}`;

app.get('/api/telefonia/numeros-disponibles', soloAdmin, async (req, res) => {
  const r = await tw.numerosDisponibles(String(req.query.pais || 'UY').toUpperCase());
  res.status(r.ok ? 200 : 400).json(r);
});
app.get('/api/telefonia/mis-numeros', soloAdmin, async (_req, res) => {
  const r = await tw.misNumeros();
  res.status(r.ok ? 200 : 400).json(r);
});
app.post('/api/telefonia/comprar-numero', soloAdmin, async (req, res) => {
  const numero = String(req.body?.numero || '').trim();
  if (!numero) return res.status(400).json({ ok: false, error: 'Falta el número a comprar.' });
  const r = await tw.comprarNumero(numero, dominioPropio(req));
  res.status(r.ok ? 200 : 400).json(r);
});
app.post('/api/telefonia/reapuntar-webhook', soloAdmin, async (req, res) => {
  const sid = String(req.body?.sid || '').trim();
  if (!sid) return res.status(400).json({ ok: false, error: 'Falta el SID del número.' });
  const r = await tw.configurarWebhook(sid, dominioPropio(req));
  res.status(r.ok ? 200 : 400).json(r);
});
app.post('/api/telefonia/llamar-prueba', soloAdmin, async (req, res) => {
  const telefono = String(req.body?.telefono || '').trim();
  if (!telefono) return res.status(400).json({ ok: false, error: 'Falta el teléfono a llamar.' });
  const r = await tw.llamarPrueba(telefono, dominioPropio(req));
  res.status(r.ok ? 200 : 400).json(r);
});

app.get('/api/whatsapp/probar', soloAdmin, async (_req, res) => {
  const r = await probarConexionWhatsapp();
  res.status(r.ok ? 200 : 400).json(r);
});

// Chequeo de retrasos: compara el fin estimado del trabajo en curso contra la
// próxima cita del día y, si hay 30+ minutos de demora, avisa por WhatsApp al
// próximo cliente. En local corre solo (setInterval más abajo); en Vercel
// (serverless, sin procesos de fondo) hace falta un Cron Job que llame a este
// endpoint cada 5-10 min (ver vercel.json → "crons").
app.post('/api/agenda/chequear-retrasos', soloAdmin, async (_req, res) => {
  const avisos = await chequearRetrasosDeHoy();
  res.json({ ok: true, avisos });
});
// Variante GET para el Cron Job de Vercel (crons.json solo puede invocar GET).
// Vercel agrega automáticamente "Authorization: Bearer $CRON_SECRET" si esa env
// está configurada; si no está seteada, no exigimos nada (uso local/manual).
app.get('/api/agenda/chequear-retrasos', async (req, res) => {
  const secreto = process.env.CRON_SECRET;
  if (secreto && req.headers.authorization !== `Bearer ${secreto}`) return res.status(401).json({ ok: false, error: 'No autorizado.' });
  const avisos = await chequearRetrasosDeHoy();
  res.json({ ok: true, avisos });
});

async function chequearRetrasosDeHoy() {
  const hoyStr = new Date().toISOString().slice(0, 10);
  const citas = await trabajos.citasDelDia(hoyStr);
  const conUbicacion = citas.map((c) => ({
    ...c,
    finEstimado: new Date(`${c.fecha}T${c.fin}:00`),
    inicioPactado: new Date(`${c.fecha}T${c.inicio}:00`),
    ubicacion: { lat: c.lat, lng: c.lng }
  }));
  return revisarYAvisarAgendaDelDia(conUbicacion, enviarWhatsApp);
}

// ==================== Agenda / clientes / dashboard ====================
const profesionalOpts = () => ({ agencia: cfg('agenciaNombre') || cfg('nombreProfesional') || 'MV Agendate IA', telefono: cfg('agenciaTelefono') || '', logo: cfg('logoUrl') || '/logo-mv.svg' });

// Citas
app.get('/api/citas', async (req, res) => res.json(await trabajos.listarCitas(req.query ?? {})));
app.get('/api/citas/dia/:fecha', async (req, res) => res.json(await trabajos.citasDelDia(req.params.fecha)));
app.get('/api/citas/:id', async (req, res) => { const c = await trabajos.obtenerCita(req.params.id); res.status(c ? 200 : 404).json(c || { error: 'No encontrada' }); });
app.post('/api/citas', soloAdmin, async (req, res) => {
  const datos = { ...req.body };
  if (datos.direccion && !Number.isFinite(datos.lat)) {
    const geo = await geocodificar(datos.direccion);
    if (geo.ok) { datos.lat = geo.lat; datos.lng = geo.lng; }
  }
  res.json({ ok: true, cita: await trabajos.crearCita(datos) });
});
app.post('/api/citas/:id/estado', soloAdmin, async (req, res) => { const r = await trabajos.cambiarEstadoCita(req.params.id, req.body?.estado); res.status(r.ok ? 200 : 400).json(r); });
app.post('/api/citas/:id/receptor', soloAdmin, async (req, res) => { const r = await trabajos.registrarReceptor(req.params.id, req.body?.nombreReceptor); res.status(r.ok ? 200 : 400).json(r); });
app.get('/api/citas/:id/ficha', async (req, res) => {
  const c = await trabajos.obtenerCita(req.params.id); if (!c) return res.status(404).send('No encontrada');
  res.type('html').send(fichaCitaHTML(c, profesionalOpts()));
});

// Clientes
app.get('/api/clientes', async (_req, res) => res.json(await trabajos.listarClientes()));
app.get('/api/cliente/:id', async (req, res) => { const c = await trabajos.obtenerCliente(req.params.id); res.status(c ? 200 : 404).json(c || { error: 'No encontrado' }); });
app.post('/api/cliente', soloAdmin, async (req, res) => res.json({ ok: true, cliente: await trabajos.guardarCliente(req.body ?? {}) }));
app.post('/api/cliente/:id/confirmar-direccion', async (req, res) => {
  const direccionInformada = req.body?.direccionInformada;
  let lat, lng;
  if (direccionInformada) {
    const geo = await geocodificar(direccionInformada);
    if (geo.ok) { lat = geo.lat; lng = geo.lng; }
  }
  res.json(await trabajos.confirmarDireccionCliente(req.params.id, direccionInformada, lat, lng));
});
app.post('/api/cliente/:id/profesional', soloAdmin, async (req, res) => {
  res.json(await trabajos.asignarProfesionalCliente(req.params.id, req.body?.profesionalId));
});

// Dashboard (con filtros: oficio, estado, año, mes, fecha)
app.get('/api/dashboard', async (req, res) => res.json(await trabajos.resumenDashboard(req.query ?? {})));
app.get('/api/dashboard/serie', async (req, res) => res.json(await trabajos.serieMensual(req.query ?? {})));
app.get('/api/dashboard/serie-anual', async (req, res) => res.json(await trabajos.serieAnual(req.query ?? {})));
app.get('/api/dashboard/filtros', async (_req, res) => res.json({ ...(await trabajos.opcionesFiltros()), profesionales: listarProfesionales() }));

// Equipo de profesionales de la cuenta (estudios con varios trabajadores, ej. 3
// electricistas): lectura pública (para poblar selectores en agenda/clientes/
// dashboards) y escritura admin.
app.get('/api/profesionales', (req, res) => res.json(req.query.raw ? profesionalesGuardados() : listarProfesionales()));
app.post('/api/profesionales', soloAdmin, (req, res) => {
  const lista = Array.isArray(req.body?.profesionales) ? req.body.profesionales : [];
  res.json({ ok: true, profesionales: guardarProfesionales(lista) });
});

// Exportación de la agenda y de la base de clientes (Excel/CSV), con los mismos filtros del dashboard.
app.get('/api/agenda.csv', async (req, res) => res.type('text/csv').attachment('agenda.csv').send(agendaCSV(await trabajos.listarCitas(req.query ?? {}))));
app.get('/api/agenda.xls', async (req, res) => {
  res.setHeader('Content-Type', 'application/vnd.ms-excel');
  res.setHeader('Content-Disposition', 'attachment; filename="agenda.xls"');
  res.send(agendaExcelHTML(await trabajos.listarCitas(req.query ?? {})));
});
app.get('/api/clientes.csv', async (_req, res) => res.type('text/csv').attachment('clientes.csv').send(clientesCSV(await trabajos.listarClientes())));
app.get('/api/clientes.xls', async (_req, res) => {
  res.setHeader('Content-Type', 'application/vnd.ms-excel');
  res.setHeader('Content-Disposition', 'attachment; filename="clientes.xls"');
  res.send(clientesExcelHTML(await trabajos.listarClientes()));
});

// Panel del profesional: agenda de hoy + visitas de la demo
app.get('/api/panel', soloAdmin, async (_req, res) => {
  const hoyStr = new Date().toISOString().slice(0, 10);
  res.json({ hoy: await trabajos.citasDelDia(hoyStr), demo: trabajos.resumenDemo() });
});

// --- Uso de APIs (tokens) y catálogo de servicios/costos ---
app.get('/api/uso', soloAdmin, (_req, res) => res.json(resumenUso()));
app.get('/api/tokens/catalogo', (_req, res) => res.json(catalogoConEstado()));

// ==================== Compra / pagos / licencias / descarga ====================
app.get('/api/planes', (_req, res) => res.json({ planes: lic.PLANES, medios: lic.MEDIOS, mercadopago: mercadopagoActivo() }));
app.post('/api/comprar', async (req, res) => {
  if (await esBot(req)) return res.status(403).json({ error: 'Acceso denegado.' });
  const r = lic.crearPedido(req.body ?? {});
  if (!r.ok) return res.status(400).json(r);
  if (r.pedido.medio === 'mercadopago' && mercadopagoActivo()) {
    if (r.pedido.recurrente) {
      const plan = await planRecurrente(r.pedido.plan, r.pedido.total_usd);
      if (plan.ok) return res.json({ ...r, init_point: plan.init_point, recurrente: true });
      return res.json({ ...r, aviso_pago: plan.error });
    }
    const base = `${req.protocol}://${req.get('host')}`;
    const pref = await crearPreferencia(r.pedido, base);
    if (pref.ok) return res.json({ ...r, init_point: pref.init_point });
    return res.json({ ...r, aviso_pago: pref.error });
  }
  res.json(r);
});

async function procesarPreapproval(pre) {
  if (!pre?.id) return;
  let licencia = await suscripciones.buscarLicenciaPorPreapproval(pre.id);
  if (!licencia) {
    const pedido = lic.buscarPedidoPendientePorEmail(pre.payer_email, pre.external_reference || undefined);
    if (pedido) {
      const confirmado = lic.confirmarPago(pedido.id);
      if (confirmado.ok) {
        licencia = confirmado.pedido.licencia;
        await suscripciones.vincularPreapproval(pre.id, licencia);
      }
    }
  }
  if (!licencia) { console.warn('[mercadopago webhook] preapproval sin pedido asociado:', pre.id, pre.payer_email); return; }
  const estado = pre.status === 'authorized' ? 'activo' : (pre.status === 'paused' ? 'pausado' : 'cancelado');
  await suscripciones.guardarSuscripcion(licencia, { estado, preapprovalId: pre.id, plan: pre.reason });
}

app.post('/api/pago/mercadopago', async (req, res) => {
  try {
    const tipo = req.body?.type || req.query?.type || req.body?.topic || req.query?.topic;
    const dataId = req.body?.data?.id || req.query['data.id'] || req.query.id;
    if (tipo === 'payment' && dataId) {
      const pago = await consultarPago(dataId);
      if (pago && pago.status === 'approved' && pago.external_reference) lic.confirmarPago(pago.external_reference);
    } else if ((tipo === 'preapproval' || tipo === 'subscription_preapproval') && dataId) {
      const pre = await consultarPreapproval(dataId);
      if (pre) await procesarPreapproval(pre);
    } else if (tipo === 'subscription_authorized_payment' && dataId) {
      const pago = await consultarPagoRecurrente(dataId);
      if (pago?.preapproval_id) {
        const licencia = await suscripciones.buscarLicenciaPorPreapproval(pago.preapproval_id);
        if (licencia) {
          const ok = pago.status === 'processed' || pago.status === 'approved';
          await suscripciones.guardarSuscripcion(licencia, { estado: ok ? 'activo' : 'pago_fallido' });
        }
      }
    }
  } catch (e) { console.error('[mercadopago webhook]', e.message); }
  res.sendStatus(200);
});

app.get('/api/licencia/estado', async (req, res) => {
  const licencia = String(req.query.licencia || '').trim();
  if (!licencia) return res.status(400).json({ ok: false, error: 'Falta la licencia.' });
  const s = await suscripciones.obtenerSuscripcion(licencia);
  if (!s) return res.json({ ok: true, gestionada: false, activo: true });
  res.json({ ok: true, gestionada: true, activo: s.estado === 'activo', estado: s.estado, plan: s.plan });
});
app.get('/api/pedido/:id', (req, res) => {
  const p = lic.obtenerPedido(req.params.id);
  if (!p) return res.status(404).json({ ok: false, error: 'No existe' });
  res.json({
    ok: true, estado: p.estado, token: p.token, licencia: p.licencia, version: p.version,
    plan: p.plan, planNombre: lic.PLANES[p.plan]?.nombre, total_usd: p.total_usd, medio: p.medio, nombre: p.nombre
  });
});
app.post('/api/pago/confirmar', soloAdmin, (req, res) => { const r = lic.confirmarPago(req.body?.id); res.status(r.ok ? 200 : 400).json(r); });
app.get('/api/licencias', soloAdmin, (_req, res) => res.json(lic.listarPedidos()));
app.post('/api/descarga/generar', soloAdmin, (req, res) => {
  const version = String(req.body?.version || 'pc');
  const token = lic.firmarDescarga(version, Number(req.body?.dias) || 30);
  res.json({ ok: true, version, token, url: `/descargar/${token}` });
});
app.get('/descargar/:token', (req, res) => {
  const conEstado = lic.validarToken(req.params.token);
  const sinEstado = conEstado ? null : lic.verificarDescarga(req.params.token);
  const version = conEstado?.version || sinEstado?.version;
  if (!version) return res.status(403).send('Descarga no habilitada. Verificá que el pago esté confirmado.');
  const nombre = lic.archivoDeVersion(version);
  const candidatos = [join(here, '../descargas', nombre), join(here, '../dist', nombre)];
  const archivo = candidatos.find((f) => existsSync(f));
  if (!archivo) return res.status(503).send('El paquete aún no está disponible. En el servidor: bash empaquetar.sh');
  res.download(archivo, `MV-Agendate-IA-${version}.zip`);
});

// --- Canales externos ---
app.use(whatsapp);   // GET/POST /webhook/whatsapp
app.use(voz);        // POST /webhook/voz y /webhook/voz/turno (vía rápida)
app.use(vozPremium); // POST /webhook/voz-premium (pipeline ASR+TTS) + WS /voz-stream

app.get('/salud', (_req, res) => res.json({ ok: true, demo: enModoDemo() }));

function ipsLocales() {
  const ifaces = networkInterfaces();
  const ips = [];
  for (const nombre of Object.keys(ifaces)) {
    for (const iface of ifaces[nombre] || []) {
      if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address);
    }
  }
  return ips;
}

export default app;

const PORT = process.env.PORT || 3000;
if (process.env.VERCEL) {
  console.log('MV Agendate IA — modo serverless (Vercel). Recordá configurar un Cron Job (vercel.json) → GET /api/agenda/chequear-retrasos cada 5-10 min.');
} else {
  iniciarChequeoLicencia();
  // Chequeo periódico de retrasos (solo tiene sentido corriendo localmente/PC; en
  // Vercel no hay procesos de fondo, por eso el mismo chequeo también existe
  // como endpoint HTTP más arriba, para dispararlo desde un Cron Job).
  const intervaloRetrasos = setInterval(() => { chequearRetrasosDeHoy().catch((e) => console.error('[aviso-retraso]', e.message)); }, 5 * 60 * 1000);
  intervaloRetrasos.unref?.();

  const server = app.listen(PORT, () => {
    console.log(`\n🛠️  MV Agendate IA escuchando en http://localhost:${PORT}`);
    console.log(`   Modo: ${enModoDemo() ? 'DEMO (sin API key — cargala en /config.html)' : 'IA real (Claude)'}`);
    console.log('   Configuración/API key: /config.html');
    console.log('   Landing:  /            Demo chat+voz: /demo.html      Panel: /panel.html');
    console.log('   Webhooks: /webhook/whatsapp  /webhook/voz  /webhook/voz-premium');
    const ips = ipsLocales();
    if (ips.length) {
      console.log('\n   📱 Para usar la app en el CELULAR (sin instalar nada), conectá el teléfono');
      console.log('      a la MISMA red Wi-Fi y abrí en Chrome del celular:');
      for (const ip of ips) console.log(`        →  http://${ip}:${PORT}/movil`);
      console.log('      Luego menú ⋮ → "Agregar a pantalla de inicio" y queda como app.');
    }
    montarVozPremium(server);
    console.log();
  });
}
