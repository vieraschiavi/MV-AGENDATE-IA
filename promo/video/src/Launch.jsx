import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  Img,
  Audio,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from 'remotion';

export const WIDTH = 1080;
export const HEIGHT = 1920;
export const FPS = 30;

// ---------- Línea de tiempo ----------
// Todas las escenas se encadenan con un solape de OVERLAP frames: mientras una
// termina de desvanecerse la siguiente ya está entrando — nunca hay un corte a
// negro ni un cuadro "muerto" sin contenido.
const OVERLAP = 15;
const ESCENAS = [
  { key: 'hook', len: 150 },       // 5s  — titular
  { key: 'whatsapp', len: 330 },   // 11s — chat animado (la IA atiende y agenda)
  { key: 'cotizador', len: 240 },  // 8s  — cotizador con precios de mercado
  { key: 'agenda', len: 270 },     // 9s  — agenda optimizada por distancia/tipo/disponibilidad
  { key: 'ficha', len: 210 },      // 7s  — ficha de trabajo imprimible/PDF
  { key: 'tableros', len: 300 },   // 10s — clientes por día/semana/mes + evolución + facturación
  { key: 'crm', len: 210 },        // 7s  — ficha e historial por cliente
  { key: 'cierre', len: 270 },     // 9s  — pago único MercadoPago + CTA
];
// Comienzos acumulados (cada escena arranca OVERLAP frames antes de que termine la anterior)
const START = {};
{
  let t = 0;
  for (const e of ESCENAS) { START[e.key] = t; t += e.len - OVERLAP; }
}
const LEN = Object.fromEntries(ESCENAS.map((e) => [e.key, e.len]));
export const DURATION_IN_FRAMES = START.cierre + LEN.cierre; // 1875f = 62.5s

const NAVY = '#0f2a43';
const NAVY2 = '#16466e';
const GOLD = '#e3a72f';
const CEL = '#1f7ae0';
const GREEN = '#5cb531';

// Fondo persistente para TODO el video (las escenas solo aportan contenido):
// así las transiciones son disoluciones de contenido sobre un fondo continuo.
const Background = () => (
  <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 15%, ${NAVY2} 0%, ${NAVY} 55%, #081a2b 100%)` }}>
    <AbsoluteFill style={{ background: `radial-gradient(circle at 80% 85%, ${CEL}22 0%, transparent 45%)` }} />
  </AbsoluteFill>
);

// Fundido de escena: entra rápido, sale durante la ventana de solape.
// `opacity` (imagen/estructura) se disuelve lento durante todo el solape;
// `opacityTxt` (títulos) termina de desvanecerse ANTES de que arranque la
// escena siguiente, así dos leyendas nunca quedan superpuestas e ilegibles.
function useEscena(len, { inLen = 12 } = {}) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, inLen, len - OVERLAP, len], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const opacityTxt = interpolate(frame, [0, inLen, len - OVERLAP - 8, len - OVERLAP], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const rise = interpolate(frame, [0, inLen], [18, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic),
  });
  return { opacity, opacityTxt, rise };
}

const Caption = ({ titulo, texto, opacity }) => (
  <div style={{ opacity, textAlign: 'center', padding: '0 70px' }}>
    <div style={{ color: GOLD, fontSize: 46, fontWeight: 800 }}>{titulo}</div>
    {texto ? <div style={{ color: '#cfe0f0', fontSize: 28, marginTop: 10, lineHeight: 1.4 }}>{texto}</div> : null}
  </div>
);

