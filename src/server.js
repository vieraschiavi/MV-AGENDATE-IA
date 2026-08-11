// MV Agendate IA — servidor principal
// Chatbot/ChatVoice con IA que cotiza y agenda trabajos de cualquier oficio,
// optimizando traslados y descansos, + CRM y dashboards del profesional.
import express from 'express';
import { randomUUID } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { conversar, enModoDemo, listarOficios } from './ai/agente.js';
import { responderAyuda } from './ai/ayuda.js';
import { cotizar, monedaActiva, oficiosActivos } from './ai/cotizador.js';
import { sugerirPrecios } from './ai/precios.js';
import { estimarImpuestos } from './ai/impuestos.js';
import { listarPaises } from './data/paises.js';
import { geocodificar, geocodificarInverso } from './ai/geocoding.js';
import { proponerHorarios } from './store/agenda.js';
import { revisarYAvisarAgendaDelDia } from './channels/aviso-retraso.js';
import { getConfigPublico, setConfig, get as cfg, listarProfesionales, guardarProfesionales, normalizarProfesionales, profesionalesGuardados } from './store/config.js';
import { demoLimitada, consumirUso, usosRestantes, mensajeLimite } from './store/demo.js';
import * as trabajos from './store/trabajos.js';
import * as cuentas from './store/cuentas.js';
import * as cotizaciones from './store/cotizaciones.js';
import { estadoPrueba, pruebaBloqueada, activarLicencia } from './store/prueba.js';
import { estadoCreditos, acreditar, bonoBienvenida, PACKS as PACKS_CREDITOS } from './store/creditos.js';
import * as emails from './store/emails.js';
import * as resenas from './store/resenas.js';
import { runConCuenta, runConDemoPais, runConDemoIdioma } from './store/contextoCuenta.js';
import { obtenerOverrides, guardarOverrides, configPublicaCuenta } from './store/configCuentas.js';
import { fichaCitaHTML, agendaCSV, agendaExcelHTML, clientesCSV, clientesExcelHTML } from './exports/documentos.js';
import { resumenUso, catalogoConEstado } from './store/uso.js';
import * as lic from './store/licencias.js';
import {
  crearPreferencia, crearPreferenciaCreditos, consultarPago, mercadopagoActivo,
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
import { limitar } from './store/limites.js';
import { escucharEnPuertoLibre, abrirNavegador } from './arranque.js';

// Protección antibots (Vercel BotID) para los endpoints públicos más caros/abusables
// (Claude, checkout). Sólo funciona desplegado en Vercel; si falla la verificación
// (local, u otro entorno) no bloqueamos — fail-open.
async function esBot(req) {
  const origin = req.headers.origin;
  const propio = `${req.protocol}://${req.headers.host}`;
  if (origin && origin !== propio) return false;
  // CLAVE: solo verificamos si la página cargó el SDK de BotID (manda el
  // header 'x-is-human'). Sin él, checkBotId marcaría "bot" a CUALQUIER
  // usuario real (p. ej. el registro desde la app o una reseña desde la
  // landing, páginas sin el SDK). Fail-open para no bloquear gente de verdad.
  if (!req.headers['x-is-human']) return false;
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false })); // webhooks de Twilio llegan como form-encoded
app.use(express.static(join(here, '../public')));
app.use('/movil', express.static(join(here, '../movil'))); // app Android (PWA instalable)

// --- Modo SaaS multi-cliente: resolución de cuenta por token ---
// Con "Authorization: Bearer <token de /api/auth/login>" cada request opera
// sobre los datos AISLADOS de esa cuenta; sin token (o con token inválido)
// todo cae en la cuenta 'default' — el modo single-tenant descargable sigue
// funcionando exactamente igual que siempre. Nota: el Bearer del cron de
// Vercel (CRON_SECRET) no es un JWT válido, así que no interfiere.
app.use(async (req, _res, next) => {
  const auth = String(req.headers.authorization || '');
  const sesion = auth.startsWith('Bearer ') ? cuentas.verificarToken(auth.slice(7)) : null;
  req.cuentaId = sesion?.cuentaId || 'default';
  req.cuentaEmail = sesion?.email || '';
  if (req.cuentaId === 'default') return next();
  // Fase 2: el resto del request corre con la configuración PROPIA de la
  // cuenta (oficio, país/moneda, precios, horarios, credenciales) superpuesta
  // a la global — cotizador, agente y agenda la resuelven solos vía contexto.
  const overrides = await obtenerOverrides(req.cuentaId).catch(() => ({}));
  runConCuenta(req.cuentaId, overrides, next);
});

// --- Candado de la prueba gratis (solo copia DESCARGADA) ---
// Cuando la prueba de 7 días venció y no se cargó licencia, se corta el
// workspace: las rutas de datos devuelven 402 y la SPA muestra el candado.
// No aplica en Vercel (host de marketing + SaaS) ni a cuentas SaaS (que tienen
// su propio trial por cuenta). Quedan vivas las rutas para licenciar/comprar.
const RUTAS_PRUEBA_LIBRES = new Set(['/api/prueba', '/api/planes', '/api/comprar', '/api/paises', '/api/parametros']);
app.use((req, res, next) => {
  if (req.cuentaId !== 'default') return next();
  if (!req.path.startsWith('/api/')) return next();       // las páginas estáticas cargan (para mostrar el candado)
  if (!pruebaBloqueada()) return next();
  if (RUTAS_PRUEBA_LIBRES.has(req.path) || req.path.startsWith('/api/licencia')) return next();
  if (req.method === 'GET' && req.path === '/api/config') return next(); // config para activar la licencia
  return res.status(402).json({
    error: 'PRUEBA_VENCIDA',
    mensaje: 'Tu prueba gratis de MV Agendate IA terminó. Comprá tu licencia y activala en Configuración para seguir usando el programa.'
  });
});

