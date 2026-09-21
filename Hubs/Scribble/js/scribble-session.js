/* ═══════════════════════════════════════════════════
   SCRIBBLE — FIREBASE SESSION
   js/scribble-session.js

   The account Firestore checks against. Not to be
   confused with the gate — these are two different jobs
   and it matters that they stay separate:

     Firebase session  → what the SERVER trusts.
                         Decides whether your data can be
                         read or written at all.

     Scribble gate     → what the SCREEN shows.
                         Keeps someone at your desk out
                         of an already-signed-in browser.

   You sign into Firebase once per device, more or less
   forever. You pass the gate every 30 idle minutes.

   ── WHY THIS DOES NOT BREAK OFFLINE ───────────────
   Persistence is indexedDBLocalPersistence, so the
   session survives a reload, a restart, and being
   offline for a week. From there:

     reads   — served from the Firestore cache. Security
               rules are evaluated on the SERVER only, so
               a cached read never needs a live token.

     writes  — queue exactly as before. On reconnect the
               SDK refreshes the ID token first, THEN
               sends the queue, so the rules see a valid
               user.

   ID tokens last an hour and refresh silently; refresh
   tokens do not expire on their own. The only thing that
   genuinely needs network is the FIRST sign-in on a
   device — and a device that has never been online has
   an empty cache and nothing to show you anyway.

   ── ONE ACCOUNT, ON PURPOSE ───────────────────────
   Email/Password, not anonymous. Anonymous auth mints a
   different uid per device, which would break a rule
   pinned to one uid the moment you opened Scribble on
   the tablet.
═══════════════════════════════════════════════════ */

import { app } from './scribble-db.js';
import {
    getAuth,
    indexedDBLocalPersistence,
    browserLocalPersistence,
    setPersistence,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    onAuthStateChanged,
    signOut
} from './vendor/firebase.js';

const auth = getAuth(app);

/* Pages that must load without a session, or you could never
   get one: the gate is where you sign in, and setup is where a
   brand-new install writes its first credentials. */
const OPEN_PAGES = ['Scribble-gate.html', 'Scribble-setup.html'];

function currentPage() {
    return location.pathname.split('/').pop() || 'Scribble.html';
}

export function isOpenPage() {
    const here = currentPage().toLowerCase();
    return OPEN_PAGES.some(p => p.toLowerCase() === here);
}

/* ══════════════════════════════════════════════════
   READY
   Resolves once Firebase has restored (or failed to
   restore) a session from IndexedDB. Every module that
   reads Firestore should await this first — firing a
   query before the token is attached is what produces a
   spurious permission-denied on a cold load.
══════════════════════════════════════════════════ */
let _resolveReady;
export const authReady = new Promise(resolve => { _resolveReady = resolve; });

let _user = null;
let _settled = false;

/* Persistence must be set before the first auth call. IndexedDB is
   the durable one; a browser with it blocked (private mode, some
   embedded webviews) falls back to localStorage, which still
   survives a reload — just not always a restart. */
setPersistence(auth, indexedDBLocalPersistence)
    .catch(() => setPersistence(auth, browserLocalPersistence))
    .catch(err => console.warn('[Scribble session] persistence:', err.message))
    .finally(() => {
        onAuthStateChanged(auth, user => {
            _user = user || null;
            if (!_settled) { _settled = true; _resolveReady(_user); }

            /* Signed out from another tab, or the account was revoked.
               Send this tab somewhere it can do something about it. */
            if (!_user && _settled && !isOpenPage()) {
                location.replace('Scribble-gate.html?reason=session');
            }
        }, err => {
            console.warn('[Scribble session] auth state:', err.message);
            if (!_settled) { _settled = true; _resolveReady(null); }
        });
    });

export function currentUser() { return _user; }
export function isSignedIn()  { return !!_user; }

/* ══════════════════════════════════════════════════
   SIGN IN / OUT
══════════════════════════════════════════════════ */
export async function signIn(email, password) {
    const cred = await signInWithEmailAndPassword(auth, String(email).trim(), String(password));
    _user = cred.user;
    return _user;
}

/*
 * Full disconnect: drops the Firebase session AND the gate unlock.
 * Deliberately separate from the gate's idle lock, which only
 * closes the screen — this one gives up access to the data and
 * needs the account password to undo.
 */
export async function signOutDevice() {
    try { localStorage.removeItem('SCRIBBLE_LOCK'); } catch (e) {}
    await signOut(auth);
}

export function resetPassword(email) {
    return sendPasswordResetEmail(auth, String(email).trim());
}

/* Turns Firebase's error codes into something worth reading. */
export function authErrorMessage(err) {
    const code = (err && err.code) || '';
    switch (code) {
        case 'auth/invalid-email':        return 'That email address is not valid.';
        case 'auth/user-disabled':        return 'That account has been disabled.';
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':   return 'Email or password is incorrect.';
        case 'auth/too-many-requests':    return 'Too many attempts. Wait a minute and try again.';
        case 'auth/network-request-failed':
            return 'No connection. Signing in for the first time on a device needs internet.';
        default:
            return (err && err.message) || 'Could not sign in.';
    }
}

window.SCRIBBLE_SESSION = {
    signIn, signOutDevice, resetPassword,
    currentUser, isSignedIn, authReady,
    /* Handy from the console: SCRIBBLE_SESSION.whoami() */
    whoami() {
        const u = currentUser();
        if (!u) { console.log('[Scribble] Not signed in.'); return null; }
        console.log('[Scribble] ' + u.email + '\n  uid: ' + u.uid);
        return u.uid;
    }
};

export { auth };
