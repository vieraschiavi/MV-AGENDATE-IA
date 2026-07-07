// Agente conversacional MV Agendate IA.
// Cerebro: Claude (Anthropic) con herramientas de negocio (cotizar, buscar
// horarios con traslados reales, confirmar dirección/receptor, cerrar cita).
// Sin ANTHROPIC_API_KEY corre en MODO DEMO con lógica local — sirve para
// demos sin costo. El oficio y el nombre del profesional se toman de la
// configuración (panel /config.html), así el mismo motor sirve para
// cualquier rubro: electricista, plomero, abogado, psicólogo, etc.
import Anthropic from '@anthropic-ai/sdk';
import { cotizar, cotizarToolDef, listarOficios } from './cotizador.js';
import { geocodificar, geocodificarToolDef } from './geocoding.js';
import { proponerHorarios, proponerHorariosToolDef, configuracionDescansoPorDefecto } from '../store/agenda.js';
import { crearCita, confirmarDireccionCliente, buscarClientePorTelefono, agendaDelDiaConUbicacion } from '../store/trabajos.js';
import { get as cfg } from '../store/config.js';
import { registrarUso } from '../store/uso.js';

const MODEL = 'claude-opus-4-8';
const nombreProfesional = () => cfg('nombreProfesional') || 'tu profesional de confianza';
const oficioProfesional = () => cfg('oficioProfesional') || 'electricista';
const telefonoProfesional = () => cfg('agenciaTelefono') || '+598 99 000 000';

// Cliente de Claude creado en caliente a partir de la API key configurada en el
// panel. Se recrea automáticamente si la clave cambia; null → modo demo.
let _client = null, _clientKey = null;
function getClient() {
  const key = cfg('anthropicApiKey');
  if (!key) { _client = null; _clientKey = null; return null; }
  if (key !== _clientKey) { _client = new Anthropic({ apiKey: key }); _clientKey = key; }
  return _client;
}
/** true si no hay API key configurada (respuestas simuladas). */
export function enModoDemo() { return !getClient(); }

// ---------- Herramientas de negocio ----------

const confirmarDireccionToolDef = {
  name: 'confirmar_direccion_cliente',
  description:
    'Confirma si el domicilio del trabajo es el mismo que figura en la base del cliente (identificado por su ID o teléfono), o registra la dirección nueva si cambió. Llamala apenas tengas el teléfono/ID del cliente y antes de ofrecer horarios.',
  input_schema: {
    type: 'object',
    properties: {
      clienteId: { type: 'string', description: 'ID del cliente si ya se conoce' },
      telefono: { type: 'string', description: 'Teléfono del cliente (para buscarlo si no hay ID)' },
      direccionInformada: { type: 'string', description: 'Dirección que dio el cliente en este chat' },
      lat: { type: 'number', description: 'Latitud ya resuelta (por geocodificar_direccion o por una ubicación que compartió el cliente)' },
      lng: { type: 'number', description: 'Longitud ya resuelta' }
    }
  }
};

const registrarReceptorToolDef = {
  name: 'registrar_persona_receptora',
  description:
    'Registra si el titular va a estar presente en el domicilio o quién lo va a recibir. Llamala siempre antes de confirmar la cita.',
  input_schema: {
    type: 'object',
    properties: {
      esElTitular: { type: 'boolean' },
      nombreReceptor: { type: 'string', description: 'Nombre de quien atiende si no es el titular' }
    },
    required: ['esElTitular']
  }
};

const confirmarCitaToolDef = {
  name: 'confirmar_cita',
  description:
    'Cierra y guarda la cita en la agenda del profesional, ya con presupuesto, horario, dirección y receptor acordados. Llamala solo al final, cuando el cliente ya aceptó un horario concreto.',
  input_schema: {
    type: 'object',
    properties: {
      clienteNombre: { type: 'string' },
      telefono: { type: 'string' },
      trabajo: { type: 'string', description: 'Clave del tipo de trabajo (ver listarOficios)' },
      fecha: { type: 'string', description: 'YYYY-MM-DD' },
      inicio: { type: 'string', description: 'HH:MM' },
      fin: { type: 'string', description: 'HH:MM' },
      direccion: { type: 'string' },
      direccionConfirmada: { type: 'boolean' },
      lat: { type: 'number', description: 'Latitud del domicilio (de geocodificar_direccion o de la ubicación que compartió el cliente)' },
      lng: { type: 'number', description: 'Longitud del domicilio' },
      receptor: { type: 'string', description: 'Nombre de quien recibe si no es el titular' },
      totalCotizado: { type: 'number' },
      desgloseCotizacion: {
        type: 'object',
        properties: { mano_obra: { type: 'number' }, materiales: { type: 'number' }, traslado: { type: 'number' } }
      }
    },
    required: ['clienteNombre', 'telefono', 'trabajo', 'fecha', 'inicio', 'fin', 'direccion']
  }
};

const TOOLS = [cotizarToolDef, geocodificarToolDef, proponerHorariosToolDef, confirmarDireccionToolDef, registrarReceptorToolDef, confirmarCitaToolDef];

