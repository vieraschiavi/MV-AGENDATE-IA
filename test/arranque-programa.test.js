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
