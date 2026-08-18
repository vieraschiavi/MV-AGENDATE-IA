// © 2026 Martín Viera. Todos los derechos reservados.

// El programa instalado tiene que abrir en el PANEL de trabajo, no en la
// landing de venta. Pasó una vez: el .exe mostraba la publicidad adentro de la
// app que el cliente ya había comprado. — node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

test('la ventana de escritorio abre /app/, no la raíz', () => {
  const main = leer('../electron/main.cjs');
  assert.match(main, /const RUTA_APP = '\/app\/'/, 'debe declarar la ruta del panel');
  assert.match(main, /loadURL\(`http:\/\/localhost:\$\{puerto\}\$\{RUTA_APP\}`\)/,
    'la ventana debe cargar el panel');
  assert.doesNotMatch(main, /loadURL\(`http:\/\/localhost:\$\{puerto\}\/`\)/,
    'cargar la raíz mostraría la landing de venta adentro del programa');
});

test('el lanzador .bat abre el navegador en el panel, no en la raíz', () => {
  const server = leer('../src/server.js');
  assert.match(server, /export const RUTA_APP = '\/app\/'/);
  assert.match(server, /abrirNavegador\(url \+ RUTA_APP\)/,
    'el .bat tiene que llevar al panel igual que la ventana de escritorio');
});

test('el panel existe donde se lo apunta', () => {
  // Si alguien mueve o renombra el bundle, RUTA_APP quedaría apuntando a un 404
  // y el programa abriría en blanco.
  const panel = leer('../public/app/index.html');
  assert.match(panel, /<title>[^<]*Espacio de trabajo/i, 'public/app/ debe ser el panel');
});

test('la raíz sigue siendo la landing de venta (es lo que ve la web)', () => {
  const landing = leer('../public/index.html');
  assert.match(landing, /<title>[^<]*asistente/i);
});

// Un cliente reportó "El servidor no anunció su puerto a tiempo. (sin
// salida)" al abrir el .exe instalado: 30 segundos de espera y un log vacío,
// sin ninguna pista de qué pasó. Corriendo el mismo dist-protegido/src/server.js
// ofuscado con Node puro (lo que hace Electron con ELECTRON_RUN_AS_NODE) se
// confirmó que el JS arranca bien y anuncia el puerto al instante — el
// problema no es el código del servidor. Estos tests fijan las dos correcciones
// del lado del lanzador (electron/main.cjs) que hacían que un fallo temprano
// terminara mostrando "(sin salida)" en vez de la causa real.
test('si falta el archivo del servidor, se detecta ANTES de spawnear (no espera el timeout de 30s)', () => {
  // Antes: si el antivirus ponía en cuarentena src/server.js (blanco típico,
  // dado que el .exe no está firmado), spawn() intentaba ejecutar algo que no
  // existía y el cliente esperaba el timeout completo sin ninguna pista.
  const main = leer('../electron/main.cjs');
  assert.match(main, /!fs\.existsSync\(SERVIDOR\)/,
    'debe chequear que el archivo del servidor exista antes de spawnearlo');
  assert.match(main, /antivirus/i,
    'el mensaje al cliente tiene que sugerir la causa más probable, no solo "algo falló"');
});

test('un fallo temprano (archivo faltante, error de spawn, cierre con error) corta la espera de esperarServidor()', () => {
  // Sin esto, iniciarServidor() podía detectar el fallo al instante pero
  // crearVentana() -que arranca en paralelo, no encadenada- seguía esperando
  // los 30 segundos completos y terminaba pisando el mensaje específico con
  // el genérico de timeout.
  const main = leer('../electron/main.cjs');
  const bloqueEsperar = main.slice(main.indexOf('async function esperarServidor'), main.indexOf('async function crearVentana'));
  assert.match(bloqueEsperar, /Promise\.race\(\[\s*puertoReal,\s*falloTemprano,/,
    'esperarServidor debe correr en carrera contra el corte temprano, no solo contra el timeout');

  const bloqueIniciar = main.slice(main.indexOf('function iniciarServidor'), main.indexOf('async function esperarServidor'));
  assert.match(bloqueIniciar, /avisarFalloTemprano/,
    'iniciarServidor debe poder disparar el corte temprano ante un fallo (archivo faltante, error de spawn, cierre con código de error)');
});

test('la salida del proceso se decide por "close", no por "exit" (Node puede disparar exit antes de que llegue todo stdout/stderr)', () => {
  // Documentado por Node: 'exit' puede dispararse antes de que termine de
  // llegar el stdout/stderr bufferizado del hijo. Un proceso que muere rápido
  // después de escribir un error podía mostrar "(sin salida)" con el error
  // real todavía en tránsito. Verificado con un proceso que escribe ~5KB a
  // stderr y sale enseguida: con 'close' llega el 100%; con 'exit' en este
  // entorno también llegó completo (no se logró forzar la carrera de forma
  // determinística en Linux), pero 'close' es la garantía que da Node, no
  // una casualidad de timing.
  const main = leer('../electron/main.cjs');
  assert.doesNotMatch(main, /procesoServidor\.on\('exit'/,
    'no debe decidirse el mensaje de error en \'exit\': puede llegar antes que el stdout/stderr bufferizado');
  assert.match(main, /procesoServidor\.on\('close', \(codigo, senial\) => {/,
    'debe usar \'close\', que Node garantiza que se dispara después de cerrarse los streams de stdio');
});
