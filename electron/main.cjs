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
const net = require('node:net');
const { spawn } = require('node:child_process');

const PORT = process.env.PORT || 3000;
const RAIZ = path.join(__dirname, '..');
const SERVIDOR = path.join(RAIZ, 'src', 'server.js');

let procesoServidor = null;
let ventana = null;

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

function iniciarServidor() {
  procesoServidor = spawn(process.execPath, [SERVIDOR], {
    cwd: RAIZ,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: String(PORT) },
    stdio: 'inherit'
  });
  procesoServidor.on('exit', (codigo) => {
    procesoServidor = null;
    if (codigo && codigo !== 0 && ventana && !ventana.isDestroyed()) {
      ventana.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(
        '<body style="font-family:sans-serif;padding:40px;">El servidor se cerró inesperadamente. Cerrá y volvé a abrir la app.</body>'
      )}`);
    }
  });
}

function esperarServidor(intentos = 100) {
  return new Promise((resolve, reject) => {
    const probar = (restantes) => {
      const socket = net.createConnection({ port: PORT, host: '127.0.0.1' }, () => {
        socket.end();
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        if (restantes <= 0) return reject(new Error('El servidor no respondió a tiempo.'));
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
    if (!ventana.isDestroyed()) {
      ventana.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(
        `<body style="font-family:sans-serif;padding:40px;">No pude iniciar el servidor: ${e.message}</body>`
      )}`);
    }
  }
}

function apagarServidor() {
  if (procesoServidor) { procesoServidor.kill(); procesoServidor = null; }
}

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
