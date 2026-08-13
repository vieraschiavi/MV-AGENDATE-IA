// © 2026 Martín Viera. Todos los derechos reservados.

// Service worker de MV Agendate IA — habilita la instalación como app (PWA) y
// deja abrir el workspace aunque no haya señal. Estrategia: network-first para
// navegación/estáticos (siempre lo más nuevo) con caché de respaldo offline;
// NUNCA intercepta /api ni /webhook (datos en vivo, no se cachean).
const CACHE = 'mv-agendate-v1';
const SHELL = ['/app/', '/css/workspace.css', '/logo-mv.svg', '/logo-mv.png', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/webhook')) return; // datos en vivo: sin caché
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copia = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copia)).catch(() => {});
        return r;
      })
      .catch(() => caches.match(e.request).then((m) => m || caches.match('/app/')))
  );
});
