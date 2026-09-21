/* ═══════════════════════════════════════════════════
   SCRIBBLE — PASSAGE (hands the session out)
   js/scribble-passage.js

   Added 2026-09-17.

   ── THE PROBLEM THIS SOLVES ───────────────────────
   Scribble is guarded. The rules in firestore.rules let
   exactly one signed-in account read anything, and that
   is the right answer — your archive is yours.

   But the homescreen and Poppy were linked to Scribble
   BEFORE the guard went up. They read your project list
   to answer things like "how many projects do I have".
   They have no session, so the guard now turns them away
   every single time.

   Worse, they never said so. A denied read in
   LifeHub-poppy-firebase-fetch.js comes back as the
   quiet string "(scribble/projects.count unavailable)",
   so Poppy simply stopped knowing anything about your
   projects and carried on as if nothing had happened.

   ── WHY THEY ARE TURNED AWAY ──────────────────────
   Not because they are untrusted. Because of a NAME.

   Firebase keeps a signed-in session per "app name".
   Scribble signs in on the default app, so its session
   is filed under

       firebase:authUser:<apiKey>:[DEFAULT]

   Poppy builds her own handle to the same Firebase
   project under the name "scribble" (see appFor() in
   JS/poppy/LifeHub-poppy-firebase-fetch.js), so she
   looks for a session filed under

       firebase:authUser:<apiKey>:scribble

   Same project. Same account. Same browser. Different
   name, so nothing is there, so no session is attached
   to her reads, so the guard denies them.

   ── WHAT THIS FILE DOES ───────────────────────────
   When you sign in at the gate, it copies the session
   record you just created to the names the homescreen
   reads from. That is the whole trick.

   What it CANNOT do is just as important:

     · It never holds your password. It has no way to
       sign anything in. It only ever copies a session
       you created yourself at the gate.
     · Sign out and it deletes every copy immediately,
       so the homescreen goes blind at the same moment
       Scribble does.
     · If it fails, it fails silently and nothing new
       breaks — the homescreen goes back to being locked
       out, which is exactly where it is today.

   No change to firestore.rules is needed, or made. The
   guard stays exactly where you put him.

   ── THE ONE FRAGILE PART, SAID PLAINLY ────────────
   That "firebase:authUser:..." filing system is
   Firebase's own internal business, not a documented
   feature they promise to keep. It has been the same
   through versions 9 and 10, and every Firebase script
   in LifeHub is version 10 — but if you ever upgrade
   Firebase and Poppy goes quiet about your projects
   again, this file is the first place to look.

   SCRIBBLE_PASSAGE.check() in the console says whether
   the copies are in place right now.

   ── REQUIRES ONE ADDRESS ──────────────────────────
   Browsers file saved sessions by address, and only
   pages sharing an address share them. Serving LifeHub
   over http:// (as you already do) gives every page one
   address. Opened straight off the disk as file://,
   each page is walled off and no copy would ever be
   found. Nothing to do here — just the reason why.

   To turn it off: remove this file's script tag from
   the Scribble pages. Poppy goes back to being locked
   out of your project list; nothing inside Scribble
   changes, and no session of yours is affected.
═══════════════════════════════════════════════════ */

import { app } from './scribble-db.js';
import { getAuth, onAuthStateChanged } from './vendor/firebase.js';

/* ══════════════════════════════════════════════════
   WHO GETS A COPY
   Add a name here and that app name can read Scribble.
   Remove one and it goes back to being locked out the
   next time you sign in or out.
══════════════════════════════════════════════════ */
const PASSAGE_APPS = [
    /* Poppy's reads and writes — appFor("scribble") in
       JS/poppy/LifeHub-poppy-firebase-fetch.js. */
    'scribble',

    /* The wallpaper's nudge panel, for the recycle-bin
       expiry card. Listed now so the name is settled;
       harmless until something actually uses it. */
    'scribble-nudge'
];

/* The session we copy FROM: the one scribble-session.js
   creates. scribble-db.js never passes a name to
   initializeApp, and an unnamed Firebase app is always
   called [DEFAULT]. */
const SOURCE_APP = '[DEFAULT]';

const API_KEY = (app && app.options && app.options.apiKey) || '';

const keyFor = (appName) => 'firebase:authUser:' + API_KEY + ':' + appName;

/* ══════════════════════════════════════════════════
   WHERE THE SESSION IS KEPT

   scribble-session.js asks for IndexedDB and falls back
   to localStorage where IndexedDB is blocked (private
   windows, some embedded browsers). Both sides of the
   passage make the same choice in the same browser, so
   whichever one holds your session is the one the
   homescreen will look in — this reads and writes
   whichever it finds, rather than guessing.
══════════════════════════════════════════════════ */
const IDB_NAME  = 'firebaseLocalStorageDb';
const IDB_STORE = 'firebaseLocalStorage';

/* Opens Firebase's session database WITHOUT creating it.
   If it isn't there, Firebase has never stored a session
   in it, and quietly conjuring an empty one behind the
   SDK's back is not this file's business. */