// El aviso de "cotización para aprobar" al profesional sale por WhatsApp.
cotizaciones.setNotificador(enviarWhatsApp);

const visitante = (req) => req.headers['x-visitor-id'] || req.body?.sessionId || req.ip || 'anon';

// --- Canal webchat (usado por la landing y la demo) ---
app.post('/api/chat', limitar({ nombre: 'chat', max: 20, ventanaSeg: 60,
  mensaje: 'Muchos mensajes seguidos.' }), async (req, res) => {
  if (await esBot(req)) return res.status(403).json({ error: 'Acceso denegado.' });
  if (!iaHabilitada()) return res.status(402).json({ error: motivoSuspension() });
  const { mensaje, sessionId } = req.body ?? {};
  if (!mensaje || typeof mensaje !== 'string') {
    return res.status(400).json({ error: 'Falta el campo "mensaje".' });
  }
  // Tope de largo acá mismo, donde se ejecuta: sin esto entra cualquier texto
  // hasta el límite de 2 MB del body parser y se le factura al dueño como
  // tokens de IA. 2000 caracteres es de sobra para un mensaje de chat.
  if (mensaje.length > 2000) {
    return res.status(400).json({ error: 'El mensaje es demasiado largo (máximo 2000 caracteres). Resumilo y probá de nuevo.' });
  }
  const sid = sessionId || `web:${randomUUID()}`;
  // El cupo de la demo pública no aplica a una cuenta SaaS autenticada
  // probando SU propio asistente.
  if (req.cuentaId === 'default' && demoLimitada() && !enModoDemo()) {
    const c = consumirUso(visitante(req));
    if (!c.permitido) return res.json({ respuesta: mensajeLimite(), sessionId: sid, demo: false, limiteAlcanzado: true, restantes: 0 });
    res.locals.restantes = c.restantes;
    trabajos.notificarDemo({ canal: 'chat', visitante: visitante(req), restantes: c.restantes, detalle: mensaje });
  }
  try {
    // Demo pública multiidioma: el visitante puede pedir el asistente en
    // portugués (pt → país Brasil, con su moneda) o inglés (en → solo idioma,
    // sin país LATAM) sin afectar la config del vendedor. Solo aplica a la
    // demo (cuenta 'default'); una cuenta SaaS usa su país.
    const idiomaPedido = String(req.body?.idioma || '').toLowerCase();
    const correr = () => conversar(sid, mensaje.slice(0, 2000), 'webchat');
    const respuesta = (req.cuentaId !== 'default')
      ? await correr()
      : idiomaPedido === 'pt' ? await runConDemoPais('br', correr)
      : idiomaPedido === 'en' ? await runConDemoIdioma('en', correr)
      : await correr();
    res.json({ respuesta, sessionId: sid, demo: enModoDemo(), restantes: res.locals.restantes });
  } catch (err) {
    console.error('[api/chat]', err);
    res.status(500).json({ error: 'Error interno del agente.' });
  }
});

// --- Asistente de ayuda (dudas sobre el programa — distinto del agente de negocio) ---
app.post('/api/ayuda', limitar({ nombre: 'ayuda', max: 20, ventanaSeg: 60,
  mensaje: 'Muchas consultas seguidas.' }), async (req, res) => {
  if (await esBot(req)) return res.status(403).json({ error: 'Acceso denegado.' });
  const { mensaje, sessionId } = req.body ?? {};
  if (!mensaje || typeof mensaje !== 'string') return res.status(400).json({ error: 'Falta el campo "mensaje".' });
  const sid = sessionId || `ayuda:${randomUUID()}`;
  try {
    const respuesta = await responderAyuda(sid, mensaje);
    res.json({ respuesta, sessionId: sid, ia: !enModoDemo() });
  } catch (err) {
    console.error('[api/ayuda]', err);
    res.status(500).json({ error: 'Error interno del asistente de ayuda.' });
  }
});

// --- Cotizador (formulario directo, sin pasar por el chat) ---
app.get('/api/oficios', (_req, res) => res.json(listarOficios()));
app.post('/api/cotizar', limitar({ nombre: 'cotizar', max: 30, ventanaSeg: 60,
  mensaje: 'Muchas cotizaciones seguidas.' }), (req, res) => {
  const r = cotizar({ oficio: cfg('oficioProfesional') || undefined, ...req.body });
  res.status(r.error ? 400 : 200).json(r);
});

// --- País y moneda activos (público: la UI formatea montos con esto) ---
app.get('/api/parametros', (_req, res) => res.json(monedaActiva()));
app.get('/api/paises', (_req, res) => res.json(listarPaises()));

// Detalle completo de un oficio (precios, duraciones, traslado) — lo usa el
// panel para clonar/ajustar el catálogo.
app.get('/api/oficios/:clave', (req, res) => {
  const o = oficiosActivos()[req.params.clave];
  if (!o || req.params.clave === '_nota') return res.status(404).json({ error: 'Oficio no encontrado.' });
  res.json({ clave: req.params.clave, ...o });
});

// Escritura de configuración según quién es: la cuenta SaaS guarda en SUS
// overrides; el modo clásico, en la config global de la instancia.
async function guardarConfigSegunCuenta(req, patch) {
  if (req.cuentaId !== 'default') await guardarOverrides(req.cuentaId, patch);
  else setConfig(patch);
}

