// Service Worker — NO CACHE (push only)
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  // Видаляємо старі кеші якщо були
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch — пропускаємо все в мережу
self.addEventListener('fetch', () => {});

// Push notification received
self.addEventListener('push', e => {
  let data = { title: 'Dog Coach 🐾', body: '' };
  try { data = e.data.json().notification || data; } catch (err) {
    try { data.body = e.data.text(); } catch (err2) {}
  }
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
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
