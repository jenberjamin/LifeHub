/* ═══════════════════════════════════════════════════
   LIFEHUB — SCRIBBLE PASSAGE (picks the session up)
   JS/poppy/LifeHub-poppy-scribble-passage.js

   Added 2026-09-17.
   The other half of Hubs/Scribble/js/scribble-passage.js.

   ── THE SHORT VERSION ─────────────────────────────
   Scribble is guarded. Poppy reads your project list
   from it. She had no session, so the guard refused
   her — silently, for as long as the guard has existed.

   Scribble now leaves a copy of your session where this
   file can find it. All this file does is wait for
   Firebase to notice that copy before Poppy's first
   read goes out.

   ── WHY THE WAITING IS THE WHOLE JOB ──────────────
   Firebase restores a session from browser storage, and
   that takes a moment. A read fired before it lands
   carries no session and is refused — and it is refused
   in exactly the same words as a read that had no
   session at all, so it looks like the passage failed
   when really it was just early.

   Scribble hit this too, which is why js/scribble-boot.js
   exists over there. This is the same idea, kept small:
   one promise that settles when Firebase has made up its
   mind, which LifeHub-poppy-firebase-fetch.js waits on
   before touching Scribble.

   ── IT CANNOT LET ITSELF IN ───────────────────────
   There is no password here and no sign-in call. If you
   have not signed in to Scribble, or you have signed
   out, there is no copy to find, this resolves to null,
   and Poppy's reads go back to being refused — which is
   where they were before any of this existed. Nothing
   about the guard is weakened by the passage being
   closed.

   ── IF IT EVER STOPS WORKING ──────────────────────
   On a Scribble page:   SCRIBBLE_PASSAGE.check()
   On the homescreen:    LIFEHUB_SCRIBBLE_PASSAGE.check()

   The first says whether a copy was handed out. The
   second says whether it was picked up. Whichever one
   says no is the half to look at.

   To turn it off: remove this file's script tag from
   LifeHub-HomeScreen.html, and the PASSAGE block in
   LifeHub-poppy-firebase-fetch.js. Poppy goes back to
   being locked out of Scribble; nothing else changes.

   Needs firebase-auth-compat.js on the page — without
   it this says so once and resolves to null forever.
═══════════════════════════════════════════════════ */

(function () {

  /* One promise per app name. Poppy uses the app named
     "scribble"; the wallpaper's nudge panel will use
     "scribble-nudge" for the recycle-bin card. Both are
     fed by the same copies, so both are handled here. */
  const waiting = {};

  /* Firebase's auth observer fires once and then settles, so
     this normally resolves in a blink. The timeout is only for
     the case where it never fires at all — better that Poppy
     asks and is refused than that she hangs waiting forever on
     a card that is never coming. */
  const GIVE_UP_MS = 5000;

  function ready(app) {
    const name = (app && app.name) || '[DEFAULT]';
    if (waiting[name]) return waiting[name];

    if (!window.firebase || !firebase.auth) {
      console.warn('[Scribble passage] firebase-auth-compat.js is not on this ' +
                   'page — Scribble reads will be refused.');
      waiting[name] = Promise.resolve(null);
      return waiting[name];
    }

    waiting[name] = new Promise((resolve) => {
      let settled = false;
      const done = (user) => {
        if (settled) return;
        settled = true;
        resolve(user || null);
      };

      let stop = null;
      const timer = setTimeout(() => {
        if (stop) { try { stop(); } catch (e) {} }
        console.warn('[Scribble passage] gave up waiting for a session on "' +
                     name + '".');
        done(null);
      }, GIVE_UP_MS);

      try {
        stop = firebase.auth(app).onAuthStateChanged(
          (user) => {
            clearTimeout(timer);
            if (stop) { try { stop(); } catch (e) {} }
            done(user);
          },
          (err) => {
            clearTimeout(timer);
            console.warn('[Scribble passage] auth state:', err.message);
            done(null);
          }
        );
      } catch (e) {
        clearTimeout(timer);
        console.warn('[Scribble passage] could not reach auth:', e.message);
        done(null);
      }
    });

    return waiting[name];
  }

  window.LIFEHUB_SCRIBBLE_PASSAGE = {
    ready,

    /* LIFEHUB_SCRIBBLE_PASSAGE.check() in the console — did the
       card get picked up, and whose is it? Uses Poppy's own
       Scribble handle, so it answers for the real thing rather
       than a copy of the question. */
    async check() {
      if (!window.POPPY_FETCH || typeof POPPY_FETCH.db !== 'function') {
        console.log('[Scribble passage] POPPY_FETCH is not on this page.');
        return null;
      }

      /* Building the Firestore handle is also what creates the
         named app the session belongs to. */
      POPPY_FETCH.db('scribble');
      const app  = firebase.app('scribble');
      const user = await ready(app);

      console.log(user
        ? '[Scribble passage] open — ' + (user.email || user.uid)
        : '[Scribble passage] CLOSED — no session was picked up. ' +
          'Sign in to Scribble, then reload this page.');

      return user;
    }
  };

})();
