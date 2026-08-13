// © 2026 Martín Viera. Todos los derechos reservados.

// Aísla la persistencia de CADA archivo de test.
//
// Se precarga con `node --test --import ./scripts/aislar-datos-test.js` (ver el script
// "test" de package.json), así corre ANTES de que el archivo de test importe
// store/config.js — que calcula la ruta del config al importarse, no al usarse.
//
// Por qué hace falta: `node --test` corre los archivos en paralelo, un proceso
// por archivo, y todos escribían el MISMO data/config.json del repo. Dos
// archivos guardando a la vez dejan el JSON cortado por la mitad y el que lo
// lee revienta con "Unexpected end of JSON input": el archivo entero se cae y
// se lleva puestos sus tests. Eso daba fallos intermitentes sin causa visible
// (y un rojo en CI que no se reproducía en local). Con un directorio por
// proceso, ningún test puede pisar a otro.
// Detalle para no volver a investigarlo: el runner cuenta este módulo
// precargado como una entrada más en el total ("# tests 157" con 156 tests
// declarados). Es una entrada que siempre pasa y no tiene nombre propio; el
// número que importa es "# fail".
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateKeyPairSync } from 'node:crypto';
import { _fijarClavePublica } from '../src/store/licencia-firma.js';

// Si el test ya eligió su propio directorio, se respeta.
process.env.MV_DATOS_DIR ||= mkdtempSync(join(tmpdir(), 'mv-test-datos-'));
// Ídem el ancla del inicio de prueba, que vive en el perfil del usuario: sin
// esto los tests escribirían en el HOME real y se contaminarían entre corridas.
process.env.MV_ANCLA_DIR ||= mkdtempSync(join(tmpdir(), 'mv-test-ancla-'));

// --- Par de claves Ed25519 efímero, uno por proceso de test ---
//
// El repo se publica con la clave PÚBLICA vacía y sin ninguna privada: la de
// verdad la genera cada dueño con `licencias-firma.js init` y su privada nunca
// entra acá. Sin un par, los tests sólo podrían comprobar que se rechaza lo
// inventado — nunca que se acepta lo bueno, que es la mitad que de verdad
// importa (una verificación que rechaza TODO también pasaría esos tests, y
// dejaría a los clientes que pagaron sin poder activar).
//
// Con el par armado acá, las dos puntas quedan alineadas dentro del proceso:
// store/licencias.js firma con MV_LICENCIA_PRIVADA_PEM al cobrar, y
// store/prueba.js verifica con esta pública. Eso permite el test de punta a
// punta: la licencia que emite el cobro activa de verdad el programa.
const par = generateKeyPairSync('ed25519');
const publicaB64 = par.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
process.env.MV_LICENCIA_PRIVADA_PEM ||= par.privateKey.export({ type: 'pkcs8', format: 'pem' });
// La usa scripts/firmar-licencia.js (herramienta de build) para el auto-chequeo
// de "esto que firmé, ¿lo va a aceptar la entrega?". La app NO la mira.
process.env.MV_CLAVE_PUBLICA_TEST ||= publicaB64;
_fijarClavePublica(publicaB64);
