// © 2026 Martín Viera. Todos los derechos reservados.

// Cuando otro programa ya usa el puerto pedido, el servidor tiene que
// (1) elegir el siguiente libre en vez de morir o pisar la otra app, y
// (2) anunciar el puerto REAL con la línea MV_PUERTO=n, que es la que usa el
// envoltorio de escritorio (electron/main.cjs) para abrir la ventana en
// NUESTRA app y no en la que tenga el puerto ocupado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));

function esperar(ms) { return new Promise((r) => setTimeout(r, ms)); }

test('con el puerto pedido ocupado por otra app, el server elige otro y lo anuncia con MV_PUERTO=', async () => {
  // "Otra app" (un dashboard cualquiera) ocupando el puerto que vamos a pedir.
  const otraApp = createServer((_req, res) => { res.end('SOY OTRA APP'); });
  const puertoOcupado = await new Promise((resolve) => {
    otraApp.listen(0, '127.0.0.1', () => resolve(otraApp.address().port));
  });

  // MV_DATOS_DIR aísla la persistencia del server de prueba: sin esto,
  // escribiría el data/config.json compartido mientras otros tests lo leen
  // (escrituras a medias → "Unexpected end of JSON input" intermitente).
  const datosAislados = mkdtempSync(join(tmpdir(), 'mv-test-puerto-'));
  const hijo = spawn(process.execPath, [join(RAIZ, 'src', 'server.js')], {
    cwd: RAIZ,
    env: { ...process.env, PORT: String(puertoOcupado), MV_ESCRITORIO: '1', MV_DATOS_DIR: datosAislados, MV_ANCLA_DIR: mkdtempSync(join(tmpdir(), 'mv-test-ancla-srv-')) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let salida = '';
  hijo.stdout.on('data', (c) => { salida += c.toString('utf8'); });
  hijo.stderr.on('data', (c) => { salida += c.toString('utf8'); });

  try {
    // Esperar la marca MV_PUERTO= (máx ~60s). El margen es amplio a propósito:
    // los archivos de test corren en paralelo y en una máquina cargada el
    // arranque del servidor se pasa de 15s, lo que hacía fallar este test de
    // vez en cuando por lentitud y no por el bug que cuida.
    let marca = null;
    for (let i = 0; i < 300 && !marca; i++) {
      marca = /MV_PUERTO=(\d+)/.exec(salida);
      if (!marca) await esperar(200);
    }
    assert.ok(marca, `el server nunca anunció MV_PUERTO= en 60s. Salida:\n${salida}`);

    const puertoReal = Number(marca[1]);
    assert.notEqual(puertoReal, puertoOcupado, 'anunció el puerto ocupado por la otra app');

    // Y en ese puerto responde NUESTRO server, no la otra app.
    const res = await fetch(`http://127.0.0.1:${puertoReal}/salud`);
    const cuerpo = await res.json();
    assert.equal(res.status, 200);
    assert.equal(cuerpo.ok, true);

    // La otra app sigue intacta en su puerto (no la pisamos).
    const resOtra = await fetch(`http://127.0.0.1:${puertoOcupado}/`);
    assert.equal(await resOtra.text(), 'SOY OTRA APP');
  } finally {
    hijo.kill();
    otraApp.close();
  }
});
