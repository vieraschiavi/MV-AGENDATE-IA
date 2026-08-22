// © 2026 Martín Viera. Todos los derechos reservados.

// Agente conversacional MV Agendate IA.
// Cerebro: Claude (Anthropic) con herramientas de negocio (cotizar, buscar
// horarios con traslados reales, confirmar dirección/receptor, cerrar cita).
// Sin ANTHROPIC_API_KEY corre en MODO DEMO con lógica local — sirve para
// demos sin costo. El oficio y el nombre del profesional se toman de la
// configuración (panel /config.html), así el mismo motor sirve para
// cualquier rubro: electricista, plomero, abogado, psicólogo, etc.
import Anthropic from '@anthropic-ai/sdk';
import { chatearLLM, iaConfigurada, LLMError, proveedorActivo } from './llm.js';
import { cotizar, cotizarToolDef, listarOficios, monedaActiva, idiomaActivo } from './cotizador.js';
import { NOMBRE_IDIOMA } from '../data/paises.js';
import { geocodificar, geocodificarToolDef } from './geocoding.js';
import { proponerHorarios, proponerHorariosToolDef, configuracionDescansoPorDefecto } from '../store/agenda.js';
import { crearCita, confirmarDireccionCliente, buscarClientePorTelefono, agendaDelDiaConUbicacion } from '../store/trabajos.js';
import { aprobacionRequerida, crearCotizacion, cotizacionDeSesion } from '../store/cotizaciones.js';
import { generarLinkDeCobro } from '../store/cobro-trabajo.js';
import { mercadopagoActivo } from '../store/mercadopago.js';
import { cuentaActiva, overridesActivos } from '../store/contextoCuenta.js';
import { creditosHabilitado, haySaldo, consumir } from '../store/creditos.js';
import { get as cfg, listarProfesionales } from '../store/config.js';
import { registrarUso } from '../store/uso.js';
import { incluyeAgenteIA } from '../store/plan.js';

const telefonoProfesional = () => cfg('agenciaTelefono') || '+598 99 000 000';

// ---------- Profesional seleccionado por sesión (cuentas con varios trabajadores) ----------

const profesionalPorSesion = new Map();

// Lo que REALMENTE se cotizó en esta sesión, por trabajo: o el total que
// calculó el cotizador con el catálogo del profesional, o el que el
// profesional aprobó a mano desde el Panel.
//
// Existe porque el monto que se guarda en la cita NO puede venir del modelo.
// confirmar_cita recibía un `totalCotizado` suelto y lo escribía tal cual en la
// agenda: bastaba que el modelo transcribiera mal el número al resumir, o que
// el cliente insistiera "vos dijiste mil", para que la cita quedara con un
// precio que el profesional nunca dio. La regla del producto es que la IA no
// inventa montos, y hasta acá esa regla solo se cumplía en cotizar_trabajo.
const cotizadoPorSesion = new Map();
const claveCotizado = (sessionId, trabajo) => `${sessionId}|${trabajo}`;

/** Guarda el monto que vale para esta sesión+trabajo (fuente de la cita). */
function recordarCotizado(sessionId, trabajo, total, desglose) {
  if (total == null || !Number.isFinite(Number(total))) return;
  cotizadoPorSesion.set(claveCotizado(sessionId, trabajo), {
    total: Number(total),
    desglose: desglose || undefined
  });
}

/** Profesional activo de esta conversación: el único configurado, el que ya
 *  eligió el agente con elegir_profesional, o el primero como fallback. */
function profesionalActual(sessionId) {
  const lista = listarProfesionales();
  if (lista.length === 1) return lista[0];
  const id = profesionalPorSesion.get(sessionId);
  return (id && lista.find((p) => p.id === id)) || lista[0];
}

/** Arma la config de descanso/jornada de un profesional puntual (ver store/config.js#listarProfesionales). */
function configuracionDeProfesional(prof) {
  const d = configuracionDescansoPorDefecto;
  const diasLibres = prof.diasLibres;
  return {
    dias_libres: diasLibres ? String(diasLibres).split(',').map(Number).filter((n) => !Number.isNaN(n)) : d.dias_libres,
    horario_laboral: { inicio: prof.horarioInicio || d.horario_laboral.inicio, fin: prof.horarioFin || d.horario_laboral.fin },
    almuerzo: { inicio: prof.almuerzoInicio || d.almuerzo.inicio, fin: prof.almuerzoFin || d.almuerzo.fin },
    buffer_entre_citas_min: d.buffer_entre_citas_min
  };
}

/** true si no hay ninguna API key de IA configurada (respuestas simuladas).
 *  La IA puede ser Claude, ChatGPT (OpenAI) o Gemini — ver src/ai/llm.js. */
