const CACHE_NAME = 'serramenti-pro-v1';
const ASSETS = [
  'index.html',
  'manifest.json'
];

// Installazione e salvataggio dei file strutturali in cache
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Attivazione e pulizia di eventuali vecchie cache
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Strategia di caricamento dati: Prima prova la rete, se non c'è internet usa la cache
self.addEventListener('fetch', (e) => {
  // Ignoriamo le chiamate esterne (es. le future chiamate alle API di Supabase)
  if (!e.request.url.startsWith(self.location.origin)) {
    return;
  }
  
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const cacheClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, cacheClone);
        });
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
