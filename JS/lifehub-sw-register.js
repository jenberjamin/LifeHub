/* ═══════════════════════════════════════════════════════════════════
   LIFEHUB SERVICE WORKER REGISTRATION
   ───────────────────────────────────────────────────────────────────
   Turns on sw.js (offline support for the HomeScreen) — but only on the
   deployed https site. On localhost, a file path or in Lively it does
   nothing, so it can never serve you stale files while you're editing.

   Load it from a page in the project root:
       <script src="JS/lifehub-sw-register.js"></script>

   ── MANUAL OVERRIDE (per device) ───────────────────────────────────
       ?sw=off    unregister it and delete its caches on this device
       ?sw=on     register it even on localhost (for testing)
═══════════════════════════════════════════════════════════════════ */

(function () {
  if (!('serviceWorker' in navigator)) return;

  var param = (location.search.match(/[?&]sw=([^&]*)/) || [])[1];
  var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

  if (param === 'off') {
    navigator.serviceWorker.getRegistrations().then(function (regs) {
      regs.forEach(function (r) {
        var worker = r.active || r.waiting || r.installing;
        // only ours: /sw.js at this folder's scope, not LibraryHub's or Scribble's
        if (!worker || !/\/sw\.js$/.test(worker.scriptURL) ||
            new URL(r.scope).pathname !== new URL('./', location.href).pathname) return;
        // the worker stops caching and deletes its caches itself — deleting
        // them from here would race with this page's own requests
        if (r.active) r.active.postMessage('lifehub-sw-off');
        r.unregister();
      });
    });
    return;
  }

  if (location.protocol !== 'https:' && !(local && param === 'on')) return;

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function (e) {
      console.warn('LifeHub offline support not available:', e);
    });
  });
})();
