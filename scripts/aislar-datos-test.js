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

// Si el test ya eligió su propio directorio, se respeta.
process.env.MV_DATOS_DIR ||= mkdtempSync(join(tmpdir(), 'mv-test-datos-'));
// Ídem el ancla del inicio de prueba, que vive en el perfil del usuario: sin
// esto los tests escribirían en el HOME real y se contaminarían entre corridas.
process.env.MV_ANCLA_DIR ||= mkdtempSync(join(tmpdir(), 'mv-test-ancla-'));