export function enModoDemo() { return !iaConfigurada(); }

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
      receptor: { type: 'string', description: 'Nombre de quien recibe si no es el titular' }
      // El monto NO se pide acá a propósito: lo pone el servidor con lo que
      // cotizó el catálogo o aprobó el profesional. Ver confirmar_cita en
      // ejecutarHerramienta.
    },
    required: ['clienteNombre', 'telefono', 'trabajo', 'fecha', 'inicio', 'fin', 'direccion']
  }
};

// Cobro del trabajo por MercadoPago. Es opcional: solo se le ofrece al modelo
// si el profesional tiene MercadoPago configurado — si no, el agente vería una
// herramienta que siempre falla y le prometería al cliente un link que nunca
// llega.
const cobrarTrabajoToolDef = {
  name: 'cobrar_trabajo',
  description:
    'Genera el link de pago de MercadoPago del trabajo YA AGENDADO y se lo pasa al cliente. Llamala DESPUÉS de confirmar_cita, solo si el cliente quiere pagar ahora o pregunta cómo pagar. El monto lo pone el sistema con lo cotizado: no lo pidas ni lo inventes.',
  input_schema: {
    type: 'object',
    properties: {
      citaId: { type: 'string', description: 'id de la cita que devolvió confirmar_cita' },
      email: { type: 'string', description: 'email del cliente, si lo dio (opcional, para que le llegue el comprobante)' }
    },
    required: ['citaId']
  }
};

const elegirProfesionalToolDef = {
  name: 'elegir_profesional',
  description:
    'Registra qué profesional del equipo va a atender este pedido (solo hace falta en cuentas con más de un profesional — vas a ver la lista completa en tus instrucciones). Llamala una sola vez, apenas identifiques cuál corresponde por el oficio pedido o porque el cliente lo nombra, y antes de cotizar.',
  input_schema: {
    type: 'object',
    properties: { profesionalId: { type: 'string', description: 'id del profesional, tal como aparece en la lista de tus instrucciones' } },
    required: ['profesionalId']
  }
};

const TOOLS = [cotizarToolDef, geocodificarToolDef, proponerHorariosToolDef, confirmarDireccionToolDef, registrarReceptorToolDef, confirmarCitaToolDef];

/**
 * Herramientas disponibles para esta conversación: suma elegir_profesional solo
 * si la cuenta tiene más de un profesional, y cobrar_trabajo solo si hay
 * MercadoPago configurado (sin token, el link nunca se podría generar y el
 * agente terminaría prometiéndole al cliente algo que no va a llegar).
 */
function construirTools() {
  const extra = [];
  if (listarProfesionales().length > 1) extra.push(elegirProfesionalToolDef);
  if (mercadopagoActivo()) extra.push(cobrarTrabajoToolDef);
  return extra.length ? [...extra, ...TOOLS] : TOOLS;
}

