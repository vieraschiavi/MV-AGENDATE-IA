// © 2026 Martín Viera. Todos los derechos reservados.
// Genera una landing de SEO por oficio en public/oficios/.
//
// Cada página combina dos fuentes, y esa es la razón de que salgan distintas
// entre sí y no un molde con el nombre cambiado:
//   1. src/data/oficios.json — los trabajos REALES de ese oficio, con sus
//      duraciones, si cobra honorarios o mano de obra, y el traslado por km.
//      De ahí salen la tabla de servicios y los textos que hablan de tiempos.
//   2. contenido.json — copy escrito a mano por oficio: el dolor concreto del
//      rubro, un intercambio de WhatsApp con el vocabulario de ese cliente y el
//      detalle de agenda que lo diferencia.
//
// Los precios NO se hardcodean acá: la página muestra duraciones (que son
// estables) y manda al cotizador para el número, así nunca queda un precio
// viejo publicado.
//
// Correr con:  node scripts/paginas-oficio/generar.js
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = dirname(dirname(AQUI));
const SITIO = 'https://mv-agendate-ia.vercel.app';

const oficios = JSON.parse(readFileSync(join(RAIZ, 'src/data/oficios.json'), 'utf8'));
const copy = JSON.parse(readFileSync(join(AQUI, 'contenido.json'), 'utf8'));

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/** "45 minutos" / "2 horas" / "1 hora y media" — más legible que "150 min". */
function duracionLegible(min) {
  if (min < 60) return `${min} minutos`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  const horas = h === 1 ? '1 hora' : `${h} horas`;
  if (r === 0) return horas;
  if (r === 30) return h === 1 ? '1 hora y media' : `${h} horas y media`;
  return `${horas} y ${r} min`;
}

function pagina(clave, of, c) {
  const trabajos = Object.values(of.trabajos || {});
  const nombre = of.nombre;
  const honorarios = of.honorarios === true;
  const km = Number(of.traslado_por_km || 0);

  // El cobro cambia el texto: honorarios (profesionales) vs mano de obra +
  // materiales (oficios), y con o sin traslado.
  const comoCobra = honorarios
    ? `El desglose habla de <strong>honorarios</strong>, no de mano de obra y materiales.`
    : `Cada presupuesto se desglosa en <strong>mano de obra, materiales y traslado</strong>, por separado.`;
  const textoTraslado = km > 0
    ? `El traslado se cobra por kilómetro recorrido, así que el asistente calcula la distancia real antes de pasar el total.`
    : `No se cobra traslado: la atención es en tu consultorio, estudio u oficina, o por videollamada.`;

  const masLargo = trabajos.reduce((a, t) => (t.duracion_min > (a?.duracion_min || 0) ? t : a), null);
  const masCorto = trabajos.reduce((a, t) => (t.duracion_min < (a?.duracion_min || 1e9) ? t : a), null);

  const filas = trabajos.map((t) => `
        <tr>
          <td>${esc(t.nombre)}</td>
          <td class="dur">${esc(duracionLegible(t.duracion_min))}</td>
        </tr>`).join('');

  const titulo = `${nombre} con agenda y presupuestos automáticos — MV Agendate IA`;
  const desc = `${c.dolor.split('.')[0]}. MV Agendate IA atiende por WhatsApp y teléfono, cotiza con tus precios y agenda considerando el traslado.`;
  const url = `${SITIO}/${c.slug}`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(titulo)}</title>
<link rel="icon" href="/logo-mv.svg" type="image/svg+xml">
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#070d15">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${SITIO}/og-mv-agendate-ia.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="627">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="MV Agendate IA">
<meta property="og:locale" content="es_UY">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(titulo)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${SITIO}/og-mv-agendate-ia.png">
<link rel="stylesheet" href="/css/oficio.css">
</head>
<body>
<header class="nav">
  <a class="marca" href="/"><img src="/logo-mv.svg" alt=""><span>MV <em>Agendate</em> IA</span></a>
  <a class="cta" href="/comprar.html">Probalo gratis</a>
</header>

