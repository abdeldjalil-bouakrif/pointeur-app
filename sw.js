/**
 * DP WORLD DJENDJEN - CONTAINER TALLYING PWA
 * Service Worker - Gestion du Cache Hors-ligne & Résilience Réseau
 */

const CACHE_NAME = 'dpw-tally-v3';

const APP_SHELL = [
  './',
  'index.html',
  'manifest.json',
  'css/style.css',
  'js/app.js',
  'js/db.js',
  'js/ocr.js',
  'js/excel.js',
  'js/yard.js'
];

// Événement d'installation : Mise en cache du shell applicatif
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[SW] Mise en cache de la PWA DP World Djendjen');
      try {
        await cache.addAll(APP_SHELL);
      } catch (err) {
        console.warn('[SW] Avertissement précaching shell:', err);
      }
    })
  );
  self.skipWaiting();
});

// Événement d'activation : Nettoyage des anciennes versions du cache
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[SW] Suppression ancien cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Événement de récupération (Fetch) : Stale-While-Revalidate & Cache-First
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Ignorer les requêtes temps réel Firebase
  if (url.hostname.includes('firebaseio.com') || url.hostname.includes('googleapis.com')) {
    return;
  }

  // Navigation HTML : Network-First avec repli sur le cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, networkResponse.clone());
            return networkResponse;
          });
        })
        .catch(() => {
          return caches.match('index.html') || caches.match('./');
        })
    );
    return;
  }

  // Assets & Shell : Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return cachedResponse;
        });

      return cachedResponse || fetchPromise;
    })
  );
});