function openIdb() {
    return new Promise((resolve, reject) => {
        let req;
        try { req = indexedDB.open(IDB_NAME); }
        catch (e) { reject(e); return; }

        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error || new Error('could not open ' + IDB_NAME));
        req.onblocked = () => reject(new Error(IDB_NAME + ' is blocked by another tab'));

        /* Fires only when the database did not exist. Abort, so
           we leave nothing behind, and let onerror report it. */
        req.onupgradeneeded = () => {
            try { req.transaction.abort(); } catch (e) {}
        };
    });
}

function idbRun(db, mode, work) {
    return new Promise((resolve, reject) => {
        let tx;
        /* Throws outright if the object store isn't there, which
           again means no session has ever been written. */
        try { tx = db.transaction(IDB_STORE, mode); }
        catch (e) { reject(e); return; }

        const req = work(tx.objectStore(IDB_STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
    });
}

/* Returns { value, store } so a copy goes back to the same
   kind of storage it came out of, or null if there is no
   session filed under that key at all. */
async function readRecord(key) {
    try {
        const db  = await openIdb();
        const row = await idbRun(db, 'readonly', (s) => s.get(key));
        db.close();
        if (row && row.value) return { value: row.value, store: 'idb' };
    } catch (e) { /* fall through to localStorage */ }

    try {
        const raw = localStorage.getItem(key);
        if (raw) return { value: JSON.parse(raw), store: 'local' };
    } catch (e) { /* unreadable or not valid JSON — treat as absent */ }

    return null;
}

async function writeRecord(key, value, store) {
    if (store === 'local') {
        localStorage.setItem(key, JSON.stringify(value));
        return;
    }
    const db = await openIdb();
    await idbRun(db, 'readwrite', (s) => s.put({ fbase_key: key, value }));
    db.close();
}

/* Sign-out has to be thorough, so this clears BOTH stores
   without caring which one the copy went into. A leftover
   copy is a door left open. */
async function dropRecord(key) {
    try {
        const db = await openIdb();
        await idbRun(db, 'readwrite', (s) => s.delete(key));
        db.close();
    } catch (e) { /* nothing there to remove */ }

    try { localStorage.removeItem(key); } catch (e) {}
}

/* ══════════════════════════════════════════════════
   HANDING THE CARD OVER
══════════════════════════════════════════════════ */

/* Firebase writes the session, then tells the app about it.
   Usually the write has landed by the time we are called;
   occasionally it is a beat behind, so give it a few tries
   before deciding there is nothing to copy. */
async function findSession(tries = 5) {
    for (let i = 0; i < tries; i++) {
        const found = await readRecord(keyFor(SOURCE_APP));
        if (found) return found;
        await new Promise(r => setTimeout(r, 150));
    }
    return null;
}

export async function handOver() {
    if (!API_KEY) {
        console.warn('[Scribble passage] no apiKey on the Firebase app — nothing to copy.');
        return 0;
    }

    const found = await findSession();
    if (!found) {
        console.warn('[Scribble passage] no stored session to copy yet.');
        return 0;
    }

    let done = 0;
    for (const name of PASSAGE_APPS) {
        try {
            /* A fresh copy per name. The record carries the app
               name inside it as well as in its key, and leaving
               the original name in place gives the SDK on the
               other side two different answers to the same
               question. */
            const copy = JSON.parse(JSON.stringify(found.value));
            if (copy && typeof copy === 'object') copy.appName = name;

            await writeRecord(keyFor(name), copy, found.store);
            done++;
        } catch (e) {
            console.warn('[Scribble passage] could not hand a session to "' +
                         name + '":', e.message);
        }
    }
    return done;
}

export async function takeBack() {
    for (const name of PASSAGE_APPS) {
        await dropRecord(keyFor(name));
    }
}

/* ══════════════════════════════════════════════════
   WIRED TO YOUR SESSION, AND NOTHING ELSE

   getAuth(app) hands back the very same auth that
   scribble-session.js set up — asking for it again does
   not make a second one — so this watches your real
   session without touching how it works.

   Signed in  → copy the card out.
   Signed out → destroy every copy.
══════════════════════════════════════════════════ */
const auth = getAuth(app);

onAuthStateChanged(auth, (user) => {
    if (user) {
        handOver().catch(e => console.warn('[Scribble passage] hand over:', e.message));
    } else {
        takeBack().catch(e => console.warn('[Scribble passage] take back:', e.message));
    }
}, (err) => {
    console.warn('[Scribble passage] auth state:', err.message);
});

/* ══════════════════════════════════════════════════
   FROM THE CONSOLE
   SCRIBBLE_PASSAGE.check()  — is the passage open?
══════════════════════════════════════════════════ */
window.SCRIBBLE_PASSAGE = {
    handOver, takeBack, apps: PASSAGE_APPS,

    async check() {
        const mine = await readRecord(keyFor(SOURCE_APP));
        const lines = ['[Scribble passage]',
                       '  your session: ' +
                       (mine ? (mine.value.email || mine.value.uid || 'present') +
                               ' (' + mine.store + ')'
                             : 'NOT SIGNED IN')];

        for (const name of PASSAGE_APPS) {
            const copy = await readRecord(keyFor(name));
            lines.push('  ' + name + ': ' + (copy ? 'open' : 'closed'));
        }

        console.log(lines.join('\n'));
        return lines;
    }
};
