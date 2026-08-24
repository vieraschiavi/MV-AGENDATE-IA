// © 2026 Martín Viera. Todos los derechos reservados.

// MV Agendate IA — servidor principal
// Chatbot/ChatVoice con IA que cotiza y agenda trabajos de cualquier oficio,
// optimizando traslados y descansos, + CRM y dashboards del profesional.
import express from 'express';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { conversar, enModoDemo, listarOficios } from './ai/agente.js';
import { responderAyuda } from './ai/ayuda.js';
import { cotizar, monedaActiva, oficiosActivos } from './ai/cotizador.js';
import { proveedorActivo } from './ai/llm.js';
import {
  IDS_PROVEEDORES, datosProveedor, modeloDe, listarModelos,
  modelosCacheados, fusionarCache
} from './ai/modelos.js';
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
import { incluyeAgenteIA, MOTIVO_SIN_IA } from './store/plan.js';
import { estadoCreditos, acreditar, bonoBienvenida, PACKS as PACKS_CREDITOS } from './store/creditos.js';
import * as emails from './store/emails.js';
import * as resenas from './store/resenas.js';
import { runConCuenta, runConDemoPais, runConDemoIdioma } from './store/contextoCuenta.js';
import { kvGet, kvSet, redisDisponible } from './store/redis.js';
import { obtenerOverrides, guardarOverrides, configPublicaCuenta } from './store/configCuentas.js';
import { fichaCitaHTML, agendaCSV, agendaExcelHTML, clientesCSV, clientesExcelHTML } from './exports/documentos.js';
import { resumenUso, catalogoConEstado } from './store/uso.js';
import * as lic from './store/licencias.js';
import {
  crearPreferencia, crearPreferenciaCreditos, consultarPago,
  mercadopagoActivo, modoMercadopago, planRecurrente, consultarPreapproval, consultarPagoRecurrente,
  tierDePlanRecurrente
} from './store/mercadopago.js';
import * as suscripciones from './store/suscripciones.js';
import { generarLinkDeCobro } from './store/cobro-trabajo.js';
import { prepararCasoDemo } from './store/demo-caso.js';
import * as solicitudesDemo from './store/solicitudes-demo.js';
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

// Pantalla con la que abre el programa instalado (exe y lanzador .bat): el
// PANEL de trabajo. La raíz "/" es la landing de venta y NO es lo que tiene
// que ver un cliente que ya compró — ver electron/main.cjs.
export const RUTA_APP = '/app/';

const app = express();
app.set('trust proxy', true);

// --- Red de contención: que una promesa rechazada no se lleve puesto el proceso ---
//
// Express 4 NO atrapa el rechazo de una promesa en un handler `async`: se
// convierte en un unhandledRejection y Node, desde la v15, termina el proceso.
// En Vercel eso no es "se cayó ese request": la instancia atiende varias
// invocaciones a la vez, así que un Redis con hipo mientras un profesional mira
// su dashboard puede llevarse puestas las requests de OTRAS cuentas.
//
// Envolver a mano los ochenta handlers sería ochenta lugares donde olvidarse.
// Se envuelven de una sola vez los métodos de ruteo, ACÁ ARRIBA: desde este
// punto, toda ruta declarada con app.get/post/... queda cubierta sola, y
// cualquier rechazo va a parar al error handler del final del archivo.
//
// Alcance real: esto cubre las rutas declaradas SOBRE `app`. Los Router de
// src/channels/ se montan con app.use y sus handlers internos no pasan por
// acá, así que cada uno se hace cargo de sus propios errores (ver el
// try/catch de conCuentaDeLaLlamada en voz.js, que además tiene que responder
// TwiML y no un 500).
const envolver = (fn) => (typeof fn !== 'function' || fn.length >= 4 ? fn : function envuelto(req, res, next) {
  try {
    const r = fn.call(this, req, res, next);
    if (r && typeof r.then === 'function') r.catch(next);
    return r;
  } catch (e) { next(e); }
});
for (const metodo of ['get', 'post', 'put', 'patch', 'delete', 'all', 'use']) {
  const original = app[metodo].bind(app);
  app[metodo] = (...args) => {
    // app.get('nombre') sin handlers es el LECTOR de settings de Express, no
    // una ruta: se deja pasar tal cual.
    if (metodo === 'get' && args.length === 1) return original(...args);
    return original(...args.map(envolver));
  };
}

