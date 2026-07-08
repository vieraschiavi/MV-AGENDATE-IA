import React, { useRef, useState } from 'react';

const PASOS = [
  ['Cargá tu API key de Claude', <>En <code>/config.html</code> pegá tu clave de <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a>. Sin ella el programa corre en modo demo (todo se puede probar igual).</>],
  ['Elegí tu oficio y tus datos', 'Nombre, país (define tu moneda) y tu profesión — hay 18 precargadas y podés crear la tuya: médicos, abogados, talleres, lo que sea. El chatbot atiende en tu nombre.'],
  ['Ajustá jornada y descansos', 'Horario laboral, almuerzo y días libres. La agenda nunca ofrece horarios fuera de eso, y suma el tiempo de traslado real entre citas.'],
  ['Revisá tus precios', <>El agente cotiza solo con tu catálogo (<code>src/data/oficios.json</code>) — nunca inventa un número. Ajustá los valores de referencia a tus precios reales.</>],
  ['Conectá tus canales', 'WhatsApp (Meta Cloud API) y/o teléfono (Twilio) desde la misma pantalla de configuración, con botón de prueba. El webchat ya funciona sin configurar nada.'],
  ['Probalo', <>Mandá un mensaje de prueba desde <code>/config.html</code> o simulá un cliente completo en <code>/demo.html</code>. Después gestioná todo desde el Panel del día, Agenda, Clientes y Dashboards (menú de la izquierda).</>],
];

