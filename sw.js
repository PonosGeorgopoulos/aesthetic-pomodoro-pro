const CACHE_NAME = 'pomodoro-pro-v5';
const ASSETS_TO_CACHE = [
    './',
    'index.html',
    'style.css',
    'script.js',
    'manifest.json',
    'images/favicon.png'
];

// Pre-caching logic doesn't cache all 40 background images immediately to save initial bandwidth. 
// They will be cached dynamically as they are parsed/loaded by the user.

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

self.addEventListener('fetch', (event) => {
    // Only cache GET requests
    if (event.request.method !== 'GET') return;

    // Do not cache API calls (weather or allOrigins) so they stay fresh!
    if (event.request.url.includes('api.open-meteo.com') || event.request.url.includes('allorigins')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request).then((networkResponse) => {
                // Dynamically cache backgrounds and other image assets as they load
                if (event.request.url.includes('/images/')) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            });
        })
    );
});

self.addEventListener('activate', (event) => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then((keyList) =>
            Promise.all(keyList.map((key) => {
                if (!cacheWhitelist.includes(key)) {
                    return caches.delete(key);
                }
            }))
        )
    );
});
