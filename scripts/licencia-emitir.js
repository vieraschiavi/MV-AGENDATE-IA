#!/usr/bin/env node
// © 2026 Martín Viera. Todos los derechos reservados.

/**
 * Emite una licencia firmada a mano.
 *
 *   node scripts/licencia-emitir.js <plan> [--id ORD-XXXX] [--dias N]
 *
 *   node scripts/licencia-emitir.js full
 *   node scripts/licencia-emitir.js basico --id ORD-JUANPEREZ
 *   node scripts/licencia-emitir.js saas --dias 30
 *
 * Para qué: el webhook de MercadoPago emite la licencia solo cuando el pago
 * entra por el checkout del sitio. Si alguien te paga por transferencia, en
 * mano, o con un link de pago generado desde el panel de MercadoPago (que es
 * como se vende hoy), no hay webhook que dispare nada y el cliente se queda sin
 * código. Esto lo cubre.
 *
 * También sirve para emitirte la tuya: `full` sin --dias no vence nunca.
 *
 * Necesita MV_LICENSE_PRIVATE_KEY en el entorno — la misma que está en Vercel.
 * Corrélo en tu máquina, no en CI: la privada no debe quedar en ningún log.
 *
 *   MV_LICENSE_PRIVATE_KEY="$(cat mi-clave-privada.pem)" node scripts/licencia-emitir.js full
 */
import { randomBytes } from 'node:crypto';
import { firmar, puedeFirmar } from '../src/store/licencia-firma.js';
import { PLANES } from '../src/store/licencias.js';

const args = process.argv.slice(2);
const plan = args[0];
const valor = (bandera) => {
  const i = args.indexOf(bandera);
  return i >= 0 ? args[i + 1] : undefined;
};

if (!plan || !PLANES[plan]) {
  console.error(`Uso: node scripts/licencia-emitir.js <${Object.keys(PLANES).join('|')}> [--id ORD-XXXX] [--dias N]`);
  process.exit(1);
}

if (!puedeFirmar()) {
  console.error(`
No hay clave privada para firmar.

  MV_LICENSE_PRIVATE_KEY no está en el entorno, o no es una clave válida.
  Si todavía no generaste el par:  node scripts/licencia-par.js
`);
  process.exit(1);
}

const id = valor('--id') || 'MANUAL-' + randomBytes(4).toString('hex').toUpperCase();
const dias = Number(valor('--dias')) || 0;
const exp = dias > 0 ? Date.now() + dias * 86400000 : null;

const codigo = firmar({ id, plan, exp });

console.log(`
 Plan:      ${PLANES[plan].nombre}
 Pedido:    ${id}
 Vence:     ${exp ? new Date(exp).toISOString().slice(0, 10) : 'nunca (pago único)'}

 Licencia (esto es lo que le mandás al cliente):

${codigo}

 Se pega en el programa instalado, en Configuración → Licencia.
`);
