// Runtime multiidioma (es / pt / en) compartido por todas las páginas públicas.
// El español es la base (está en el HTML). Cada página aporta las traducciones:
//   window.MV_PT = { clave: 'texto pt', ... }   // portugués
//   window.MV_EN = { clave: 'texto en', ... }   // inglés (opcional)
// Los elementos se marcan con data-i18n="clave" (texto) o data-i18n-html="clave"
// (HTML, p. ej. títulos con <em>). La elección se guarda en localStorage
// ('mvIdioma') y se comparte entre páginas. Si no hay elección previa, se
// autodetecta por el idioma del navegador (pt→pt, en→en, resto→es).
(function () {
  const DICC = { pt: window.MV_PT || {}, en: window.MV_EN || {} };
  const SOPORTADOS = ['es', 'pt', 'en'];
  const LANG_ATTR = { es: 'es', pt: 'pt-BR', en: 'en' };
  const nodos = document.querySelectorAll('[data-i18n],[data-i18n-html]');
  const ES = new Map();
  nodos.forEach((n) => ES.set(n, n.dataset.i18nHtml ? n.innerHTML : n.textContent));

  function aplicar(idi) {
    document.documentElement.lang = LANG_ATTR[idi] || 'es';
    const dic = DICC[idi] || {};
    nodos.forEach((n) => {
      const html = !!n.dataset.i18nHtml;
      const k = n.dataset.i18n || n.dataset.i18nHtml;
      const val = idi === 'es' ? ES.get(n) : (dic[k] ?? ES.get(n)); // fallback al español
      if (html) n.innerHTML = val; else n.textContent = val;
    });
    document.querySelectorAll('.mv-sel-idioma').forEach((s) => { s.value = idi; });
    document.dispatchEvent(new CustomEvent('mv:idioma', { detail: idi }));
  }

  function autodetectar() {
    const nav = (navigator.language || '').toLowerCase();
    if (nav.startsWith('pt')) return 'pt';
    if (nav.startsWith('en')) return 'en';
    return 'es';
  }

  let idi = localStorage.getItem('mvIdioma');
  if (!SOPORTADOS.includes(idi)) idi = autodetectar();
  window.mvIdioma = () => idi;
  aplicar(idi);

  document.querySelectorAll('.mv-sel-idioma').forEach((sel) => {
    sel.addEventListener('change', (e) => {
      idi = SOPORTADOS.includes(e.target.value) ? e.target.value : 'es';
      localStorage.setItem('mvIdioma', idi);
      aplicar(idi);
    });
  });
})();

// Video promocional según idioma: el inglés usa /video/mv-agendate-ia-en.mp4.
(function () {
  function ajustarVideo() {
    const idi = (window.mvIdioma && window.mvIdioma()) || 'es';
    const base = '/video/mv-agendate-ia';
    const src = idi === 'en' ? base + '-en.mp4' : base + '.mp4';
    document.querySelectorAll('video.mv-video').forEach((v) => {
      const fuente = v.querySelector('source');
      if (!fuente || fuente.getAttribute('src') === src) return;
      const estaba = !v.paused;
      fuente.setAttribute('src', src);
      v.load();
      if (estaba) v.play().catch(() => {});
    });
  }
  ajustarVideo();
  document.addEventListener('mv:idioma', ajustarVideo);
})();

// Precio de referencia en UYU (chico, al lado del USD). El cobro real por
// MercadoPago Uruguay es en UYU; este es un valor orientativo. Tipo de cambio
// de referencia — se puede sobreescribir con window.MV_TIPO_CAMBIO_UYU.
window.mvUYU = function (usd) {
  const tc = window.MV_TIPO_CAMBIO_UYU || 42;
  return '≈ $' + Math.round(Number(usd) * tc).toLocaleString('es-UY') + ' UYU';
};
(function () {
  // Decora cada elemento con data-usd="129" agregando el equivalente en UYU.
  document.querySelectorAll('[data-usd]').forEach((el) => {
    if (el.querySelector('.uyu-ref')) return;
    const s = document.createElement('small');
    s.className = 'uyu-ref';
    s.style.cssText = 'display:block;font-size:.7em;font-weight:600;opacity:.6;margin-top:2px;';
    s.textContent = window.mvUYU(el.dataset.usd);
    el.appendChild(s);
  });
})();
