// sw.js - Service worker : permet d'installer l'application et de l'ouvrir sans réseau
//
// - Fichiers de l'application : réseau d'abord (pour recevoir les mises à jour), mais
//   si le serveur ne répond pas en NETWORK_TIMEOUT ms, la copie en cache est utilisée.
// - Bibliothèques externes (CDN, polices) : cache d'abord, elles ne changent pas.
// Changer CACHE_NAME pour forcer le nettoyage de l'ancien cache.

const CACHE_NAME = 'pitpat-v6';
const NETWORK_TIMEOUT = 3000;

const APP_FILES = [
    './',
    'index.html',
    'treadmill.js',
    'programs.js',
    'manifest.webmanifest',
    'icon-192.png',
    'icon-512.png',
    'status-disconnected.png',
    'status-off.png',
    'status-on.png'
];

// Mis en cache dès l'installation pour que l'application fonctionne hors ligne
// dès la première ouverture (doit correspondre aux liens de index.html)
const CDN_FILES = [
    'https://cdn.jsdelivr.net/npm/material-design-lite@1.3.0/material.min.css',
    'https://cdn.jsdelivr.net/npm/material-design-lite@1.3.0/material.min.js',
    'https://cdn.jsdelivr.net/npm/date-fns@4.1.0/cdn.min.js',
    'https://fonts.googleapis.com/icon?family=Material+Icons'
];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        // 'reload' bypasses the browser HTTP cache (GitHub Pages keeps files 10 min)
        await cache.addAll(APP_FILES.map((url) => new Request(url, { cache: 'reload' })));
        // A missing CDN file must not block the installation
        await Promise.allSettled(CDN_FILES.map((url) => cache.add(new Request(url, { mode: 'cors' }))));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

async function networkFirst(event) {
    const { request } = event;
    const cache = await caches.open(CACHE_NAME);
    // 'no-cache' revalidates with the server, so a fresh page never gets a stale script
    const network = fetch(request, { cache: 'no-cache' }).then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
    });
    // Keep updating the cache even if the cached copy is answered first
    event.waitUntil(network.catch(() => {}));

    const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT));
    const first = await Promise.race([network.catch(() => null), timeout]);
    if (first) return first;
    const cached = await cache.match(request, { ignoreSearch: true });
    // No cached copy: wait for the network after all
    return cached || network;
}

async function cacheFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
    return response;
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin === self.location.origin) {
        event.respondWith(networkFirst(event));
    } else if (/^(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(url.hostname)) {
        event.respondWith(cacheFirst(request));
    }
});
