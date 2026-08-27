// © 2026 Martín Viera. Todos los derechos reservados.

// Genera /pt/index.html y /en/index.html: copias reales de la landing con
// meta tags (title, description, og:*, twitter:*, canonical, hreflang) en su
// propio idioma. Necesario porque el selector de idioma de la landing es
// 100% client-side (localStorage + i18n.js): un scraper de redes sociales
// (WhatsApp, Facebook, Slack) no ejecuta JS, así que sin esto SIEMPRE vería
// la tarjeta en español sin importar el idioma real del visitante que
// comparte el link.
//
// El resto de la página (CSS, cuerpo, los diccionarios MV_PT/MV_EN que ya
// existían para el switcher) queda EXACTAMENTE igual — no se duplica lógica,
// solo se cambia el <head> y se fuerza el idioma inicial antes de que corra
// i18n.js, para que lo que ve un visitante real también coincida con la URL
// a la que entró (no solo lo que ve un bot).
//
// Correr con: node scripts/landing-idiomas/generar.js
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = dirname(dirname(AQUI));
const SITIO = 'https://www.mvbusinesscalendar.com';

// public/index.html es a la vez la plantilla fuente Y uno de los archivos
// generados (la versión "es"). Sin esto, correr el script dos veces duplica
// el bloque hreflang/og:locale:alternate en vez de reemplazarlo: se limpia
// cualquier rastro de una corrida anterior ANTES de usarlo como base, así
// el script es idempotente sin importar cuántas veces se corra.
function sanear(html) {
  return html
    .split('\n')
    .filter((linea) => !/rel="alternate" hreflang=|property="og:locale:alternate"/.test(linea))
    .join('\n');
}

const BASE = sanear(readFileSync(join(RAIZ, 'public/index.html'), 'utf8'));

// Los mismos textos cortos que ya están (en español) en el <head> de
// index.html, traducidos con el mismo tono que los diccionarios MV_PT/MV_EN
// que ya vive en la página (kicker/h1/lead).
const META = {
  es: {
    lang: 'es', hreflang: 'es', locale: 'es_UY', ruta: '',
    title: 'MV Agendate IA — Tu asistente que cotiza y agenda solo',
    desc: 'El asistente con IA que atiende WhatsApp y teléfono, cotiza con tus precios y agenda optimizando traslados. Para cualquier profesión de LATAM.',
    ogTitle: 'MV Agendate IA — tu asistente que cotiza y agenda solo',
    ogDesc: 'IA que atiende WhatsApp y teléfono, cotiza con tus precios y agenda optimizando traslados reales.',
    imgAlt: 'MV Agendate IA — cotizá y agendá solo, por WhatsApp y teléfono',
  },
  pt: {
    lang: 'pt-BR', hreflang: 'pt-BR', locale: 'pt_BR', ruta: 'pt/',
    title: 'MV Agenda IA — Seu assistente que orça e agenda sozinho',
    desc: 'O assistente com IA que atende WhatsApp e telefone, orça com seus preços e agenda otimizando deslocamentos. Para qualquer profissão da América Latina.',
    ogTitle: 'MV Agenda IA — seu assistente que orça e agenda sozinho',
    ogDesc: 'IA que atende WhatsApp e telefone, orça com seus preços e agenda otimizando deslocamentos reais.',
    imgAlt: 'MV Agenda IA — orce e agende sozinho, por WhatsApp e telefone',
  },
  en: {
    lang: 'en', hreflang: 'en', locale: 'en_US', ruta: 'en/',
    title: 'MV Schedule AI — Your assistant that quotes and books on its own',
    desc: 'The AI assistant that answers WhatsApp and phone calls, quotes with your prices and books appointments optimizing travel. For any trade in Latin America.',
    ogTitle: 'MV Schedule AI — your assistant that quotes and books on its own',
    ogDesc: 'AI that answers WhatsApp and phone calls, quotes with your prices and books appointments optimizing real travel.',
    imgAlt: 'MV Schedule AI — quote and book on your own, via WhatsApp and phone',
  },
};