// Mockup de navegador con captura real. La altura sale de la proporción real
// de cada captura (cada una está recortada en un borde limpio de tarjeta).
const Browser = ({ archivo, ratio, width, kenFrom = 1, kenTo = 1.05 }) => {
  const frame = useCurrentFrame();
  const ken = interpolate(frame, [0, 300], [kenFrom, kenTo], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const drift = interpolate(frame, [0, 300], [0, -10], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const h = Math.round(width / ratio);
  return (
    <div style={{ width, borderRadius: 18, overflow: 'hidden', background: '#fff', boxShadow: '0 30px 70px #00000055', border: '1px solid #ffffff22' }}>
      <div style={{ height: 38, background: '#e6ebf1', display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px' }}>
        <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#e0605a' }} />
        <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#e3b93f' }} />
        <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#4ea559' }} />
        <div style={{ marginLeft: 14, background: '#fff', borderRadius: 7, padding: '4px 16px', fontSize: 14, color: '#5a6b7c' }}>mvagendate.ia</div>
      </div>
      <div style={{ width, height: h, overflow: 'hidden' }}>
        <Img src={staticFile(archivo)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', transform: `scale(${ken}) translateY(${drift}px)` }} />
      </div>
    </div>
  );
};

// Escena genérica: captura + leyenda.
const EscenaPanel = ({ len, archivo, ratio, width, titulo, texto }) => {
  const { opacity, opacityTxt, rise } = useEscena(len);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ transform: `translateY(${rise}px)`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 36 }}>
        <div style={{ opacity }}><Browser archivo={archivo} ratio={ratio} width={width} /></div>
        <Caption titulo={titulo} texto={texto} opacity={opacityTxt} />
      </div>
    </AbsoluteFill>
  );
};

// ---------- Escena 1: hook ----------
const EscenaHook = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { opacity } = useEscena(LEN.hook);
  const scale = spring({ frame, fps, config: { damping: 200, mass: 0.6 } });
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: '0 80px' }}>
      <div style={{ opacity, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Img src={staticFile('logo-mv.png')} style={{ width: 150, height: 150, borderRadius: '22%', marginBottom: 40, transform: `scale(${scale})` }} />
        <div style={{ color: GOLD, fontSize: 32, fontWeight: 700, letterSpacing: 4, textTransform: 'uppercase', marginBottom: 28 }}>
          WhatsApp · Teléfono · Agenda
        </div>
        <div style={{ color: '#fff', fontSize: 86, fontWeight: 800, lineHeight: 1.12, textAlign: 'center', transform: `scale(${scale})` }}>
          El asistente que
          <br />
          <span style={{ color: GOLD }}>atiende, cotiza</span>
          <br />
          y agenda por vos
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------- Escena 2: chat de WhatsApp animado ----------
const CHAT = [
  { de: 'cliente', texto: 'Hola! ¿Cuánto sale instalar 2 tomacorrientes?', delay: 18 },
  { de: 'bot', texto: 'Hola 👋 Instalación de 2 tomas: $1.500 (mano de obra + materiales + traslado). ¿Te queda bien mañana 10:00 o 14:30?', delay: 90 },
  { de: 'cliente', texto: 'Mañana 10:00 👍', delay: 180 },
  { de: 'bot', texto: '✅ Agendado para mañana a las 10:00. Juan te visita en Av. Brasil 2450.', delay: 235 },
];

const Burbuja = ({ msg }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = Math.max(0, frame - msg.delay);
  const enter = spring({ frame: local, fps, config: { damping: 15, mass: 0.6 } });
  const opacity = interpolate(local, [0, 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const esBot = msg.de === 'bot';
  return (
    <div
      style={{
        opacity,
        transform: `translateY(${(1 - enter) * 26}px) scale(${0.94 + enter * 0.06})`,
        alignSelf: esBot ? 'flex-start' : 'flex-end',
        background: esBot ? '#ffffff' : '#d9fdd3',
        color: '#111b21',
        maxWidth: '82%',
        padding: '18px 22px',
        borderRadius: 18,
        borderBottomLeftRadius: esBot ? 6 : 18,
        borderBottomRightRadius: esBot ? 18 : 6,
        fontSize: 27,
        lineHeight: 1.42,
        boxShadow: '0 2px 5px #00000022',
      }}
    >
      {msg.texto}
    </div>
  );
};

const EscenaWhatsapp = () => {
  const { opacity, opacityTxt, rise } = useEscena(LEN.whatsapp);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ transform: `translateY(${rise}px)`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 34 }}>
        {/* Teléfono */}
        <div style={{ opacity, width: 620, borderRadius: 44, overflow: 'hidden', border: '10px solid #10151a', boxShadow: '0 34px 80px #00000066', background: '#0b141a' }}>
          {/* Header estilo WhatsApp */}
          <div style={{ background: '#1f2c34', padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: `linear-gradient(135deg, ${CEL}, ${NAVY2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>⚡</div>
            <div>
              <div style={{ color: '#e9edef', fontSize: 27, fontWeight: 700 }}>Electricista Juan</div>
              <div style={{ color: '#8696a0', fontSize: 20 }}>en línea · responde al instante</div>
            </div>
          </div>
          {/* Conversación */}
          <div style={{ background: '#0b141a', padding: '26px 20px 30px', display: 'flex', flexDirection: 'column', gap: 16, minHeight: 640 }}>
            {CHAT.map((m) => <Burbuja key={m.delay} msg={m} />)}
          </div>
        </div>
        <Caption titulo="La IA atiende por WhatsApp, 24/7" texto="Cotiza, ofrece horarios y confirma la cita sola — vos seguís trabajando" opacity={opacityTxt} />
      </div>
    </AbsoluteFill>
  );
};

// ---------- Escena 8: cierre ----------
const EscenaCierre = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { opacity } = useEscena(LEN.cierre, { inLen: 14 });
  const logoScale = spring({ frame, fps, config: { damping: 12, mass: 0.8 } });
  const pulse = 1 + Math.sin(frame / 10) * 0.03;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ opacity, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Img src={staticFile('logo-mv.png')} style={{ width: 220, height: 220, borderRadius: '22%', transform: `scale(${logoScale})`, marginBottom: 44 }} />
        <div style={{ color: '#fff', fontSize: 70, fontWeight: 800, textAlign: 'center' }}>
          MV <span style={{ color: GREEN }}>Agendate</span> IA
        </div>
        <div style={{ color: '#cfe0f0', fontSize: 33, marginTop: 18, textAlign: 'center', maxWidth: 860 }}>
          Pago único desde USD 129 · MercadoPago
          <br />
          PC y Android · cualquier profesión u oficio · 24/7
        </div>
        <div style={{ transform: `scale(${pulse})`, marginTop: 54, background: GOLD, color: NAVY, fontSize: 40, fontWeight: 800, padding: '26px 56px', borderRadius: 20 }}>
          Probá la demo gratis →
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------- Composición ----------
const NARRACION = {
  hook: 'nar1.wav', whatsapp: 'nar2.wav', cotizador: 'nar3.wav', agenda: 'nar4.wav',
  ficha: 'nar5.wav', tableros: 'nar6.wav', crm: 'nar7.wav', cierre: 'nar8.wav',
};

export const Launch = () => (
  <AbsoluteFill style={{ backgroundColor: NAVY, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
    <Background />

    <Sequence from={START.hook} durationInFrames={LEN.hook}><EscenaHook /></Sequence>
    <Sequence from={START.whatsapp} durationInFrames={LEN.whatsapp}><EscenaWhatsapp /></Sequence>
    <Sequence from={START.cotizador} durationInFrames={LEN.cotizador}>
      <EscenaPanel len={LEN.cotizador} archivo="panel-cotizador.png" ratio={1044 / 1224} width={640}
        titulo="Cotiza con IA según tu mercado" texto="Mano de obra + materiales + traslado, por tipo de trabajo y precios de tu país — nunca inventa un número" />
    </Sequence>
    <Sequence from={START.agenda} durationInFrames={LEN.agenda}>
      <EscenaPanel len={LEN.agenda} archivo="panel-agenda.png" ratio={1700 / 936} width={960}
        titulo="Agenda optimizada de verdad" texto="Propone horarios según distancia, tipo de trabajo y tu disponibilidad — sin cruces ni tiempos muertos" />
    </Sequence>
    <Sequence from={START.ficha} durationInFrames={LEN.ficha}>
      <EscenaPanel len={LEN.ficha} archivo="panel-ficha.png" ratio={1700 / 1131} width={920}
        titulo="Ficha de trabajo automática" texto="Cliente, presupuesto desglosado y datos de la cita — lista para imprimir o mandar en PDF" />
    </Sequence>
    <Sequence from={START.tableros} durationInFrames={LEN.tableros}>
      <EscenaPanel len={LEN.tableros} archivo="panel-dashboards.png" ratio={1700 / 1171} width={900}
        titulo="Tableros de gestión completos" texto="Clientes por día, semana y mes · evolución 12 meses · facturación y ticket promedio · exportá a Excel" />
    </Sequence>
    <Sequence from={START.crm} durationInFrames={LEN.crm}>
      <EscenaPanel len={LEN.crm} archivo="panel-clientes.png" ratio={1700 / 820} width={960}
        titulo="CRM de clientes" texto="Ficha, dirección confirmada e historial completo de trabajos de cada cliente" />
    </Sequence>
    <Sequence from={START.cierre} durationInFrames={LEN.cierre}><EscenaCierre /></Sequence>

    {/* Música de fondo original, leve (drone cálido) durante todo el video */}
    <Audio src={staticFile('audio/musica.wav')} volume={0.9} />

    {/* Narración — voz rioplatense Piper es_AR-daniela, una frase corta por escena */}
    {ESCENAS.map((e) => (
      <Sequence key={e.key} from={START[e.key] + 10} durationInFrames={LEN[e.key] - 10}>
        <Audio src={staticFile(`audio/${NARRACION[e.key]}`)} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