// --- Profesiones/oficios propios: cualquier profesional puede crear el suyo
//     (médico, abogado, taller, etc.) o pisar los precios de uno base. ---
app.post('/api/oficios', adminOCuenta, async (req, res) => {
  const b = req.body ?? {};
  const nombre = String(b.nombre || '').trim();
  if (!nombre) return res.status(400).json({ ok: false, error: 'Falta el nombre de la profesión/oficio.' });
  // Tope de largo donde se ejecuta: `clave` se sanea abajo (se slugifica), pero
  // `nombre` se guarda tal cual y después se muestra en el panel y en la demo.
  // Sin tope entra un texto de megabytes que rompe la UI y engorda el storage.
  if (nombre.length > 80) {
    return res.status(400).json({ ok: false, error: 'El nombre de la profesión es demasiado largo (máximo 80 caracteres).' });
  }
  const clave = String(b.clave || nombre).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '') || 'oficio_custom';
  const trabajos = {};
  for (const t of Array.isArray(b.trabajos) ? b.trabajos : []) {
    const tNombre = String(t.nombre || '').trim().slice(0, 80);
    if (!tNombre) continue;
    const tClave = String(t.clave || tNombre).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '');
    trabajos[tClave] = {
      nombre: tNombre,
      duracion_min: Math.max(5, Number(t.duracion_min) || 60),
      mano_obra: Math.max(0, Number(t.mano_obra) || 0),
      materiales_base: Math.max(0, Number(t.materiales_base) || 0),
    };
  }
  if (!Object.keys(trabajos).length) return res.status(400).json({ ok: false, error: 'Agregá al menos un tipo de trabajo con nombre.' });
  let custom = {};
  try { custom = JSON.parse(cfg('oficiosCustom') || '{}'); } catch { /* se regenera */ }
  custom[clave] = {
    nombre,
    honorarios: !!b.honorarios,
    traslado_por_km: Math.max(0, Number(b.traslado_por_km) || 0),
    traslado_minimo: Math.max(0, Number(b.traslado_minimo) || 0),
    trabajos,
  };
  await guardarConfigSegunCuenta(req, { oficiosCustom: JSON.stringify(custom) });
  res.json({ ok: true, clave, oficio: custom[clave] });
});
app.delete('/api/oficios/:clave', adminOCuenta, async (req, res) => {
  let custom = {};
  try { custom = JSON.parse(cfg('oficiosCustom') || '{}'); } catch { /* vacío */ }
  if (!(req.params.clave in custom)) return res.status(404).json({ ok: false, error: 'Ese oficio no es editable (solo se borran los creados por vos).' });
  delete custom[req.params.clave];
  await guardarConfigSegunCuenta(req, { oficiosCustom: JSON.stringify(custom) });
  res.json({ ok: true });
});

// --- IA: investigación de precios de mercado del país (admin o cuenta SaaS) ---
app.post('/api/precios/sugerir', adminOCuenta, async (req, res) => {
  const r = await sugerirPrecios(String(req.body?.oficio || ''));
  res.status(r.ok ? 200 : 400).json(r);
});

// --- IA: estimador de impuestos según la ley del país configurado ---
app.post('/api/impuestos/estimar', limitar({ nombre: 'impuestos', max: 10, ventanaSeg: 60,
  mensaje: 'Muchas estimaciones seguidas.' }), async (req, res) => {
  if (await esBot(req)) return res.status(403).json({ error: 'Acceso denegado.' });
  const r = await estimarImpuestos(req.body?.ingresosMensuales);
  res.status(r.ok ? 200 : 400).json(r);
});

// --- Geocoding gratuito (Nominatim/OSM): dirección de texto ↔ coordenadas ---
// Nominatim (el geocoder gratuito que usamos) exige respetar su límite de uso
// del lado del cliente: como máximo ~1 req/seg, y pide no automatizar ráfagas.
// Si no lo limitamos acá, cualquiera puede hacer que NUESTRA IP termine
// bloqueada por Nominatim para TODOS los profesionales que usan el programa.
app.get('/api/geocoding', limitar({ nombre: 'geocoding', max: 20, ventanaSeg: 60,
  mensaje: 'Muchas búsquedas de dirección seguidas.' }), async (req, res) => {
  const r = await geocodificar(req.query.direccion);
  res.status(r.ok ? 200 : 400).json(r);
});
app.get('/api/geocoding/inverso', limitar({ nombre: 'geocoding-inverso', max: 20, ventanaSeg: 60,
  mensaje: 'Muchas búsquedas de dirección seguidas.' }), async (req, res) => {
  const r = await geocodificarInverso(Number(req.query.lat), Number(req.query.lng));
  res.status(r.ok ? 200 : 400).json(r);
});

// --- Motor de agenda: horarios propuestos considerando traslados y descansos ---
app.post('/api/agenda/proponer', limitar({ nombre: 'agenda-proponer', max: 30, ventanaSeg: 60,
  mensaje: 'Muchas búsquedas de horario seguidas.' }), (req, res) => {
  const r = proponerHorarios(req.body ?? {});
  res.json(r);
});

