// Service worker: sempre busca a versão mais nova; a cópia guardada só é usada sem internet.
const VERSION = 'pb-v3';
const SHELL = ['/', '/app.css', '/app.js', '/activities.js', '/shared/base.css', '/shared/ui.js', '/shared/calc.js', '/shared/player.js', '/shared/player.css', '/manifest.webmanifest', '/icons/icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')) return;
  const key = e.request.mode === 'navigate' ? '/' : e.request;
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok && r.type === 'basic') { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(key, copy)); }
      return r;
    }).catch(() => caches.match(key).then((hit) => hit || caches.match('/')))
  );
});
