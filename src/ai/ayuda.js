// Asistente de ayuda de MV Agendate IA: responde dudas SOBRE EL PROGRAMA
// (cómo configurarlo, qué hace cada pantalla, canales, planes) — distinto del
// agente de negocio (agente.js), que atiende a los clientes del profesional.
// Con ANTHROPIC_API_KEY usa Claude; sin clave responde desde la base de
// conocimiento local por palabras clave (siempre útil, nunca en blanco).
import Anthropic from '@anthropic-ai/sdk';
import { get as cfg } from '../store/config.js';
import { registrarUso } from '../store/uso.js';

const MODEL = 'claude-haiku-4-5-20251001'; // dudas de producto: alcanza el modelo económico

let _client = null, _clientKey = null;
function getClient() {
  const key = cfg('anthropicApiKey');
  if (!key) { _client = null; _clientKey = null; return null; }
  if (key !== _clientKey) { _client = new Anthropic({ apiKey: key }); _clientKey = key; }
  return _client;
}

// ---------- Base de conocimiento (fuente única: alimenta a la IA y al modo demo) ----------

export const TEMAS_AYUDA = [
  {
    claves: /(empezar|comenzar|arranc|instal|primer|inicio|setup|api key|clave de ia|anthropic)/,
    titulo: 'Primeros pasos',
    texto: 'Para arrancar: 1) Abrí /config.html y pegá tu API key de Claude (se consigue en console.anthropic.com — sin ella el programa funciona en modo demo). 2) Elegí tu oficio y cargá tu nombre. 3) Ajustá tu jornada, almuerzo y días libres. 4) Probá el chatbot desde la misma página de configuración o en /demo.html. Todo se aplica al instante, sin reiniciar.'
  },
  {
    claves: /(precio|cotiz|presupuesto|catalogo|catálogo|tarifa|lista de precios|oficio)/,
    titulo: 'Cotizador y precios',
    texto: 'El agente cotiza SOLO con tu catálogo de precios (src/data/oficios.json — 18 precargados y podés crear tu propia profesión desde /config.html, con la moneda de tu país). Nunca inventa un número: mano de obra + materiales + traslado. Ajustá los valores del catálogo a tus precios reales antes de vender. También podés cotizar a mano desde la demo o al crear una cita en /agenda.html.'
  },
  {
    claves: /(agenda|horario|traslado|viaje|cita|turno|almuerzo|descanso|d[ií]a libre)/,
    titulo: 'Agenda con traslados reales',
    texto: 'El motor de agenda propone horarios considerando el tiempo de viaje estimado hacia y desde las citas vecinas (Haversine + velocidad urbana), y respeta tu jornada, almuerzo y días libres de /config.html. En /agenda.html gestionás las citas en vista Tabla o Tablero (kanban por estado), con exportación CSV/Excel. Cada cita guarda coordenadas: si el cliente comparte su ubicación de WhatsApp se usan directo; si escribe la dirección, se geocodifica sola (gratis, Nominatim/OSM).'
  },
  {
    claves: /(whatsapp|meta|webhook|verify)/,
    titulo: 'Conectar WhatsApp',
    texto: 'En Meta for Developers creá una app de WhatsApp Business, y cargá Token, Phone Number ID y Verify Token en /config.html. Después apuntá el webhook de Meta a https://tu-dominio/webhook/whatsapp con el mismo verify token, y probá la conexión con el botón "Probar conexión de WhatsApp". Ojo: Meta solo permite texto libre dentro de las 24 h del último mensaje del cliente (afecta el aviso de retraso). Guía completa en docs/CANALES.md.'
  },
  {
    claves: /(voz|voice|tel[eé]fono|llama|twilio|deepgram|piper|elevenlabs)/,
    titulo: 'ChatVoice (teléfono)',
    texto: 'Hay dos vías: la rápida usa Twilio <Gather> + voz neural (solo requiere Account SID/Auth Token de Twilio, y podés comprar un número desde /config.html sin entrar a Twilio); la premium agrega Deepgram (voz en tiempo real) y habla con Piper — voz es_AR-daniela rioplatense, gratis y offline (se instala con promo/instalar-voz.sh) — o ElevenLabs si querés voz clonada. La premium necesita servidor persistente (PC/VPS); en Vercel funciona la vía rápida.'
  },
  {
    claves: /(retraso|demora|tarde|aviso)/,
    titulo: 'Aviso automático de retraso',
    texto: 'Si marcás un trabajo "en curso" y el sistema estima que vas a llegar 30+ minutos tarde a la próxima cita (fin estimado + traslado real), le escribe solo por WhatsApp al próximo cliente disculpando la demora. En PC corre cada 5 minutos; en Vercel lo dispara un Cron Job ya configurado en vercel.json. También podés forzar la revisión desde /panel.html.'
  },
  {
    claves: /(dashboard|estad[ií]stica|facturaci[oó]n|reporte|anal[ií]tica|export|excel|csv|pdf)/,
    titulo: 'Dashboards y exportaciones',
    texto: '/dashboards.html muestra trabajos por día/semana/mes/año, comparativas mes a mes y año contra año, facturación total y ticket promedio, con filtros por año, mes, oficio, estado y profesional. Todo se exporta a CSV/Excel (agenda y clientes) respetando los filtros; cada cita tiene además una ficha imprimible/PDF.'
  },
  {
    claves: /(cliente|crm|ficha|direcci[oó]n|receptor)/,
    titulo: 'CRM de clientes',
    texto: 'En /clientes.html cada cliente tiene su página con teléfono, email, dirección (con confirmación y geocoding automático), quién suele atender si no es el titular, notas y el historial completo de trabajos. El agente confirma la dirección y el receptor en cada conversación antes de cerrar una cita, y actualiza la ficha solo.'
  },
  {
    claves: /(equipo|varios|multi|profesionales|trabajadores|estudio)/,
    titulo: 'Varios profesionales (equipo)',
    texto: 'Si en la cuenta trabaja más de un profesional (ej. un estudio con 3 electricistas), cargalos en /config.html → "Equipo": cada uno con su oficio, jornada y días libres. El chatbot identifica cuál corresponde antes de cotizar, cada uno agenda sobre su propia agenda (sin mezclar traslados) y los dashboards filtran por profesional. Con uno solo, nada cambia.'
  },
  {
    claves: /(plan|comprar|pago|mercado ?pago|licencia|suscripci[oó]n|cu[aá]nto (sale|cuesta) el programa|full|b[aá]sico)/,
    titulo: 'Planes y compra',
    texto: 'Dos planes de pago único: Básico USD 129 (agenda + cotizador + CRM + dashboards + app PC/Android) y Full USD 299 (todo lo anterior + chatbot y ChatVoice con IA + aviso de retraso), más una opción SaaS online por USD 15/mes (cuenta en la nube, sin instalar nada, 14 días de prueba gratis). Se compra en /comprar.html por MercadoPago o transferencia. El plan Full usa tus propias cuentas de Claude/WhatsApp/Twilio: ese costo de uso (típicamente USD 20-50/mes según volumen) corre aparte, directo a esos proveedores, sin markup.'
  },
  {
    claves: /(android|apk|celular|m[oó]vil|pwa|app|play ?store)/,
    titulo: 'App Android / PC',
    texto: 'El mismo servidor sirve una PWA instalable como app (sin Play Store): desde el celular, abrí el sitio y "Agregar a pantalla de inicio". También hay scripts para generar el APK (movil/construir-apk-gradle.sh). En PC corre con npm start; la primera vez te pide la API key por consola.'
  },
  {
    claves: /(vercel|deploy|nube|dominio|hosting|servidor)/,
    titulo: 'Deploy en Vercel',
    texto: 'El repo ya trae vercel.json (estático public/ + función serverless api/index.js + Cron Job del aviso de retraso). Conectá el repo en vercel.com, configurá las variables de entorno (o cargá todo después en /config.html) y agregá Redis de Upstash para que los datos persistan entre invocaciones serverless. El ChatVoice premium (tiempo real) requiere servidor persistente; el resto funciona completo en Vercel.'
  },
  {
    claves: /(pa[ií]s|moneda|d[oó]lar|usd|impuesto|monotributo|iva|bps|afip|sat|sunat|neto|latam|argentina|m[eé]xico|chile|colombia|per[uú]|brasil)/,
    titulo: 'País, moneda e impuestos (LATAM)',
    texto: 'En /config.html → "País y moneda" elegís tu país de LATAM: la moneda de cotización y facturación se ajusta sola (o podés facturar en USD). En Dashboards, el estimador "Neto estimado" usa IA para calcular tu carga impositiva según la ley de tu país (régimen simplificado, aportes) y cuánto te queda neto — orientativo, no reemplaza a tu contador. Y en "Mi profesión / precios de mercado" la IA investiga qué se cobra en tu país por cada trabajo y te sugiere los precios.'
  },
  {
    claves: /(mi profesi[oó]n|crear (oficio|profesi[oó]n)|no est[aá] (en la lista|mi))/,
    titulo: 'Crear tu propia profesión',
    texto: 'El catálogo sirve para cualquier profesión u oficio con agenda: médicos, abogados, escribanos, psicólogos, talleres, estética, etc. Hay 18 precargadas, y en /config.html → "Mi profesión / precios de mercado" creás la tuya con sus tipos de trabajo, duraciones y precios (marcando "honorarios" si sos un servicio profesional sin materiales). La IA puede sugerirte los precios del mercado de tu país.'
  },
  {
    claves: /(aprobar|aprobaci[oó]n|sugerido|confirmar (el )?precio|precio directo)/,
    titulo: 'Aprobación de cotizaciones',
    texto: 'El precio que calcula el asistente es un SUGERIDO: por defecto el chatbot no le dice ningún monto al cliente hasta que vos lo apruebes. Cada cotización pendiente te llega por WhatsApp y aparece en el Panel del día → "Cotizaciones por aprobar", donde la confirmás tal cual o ajustás el monto (o la rechazás para atenderla vos directo). Al aprobar, si la charla fue por WhatsApp el cliente recibe el precio confirmado al instante. Si preferís que el bot dé el precio directo sin pasar por vos, cambialo en /config.html → "Aprobación de cotizaciones".'
  },
  {
    claves: /(cuenta online|saas|iniciar sesi[oó]n|registrarme|login|sesi[oó]n|trial|prueba gratis|sin instalar)/,
    titulo: 'Cuenta online (SaaS)',
    texto: 'Además de la versión descargable (pago único), podés usar MV Agendate IA como servicio online: en /app → "Cuenta online" creás tu cuenta con email y contraseña, con 14 días de prueba gratis y después USD 15/mes por MercadoPago. Tus clientes, citas y dashboards quedan privados y aislados de cualquier otra cuenta, disponibles desde cualquier dispositivo. La conexión de canales con IA (WhatsApp/ChatVoice) por cuenta online llega en una fase posterior; hoy esos canales corren en las versiones descargables.'
  },
  {
    claves: /(seguridad|admin|clave de administraci[oó]n|proteger)/,
    titulo: 'Seguridad',
    texto: 'Definí una clave de administración en /config.html → Seguridad: protege la configuración, el panel y las acciones de escritura (se pide como X-Admin-Key). Los secretos (API keys) nunca se muestran de vuelta, solo si están configurados. Para vender copias con tu clave embebida y oculta: npm run embeber-clave.'
  }
];