// CORS abierto para la app Android (APK) y el widget embebido en sitios de terceros
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// El cuerpo CRUDO se guarda aparte porque la firma de Meta (X-Hub-Signature-256)
// es un HMAC sobre esos bytes exactos: volver a serializar el objeto parseado no
// los reproduce (espacios, orden de claves, escapes) y la verificación fallaría
// siempre. Ver src/channels/firmas.js.
app.use(express.json({ limit: '2mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: false })); // webhooks de Twilio llegan como form-encoded
// En el PROGRAMA INSTALADO (escritorio), "/" es el panel — no la página de
// venta. La landing existe para convencer a alguien de comprar; al cliente que
// ya compró e instaló mostrarle el "Comprá ahora" adentro de su propio programa
// queda poco serio, y encima puede volver ahí con un clic y perderse.
// En el servidor web (Vercel) no aplica: ahí "/" tiene que seguir siendo la
// landing, que es lo que ve un visitante.
// Va ANTES del estático porque si no, express.static entrega public/index.html
// y este redirect no llega a correr nunca.
app.get('/', (req, res, next) => {
  if (!process.env.MV_ESCRITORIO) return next();
  res.redirect(302, RUTA_APP);
});
// Cuenta las descargas directas (botones de instalar.html: prueba gratis, sin
// pago) ANTES de servirlas como estático, para que el monitor de ventas
// (/api/admin/resumen) sepa cuánta gente llegó a bajar el paquete y no solo
// cuánta pagó. lic.contarDescarga ignora cualquier nombre que no sea uno de
// los cuatro paquetes reales — así un bot pidiendo basura no ensucia el conteo.
app.get('/descargas/:archivo', (req, res, next) => { lic.contarDescarga(req.params.archivo); next(); });
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
  // La demo dejó de ser pública: se muestra en vivo, 1:1 y a pedido. Ver
  // puedeUsarAgente() — el cliente que pagó y la cuenta SaaS no se tocan.
  if (!puedeUsarAgente(req)) {
    return res.status(403).json({
      error: 'La demo no es pública: se muestra en vivo, uno a uno. Pedila en /demo.html y coordinamos.',
      demoBajoPedido: true
    });
  }
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

// --- IA: qué modelos puede elegir el profesional, y con cuál está trabajando ---
//
// El modelo lo elige él, no el programa: entre el más caro y el más barato de
// un mismo proveedor hay 10× o más por token, y para cotizar y agendar suele
// alcanzar el barato. Devuelve lo último que contestó cada proveedor (caché),
// para que el desplegable tenga opciones sin salir a internet en cada carga.
app.get('/api/ia/modelos', adminOCuenta, (_req, res) => {
  const cache = modelosCacheados();
  res.json({
    ok: true,
    proveedorActivo: proveedorActivo(),
    proveedores: IDS_PROVEEDORES.map((id) => {
      const p = datosProveedor(id);
      return {
        id,
        nombre: p.nombre,
        consola: p.consola || '',
        claveApi: p.claveApi,
        claveModelo: p.claveModelo,
        claveBaseUrl: p.claveBaseUrl || '',
        // Nunca la key: solo si ya hay una cargada, para poder avisar en la UI.
        tieneClave: !!cfg(p.claveApi),
        modeloElegido: cfg(p.claveModelo) || '',
        modeloPorDefecto: p.porDefecto,
        enUso: modeloDe(id),
        modelos: cache[id]?.modelos || [],
        actualizado: cache[id]?.actualizado || null,
      };
    }),
  });
});

// El botón "Actualizar": le pregunta a la API de cada proveedor con clave
// cargada qué modelos tiene HOY. Una lista escrita en el código nacería
// vencida — los proveedores sacan modelos nuevos y jubilan viejos seguido.
app.post('/api/ia/modelos/actualizar', adminOCuenta, limitar({
  nombre: 'modelos-ia', max: 10, ventanaSeg: 60,
  mensaje: 'Muchas actualizaciones seguidas. Esperá un momento.'
}), async (req, res) => {
  // Se puede pedir uno solo (el que el profesional está mirando) o todos los
  // que tengan clave cargada.
  const pedido = String(req.body?.proveedor || '').trim();
  const objetivo = pedido && IDS_PROVEEDORES.includes(pedido)
    ? [pedido]
    : IDS_PROVEEDORES.filter((id) => !!cfg(datosProveedor(id).claveApi));

  if (!objetivo.length) {
    return res.status(400).json({ ok: false, error: 'Cargá primero la API key del proveedor que quieras consultar.' });
  }

  const resultados = {};
  await Promise.all(objetivo.map(async (id) => { resultados[id] = await listarModelos(id); }));

  // Se cachea donde corresponda: en modo SaaS, en los overrides de ESA cuenta.
  const fusionado = fusionarCache(modelosCacheados(), resultados);
  await guardarConfigSegunCuenta(req, { modelosDisponibles: JSON.stringify(fusionado) }).catch(() => {});

  res.json({
    ok: Object.values(resultados).some((r) => r.ok),
    proveedores: Object.fromEntries(objetivo.map((id) => [id, {
      ok: resultados[id].ok,
      error: resultados[id].error || null,
      modelos: fusionado[id]?.modelos || [],
      actualizado: fusionado[id]?.actualizado || null,
    }])),
  });
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

// --- Pedidos de demo (la demo ya no es pública: se muestra 1:1 y agendada) ---
// El aviso al dueño es un email HTML y los campos los escribe un desconocido:
// sin escapar, un nombre con <script> o con etiquetas rotas le llega inyectado
// en su propia bandeja.
const escaparHtml = (s) => String(s ?? '')
  .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// El límite es bajo a propósito: es un formulario que una persona llena una
// vez, no algo que se use seguido. Sin esto, un bot llena la lista de leads de
// basura y el dueño recibe un mail por cada intento.
app.post('/api/demo/solicitar', limitar({ nombre: 'demo-solicitar', max: 3, ventanaSeg: 3600,
  mensaje: 'Ya mandaste tu pedido. Te escribimos a la brevedad.' }), async (req, res) => {
  if (await esBot(req)) return res.status(403).json({ error: 'Acceso denegado.' });
  const r = await solicitudesDemo.registrarSolicitud(req.body ?? {});
  if (!r.ok) return res.status(400).json(r);

  // El aviso por email es la capa de notificación, no la de registro: la
  // solicitud ya quedó guardada arriba. Si Resend no está configurado o falla,
  // el lead igual aparece en /monitor.html — no se pierde nadie por eso.
  const s = r.solicitud;
  const destino = cfg('emailDemos') || process.env.EMAIL_DEMOS;
  if (destino) {
    emails.enviarEmailAsync({
      para: destino,
      asunto: `Pedido de demo: ${s.nombre} (${s.empresa}, ${s.pais})`,
      html: `<p><b>${escaparHtml(s.nombre)}</b> pidió una demo.</p>
<ul>
  <li>Email: ${escaparHtml(s.email)}</li>
  <li>País: ${escaparHtml(s.pais)}</li>
  <li>Empresa: ${escaparHtml(s.empresa)}</li>
  ${s.oficio ? `<li>Oficio/rubro: ${escaparHtml(s.oficio)}</li>` : ''}
  ${s.pedidos > 1 ? `<li><b>Ya había pedido antes</b> (${s.pedidos} veces)</li>` : ''}
</ul>
${s.mensaje ? `<p>Mensaje:<br>${escaparHtml(s.mensaje)}</p>` : ''}`
    });
  } else {
    console.warn('[demo] Pedido de demo guardado pero SIN aviso por email: configurá EMAIL_DEMOS.');
  }
  res.json({ ok: true, repetida: r.repetida });
});
app.get('/api/demo/solicitudes', soloAdmin, async (_req, res) => res.json(await solicitudesDemo.listarSolicitudes()));
app.post('/api/demo/solicitudes/marcar', soloAdmin, async (req, res) => {
  const r = await solicitudesDemo.marcarSolicitud(req.body?.email, req.body?.estado);
  res.status(r.ok ? 200 : 400).json(r);
});

/** Compara dos secretos sin filtrar por timing cuántos caracteres coinciden. */
function igualSeguro(a, b) {
  const ba = Buffer.from(String(a ?? ''), 'utf8');
  const bb = Buffer.from(String(b ?? ''), 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// --- Zona admin: con una clave configurada exige X-Admin-Key; sin ella queda
// abierta solo en local (primer arranque/demo). ---
function soloAdmin(req, res, next) {
  // App de escritorio (Electron): un solo usuario, en su propia computadora
  // — no hay nadie de quien protegerse, así que la clave de administración
  // nunca se pide acá (a diferencia del modo SaaS/hosteado en Vercel).
  if (process.env.MV_ESCRITORIO) return next();
  const clave = cfg('adminKey');
  if (clave) {
    // Comparación en tiempo constante, igual que en cuentas.js: con === el
    // tiempo de respuesta depende de cuántos caracteres coinciden.
    if (igualSeguro(req.headers['x-admin-key'], clave)) return next();
    return res.status(401).json({ error: 'Clave de administración inválida.' });
  }
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    return res.status(401).json({ error: 'Panel deshabilitado: configurá ADMIN_KEY.' });
  }
  return next();
}

/**
 * ¿Esta request puede conversar con el agente de IA?
 *
 * La demo dejó de ser pública (ver store/solicitudes-demo.js): un chat abierto
 * en la web dejaba que cualquiera —competencia incluida— le sacara al agente
 * cómo cotiza, cómo repregunta y cómo arma la agenda, que es justamente lo que
 * diferencia al producto. Ahora la demo se muestra 1:1 y agendada.
 *
 * Lo que se cierra es SOLO la demo pública del sitio hosteado. Sigue abierto
 * para todos los que ya tienen derecho a usar el agente, en el mismo orden de
 * casos que usa soloAdmin:
 *   - el programa instalado (PC/APK): es un cliente que pagó;
 *   - una cuenta SaaS autenticada: paga su suscripción y prueba SU asistente;
 *   - el dueño con la clave de administración (así /config.html sigue andando);
 *   - desarrollo local sin clave configurada.
 */
function puedeUsarAgente(req) {
  if (process.env.MV_ESCRITORIO) return true;
  if (req.cuentaId !== 'default') return true;
  // Escape hatch, apagado por default. public/widget.js —el chat que el
  // profesional embebe en SU web para SUS clientes— no manda ninguna
  // credencial, así que cae acá. Quien hostee su propio servidor lo prende con
  // DEMO_PUBLICA=1; en el sitio de venta de MV queda apagado, que es el caso
  // que motivó cerrar la demo.
  if (cfg('demoPublica') === '1' || cfg('demoPublica') === 'true') return true;
  const clave = cfg('adminKey');
  if (clave) return igualSeguro(req.headers['x-admin-key'], clave);
  return !(process.env.VERCEL || process.env.NODE_ENV === 'production');
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
  // Que Twilio NO esté configurado es el estado normal de una instalación
  // recién hecha, no un fallo: se responde 200 y el panel simplemente no
  // muestra la sección. Antes iba 400 y el navegador marcaba un error rojo en
  // la consola en CADA carga del panel, indistinguible de un problema real.
  // Un fallo de verdad de la API de Twilio sí sigue siendo error (502).
  if (!tw.twilioActivo()) {
    return res.json({ ok: false, configurado: false, numeros: [] });
  }
  const r = await tw.misNumeros();
  res.status(r.ok ? 200 : 502).json(r);
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
app.get('/api/agenda/chequear-retrasos', limitar({ nombre: 'cron-retrasos', max: 20, ventanaSeg: 300 }), async (req, res) => {
  const secreto = process.env.CRON_SECRET;
  if (secreto) {
    if (!igualSeguro(req.headers.authorization, `Bearer ${secreto}`)) {
      return res.status(401).json({ ok: false, error: 'No autorizado.' });
    }
  } else if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    // Sin CRON_SECRET esta ruta no puede quedar abierta en un deploy público:
    // manda WhatsApp REALES a los clientes de TODAS las cuentas, con las
    // credenciales de cada profesional. Dejarla sin llave es regalar un botón
    // de "mandale un mensaje a toda la agenda" a cualquiera que sepa la URL.
    return res.status(401).json({ ok: false, error: 'Configurá CRON_SECRET para exponer este chequeo.' });
  }
  const avisos = await chequearRetrasosDeHoy();
  res.json({ ok: true, avisos });
});

async function chequearRetrasosDeHoy() {
  const hoyStr = new Date().toISOString().slice(0, 10);

  // Una pasada por cuenta. Antes miraba solo la agenda de 'default' y avisaba
  // siempre con las credenciales globales de WhatsApp: en modo SaaS, todas las
  // demás cuentas se quedaban sin el aviso de retraso —el argumento de venta
  // "avisa solo"— y ni un error lo delataba, porque no había ninguno.
  const cuentasSaas = await cuentas.listarCuentaIds().catch(() => []);
  const todas = ['default', ...cuentasSaas.filter((id) => id !== 'default')];

  const avisos = [];
  for (const cuentaId of todas) {
    const revisar = async () => {
      const citas = await trabajos.citasDelDia(hoyStr, cuentaId);
      if (!citas.length) return [];

      // La marca de "a este ya le avisé" que lleva revisarYAvisarAgendaDelDia
      // vive en el objeto en memoria, y estas citas se releen de cero en cada
      // pasada: sin persistirla, cada llamada al endpoint le manda el aviso de
      // nuevo a TODOS. Con la ruta abierta eso era un botón de spam contra los
      // clientes del profesional, cobrado a su cuenta de Meta.
      const marca = (c) => `aviso-retraso:${cuentaId}:${c.id}:${hoyStr}`;
      const yaAvisado = await Promise.all(citas.map((c) => kvGet(marca(c)).catch(() => null)));

      const conUbicacion = citas.map((c, i) => ({
        ...c,
        avisoRetrasoEnviado: !!yaAvisado[i] || !!c.avisoRetrasoEnviado,
        finEstimado: new Date(`${c.fecha}T${c.fin}:00`),
        inicioPactado: new Date(`${c.fecha}T${c.inicio}:00`),
        ubicacion: { lat: c.lat, lng: c.lng }
      }));

      // Dentro del contexto de la cuenta, enviarWhatsApp usa SUS credenciales.
      const propios = await revisarYAvisarAgendaDelDia(conUbicacion, enviarWhatsApp);

      // Se deja la marca de los que efectivamente recibieron el aviso. Vence al
      // día siguiente: es una agenda diaria, no hace falta guardarla para siempre.
      await Promise.all(
        conUbicacion
          .filter((c) => c.avisoRetrasoEnviado)
          .map((c) => kvSet(marca(c), { fecha: hoyStr }, { ex: 36 * 3600 }).catch(() => {}))
      );
      return propios;
    };
    try {
      const propios = cuentaId === 'default'
        ? await revisar()
        : await runConCuenta(cuentaId, await obtenerOverrides(cuentaId).catch(() => ({})), revisar);
      avisos.push(...(propios || []));
    } catch (e) {
      // Que una cuenta falle no puede dejar sin aviso a las demás.
      console.error(`[retrasos] Falló la revisión de la cuenta ${cuentaId}:`, e.message);
    }
  }
  return avisos;
}

// ==================== Agenda / clientes / dashboard ====================
const profesionalOpts = () => ({ agencia: cfg('agenciaNombre') || cfg('nombreProfesional') || 'MV Agendate IA', telefono: cfg('agenciaTelefono') || '', logo: cfg('logoUrl') || '/logo-mv.svg' });

// Citas
app.get('/api/citas', async (req, res) => res.json(await trabajos.listarCitas(req.query ?? {}, req.cuentaId)));
app.get('/api/citas/dia/:fecha', async (req, res) => res.json(await trabajos.citasDelDia(req.params.fecha, req.cuentaId)));
app.get('/api/citas/:id', async (req, res) => { const c = await trabajos.obtenerCita(req.params.id, req.cuentaId); res.status(c ? 200 : 404).json(c || { error: 'No encontrada' }); });

// Link de pago del TRABAJO para mandarle al cliente (MercadoPago).
//
// Es el profesional cobrándole a SU cliente lo que le cotizó — la plata va a la
// cuenta de MercadoPago del profesional, no a la de la licencia del software.
// El monto NO se recibe por parámetro a propósito: sale de la cotización que ya
// tiene la cita, que salió del catálogo de precios. Si el monto se pudiera
// mandar desde afuera, cualquiera con el id de una cita podría cobrarse lo que
// quiera a nombre del profesional.
// Va con la misma guardia que el resto de la escritura sobre citas: sin ella,
// cualquiera con el id de una cita podría emitir cobros a nombre del
// profesional y disparar llamadas a la API de MercadoPago desde afuera.
app.post('/api/citas/:id/cobrar', adminOCuenta, async (req, res) => {
  // La misma función que usa la herramienta cobrar_trabajo del agente, para
  // que el botón del panel y el chatbot cobren exactamente igual.
  const base = cfg('sitioUrl') || `${req.protocol}://${req.get('host')}`;
  const r = await generarLinkDeCobro(req.params.id, req.body?.email, req.cuentaId, base);
  if (!r.ok) {
    const codigo = /No encontré esa cita/.test(r.error) ? 404
      : /MercadoPago|sitioUrl/.test(r.error) ? 503
        : 400;
    return res.status(codigo).json(r);
  }
  res.json({ ...r, citaId: req.params.id });
});
// Deja armado el caso de demostración (catálogo de $100 + cita lista para
// cobrar) en el almacén REAL del deploy. Con clave admin: escribe en el
// catálogo y en la agenda del profesional, así que no puede quedar abierta.
app.post('/api/demo/preparar', adminOCuenta, async (req, res) => {
  const r = await prepararCasoDemo(req.cuentaId);
  res.status(r.ok ? 200 : 409).json(r);
});

app.post('/api/citas', adminOCuenta, async (req, res) => {
  const datos = { ...req.body };
  if (datos.direccion && !Number.isFinite(datos.lat)) {
    const geo = await geocodificar(datos.direccion);
    if (geo.ok) { datos.lat = geo.lat; datos.lng = geo.lng; }
  }
  try {
    res.json({ ok: true, cita: await trabajos.crearCita(datos, req.cuentaId) });
  } catch (e) {
    // Choque de horarios: no es un error del servidor, es un "no": 409 y el
    // panel muestra con qué cita se pisa.
    if (e.codigo === 'HORARIO_OCUPADO') {
      return res.status(409).json({ ok: false, error: e.message, citaExistente: e.citaExistente });
    }
    throw e;
  }
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

// Diagnóstico de despliegue: solo booleanos y la URL configurada, nunca un
// token ni nada sensible. Pensado para chequear desde afuera (curl, sin clave
// admin) que un deploy nuevo quedó bien conectado a MercadoPago y a Redis,
// sin tener que abrir el panel de Vercel ni pedirle a nadie que pegue un
// secreto en un chat.
app.get('/api/diagnostico', (_req, res) => res.json({
  mercadopago: mercadopagoActivo(),
  // 'prueba' | 'produccion' | null. Con 'produccion' cada cobro de la demo
  // sale de una tarjeta real: hay que poder verlo antes de mostrarla.
  modoCobro: modoMercadopago(),
  sitioUrl: cfg('sitioUrl') || null,
  almacenPersistente: redisDisponible(),
}));

// ==================== Compra / pagos / licencias / descarga ====================
app.get('/api/planes', (_req, res) => res.json({ planes: lic.PLANES, medios: lic.MEDIOS, mercadopago: mercadopagoActivo() }));
app.post('/api/comprar', limitar({ nombre: 'comprar', max: 10, ventanaSeg: 300,
  mensaje: 'Demasiados pedidos seguidos.' }), async (req, res) => {
  if (await esBot(req)) return res.status(403).json({ error: 'Acceso denegado.' });
  // Único medio de pago: MercadoPago. Nunca simulamos la compra: o redirigimos
  // al checkout real de MercadoPago (init_point), o devolvemos un error claro.
  //
  // El chequeo va ANTES de crear el pedido: si no se puede cobrar, guardarlo
  // solo deja basura. Con el token sin configurar, cada clic en "Comprar"
  // dejaba un pedido pendiente que nadie iba a pagar nunca, y esos pendientes
  // ensucian /api/licencias y la reconciliación por email del webhook de
  // suscripciones (buscarPedidoPendientePorEmail elige el más reciente).
  if (!mercadopagoActivo()) {
    return res.status(503).json({ ok: false, error: 'El cobro con MercadoPago todavía no está activo. El vendedor debe cargar su Access Token de MercadoPago en la configuración (o env MERCADOPAGO_TOKEN).' });
  }
  const r = await lic.crearPedido({ ...(req.body ?? {}), medio: 'mercadopago' });
  if (!r.ok) return res.status(400).json(r);
  const base = `${req.protocol}://${req.get('host')}`;
  const pago = r.pedido.recurrente
    ? await planRecurrente(r.pedido.plan, r.pedido.total_usd)
    : await crearPreferencia(r.pedido, base);
  if (!pago.ok || !pago.init_point) {
    // El chequeo de arriba cubre "MercadoPago no está configurado", pero la
    // llamada puede fallar igual con el token puesto (timeout, 5xx, moneda
    // rechazada) — y entonces el pedido recién creado queda pendiente de un
    // pago que nunca va a llegar. Es la misma basura que evitamos antes, un
    // paso más tarde: se descarta acá.
    await lic.descartarPedidoPendiente(r.pedido.id).catch(() => {});
    return res.status(502).json({ ok: false, error: pago.error || 'No pude iniciar el pago con MercadoPago. Probá de nuevo en unos minutos.' });
  }
  // Recién ACÁ hay intención de compra real: MercadoPago ya devolvió un
  // checkout de verdad, no solo alguien que abrió /comprar.html. Es la señal
  // para decidir en vivo si conviene subir de plan una plataforma que cobra
  // por uso — nunca antes, porque hasta este punto podía no haber pasado nada.
  const destinoAlerta = cfg('emailAlertaCompra') || cfg('emailDemos');
  // Guarda de idempotencia: un cliente indeciso que toca "Comprar" varias
  // veces para el MISMO plan genera un pedido nuevo cada vez (a propósito,
  // es dato real para /monitor.html), pero no tiene que generar un mail
  // nuevo cada vez. 10 minutos de silencio por email+plan alcanza para tapar
  // los reintentos de una sola sesión de compra sin esconder un intento
  // GENUINO más tarde (cambió de plan, o lo volvió a pensar más tarde).
  const claveAlerta = `mvagendate:alerta-compra:${String(r.pedido.email).toLowerCase()}:${r.pedido.plan}`;
  const yaAvisado = destinoAlerta && await kvGet(claveAlerta);
  if (destinoAlerta && !yaAvisado) {
    await kvSet(claveAlerta, '1', { ex: 600 });
    emails.enviarEmailAsync({
      para: destinoAlerta,
      asunto: `Alguien está por comprar: ${lic.PLANES[r.pedido.plan]?.nombre || r.pedido.plan} (USD ${r.pedido.total_usd})`,
      html: `<p>Se generó un checkout real de MercadoPago recién.</p>
<ul>
  <li>Plan: ${escaparHtml(lic.PLANES[r.pedido.plan]?.nombre || r.pedido.plan)}</li>
  <li>Monto: USD ${escaparHtml(r.pedido.total_usd)}</li>
  <li>Email: ${escaparHtml(r.pedido.email)}</li>
  <li>Pedido: ${escaparHtml(r.pedido.id)}</li>
</ul>
<p>Todavía no pagó — esto es la intención de compra, no la confirmación. El pago se avisa aparte cuando MercadoPago lo confirme.</p>`
    });
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
    // El tier sale del plan recurrente que se pagó, NO de external_reference:
    // el link de suscripción es uno por tier y MercadoPago no nos devuelve una
    // referencia propia de este comprador. Sin esto, alguien que probó primero
    // el checkout de un plan y después pagó el otro con el mismo email recibía
    // la licencia del plan equivocado.
    const tier = tierDePlanRecurrente(pre.preapproval_plan_id) || pre.external_reference || undefined;
    const pedido = await lic.buscarPedidoPendientePorEmail(pre.payer_email, tier);
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
          // El id del pago hace la recarga idempotente: MercadoPago reintenta
          // la notificación y esta ruta es pública, así que sin esa marca el
          // mismo pago se acreditaba tantas veces como llegara el aviso.
          const r = await acreditar(cuentaId, Number(monto), dataId);
          if (r.ok && !r.yaEstaba) emails.avisarRecarga(cuentaId, Number(monto), r.saldo).catch(() => {});
        } else if (String(pago.external_reference).startsWith('trabajo:')) {
          // El cliente le pagó al profesional el trabajo cotizado:
          // "trabajo:{cuentaId}:{citaId}". Distinto de una licencia — acá la
          // plata va a la cuenta de MercadoPago del profesional, y lo único
          // que hacemos es dejar la cita marcada como cobrada.
          const [, cuentaId, citaId] = String(pago.external_reference).split(':');
          await trabajos.marcarCitaPagada(citaId, {
            pagoId: String(dataId), monto: pago.monto, moneda: pago.moneda
          }, cuentaId).catch((e) => console.error('[pago trabajo]', e.message));
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
// Se agrega qué incluye el plan pagado. Sin esto, un cliente con licencia
// Básico ve que el chatbot le responde con la lógica local y cree que la IA
// está rota — y escribe a soporte en vez de entender que compró otro plan.
app.get('/api/prueba', (_req, res) => res.json({
  ...estadoPrueba(),
  incluyeIA: incluyeAgenteIA(),
  motivoSinIA: incluyeAgenteIA() ? '' : MOTIVO_SIN_IA
}));
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
// Monitor del dueño: totales de ventas/descargas/cuentas en una sola llamada,
// para no tener que cruzar a mano /api/licencias + /api/admin/cuentas.
app.get('/api/admin/resumen', soloAdmin, async (_req, res) => {
  const [ventas, descargas, cuentasSaas, demos] = await Promise.all([
    lic.resumenVentas(), lic.resumenDescargas(), cuentas.listarCuentas(),
    solicitudesDemo.listarSolicitudes()
  ]);
  const cuentasPorEstado = cuentasSaas.reduce((acc, c) => {
    acc[c.estado] = (acc[c.estado] || 0) + 1;
    return acc;
  }, {});
  res.json({
    ventas, descargas,
    cuentas_saas: { total: cuentasSaas.length, por_estado: cuentasPorEstado },
    // Los pedidos de demo son los leads: quién pidió verla, de dónde y de qué
    // empresa. Van enteros (no solo el total) porque el monitor es la pantalla
    // donde el dueño decide a quién contactar.
    solicitudes_demo: demos
  });
});
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
  if (archivo) { lic.contarDescarga(nombre); return res.download(archivo, nombre); }
  // Si el .exe no está commiteado en public/descargas/ (ver empaquetar-exe),
  // como respaldo redirigimos al último build publicado en GitHub Releases.
  const urlExterna = cfg('descargaExeUrl');
  // pc_zip (el portable) queda afuera del respaldo a propósito: esa URL apunta
  // al .exe del release, y quien pidió el portable justamente no puede abrir
  // ejecutables — mandarle uno sería peor que avisarle que no está listo.
  const esDesktop = version === 'pc' || version === 'pc_exe' || version === 'todas';
  if (esDesktop && urlExterna) return res.redirect(302, urlExterna);
  res.status(503).send('El paquete aún no está disponible. En el servidor: npm run empaquetar-pc' + (esDesktop ? ' / empaquetar-exe' : ''));
});

// --- Canales externos ---
app.use(whatsapp);   // GET/POST /webhook/whatsapp
app.use(voz);        // POST /webhook/voz y /webhook/voz/turno (vía rápida)
app.use(vozPremium); // POST /webhook/voz-premium (pipeline ASR+TTS) + WS /voz-stream

app.get('/salud', (_req, res) => res.json({ ok: true, demo: enModoDemo() }));

// Error handler global. Los 4 argumentos no son decorativos: es por la cantidad
// que Express distingue un manejador de errores de un middleware común.
app.use((err, req, res, _next) => {
  console.error(`[error] ${req.method} ${req.path}:`, err?.stack || err);
  if (res.headersSent) return;
  res.status(500).json({ ok: false, error: 'Se nos rompió algo procesando eso. Probá de nuevo en un momento.' });
});

// Último respaldo: si un rechazo se escapa igual (un `void promesa` suelto, un
// callback fuera del ciclo del request), se registra en vez de matar al proceso
// y dejar sin servicio a todas las cuentas.
process.on('unhandledRejection', (motivo) => {
  console.error('[unhandledRejection] Promesa sin catch:', motivo?.stack || motivo);
});

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
      // Primero y separado: es lo que el cliente necesita si el navegador no
      // abrió solo. La landing va al final — es la página de venta, no el
      // programa.
      console.log(`\n   👉  TU PROGRAMA:  ${url}${RUTA_APP}`);
      console.log('       (si el navegador no se abrió solo, copiá esa dirección)\n');
      console.log(`   Modo: ${enModoDemo() ? 'DEMO (sin API key — cargala en /config.html)' : 'IA real (Claude)'}`);
      console.log('   Configuración/API key: /config.html');
      console.log('   Página de venta: /      Demo chat+voz: /demo.html');
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
      //
      // Abre el PANEL (RUTA_APP), no la raíz: "/" es la landing de venta, que
      // es lo que tiene que ver un visitante de la web, no el cliente que ya
      // compró e instaló el programa. Misma ruta que abre la ventana de
      // escritorio (electron/main.cjs).
      if (process.env.MV_ABRIR_NAVEGADOR === '1') abrirNavegador(url + RUTA_APP);
    })
    .catch((e) => {
      console.error(`\n[X] No se pudo abrir el servidor en el puerto ${PORT}: ${e.message}`);
      console.error('    Probá cerrar otros programas o reiniciar la computadora.\n');
      process.exit(1);
    });
}
