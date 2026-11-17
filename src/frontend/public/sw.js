/*
 * AfyaFlow service worker: lets the app open on a weak or dropped connection.
 *
 * It caches only the application shell (the page, its scripts, styles and icons). It never
 * caches API responses, so no patient data is stored by the service worker: patient data
 * stays behind the server's authenticated, no-store API. Offline registrations use the
 * existing per-staff browser outbox, which is cleared at sign-out.
 */
const CACHE = 'afyaflow-shell-v1';
const SHELL = ['/', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith('afyaflow-shell-') && key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Only same-origin GETs; never the API (patient data), never other sites.
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Pages: network first so updates arrive at once; the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request)
      .then((response) => { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put('/', copy)); return response; })
      .catch(() => caches.match('/')));
    return;
  }

  // Built assets have content hashes in their names, so a cached copy is always correct.
  if (url.pathname.startsWith('/assets/') || SHELL.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(request, copy)); }
      return response;
    })));
  }
});