function buildSystemAyuda() {
  const guia = TEMAS_AYUDA.map((t) => `## ${t.titulo}\n${t.texto}`).join('\n\n');
  return `Sos el asistente de ayuda de MV Agendate IA, un programa para profesionales de oficios (electricistas, plomeros, abogados, psicólogos, etc.) que cotiza y agenda trabajos por WhatsApp/voz/webchat con IA. Respondés dudas del USUARIO DEL PROGRAMA (el profesional que lo compró o lo está evaluando) sobre cómo usarlo y configurarlo.

Tu única fuente es esta guía oficial:

${guia}

Reglas: respondé en español rioplatense (vos/tenés), claro y concreto, en 2-6 oraciones; indicá siempre la pantalla o archivo exacto (ej: /config.html). Si la duda no está cubierta por la guía, decilo con honestidad y sugerí escribir por el buzón de contacto (botón "Contacto" abajo a la derecha). No inventes funciones que el programa no tiene. No des asesoramiento ajeno al programa.`;
}

// ---------- Modo demo (sin API key): matcheo por palabras clave ----------

function responderAyudaDemo(texto) {
  const t = String(texto ?? '').toLowerCase();
  const tema = TEMAS_AYUDA.find((x) => x.claves.test(t));
  if (tema) return `${tema.texto}\n\n(Respuesta de la guía local — cargá tu API key de Claude en /config.html para respuestas con IA.)`;
  return 'Puedo ayudarte con: primeros pasos, cotizador y precios, agenda y traslados, WhatsApp, ChatVoice, aviso de retraso, dashboards, CRM de clientes, equipo multi-profesional, planes y compra, app Android, deploy en Vercel y seguridad. Contame tu duda con alguna de esas palabras, o usá el botón "Contacto" para escribirnos directo.';
}

