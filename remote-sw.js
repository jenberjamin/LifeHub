/* ═══════════════════════════════════════════════════════════════════
   LIFEHUB REMOTE SERVICE WORKER
   ───────────────────────────────────────────────────────────────────
   Makes the phone remote installable as its own app and lets it open
   with no signal (it still needs internet to reach the TV).

   Its own worker, separate from sw.js: it only covers
   LifeHub-remote.html (the scope it's registered with in that page),
   so it never caches the HomeScreen onto the phone, and sw.js never
   touches the remote. Only caches named lifehub-remote-* are its own.

   What it does with each kind of request:
     the page, .js, .json      network first; cached copy when offline
     icons, fonts, CDN files   cache first (versioned or rarely change)
     Firebase data             NOT touched — presses must be live
     anything else             NOT touched

   Registered only on https (see the bottom of LifeHub-remote.html).
   To force phones to drop their copy, bump VERSION.
   To switch it off on one phone, open LifeHub-remote.html?sw=off
═══════════════════════════════════════════════════════════════════ */

const VERSION = 'v1';
const CACHE = 'lifehub-remote-' + VERSION;

const PRECACHE = [
  'LifeHub-remote.html',
  'remote-manifest.json',
  'JS/lifehub-destinations.js',
  'icons/remote-192.png',
  'icons/remote-512.png',
  'CSS/fonts/PlayfairDisplay-VariableFont_wght.ttf',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js'
];

const CDN = [
  /^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome\//,
  /^https:\/\/www\.gstatic\.com\/firebasejs\//
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // one missing file must not stop the rest from being cached
    await Promise.allSettled(PRECACHE.map(async (u) => {
      const url = new URL(u, self.location).href;
      const r = await fetch(url, { cache: 'no-store' });
      if (r.ok) await cache.put(url, r);
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('lifehub-remote-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'lifehub-remote-sw-off') {
    event.waitUntil((async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('lifehub-remote-')) await caches.delete(key);
      }
    })());
  }
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
    if (hit) return hit;
    throw e;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);

  if (CDN.some((r) => r.test(req.url))) return event.respondWith(cacheFirst(req));
  if (url.origin !== self.location.origin) return;          // Firebase and the rest: live

  if (req.mode === 'navigate' || /\.(js|json|css)$/i.test(url.pathname)) {
    return event.respondWith(networkFirst(req));
  }
  if (/\.(png|webp|svg|ico|ttf|woff2?)$/i.test(url.pathname)) {
    return event.respondWith(cacheFirst(req));
  }
});
