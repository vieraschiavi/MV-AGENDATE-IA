// © 2026 Martín Viera. Todos los derechos reservados.
// Embeber la API key del VENDEDOR dentro del producto, oculta (base64).
// Lo corre el vendedor UNA vez antes de empaquetar/vender: la clave queda
// dentro de src/clave-embebida.b64 y viaja con el producto sin quedar a la
// vista. El servidor la usa como default; nunca se expone por la API (el panel
// la muestra enmascarada). Así el comprador recibe el producto ya funcionando
// con IA real, y el público nunca ve la clave.
//
// Uso:  npm run embeber-clave
import { createInterface } from 'node:readline';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '../clave-embebida.b64');

// Lector robusto: buffea líneas que lleguen antes de pedirlas (entrada por pipe).
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
const cola = []; let esperando = null, cerrado = false;
rl.on('line', (l) => { if (esperando) { const r = esperando; esperando = null; r(l); } else cola.push(l); });
rl.on('close', () => { cerrado = true; if (esperando) { const r = esperando; esperando = null; r(''); } });
const preguntar = (t) => { process.stdout.write(t);
  if (cola.length) return Promise.resolve(cola.shift().trim());
  if (cerrado) return Promise.resolve('');
  return new Promise((res) => { esperando = (l) => res((l || '').trim()); }); };

console.log('\n==================================================');
console.log('  Embeber API key del vendedor (oculta) en el producto');
console.log('==================================================');
console.log('La clave se guarda ofuscada (base64) en src/clave-embebida.b64 y');
console.log('viaja con el producto. El comprador y el público nunca la ven.');

const key = await preguntar('\n🔑 API key de Claude (sk-ant-...): ');
if (!key) { console.log('Sin clave, no cambio nada.'); rl.close(); process.exit(0); }
const nombre = await preguntar('🏢 Nombre por defecto de la agencia (opcional): ');
const tel = await preguntar('📞 Teléfono por defecto (opcional): ');
const limite = (await preguntar('¿Es una instancia de DEMOSTRACIÓN con cupo de 3 usos? (s/N): ')).toLowerCase().startsWith('s');
rl.close();

const cfg = { anthropicApiKey: key };
if (nombre) cfg.agenciaNombre = nombre;
if (tel) cfg.agenciaTelefono = tel;
if (limite) { cfg.demoLimite = '1'; cfg.demoMaxUsos = '3'; }

const b64 = Buffer.from(JSON.stringify(cfg), 'utf8').toString('base64');
writeFileSync(OUT, b64 + '\n');
console.log(`\n✅ Clave embebida en ${OUT}`);
console.log('   Guardá este archivo en el paquete que vendés. Para quitarla, borralo.');
console.log(limite ? '   Modo: DEMOSTRACIÓN (3 usos gratis con todas las opciones).\n' : '   Modo: PRODUCTO COMPLETO (IA ilimitada).\n');
