/* ═══════════════════════════════════════════════════
   SCRIBBLE — BOOT GATE
   js/scribble-boot.js

   Imported first by every module that touches Firestore.
   Its whole job is to make sure a restored session is in
   place BEFORE any query goes out.

   ── WHY A MODULE AND NOT A FUNCTION CALL ──────────
   The await below is a top-level await, which makes this
   module async — and an importing module does not
   evaluate until its dependencies finish. So

       import './scribble-boot.js';

   as the first line of a *-firebase.js file holds that
   entire file until auth has settled, without wrapping
   any of its existing code in an async function.

   Without this the modules fire their first getDocs and
   onSnapshot the instant they load, which on a cold page
   is a few hundred milliseconds before Firebase has
   restored the session from IndexedDB. Every one of
   those reads comes back permission-denied, and the page
   looks broken for reasons that have nothing to do with
   your rules.

   ── OFFLINE ───────────────────────────────────────
   authReady resolves from the local IndexedDB session,
   with no network involved. Offline it settles just as
   fast as online — it is reading a stored session, not
   asking a server for permission.
═══════════════════════════════════════════════════ */

import { authReady, isOpenPage } from './scribble-session.js';

const user = await authReady;

/*
 * No session, and this is not one of the pages where you can get
 * one. Send it to the gate, which shows the connect step.
 *
 * replace() rather than href, so the back button does not bounce
 * you into a page that will only redirect you again.
 */
if (!user && !isOpenPage()) {
    location.replace('Scribble-gate.html?reason=session');
}

export const bootUser = user;
