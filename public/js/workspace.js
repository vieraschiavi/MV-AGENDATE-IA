// © 2026 Martín Viera. Todos los derechos reservados.
// Shell de workspace tipo Notion compartido por panel.html/agenda.html/clientes.html/dashboards.html:
// sidebar de navegación + helper de fetch con clave admin persistida.
// Uso: <script src="/js/workspace.js" defer></script> y luego mvShell('agenda') al cargar la página.
(function () {
  const PAGINAS = [
    { key: 'panel', href: '/panel.html', ico: '🗓️', label: 'Panel del día' },
    { key: 'agenda', href: '/agenda.html', ico: '📅', label: 'Agenda' },
    { key: 'clientes', href: '/clientes.html', ico: '👥', label: 'Clientes' },
    { key: 'dashboards', href: '/dashboards.html', ico: '📊', label: 'Dashboards' },
    { key: 'ayuda', href: '/ayuda.html', ico: '❓', label: 'Ayuda' },
  ];

  function claveAdmin() { return localStorage.getItem('mvAdminKey') || ''; }

  window.mvFetchAdmin = async function mvFetchAdmin(url, opts = {}) {
    opts.headers = { ...(opts.headers || {}), 'X-Admin-Key': claveAdmin() };
    let r = await fetch(url, opts);
    if (r.status === 401) {
      const k = prompt('Clave de administración:');
      if (k == null) return r;
      localStorage.setItem('mvAdminKey', k);
      opts.headers['X-Admin-Key'] = k;
      r = await fetch(url, opts);
    }
    return r;
  };

  window.mvShell = function mvShell(activeKey) {
    const nav = PAGINAS.map((p) =>
      `<a href="${p.href}" class="${p.key === activeKey ? 'on' : ''}"><span class="ico">${p.ico}</span><span>${p.label}</span></a>`
    ).join('');

    document.body.insertAdjacentHTML('afterbegin', `
      <div class="mv-topbar-mobile">
        <button id="mvToggleSidebar" aria-label="Abrir menú">☰</button>
        <strong>MV Agendate IA</strong>
      </div>
      <div class="mv-app">
        <div class="mv-sidebar-backdrop" id="mvBackdrop"></div>
        <aside class="mv-sidebar" id="mvSidebar">
          <div class="mv-ws">
            <img src="/logo-mv.svg" alt="MV">
            <div><strong>MV Agendate IA</strong><span>Espacio de trabajo</span></div>
          </div>
          <nav class="mv-nav">${nav}</nav>
          <div class="mv-nav-bottom">
            <a href="/"><span class="ico">🏠</span><span>Inicio</span></a>
            <button id="mvBtnAdmin" type="button"><span class="ico">🔑</span><span>Clave admin</span></button>
          </div>
        </aside>
        <main class="mv-main" id="mvMain"></main>
      </div>
    `);

    // Mueve el contenido ya presente en <body> (escrito por cada página) dentro de <main>.
    const main = document.getElementById('mvMain');
    const suelto = Array.from(document.body.children).filter(
      (el) => el !== document.querySelector('.mv-topbar-mobile') && el !== document.querySelector('.mv-app') && el.tagName !== 'SCRIPT'
    );
    suelto.forEach((el) => main.appendChild(el));

    const sidebar = document.getElementById('mvSidebar');
    const backdrop = document.getElementById('mvBackdrop');
    const cerrar = () => { sidebar.classList.remove('open'); backdrop.classList.remove('open'); };
    document.getElementById('mvToggleSidebar').onclick = () => {
      sidebar.classList.toggle('open'); backdrop.classList.toggle('open');
    };
    backdrop.onclick = cerrar;

    document.getElementById('mvBtnAdmin').onclick = () => {
      const actual = claveAdmin();
      const k = prompt('Clave de administración:', actual);
      if (k != null) localStorage.setItem('mvAdminKey', k);
    };
  };
})();
