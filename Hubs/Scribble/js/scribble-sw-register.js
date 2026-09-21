/* ═══════════════════════════════════════════════════
   SCRIBBLE — SERVICE WORKER REGISTRATION
   js/scribble-sw-register.js

   Loaded by every Scribble page. Registers ../sw.js once
   and then gets out of the way.

   ── SCOPE ─────────────────────────────────────────
   sw.js lives at the Scribble root, so its scope is the
   whole Scribble folder — the gate page included, even
   though it registers with a '../' path.

   ── WHY IT MIGHT DO NOTHING ───────────────────────
   Service workers only run on https:// or localhost.
   Opened straight off the disk as file://, registration
   is skipped with a console note rather than throwing.
   (ES modules don't load over file:// either, so the app
   already needs to be served — this just says so out
   loud if it ever isn't.)
═══════════════════════════════════════════════════ */

(function () {

    if (!('serviceWorker' in navigator)) {
        console.info('[Scribble] No service worker support — online only.');
        return;
    }

    if (location.protocol === 'file:') {
        console.info(
            '[Scribble] Opened as file:// — offline mode is off. ' +
            'Serve the folder over http to enable it.'
        );
        return;
    }

    /* register() resolves its path against the PAGE, not this
       script — and the gate page sits one folder deeper than
       the rest. Deriving it from our own src instead gives the
       same absolute URL no matter who loads us.
       currentScript has to be read now; it's null by the time
       the load handler runs. */
    const here    = document.currentScript && document.currentScript.src;
    const SW_PATH = here ? new URL('../sw.js', here).href : '/sw.js';

    window.addEventListener('load', () => {
        navigator.serviceWorker.register(SW_PATH)
            .then(reg => {
                console.info('[Scribble] Offline mode ready.', reg.scope);

                // A new sw.js (SHELL_VERSION bumped) takes over on
                // the next load, not this one — no surprise reloads
                // in the middle of writing something.
                reg.addEventListener('updatefound', () => {
                    console.info('[Scribble] Update downloaded — active after next reload.');
                });
            })
            .catch(err => {
                console.warn('[Scribble] Offline mode unavailable:', err.message);
            });
    });

})();