/** Arma la config de descanso/jornada a partir de lo cargado por el profesional en /config.html. */
function configuracionDesdeCfg() {
  const d = configuracionDescansoPorDefecto;
  const diasLibres = cfg('diasLibres');
  return {
    dias_libres: diasLibres ? diasLibres.split(',').map(Number).filter((n) => !Number.isNaN(n)) : d.dias_libres,
    horario_laboral: { inicio: cfg('horarioInicio') || d.horario_laboral.inicio, fin: cfg('horarioFin') || d.horario_laboral.fin },
    almuerzo: { inicio: cfg('almuerzoInicio') || d.almuerzo.inicio, fin: cfg('almuerzoFin') || d.almuerzo.fin },
    buffer_entre_citas_min: d.buffer_entre_citas_min
  };
}

async function ejecutarHerramienta(nombre, input, canal) {
  switch (nombre) {
    case 'cotizar_trabajo':
      return JSON.stringify(cotizar({ oficio: oficioProfesional(), ...input }));
    case 'geocodificar_direccion':
      return JSON.stringify(await geocodificar(input.direccion));
    case 'buscar_horarios_disponibles': {
      // Agenda real del día (con ubicación), para calcular el traslado hacia
      // y desde las citas vecinas — no solo la duración del trabajo nuevo.
      const citasDelDia = input.fecha ? await agendaDelDiaConUbicacion(input.fecha) : [];
      return JSON.stringify(proponerHorarios({ configuracion: configuracionDesdeCfg(), ...input, citasDelDia }));
    }
    case 'confirmar_direccion_cliente': {
      let clienteId = input.clienteId;
      if (!clienteId && input.telefono) {
        const cli = await buscarClientePorTelefono(input.telefono);
        clienteId = cli?.id;
      }
      if (!clienteId) return JSON.stringify({ ok: true, coincide: null, error: 'Cliente nuevo, no hay dirección previa registrada.' });
      return JSON.stringify(await confirmarDireccionCliente(clienteId, input.direccionInformada, input.lat, input.lng));
    }
    case 'registrar_persona_receptora':
      return JSON.stringify({ registrado: true, ...input });
    case 'confirmar_cita': {
      const oficio = oficioProfesional();
      const oficios = listarOficios();
      const datosOficio = oficios.find((o) => o.clave === oficio);
      const trabajoNombre = datosOficio?.trabajos.find((t) => t.clave === input.trabajo)?.nombre || input.trabajo;
      const cita = await crearCita({
        clienteNombre: input.clienteNombre,
        telefono: input.telefono,
        oficio,
        oficioNombre: datosOficio?.nombre || oficio,
        trabajo: input.trabajo,
        trabajoNombre,
        fecha: input.fecha,
        inicio: input.inicio,
        fin: input.fin,
        direccion: input.direccion,
        direccionConfirmada: !!input.direccionConfirmada,
        lat: input.lat,
        lng: input.lng,
        receptor: input.receptor,
        cotizacion: input.totalCotizado != null ? { ...input.desgloseCotizacion, total: input.totalCotizado } : null,
        canal
      });
      return JSON.stringify({ ok: true, cita, mensaje: `Cita confirmada para el ${cita.fecha} a las ${cita.inicio}.` });
    }
    default:
      return `Herramienta desconocida: ${nombre}`;
  }
}

// ---------- Prompt del agente ----------

function buildSystem() {
  return `Sos el asistente virtual de ${nombreProfesional()}, que trabaja como ${oficioProfesional()}. Atendés clientes por WhatsApp, voz y webchat que quieren pedir un trabajo o servicio.

Flujo esperado en cada conversación:
1. Entendé qué necesita el cliente y a qué tipo de trabajo predefinido corresponde. Usá cotizar_trabajo apenas lo sepas — nunca inventes precios.
2. Dale el presupuesto estimado (mano de obra + materiales + traslado) ANTES de ofrecer horarios.
3. Pedí el teléfono y la dirección. Si el cliente comparte su UBICACIÓN (vas a ver algo como "[Ubicación compartida: lat X, lng Y — dirección aproximada: ...]" en su mensaje), esas coordenadas ya son exactas: no hace falta geocodificarlas, usalas directo. Si en cambio escribe la dirección a mano, pasala por geocodificar_direccion para obtener sus coordenadas antes de ofrecer horarios.
4. Confirmá la dirección con confirmar_direccion_cliente (pasale también lat/lng si ya los tenés) — si cambió respecto a la base, listo, ya quedó actualizada.
5. Preguntá si el titular va a estar presente; si no, registrá con registrar_persona_receptora el nombre de quien va a atender.
6. Ofrecé 2-3 horarios concretos con buscar_horarios_disponibles (necesita fecha, día de la semana, duración del trabajo y las coordenadas del cliente) — nunca preguntes "¿cuándo te queda bien?" en abstracto.
7. Cuando el cliente acepte un horario, cerrá todo con confirmar_cita (incluí lat/lng si los tenés, así queda guardado para la próxima vez).

Tono y estilo: profesional pero cercano, español rioplatense (vos/tenés), claro y sin exclamaciones exageradas. Emojis con moderación (uno como máximo, o ninguno). Respuestas cortas tipo chat: 2-5 oraciones. En WhatsApp y voz, aún más breve. Si el trabajo no encaja en ningún tipo predefinido, decilo con honestidad y ofrecé una visita de diagnóstico. Si preguntan algo fuera del rubro, redirigí con amabilidad y ofrecé el teléfono ${telefonoProfesional()} para casos urgentes.`;
}

