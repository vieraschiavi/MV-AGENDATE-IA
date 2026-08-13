// © 2026 Martín Viera. Todos los derechos reservados.
// Configuración de la API key DENTRO del programa (consola), no en una web.
// Se usa al arrancar (src/programa.js) y también suelto con `npm run configurar`.
// La clave queda embebida/persistida en data/config.json: la cargás una vez y
// el programa la recuerda para siempre (ideal para vender el software ya listo).
import { createInterface } from 'node:readline';
import { getConfig, setConfig } from '../store/config.js';

// Lector de líneas robusto: buffea líneas que lleguen antes de pedirlas (pasa
// con entrada por pipe) para no perder ninguna, y resuelve '' al cerrarse.
//
// terminal: forzarlo a `false` siempre (como estaba antes) apaga el modo de
// edición de línea de Node incluso en una consola interactiva real — ahí es
// la propia consola (cmd.exe, PowerShell, terminal de Windows) la que espera
// que Node negocie el modo línea, y sin eso el backspace y las teclas de
// flecha llegan como bytes crudos que terminan insertados en el texto (así
// se explica un nombre o teléfono que sale con letras/dígitos de más o
// desordenados). Con una consola real (`isTTY`) hay que dejar `terminal:true`;
// sólo entrada NO interactiva (pipe/redirección) necesita `false`.
function crearLector() {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
  const cola = [];
  let esperando = null, cerrado = false;
  rl.on('line', (l) => { if (esperando) { const r = esperando; esperando = null; r(l); } else cola.push(l); });
  rl.on('close', () => { cerrado = true; if (esperando) { const r = esperando; esperando = null; r(''); } });
  return {
    preguntar(texto) {
      process.stdout.write(texto);
      if (cola.length) return Promise.resolve(cola.shift().trim());
      if (cerrado) return Promise.resolve('');
      return new Promise((res) => { esperando = (l) => res((l || '').trim()); });
    },
    cerrar: () => rl.close()
  };
}

/**
 * Setup interactivo por consola. Devuelve true si quedó una API key cargada.
 * @param {object} opts — { soloSiFalta:boolean } si true, no pregunta cuando ya hay clave.
 */
export async function configurarInteractivo({ soloSiFalta = false } = {}) {
  const actual = getConfig();
  if (soloSiFalta && actual.anthropicApiKey) return true;

  const lector = crearLector();
  console.log('\n==================================================');
  console.log('  MV Agendate IA — Configuración');
  console.log('==================================================');
  console.log('Pegá tu API key de Claude (Anthropic) para activar la IA real');
  console.log('del chatbot, el chatvoice y el análisis de fotos.');
  console.log('La conseguís en: https://console.anthropic.com/settings/keys');
  if (actual.anthropicApiKey) {
    const mask = actual.anthropicApiKey.slice(0, 5) + '…' + actual.anthropicApiKey.slice(-4);
    console.log(`\nYa tenés una cargada (${mask}). Enter para conservarla.`);
  } else {
    console.log('\n(Enter en blanco = seguir en MODO DEMO, sin costo, sirve para mostrar.)');
  }

  const patch = {};
  const key = await lector.preguntar('\n🔑 API key de Claude: ');
  if (key) {
    if (!/^sk-ant-/.test(key)) console.log('   ⚠️  Ojo: las keys de Anthropic suelen empezar con "sk-ant-". La guardo igual.');
    patch.anthropicApiKey = key;
  }

  const nombreProf = await lector.preguntar(`👷 Tu nombre [${actual.nombreProfesional || 'sin definir'}]: `);
  if (nombreProf) patch.nombreProfesional = nombreProf;
  const oficio = await lector.preguntar(`🔧 Tu oficio (electricista, plomero, abogado...) [${actual.oficioProfesional || 'sin definir'}]: `);
  if (oficio) patch.oficioProfesional = oficio;
  const nombre = await lector.preguntar(`🏢 Nombre comercial [${actual.agenciaNombre || 'sin definir'}]: `);
  if (nombre) patch.agenciaNombre = nombre;
  const tel = await lector.preguntar(`📞 Teléfono de contacto [${actual.agenciaTelefono || 'sin definir'}]: `);
  if (tel) patch.agenciaTelefono = tel;

  lector.cerrar();
  if (Object.keys(patch).length) {
    setConfig(patch);
    console.log('\n✅ Guardado. Queda embebido en el programa (data/config.json).');
  }
  const tieneKey = !!(patch.anthropicApiKey || actual.anthropicApiKey);
  console.log(tieneKey ? '   Modo: IA REAL (Claude) activa.\n' : '   Modo: DEMO (respuestas simuladas). Podés cargar la key cuando quieras.\n');
  return tieneKey;
}

// Ejecutado directamente: `node src/setup/configurar.js`
if (import.meta.url === `file://${process.argv[1]}`) {
  configurarInteractivo().then(() => process.exit(0));
}
