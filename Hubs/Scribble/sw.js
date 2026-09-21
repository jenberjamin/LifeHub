/* ═══════════════════════════════════════════════════
   SCRIBBLE — SERVICE WORKER
   sw.js

   Makes the shell load with no network. Firestore keeps
   its own offline copy of your DATA in IndexedDB (see
   js/scribble-db.js) — this file is only about the app
   itself: the HTML, CSS, JS and icon fonts.

   Two caches, on purpose:

   SHELL  — every local file, precached on install. These
            are yours, they change when you edit them, so
            they're versioned by SHELL_VERSION below.

   VENDOR — the Google Fonts and Font Awesome responses.
            Cached the first time you load a page online,
            then served from cache forever. Nothing binary
            lands in the repo, and icons survive offline
            after one online visit.

   ── WHEN YOU EDIT A FILE ──────────────────────────
   Bump SHELL_VERSION. Nothing else. The old cache is
   deleted on activate and every file is re-fetched.
═══════════════════════════════════════════════════ */

/* v27 — 2026-09-17: js/scribble-passage.js joined the list, and every
   signed-in page plus the gate gained its script tag. */
/* v28 — 2026-09-17: the wordmark moved to a self-hosted face, shared
   across hubs at LifeHub 2.0/CSS/fonts/ and served through the
   /shared/ alias in dev-server.js. Not precached here: it lives
   outside this folder, so a relative path in SHELL_FILES cannot name
   it. It is same-origin, so the fetch handler caches it on first load
   anyway and it is offline-ready after one visit. */
/* v29 — 2026-09-17: book icon dropped from every header, and the
   gate lost its reset-email button and its explanatory line. */
/* v30 — 2026-09-17: the setup page no longer prints the credential
   reset incantation on screen. */
/* v31 — 2026-09-17: the wordmark font is fetched from /CSS/fonts/,
   the one path that resolves under both Live Server (root = LifeHub
   2.0) and dev-server.js (which aliases it). */
/* v32 — 2026-09-17: the project page, the Archive and the recycle bin
   gained their LifeHub-surface.js tag, so Poppy can finally tell which
   Scribble page you are on and act on it. No new file in the list —
   js/LifeHub-surface.js was already precached for Scribble.html — but
   three cached HTML files changed, which is what this bump is for. */
/* v33 — 2026-09-17: two real bug fixes, both in cached files.
   · js/scribble-project-app.js — the PORTAL fix. Pin, rename, move,
     copy, merge and delete all named the URL's project instead of the
     one on screen, so inside a linked module they silently did nothing.
   · js/scribble-archive-firebase.js — resolveName now compares names
     case-blind like every other name check in Scribble, so a restore
     can no longer put "notes" back beside a live "Notes". */
/* v34 — 2026-09-17: js/LifeHub-surface.js. Three fixes, and this copy
   is now code-identical to JS/poppy/LifeHub-surface.js (they had
   drifted on loadSDK alone).
   · loadSDK holds its in-flight promise, so the SDK is fetched once
     instead of two or three times — that was the "Firebase is already
     defined in the global scope" warning.
   · this copy also gains the per-piece SDK check it never received.
   · the corner dot no longer claims Poppy is reachable when she
     isn't: grey / amber / green, and it says which. */
/* v35 — 2026-09-17: five fixes across five cached files.
   · scribble-editor-app.js — grammar check now asks once before
     uploading the document to languagetool.org; side notes and the
     internal-link copier use the file's own project, not the URL's.
   · scribble-export.js — same project fix for export + its log line.
   · scribble-recent.js — stands down on the project page, which
     renders its own Recent panel; the two were overwriting each other.
   · scribble-app.js — merge dialog no longer says the source goes to
     the bin (it is deleted outright); 'archive' added to the log kinds.
   · scribble-project-app.js — 'archive' added to the log kinds. */
/* v36 — 2026-09-17: js/scribble-project-firebase.js — symlinks are no
   longer orphaned. A cross-project move and a promote both re-mint ids
   and hard-delete the originals, which left every pointer aimed at the
   old ones permanently dangling. repointSymlinks() follows them to the
   new ids; flagBrokenSymlinks() records the one case that cannot be
   saved (a promoted module becomes a project, and a symlink cannot
   target a project). Same-project moves and copyItem need nothing —
   neither changes an id. */
