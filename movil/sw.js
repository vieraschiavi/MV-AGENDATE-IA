// © 2026 Martín Viera. Todos los derechos reservados.

// Service worker: cachea el shell de la app para carga instantánea y uso offline básico.
const CACHE = 'mv-agendate-v1';
const SHELL = ['./index.html', './manifest.json', './icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.includes('/api/')) return; // datos siempre en vivo
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
