// © 2026 Martín Viera. Todos los derechos reservados.

// Entrypoint serverless para Vercel.
// Vercel importa este módulo y usa el export default como handler (req, res).
// Nuestro app de Express es un handler válido, así que lo re-exportamos.
//
// Nota: en serverless no hay estado persistente entre invocaciones ni binarios
// (Piper/ffmpeg), así que la landing + demo de chat/tasador funcionan, pero el
// video, la voz TTS y el CRM persistente requieren el servidor PC. Esto es sólo
// para la PREVIEW de la landing.
import app from '../src/server.js';
export default app;
