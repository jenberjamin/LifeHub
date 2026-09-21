/* ═══════════════════════════════════════════════════════════════════
   LIFEHUB SERVICE WORKER
   ───────────────────────────────────────────────────────────────────
   Keeps the HomeScreen running on the TV when the Wi-Fi drops.

   Only registered on the deployed https site (see
   JS/lifehub-sw-register.js) — never on localhost or in Lively, so it
   can't serve stale files while you're editing.

   What it does with each kind of request:
     pages, .js, .css, .json   network first; the cached copy is the
                               fallback when offline (updates show
                               up immediately when online)
     images, fonts             cache first (instant, works offline);
                               capped at MEDIA_MAX files
     Firebase SDK, Google      cache first — these URLs are versioned,
     Fonts                     so a cached copy is never out of date
     Firebase data, weather,   NOT touched — live data must never come
     AI calls                  from a cache
     videos, range requests    NOT touched — caching breaks seeking

   To force every TV to drop its caches and start fresh, bump VERSION.
   To switch it off on one device, open any page with  ?sw=off
═══════════════════════════════════════════════════════════════════ */

const VERSION = 'v1';
const PREFIX = 'lifehub-home-';                 // only caches with this prefix are ours
const SHELL = PREFIX + 'shell-' + VERSION;      // pages, code, CDN scripts
const MEDIA = PREFIX + 'media-' + VERSION;      // images, fonts
const MEDIA_MAX = 700;                          // ~all slides plus UI images

const ENTRY = 'LifeHub-HomeScreen.html';
const PAGE_TIMEOUT = 4000;     // after this, fall back to the cached page
const MEDIA_TIMEOUT = 8000;    // after this, give up on an uncached image
                               // (the slideshow then skips to the next one)

const CDN = [
  /^https:\/\/www\.gstatic\.com\/firebasejs\//,
  /^https:\/\/fonts\.(googleapis|gstatic)\.com\//
];

/* ── install: cache the HomeScreen and everything it loads ────────────
   Reads the HomeScreen's own <script>/<link> tags rather than keeping a
   list here, so adding a script to the page never needs an edit here. */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    const entryUrl = new URL(ENTRY, self.location).href;
    const res = await fetch(entryUrl, { cache: 'no-store' });
    if (!res.ok) return;
    const html = await res.clone().text();
    await cache.put(entryUrl, res);

    const urls = new Set([
      new URL('./', self.location).href,
      new URL('index.html', self.location).href,
      new URL('manifest.json', self.location).href
    ]);
    for (const m of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"'#]+)["']/g)) {
      let u;
      try { u = new URL(m[1], entryUrl); } catch (e) { continue; }
      if (u.origin === self.location.origin || CDN.some((r) => r.test(u.href))) {
        urls.add(u.href);
      }
    }
    // one missing file must not stop the rest from being cached
    await Promise.allSettled([...urls].map(async (u) => {
      const r = await fetch(u, { cache: 'no-store' });
      if (r.ok) await cache.put(u, r);
    }));
    self.skipWaiting();
  })());
});

/* ── activate: remove our caches from older versions ───────────────────
   Other LifeHub service workers (LibraryHub, Scribble) share this
   origin's storage, so only caches with our prefix are touched. */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [SHELL, MEDIA];
    for (const key of await caches.keys()) {
      if (key.startsWith(PREFIX) && !keep.includes(key)) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

/* ── ?sw=off: stop caching first, then clear out ───────────────────────
   The page keeps fetching through this worker until it's reloaded, and
   every caches.open() would re-create a cache just deleted — so stop
   handling requests before deleting anything. */
let disabled = false;
self.addEventListener('message', (event) => {
  if (event.data !== 'lifehub-sw-off') return;
  disabled = true;
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(PREFIX)) await caches.delete(key);
    }
  })());
});

self.addEventListener('fetch', (event) => {
  if (disabled) return;
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    if (CDN.some((r) => r.test(req.url))) event.respondWith(cacheFirst(req, SHELL));
    return;                                   // Firebase data, weather, AI: untouched
  }

  const path = url.pathname;
  if (/\.(mp4|m4v|mov|webm|mp3|m4a|wav)$/i.test(path)) return;
  if (path.endsWith('/sw.js')) return;

  if (req.mode === 'navigate' || /\.(html?|js|css|json|webmanifest)$/i.test(path)) {
    event.respondWith(networkFirst(req));
  } else if (/\.(webp|png|jpe?g|gif|svg|ico|avif|ttf|otf|woff2?)$/i.test(path)) {
    event.respondWith(cacheFirst(req, MEDIA, MEDIA_TIMEOUT));
  }
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

async function networkFirst(req) {
  const cache = await caches.open(SHELL);
  const net = fetch(req).then((res) => {
    if (res.ok && !res.redirected) cache.put(req, res.clone());
    return res;
  });
  try {
    return await Promise.race([net, timeout(PAGE_TIMEOUT)]);
  } catch (err) {
    // offline, or the network is being slow: use the cached copy.
    // ?tv=1 and similar shouldn't make a page look uncached.
    const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    return net;          // nothing cached: keep waiting on the network
  }
}

async function cacheFirst(req, cacheName, ms) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const net = fetch(req).then(async (res) => {
    if (res.ok || res.type === 'opaque') {
      await cache.put(req, res.clone());
      if (cacheName === MEDIA) trim(cache);
    }
    return res;
  });
  return ms ? Promise.race([net, timeout(ms)]) : net;
}

/* Oldest entries go first once the cap is reached, so the TV's storage
   can't fill up. */
async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MEDIA_MAX; i++) await cache.delete(keys[i]);
}
