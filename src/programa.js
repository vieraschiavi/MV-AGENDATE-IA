// © 2026 Martín Viera. Todos los derechos reservados.

// Punto de entrada del PROGRAMA (lo que arranca INICIAR.bat / npm start).
// Si todavía no hay una API key de Claude cargada y estamos en una consola
// interactiva, la pide una vez acá mismo (no en una web). Después levanta la
// plataforma. Con la variable MV_SIN_SETUP=1 se salta el paso (para servidores).
import { get as cfg } from './store/config.js';
import { configurarInteractivo } from './setup/configurar.js';

const hayConsola = process.stdin.isTTY && process.stdout.isTTY;
const saltar = process.env.MV_SIN_SETUP === '1';

if (!cfg('anthropicApiKey') && hayConsola && !saltar) {
  await configurarInteractivo({ soloSiFalta: true });
}

// Levanta el servidor (server.js hace app.listen al importarse).
await import('./server.js');