// ---------- Sesiones en memoria por canal+usuario ----------

const sesiones = new Map();
const MAX_TURNOS = 40;

/**
 * Recorta el historial sin romper pares tool_use/tool_result: el corte solo
 * puede caer en un mensaje de usuario con texto plano (inicio de turno real).
 */
export function recortarHistorial(mensajes, max = MAX_TURNOS) {
  if (mensajes.length <= max) return mensajes;
  for (let i = mensajes.length - max; i < mensajes.length; i++) {
    if (mensajes[i].role === 'user' && typeof mensajes[i].content === 'string') {
      return mensajes.slice(i);
    }
  }
  return mensajes;
}

function historial(sessionId) {
  if (!sesiones.has(sessionId)) sesiones.set(sessionId, []);
  return sesiones.get(sessionId);
}

// ---------- Modo demo (sin API key) ----------

const BADGE = process.env.DEMO_SIN_BADGE ? '' : '⚙️ [Modo demo] ';

function responderDemo(texto, canal) {
  const t = String(texto ?? '').toLowerCase();
  const oficios = listarOficios();
  const propio = oficios.find((o) => o.clave === oficioProfesional()) || oficios[0];
  if (/(cuanto|precio|presupuesto|cotiz|cuesta)/.test(t) && propio) {
    const trabajo = propio.trabajos[0];
    const r = cotizar({ oficio: propio.clave, trabajo: trabajo.clave, distanciaKm: 5 });
    return `${BADGE}Con gusto te paso un presupuesto de ejemplo. Un(a) "${r.trabajo}" ronda los $${r.total} (${r.moneda}), con una duración estimada de ${r.duracion_estimada_min} minutos. Contame qué necesitás y te cotizo el trabajo real.`;
  }
  if (/(turno|horario|agend|cita|cuando)/.test(t)) {
    return `${BADGE}Perfecto, para coordinar el horario necesito: qué trabajo necesitás, tu dirección y cuándo te queda bien. Con eso te propongo 2-3 horarios ya considerando el traslado.`;
  }
  return `${BADGE}Hola, soy el asistente de ${nombreProfesional()} (${propio?.nombre || oficioProfesional()}). Contame qué necesitás y te paso presupuesto y horarios disponibles. (Servidor en modo demo: cargá tu clave de IA en el panel para respuestas con IA real.)`;
}

// ---------- Conversación con Claude ----------

/**
 * Procesa un mensaje del cliente y devuelve la respuesta del agente.
 * @param {string} sessionId — identificador estable del cliente (ej: wa:+598..., web:uuid, tel:+598...)
 * @param {string} texto — mensaje del cliente
 * @param {string} canal — 'webchat' | 'whatsapp' | 'telefono' | 'voz'
 */
export async function conversar(sessionId, texto, canal = 'webchat') {
  const client = getClient();
  if (!client) return responderDemo(texto, canal);

  const mensajes = historial(sessionId);
  const marcaTurno = mensajes.length;
  mensajes.push({ role: 'user', content: texto });

  try {
    let respuesta;
    for (let i = 0; i < 8; i++) {
      respuesta = await client.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system: [{ type: 'text', text: buildSystem(), cache_control: { type: 'ephemeral' } }],
        tools: TOOLS,
        messages: mensajes
      });
      registrarUso(respuesta.usage, canal);

      mensajes.push({ role: 'assistant', content: respuesta.content });

      if (respuesta.stop_reason === 'tool_use') {
        const resultados = await Promise.all(
          respuesta.content
            .filter((b) => b.type === 'tool_use')
            .map(async (b) => ({
              type: 'tool_result',
              tool_use_id: b.id,
              content: await ejecutarHerramienta(b.name, b.input, canal)
            }))
        );
        mensajes.push({ role: 'user', content: resultados });
        continue;
      }
      break;
    }

    if (mensajes.length > MAX_TURNOS) sesiones.set(sessionId, recortarHistorial(mensajes));

    const textos = respuesta.content.filter((b) => b.type === 'text').map((b) => b.text);
    return textos.join('\n') || 'Disculpá, ¿me lo repetís?';
  } catch (err) {
    sesiones.set(sessionId, mensajes.slice(0, marcaTurno));
    if (err instanceof Anthropic.RateLimitError) {
      return 'Estamos con mucha demanda en este momento. Probá de nuevo en unos segundos 🙏';
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return `Tuve un problema de conexión. Si es urgente, llamanos al ${telefonoProfesional()}.`;
    }
    if (err instanceof Anthropic.APIError) {
      console.error('[agente] Error de API:', err.status, err.message);
      return `Tuve un inconveniente técnico. Un agente humano puede ayudarte al ${telefonoProfesional()}.`;
    }
    throw err;
  }
}

export { TOOLS, listarOficios };
