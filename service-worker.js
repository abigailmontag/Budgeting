const CACHE_NAME = 'budget-cache-v4';

// Absolute paths required for GitHub Pages subdirectory /Budgeting/
const urlsToCache = [
  '/Budgeting/',
  '/Budgeting/index.html',
  '/Budgeting/app.js',
  '/Budgeting/styles.css',
  '/Budgeting/manifest.json',
  '/Budgeting/icon-512.png'
];

// Install: cache all core files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// Activate: delete old caches so users get updated code after deploys
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first for JS/CSS/HTML so updates land immediately,
//        cache-first for everything else (icons, etc.)
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const isCodeFile = /\.(js|css|html)$/.test(url.pathname) || url.pathname === '/Budgeting/';

  if (isCodeFile) {
    // Network-first: try to fetch fresh, fall back to cache when offline
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    // Cache-first: great for icons, manifests, static assets
    event.respondWith(
      caches.match(event.request)
        .then(cached => cached || fetch(event.request))
    );
  }
});
