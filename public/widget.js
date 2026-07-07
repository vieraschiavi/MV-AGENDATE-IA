// Widget de chat embebible — MV Agendate IA
// Uso en el sitio web del profesional:
//   <script src="https://TU-DOMINIO/widget.js" data-servidor="https://TU-DOMINIO" defer></script>
(function () {
  const script = document.currentScript;
  const SERVIDOR = (script && script.dataset.servidor) || '';
  let sessionId = null;
  let abierto = false;

  const css = `
    #mv-burbuja { position:fixed; bottom:22px; right:22px; width:60px; height:60px; border-radius:50%;
      background:#1f7ae0; color:#fff; font-size:28px; border:0; cursor:pointer; box-shadow:0 6px 20px #0004; z-index:99998; }
    #mv-caja { position:fixed; bottom:94px; right:22px; width:340px; max-width:92vw; height:460px; background:#fff;
      border-radius:14px; box-shadow:0 10px 40px #0005; display:none; flex-direction:column; overflow:hidden;
      z-index:99999; font-family:'Segoe UI',system-ui,sans-serif; }
    #mv-caja.abierto { display:flex; }
    #mv-cab { background:#0f2a43; color:#fff; padding:12px 16px; font-weight:600; font-size:14px; }
    #mv-msgs { flex:1; overflow-y:auto; padding:12px; display:flex; flex-direction:column; gap:8px; background:#f4f6f9; }
    .mv-m { max-width:84%; padding:8px 12px; border-radius:12px; font-size:13.5px; line-height:1.4; white-space:pre-wrap; }
    .mv-m.u { align-self:flex-end; background:#1f7ae0; color:#fff; }
    .mv-m.b { align-self:flex-start; background:#fff; border:1px solid #e3e9ef; }
    #mv-form { display:flex; gap:6px; padding:10px; background:#fff; border-top:1px solid #e3e9ef; }
    #mv-in { flex:1; padding:9px 12px; border:1px solid #cfd8e0; border-radius:8px; font-size:13.5px; }
    #mv-btn { background:#1f7ae0; color:#fff; border:0; border-radius:8px; padding:9px 14px; cursor:pointer; }`;

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const burbuja = document.createElement('button');
  burbuja.id = 'mv-burbuja';
  burbuja.textContent = '💬';
  burbuja.title = 'Chateá con nosotros';

  const caja = document.createElement('div');
  caja.id = 'mv-caja';
  caja.innerHTML =
    '<div id="mv-cab">Agendate IA 🛠️</div>' +
    '<div id="mv-msgs"></div>' +
    '<form id="mv-form"><input id="mv-in" placeholder="Escribí tu consulta..." autocomplete="off"/><button id="mv-btn" type="submit">➤</button></form>';

  document.body.appendChild(burbuja);
  document.body.appendChild(caja);

  const msgs = caja.querySelector('#mv-msgs');
  function agregar(texto, quien) {
    const d = document.createElement('div');
    d.className = 'mv-m ' + quien;
    d.textContent = texto;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
    return d;
  }

  burbuja.addEventListener('click', () => {
    abierto = !abierto;
    caja.classList.toggle('abierto', abierto);
    if (abierto && !msgs.children.length) {
      agregar('¡Hola! Contame qué trabajo necesitás y te paso presupuesto y horarios disponibles.', 'b');
    }
  });

  caja.querySelector('#mv-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = caja.querySelector('#mv-in');
    const texto = input.value.trim();
    if (!texto) return;
    agregar(texto, 'u');
    input.value = '';
    const espera = agregar('…', 'b');
    try {
      const r = await fetch(SERVIDOR + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensaje: texto, sessionId })
      });
      const data = await r.json();
      sessionId = data.sessionId || sessionId;
      espera.textContent = data.respuesta || 'Error inesperado.';
    } catch {
      espera.textContent = 'No pude conectar. Probá de nuevo en un momento.';
    }
  });
})();
