// © 2026 Martín Viera. Todos los derechos reservados.
import React, { useRef, useState } from 'react';
import { t as i18nT } from '../i18n.js';

const PASOS = [
  ['Cargá tu clave de Claude (la IA)', <>En Configuración pegá tu clave de <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">Claude/Anthropic</a> (se consigue gratis en unos minutos). Sin ella el programa igual corre en modo demo, para que pruebes todo.</>],
  ['Elegí tu oficio y tus datos', 'Nombre, país (define tu moneda) y tu profesión — hay 18 precargadas y podés crear la tuya: médicos, abogados, talleres, lo que sea. El chatbot atiende en tu nombre.'],
  ['Ajustá jornada y descansos', 'Horario laboral, almuerzo y días libres. La agenda nunca ofrece horarios fuera de eso, y suma el tiempo de traslado real entre citas.'],
  ['Revisá tus precios', 'El asistente cotiza solo con tu propia lista de precios — nunca inventa un número. Ajustá los valores de referencia a tus precios reales antes de atender clientes.'],
  ['Conectá tus canales', 'WhatsApp y/o teléfono desde la misma pantalla de Configuración, con un botón para probar que quedó bien conectado. El chat de la web ya funciona sin configurar nada.'],
  ['Probalo', 'Mandá un mensaje de prueba desde la misma pantalla de Configuración, o probá una conversación completa en la Demo. Después gestioná todo desde el Panel del día, Agenda, Clientes y Dashboards (menú de la izquierda).'],
];

const TEMAS = [
  ['🔑 Primeros pasos', 'Entrá a Configuración, pegá tu clave de Claude, elegí tu oficio y tu nombre, ajustá tu horario/almuerzo/días libres y probá el chatbot ahí mismo. Todo se aplica al toque, no hace falta reiniciar nada.'],
  ['💰 Cotizador y precios', 'El asistente cotiza solo con tu propia lista de precios (mano de obra + materiales + traslado) y nunca inventa números. Hay 18 profesiones precargadas y podés crear la tuya; la IA puede investigar los precios de mercado de tu país y sugerirte valores.'],
  ['🗓️ Agenda con traslados', 'Propone horarios sumando cuánto tardás en llegar de una cita a la otra, y respeta tu horario, almuerzo y días libres. Vista en lista o en tablero, con exportación a Excel. Las direcciones se ubican solas, y si el cliente comparte su ubicación por WhatsApp, se usa directo.'],
  ['📲 Conectar WhatsApp', 'Primero necesitás una cuenta de WhatsApp Business (gratis, se crea en unos minutos desde la web de Meta/Facebook). Con eso listo, pegás los datos en Configuración → Canales y probás la conexión con un botón. Un detalle: WhatsApp solo deja mandar mensajes libres dentro de las 24 horas después de que el cliente te escribió por última vez.'],
  ['📞 ChatVoice (teléfono)', 'Comprás un número de teléfono directo desde Configuración, sin entrar a ningún otro sitio. También existe una versión con voz más natural y en tiempo real, pero necesita que el programa corra en tu computadora o un servidor propio — en la versión online funciona la versión estándar.'],
  ['⏰ Aviso de retraso', 'Si marcás un trabajo "en curso" y vas a llegar 30 minutos tarde o más a la próxima cita, el sistema le avisa solo por WhatsApp al próximo cliente. No tenés que hacer nada — funciona en segundo plano. Forzalo cuando quieras desde el Panel del día.'],
  ['📊 Dashboards y export', 'Trabajos por día/semana/mes/año, comparado con otros períodos, facturación y ticket promedio, con filtros (incluido por profesional). Exportación a Excel de agenda y clientes; ficha imprimible/PDF por cita.'],
  ['👥 CRM de clientes', 'Página por cliente con contacto, dirección (confirmada y ubicada sola), quién suele recibir, notas e historial de trabajos. El asistente confirma la dirección y el receptor en cada conversación y actualiza la ficha solo.'],
  ['👷 Equipo (varios profesionales)', 'En Configuración → Equipo cargá varios profesionales (ej. 3 electricistas), cada uno con su oficio y su horario. El chatbot identifica solo a quién le corresponde cada trabajo, y cada uno tiene su propia agenda. Si trabajás solo, nada cambia.'],
  ['✅ Aprobación de cotizaciones', 'El precio que calcula el asistente es un sugerido: el chatbot no le dice ningún monto al cliente hasta que vos lo apruebes (o lo ajustes) desde el Panel del día → "Cotizaciones por aprobar". Te llega un aviso por WhatsApp con cada pendiente, y al aprobar, el cliente recibe el precio confirmado al instante. Si preferís precio directo sin aprobación, podés cambiarlo en Configuración.'],
  ['👤 Cuenta online (SaaS)', 'Usá el programa desde el navegador sin instalar nada: en el menú → "Cuenta online" te registrás con email y contraseña (14 días de prueba gratis, después una cuota mensual chica por MercadoPago). Tus clientes, citas, dashboards y tu configuración quedan privados; hasta podés conectar tu propio WhatsApp para que TU asistente atienda tu número.'],
  ['💳 Planes y compra', 'Básico USD 129 (agenda + cotizador + CRM + dashboards + app) y Full USD 299 (+ chatbot y teléfono con IA + aviso de retraso), ambos pago único por MercadoPago — o la cuenta online por USD 15/mes. Con el plan Full, el costo de que la IA converse por WhatsApp o teléfono corre aparte (normalmente USD 20-50/mes según el uso), directo a esos servicios, sin que el programa te cobre de más.'],
  ['📱 App Android / PC', 'Se puede usar como app en el celular sin bajarla de Play Store: entrá al sitio desde el navegador y elegí "Agregar a pantalla de inicio". También hay una versión instalable para PC.'],
  ['🔒 Seguridad', 'Podés poner una contraseña extra en Configuración → Seguridad para que nadie más entre a cambiar tus datos, aunque tenga acceso a tu computadora o al link. Tus claves nunca se vuelven a mostrar una vez guardadas.'],
];

const SUGERENCIAS = ['¿Cómo conecto WhatsApp?', '¿Qué incluye cada plan?', '¿Cómo cargo mis precios?', '¿Funciona sin internet la voz?', '¿Cómo agrego otro profesional?'];

export default function Ayuda() {
  const [msgs, setMsgs] = useState([
    { de: 'ia', texto: i18nT('Hola 👋 Soy el asistente de ayuda de MV Agendate IA. Preguntame lo que quieras sobre el programa: cómo configurarlo, conectar WhatsApp, los planes, la agenda…') },
  ]);
  const [pregunta, setPregunta] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [badge, setBadge] = useState('');
  const sessionRef = useRef(null);
  const msgsRef = useRef(null);

  const enviar = async (texto) => {
    const t = (texto ?? pregunta).trim();
    if (!t || enviando) return;
    setEnviando(true);
    setPregunta('');
    setMsgs((m) => [...m, { de: 'yo', texto: t }, { de: 'ia', texto: i18nT('Pensando…') }]);
    try {
      const d = await fetch('/api/ayuda', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensaje: t, sessionId: sessionRef.current }),
      }).then((r) => r.json());
      sessionRef.current = d.sessionId || sessionRef.current;
      setMsgs((m) => [...m.slice(0, -1), { de: 'ia', texto: d.respuesta || d.error || i18nT('No pude responder, probá de nuevo.') }]);
      setBadge(d.ia ? '✓ Respondiendo con IA (Claude)' : 'Respondiendo desde la guía local — cargá tu clave de Claude en Configuración para respuestas con IA.');
    } catch {
      setMsgs((m) => [...m.slice(0, -1), { de: 'ia', texto: i18nT('Error de conexión — revisá que el servidor esté corriendo y probá de nuevo.') }]);
    }
    setEnviando(false);
    setTimeout(() => { msgsRef.current?.scrollTo(0, msgsRef.current.scrollHeight); }, 50);
  };

  return (
    <>
      <div className="mv-pagehead">
        <div><div className="mv-crumb">{i18nT('Espacio de trabajo')}</div><h1>❓ {i18nT('Ayuda')}</h1></div>
      </div>
      <div className="mv-content">
        <div className="grid2" style={{ alignItems: 'start' }}>
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <h2 className="mv-h">{i18nT('🚀 Tutorial — primeros pasos')}</h2>
              <div className="pasos">
                {PASOS.map(([titulo, cuerpo], i) => (
                  <div className="paso" key={i}><div><strong>{titulo}</strong><p>{cuerpo}</p></div></div>
                ))}
              </div>
            </div>
            <div className="card">
              <h2 className="mv-h">{i18nT('📖 Guía por tema')}</h2>
              {TEMAS.map(([t, c], i) => (
                <details className="tema" key={i}>
                  <summary>{t}</summary>
                  <div className="cuerpo">{c}</div>
                </details>
              ))}
            </div>
          </div>

          <div className="card">
            <h2 className="mv-h">{i18nT('🤖 Preguntale a la IA sobre el programa')}</h2>
            <p style={{ fontSize: '.83rem', color: 'var(--muted)', margin: '0 0 8px' }}>
              {i18nT('Respuestas al instante sobre configuración, canales, agenda, planes y todo lo demás. Sin la clave de Claude cargada responde igual, desde la guía local.')}
            </p>
            <div className="chat">
              <div className="msgs" ref={msgsRef}>
                {msgs.map((m, i) => <div key={i} className={`burb ${m.de}`}>{m.texto}</div>)}
              </div>
              <div className="entrada">
                <input
                  placeholder={i18nT('Ej: ¿cómo conecto WhatsApp?')} maxLength={500} value={pregunta}
                  onChange={(e) => setPregunta(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') enviar(); }}
                />
                <button className="btn cel" onClick={() => enviar()}>{i18nT('Enviar')}</button>
              </div>
              <div className="sugerencias">
                {SUGERENCIAS.map((s) => <button key={s} type="button" onClick={() => enviar(s)}>{i18nT(s)}</button>)}
              </div>
              {badge && <div className="ia-badge">{badge}</div>}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