const TEMAS = [
  ['🔑 Primeros pasos', <>Abrí <code>/config.html</code>, pegá tu API key de Claude, elegí oficio y nombre, ajustá jornada/almuerzo/días libres y probá el chatbot desde la misma página. Todo se aplica al instante, sin reiniciar.</>],
  ['💰 Cotizador y precios', <>El agente cotiza solo con tu catálogo (mano de obra + materiales + traslado) y nunca inventa números. Hay 18 profesiones precargadas y podés crear la tuya; la IA puede investigar los precios de mercado de tu país y sugerirte los valores (<code>/config.html</code>).</>],
  ['🗓️ Agenda con traslados', <>Propone horarios sumando el viaje real hacia y desde las citas vecinas, y respeta jornada, almuerzo y días libres. Vista Tabla o Tablero (kanban por estado), con exportación CSV/Excel. Las direcciones se geocodifican solas (gratis) y las ubicaciones compartidas por WhatsApp se usan directo.</>],
  ['📲 Conectar WhatsApp', <>Creá una app de WhatsApp Business en Meta for Developers, cargá Token / Phone Number ID / Verify Token en <code>/config.html</code> y apuntá el webhook a <code>https://tu-dominio/webhook/whatsapp</code>. Hay botón de prueba de conexión. Meta solo permite texto libre dentro de las 24 h del último mensaje del cliente.</>],
  ['📞 ChatVoice (teléfono)', <>Vía rápida: Twilio + voz neural — comprás el número desde <code>/config.html</code> sin entrar a Twilio. Premium: Deepgram (tiempo real) + voz Piper es_AR-daniela (rioplatense, gratis, offline — <code>promo/instalar-voz.sh</code>) o ElevenLabs (voz clonada). La premium requiere PC/VPS; en Vercel funciona la vía rápida.</>],
  ['⏰ Aviso de retraso', <>Si un trabajo "en curso" te va a hacer llegar 30+ min tarde a la próxima cita, el sistema le avisa solo por WhatsApp al próximo cliente. En PC corre cada 5 min; en Vercel hace falta un cron externo gratuito (cron-job.org o GitHub Actions, ver docs/CANALES.md) porque los Cron Jobs nativos de Vercel Hobby están limitados a 1 vez por día. Forzalo cuando quieras desde el Panel del día.</>],
  ['📊 Dashboards y export', 'Trabajos por día/semana/mes/año, comparativas mes a mes y año contra año, facturación y ticket promedio, con filtros (incluido por profesional). Exportación CSV/Excel de agenda y clientes respetando filtros; ficha imprimible/PDF por cita.'],
  ['👥 CRM de clientes', 'Página por cliente con contacto, dirección (confirmación + geocoding automático), receptor habitual, notas e historial de trabajos. El agente confirma dirección y receptor en cada conversación y actualiza la ficha solo.'],
  ['👷 Equipo (varios profesionales)', <>En <code>/config.html</code> → Equipo cargá varios profesionales (ej. 3 electricistas), cada uno con su oficio y jornada. El chatbot identifica cuál corresponde antes de cotizar y cada uno agenda sobre su propia agenda. Con uno solo, nada cambia.</>],
  ['✅ Aprobación de cotizaciones', <>El precio que calcula el asistente es un sugerido: el chatbot no le dice ningún monto al cliente hasta que vos lo apruebes (o ajustes) desde el Panel del día → "Cotizaciones por aprobar". Te llega un aviso por WhatsApp con cada pendiente, y al aprobar el cliente recibe el precio confirmado al instante. Si preferís precio directo sin aprobación, cambialo en <code>/config.html</code>.</>],
  ['👤 Cuenta online (SaaS)', <>Usá el programa desde el navegador sin instalar nada: en el menú → "Cuenta online" te registrás con email y contraseña (14 días de prueba gratis, después USD 15/mes por MercadoPago). Tus clientes, citas, dashboards y también tu configuración (profesión, país/moneda, precios, horarios, equipo) son propios y aislados; hasta podés conectar tu propio WhatsApp Business y tu API key de Claude para que TU asistente atienda tu número.</>],
  ['💳 Planes y compra', <>Básico USD 129 (agenda + cotizador + CRM + dashboards + app) y Full USD 299 (+ chatbot/ChatVoice con IA + aviso de retraso), ambos pago único en <code>/comprar.html</code> vía MercadoPago o transferencia — o la cuenta online SaaS por USD 15/mes. El plan Full usa tus propias cuentas de Claude/WhatsApp/Twilio (costo de uso aparte, sin markup).</>],
  ['📱 App Android / PC', <>PWA instalable sin Play Store ("Agregar a pantalla de inicio") y scripts para generar el APK en <code>movil/</code>. En PC: <code>npm start</code>.</>],
  ['☁️ Deploy en Vercel', <>El repo trae <code>vercel.json</code> listo (estático + serverless + Cron del aviso de retraso). Sumá Redis de Upstash para persistencia. El ChatVoice premium requiere servidor persistente; todo lo demás funciona completo en Vercel.</>],
  ['🔒 Seguridad', <>Definí la clave de administración en <code>/config.html</code> → Seguridad (protege panel y escrituras). Los secretos nunca se muestran de vuelta. Para vender copias con tu clave embebida: <code>npm run embeber-clave</code>.</>],
];

const SUGERENCIAS = ['¿Cómo conecto WhatsApp?', '¿Qué incluye cada plan?', '¿Cómo cargo mis precios?', '¿Funciona sin internet la voz?', '¿Cómo agrego otro profesional?'];

export default function Ayuda() {
  const [msgs, setMsgs] = useState([
    { de: 'ia', texto: 'Hola 👋 Soy el asistente de ayuda de MV Agendate IA. Preguntame lo que quieras sobre el programa: cómo configurarlo, conectar WhatsApp, los planes, la agenda…' },
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
    setMsgs((m) => [...m, { de: 'yo', texto: t }, { de: 'ia', texto: 'Pensando…' }]);
    try {
      const d = await fetch('/api/ayuda', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensaje: t, sessionId: sessionRef.current }),
      }).then((r) => r.json());
      sessionRef.current = d.sessionId || sessionRef.current;
      setMsgs((m) => [...m.slice(0, -1), { de: 'ia', texto: d.respuesta || d.error || 'No pude responder, probá de nuevo.' }]);
      setBadge(d.ia ? '✓ Respondiendo con IA (Claude)' : 'Respondiendo desde la guía local — cargá tu API key en /config.html para IA.');
    } catch {
      setMsgs((m) => [...m.slice(0, -1), { de: 'ia', texto: 'Error de conexión — revisá que el servidor esté corriendo y probá de nuevo.' }]);
    }
    setEnviando(false);
    setTimeout(() => { msgsRef.current?.scrollTo(0, msgsRef.current.scrollHeight); }, 50);
  };

  return (
    <>
      <div className="mv-pagehead">
        <div><div className="mv-crumb">Espacio de trabajo</div><h1>❓ Ayuda</h1></div>
      </div>
      <div className="mv-content">
        <div className="grid2" style={{ alignItems: 'start' }}>
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <h2 className="mv-h">🚀 Tutorial — primeros pasos</h2>
              <div className="pasos">
                {PASOS.map(([titulo, cuerpo], i) => (
                  <div className="paso" key={i}><div><strong>{titulo}</strong><p>{cuerpo}</p></div></div>
                ))}
              </div>
            </div>
            <div className="card">
              <h2 className="mv-h">📖 Guía por tema</h2>
              {TEMAS.map(([t, c], i) => (
                <details className="tema" key={i}>
                  <summary>{t}</summary>
                  <div className="cuerpo">{c}</div>
                </details>
              ))}
            </div>
          </div>

          <div className="card">
            <h2 className="mv-h">🤖 Preguntale a la IA sobre el programa</h2>
            <p style={{ fontSize: '.83rem', color: 'var(--muted)', margin: '0 0 8px' }}>
              Respuestas al instante sobre configuración, canales, agenda, planes y todo lo demás. Sin API key cargada responde desde la guía local.
            </p>
            <div className="chat">
              <div className="msgs" ref={msgsRef}>
                {msgs.map((m, i) => <div key={i} className={`burb ${m.de}`}>{m.texto}</div>)}
              </div>
              <div className="entrada">
                <input
                  placeholder="Ej: ¿cómo conecto WhatsApp?" maxLength={500} value={pregunta}
                  onChange={(e) => setPregunta(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') enviar(); }}
                />
                <button className="btn cel" onClick={() => enviar()}>Enviar</button>
              </div>
              <div className="sugerencias">
                {SUGERENCIAS.map((s) => <button key={s} type="button" onClick={() => enviar(s)}>{s}</button>)}
              </div>
              {badge && <div className="ia-badge">{badge}</div>}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