function hreflangs() {
  const links = Object.values(META)
    .map((m) => `<link rel="alternate" hreflang="${m.hreflang}" href="${SITIO}/${m.ruta}">`)
    .join('\n');
  return `${links}\n<link rel="alternate" hreflang="x-default" href="${SITIO}/">`;
}

function ogLocaleAlternate(idi) {
  return Object.entries(META)
    .filter(([k]) => k !== idi)
    .map(([, m]) => `<meta property="og:locale:alternate" content="${m.locale}">`)
    .join('\n');
}

function pagina(idi) {
  const m = META[idi];
  let html = BASE;
  html = html.replace('<html lang="es">', `<html lang="${m.lang}">`);
  html = html.replace(
    '<title>MV Agendate IA — Tu asistente que cotiza y agenda solo</title>',
    `<title>${m.title}</title>`
  );
  html = html.replace(
    '<meta name="description" content="El asistente con IA que atiende WhatsApp y teléfono, cotiza con tus precios y agenda optimizando traslados. Para cualquier profesión de LATAM.">',
    `<meta name="description" content="${m.desc}">`
  );
  html = html.replace(
    '<meta property="og:title" content="MV Agendate IA — tu asistente que cotiza y agenda solo">',
    `<meta property="og:title" content="${m.ogTitle}">`
  );
  html = html.replace(
    '<meta property="og:description" content="IA que atiende WhatsApp y teléfono, cotiza con tus precios y agenda optimizando traslados reales.">',
    `<meta property="og:description" content="${m.ogDesc}">`
  );
  html = html.replace(
    '<meta property="og:url" content="https://www.mvbusinesscalendar.com/">',
    `<meta property="og:url" content="${SITIO}/${m.ruta}">`
  );
  html = html.replace(
    '<meta property="og:locale" content="es_UY">',
    `<meta property="og:locale" content="${m.locale}">\n${ogLocaleAlternate(idi)}`
  );
  html = html.replace(
    '<link rel="canonical" href="https://www.mvbusinesscalendar.com/">',
    `<link rel="canonical" href="${SITIO}/${m.ruta}">\n${hreflangs()}`
  );
  html = html.replace(
    '<meta name="twitter:title" content="MV Agendate IA — tu asistente que cotiza y agenda solo">',
    `<meta name="twitter:title" content="${m.ogTitle}">`
  );
  html = html.replace(
    '<meta name="twitter:description" content="IA que atiende WhatsApp y teléfono, cotiza con tus precios y agenda optimizando traslados reales.">',
    `<meta name="twitter:description" content="${m.ogDesc}">`
  );
  html = html.replaceAll(
    'MV Agendate IA — cotizá y agendá solo, por WhatsApp y teléfono',
    m.imgAlt
  );
  if (idi !== 'es') {
    // El texto visible (no solo el <head>) también tiene que coincidir con
    // el idioma de la URL — se fija ANTES de que corra i18n.js, que si no
    // encuentra nada guardado cae a detectar el idioma del navegador (podría
    // no coincidir con el idioma de esta página).
    html = html.replace(
      '<script src="/js/i18n.js"></script>',
      `<script>try{localStorage.setItem('mvIdioma','${idi}');}catch{}</script>\n<script src="/js/i18n.js"></script>`
    );
  }
  return html;
}

mkdirSync(join(RAIZ, 'public/pt'), { recursive: true });
mkdirSync(join(RAIZ, 'public/en'), { recursive: true });
writeFileSync(join(RAIZ, 'public/pt/index.html'), pagina('pt'));
writeFileSync(join(RAIZ, 'public/en/index.html'), pagina('en'));

// La raíz (es) también necesita el bloque hreflang/og:locale:alternate: si
// /pt/ y /en/ apuntan de vuelta a /, / tiene que anunciar las tres también
// (Google trata las relaciones hreflang como recíprocas obligatorias).
writeFileSync(join(RAIZ, 'public/index.html'), pagina('es'));

console.log('✔ public/index.html (hreflang agregado), public/pt/index.html, public/en/index.html');
