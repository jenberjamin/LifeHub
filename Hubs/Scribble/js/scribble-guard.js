/* ═══════════════════════════════════════════════════
   SCRIBBLE — GUARD & IDLE LOCK
   js/scribble-guard.js

   Runs on every Scribble page except the gate itself.

   ── WHAT CHANGED, AND WHY ─────────────────────────
   The old guard asked one question: is there a
   sessionStorage flag? That made it ask again on every
   new tab, and it never expired — so it was both
   annoying and not actually protective.

   Now there is ONE rule:

       You stay unlocked as long as you have been
       active in the last 30 minutes.

   A refresh, a jump to the archive, a second tab, even
   closing the browser and coming back five minutes
   later — all still you, still unlocked. Come back
   tomorrow, or walk away for half an hour, and it
   gates you. That is what "genuinely pulling it up for
   the first time" turns out to mean in practice, and it
   needs no separate rule of its own.

   ── THE WARNING ───────────────────────────────────
   At 29:45 idle a dialog appears with a 15 second
   countdown and locks when it reaches zero. It is a
   real confirmation: while it is open, moving the mouse
   or typing does NOT dismiss it. You either say "I'm
   still here" or you let it lock. Otherwise a stray
   cursor twitch would silently cancel the lock and the
   whole thing would be theatre.

   ── STATE ─────────────────────────────────────────
   localStorage, not sessionStorage — sessionStorage is
   per-tab, which is exactly the thing that made this
   annoying. One shared record means every tab agrees on
   whether you're in, and the `storage` event keeps them
   in step: being active in the editor tab stops the
   archive tab in another window from locking underneath
   you.

   ── TUNING ────────────────────────────────────────
   The two numbers below are the whole configuration.
   From the console:  SCRIBBLE_LOCK.status()
                      SCRIBBLE_LOCK.lock()
═══════════════════════════════════════════════════ */

