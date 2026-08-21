#!/usr/bin/env node
// © 2026 Martín Viera. Todos los derechos reservados.

/**
 * Genera el par de claves con el que se firman y verifican las licencias.
 *
 *   node scripts/licencia-par.js
 *
 * Imprime dos cosas:
 *   1. La clave PRIVADA → va a Vercel como MV_LICENSE_PRIVATE_KEY. Es la que
 *      firma. Si se filtra, cualquiera se emite las licencias que quiera.
 *   2. La clave PÚBLICA → se pega en src/store/licencia-clave.js. Sólo
 *      verifica; publicarla no habilita nada, para eso existe.
 *
 * CORRELO VOS, EN TU MÁQUINA. La privada no debe pasar por ningún log, chat,
 * issue ni CI: una clave privada que atravesó un entorno automatizado hay que
 * darla por comprometida y rotarla. Este script no la guarda en ningún archivo
 * a propósito — la imprime una vez y se olvida.
 *
 * Para ROTAR el par (si se filtró, o por higiene): corré esto de nuevo, pegá
 * las dos mitades nuevas y volvé a emitir las licencias vigentes desde el
 * panel. Las licencias viejas dejan de validar en cuanto cambie la pública, así
 * que hay que avisarle al cliente antes, o dejarlas un tiempo en
 * MV_LICENCIAS_HEREDADAS.
 */
import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');

const privada = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString().trim();
const publica = publicKey.export({ type: 'spki', format: 'pem' }).toString().trim();

console.log(`
════════════════════════════════════════════════════════════════════
 1) CLAVE PRIVADA  →  variable de entorno del servidor de ventas
════════════════════════════════════════════════════════════════════
 Nombre de la variable:  MV_LICENSE_PRIVATE_KEY
 Dónde:  Vercel → tu proyecto → Settings → Environment Variables
         (marcá Production, Preview y Development)

 Pegá TODO el bloque, saltos de línea incluidos:

${privada}

 ⚠ No la guardes en el repo, ni en .env commiteado, ni se la mandes a
   nadie por chat. Es lo único que separa "vendí una licencia" de
   "cualquiera se fabrica una".

════════════════════════════════════════════════════════════════════
 2) CLAVE PÚBLICA  →  src/store/licencia-clave.js
════════════════════════════════════════════════════════════════════
 Reemplazá la línea  export const PUBLICA = '';  por:

export const PUBLICA = \`${publica}
\`;

 Esta sí va commiteada. Apenas esté, la verificación por firma queda
 OBLIGATORIA: dejan de aceptarse los códigos inventados.

════════════════════════════════════════════════════════════════════
 3) ANTES DE MERGEAR
════════════════════════════════════════════════════════════════════
 Pasá las licencias que YA vendiste (las del formato MV-PLAN-XXXXXXXX,
 se listan en /api/licencias) a la variable MV_LICENCIAS_HEREDADAS,
 separadas por coma. Si no, esos clientes quedan afuera:

 MV_LICENCIAS_HEREDADAS=MV-FULL-A1B2C3D4,MV-BASICO-99887766
════════════════════════════════════════════════════════════════════
`);
