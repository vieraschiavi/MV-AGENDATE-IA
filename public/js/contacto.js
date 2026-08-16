// © 2026 Martín Viera. Todos los derechos reservados.

// Buzón de contacto — botón flotante + formulario.
// Envía la consulta a vieraschiavi@gmail.com (asunto + pregunta + datos de contacto).
// Funciona en la web, en el programa PC y en la APK (abre el correo con mailto).
// Además avisa al backend (/api/contacto) por si querés registrar/reenviar las consultas.
//
// Uso: <script src="/js/contacto.js" defer></script>
(function () {
  const DESTINO = 'vieraschiavi@gmail.com';

  // Textos (ES/EN/PT) — toma el idioma de localStorage mv_lang si existe.
  const TX = {
    es: { btn: '✉ Contacto', tit: 'Escribinos tu consulta', nom: 'Nombre', mail: 'Tu email', tel: 'Teléfono de contacto',
          asu: 'Asunto', pre: 'Tu pregunta', env: 'Enviar consulta', cerrar: 'Cerrar',
          ok: '¡Gracias! Se abrió tu correo con la consulta lista para enviar.', falta: 'Completá al menos el asunto y la pregunta.',
          sub: 'Consulta desde MV Agendate IA' },
    en: { btn: '✉ Contact', tit: 'Send us your question', nom: 'Name', mail: 'Your email', tel: 'Contact phone',
          asu: 'Subject', pre: 'Your question', env: 'Send question', cerrar: 'Close',
          ok: 'Thanks! Your email opened with the question ready to send.', falta: 'Please fill at least subject and question.',
          sub: 'Inquiry from MV Agendate IA' },
    pt: { btn: '✉ Contato', tit: 'Envie sua consulta', nom: 'Nome', mail: 'Seu email', tel: 'Telefone de contato',
          asu: 'Assunto', pre: 'Sua pergunta', env: 'Enviar consulta', cerrar: 'Fechar',
          ok: 'Obrigado! Seu email abriu com a consulta pronta para enviar.', falta: 'Preencha ao menos assunto e pergunta.',
          sub: 'Consulta do MV Agendate IA' },
  };
  const lang = () => { const g = (localStorage.getItem('mv_lang') || 'es').slice(0, 2); return TX[g] ? g : 'es'; };
  const t = (k) => TX[lang()][k];

  const st = document.createElement('style');
  st.textContent = `
    .mvc-fab{ position:fixed; right:18px; bottom:18px; z-index:9998; background:#1f7ae0; color:#fff; border:0;
      border-radius:26px; padding:12px 18px; font:600 .95rem system-ui,sans-serif; cursor:pointer; box-shadow:0 8px 24px #0f2a4340; }
    .mvc-fab:hover{ background:#1667c4; }
    .mvc-ov{ position:fixed; inset:0; background:#0b1f3399; z-index:9999; display:none; align-items:center; justify-content:center; padding:16px; }
    .mvc-ov.on{ display:flex; }
    .mvc-card{ background:#fff; color:#1e2b38; width:100%; max-width:440px; border-radius:16px; padding:22px; box-shadow:0 24px 70px #0008; font-family:system-ui,sans-serif; }
    .mvc-card h3{ margin:0 0 4px; color:#0f2a43; font-size:1.15rem; }
    .mvc-card label{ display:block; font-size:.78rem; color:#5a6b7c; margin:10px 0 3px; }
    .mvc-card input,.mvc-card textarea{ width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid #cfd9e4; border-radius:9px; font-size:.92rem; font-family:inherit; }
    .mvc-card textarea{ min-height:88px; resize:vertical; }
    .mvc-row{ display:flex; gap:10px; } .mvc-row > div{ flex:1; }
    .mvc-send{ margin-top:14px; width:100%; background:#1f7ae0; color:#fff; border:0; border-radius:10px; padding:13px; font-weight:700; font-size:1rem; cursor:pointer; }
    .mvc-x{ float:right; background:none; border:0; font-size:1.3rem; cursor:pointer; color:#8a99a8; line-height:1; }
    .mvc-ok{ margin-top:10px; font-size:.88rem; color:#1a7f37; display:none; }`;
  document.head.appendChild(st);

  const fab = document.createElement('button');
  fab.className = 'mvc-fab'; fab.type = 'button'; fab.textContent = t('btn');

  const ov = document.createElement('div');
  ov.className = 'mvc-ov';
  ov.innerHTML = `
    <div class="mvc-card" role="dialog" aria-modal="true">
      <button class="mvc-x" data-cerrar aria-label="Cerrar">×</button>
      <h3 class="mvc-tit"></h3>
      <div class="mvc-row">
        <div><label class="l-nom" for="mvc-nom"></label><input id="mvc-nom" autocomplete="name"></div>
        <div><label class="l-tel" for="mvc-tel"></label><input id="mvc-tel" autocomplete="tel" inputmode="tel"></div>
      </div>
      <label class="l-mail" for="mvc-mail"></label><input id="mvc-mail" type="email" autocomplete="email">
      <label class="l-asu" for="mvc-asu"></label><input id="mvc-asu">
      <label class="l-pre" for="mvc-pre"></label><textarea id="mvc-pre"></textarea>
      <button class="mvc-send" data-enviar></button>
      <div class="mvc-ok"></div>
    </div>`;

  function pintarTextos() {
    fab.textContent = t('btn');
    ov.querySelector('.mvc-tit').textContent = t('tit');
    ov.querySelector('.l-nom').textContent = t('nom');
    ov.querySelector('.l-tel').textContent = t('tel');
    ov.querySelector('.l-mail').textContent = t('mail');
    ov.querySelector('.l-asu').textContent = t('asu');
    ov.querySelector('.l-pre').textContent = t('pre');
    ov.querySelector('[data-enviar]').textContent = t('env');
  }

  function abrir() { pintarTextos(); ov.classList.add('on'); }
  function cerrar() { ov.classList.remove('on'); }

  function enviar() {
    const nom = ov.querySelector('#mvc-nom').value.trim();
    const tel = ov.querySelector('#mvc-tel').value.trim();
    const mail = ov.querySelector('#mvc-mail').value.trim();
    const asu = ov.querySelector('#mvc-asu').value.trim();
    const pre = ov.querySelector('#mvc-pre').value.trim();
    if (!asu || !pre) { alert(t('falta')); return; }

    const cuerpo =
      `${pre}\n\n— — —\n` +
      `Nombre: ${nom || '(no indicado)'}\n` +
      `Email de contacto: ${mail || '(no indicado)'}\n` +
      `Teléfono de contacto: ${tel || '(no indicado)'}\n`;
    const asunto = `${t('sub')} — ${asu}`;
    const href = `mailto:${DESTINO}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;

    // Aviso al backend (best-effort). Si falla NO se le muestra error al usuario
    // a propósito: el canal real es el mailto de abajo, que abre igual. Se loguea
    // para poder diagnosticarlo desde la consola.
    try {
      fetch('/api/contacto', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nom, email: mail, telefono: tel, asunto: asu, pregunta: pre }),
      }).catch((e) => console.warn('[contacto] no se pudo avisar al backend:', e));
    } catch (e) {
      console.warn('[contacto] no se pudo avisar al backend:', e);
    }

    const okBox = ov.querySelector('.mvc-ok');
    okBox.textContent = t('ok'); okBox.style.display = 'block';
    window.location.href = href; // abre el cliente de correo con todo pre-cargado
  }

  ov.addEventListener('click', (e) => {
    if (e.target === ov || e.target.hasAttribute('data-cerrar')) cerrar();
    if (e.target.hasAttribute('data-enviar')) enviar();
  });
  fab.addEventListener('click', abrir);

  function init() {
    document.body.appendChild(fab);
    document.body.appendChild(ov);
    pintarTextos();
    // Cualquier elemento con [data-mvc-abrir] también abre el buzón (ej. un link del nav/footer).
    document.querySelectorAll('[data-mvc-abrir]').forEach((el) => el.addEventListener('click', (e) => { e.preventDefault(); abrir(); }));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.MVContacto = { abrir, cerrar };
})();
