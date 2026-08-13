// © 2026 Martín Viera. Todos los derechos reservados.
// Tests del arranque local: elegir un puerto libre en vez de morir.
//
// Bug real que motivó esto: el servidor hacía app.listen(3000) sin manejar el
// error. Si el cliente tenía cualquier otro programa ocupando el 3000, Node
// tiraba un EADDRINUSE sin atrapar y el programa se cerraba mostrando un stack
// trace de Node — para un electricista o un abogado, eso es "el programa no
// anda" sin más información.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { escucharEnPuertoLibre } from '../src/arranque.js';

/** Ocupa un puerto y devuelve {servidor, puerto} para liberarlo después. */
function ocupar(puertoPreferido = 0) {
  return new Promise((resolve) => {
    const s = createServer(() => {});
    s.listen(puertoPreferido, () => resolve({ servidor: s, puerto: s.address().port }));
  });
}
const cerrar = (s) => new Promise((r) => s.close(r));

test('usa el puerto pedido cuando está libre', async () => {
  const app = express();
  const { server, puerto } = await escucharEnPuertoLibre(app, 0);
  assert.ok(puerto > 0, 'devuelve el puerto real en el que quedó escuchando');
  await cerrar(server);
});

test('si el puerto está ocupado por otra app, usa el siguiente libre (no revienta)', async () => {
  // Ocupamos un puerto cualquiera y pedimos ESE mismo: debe correrse al de al lado.
  const ocupado = await ocupar();
  const app = express();
  const { server, puerto } = await escucharEnPuertoLibre(app, ocupado.puerto);

  assert.notEqual(puerto, ocupado.puerto, 'no puede quedarse con el puerto ajeno');
  assert.ok(puerto > ocupado.puerto, `debe subir desde ${ocupado.puerto}, quedó en ${puerto}`);

  await cerrar(server);
  await cerrar(ocupado.servidor);
});

test('salta varios puertos ocupados seguidos', async () => {
  const a = await ocupar();
  const b = await ocupar(a.puerto + 1);
  // Si el +1 ya estaba tomado por otra cosa, el test no aplica: lo damos por
  // válido en vez de fallar por un puerto ajeno de la máquina que corre los tests.
  if (b.puerto === a.puerto + 1) {
    const app = express();
    const { server, puerto } = await escucharEnPuertoLibre(app, a.puerto);
    assert.ok(puerto > b.puerto, `debe saltar ${a.puerto} y ${b.puerto}, quedó en ${puerto}`);
    await cerrar(server);
  }
  await cerrar(a.servidor);
  await cerrar(b.servidor);
});

test('si no encuentra ningún puerto libre, falla con error claro y no cuelga', async () => {
  const ocupado = await ocupar();
  const app = express();
  // maxIntentos = 0 → no puede reintentar: tiene que rechazar, no quedarse colgado.
  await assert.rejects(
    () => escucharEnPuertoLibre(app, ocupado.puerto, 0),
    (err) => err.code === 'EADDRINUSE'
  );
  await cerrar(ocupado.servidor);
});
