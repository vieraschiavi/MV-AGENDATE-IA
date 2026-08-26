// © 2026 Martín Viera. Todos los derechos reservados.

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
    texto: 'Para arrancar: 1) Entrá a Configuración y pegá tu clave de Claude, la IA que usa el asistente (se consigue gratis en la web de Anthropic — sin ella el programa igual funciona en modo demo, para que pruebes todo). 2) Elegí tu oficio y cargá tu nombre. 3) Ajustá tu horario de trabajo, tu almuerzo y tus días libres. 4) Probá el chatbot ahí mismo en Configuración, o en la Demo. Todo se aplica al toque, no hace falta reiniciar nada.'
  },
  {
    claves: /(precio|cotiz|presupuesto|catalogo|catálogo|tarifa|lista de precios|oficio)/,
    titulo: 'Cotizador y precios',
    texto: 'El asistente cotiza SOLO con tu propia lista de precios (hay 18 oficios ya cargados, y podés crear el tuyo desde Configuración, con la moneda de tu país). Nunca inventa un número: siempre calcula mano de obra, materiales y traslado por separado. Antes de empezar a atender clientes, revisá que los precios cargados sean los tuyos de verdad. También podés probar una cotización a mano desde la Demo.'
  },
  {
    claves: /(agenda|horario|traslado|viaje|cita|turno|almuerzo|descanso|d[ií]a libre)/,
    titulo: 'Agenda con traslados reales',
    texto: 'El asistente propone horarios teniendo en cuenta cuánto tardás en llegar de una cita a la otra, y siempre respeta tu horario de trabajo, tu almuerzo y tus días libres (los cargás en Configuración). En Agenda ves tus citas en lista o en tablero, y podés exportarlas a Excel. Si el cliente te comparte su ubicación por WhatsApp, se usa directo; si te escribe la dirección con palabras, el sistema la ubica solo, sin que hagas nada.'
  },
  {
    claves: /(whatsapp|meta|webhook|verify)/,
    titulo: 'Conectar WhatsApp',
    texto: 'Para que el asistente atienda tu WhatsApp, primero necesitás una cuenta de WhatsApp Business (es gratis y se crea en unos minutos desde la web de Meta/Facebook para desarrolladores). Con eso listo, en Configuración → Canales pegás los datos que te dio Meta y apretás "Probar conexión" para confirmar que quedó bien conectado. Un detalle: WhatsApp solo deja mandar mensajes libres dentro de las 24 horas después de que el cliente te escribió por última vez — por eso a veces el aviso de retraso puede no llegarle si pasó mucho tiempo sin hablar.'
  },
  {
    claves: /(voz|voice|tel[eé]fono|llama|deepgram|piper|elevenlabs)/,
    titulo: 'ChatVoice (teléfono)',
    texto: 'El asistente puede atender el teléfono con el mismo cerebro que atiende tu WhatsApp: escucha a quien llama, responde hablando, cotiza y agenda. Para eso necesitás un número telefónico propio, que se contrata en Twilio (mirá el tema "Conectar tu teléfono"). La cuenta de Twilio es tuya: el número y los minutos los pagás vos directamente allá, a precio de costo, sin intermediarios ni recargo nuestro. Hay dos calidades de voz: la estándar, que anda en cualquier lado y ya suena bien, y una más natural y con menos demora que necesita que el programa corra en tu computadora o en un servidor propio. Si la natural no está disponible, la llamada pasa sola a la estándar y nunca se corta.'
  },
  {
    claves: /(twilio|contratar (el )?(n[uú]mero|tel[eé]fono)|comprar (un )?n[uú]mero|account sid|auth token|numero de tel[eé]fono)/,
    titulo: 'Conectar tu teléfono (Twilio), paso a paso',
    texto: 'El número de teléfono es tuyo y se contrata en Twilio, que es la empresa que provee la línea. Son cinco pasos, una sola vez: 1) Creá tu cuenta en twilio.com. 2) Cargale saldo para salir del modo de prueba — es importante: en modo de prueba Twilio reproduce un mensaje grabado antes de cada llamada, y eso arruina la primera impresión con un cliente. 3) En el panel de Twilio, copiá los dos datos que identifican tu cuenta (los llaman Account SID y Auth Token) y pegalos en Configuración de este programa. 4) Con eso cargado, desde Configuración podés ver los números disponibles en tu país y contratar uno con un botón, sin volver a entrar a Twilio. 5) Listo: el programa deja el número apuntando a tu asistente solo. Un aviso para que no te agarre desprevenido: en Uruguay y en varios países de la región, para tener un número LOCAL te piden documentación (cédula o datos de la empresa y a veces un domicilio del país). Es un trámite de la operadora, no del programa, y puede demorar unos días. Si necesitás salir a funcionar ya mismo, contratá primero un número de otro país que no pida documentación y cambialo después. Todo lo que gastes en el número y en los minutos se lo pagás a Twilio desde tu propia cuenta.'
  },
  {
    claves: /(retraso|demora|tarde|aviso)/,
    titulo: 'Aviso automático de retraso',
    texto: 'Si marcás un trabajo como "en curso" y el sistema calcula que vas a llegar 30 minutos tarde o más a tu próxima cita, le avisa solo por WhatsApp al próximo cliente, disculpándose por la demora — no tenés que hacer nada, pasa en segundo plano. También podés forzar la revisión cuando quieras desde el Panel del día.'
  },
  {
    claves: /(dashboard|estad[ií]stica|facturaci[oó]n|reporte|anal[ií]tica|export|excel|csv|pdf)/,
    titulo: 'Dashboards y exportaciones',
    texto: 'En Dashboards ves cuántos trabajos hiciste por día, semana, mes o año, comparado con otros períodos, cuánto facturaste y el ticket promedio, con filtros por oficio, estado o profesional. Podés exportar todo a Excel, y cada cita tiene una ficha que podés imprimir o guardar como PDF.'
  },
  {
    claves: /(cliente|crm|ficha|direcci[oó]n|receptor)/,
    titulo: 'CRM de clientes',
    texto: 'Cada cliente tiene su propia ficha con teléfono, email, dirección (confirmada y ubicada automáticamente), quién suele atender si no es el titular, notas y el historial completo de trabajos que le hiciste. El asistente confirma la dirección y quién recibe en cada conversación, así la ficha se mantiene actualizada sola, sin que la toques.'
  },
  {
    claves: /(equipo|varios|multi|profesionales|trabajadores|estudio)/,
    titulo: 'Varios profesionales (equipo)',
    texto: 'Si en tu negocio trabaja más de una persona (por ejemplo, un estudio con 3 electricistas), cargalos en Configuración → Equipo, cada uno con su oficio, su horario y sus días libres. El chatbot identifica solo a quién le corresponde cada trabajo antes de cotizar, y cada uno tiene su propia agenda, sin mezclarse entre sí. Si trabajás solo, no necesitás tocar nada acá.'
  },
  {
    claves: /(plan|comprar|pago|mercado ?pago|licencia|suscripci[oó]n|cu[aá]nto (sale|cuesta) el programa|full|b[aá]sico)/,
    titulo: 'Planes y compra',
    texto: 'Dos planes de pago único: Básico USD 129 (agenda + cotizador + CRM + dashboards + la app para PC y Android) y Full USD 299 (todo lo de Básico, más el chatbot y el asistente de teléfono con IA, y el aviso automático de retraso), además de la opción de usarlo online sin instalar nada por USD 15 al mes, con 14 días gratis para probarlo. Todo se paga por MercadoPago, con tarjeta o el medio que prefieras. Con el plan Full, el costo de que la IA converse por WhatsApp o teléfono corre aparte (normalmente entre USD 20 y 50 por mes, según cuánto lo uses) — se lo pagás directo a esos proveedores, el programa no te cobra nada extra por eso.'
  },
  {
    claves: /(android|apk|celular|m[oó]vil|pwa|app|play ?store)/,
    titulo: 'App Android / PC',
    texto: 'Podés usar el programa desde el celular como si fuera una app, sin bajarla de Play Store: entrá al sitio desde el navegador del celular y elegí "Agregar a pantalla de inicio". También hay una versión instalable para PC.'
  },
  {
    claves: /(pa[ií]s|moneda|d[oó]lar|usd|impuesto|monotributo|iva|bps|afip|sat|sunat|neto|latam|argentina|m[eé]xico|chile|colombia|per[uú]|brasil)/,
    titulo: 'País, moneda e impuestos (LATAM)',
    texto: 'En Configuración elegís tu país de LATAM: la moneda que usás para cotizar y facturar se ajusta sola (o podés facturar en dólares si preferís). En Dashboards, el asistente puede estimarte cuánto te queda neto según los impuestos de tu país — es solo orientativo, no reemplaza a tu contador. Y en la sección de tu profesión, la IA puede investigar qué cobran otros profesionales en tu zona y sugerirte precios.'
  },
  {
    claves: /(mi profesi[oó]n|crear (oficio|profesi[oó]n)|no est[aá] (en la lista|mi))/,
    titulo: 'Crear tu propia profesión',
    texto: 'El programa sirve para cualquier oficio o profesión con agenda: médicos, abogados, escribanos, psicólogos, talleres, estética, y lo que sea. Ya vienen 18 profesiones cargadas, y en Configuración podés crear la tuya con tus propios trabajos, tiempos y precios (marcá "honorarios" si cobrás por tu tiempo profesional, sin materiales de por medio). La IA también te puede sugerir precios de mercado de tu país si no sabés por dónde arrancar.'
  },
  {
    claves: /(aprobar|aprobaci[oó]n|sugerido|confirmar (el )?precio|precio directo)/,
    titulo: 'Aprobación de cotizaciones',
    texto: 'Por defecto, el asistente NO le dice el precio al cliente hasta que vos lo apruebes. Cada cotización pendiente te llega avisada por WhatsApp y aparece en el Panel del día, en "Cotizaciones por aprobar" — ahí la confirmás tal cual, la ajustás, o la rechazás para atenderla vos mismo. Al aprobarla, si la charla fue por WhatsApp, el cliente recibe el precio confirmado al instante. Si preferís que el asistente dé el precio directo sin pedirte permiso cada vez, podés cambiar eso en Configuración.'
  },
  {
    claves: /(cuenta online|saas|iniciar sesi[oó]n|registrarme|login|sesi[oó]n|trial|prueba gratis|sin instalar)/,
    titulo: 'Cuenta online (SaaS)',
    texto: 'Además de instalarlo, podés usar MV Agendate IA directamente desde el navegador sin instalar nada: te registrás con tu email, tenés 14 días gratis para probarlo, y después seguís pagando una cuota mensual chica por MercadoPago. Tus clientes, tus citas, tus dashboards y tu configuración quedan privados — solo vos los ves. Y podés conectar tu propio WhatsApp y tu propia clave de IA igual que en la versión instalada, para que TU asistente atienda TU número.'
  },
  {
    claves: /(seguridad|admin|clave de administraci[oó]n|proteger)/,
    titulo: 'Seguridad',
    texto: 'Podés poner una contraseña extra en Configuración → Seguridad para que nadie más pueda entrar a cambiar tus datos o tu configuración, aunque tenga acceso a tu computadora o al link. Tus claves y contraseñas nunca se vuelven a mostrar en pantalla una vez guardadas, por tu seguridad.'
  }
];

