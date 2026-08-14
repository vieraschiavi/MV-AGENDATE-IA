// © 2026 Martín Viera. Todos los derechos reservados.
// Software propietario. Uso sujeto a LICENSE.
//
// EL SELLO DEL DUEÑO ESTÁ FIRMADO — metodología portada de Buscador-Inmobiliario.
//
// Antes la "llave maestra" era un .bat que reescribía archivos del código con
// la receta a la vista: cualquiera que lo leyera convertía su copia en la
// versión completa. Ahora el sello es un token Ed25519: sin la clave privada
// del dueño no se fabrica, y el programa verifica la firma al arrancar.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { writeFileSync, readFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Par de claves propio del test: nunca la de producción.
const par = generateKeyPairSync('ed25519');
process.env.MV_MODO_DESARROLLO = '1';
process.env.MV_LICENCIAS_PUBLICA = par.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
process.env.MV_LICENCIAS_PRIVADA = par.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();

// El sello se busca en MV_ANCLA_DIR (el mismo que ya aísla el ancla de la
// prueba en los tests: scripts/aislar-datos-test.js lo setea).
const DIR = process.env.MV_ANCLA_DIR || mkdtempSync(join(tmpdir(), 'mv-sello-'));
process.env.MV_ANCLA_DIR = DIR;

const { esOwner } = await import('../src/store/sello-owner.js');
const { emitirToken } = await import('../src/store/firma.js');
const { estadoPrueba, pruebaBloqueada } = await import('../src/store/prueba.js');

const RUTA_SELLO = join(DIR, 'licencia-owner.json');
const limpiar = () => rmSync(RUTA_SELLO, { force: true });

describe('sello de dueño firmado', () => {
  test('sin sello no es owner', () => {
    limpiar();
    assert.equal(esOwner(), false);
  });

  test('el JSON plano que usaba el .bat viejo YA NO desbloquea nada', () => {
    limpiar();
    mkdirSync(DIR, { recursive: true });
    // Las recetas que circulaban: ninguna puede valer sin firma.
    for (const falso of ['{"edicion":"owner"}', '{"token":"MV1.falso.falso"}', 'owner']) {
      writeFileSync(RUTA_SELLO, falso);
      assert.equal(esOwner(), false, `"${falso}" no puede dar la edición del dueño`);
    }
    limpiar();
  });

  test('un sello firmado con OTRA clave no vale', () => {
    limpiar();
    const otro = generateKeyPairSync('ed25519');
    const ajeno = emitirToken({ tipo: 'owner' },
      otro.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString());
    mkdirSync(DIR, { recursive: true });
    writeFileSync(RUTA_SELLO, JSON.stringify({ token: ajeno }));
    assert.equal(esOwner(), false);
    limpiar();
  });

  test('el sello FIRMADO activa la edición del dueño: sin límite y sin bloqueo', () => {
    limpiar();
    mkdirSync(DIR, { recursive: true });
    writeFileSync(RUTA_SELLO, JSON.stringify({ token: emitirToken({ tipo: 'owner' }) }));
    assert.equal(esOwner(), true);
    // Lo que el dueño ve de verdad: la prueba directamente NO aplica (como una
    // copia con la prueba desactivada), nunca vence y nada se bloquea.
    const e = estadoPrueba();
    assert.equal(e.aplica, false, 'al dueño no le corre ninguna prueba');
    assert.equal(e.vencida, false);
    assert.equal(e.diasPrueba, 0, 'el sello manda: sin límite');
    assert.equal(pruebaBloqueada(), false, 'la copia del dueño no puede bloquearse');
    limpiar();
  });
});

describe('el instalador y el .bat llevan el sello REAL', () => {
  const aca = new URL('..', import.meta.url);
  const leer = (p) => readFileSync(new URL(p, aca), 'utf8');

  test('el .bat del dueño escribe un token con el formato firmado, no una receta', () => {
    const bat = leer('INSTALADOR/OWNER/Convertir-a-version-dueno.bat');
    assert.match(bat, /\{"token": "MV1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+"\}/,
      'el sello del .bat tiene que ser un token firmado');
    assert.doesNotMatch(bat, /diasPrueba: 0|DIAS_FIJADOS = 0/,
      'la receta vieja (reescribir el código) no puede seguir en el .bat');
    // Autodetección: escribe en el perfil (no exige copiarlo a la carpeta) y
    // además busca la instalación en las rutas estándar y el registro.
    assert.match(bat, /USERPROFILE.*\.mv-agendate-ia/, 'tiene que sellar el perfil del usuario');
    assert.match(bat, /LOCALAPPDATA.*Programs.*MV Agendate IA/, 'tiene que probar la ruta estándar');
    assert.match(bat, /reg query .*Uninstall/, 'tiene que poder encontrar instalaciones en otras carpetas');
    const raros = [...bat].filter((c) => c.charCodeAt(0) > 126);
    assert.deepEqual(raros, [], '.bat en ASCII puro (chcp rompe los acentos)');
  });

  test('el .nsh del instalador OWNER escribe el mismo token donde lo lee el programa', () => {
    const nsh = leer('build/instalador-owner.nsh');
    const enNsh = nsh.match(/FileWrite \$0 '(\{"token": "[^']+"\})'/)?.[1];
    const enBat = leer('INSTALADOR/OWNER/Convertir-a-version-dueno.bat')
      .match(/set "SELLO=(\{"token": "[^"]+"\})"/)?.[1];
    assert.ok(enNsh, 'el .nsh tiene que escribir el sello');
    assert.equal(enNsh, enBat, 'instalador y .bat tienen que sellar EXACTAMENTE lo mismo');
    // La ruta del .nsh es la que sello-owner.js mira junto al código
    // (resources\app\data): si divergen, el instalador "anda" y deja demo.
    assert.match(nsh, /\$INSTDIR\\resources\\app\\data\\licencia-owner\.json/);
    assert.match(nsh, /customUnInstall/, 'el desinstalador tiene que borrar el sello');
  });

  test('el build del owner ya NO compila un payload distinto', () => {
    const pkg = JSON.parse(leer('package.json'));
    assert.doesNotMatch(pkg.scripts['preempaquetar-exe-owner'], /--owner/,
      'el owner sale del MISMO payload que el cliente; lo distinto es el sello del NSIS');
    assert.match(pkg.scripts['empaquetar-exe-owner'], /instalador-owner\.nsh/,
      'el instalador owner tiene que incluir el sello');
  });
});