async function ejecutarHerramienta(nombre, input, canal, sessionId) {
  const prof = profesionalActual(sessionId);
  const cuenta = cuentaActiva(); // los datos van a la cuenta SaaS activa ('default' en el modo clásico)
  switch (nombre) {
    case 'elegir_profesional': {
      const existe = listarProfesionales().some((p) => p.id === input.profesionalId);
      if (existe) profesionalPorSesion.set(sessionId, input.profesionalId);
      return JSON.stringify({ ok: existe, profesionalId: existe ? input.profesionalId : null });
    }
    case 'cotizar_trabajo': {
      const r = cotizar({ oficio: prof.oficio, ...input });
      if (r.error || !aprobacionRequerida()) {
        // Sin aprobación manual, el precio bueno es el que acaba de salir del
        // catálogo: se recuerda acá para que la cita use ESE y no el que
        // reescriba el modelo más adelante.
        if (!r.error) recordarCotizado(sessionId, input.trabajo, r.total, r.desglose);
        return JSON.stringify(r);
      }
      // El precio calculado es un SUGERIDO interno: el cliente no lo ve hasta
      // que el profesional lo apruebe (o ajuste) desde el Panel.
      const previa = await cotizacionDeSesion(sessionId, input.trabajo, cuenta);
      if (previa?.estado === 'aprobada') {
        // Sin el desglose calculado: el profesional ajustó el TOTAL a mano, así
        // que las partes viejas ya no suman ese número. Guardarlas igual le
        // daba al cliente un comprobante donde mano de obra + materiales dan
        // 1000 y el total dice 1500.
        recordarCotizado(sessionId, input.trabajo, previa.totalAprobado, null);
        return JSON.stringify({
          ...r,
          total: previa.totalAprobado,
          aprobado: true,
          nota_del_profesional: previa.nota || undefined,
          instruccion: 'Precio CONFIRMADO por el profesional: informáselo al cliente con su moneda y seguí el flujo normal.'
        });
      }
      if (previa?.estado === 'rechazada') {
        return JSON.stringify({
          requiere_aprobacion: true, estado: 'rechazada', cotizacion_id: previa.id,
          instruccion: 'El profesional prefirió no cotizar esto por chat: NO des ningún monto; decile al cliente que el profesional lo va a contactar directamente y ofrecé el teléfono de contacto.'
        });
      }
      if (previa?.estado === 'pendiente') {
        return JSON.stringify({
          requiere_aprobacion: true, estado: 'pendiente', cotizacion_id: previa.id,
          instruccion: 'Todavía sin confirmar: NO des montos. Decile al cliente que el profesional está confirmando el precio y seguí juntando los demás datos (dirección, teléfono, horarios tentativos).'
        });
      }
      // Teléfono del cliente: en WhatsApp/voz viene en el sessionId (que en el
      // modo SaaS puede llegar prefijado con la cuenta: "cta-xxx/wa:598...").
      const mTel = sessionId.match(/(?:^|\/)(?:wa|tel):(.+)$/);
      const telefono = mTel ? mTel[1] : (input.telefono || '');
      const oficios = listarOficios();
      const datosOficio = oficios.find((o) => o.clave === prof.oficio);
      const cot = await crearCotizacion({
        sessionId, canal, telefono,
        oficio: prof.oficio, oficioNombre: datosOficio?.nombre || prof.oficio,
        trabajo: input.trabajo,
        trabajoNombre: datosOficio?.trabajos.find((t) => t.clave === input.trabajo)?.nombre || input.trabajo,
        detalle: r
      }, cuenta);
      return JSON.stringify({
        requiere_aprobacion: true, estado: 'pendiente', cotizacion_id: cot.id,
        instruccion: 'La cotización quedó en manos del profesional: NO le digas ningún monto al cliente (ni aproximado). Explicale que el profesional confirma el precio enseguida y aprovechá para juntar teléfono y dirección. Cuando pregunte por el precio, volvé a llamar cotizar_trabajo para ver si ya está aprobado.'
      });
    }
    case 'geocodificar_direccion':
      return JSON.stringify(await geocodificar(input.direccion));
    case 'buscar_horarios_disponibles': {
      // Agenda real del día (con ubicación) de ESTE profesional, para calcular
      // el traslado hacia y desde sus citas vecinas — no solo la duración del
      // trabajo nuevo, y sin mezclar la agenda de otros profesionales del equipo.
      const citasDelDia = input.fecha ? await agendaDelDiaConUbicacion(input.fecha, undefined, prof.id, cuenta) : [];
      return JSON.stringify(proponerHorarios({ configuracion: configuracionDeProfesional(prof), ...input, citasDelDia }));
    }
    case 'confirmar_direccion_cliente': {
      let clienteId = input.clienteId;
      if (!clienteId && input.telefono) {
        const cli = await buscarClientePorTelefono(input.telefono, cuenta);
        clienteId = cli?.id;
      }
      if (!clienteId) return JSON.stringify({ ok: true, coincide: null, error: 'Cliente nuevo, no hay dirección previa registrada.' });
      return JSON.stringify(await confirmarDireccionCliente(clienteId, input.direccionInformada, input.lat, input.lng, cuenta));
    }
    case 'registrar_persona_receptora':
      return JSON.stringify({ registrado: true, ...input });
    case 'confirmar_cita': {
      // Primero la memoria de esta sesión; si no está, la cotización aprobada
      // que sí quedó guardada. Sin este respaldo, un cliente que cotiza el
      // lunes y confirma el martes —o que cae en otra instancia de Vercel—
      // perdía el precio que el profesional ya había aprobado y comunicado, y
      // la cita se guardaba sin monto.
      let cotizado = cotizadoPorSesion.get(claveCotizado(sessionId, input.trabajo));
      if (!cotizado) {
        const guardada = await cotizacionDeSesion(sessionId, input.trabajo, cuenta).catch(() => null);
        if (guardada?.estado === 'aprobada' && guardada.totalAprobado != null) {
          cotizado = { total: Number(guardada.totalAprobado) };
        }
      }
      const oficios = listarOficios();
      const datosOficio = oficios.find((o) => o.clave === prof.oficio);
      const trabajoNombre = datosOficio?.trabajos.find((t) => t.clave === input.trabajo)?.nombre || input.trabajo;
      let cita;
      try {
        cita = await crearCita({
        clienteNombre: input.clienteNombre,
        telefono: input.telefono,
        profesionalId: prof.id,
        oficio: prof.oficio,
        oficioNombre: datosOficio?.nombre || prof.oficio,
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
        // El monto NO sale de lo que mandó el modelo: sale de lo que el
        // cotizador calculó con el catálogo, o de lo que el profesional aprobó.
        // Si no hay ninguno de los dos, la cita se guarda SIN precio — mejor
        // que quede a acordar y no un número que nadie dio.
        cotizacion: cotizado ? { ...cotizado.desglose, total: cotizado.total } : null,
          canal
        }, cuenta);
      } catch (e) {
        // El horario se ocupó mientras se hablaba: no es un error del sistema,
        // es información que el agente tiene que usar para ofrecer otro turno.
        if (e.codigo === 'HORARIO_OCUPADO') {
          return JSON.stringify({
            ok: false, motivo: 'horario_ocupado',
            instruccion: 'Ese horario se ocupó recién. Pedile disculpas al cliente, volvé a llamar buscar_horarios_disponibles para ese día y ofrecele las opciones que queden libres.'
          });
        }
        throw e;
      }
      // Si el modelo trajo un total distinto del real, se avisa en el log: es
      // la señal de que estaba por informarle al cliente un precio inventado.
      if (input.totalCotizado != null && cotizado && Number(input.totalCotizado) !== cotizado.total) {
        console.warn(`[agente] confirmar_cita traía ${input.totalCotizado} pero el precio cotizado es ${cotizado.total} — se guardó el cotizado.`);
      }
      return JSON.stringify({
        ok: true, cita,
        total_guardado: cotizado ? cotizado.total : null,
        mensaje: `Cita confirmada para el ${cita.fecha} a las ${cita.inicio}.`,
        ...(cotizado ? {} : { aviso: 'La cita quedó SIN monto porque no hay una cotización hecha para este trabajo. No le confirmes ningún precio al cliente.' })
      });
    }
    case 'cobrar_trabajo': {
      // El monto NO sale del input: lo saca el servidor de la cotización que ya
      // tiene la cita. Igual que en confirmar_cita, el precio nunca puede venir
      // del modelo.
      const r = await generarLinkDeCobro(String(input.citaId || ''), input.email, cuenta);
      if (!r.ok) {
        return JSON.stringify({
          ok: false, error: r.error,
          instruccion: 'No pude generar el link de pago. No le prometas al cliente que le va a llegar: decile que el profesional se lo va a pasar y seguí normal.'
        });
      }
      if (r.yaPagado) {
        return JSON.stringify({ ok: true, yaPagado: true, instruccion: 'Ese trabajo ya está pagado: agradecele y no le mandes otro link.' });
      }
      return JSON.stringify({
        ok: true, link: r.link, monto: r.monto, moneda: r.moneda,
        instruccion: 'Pasale el link TAL CUAL, sin acortarlo ni cambiarlo, y aclarale el monto y la moneda. Cuando pague, la cita queda marcada como cobrada sola.'
      });
    }
    default:
      return `Herramienta desconocida: ${nombre}`;
  }
}