(function () {

    /* ── Configuration ───────────────────────────── */
    const IDLE_MINUTES   = 30;    // inactivity before locking
    const WARN_SECONDS   = 15;    // countdown length on the dialog

    const IDLE_MS  = IDLE_MINUTES * 60 * 1000;
    const WARN_MS  = WARN_SECONDS * 1000;
    const ARM_MS   = IDLE_MS - WARN_MS;   // when the dialog appears

    const STATE_KEY = 'SCRIBBLE_LOCK';
    const GATE_PAGE = 'Scribble-gate.html';

    /* How often we persist "still active". Every event would
       mean a localStorage write per mousemove; 20s is plenty
       when the thing we're measuring is a 30 minute gap. */
    const WRITE_THROTTLE_MS = 20 * 1000;

    /* Pages the gate is allowed to send you back to. A bare
       whitelist, because ?from= ends up in location.replace
       and must never be able to point off this app. */
    const RETURN_PAGES = [
        'Scribble.html',
        'Scribble-project.html',
        'Scribble-archive.html',
        'Scribble-recycle-bin.html'
    ];

    /* The gate must not guard itself. */
    const here = location.pathname.split('/').pop() || 'Scribble.html';
    if (here.toLowerCase() === GATE_PAGE.toLowerCase()) return;

    /* ── State record ────────────────────────────── */
    function readState() {
        try {
            const raw = localStorage.getItem(STATE_KEY);
            if (!raw) return null;
            const s = JSON.parse(raw);
            if (!s || s.unlocked !== true) return null;
            return s;
        } catch (e) {
            return null;   // corrupt or storage blocked — treat as locked
        }
    }

    function writeState(lastActive) {
        try {
            localStorage.setItem(STATE_KEY, JSON.stringify({
                unlocked:   true,
                lastActive: lastActive
            }));
        } catch (e) { /* private mode — the session just won't survive a reload */ }
    }

    function clearState() {
        try { localStorage.removeItem(STATE_KEY); } catch (e) {}
    }

    /* ── The gate check ──────────────────────────── */
    const state = readState();
    const idleFor = state ? (Date.now() - (state.lastActive || 0)) : Infinity;

    if (!state || idleFor >= IDLE_MS) {
        /* Never unlocked, or the window has already passed — this
           includes coming back to a laptop that slept overnight,
           where no timer of ours ever got the chance to fire. */
        clearState();
        toGate();
        return;
    }

    /* Past the check: mark the session live from this moment. */
    let lastActive = Date.now();
    writeState(lastActive);

    function toGate() {
        const from = RETURN_PAGES.indexOf(here) !== -1 ? here : '';
        const url  = from
            ? GATE_PAGE + '?from=' + encodeURIComponent(from) + location.search.replace(/^\?/, '&')
            : GATE_PAGE;
        location.replace(url);
    }

    /* ══════════════════════════════════════════════
       ACTIVITY
    ══════════════════════════════════════════════ */
    let lastWrite = Date.now();
    let warning   = null;      // the dialog, while it's up

    function touch() {
        /* Deliberately ignored while the dialog is open. The
           dialog is a question, and a mousemove is not an answer. */
        if (warning) return;

        lastActive = Date.now();
        if (lastActive - lastWrite >= WRITE_THROTTLE_MS) {
            lastWrite = lastActive;
            writeState(lastActive);
        }
    }

    const ACTIVITY = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'];
    ACTIVITY.forEach(function (evt) {
        window.addEventListener(evt, touch, { passive: true, capture: true });
    });

    /* mousemove is throttled harder — it fires hundreds of times
       a second and we only need to know that it happened at all. */
    let moveGate = 0;
    window.addEventListener('mousemove', function () {
        const t = Date.now();
        if (t - moveGate < 1000) return;
        moveGate = t;
        touch();
    }, { passive: true });

    /* Coming back to the tab counts, but only as a check — if the
       machine was asleep past the limit, tick() locks immediately. */
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) { touch(); tick(); }
    });

    /* ══════════════════════════════════════════════
       CROSS-TAB
       Another tab writing the record means either "I'm
       active over here" or "I locked us out".
    ══════════════════════════════════════════════ */
    window.addEventListener('storage', function (e) {
        if (e.key !== STATE_KEY) return;

        const s = readState();
        if (!s) { hardLock(false); return; }        // another tab locked

        if ((s.lastActive || 0) > lastActive) {
            lastActive = s.lastActive;
            /* Someone is working in another tab — this one is not
               idle after all, so take the dialog back down. */
            if (warning) dismissWarning();
        }
    });

    /* ══════════════════════════════════════════════
       THE IDLE TIMER
    ══════════════════════════════════════════════ */
    function tick() {
        const idle = Date.now() - lastActive;

        if (idle >= IDLE_MS)  { hardLock(true);  return; }
        if (idle >= ARM_MS && !warning) showWarning();
    }

    setInterval(tick, 1000);

    /* ══════════════════════════════════════════════
       LOCKING
       Give the editor a chance to flush first. Queued
       Firestore writes are durable on their own, but an
       unsaved buffer sitting in the DOM is not.
    ══════════════════════════════════════════════ */
    function hardLock(flush, why) {
        /* The access-log module is an ES module and this is a classic
           script, so it arrives via the global. By the time anything
           can lock (30 minutes in, or a deliberate click) it is long
           since loaded — and if it somehow isn't, a missing log line
           must not be what stops the lock. */
        try {
            if (window.SCRIBBLE_ACCESS_LOG) {
                window.SCRIBBLE_ACCESS_LOG.record(why || 'idle-lock',
                    why === 'manual-lock' ? 'Locked from the workshop'
                                          : 'No activity for ' + IDLE_MINUTES + ' minutes');
            }
        } catch (e) { /* never block the lock */ }

        if (flush) {
            try {
                if (window.EDITOR_APP && typeof window.EDITOR_APP.forceSave === 'function') {
                    window.EDITOR_APP.forceSave();
                }
            } catch (e) { console.warn('[Scribble lock] save on lock:', e.message); }
        }
        clearState();
        toGate();
    }

    /* ══════════════════════════════════════════════
       THE WARNING DIALOG
       Built and styled here rather than in a stylesheet,
       so it works identically on all four pages without
       touching any of their CSS.
    ══════════════════════════════════════════════ */
    function showWarning() {
        const deadline = Date.now() + WARN_MS;

        const wrap = document.createElement('div');
        wrap.id = 'scribble-lock-warning';
        wrap.innerHTML =
            '<div class="slw-backdrop"></div>' +
            '<div class="slw-card" role="alertdialog" aria-modal="true" ' +
                 'aria-labelledby="slw-title" aria-describedby="slw-body">' +
              '<div class="slw-icon">⏱</div>' +
              '<h2 id="slw-title">Locking Scribble</h2>' +
              '<p id="slw-body">No activity for ' + IDLE_MINUTES + ' minutes. ' +
                 'Scribble is about to lock and send you back to the gate.</p>' +
              '<div class="slw-count"><span id="slw-num">' + WARN_SECONDS + '</span><small>s</small></div>' +
              '<div class="slw-actions">' +
                '<button type="button" class="slw-stay" id="slw-stay">I’m still here</button>' +
                '<button type="button" class="slw-now"  id="slw-now">Lock now</button>' +
              '</div>' +
            '</div>';

        const css = document.createElement('style');
        css.textContent = [
            '#scribble-lock-warning{position:fixed;inset:0;z-index:2147483647;',
              'font-family:"Roboto Condensed",system-ui,-apple-system,Segoe UI,sans-serif;',
              'display:flex;align-items:center;justify-content:center;}',
            '#scribble-lock-warning .slw-backdrop{position:absolute;inset:0;',
              'background:rgba(8,10,14,.78);backdrop-filter:blur(3px);}',
            '#scribble-lock-warning .slw-card{position:relative;width:min(92vw,380px);',
              'background:#15181f;color:#e8eaed;border:1px solid #2c313c;border-radius:14px;',
              'padding:26px 24px 20px;text-align:center;',
              'box-shadow:0 24px 60px rgba(0,0,0,.55);',
              'animation:slw-in .18s ease-out;}',
            '@keyframes slw-in{from{opacity:0;transform:translateY(8px) scale(.97)}',
              'to{opacity:1;transform:none}}',
            '#scribble-lock-warning .slw-icon{font-size:30px;line-height:1;margin-bottom:10px;}',
            '#scribble-lock-warning h2{margin:0 0 8px;font-size:19px;font-weight:700;',
              'letter-spacing:.3px;color:#fff;}',
            '#scribble-lock-warning p{margin:0 0 14px;font-size:13.5px;line-height:1.5;color:#a8adb8;}',
            '#scribble-lock-warning .slw-count{font-size:38px;font-weight:700;color:#ff8f6b;',
              'line-height:1;margin-bottom:18px;font-variant-numeric:tabular-nums;}',
            '#scribble-lock-warning .slw-count small{font-size:15px;margin-left:2px;color:#8d939f;}',
            '#scribble-lock-warning .slw-actions{display:flex;gap:9px;}',
            '#scribble-lock-warning button{flex:1;padding:11px 12px;border-radius:9px;',
              'font-family:inherit;font-size:13.5px;font-weight:600;cursor:pointer;',
              'border:1px solid transparent;transition:filter .15s,background .15s;}',
            '#scribble-lock-warning button:hover{filter:brightness(1.12);}',
            '#scribble-lock-warning .slw-stay{background:#e8eaed;color:#15181f;}',
            '#scribble-lock-warning .slw-now{background:transparent;color:#9aa0ac;border-color:#333945;}',
            '#scribble-lock-warning button:focus-visible{outline:2px solid #ff8f6b;outline-offset:2px;}'
        ].join('');

        document.head.appendChild(css);
        document.body.appendChild(wrap);

        const numEl = wrap.querySelector('#slw-num');

        /* Driven off a deadline, not a decrementing counter: if the
           tab is throttled in the background the maths still lands
           on the right number instead of drifting. */
        const timer = setInterval(function () {
            const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
            numEl.textContent = left;
            if (left <= 0) {
                clearInterval(timer);
                hardLock(true);
            }
        }, 250);

        warning = { wrap: wrap, css: css, timer: timer };

        wrap.querySelector('#slw-stay').addEventListener('click', function () {
            dismissWarning();
            lastActive = Date.now();
            lastWrite  = lastActive;
            writeState(lastActive);      // tells the other tabs too
        });

        wrap.querySelector('#slw-now').addEventListener('click', function () {
            dismissWarning();
            hardLock(true);
        });

        wrap.querySelector('#slw-stay').focus();
    }

    function dismissWarning() {
        if (!warning) return;
        clearInterval(warning.timer);
        warning.wrap.remove();
        warning.css.remove();
        warning = null;
    }

    /* ══════════════════════════════════════════════
       CONSOLE HANDLE
    ══════════════════════════════════════════════ */
    window.SCRIBBLE_LOCK = {
        lock:   function () { hardLock(true, 'manual-lock'); },
        extend: function () { lastActive = Date.now(); writeState(lastActive); dismissWarning(); },
        status: function () {
            const idle = Date.now() - lastActive;
            return {
                idleMinutes:  +(idle / 60000).toFixed(1),
                locksInSecs:  Math.max(0, Math.round((IDLE_MS - idle) / 1000)),
                warningShown: !!warning,
                idleLimitMin: IDLE_MINUTES
            };
        }
    };

})();
