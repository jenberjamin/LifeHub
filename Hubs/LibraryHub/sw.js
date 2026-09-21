/* ═══════════════════════════════════════════════════
   LIBRARYHUB — SERVICE WORKER
   sw.js
   Created 2026-09-17

   Makes the library open with no network. This file is
   only about the APP ITSELF — the HTML, CSS, JS, fonts
   and icons. Your book data lives in Firebase Realtime
   Database (js/library-sync.js), which keeps its own
   offline copy and must never be intercepted here.

   Three caches, on purpose:

   SHELL   — every local app file, precached on install.
             These are yours, they change when you edit
             them, so they're versioned by SHELL_VERSION.

   VENDOR  — Google Fonts, Material Symbols, pdf.js and
             mammoth.js. Cached the first time you load a
             page online, then served from cache. Nothing
             binary lands in the repo, and the reader still
             opens PDFs offline after one online visit.

   LIBRARY — book covers and the files in shared-library/.
             NOT precached: the PDFs are tens of megabytes
             and you don't read all of them. A book is
             cached the first time you open it, and stays
             readable offline from then on.

   ── WHEN YOU EDIT A FILE ──────────────────────────
   Bump SHELL_VERSION. Nothing else. The old cache is
   deleted on activate and every file is re-fetched.

   ── SCOPE ─────────────────────────────────────────
   This file sits at the LibraryHub root, so it controls
   the LibraryHub folder and nothing else. Every page
   registers it as './sw.js', which works the same under
   Live Server, Vercel and GitHub Pages — no matter what
   sub-path the hub is deployed to.
═══════════════════════════════════════════════════ */

/* v2 — 2026-09-17: index.html joined the folder as the doorway, so a
   bare URL no longer 404s. Precached here too, which also means the
   './' entry above it now resolves to a real file instead of failing
   quietly on hosts that don't serve a directory index. */
const SHELL_VERSION = 'libraryhub-shell-v2';
const VENDOR_CACHE  = 'libraryhub-vendor-v1';
const LIBRARY_CACHE = 'libraryhub-books-v1';

/* Everything the app is made of. Paths are relative to
   this file, which sits at the LibraryHub root. */
const SHELL_FILES = [
    './',
    './index.html',
    './LibraryHub.html',
    './LibraryHub-Collections.html',
    './Reading_Room.html',

    './css/libraryhub.css',
    './css/libraryhub-collections.css',
    './css/reading-room.css',

    './js/library-core.js',
    './js/library-sync.js',
    './js/reading-engine.js',

    './manifest-libraryhub.json',
    './css/files/LibraryHub.png',
    './css/files/LibraryHub_BG.jpg',

    /* Lives outside this folder, up at the LifeHub root. It
       precaches when the whole of LifeHub 2.0 is served (Live
       Server, or the repo deployed whole). If only the
       LibraryHub folder is deployed the fetch 404s, which is
       logged and skipped rather than breaking the install. */
    '../../JS/lifehub-navigation-core.js'
];

/* Hosts whose responses we're willing to keep. Anything
   else off-origin — the Realtime Database above all — is
   left completely alone. */
const VENDOR_HOSTS = [
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'cdnjs.cloudflare.com',
    'www.gstatic.com'          // the Firebase SDK files, not its traffic
];

/* Folders whose files are big, many, and only worth keeping
   once you've actually opened them. */
const LIBRARY_PATHS = ['/book-covers/', '/shared-library/'];

/* ── Install: precache the shell ───────────────────
   addAll is all-or-nothing, which would mean one renamed
   file breaks the whole install. Added one at a time so a
   missing file is logged and skipped instead. */
self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(SHELL_VERSION);
        await Promise.all(SHELL_FILES.map(async file => {
            try {
                await cache.add(new Request(file, { cache: 'reload' }));
            } catch (e) {
                console.warn('[sw] could not precache', file, e.message);
            }
        }));
        self.skipWaiting();
    })());
});

/* ── Activate: drop caches from older versions ─────
   VENDOR and LIBRARY are kept across shell bumps — the
   fonts and the books you've read don't change when you
   edit a stylesheet. */
self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const keep = [SHELL_VERSION, VENDOR_CACHE, LIBRARY_CACHE];
        const keys = await caches.keys();
        await Promise.all(
            keys.filter(k => !keep.includes(k)).map(k => caches.delete(k))
        );
        await self.clients.claim();
    })());
});

/* ── Fetch ─────────────────────────────────────────
   Four paths, in order:

   1. Off-origin, not a vendor host  → don't touch it.
      This is the important one. The Realtime Database
      talks to firebaseio.com over a long-lived connection;
      putting a service worker in the middle breaks sync.

   2. Vendor host → cache-first. Fonts and libraries never
      change, and going to the network first would mean
      waiting for a timeout on every offline page load.

   3. A book or a cover → cache-first, into its own cache,
      so opening a book once makes it yours offline.

   4. Anything else same-origin → cache-first, then network,
      and the network copy is written back so a file added
      after install still gets cached.
─────────────────────────────────────────────────── */
self.addEventListener('fetch', event => {
    const req = event.request;

    // Only GETs are cacheable; everything else goes straight through.
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    const sameOrigin = url.origin === self.location.origin;
    const isVendor   = VENDOR_HOSTS.includes(url.hostname);

    if (!sameOrigin && !isVendor) return;   // ← the database leaves here

    if (isVendor) {
        event.respondWith(cacheFirst(req, VENDOR_CACHE));
        return;
    }

    if (LIBRARY_PATHS.some(p => url.pathname.includes(p))) {
        event.respondWith(cacheFirst(req, LIBRARY_CACHE));
        return;
    }

    event.respondWith(shellFetch(req));
});

/* Cache-first with a network fill-in. Used for the fonts,
   the reader libraries, and the books. */
async function cacheFirst(req, cacheName) {
    const cache  = await caches.open(cacheName);
    const cached = await cache.match(req);
    if (cached) return cached;

    try {
        const res = await fetch(req);
        // Font and script CDNs answer cross-origin requests
        // opaquely (status 0). Opaque is still servable, so
        // it's worth keeping.
        if (res && (res.ok || res.type === 'opaque')) {
            cache.put(req, res.clone());
        }
        return res;
    } catch (e) {
        // Offline and never fetched this one. Nothing to give
        // back — the page loses that piece but still loads.
        return Response.error();
    }
}

/* Same-origin app files. Cache first so offline is instant,
   then network, then — for a page navigation — fall back to
   the hub so a deep link still opens something. */
async function shellFetch(req) {
    const cache  = await caches.open(SHELL_VERSION);
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;

    try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
    } catch (e) {
        if (req.mode === 'navigate') {
            const shell = await cache.match('./LibraryHub.html');
            if (shell) return shell;
        }
        return Response.error();
    }
}