/* v37 — 2026-09-17: the minor sweep. Every offline timestamp read now
   goes through whenMs (cards, sorts, Recent, the bin's Deleted On and
   all four log readers) — anything written offline was dated "—" and
   sorted as the oldest thing you owned. Plus: View Contents counts
   Sections; toggleLogs is guarded; 'Phase F stub', the case-sensitive
   name-rule header, getFileSymlinks' scope, bin-expiry's "remove one
   tag" and pickQuestion's "ten" are all corrected; the bin's Archive
   button says restore-first instead of "Coming Soon"; the device
   register is in the backup; a version preview no longer leaks into
   the open-documents strip; and five dead or duplicated things are
   gone — doArchive, doSoftDelete, _findItem, _activePid and the second
   _refreshFile. Scribble.html stopped loading poppy-commands twice and
   carries both web-app-capable metas. */
/* v38 — 2026-09-17: the archive finally cascades symlinks, matching the
   bin. archiveItem() hunts pointers BEFORE building its batch, so the
   links are shelved atomically with the content and groupSize counts
   them; restoreArchivedPointers() brings back only the links whose
   target actually came back. Also: the bin's group-delete button is
   wired up at last (shown only on rows that have siblings), and all
   four page headers carry the Home Screen / Lobby pair — the archive's
   old button pointed at Hubs/index.html, which does not exist. */
/* v39 — 2026-09-17: A4 + A6, plus the home screen's name.
   · scribble-recycle-bin-firebase.js — purging a project now also
     clears its bin and archive rows (they were unrestorable but still
     listed) and logs every inbound symlink it broke, in the project
     that owns the link.
   · scribble-project-firebase.js — getFileSymlinks delegates to
     findSymlinksToAny: 3 collection-group queries instead of 1 + one
     per project, every time a file's Details opened.
   · LifeHub-surface.js — the PAGES key was "LifeHub-Wallpaper.html",
     a file that does not exist. Now LifeHub-HomeScreen.html, so the
     home screen stops reporting itself as "unknown section". */
/* v40 — 2026-09-17: Poppy can reach INSIDE a project.
   · NEW js/scribble-project-poppy-commands.js — the item tier. Action
     names carry the tier (file_bin, module_bin, section_bin), spoken
     names are resolved on the page against live _contents with the
     folder you are standing in preferred, and nothing destructive
     accepts a name: it takes a `ref` from a prior _locate and only
     ever OPENS the page's own confirmation dialog.
   · LifeHub-surface.js — a handler's return string now reaches Poppy
     as `result`, which is what makes _locate possible at all.
   · scribble-project-app.js — publishSurface() finally calls
     LIFEHUB_SURFACE.detail(), so Poppy knows WHICH project, which
     folder, and whether you are inside a portal. */
/* v41 — 2026-09-17: LIFEHUB_SURFACE.test() and .can(). Runs a
   registered handler by hand, skipping Firestore — so the page half of
   a voice command can be tested while Poppy's own project is still
   refusing the channel. Without it a broken handler and a blocked
   channel looked identical. */
/* v42 — 2026-09-21: DEPLOYMENT is a real room.
   The sidebar's Deployment entry has existed since the first build and
   showed "Connection settings coming in Phase 3". It now lists, creates
   and opens projects exactly as All Projects does.
   · Deployment projects are ORDINARY projects carrying room:'deploy' in
     the same `projects` collection — not a second collection. The
     workspace page, the editor, symlinks, the bin, the archive and
     firestore.rules all address a project as projects/{pid}, and every
     one of them keeps working untouched because nothing about the
     document's address changed.
   · A project written before today has no room field, which reads as
     'all'. Nothing moved and no backfill is needed.
   · scribble-firebase.js — createProject takes a room; listenProjects
     takes one and filters in memory (a Firestore `where` would match
     none of the existing projects, since a document missing the field
     matches no value for it); duplicateProject keeps the copy in the
     original's room; the bin row's `data` whitelist and both copies of
     archiveProject carry the room.
   · scribble-app.js — _room state, ROOM_TEXT wording, the last room
     remembered in localStorage so returning from a project lands back
     where you were, and the Add button labelled with what it will make.
   · Names stay unique across BOTH rooms: the bin and the archive are
     shared, so two projects called the same thing would be
     indistinguishable in them. */
const SHELL_VERSION = 'scribble-shell-v42';
const VENDOR_CACHE  = 'scribble-vendor-v1';

/* Everything the app is made of. Paths are relative to
   this file, which sits at the Scribble root. */