<main>
  <section class="hero">
    <p class="kicker">${esc(nombre)}</p>
    <h1>${esc(c.h1)}</h1>
    <p class="lead">${esc(c.dolor)}</p>
    <div class="botones">
      <a class="b1" href="/demo.html">Ver la demo en vivo</a>
      <a class="b2" href="/comprar.html">Precios y planes</a>
    </div>
  </section>

  <section>
    <h2>Así contesta cuando vos no podés</h2>
    <div class="chat">
      <div class="m cli">${esc(c.chatCliente)}</div>
      <div class="m bot">${esc(c.chatBot)}</div>
    </div>
    <p class="nota">El precio sale de <strong>tu</strong> lista, no de un promedio inventado. Si preferís revisarlo antes, el asistente te lo manda a aprobar y recién ahí se lo dice al cliente.</p>
  </section>

  <section>
    <h2>Los trabajos de ${esc(nombre.toLowerCase())} que ya vienen cargados</h2>
    <p>El catálogo arranca con estos y los editás con tus precios y tiempos reales:</p>
    <table class="trabajos">
      <thead><tr><th>Trabajo</th><th class="dur">Duración estimada</th></tr></thead>
      <tbody>${filas}
      </tbody>
    </table>
    <p class="nota">${comoCobra} ${esc(textoTraslado)}</p>
  </section>

  <section>
    <h2>Por qué la agenda no se te desarma</h2>
    <p>${esc(c.agenda)}</p>
    ${masLargo && masCorto && masLargo !== masCorto ? `<p>En tu rubro la diferencia es grande: <strong>${esc(masCorto.nombre)}</strong> lleva ${esc(duracionLegible(masCorto.duracion_min))} y <strong>${esc(masLargo.nombre)}</strong> ${esc(duracionLegible(masLargo.duracion_min))}. Meterlos en el mismo hueco es lo que después te hace llegar tarde.</p>` : ''}
    <p>${esc(c.urgencia)}</p>
  </section>

  <section class="cierre">
    <h2>Probalo con tus propios trabajos</h2>
    <p>Cargá tus precios, escribile como si fueras un cliente y mirá qué contesta.</p>
    <a class="b1" href="/demo.html">Abrir la demo</a>
    <p class="nota"><a href="/oficios/">Ver todos los oficios</a></p>
  </section>
</main>

<footer>MV Agendate IA · Turnos y presupuestos con IA para cualquier profesión de LATAM ·
  <a href="/">Inicio</a> · <a href="/demo.html">Demo</a> · <a href="/comprar.html">Comprar</a> · <a href="/eula.html">Licencia</a></footer>
</body>
</html>
`;
}

// --- generación ---
mkdirSync(join(RAIZ, 'public/oficios'), { recursive: true });
const generadas = [];

for (const [clave, of] of Object.entries(oficios)) {
  if (clave === '_nota') continue;
  const c = copy[clave];
  if (!c) { console.warn(`⚠️  sin copy para "${clave}" — se saltea`); continue; }
  writeFileSync(join(RAIZ, 'public/oficios', `${c.slug}.html`), pagina(clave, of, c));
  generadas.push({ clave, slug: c.slug, nombre: of.nombre, trabajos: Object.keys(of.trabajos || {}).length });
}

// Índice de oficios
const items = generadas.map((g) => `      <li><a href="/${g.slug}">${esc(g.nombre)}</a><span>${g.trabajos} trabajos precargados</span></li>`).join('\n');
writeFileSync(join(RAIZ, 'public/oficios/index.html'), `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Oficios y profesiones que atiende MV Agendate IA</title>
<link rel="icon" href="/logo-mv.svg" type="image/svg+xml">
<meta name="description" content="MV Agendate IA viene con catálogos precargados para ${generadas.length} oficios y profesiones: electricistas, plomeros, abogados, veterinarios y más. Elegí el tuyo.">
<link rel="canonical" href="${SITIO}/oficios/">
<meta property="og:type" content="website">
<meta property="og:title" content="Oficios y profesiones que atiende MV Agendate IA">
<meta property="og:description" content="Catálogos precargados para ${generadas.length} oficios y profesiones. Elegí el tuyo y mirá cómo cotiza y agenda.">
<meta property="og:image" content="${SITIO}/og-mv-agendate-ia.png">
<meta property="og:url" content="${SITIO}/oficios/">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${SITIO}/og-mv-agendate-ia.png">
<link rel="stylesheet" href="/css/oficio.css">
</head>
<body>
<header class="nav">
  <a class="marca" href="/"><img src="/logo-mv.svg" alt=""><span>MV <em>Agendate</em> IA</span></a>
  <a class="cta" href="/comprar.html">Probalo gratis</a>
</header>
<main>
  <section class="hero">
    <h1>¿A qué te dedicás?</h1>
    <p class="lead">El programa ya viene con los trabajos, las duraciones y la lógica de agenda de cada rubro. Elegí el tuyo y mirá cómo funciona con tus propios trabajos.</p>
  </section>
  <section>
    <ul class="lista-oficios">
${items}
    </ul>
  </section>
</main>
<footer>MV Agendate IA · <a href="/">Inicio</a> · <a href="/demo.html">Demo</a> · <a href="/comprar.html">Comprar</a></footer>
</body>
</html>
`);

console.log(`✔ ${generadas.length} páginas de oficio + índice → public/oficios/`);
console.log(generadas.map((g) => `   /${g.slug}`).join('\n'));
