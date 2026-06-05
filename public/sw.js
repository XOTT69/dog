// Service Worker — app shell cache + push notifications
const CACHE_VERSION = 'dogcoach-shell-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/content.js',
  '/app.js',
  '/manifest.webmanifest',
  '/assets/icon-192.png',
  '/assets/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys
      .filter(k => k !== CACHE_VERSION)
      .map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/index.html')));
    return;
  }

  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE_VERSION).then(cache => cache.put(req, copy));
      return res;
    }).catch(() => caches.match(req))
  );
});

// Push notification received
self.addEventListener('push', e => {
  let data = { title: 'Dog Coach 🐾', body: '' };
  try { data = e.data.json().notification || data; } catch (err) {
    try { data.body = e.data.text(); } catch (err2) {}
  }
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/assets/icon-192.png',
    badge: '/assets/icon-192.png',
    vibrate: [100, 50, 100],
    tag: 'dogcoach-' + Date.now(),
    renotify: true,
    actions: [
      { action: 'open', title: 'Відкрити' },
      { action: 'dismiss', title: 'Закрити' }
    ]
  }));
});

// Notification click
self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'dismiss') return;
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes(self.location.origin) && 'focus' in c) return c.focus();
      }
      return clients.openWindow('/');
    })
  );
});
