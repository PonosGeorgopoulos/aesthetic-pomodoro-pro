const CACHE_NAME = 'pomodoro-pro-v7';

// Network-first strategy: always try the network, fall back to cache
self.addEventListener('install', (event) => {
    self.skipWaiting(); // Force immediate activation
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) =>
            Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    return caches.delete(key);
                }
            }))
        ).then(() => self.clients.claim()) // Take control of all pages immediately
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    // Skip caching for API calls
    if (event.request.url.includes('api.open-meteo.com') || event.request.url.includes('allorigins')) {
        return;
    }

    // Network-first: try fresh copy, cache it, fall back to old cache
    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                const responseClone = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseClone);
                });
                return networkResponse;
            })
            .catch(() => {
                return caches.match(event.request);
            })
    );
});
