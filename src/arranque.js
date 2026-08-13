// © 2026 Martín Viera. Todos los derechos reservados.
// Arranque local del programa (PC/escritorio): elegir un puerto que esté libre
// y abrir el navegador en la dirección correcta.
//
// Por qué existe: antes el servidor hacía `app.listen(3000)` sin manejar el
// error. Si el cliente tenía CUALQUIER otro programa usando el puerto 3000
// (otro servidor, Skype viejo, un panel de impresora, otra copia de este mismo
// programa abierta), Node tiraba un EADDRINUSE sin atrapar y el programa moría
// mostrando un stack trace incomprensible. Ahora prueba el siguiente puerto y
// avisa en castellano cuál quedó usando.
import { spawn } from 'node:child_process';

/**
 * Escucha en el primer puerto libre a partir de `puertoInicial`.
 * @returns {Promise<{server: import('node:http').Server, puerto: number}>}
 */
export function escucharEnPuertoLibre(app, puertoInicial, maxIntentos = 20) {
  return new Promise((resolve, reject) => {
    let puerto = Number(puertoInicial) || 3000;
    let restantes = maxIntentos;

    const intentar = () => {
      const server = app.listen(puerto);

      const alFallar = (err) => {
        server.removeListener('listening', alEscuchar);
        // Sólo reintentamos si el puerto está tomado. Cualquier otro error
        // (permisos, puerto inválido) se propaga: taparlo sería peor.
        if (err.code === 'EADDRINUSE' && restantes > 0) {
          restantes -= 1;
          console.log(`   El puerto ${puerto} ya lo usa otro programa — probando el ${puerto + 1}…`);
          puerto += 1;
          setImmediate(intentar);
          return;
        }
        reject(err);
      };

      const alEscuchar = () => {
        server.removeListener('error', alFallar);
        resolve({ server, puerto });
      };

      server.once('error', alFallar);
      server.once('listening', alEscuchar);
    };

    intentar();
  });
}

/**
 * Abre el navegador del sistema en `url`. Si falla, no pasa nada: la dirección
 * ya quedó impresa en pantalla para copiarla a mano.
 *
 * Lo abre el servidor (y no el .bat) justamente porque hasta que no se resuelve
 * el puerto no se sabe la dirección: el .bat abría siempre localhost:3000 y, si
 * ese puerto estaba ocupado por otra app, le mostraba al cliente la OTRA app.
 */
export function abrirNavegador(url) {
  try {
    const opciones = { detached: true, stdio: 'ignore' };
    let hijo;
    if (process.platform === 'win32') hijo = spawn('cmd', ['/c', 'start', '', url], opciones);
    else if (process.platform === 'darwin') hijo = spawn('open', [url], opciones);
    else hijo = spawn('xdg-open', [url], opciones);
    hijo.on('error', () => {});
    hijo.unref();
  } catch { /* sin navegador disponible: la URL quedó en pantalla */ }
}
