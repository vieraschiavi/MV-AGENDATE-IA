// © 2026 Martín Viera. Todos los derechos reservados.
// Instalación de MV Agendate IA como app (PWA). Registra el service worker y
// engancha el evento beforeinstallprompt a cualquier botón con [data-instalar].
// Mientras no se pueda instalar (o ya esté instalada), esos botones muestran
// las instrucciones manuales de #instrucciones-instalar si existe.
(function () {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  let promptDiferido = null;
  const botones = () => document.querySelectorAll('[data-instalar]');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    promptDiferido = e;
    botones().forEach((b) => {
      b.dataset.listo = '1';
      b.addEventListener('click', async (ev) => {
        if (!promptDiferido) return;
        ev.preventDefault();
        promptDiferido.prompt();
        await promptDiferido.userChoice;
        promptDiferido = null;
      });
    });
  });

  window.addEventListener('appinstalled', () => {
    promptDiferido = null;
    botones().forEach((b) => { b.textContent = '✅ App instalada'; b.setAttribute('disabled', ''); });
  });

  // Si el botón se toca y no hay prompt disponible (iOS, o ya instalada, o el
  // navegador aún no lo ofreció), mostramos las instrucciones manuales.
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-instalar]');
    if (b && !promptDiferido && b.dataset.listo !== '1') {
      const ayuda = document.querySelector('#instrucciones-instalar');
      if (ayuda) { ev.preventDefault(); ayuda.scrollIntoView({ behavior: 'smooth' }); ayuda.classList.add('resaltado'); }
    }
  });
})();