// --- Voz del profesional (TTS) — Piper es_AR-daniela (rioplatense, gratis). ---
app.get('/api/voz/estado', (_req, res) => res.json({ disponible: piperDisponible(), voz: 'es_AR-daniela (rioplatense)' }));
app.get('/api/voz', limitar({ nombre: 'voz', max: 15, ventanaSeg: 60,
  mensaje: 'Muchos audios seguidos.' }), async (req, res) => {
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
app.post('/api/contacto', limitar({ nombre: 'contacto', max: 5, ventanaSeg: 600,
  mensaje: 'Ya nos mandaste varias consultas.' }), async (req, res) => {
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
  // App de escritorio (Electron): un solo usuario, en su propia computadora
  // — no hay nadie de quien protegerse, así que la clave de administración
  // nunca se pide acá (a diferencia del modo SaaS/hosteado en Vercel).
  if (process.env.MV_ESCRITORIO) return next();
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

// Rutas del workspace (citas/clientes/cotizaciones): en la cuenta 'default'
// rige la clave admin de siempre; una cuenta SaaS autenticada administra su
// propio espacio con el token (y se le corta la escritura si venció el trial
// o la suscripción quedó suspendida).
async function adminOCuenta(req, res, next) {
  if (req.cuentaId === 'default') return soloAdmin(req, res, next);
  const c = await cuentas.obtenerCuenta(req.cuentaId);
  if (!c) return res.status(401).json({ error: 'Cuenta inválida.' });
  const trialVencido = c.estado === 'trial' && new Date(c.trialHasta) < new Date();
  if (c.estado === 'suspendida' || trialVencido) {
    return res.status(402).json({ error: 'Tu prueba gratis terminó. Activá la suscripción mensual desde Comprar → SaaS online para seguir usando tu cuenta.' });
  }
  return next();
}

// ==================== Panel del VENDEDOR: cuentas SaaS registradas ====================
// Solo con la clave admin global de la instancia (nunca con token de cuenta):
// lista todas las cuentas con sus métricas de uso y permite activar/suspender
// a mano (además de lo que hace solo el webhook de MercadoPago).
app.get('/api/admin/cuentas', soloAdmin, async (_req, res) => {
  const lista = await cuentas.listarCuentas();
  const conStats = await Promise.all(lista.map(async (c) => {
    const [clientes, citas, pendientes] = await Promise.all([
      trabajos.listarClientes(c.id),
      trabajos.listarCitas({}, c.id),
      cotizaciones.listarCotizaciones('pendiente', c.id)
    ]);
    const facturado = citas.filter((x) => x.estado === 'completada')
      .reduce((a, x) => a + (x.cotizacion?.total || 0), 0);
    const trialVencido = c.estado === 'trial' && new Date(c.trialHasta) < new Date();
    return { ...c, trialVencido, clientes: clientes.length, citas: citas.length, cotizacionesPendientes: pendientes.length, facturado };
  }));
  res.json(conStats);
});
app.post('/api/admin/cuentas/:id/estado', soloAdmin, async (req, res) => {
  const estado = String(req.body?.estado || '');
  if (!['trial', 'activa', 'suspendida'].includes(estado)) {
    return res.status(400).json({ ok: false, error: 'Estado inválido (trial | activa | suspendida).' });
  }
  const r = await cuentas.actualizarEstado(req.params.id, estado);
  res.status(r.ok ? 200 : 404).json(r);
});

// ==================== Cuentas SaaS (registro / login / sesión) ====================
app.post('/api/auth/registro', limitar({ nombre: 'registro', max: 5, ventanaSeg: 3600,
  mensaje: 'Demasiadas cuentas creadas desde esta conexión.' }), async (req, res) => {
  if (await esBot(req)) return res.status(403).json({ error: 'Acceso denegado.' });
  const r = await cuentas.registrar(req.body ?? {});
  if (r.ok && r.cuenta?.email) {
    // Bienvenida (no bloquea la respuesta; no-op si los emails no están configurados)
    emails.enviarPlantilla('bienvenida', 'es', r.cuenta.email, {
      nombre: r.cuenta.nombre, url: `${req.protocol}://${req.get('host')}/app/#/cuenta`,
      bonoCreditos: bonoBienvenida() || undefined, // explica los créditos de regalo
    });
  }
  res.status(r.ok ? 200 : 400).json(r);
});
app.post('/api/auth/login', limitar({ nombre: 'login', max: 10, ventanaSeg: 300,
  mensaje: 'Demasiados intentos de ingreso.' }), async (req, res) => {
  if (await esBot(req)) return res.status(403).json({ error: 'Acceso denegado.' });
  const r = await cuentas.login(req.body ?? {});
  res.status(r.ok ? 200 : 401).json(r);
});
app.get('/api/auth/yo', async (req, res) => {
  if (req.cuentaId === 'default') return res.json({ cuenta: null });
  res.json({ cuenta: await cuentas.obtenerCuenta(req.cuentaId) });
});

// --- Configuración del profesional (oficio, nombre, jornada, canales, API key) ---
// Con una cuenta SaaS autenticada, lee/escribe la configuración PROPIA de esa
// cuenta (overrides sobre la global); sin token, la configuración global de
// la instancia como siempre.
app.get('/api/config', adminOCuenta, async (req, res) => {
  if (req.cuentaId !== 'default') return res.json(await configPublicaCuenta(req.cuentaId));
  res.json(getConfigPublico());
});
app.post('/api/config', adminOCuenta, async (req, res) => {
  try {
    if (req.cuentaId !== 'default') {
      await guardarOverrides(req.cuentaId, req.body ?? {});
      return res.json({ ok: true, config: await configPublicaCuenta(req.cuentaId), demo: enModoDemo() });
    }
    res.json({ ok: true, config: setConfig(req.body ?? {}), demo: enModoDemo() });
  } catch (err) {
    console.error('[api/config]', err);
    res.status(500).json({ ok: false, error: 'No pude guardar la configuración.' });
  }
});

// ==================== Telefonía (ChatVoice) y WhatsApp: autoconfiguración ====================
const dominioPropio = (req) => `${req.protocol}://${req.headers['x-forwarded-host'] || req.headers.host}`;

// Con una cuenta SaaS autenticada, estas rutas usan las credenciales de
// Twilio de ESA cuenta (contexto de config por cuenta).
app.get('/api/telefonia/numeros-disponibles', adminOCuenta, async (req, res) => {
  const r = await tw.numerosDisponibles(String(req.query.pais || 'UY').toUpperCase());
  res.status(r.ok ? 200 : 400).json(r);
});
app.get('/api/telefonia/mis-numeros', adminOCuenta, async (_req, res) => {
  const r = await tw.misNumeros();
  res.status(r.ok ? 200 : 400).json(r);
});
app.post('/api/telefonia/comprar-numero', adminOCuenta, async (req, res) => {
  const numero = String(req.body?.numero || '').trim();
  if (!numero) return res.status(400).json({ ok: false, error: 'Falta el número a comprar.' });
  const r = await tw.comprarNumero(numero, dominioPropio(req));
  // Guardamos el número comprado como el ChatVoice del dueño: en el modo SaaS
  // el webhook de voz rutea las llamadas entrantes a la cuenta dueña.
  if (r.ok) await guardarConfigSegunCuenta(req, { twilioNumero: numero }).catch(() => {});
  res.status(r.ok ? 200 : 400).json(r);
});
app.post('/api/telefonia/reapuntar-webhook', adminOCuenta, async (req, res) => {
  const sid = String(req.body?.sid || '').trim();
  if (!sid) return res.status(400).json({ ok: false, error: 'Falta el SID del número.' });
  const r = await tw.configurarWebhook(sid, dominioPropio(req));
  res.status(r.ok ? 200 : 400).json(r);
});
app.post('/api/telefonia/llamar-prueba', adminOCuenta, async (req, res) => {
  const telefono = String(req.body?.telefono || '').trim();
  if (!telefono) return res.status(400).json({ ok: false, error: 'Falta el teléfono a llamar.' });
  const r = await tw.llamarPrueba(telefono, dominioPropio(req));
  res.status(r.ok ? 200 : 400).json(r);
});

app.get('/api/whatsapp/probar', adminOCuenta, async (_req, res) => {
  const r = await probarConexionWhatsapp();
  res.status(r.ok ? 200 : 400).json(r);
});

// Chequeo de retrasos: compara el fin estimado del trabajo en curso contra la
// próxima cita del día y, si hay 30+ minutos de demora, avisa por WhatsApp al
// próximo cliente. En local corre solo (setInterval más abajo); en Vercel
// (serverless, sin procesos de fondo) hace falta que algo externo llame a este
// endpoint cada 5-10 min. Los Cron Jobs nativos de Vercel (vercel.json →
// "crons") están limitados a 1 vez por día en el plan Hobby/gratis, así que
// NO se declaran acá — usá un cron externo gratuito (cron-job.org, GitHub
// Actions) apuntando a la variante GET de abajo. Ver docs/CANALES.md.
app.post('/api/agenda/chequear-retrasos', soloAdmin, async (_req, res) => {
  const avisos = await chequearRetrasosDeHoy();
  res.json({ ok: true, avisos });
});
// Variante GET, pensada para un cron externo (Vercel Hobby no admite Cron Jobs
// nativos de alta frecuencia). Si configurás CRON_SECRET, protegé la llamada
// pasando "Authorization: Bearer $CRON_SECRET" desde el servicio externo; sin
// esa env no se exige nada (uso local/manual).
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
app.get('/api/citas', async (req, res) => res.json(await trabajos.listarCitas(req.query ?? {}, req.cuentaId)));
app.get('/api/citas/dia/:fecha', async (req, res) => res.json(await trabajos.citasDelDia(req.params.fecha, req.cuentaId)));
app.get('/api/citas/:id', async (req, res) => { const c = await trabajos.obtenerCita(req.params.id, req.cuentaId); res.status(c ? 200 : 404).json(c || { error: 'No encontrada' }); });
app.post('/api/citas', adminOCuenta, async (req, res) => {
  const datos = { ...req.body };
  if (datos.direccion && !Number.isFinite(datos.lat)) {
    const geo = await geocodificar(datos.direccion);
    if (geo.ok) { datos.lat = geo.lat; datos.lng = geo.lng; }
  }
  res.json({ ok: true, cita: await trabajos.crearCita(datos, req.cuentaId) });
});
app.post('/api/citas/:id/estado', adminOCuenta, async (req, res) => { const r = await trabajos.cambiarEstadoCita(req.params.id, req.body?.estado, req.cuentaId); res.status(r.ok ? 200 : 400).json(r); });
app.post('/api/citas/:id/receptor', adminOCuenta, async (req, res) => { const r = await trabajos.registrarReceptor(req.params.id, req.body?.nombreReceptor, req.cuentaId); res.status(r.ok ? 200 : 400).json(r); });
app.get('/api/citas/:id/ficha', async (req, res) => {
  const c = await trabajos.obtenerCita(req.params.id, req.cuentaId); if (!c) return res.status(404).send('No encontrada');
  const idi = ['es', 'pt', 'en'].includes(req.query.idi) ? req.query.idi : 'es';
  res.type('html').send(fichaCitaHTML(c, { ...profesionalOpts(), idi }));
});

// Cotizaciones sugeridas: el chatbot NUNCA le dice un precio al cliente sin que
// el profesional lo apruebe (o ajuste) antes. Acá el Panel lista las pendientes
// y las resuelve; al aprobar, si la charla fue por WhatsApp, el cliente recibe
// el precio confirmado al instante.
app.get('/api/cotizaciones', adminOCuenta, async (req, res) => {
  res.json(await cotizaciones.listarCotizaciones(req.query.estado, req.cuentaId));
});
app.post('/api/cotizaciones/:id/resolver', adminOCuenta, async (req, res) => {
  const { aprobar = true, total, nota } = req.body ?? {};
  const r = await cotizaciones.resolverCotizacion(req.params.id, { aprobar, total, nota }, req.cuentaId);
  if (!r.ok) return res.status(400).json(r);
  const cot = r.cotizacion;
  // Aviso proactivo al cliente por WhatsApp con el precio ya confirmado.
  if (cot.estado === 'aprobada' && cot.canal === 'whatsapp' && cot.telefono) {
    const s = cot.sugerido?.simbolo || '$';
    const etiqueta = cot.sugerido?.tipo_cobro === 'honorarios' ? 'Honorarios' : 'Precio';
    enviarWhatsApp(cot.telefono, `✅ ${etiqueta} confirmado para "${cot.trabajoNombre}": ${s} ${cot.totalAprobado} (${cot.sugerido?.moneda || ''}).${cot.nota ? `\nNota: ${cot.nota}` : ''}\n¿Coordinamos el horario?`)
      .catch((e) => console.error('[cotizaciones] aviso al cliente falló:', e.message));
  }
  res.json(r);
});

// Clientes
app.get('/api/clientes', async (req, res) => res.json(await trabajos.listarClientes(req.cuentaId)));
app.get('/api/cliente/:id', async (req, res) => { const c = await trabajos.obtenerCliente(req.params.id, req.cuentaId); res.status(c ? 200 : 404).json(c || { error: 'No encontrado' }); });
app.post('/api/cliente', adminOCuenta, async (req, res) => res.json({ ok: true, cliente: await trabajos.guardarCliente(req.body ?? {}, req.cuentaId) }));
app.post('/api/cliente/:id/confirmar-direccion', limitar({ nombre: 'confirmar-direccion', max: 20, ventanaSeg: 60,
  mensaje: 'Muchas confirmaciones seguidas.' }), async (req, res) => {
  const direccionInformada = req.body?.direccionInformada;
  let lat, lng;
  if (direccionInformada) {
    const geo = await geocodificar(direccionInformada);
    if (geo.ok) { lat = geo.lat; lng = geo.lng; }
  }
  res.json(await trabajos.confirmarDireccionCliente(req.params.id, direccionInformada, lat, lng, req.cuentaId));
});
app.post('/api/cliente/:id/profesional', adminOCuenta, async (req, res) => {
  res.json(await trabajos.asignarProfesionalCliente(req.params.id, req.body?.profesionalId, req.cuentaId));
});

// Dashboard (con filtros: oficio, estado, año, mes, fecha)
app.get('/api/dashboard', async (req, res) => res.json(await trabajos.resumenDashboard(req.query ?? {}, req.cuentaId)));
app.get('/api/dashboard/serie', async (req, res) => res.json(await trabajos.serieMensual(req.query ?? {}, req.cuentaId)));
app.get('/api/dashboard/serie-anual', async (req, res) => res.json(await trabajos.serieAnual(req.query ?? {}, req.cuentaId)));
app.get('/api/dashboard/filtros', async (req, res) => res.json({ ...(await trabajos.opcionesFiltros(req.cuentaId)), profesionales: listarProfesionales() }));

// Equipo de profesionales de la cuenta (estudios con varios trabajadores, ej. 3
// electricistas): lectura pública (para poblar selectores en agenda/clientes/
// dashboards) y escritura admin.
app.get('/api/profesionales', (req, res) => res.json(req.query.raw ? profesionalesGuardados() : listarProfesionales()));
app.post('/api/profesionales', adminOCuenta, async (req, res) => {
  const lista = Array.isArray(req.body?.profesionales) ? req.body.profesionales : [];
  if (req.cuentaId !== 'default') {
    const limpia = normalizarProfesionales(lista);
    await guardarOverrides(req.cuentaId, { profesionales: JSON.stringify(limpia) });
    return res.json({ ok: true, profesionales: limpia });
  }
  res.json({ ok: true, profesionales: guardarProfesionales(lista) });
});

// Exportación de la agenda y de la base de clientes (Excel/CSV), con los mismos filtros del dashboard.
app.get('/api/agenda.csv', async (req, res) => res.type('text/csv').attachment('agenda.csv').send(agendaCSV(await trabajos.listarCitas(req.query ?? {}, req.cuentaId))));
app.get('/api/agenda.xls', async (req, res) => {
  res.setHeader('Content-Type', 'application/vnd.ms-excel');
  res.setHeader('Content-Disposition', 'attachment; filename="agenda.xls"');
  res.send(agendaExcelHTML(await trabajos.listarCitas(req.query ?? {}, req.cuentaId)));
});
app.get('/api/clientes.csv', async (req, res) => res.type('text/csv').attachment('clientes.csv').send(clientesCSV(await trabajos.listarClientes(req.cuentaId))));
app.get('/api/clientes.xls', async (req, res) => {
  res.setHeader('Content-Type', 'application/vnd.ms-excel');
  res.setHeader('Content-Disposition', 'attachment; filename="clientes.xls"');
  res.send(clientesExcelHTML(await trabajos.listarClientes(req.cuentaId)));
});

// Panel del profesional: agenda de hoy + visitas de la demo
app.get('/api/panel', adminOCuenta, async (req, res) => {
  const hoyStr = new Date().toISOString().slice(0, 10);
  res.json({
    hoy: await trabajos.citasDelDia(hoyStr, req.cuentaId),
    cotizacionesPendientes: await cotizaciones.listarCotizaciones('pendiente', req.cuentaId),
    demo: req.cuentaId === 'default' ? trabajos.resumenDemo() : { total: 0, visitas: [] }
  });
});

// --- Uso de APIs (tokens) y catálogo de servicios/costos ---
app.get('/api/uso', soloAdmin, (_req, res) => res.json(resumenUso()));
app.get('/api/tokens/catalogo', (_req, res) => res.json(catalogoConEstado()));

// ==================== Compra / pagos / licencias / descarga ====================
app.get('/api/planes', (_req, res) => res.json({ planes: lic.PLANES, medios: lic.MEDIOS, mercadopago: mercadopagoActivo() }));
app.post('/api/comprar', limitar({ nombre: 'comprar', max: 10, ventanaSeg: 300,
  mensaje: 'Demasiados pedidos seguidos.' }), async (req, res) => {
  if (await esBot(req)) return res.status(403).json({ error: 'Acceso denegado.' });
  // Único medio de pago: MercadoPago. Nunca simulamos la compra: o redirigimos
  // al checkout real de MercadoPago (init_point), o devolvemos un error claro.
  const r = await lic.crearPedido({ ...(req.body ?? {}), medio: 'mercadopago' });
  if (!r.ok) return res.status(400).json(r);
  if (!mercadopagoActivo()) {
    return res.status(503).json({ ok: false, error: 'El cobro con MercadoPago todavía no está activo. El vendedor debe cargar su Access Token de MercadoPago en la configuración (o env MERCADOPAGO_TOKEN).' });
  }
  const base = `${req.protocol}://${req.get('host')}`;
  const pago = r.pedido.recurrente
    ? await planRecurrente(r.pedido.plan, r.pedido.total_usd)
    : await crearPreferencia(r.pedido, base);
  if (!pago.ok || !pago.init_point) {
    return res.status(502).json({ ok: false, error: pago.error || 'No pude iniciar el pago con MercadoPago. Probá de nuevo en unos minutos.' });
  }
  return res.json({ ok: true, pedido: r.pedido, init_point: pago.init_point, recurrente: !!r.pedido.recurrente });
});

async function procesarPreapproval(pre) {
  if (!pre?.id) return;
  // Modo SaaS: si el pagador tiene una cuenta online con ese email, el estado
  // de su suscripción activa/suspende la cuenta automáticamente.
  if (pre.payer_email) {
    const cuentaSaas = await cuentas.buscarCuentaPorEmail(pre.payer_email);
    if (cuentaSaas) {
      await cuentas.actualizarEstado(cuentaSaas.id, pre.status === 'authorized' ? 'activa' : 'suspendida', pre.id);
    }
  }
  let licencia = await suscripciones.buscarLicenciaPorPreapproval(pre.id);
  if (!licencia) {
    const pedido = await lic.buscarPedidoPendientePorEmail(pre.payer_email, pre.external_reference || undefined);
    if (pedido) {
      const confirmado = await lic.confirmarPago(pedido.id);
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
      if (pago && pago.status === 'approved' && pago.external_reference) {
        // Recarga de créditos de IA: "credito:{cuentaId}:{monto}".
        if (String(pago.external_reference).startsWith('credito:')) {
          const [, cuentaId, monto] = String(pago.external_reference).split(':');
          const r = await acreditar(cuentaId, Number(monto));
          if (r.ok) emails.avisarRecarga(cuentaId, Number(monto), r.saldo).catch(() => {});
        } else {
          const r = await lic.confirmarPago(pago.external_reference);
          // La licencia también viaja por email (además de verse en /gracias.html)
          if (r.ok && !r.yaEstaba && r.pedido?.email) {
            const base = cfg('sitioUrl') || `${req.protocol}://${req.get('host')}`;
            emails.enviarPlantilla('compraConfirmada', 'es', r.pedido.email, {
              nombre: r.pedido.nombre, plan: r.pedido.plan, licencia: r.pedido.licencia,
              urlDescarga: r.pedido.token ? `${base}/descargar/${r.pedido.token}` : ''
            });
          }
        }
      }
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

// --- Créditos de IA de la cuenta SaaS (saldo + recarga por MercadoPago) ---
app.get('/api/creditos', adminOCuenta, async (req, res) => {
  if (req.cuentaId === 'default') return res.json({ habilitado: false });
  res.json({ ...(await estadoCreditos(req.cuentaId)), packs: PACKS_CREDITOS });
});
app.post('/api/creditos/recargar', adminOCuenta, async (req, res) => {
  if (req.cuentaId === 'default') return res.status(400).json({ ok: false, error: 'Solo cuentas online.' });
  const monto = Number(req.body?.monto);
  if (!PACKS_CREDITOS.some((p) => p.monto === monto)) return res.status(400).json({ ok: false, error: 'Monto de recarga inválido.' });
  if (!mercadopagoActivo()) return res.status(503).json({ ok: false, error: 'MercadoPago no está activo (falta configurar el token del vendedor).' });
  const base = `${req.protocol}://${req.get('host')}`;
  const pago = await crearPreferenciaCreditos({ cuentaId: req.cuentaId, monto, email: req.cuentaEmail }, base);
  if (!pago.ok || !pago.init_point) return res.status(502).json({ ok: false, error: pago.error || 'No pude iniciar la recarga.' });
  res.json({ ok: true, init_point: pago.init_point });
});

// --- Reseñas del producto (web pública): dejar, listar (aprobadas) y moderar ---
app.get('/api/resenas', async (_req, res) => res.json(await resenas.resenasPublicas()));
app.post('/api/resenas', limitar({ nombre: 'resenas', max: 5, ventanaSeg: 600,
  mensaje: 'Ya nos dejaste varias reseñas seguidas.' }), async (req, res) => {
  if (await esBot(req)) return res.status(403).json({ ok: false, error: 'Acceso denegado.' });
  const r = await resenas.crearResena(req.body ?? {});
  res.status(r.ok ? 200 : 400).json(r);
});
app.get('/api/resenas/admin', soloAdmin, async (_req, res) => res.json(await resenas.resenasTodas()));
app.post('/api/resenas/:id/moderar', soloAdmin, async (req, res) => {
  const r = await resenas.moderarResena(req.params.id, req.body?.accion);
  res.status(r.ok ? 200 : 400).json(r);
});

// --- Cron diario: avisos de "tu prueba vence" por email (idempotente vía Redis).
// Invocalo 1 vez al día: Vercel Cron (vercel.json), cron-job.org o GitHub Actions.
app.get('/api/cron/diario', async (_req, res) => {
  try { res.json(await emails.avisarTrialsPorVencer()); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// --- Prueba gratis de la copia descargada (banner + activación de licencia) ---
app.get('/api/prueba', (_req, res) => res.json(estadoPrueba()));
app.post('/api/licencia/activar', soloAdmin, (req, res) => {
  const r = activarLicencia(req.body?.codigo);
  res.status(r.ok ? 200 : 400).json(r);
});
app.get('/api/pedido/:id', async (req, res) => {
  const p = await lic.obtenerPedido(req.params.id);
  if (!p) return res.status(404).json({ ok: false, error: 'No existe' });
  res.json({
    ok: true, estado: p.estado, token: p.token, licencia: p.licencia, version: p.version,
    plan: p.plan, planNombre: lic.PLANES[p.plan]?.nombre, total_usd: p.total_usd, medio: p.medio, nombre: p.nombre
  });
});
app.post('/api/pago/confirmar', soloAdmin, async (req, res) => { const r = await lic.confirmarPago(req.body?.id); res.status(r.ok ? 200 : 400).json(r); });
app.get('/api/licencias', soloAdmin, async (_req, res) => res.json(await lic.listarPedidos()));
app.post('/api/descarga/generar', soloAdmin, (req, res) => {
  const version = String(req.body?.version || 'pc');
  const token = lic.firmarDescarga(version, Number(req.body?.dias) || 30);
  res.json({ ok: true, version, token, url: `/descargar/${token}` });
});
app.get('/descargar/:token', async (req, res) => {
  const conEstado = await lic.validarToken(req.params.token);
  const sinEstado = conEstado ? null : lic.verificarDescarga(req.params.token);
  const version = conEstado?.version || sinEstado?.version;
  if (!version) return res.status(403).send('Descarga no habilitada. Verificá que el pago esté confirmado.');
  const nombre = lic.archivoDeVersion(version);
  // Los paquetes reales están en public/descargas/ (también servidos como
  // estáticos). Buscamos ahí primero, luego en descargas/ y dist/ por compat.
  const candidatos = [
    join(here, '../public/descargas', nombre),
    join(here, '../descargas', nombre),
    join(here, '../dist', nombre),
  ];
  const archivo = candidatos.find((f) => existsSync(f));
  if (archivo) return res.download(archivo, nombre);
  // Si el .exe no está commiteado en public/descargas/ (ver empaquetar-exe),
  // como respaldo redirigimos al último build publicado en GitHub Releases.
  const urlExterna = cfg('descargaExeUrl');
  const esDesktop = version === 'pc' || version === 'pc_exe' || version === 'todas';
  if (esDesktop && urlExterna) return res.redirect(302, urlExterna);
  res.status(503).send('El paquete aún no está disponible. En el servidor: npm run empaquetar-pc' + (esDesktop ? ' / empaquetar-exe' : ''));
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
  console.log('MV Agendate IA — modo serverless (Vercel). Recordá configurar un cron externo gratuito (cron-job.org / GitHub Actions, ver docs/CANALES.md) → GET /api/agenda/chequear-retrasos cada 5-10 min.');
} else {
  iniciarChequeoLicencia();
  // Chequeo periódico de retrasos (solo tiene sentido corriendo localmente/PC; en
  // Vercel no hay procesos de fondo, por eso el mismo chequeo también existe
  // como endpoint HTTP más arriba, para dispararlo desde un Cron Job).
  const intervaloRetrasos = setInterval(() => { chequearRetrasosDeHoy().catch((e) => console.error('[aviso-retraso]', e.message)); }, 5 * 60 * 1000);
  intervaloRetrasos.unref?.();

  // Si el puerto está ocupado por otro programa, se usa el siguiente libre en
  // vez de morir con un EADDRINUSE sin atrapar (ver src/arranque.js).
  escucharEnPuertoLibre(app, PORT)
    .then(({ server, puerto }) => {
      const url = `http://localhost:${puerto}`;
      // Marca parseable para el envoltorio de escritorio (electron/main.cjs):
      // el puerto REAL puede no ser el pedido si estaba ocupado por otra app,
      // y la ventana tiene que apuntar acá — no al 3000 de otro programa.
      console.log(`MV_PUERTO=${puerto}`);
      console.log(`\n🛠️  MV Agendate IA escuchando en ${url}`);
      if (puerto !== Number(PORT)) {
        console.log(`   (el ${PORT} estaba ocupado por otro programa)`);
      }
      console.log(`   Modo: ${enModoDemo() ? 'DEMO (sin API key — cargala en /config.html)' : 'IA real (Claude)'}`);
      console.log('   Configuración/API key: /config.html');
      console.log('   Landing:  /            Demo chat+voz: /demo.html      Panel: /panel.html');
      console.log('   Webhooks: /webhook/whatsapp  /webhook/voz  /webhook/voz-premium');
      const ips = ipsLocales();
      if (ips.length) {
        console.log('\n   📱 Para usar la app en el CELULAR (sin instalar nada), conectá el teléfono');
        console.log('      a la MISMA red Wi-Fi y abrí en Chrome del celular:');
        for (const ip of ips) console.log(`        →  http://${ip}:${puerto}/movil`);
        console.log('      Luego menú ⋮ → "Agregar a pantalla de inicio" y queda como app.');
      }
      montarVozPremium(server);
      console.log();
      // El navegador lo abre el servidor, no el lanzador .bat: hasta acá no se
      // sabía el puerto final. El .bat abría siempre el 3000 y, si ese puerto
      // era de otra app, le mostraba esa otra app al cliente.
      if (process.env.MV_ABRIR_NAVEGADOR === '1') abrirNavegador(url);
    })
    .catch((e) => {
      console.error(`\n[X] No se pudo abrir el servidor en el puerto ${PORT}: ${e.message}`);
      console.error('    Probá cerrar otros programas o reiniciar la computadora.\n');
      process.exit(1);
    });
}
