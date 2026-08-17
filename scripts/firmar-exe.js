// © 2026 Martín Viera. Todos los derechos reservados.

// Empaqueta el instalador de Windows FIRMADO digitalmente.
//
//   WIN_CERT_FILE=C:\ruta\certificado.pfx WIN_CERT_PASSWORD=... npm run empaquetar-exe-firmado
//
// Por qué existe este script en vez de poner la firma en package.json:
// electron-builder NO expande `${env.VARIABLE}` dentro de signtoolOptions —
// intenta abrir un archivo llamado literalmente "${env.WIN_CERT_FILE}" y el
// build entero se cae con ENOENT. Dejarlo ahí rompía también el build sin
// certificado, que es el que se usa todos los días. Acá la firma se agrega
// por línea de comandos y solo si el certificado existe de verdad.
//
// Para qué sirve firmar: sin firma, Windows muestra "Windows protegió su PC"
// (SmartScreen) al abrir el instalador y muchos clientes no pasan de ahí —
// creen que el programa está roto o que es un virus. Con un certificado de
// firma de código el aviso desaparece (con uno EV, de entrada; con uno OV,
// a medida que el instalador acumula reputación).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const cert = process.env.WIN_CERT_FILE;
const clave = process.env.WIN_CERT_PASSWORD;

if (!cert) {
  console.error(`
✘ Falta el certificado de firma de código.

  WIN_CERT_FILE      ruta al .pfx / .p12 del certificado
  WIN_CERT_PASSWORD  su contraseña

  Ejemplo:
    WIN_CERT_FILE=/ruta/mv.pfx WIN_CERT_PASSWORD=secreta npm run empaquetar-exe-firmado

  Si todavía no tenés certificado, usá "npm run empaquetar-exe": genera el
  mismo instalador sin firmar. Anda igual, pero Windows le muestra el aviso
  de SmartScreen al cliente (ver public/instalar.html, que ya se lo explica).
`);
  process.exit(1);
}

if (!existsSync(cert)) {
  console.error(`✘ No encontré el certificado en: ${cert}`);
  process.exit(1);
}

if (!clave) {
  console.error('✘ Falta WIN_CERT_PASSWORD: un .pfx sin contraseña no se puede usar para firmar.');
  process.exit(1);
}

// El sellado de tiempo (rfc3161) es lo que hace que la firma siga siendo
// válida DESPUÉS de que el certificado venza: sin él, el día que vence el
// certificado todos los instaladores ya distribuidos vuelven a aparecer como
// no firmados.
const args = [
  'electron-builder', '--win', '--x64', '--publish', 'never',
  `--config.win.signtoolOptions.certificateFile=${cert}`,
  `--config.win.signtoolOptions.certificatePassword=${clave}`,
  '--config.win.signtoolOptions.signingHashAlgorithms.0=sha256',
  '--config.win.signtoolOptions.rfc3161TimeStampServer=http://timestamp.digicert.com'
];

console.log('→ Empaquetando y firmando el instalador de Windows...');
const r = spawnSync('npx', args, { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log('✔ Instalador firmado. Verificalo en Windows con: signtool verify /pa /v <archivo>.exe');