const SHELL_FILES = [
    './',
    './Scribble.html',
    './Scribble-project.html',
    './Scribble-archive.html',
    './Scribble-recycle-bin.html',

    './css/scribble.css',
    './css/scribble-project.css',
    './css/scribble-archive.css',
    './css/scribble-recycle-bin.css',
    './css/scribble-editor.css',

    './js/scribble-app.js',
    './js/scribble-db.js',
    './js/scribble-firebase.js',
    './js/scribble-project-app.js',
    './js/scribble-project-firebase.js',
    './js/scribble-editor-app.js',
    './js/scribble-editor-firebase.js',
    './js/scribble-archive.js',
    './js/scribble-archive-firebase.js',
    './js/scribble-recycle-bin.js',
    './js/scribble-recycle-bin-firebase.js',
    './js/scribble-bin-expiry.js',
    './js/scribble-export.js',
    './js/scribble-poppy-commands.js',
    /* POPPY, item tier — added 2026-09-17. The project page's own
       command set: modules, sections and document files. */
    './js/scribble-project-poppy-commands.js',
    './js/LifeHub-surface.js',
    './js/scribble-sw-register.js',
    './js/vendor/firebase.js',

    './manifest.webmanifest',
    './icons/scribble-192.png',
    './icons/scribble-512.png',
    './icons/scribble-maskable-512.png',
    './icons/apple-touch-icon.png',
    './icons/favicon-32.png',

    './Scribble-gate.html',
    './Scribble-setup.html',
    './css/scribble-gate.css',
    './js/scribble-gate.js',
    './js/scribble-setup.js',
    './js/scribble-auth.js',
    './js/scribble-session.js',
    './js/scribble-boot.js',
    './js/scribble-access-log.js',
    './js/scribble-devices.js',
    /* PASSAGE, added 2026-09-17 — hands this session to the
       homescreen's app names. Here so it survives offline like
       the rest of the session machinery. */
    './js/scribble-passage.js',
    './js/scribble-backup.js',
    './js/scribble-recent.js',
    './js/scribble-session-tabs.js',
    './js/scribble-menu.js',
    './js/scribble-name-clash.js',
    './js/scribble-guard.js'
];

/* Hosts whose responses we're willing to keep. Anything
   else off-origin — Firestore's own traffic above all —
   is left completely alone. */
const VENDOR_HOSTS = [
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'cdnjs.cloudflare.com'
];

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

/* ── Activate: drop caches from older versions ───── */
self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(
            keys.filter(k => k !== SHELL_VERSION && k !== VENDOR_CACHE)
                .map(k => caches.delete(k))
        );
        await self.clients.claim();
    })());
});

/* ── Fetch ─────────────────────────────────────────
   Three paths, in order:

   1. Off-origin, not a vendor host  → don't touch it.
      This is the important one. Firestore talks to
      firestore.googleapis.com over a long-lived channel;
      putting a SW in the middle of that breaks sync.

   2. Vendor host → cache-first. Fonts never change, and
      going to the network first would mean waiting for a
      timeout on every offline page load.

   3. Same-origin → cache-first, then network, and the
      network copy is written back so a file you added
      after install still gets cached.
─────────────────────────────────────────────────── */
self.addEventListener('fetch', event => {
    const req = event.request;

    // Only GETs are cacheable; POSTs go straight through.
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    const sameOrigin = url.origin === self.location.origin;
    const isVendor   = VENDOR_HOSTS.includes(url.hostname);

    if (!sameOrigin && !isVendor) return;   // ← Firestore leaves here

    if (isVendor) {
        event.respondWith(cacheFirst(req, VENDOR_CACHE));
        return;
    }

    event.respondWith(shellFetch(req));
});

/* Cache-first with a network fill-in. Used for fonts. */
async function cacheFirst(req, cacheName) {
    const cache  = await caches.open(cacheName);
    const cached = await cache.match(req);
    if (cached) return cached;

    try {
        const res = await fetch(req);
        // Font CDNs answer cross-origin requests opaquely
        // (status 0). Opaque is still servable, so keep it.
        if (res && (res.ok || res.type === 'opaque')) {
            cache.put(req, res.clone());
        }
        return res;
    } catch (e) {
        // Offline and never fetched this font. Nothing to
        // give back — the page loses its icons but loads.
        return Response.error();
    }
}

/* Same-origin. Cache first so offline is instant, then
   network, then — for a page navigation — fall back to
   the app shell so a deep link still opens something. */
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
            const shell = await cache.match('./Scribble.html');
            if (shell) return shell;
        }
        return Response.error();
    }
}
