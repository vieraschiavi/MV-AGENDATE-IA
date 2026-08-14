// © 2026 Martín Viera. Todos los derechos reservados.

// Deja el programa LOCAL listo para mostrar el circuito completo:
// chatear con el bot → que cotice → que agende → cobrar por MercadoPago →
// ver la cita marcada como pagada.
//
//   npm run demo-caso
//
// Ojo: esto escribe en el almacén de ESTA máquina. Para dejar la demo pronta
// en el deploy (Vercel), usá la pestaña "Demo" del panel — el script no puede
// tocar los datos de producción.
//
// La lógica vive en src/store/demo-caso.js, compartida con el botón del panel
// para que las dos puntas armen exactamente el mismo caso.
import { get as cfg, setConfig } from '../src/store/config.js';
import { prepararCasoDemo, CLIENTE_DEMO, PRECIO_DEMO } from '../src/store/demo-caso.js';

async function main() {
  // Datos del profesional que sólo tienen sentido en la copia local.
  setConfig({
    nombreProfesional: cfg('nombreProfesional') || CLIENTE_DEMO.nombre,
    agenciaNombre: cfg('agenciaNombre') || 'MV Agendate IA',
    agenciaTelefono: cfg('agenciaTelefono') || CLIENTE_DEMO.telefono
  });

  const r = await prepararCasoDemo();
  if (!r.ok) {
    console.error(`No pude preparar el caso de demostración: ${r.error}`);
    process.exit(1);
  }
  const { cita, yaExistia } = r;

  const listo = (v) => (v ? '✔' : '✘');
  console.log(`
  Caso de demostración listo
  ==========================

  Catálogo      "Visita de demostración" a $${PRECIO_DEMO}
  Cliente       ${CLIENTE_DEMO.nombre} · ${CLIENTE_DEMO.telefono} · ${CLIENTE_DEMO.email}
  Cita          ${cita.id} — ${cita.fecha} ${cita.inicio}${yaExistia ? '  (ya existía, no se duplicó)' : ''}

  Para mostrarlo en vivo
  ----------------------
  1. Chat:    abrí /demo.html y pedí "una visita de demostración".
              El bot cotiza $${PRECIO_DEMO} del catálogo y agenda solo.
  2. Cobro:   POST /api/citas/${cita.id}/cobrar  → devuelve el link de MercadoPago.
  3. Pago:    abrí ese link y pagá los $${PRECIO_DEMO} de verdad.
  4. Registro: al confirmar MercadoPago, la cita queda marcada como PAGADA sola.

  Lo que hace falta configurar para que el paso 3 y 4 funcionen de verdad
  ----------------------------------------------------------------------
  ${listo(cfg('mercadopagoToken'))} mercadopagoToken   Access Token de TU cuenta de MercadoPago (/config.html)
  ${listo(cfg('sitioUrl'))} sitioUrl           dominio público, para que MercadoPago avise el pago
  ${listo(cfg('anthropicApiKey') || cfg('openaiApiKey') || cfg('geminiApiKey'))} API key de IA      para que el chatbot conteste de verdad (si no, responde en modo demo)

  El dinero entra a TU cuenta de MercadoPago. El retiro al banco (Itaú u otro)
  se hace desde MercadoPago: el programa no mueve plata entre cuentas.
`);
}

main().catch((e) => { console.error('No pude preparar el caso de demostración:', e.message); process.exit(1); });
