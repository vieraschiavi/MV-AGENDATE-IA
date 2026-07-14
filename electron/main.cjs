// Envoltorio de escritorio (Electron) para MV Agendate IA.
//
// No reimplementa nada: arranca el mismo src/server.js de siempre como
// proceso hijo (usando el propio binario de Electron en modo "ejecutá esto
// como Node puro", así el cliente no necesita instalar Node.js aparte) y
// abre una ventana apuntando a http://localhost:PORT — igual que el
// lanzador .bat/.command, pero sin terminal ni navegador visibles.
'use strict';
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const { spawn } = require('node:child_process');

const PORT = process.env.PORT || 3000;
const RAIZ = path.join(__dirname, '..');
const SERVIDOR = path.join(RAIZ, 'src', 'server.js');

let procesoServidor = null;
let ventana = null;
let salidaServidor = ''; // últimas líneas de stdout/stderr del servidor, para mostrar si falla
let logStream = null;

function logArchivo() {
  try {
    const dir = app.getPath('userData');
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, 'servidor.log');
  } catch { return null; }
}

const CARGANDO_HTML = `data:text/html;charset=utf-8,${encodeURIComponent(`
<!doctype html><html><head><meta charset="utf-8"><title>MV Agendate IA</title>
<style>
  body{ margin:0; height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center;
    background:#0f2a43; color:#fff; font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  .spin{ width:36px; height:36px; border:4px solid #ffffff33; border-top-color:#e0b25c; border-radius:50%;
    animation:g 0.9s linear infinite; margin-bottom:18px; }
  @keyframes g{ to{ transform:rotate(360deg); } }
</style></head>
<body><div class="spin"></div><div>Iniciando MV Agendate IA…</div></body></html>`)}`;

function paginaError(titulo, detalle) {
  const html = `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;padding:32px;background:#0f2a43;color:#fff;">
<h2 style="color:#e0b25c;">${escHtml(titulo)}</h2>
<p>Mandale una captura de esta pantalla a soporte.</p>
<pre style="background:#00000055;padding:14px;border-radius:8px;white-space:pre-wrap;word-break:break-word;font-size:12px;max-height:60vh;overflow:auto;">${escHtml(detalle || '(sin detalle)')}</pre>
<p style="opacity:.7;font-size:12px;">Log completo: ${escHtml(logArchivo() || '')}</p>
</body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}
function escHtml(s) { return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

function mostrarError(titulo, detalle) {
  if (ventana && !ventana.isDestroyed()) ventana.loadURL(paginaError(titulo, detalle));
}

function iniciarServidor() {
  logStream = fs.createWriteStream(logArchivo() || path.join(RAIZ, 'servidor.log'), { flags: 'a' });
  procesoServidor = spawn(process.execPath, [SERVIDOR], {
    cwd: RAIZ,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const capturar = (chunk) => {
    const texto = chunk.toString('utf8');
    logStream?.write(texto);
    salidaServidor = (salidaServidor + texto).slice(-4000); // solo el final, para la pantalla de error
  };
  procesoServidor.stdout.on('data', capturar);
  procesoServidor.stderr.on('data', capturar);
  procesoServidor.on('error', (err) => {
    mostrarError('No pude arrancar el servidor interno.', err.stack || err.message);
  });
  procesoServidor.on('exit', (codigo, senial) => {
    procesoServidor = null;
    if (codigo && codigo !== 0) {
      mostrarError(`El servidor se cerró solo (código ${codigo}).`, salidaServidor || `(sin salida)${senial ? ` señal: ${senial}` : ''}`);
    }
  });
}

function esperarServidor(intentos = 100) {
  return new Promise((resolve, reject) => {
    const probar = (restantes) => {
      // Si el proceso ya murió, no tiene sentido seguir reintentando el puerto.
      if (!procesoServidor) return reject(new Error('El servidor terminó antes de responder.\n\n' + (salidaServidor || '(sin salida)')));
      const socket = net.createConnection({ port: PORT, host: '127.0.0.1' }, () => {
        socket.end();
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        if (restantes <= 0) return reject(new Error('El servidor no respondió a tiempo.\n\n' + (salidaServidor || '(sin salida)')));
        setTimeout(() => probar(restantes - 1), 300);
      });
    };
    probar(intentos);
  });
}

async function crearVentana() {
  ventana = new BrowserWindow({
    width: 1360, height: 900, minWidth: 960, minHeight: 640,
    title: 'MV Agendate IA',
    icon: path.join(RAIZ, 'public', 'logo-mv.png'),
    backgroundColor: '#0f2a43',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  ventana.loadURL(CARGANDO_HTML);
  try {
    await esperarServidor();
    if (!ventana.isDestroyed()) ventana.loadURL(`http://localhost:${PORT}/`);
  } catch (e) {
    mostrarError('No pude iniciar el servidor.', e.message);
  }
}

function apagarServidor() {
  if (procesoServidor) { procesoServidor.kill(); procesoServidor = null; }
  logStream?.end();
}

process.on('uncaughtException', (err) => {
  try { fs.appendFileSync(logArchivo() || path.join(RAIZ, 'servidor.log'), '\n[main] ' + (err.stack || err.message) + '\n'); } catch { /* nada más que hacer */ }
  mostrarError('Error interno de la aplicación.', err.stack || err.message);
});

// Evita abrir dos copias (y dos servidores peleando por el mismo puerto).
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (ventana) { if (ventana.isMinimized()) ventana.restore(); ventana.focus(); }
  });

  app.whenReady().then(() => {
    iniciarServidor();
    crearVentana();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) crearVentana(); });
  });

  app.on('window-all-closed', () => {
    apagarServidor();
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('before-quit', apagarServidor);
}
