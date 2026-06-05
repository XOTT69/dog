/**
 * Service Worker v2 — Improved caching strategy + background sync
 */
const CACHE_VERSION = 'dogcoach-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/js/main.js',
  '/js/state.js',
  '/js/constants.js',
  '/js/utils.js',
  '/js/firebase.js',
  '/js/render.js',
  '/js/audio.js',
  '/js/ai.js',
  '/js/timer.js',
  '/js/achievements.js',
  '/js/content-loader.js',
  '/manifest.webmanifest',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
];

const CONTENT_CACHE = 'dogcoach-content-v1';
const CONTENT_ASSETS = [
  '/content/courses.json',
  '/content/knowledge.json',
  '/content/social.json',
  '/content/breeds.json',
  '/content/protocols.json',
  '/content/tips.json',
];

// ===== INSTALL =====
self.addEventListener('install', (e) => {
  e.waitUntil(
    Promise.all([
      caches.open(CACHE_VERSION).then((cache) => cache.addAll(STATIC_ASSETS)),
      caches.open(CONTENT_CACHE).then((cache) => cache.addAll(CONTENT_ASSETS)),
    ]).then(() => self.skipWaiting())
  );
});

// ===== ACTIVATE =====
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_VERSION && k !== CONTENT_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ===== FETCH =====
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Navigation: network-first with offline fallback
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Content JSON: stale-while-revalidate
  if (url.pathname.startsWith('/content/')) {
    e.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CONTENT_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }).catch(() => cached);

        return cached || fetchPromise;
      })
    );
    return;
  }

  // Static assets: cache-first
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => new Response('', { status: 503 }));
    })
  );
});

// ===== PUSH =====
self.addEventListener('push', (e) => {
  let data = { title: 'Dog Coach 🐾', body: '' };
  try {
    data = e.data.json().notification || data;
  } catch {
    try { data.body = e.data.text(); } catch { /* empty */ }
  }

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/assets/icon-192.png',
      badge: '/assets/icon-192.png',
      vibrate: [100, 50, 100],
      tag: 'dogcoach-' + Date.now(),
      renotify: true,
      actions: [
        { action: 'open', title: 'Відкрити' },
        { action: 'dismiss', title: 'Закрити' },
      ],
    })
  );
});

// ===== NOTIFICATION CLICK =====
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  if (e.action === 'dismiss') return;

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes(self.location.origin) && 'focus' in c) return c.focus();
      }
      return clients.openWindow('/');
    })
  );
});

// ===== BACKGROUND SYNC (for offline events) =====
self.addEventListener('sync', (e) => {
  if (e.tag === 'sync-events') {
    e.waitUntil(syncOfflineEvents());
  }
});

async function syncOfflineEvents() {
  // Implementation: read from IndexedDB queue and POST to Firestore
  // This is a placeholder — full implementation requires IndexedDB wrapper
  console.log('[SW] Background sync triggered');
}