function buildSystemAyuda() {
  const guia = TEMAS_AYUDA.map((t) => `## ${t.titulo}\n${t.texto}`).join('\n\n');
  return `Sos el asistente de ayuda de MV Agendate IA, un programa para profesionales de oficios (electricistas, plomeros, abogados, psicólogos, etc.) que cotiza y agenda trabajos por WhatsApp/voz/webchat con IA. Respondés dudas del USUARIO DEL PROGRAMA (el profesional que lo compró o lo está evaluando) sobre cómo usarlo y configurarlo.

Tu única fuente es esta guía oficial:

${guia}

Reglas: respondé en español rioplatense (vos/tenés), claro y concreto, en 2-6 oraciones, sin tecnicismos — quien pregunta es el profesional que compró o está probando el programa, no un programador. Indicá siempre en qué pantalla del menú lo encuentra (ej: "en Configuración"), nunca nombres de archivo ni de código. Si la duda no está cubierta por la guía, decilo con honestidad y sugerí escribir por el buzón de contacto (botón "Contacto" abajo a la derecha). No inventes funciones que el programa no tiene. No des asesoramiento ajeno al programa.`;
}

// ---------- Modo demo (sin API key): matcheo por palabras clave ----------

function responderAyudaDemo(texto) {
  const t = String(texto ?? '').toLowerCase();
  const tema = TEMAS_AYUDA.find((x) => x.claves.test(t));
  if (tema) return `${tema.texto}\n\n(Respuesta de la guía local — cargá tu clave de Claude en Configuración para respuestas con IA.)`;
  return 'Puedo ayudarte con: primeros pasos, cotizador y precios, agenda y traslados, WhatsApp, ChatVoice (teléfono), aviso de retraso, dashboards, CRM de clientes, equipo con varios profesionales, planes y compra, app para Android/PC y seguridad. Contame tu duda con alguna de esas palabras, o usá el botón "Contacto" para escribirnos directo.';
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
