// Raft Board Service Worker — Otter Software Systems
const CACHE_NAME = 'raft-board-v1';
const OFFLINE_URL = '/offline.html';

const STATIC_PRECACHE = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/icons/icon.svg',
];

// Install event: Pre-cache static shell & offline fallback
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_PRECACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate event: Clean up previous caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event: Network-first for HTML pages with offline fallback, Cache-first for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Ignore non-GET requests and Supabase API calls / auth tokens from service worker cache
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Do not intercept Supabase auth / API endpoints
  if (url.pathname.includes('/auth/v1/') || url.pathname.includes('/rest/v1/')) {
    return;
  }

  // HTML page navigations: Network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
          return cachedResponse;
        }
        return cache.match(OFFLINE_URL);
      })
    );
    return;
  }

  // Static assets (images, css, js, icons): Stale-while-revalidate
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.ico')
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        const fetchPromise = fetch(request).then((networkResponse) => {
          if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Fallback default fetch
  event.respondWith(
    fetch(request).catch(async () => {
      const cached = await caches.match(request);
      return cached || (await caches.match(OFFLINE_URL));
    })
  );
});

// Push notification listener (ready for web push integration)
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    const title = data.title || 'Raft Board Notification';
    const options = {
      body: data.body || 'You have an update from the Otter team!',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon.svg',
      data: { url: data.url || '/' },
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error('Push error:', err);
  }
});

// Notification click listener
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
