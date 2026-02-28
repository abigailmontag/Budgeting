const CACHE_NAME = "budget-v3";
const urlsToCache = ["./","./index.html","./styles.css","./app.js","./manifest.json"];

self.addEventListener("install", e => {e.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(urlsToCache)));});
self.addEventListener("activate", e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>{if(k!==CACHE_NAME)return caches.delete(k);}))))});
self.addEventListener("fetch", e=>{e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));});