// ---------- Sesiones ----------

const sesiones = new Map();
const MAX_TURNOS = 20;

/** Responde una duda sobre el programa. sessionId estable por visitante. */
export async function responderAyuda(sessionId, texto) {
  const client = getClient();
  if (!client) return responderAyudaDemo(texto);

  if (!sesiones.has(sessionId)) sesiones.set(sessionId, []);
  const mensajes = sesiones.get(sessionId);
  mensajes.push({ role: 'user', content: String(texto).slice(0, 1000) });
  if (mensajes.length > MAX_TURNOS) mensajes.splice(0, mensajes.length - MAX_TURNOS);

  try {
    const r = await client.messages.create({
      model: MODEL,
      max_tokens: 1000,
      system: [{ type: 'text', text: buildSystemAyuda(), cache_control: { type: 'ephemeral' } }],
      messages: mensajes
    });
    registrarUso(r.usage, 'ayuda');
    const respuesta = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n') || '¿Me repetís la pregunta?';
    mensajes.push({ role: 'assistant', content: respuesta });
    return respuesta;
  } catch (err) {
    mensajes.pop(); // no dejar el turno colgado en el historial
    console.error('[ayuda] Error de API:', err.status || '', err.message);
    return responderAyudaDemo(texto); // ante cualquier error, la guía local siempre responde
  }
}
