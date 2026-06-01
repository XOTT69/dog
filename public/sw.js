// Service Worker — push notifications + offline cache
const CACHE = 'dogcoach-v4';
const ASSETS = ['/', '/index.html', '/styles.css', '/app.js', '/content.js', '/manifest.webmanifest'];

// Install
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

// Activate
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Fetch — stale-while-revalidate
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/') || url.hostname.includes('firestore') || url.hostname.includes('googleapis') || url.hostname.includes('gstatic')) return;
  e.respondWith(caches.match(e.request).then(cached => {
    const fetchP = fetch(e.request).then(r => { if (r && r.status === 200) { const cl = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cl)); } return r; }).catch(() => cached || caches.match('/index.html'));
    return cached || fetchP;
  }));
});

// Push notification received
self.addEventListener('push', e => {
  let data = { title: 'Dog Coach 🐾', body: '' };
  try { data = e.data.json().notification || data; } catch {}
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    vibrate: [100, 50, 100]
  }));
});

// Notification click
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then(list => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return clients.openWindow('/');
  }));
});
