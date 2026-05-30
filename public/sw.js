self.addEventListener('install', event => {
  event.waitUntil(
    caches.open('doggo-coach-v1').then(cache =>
      cache.addAll([
        './index.html',
        './manifest.webmanifest',
        './assets/icon-192.png',
        './assets/icon-512.png'
      ])
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open('doggo-coach-v1').then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