// ---------- Prompt del agente ----------

function buildSystem(sessionId) {
  const lista = listarProfesionales();
  const multiple = lista.length > 1;
  const prof = profesionalActual(sessionId);
  const marca = cfg('agenciaNombre') || cfg('nombreProfesional') || 'nuestro equipo';
  const intro = multiple
    ? `Sos el asistente virtual de ${marca}, un equipo con varios profesionales. Estos son los profesionales disponibles (id: nombre — oficio):\n${lista.map((p) => `- ${p.id}: ${p.nombre} — ${p.oficio}`).join('\n')}\nApenas identifiques por el pedido del cliente (o porque lo nombra) cuál corresponde, llamá a elegir_profesional con su id — una sola vez, antes de cotizar.`
    : `Sos el asistente virtual de ${prof.nombre}, que trabaja como ${prof.oficio}.`;
  return `${intro} Atendés clientes por WhatsApp, voz y webchat que quieren pedir un trabajo o servicio.

Flujo esperado en cada conversación:
1. Entendé qué necesita el cliente y a qué tipo de trabajo predefinido corresponde. Usá cotizar_trabajo apenas lo sepas — nunca inventes precios.
2. REGLA DE ORO del precio: la cotización es un sugerido que SIEMPRE aprueba el profesional. Si cotizar_trabajo devuelve requiere_aprobacion=true con estado "pendiente", NO menciones ningún monto (ni rango, ni aproximado): decile al cliente que el profesional le confirma el precio en unos minutos y seguí avanzando con los pasos 3-5 mientras tanto. Cuando el cliente pregunte por el precio, o antes de cerrar la cita, volvé a llamar cotizar_trabajo: solo cuando devuelva aprobado=true informá ese precio confirmado. Si devuelve el presupuesto directo (sin requiere_aprobacion), daselo antes de ofrecer horarios como siempre. Nunca confirmes una cita sin precio informado al cliente.
3. Pedí el teléfono y la dirección. Si el cliente comparte su UBICACIÓN (vas a ver algo como "[Ubicación compartida: lat X, lng Y — dirección aproximada: ...]" en su mensaje), esas coordenadas ya son exactas: no hace falta geocodificarlas, usalas directo. Si en cambio escribe la dirección a mano, pasala por geocodificar_direccion para obtener sus coordenadas antes de ofrecer horarios.
4. Confirmá la dirección con confirmar_direccion_cliente (pasale también lat/lng si ya los tenés) — si cambió respecto a la base, listo, ya quedó actualizada.
5. Preguntá si el titular va a estar presente; si no, registrá con registrar_persona_receptora el nombre de quien va a atender.
6. Ofrecé 2-3 horarios concretos con buscar_horarios_disponibles (necesita fecha, día de la semana, duración del trabajo y las coordenadas del cliente) — nunca preguntes "¿cuándo te queda bien?" en abstracto.
7. Cuando el cliente acepte un horario, cerrá todo con confirmar_cita (incluí lat/lng si los tenés, así queda guardado para la próxima vez).

Moneda y forma de cobro: cotizar_trabajo devuelve la moneda configurada (campo "moneda"/"simbolo") — mencioná siempre los montos con esa moneda, sin convertir. Si el resultado dice tipo_cobro "honorarios" (servicios profesionales: médicos, abogados, escribanos, psicólogos, contadores…), hablá de "honorarios profesionales", nunca de "mano de obra".

Idioma: RESPONDÉ SIEMPRE en ${NOMBRE_IDIOMA[idiomaActivo()]}. Es el idioma configurado (${monedaActiva().nombrePais}). Si el cliente te escribe en otro idioma, contestale igual en ${idiomaActivo() === 'pt' ? 'portugués de Brasil' : idiomaActivo() === 'en' ? 'English' : 'español'} salvo que insista en otro. Traducí también los nombres de trabajos y las frases hechas a ese idioma con naturalidad.

Tono y estilo: profesional pero cercano, claro y sin exclamaciones exageradas${idiomaActivo() === 'es' ? ' (en Uruguay/Argentina usá vos/tenés)' : ''}. Emojis con moderación (uno como máximo, o ninguno). Respuestas cortas tipo chat: 2-5 oraciones. En WhatsApp y voz, aún más breve. Si el trabajo no encaja en ningún tipo predefinido, decilo con honestidad y ofrecé una visita de diagnóstico. Si preguntan algo fuera del rubro, redirigí con amabilidad y ofrecé el teléfono ${telefonoProfesional()} para casos urgentes.`;
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
// Respuestas locales sin costo, para mostrar el flujo cuando no hay clave de
// Claude configurada. IMPORTANTE: nunca filtra detalles internos del servidor
// (ni "modo demo", ni "cargá tu clave") — el visitante ve un asistente normal.
// Para respuestas con IA real, configurá ANTHROPIC_API_KEY (env de Vercel o
// /config.html). El badge solo aparece si pedís DEMO_CON_BADGE=1 (uso interno).
const BADGE = process.env.DEMO_CON_BADGE ? '⚙️ [demo] ' : '';

// Estado mínimo por sesión para que la demo (sin IA) avance como una charla real.
const demoSesiones = new Map();
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Sinónimos coloquiales → clave de trabajo (por oficio, solo si esa clave existe).
const SINONIMOS = {
  instalacion_toma: ['toma', 'tomacorriente', 'tomacorrientes', 'enchufe', 'enchufes', 'zocalo', 'tomada', 'tomadas', 'outlet', 'socket', 'power point', 'receptacle'],
  instalacion_luminaria: ['luz', 'luces', 'lampara', 'foco', 'luminaria', 'artefacto', 'plafon', 'spot', 'aplique', 'dicroica', 'lampada', 'luminaria', 'luminarias', 'lustre', 'light', 'lights', 'lamp', 'fixture', 'ceiling light'],
  cambio_tablero: ['tablero', 'termica', 'llave termica', 'disyuntor', 'breaker', 'diferencial', 'quadro', 'disjuntor', 'panel', 'breaker box', 'fuse box', 'switchboard'],
  cortocircuito: ['corto', 'cortocircuito', 'chispa', 'se corta la luz', 'salta la llave', 'no hay luz', 'huele a quemado', 'curto', 'curto-circuito', 'faisca', 'sem luz', 'cheiro de queimado', 'short circuit', 'spark', 'no power', 'power out', 'burning smell', 'tripped'],
  diagnostico: ['diagnostico', 'revisar', 'revision', 'ver que pasa', 'presupuesto general', 'diagnostico', 'revisao', 'orcamento geral', 'diagnosis', 'inspection', 'check', 'assessment'],
  destape: ['destap', 'tapado', 'tapada', 'canaleta', 'entupido', 'entupida', 'desentupir', 'clogged', 'blocked', 'unclog', 'drain'],
  perdida: ['perdida', 'gotea', 'gotera', 'fuga', 'pierde agua', 'vazamento', 'goteira', 'pinga', 'vaza agua', 'leak', 'leaking', 'dripping', 'water leak'],
};

/** Detecta el trabajo pedido dentro del catálogo del oficio (sinónimos + tokens del nombre). */
function detectarTrabajo(oficio, texto) {
  const t = norm(texto);
  for (const [clave, palabras] of Object.entries(SINONIMOS)) {
    if (oficio.trabajos.some((tr) => tr.clave === clave) && palabras.some((p) => t.includes(p))) return clave;
  }
  for (const tr of oficio.trabajos) {
    const toks = norm(tr.nombre).split(/[^a-z0-9]+/).filter((w) => w.length >= 5);
    if (toks.some((w) => t.includes(w))) return tr.clave;
  }
  return null;
}

const tieneDireccion = (t) => /\d{2,}/.test(t) && /[a-záéíóúãõç]{3,}/i.test(t) && !/(cuanto|precio|cuesta|sale|quanto|preco|custa|how much|price|cost)/i.test(t);
const quiereHorario = (t) => /(turno|horario|agend|cita|cuando|dispon|manana|mañana|semana|lunes|martes|miercoles|jueves|viernes|sabado|hoy|tarde|horario|marcar|quando|disponivel|amanha|segunda|terca|quarta|quinta|sexta|sabado|hoje|appointment|schedule|book|slot|available|when|today|tomorrow|this week|monday|tuesday|wednesday|thursday|friday|saturday)/.test(norm(t));
const confirma = (t) => /(^| )(si|dale|listo|confirm|de una|perfecto|va|ok|okey|sim|isso|fechado|combinado|beleza|pode ser|yes|yeah|sure|go ahead|sounds good|perfect|confirmed)( |$|\.|,|!)/.test(norm(t));
const saluda = (t) => /(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|que tal|ola|oi|bom dia|boa tarde|boa noite|tudo bem|hi|hello|hey|good morning|good afternoon|good evening)/.test(norm(t));

// `_canal` se recibe por simetría con conversar(), pero la respuesta de demo es
// la misma para WhatsApp/voz/web. Se deja en la firma para no cambiar la aridad
// en los 4 call sites.
function responderDemo(sessionId, texto, _canal) {
  const prof = listarProfesionales()[0];
  const oficios = listarOficios();
  const propio = oficios.find((o) => o.clave === prof.oficio) || oficios[0];
  const st = demoSesiones.get(sessionId) || {};
  const t = norm(texto);
  const idi = idiomaActivo();
  // Elige la frase según el idioma activo (es | pt | en). El 3º arg es opcional:
  // si no hay inglés, cae al español.
  const L = (es, ptt, en) => (idi === 'pt' ? ptt : idi === 'en' ? (en ?? es) : es);
  const nombreServicio = (clave) => propio.trabajos.find((x) => x.clave === clave)?.nombre || L('el trabajo', 'o serviço', 'the job');
  const cotizarDe = (clave) => cotizar({ oficio: propio.clave, trabajo: clave, distanciaKm: 5 });
  const guardar = () => demoSesiones.set(sessionId, st);

  // 1) ¿Menciona un trabajo? Cotizamos ESE (no siempre el primero).
  const trabajo = detectarTrabajo(propio, texto);
  if (trabajo) st.trabajo = trabajo;

  // 2) ¿Dio una dirección?
  if (tieneDireccion(texto)) st.direccion = texto.trim();

  // Helper: proponer horarios (cuando ya sabemos el trabajo).
  const proponerSlots = () => {
    st.propuso = true; guardar();
    const dir = st.direccion ? L(` en ${st.direccion}`, ` em ${st.direccion}`, ` at ${st.direccion}`) : '';
    return L(
      `${BADGE}Genial. Para "${nombreServicio(st.trabajo)}"${dir} tengo estos horarios: mañana 9:30–10:30, mañana 15:00–16:00 o pasado 11:00–12:00. ¿Cuál te queda mejor? (Los calculamos considerando el traslado hasta tu zona.)`,
      `${BADGE}Ótimo. Para "${nombreServicio(st.trabajo)}"${dir} tenho estes horários: amanhã 9:30–10:30, amanhã 15:00–16:00 ou depois de amanhã 11:00–12:00. Qual fica melhor? (Calculamos considerando o deslocamento até a sua região.)`,
      `${BADGE}Great. For "${nombreServicio(st.trabajo)}"${dir} I have these slots: tomorrow 9:30–10:30 am, tomorrow 3:00–4:00 pm, or the day after 11:00 am–12:00 pm. Which works best? (We calculate them factoring travel to your area.)`
    );
  };

  // Confirmó un horario ya propuesto → cerramos (demo).
  if (st.propuso && confirma(texto)) {
    demoSesiones.delete(sessionId);
    return L(
      `${BADGE}¡Listo! Quedó agendado ✅ Te llega la confirmación por WhatsApp y, si el profesional se demora, te avisamos antes. ¡Gracias! (Demo — en la versión real esto queda cargado en la agenda y el CRM.)`,
      `${BADGE}Pronto! Ficou agendado ✅ Você recebe a confirmação pelo WhatsApp e, se o profissional atrasar, avisamos antes. Obrigado! (Demo — na versão real isto fica registrado na agenda e no CRM.)`,
      `${BADGE}Done! You're booked ✅ You'll get the confirmation on WhatsApp and, if the pro runs late, we'll let you know ahead. Thanks! (Demo — in the real version this is saved to the calendar and CRM.)`
    );
  }

  // Pidió/mencionó un trabajo → cotizamos y encaminamos hacia el horario.
  if (trabajo || (st.trabajo && /(cuanto|precio|presupuesto|cotiz|cuesta|sale|quanto|preco|orcamento|custa|how much|price|quote|cost)/.test(t))) {
    const r = cotizarDe(st.trabajo);
    st.cotizado = true; guardar();
    const sig = st.direccion
      ? L(' ¿Te propongo horarios?', ' Quer que eu proponha horários?', ' Want me to propose times?')
      : L(' Pasame tu dirección y qué día te viene bien, y te doy 2-3 horarios.', ' Me passe seu endereço e que dia fica bom, e te dou 2-3 horários.', ' Send me your address and what day works, and I\'ll give you 2-3 slots.');
    return L(
      `${BADGE}"${r.trabajo}" ronda los ${r.simbolo || '$'}${r.total} (${r.moneda}), con una duración estimada de ${r.duracion_estimada_min} min. El precio final lo confirma ${prof.nombre}.${sig}`,
      `${BADGE}"${r.trabajo}" fica em torno de ${r.simbolo || '$'}${r.total} (${r.moneda}), com duração estimada de ${r.duracion_estimada_min} min. O preço final é confirmado por ${prof.nombre}.${sig}`,
      `${BADGE}"${r.trabajo}" is around ${r.simbolo || '$'}${r.total} (${r.moneda}), with an estimated duration of ${r.duracion_estimada_min} min. ${prof.nombre} confirms the final price.${sig}`
    );
  }

  // Pidió horario: si ya sabemos el trabajo, proponemos; si no, lo pedimos.
  if (quiereHorario(texto)) {
    if (st.trabajo) return proponerSlots();
    guardar();
    return L(
      `${BADGE}Con gusto coordino. ¿Qué trabajo necesitás? (por ejemplo: instalar un tomacorriente, colocar una luminaria, revisar el tablero). Con eso y tu dirección te propongo horarios.`,
      `${BADGE}Com prazer coordeno. Qual serviço você precisa? (por exemplo: instalar uma tomada, colocar uma luminária, revisar o quadro). Com isso e seu endereço te proponho horários.`,
      `${BADGE}Happy to coordinate. What job do you need? (for example: install an outlet, fit a light fixture, check the panel). With that and your address I'll propose times.`
    );
  }

  // Dio dirección sin trabajo aún.
  if (st.direccion && !st.trabajo) {
    guardar();
    return L(
      `${BADGE}¡Anotada la dirección! ¿Qué necesitás que haga ${prof.nombre}? Contame el trabajo y te paso presupuesto y horarios.`,
      `${BADGE}Endereço anotado! O que você precisa que ${prof.nombre} faça? Me conte o serviço e te passo orçamento e horários.`,
      `${BADGE}Address saved! What do you need ${prof.nombre} to do? Tell me the job and I'll give you a quote and times.`
    );
  }

  if (saluda(texto) || !texto.trim()) {
    return L(
      `${BADGE}¡Hola! Soy el asistente de ${prof.nombre} (${propio?.nombre || prof.oficio}). Contame qué necesitás —por ejemplo "instalar un tomacorriente"— y te paso presupuesto y horarios. 😊`,
      `${BADGE}Olá! Sou o assistente de ${prof.nombre} (${propio?.nombre || prof.oficio}). Me conte o que você precisa —por exemplo "instalar uma tomada"— e te passo orçamento e horários. 😊`,
      `${BADGE}Hi! I'm ${prof.nombre}'s assistant (${propio?.nombre || prof.oficio}). Tell me what you need —for example "install an outlet"— and I'll give you a quote and times. 😊`
    );
  }

  // No entendimos el trabajo: ofrecemos ejemplos reales del catálogo.
  const ejemplos = propio.trabajos.slice(0, 3).map((x) => `“${x.nombre}”`).join(', ');
  guardar();
  return L(
    `${BADGE}Puedo ayudarte con trabajos como ${ejemplos}. Decime cuál necesitás (o contame el problema) y te paso presupuesto y horarios.`,
    `${BADGE}Posso te ajudar com serviços como ${ejemplos}. Me diga qual você precisa (ou conte o problema) e te passo orçamento e horários.`,
    `${BADGE}I can help with jobs like ${ejemplos}. Tell me which one you need (or describe the problem) and I'll give you a quote and times.`
  );
}

// ---------- Conversación con Claude ----------

/**
 * Procesa un mensaje del cliente y devuelve la respuesta del agente.
 * @param {string} sessionId — identificador estable del cliente (ej: wa:+598..., web:uuid, tel:+598...)
 * @param {string} texto — mensaje del cliente
 * @param {string} canal — 'webchat' | 'whatsapp' | 'telefono' | 'voz'
 */
/** ¿La cuenta activa consume créditos del vendedor? (usa la key global, no la propia). */
function modoCreditos() {
  if (!creditosHabilitado() || cuentaActiva() === 'default') return false;
  const ov = overridesActivos();
  const campo = { claude: 'anthropicApiKey', openai: 'openaiApiKey', gemini: 'geminiApiKey' }[proveedorActivo()];
  return !(ov && ov[campo]); // sin key propia → usa la del vendedor → consume créditos
}

export async function conversar(sessionId, texto, canal = 'webchat') {
  if (!iaConfigurada()) return responderDemo(sessionId, texto, canal);
  // El agente con IA es lo que separa al plan Full del Básico (ver store/plan.js:
  // hasta ahora el plan venía firmado adentro de la licencia y NADIE lo miraba).
  // Se cae a la lógica local, igual que sin API key: el cliente del profesional
  // siempre recibe una respuesta y nunca ve un texto sobre licencias. Va acá, en
  // el único punto por el que pasan los cuatro canales (webchat, WhatsApp, voz y
  // voz premium), para que no se pueda agregar un canal nuevo y olvidarlo.
  if (!incluyeAgenteIA()) return responderDemo(sessionId, texto, canal);
  // Modo créditos: si la cuenta se quedó sin saldo, atendemos con la lógica
  // local (sin costo) en vez de cortar — el cliente nunca ve un error; el
  // profesional recarga para volver a la IA completa.
  const conCreditos = modoCreditos();
  if (conCreditos && !(await haySaldo(cuentaActiva()))) return responderDemo(sessionId, texto, canal);

  // En el modo SaaS las sesiones se aíslan por cuenta: el mismo cliente
  // (wa:598...) hablando con dos profesionales distintos son DOS charlas.
  if (cuentaActiva() !== 'default' && !sessionId.startsWith(`${cuentaActiva()}/`)) {
    sessionId = `${cuentaActiva()}/${sessionId}`;
  }
  const mensajes = historial(sessionId);
  const marcaTurno = mensajes.length;
  mensajes.push({ role: 'user', content: texto });

  try {
    let respuesta;
    for (let i = 0; i < 8; i++) {
      respuesta = await chatearLLM({
        system: buildSystem(sessionId),
        tools: construirTools(),
        mensajes
      });
      registrarUso(respuesta.usage, cuentaActiva());
      if (conCreditos) {
        const gasto = await consumir(cuentaActiva(), respuesta.usage);
        // Primera vez que el saldo cruza el umbral bajo → email al profesional
        // (fire-and-forget: jamás frena la conversación con el cliente).
        if (gasto?.cruzoUmbral) {
          import('../store/emails.js')
            .then((m) => m.avisarCreditosBajos(cuentaActiva(), gasto.saldo))
            .catch(() => {});
        }
      }

      mensajes.push({ role: 'assistant', content: respuesta.content });

      if (respuesta.stop_reason === 'tool_use') {
        const resultados = await Promise.all(
          respuesta.content
            .filter((b) => b.type === 'tool_use')
            .map(async (b) => ({
              type: 'tool_result',
              tool_use_id: b.id,
              content: await ejecutarHerramienta(b.name, b.input, canal, sessionId)
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
    // Cualquier error de la IA (Claude/OpenAI/Gemini) — típicamente una key mal
    // configurada (401) o el proveedor caído: en vez de dejar al cliente con un
    // error, degradamos con elegancia a la lógica local (cotiza y agenda igual).
    // El profesional ve el error en los logs y corrige su key/saldo.
    if (err instanceof Anthropic.APIError || err instanceof LLMError) {
      console.error('[agente] Error de IA (se cae a lógica local):', err.status || '', err.message);
      return responderDemo(sessionId, texto, canal);
    }
    console.error('[agente] Error inesperado (se cae a lógica local):', err?.message || err);
    return responderDemo(sessionId, texto, canal);
  }
}

export { TOOLS, construirTools, listarOficios };
