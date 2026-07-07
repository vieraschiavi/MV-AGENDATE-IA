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

const SCENE_1 = 0;
const SCENE_1_LEN = 300; // 10s — titular
const SCENE_2 = SCENE_1 + SCENE_1_LEN;
const SCENE_2_LEN = 360; // 12s — 3 funciones (texto)
const SCENE_3 = SCENE_2 + SCENE_2_LEN;
const PANEL_LEN = 120; // 4s de "vida" por panel...
const PANEL_ADVANCE = 100; // ...pero el siguiente arranca 100f después: 20f (0.67s) de disolución cruzada real
const SCENE_3_LEN = 3 * PANEL_ADVANCE + PANEL_LEN; // 420f = 14s — recorrido por los paneles reales
const SCENE_4 = SCENE_3 + SCENE_3_LEN;
const SCENE_4_LEN = 240; // 8s — cierre + CTA

export const DURATION_IN_FRAMES = SCENE_1_LEN + SCENE_2_LEN + SCENE_3_LEN + SCENE_4_LEN; // 1380 (46s)

const NAVY = '#0f2a43';
const NAVY2 = '#16466e';
const GOLD = '#e3a72f';
const CEL = '#1f7ae0';
const GREEN = '#5cb531';

// Fondo compartido: degradé navy + halo suave, igual paleta que la web.
const Background = ({ children }) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(circle at 50% 15%, ${NAVY2} 0%, ${NAVY} 55%, #081a2b 100%)`,
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}
  >
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 80% 85%, ${CEL}22 0%, transparent 45%)`,
      }}
    />
    {children}
  </AbsoluteFill>
);

// Entrada/salida suave con fundido + leve movimiento vertical.
function useFadeInOut(len, { inLen = 18, outLen = 18, rise = 24 } = {}) {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [0, inLen, len - outLen, len],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const translateY = interpolate(frame, [0, inLen], [rise, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  return { opacity, translateY };
}

// ---------- Escena 1: titular ----------
const Scene1 = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame, fps, config: { damping: 200, mass: 0.6 } });
  const { opacity, translateY } = useFadeInOut(SCENE_1_LEN);

  const badgeOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <Background>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: '0 90px' }}>
        <div
          style={{
            opacity: badgeOpacity,
            color: GOLD,
            fontSize: 34,
            fontWeight: 700,
            letterSpacing: 4,
            textTransform: 'uppercase',
            marginBottom: 36,
          }}
        >
          WhatsApp · Teléfono · Agenda
        </div>
        <div
          style={{
            opacity,
            transform: `translateY(${translateY}px) scale(${scale})`,
            color: '#fff',
            fontSize: 92,
            fontWeight: 800,
            lineHeight: 1.12,
            textAlign: 'center',
          }}
        >
          Que tus clientes
          <br />
          agenden y paguen
          <br />
          <span style={{ color: GOLD }}>sin que atiendas</span>
          <br />
          el teléfono
        </div>
        <div
          style={{
            opacity,
            marginTop: 46,
            color: '#cfe0f0',
            fontSize: 38,
            textAlign: 'center',
            maxWidth: 820,
          }}
        >
          El asistente con IA que cotiza y agenda por vos, en cualquier oficio.
        </div>
      </AbsoluteFill>
    </Background>
  );
};

// ---------- Escena 2: 3 funciones destacadas ----------
const FEATURES = [
  { icon: '💬', titulo: 'Cotiza al instante', texto: 'Presupuesto con mano de obra, materiales y traslado — nunca inventa un precio.' },
  { icon: '🗓️', titulo: 'Agenda con traslados reales', texto: 'Propone horarios considerando el viaje entre citas y tus descansos.' },
  { icon: '⏰', titulo: 'Avisa solo si hay retraso', texto: 'Si un trabajo se extiende, le escribe al próximo cliente sin que hagas nada.' },
];

const FeatureCard = ({ item, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = Math.max(0, frame - delay);
  const enter = spring({ frame: local, fps, config: { damping: 16, mass: 0.7 } });
  const opacity = interpolate(local, [0, 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const translateX = interpolate(enter, [0, 1], [90, 0]);

  return (
    <div
      style={{
        opacity,
        transform: `translateX(${translateX}px)`,
        background: '#ffffff12',
        border: '2px solid #ffffff26',
        borderRadius: 28,
        padding: '34px 40px',
        display: 'flex',
        alignItems: 'center',
        gap: 28,
        width: 860,
        marginBottom: 34,
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        style={{
          fontSize: 56,
          width: 100,
          height: 100,
          flex: '0 0 auto',
          borderRadius: 22,
          background: `linear-gradient(135deg, ${CEL}, ${NAVY2})`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {item.icon}
      </div>
      <div>
        <div style={{ color: '#fff', fontSize: 42, fontWeight: 800, marginBottom: 8 }}>{item.titulo}</div>
        <div style={{ color: '#cfe0f0', fontSize: 28, lineHeight: 1.35 }}>{item.texto}</div>
      </div>
    </div>
  );
};

const Scene2 = () => {
  const { opacity } = useFadeInOut(SCENE_2_LEN, { inLen: 10, outLen: 20 });
  return (
    <Background>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ opacity, color: GOLD, fontSize: 34, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 40 }}>
          Todo en un mismo flujo
        </div>
        {FEATURES.map((item, i) => (
          <FeatureCard key={item.titulo} item={item} delay={20 + i * 45} />
        ))}
      </AbsoluteFill>
    </Background>
  );
};

// ---------- Escena 3: recorrido por los paneles reales del producto ----------
// Capturas reales (sin sidebar, a pantalla completa) para que el contenido se
// vea grande y legible — no un mockup en miniatura del programa entero.
const SCREENS = [
  { archivo: 'panel-agenda.png', titulo: 'Agenda con traslados reales', texto: 'Tablero por estado, sin cruzar horarios' },
  { archivo: 'panel-dashboards.png', titulo: 'Dashboards completos', texto: 'Facturación y comparativas mes a mes' },
  { archivo: 'panel-clientes.png', titulo: 'CRM de clientes', texto: 'Ficha con el historial de cada trabajo' },
  { archivo: 'panel-ayuda.png', titulo: 'Ayuda con IA integrada', texto: 'Tutorial y dudas del programa resueltas al instante' },
];

const MOCKUP_W = 980;
const MOCKUP_IMG_H = 465; // misma proporción que las capturas (1700x807) — sin distorsión ni recorte forzado

// Disolución cruzada real (dos paneles superpuestos en la ventana de solape) +
// Ken Burns (zoom lento y continuo) para que la escena se sienta viva, no una
// diapositiva estática.
const PanelMockup = ({ item }) => {
  const frame = useCurrentFrame();
  const overlap = PANEL_LEN - PANEL_ADVANCE;
  // La imagen se disuelve lenta y de a una con la siguiente (dura toda la
  // ventana de solape, incluso después de que arranca el próximo panel) —
  // pero el texto NO: termina de desvanecerse justo cuando arranca el
  // próximo panel (frame local = PANEL_ADVANCE), así los títulos nunca
  // quedan superpuestos e ilegibles entre sí.
  const { opacity: opacityImg } = useFadeInOut(PANEL_LEN, { inLen: overlap, outLen: overlap, rise: 0 });
  const opacityTxt = interpolate(
    frame,
    [0, 10, PANEL_ADVANCE - 10, PANEL_ADVANCE],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const kenBurns = interpolate(frame, [0, PANEL_LEN], [1, 1.06], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const drift = interpolate(frame, [0, PANEL_LEN], [0, -14], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const enter = interpolate(frame, [0, 20], [0.97, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ transform: `scale(${enter})`, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div
          style={{
            opacity: opacityImg,
            width: MOCKUP_W,
            borderRadius: 18,
            overflow: 'hidden',
            background: '#fff',
            boxShadow: '0 30px 70px #00000055',
            border: '1px solid #ffffff22',
          }}
        >
          {/* Barra de navegador falsa — ancla el screenshot como "producto real", no un mockup genérico */}
          <div style={{ height: 40, background: '#e6ebf1', display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px' }}>
            <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#e0605a' }} />
            <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#e3b93f' }} />
            <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#4ea559' }} />
            <div style={{ marginLeft: 14, background: '#fff', borderRadius: 7, padding: '5px 16px', fontSize: 14, color: '#5a6b7c' }}>
              mvagendate.ia
            </div>
          </div>
          <div style={{ width: MOCKUP_W, height: MOCKUP_IMG_H, overflow: 'hidden' }}>
            <Img
              src={staticFile(item.archivo)}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'top',
                transform: `scale(${kenBurns}) translateY(${drift}px)`,
              }}
            />
          </div>
        </div>
        <div style={{ opacity: opacityTxt, color: GOLD, fontSize: 42, fontWeight: 800, marginTop: 34, textAlign: 'center' }}>{item.titulo}</div>
        <div style={{ opacity: opacityTxt, color: '#cfe0f0', fontSize: 27, marginTop: 8, textAlign: 'center', maxWidth: 760 }}>{item.texto}</div>
      </div>
    </AbsoluteFill>
  );
};

// Sequences con `from` solapado (en vez de consecutivo): durante la ventana de
// solape hay dos paneles montados a la vez, uno terminando de desvanecerse y
// el siguiente apareciendo — esa superposición ES la disolución cruzada.
const Scene3Panels = () => (
  <Background>
    {SCREENS.map((item, i) => (
      <Sequence key={item.archivo} from={i * PANEL_ADVANCE} durationInFrames={PANEL_LEN}>
        <PanelMockup item={item} />
      </Sequence>
    ))}
  </Background>
);

// ---------- Escena 4: cierre + CTA ----------
const Scene4 = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logoScale = spring({ frame, fps, config: { damping: 12, mass: 0.8 } });
  const { opacity, translateY } = useFadeInOut(SCENE_4_LEN, { inLen: 16, outLen: 24 });
  const pulse = 1 + Math.sin(frame / 10) * 0.03;

  return (
    <Background>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        {/* El PNG fuente tiene esquinas blancas sólidas (sin transparencia),
            así que hace falta recortarlas con la misma proporción de
            redondeo del propio ícono para que no se vean como un cuadrado
            blanco de fondo sobre el navy de la escena. */}
        <Img
          src={staticFile('logo-mv.png')}
          style={{
            width: 220,
            height: 220,
            borderRadius: '22%',
            transform: `scale(${logoScale})`,
            marginBottom: 44,
          }}
        />
        <div style={{ opacity, transform: `translateY(${translateY}px)`, color: '#fff', fontSize: 70, fontWeight: 800, textAlign: 'center' }}>
          MV <span style={{ color: GREEN }}>Agendate</span> IA
        </div>
        <div style={{ opacity, color: '#cfe0f0', fontSize: 34, marginTop: 18, textAlign: 'center', maxWidth: 760 }}>
          18+ oficios · pago único · atención 24/7
        </div>
        <div
          style={{
            opacity,
            transform: `scale(${pulse})`,
            marginTop: 56,
            background: GOLD,
            color: NAVY,
            fontSize: 40,
            fontWeight: 800,
            padding: '26px 56px',
            borderRadius: 20,
          }}
        >
          Probá la demo gratis →
        </div>
      </AbsoluteFill>
    </Background>
  );
};

// Locución corta por panel (una frase breve cada uno, igual que el resto del
// video) — nada de un monólogo largo y continuo, que sonaba antinatural.
const PANEL_AUDIO = ['panel1.wav', 'panel2.wav', 'panel3.wav', 'panel4.wav'];

export const Launch = () => (
  <AbsoluteFill style={{ backgroundColor: NAVY }}>
    <Sequence from={SCENE_1} durationInFrames={SCENE_1_LEN}>
      <Scene1 />
    </Sequence>
    <Sequence from={SCENE_2} durationInFrames={SCENE_2_LEN}>
      <Scene2 />
    </Sequence>
    <Sequence from={SCENE_3} durationInFrames={SCENE_3_LEN}>
      <Scene3Panels />
    </Sequence>
    <Sequence from={SCENE_4} durationInFrames={SCENE_4_LEN}>
      <Scene4 />
    </Sequence>

    {/* Música de fondo — leve y original (pad instrumental propio, sin
        derechos de terceros), a lo largo de todo el video. El propio archivo
        ya está mezclado a un nivel muy bajo (pico ≈ -19dB): acá no hace falta
        atenuarlo mucho más, solo dejarlo por debajo de la locución. */}
    <Audio src={staticFile('audio/musica.wav')} volume={0.9} />

    {/* Locución en off — voz rioplatense Piper "es_AR-daniela" (gratis,
        offline, la misma que usa el producto en su ChatVoice). Cada pista
        arranca unos cuadros después de que entra el texto/panel de su
        escena, para que no se sientan pisados. */}
    <Sequence from={SCENE_1 + 15} durationInFrames={SCENE_1_LEN - 15}>
      <Audio src={staticFile('audio/escena1.wav')} />
    </Sequence>
    <Sequence from={SCENE_2 + 15} durationInFrames={SCENE_2_LEN - 15}>
      <Audio src={staticFile('audio/escena2.wav')} />
    </Sequence>
    {PANEL_AUDIO.map((archivo, i) => (
      <Sequence key={archivo} from={SCENE_3 + i * PANEL_ADVANCE + 8} durationInFrames={PANEL_LEN - 8}>
        <Audio src={staticFile(`audio/${archivo}`)} />
      </Sequence>
    ))}
    <Sequence from={SCENE_4 + 10} durationInFrames={SCENE_4_LEN - 10}>
      <Audio src={staticFile('audio/escena3.wav')} />
    </Sequence>
  </AbsoluteFill>
);
