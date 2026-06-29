const CACHE_NAME = 'vibegoal-cache-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/manifest.json'
];

// Install Event - Pre-cache core files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate Event - Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Intercept requests with Stale-While-Revalidate caching strategy
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Bypass:
  //  - Vite dev-server internals & HMR (/@vite/, /@react-refresh, /@id/, /@fs/)
  //  - Ham kaynak modülleri (/src/) ve bağımlılıklar (/node_modules/)
  //  - Vite tarafından versiyonlanan modüller (?t= / ?v=) → bayat React/JS kopyasını önler
  //  - Modül dosya uzantıları (.jsx/.ts/.tsx/.mjs)
  //  - socket/ws, futbol API, tarayıcı uzantıları
  if (
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/') ||
    url.pathname.includes('/.vite/') ||
    url.search.includes('t=') ||
    url.search.includes('v=') ||
    /\.(?:jsx|tsx|ts|mjs)$/.test(url.pathname) ||
    url.pathname.includes('/socket') ||
    url.pathname.includes('/ws') ||
    url.hostname.includes('football.api-sports.io') ||
    url.protocol === 'chrome-extension:' ||
    url.protocol === 'moz-extension:'
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          // Verify response is valid to cache (status 200 or opaque/CORS files)
          if (networkResponse && (networkResponse.status === 200 || networkResponse.status === 0)) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              // Cache the fetched resource
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // If network fails, try to return cached fallback, otherwise fail gracefully
          return cachedResponse;
        });

      // Return cached response instantly (stale) or fetch from network (revalidate)
      return cachedResponse || fetchPromise;
    })
  );
});
