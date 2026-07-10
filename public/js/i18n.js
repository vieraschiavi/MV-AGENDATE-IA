// Runtime multiidioma es/pt compartido por todas las páginas públicas.
// Cada página define window.MV_PT = { clave: 'texto en portugués', ... } y
// marca sus elementos con data-i18n="clave" (texto) o data-i18n-html="clave"
// (HTML, p. ej. títulos con <em>). El texto en español ya está en el HTML como
// base. La elección se guarda en localStorage ('mvIdioma') y se comparte entre
// páginas (landing, demo, instalar, online, comprar...).
(function () {
  const PT = window.MV_PT || {};
  const nodos = document.querySelectorAll('[data-i18n],[data-i18n-html]');
  const ES = new Map();
  nodos.forEach((n) => ES.set(n, n.dataset.i18nHtml ? n.innerHTML : n.textContent));

  function aplicar(idi) {
    document.documentElement.lang = idi === 'pt' ? 'pt-BR' : 'es';
    nodos.forEach((n) => {
      const html = !!n.dataset.i18nHtml;
      const k = n.dataset.i18n || n.dataset.i18nHtml;
      const val = idi === 'pt' ? (PT[k] ?? ES.get(n)) : ES.get(n);
      if (html) n.innerHTML = val; else n.textContent = val;
    });
    document.querySelectorAll('.mv-sel-idioma').forEach((s) => { s.value = idi; });
    document.dispatchEvent(new CustomEvent('mv:idioma', { detail: idi }));
  }

  let idi = localStorage.getItem('mvIdioma')
    || ((navigator.language || '').toLowerCase().startsWith('pt') ? 'pt' : 'es');
  if (idi !== 'pt') idi = 'es';
  window.mvIdioma = () => idi;
  aplicar(idi);

  document.querySelectorAll('.mv-sel-idioma').forEach((sel) => {
    sel.addEventListener('change', (e) => {
      idi = e.target.value === 'pt' ? 'pt' : 'es';
      localStorage.setItem('mvIdioma', idi);
      aplicar(idi);
    });
  });
})();
