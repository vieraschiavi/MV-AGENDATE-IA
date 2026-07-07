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
const SCENE_2_LEN = 360; // 12s — 3 funciones
const SCENE_3 = SCENE_2 + SCENE_2_LEN;
const SCENE_3_LEN = 240; // 8s — cierre + CTA

export const DURATION_IN_FRAMES = SCENE_1_LEN + SCENE_2_LEN + SCENE_3_LEN; // 900 (30s)

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

// ---------- Escena 3: cierre + CTA ----------
const Scene3 = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logoScale = spring({ frame, fps, config: { damping: 12, mass: 0.8 } });
  const { opacity, translateY } = useFadeInOut(SCENE_3_LEN, { inLen: 16, outLen: 24 });
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

// Locución en off — voz rioplatense Piper "es_AR-daniela" (gratis, offline,
// la misma que usa el producto en su ChatVoice). Cada pista arranca unos
// cuadros después de que entra el texto de su escena, para que no se sientan
// pisados.
export const Launch = () => (
  <AbsoluteFill style={{ backgroundColor: NAVY }}>
    <Sequence from={SCENE_1} durationInFrames={SCENE_1_LEN}>
      <Scene1 />
    </Sequence>
    <Sequence from={SCENE_2} durationInFrames={SCENE_2_LEN}>
      <Scene2 />
    </Sequence>
    <Sequence from={SCENE_3} durationInFrames={SCENE_3_LEN}>
      <Scene3 />
    </Sequence>

    <Sequence from={SCENE_1 + 15} durationInFrames={SCENE_1_LEN - 15}>
      <Audio src={staticFile('audio/escena1.wav')} />
    </Sequence>
    <Sequence from={SCENE_2 + 15} durationInFrames={SCENE_2_LEN - 15}>
      <Audio src={staticFile('audio/escena2.wav')} />
    </Sequence>
    <Sequence from={SCENE_3 + 10} durationInFrames={SCENE_3_LEN - 10}>
      <Audio src={staticFile('audio/escena3.wav')} />
    </Sequence>
  </AbsoluteFill>
);
