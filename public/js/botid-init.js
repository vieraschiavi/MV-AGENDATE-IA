// © 2026 Martín Viera. Todos los derechos reservados.
// Protección antibots (Vercel BotID) — carga silenciosa, no afecta a usuarios reales.
// Sólo tiene efecto una vez desplegado en Vercel (usa su infraestructura de reto/verificación).
import { initBotId } from '/vendor/botid/core.mjs';

initBotId({
  protect: [
    { path: '/api/chat', method: 'POST' },
    { path: '/api/contacto', method: 'POST' },
    { path: '/api/comprar', method: 'POST' },
  ]
});
