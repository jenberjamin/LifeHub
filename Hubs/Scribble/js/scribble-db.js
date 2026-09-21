/* ═══════════════════════════════════════════════════
   SCRIBBLE — SHARED DB
   js/scribble-db.js

   The ONE place Firebase is initialised. Every
   *-firebase.js file imports `db` from here instead of
   calling initializeApp itself.

   Why it has to be one place: offline persistence can
   only be switched on once per app instance, and only
   BEFORE the first read or write. Four competing
   initializeApp calls left nowhere safe to put it.

   Safe to load from several pages, and several times on
   the same page (the project page loads three firebase
   modules) — everything below is idempotent.
═══════════════════════════════════════════════════ */

import { initializeApp, getApps, getApp } from './vendor/firebase.js';
import {
    initializeFirestore, getFirestore,
    persistentLocalCache, persistentMultipleTabManager,
    serverTimestamp,
    doc, setDoc, updateDoc, deleteDoc, waitForPendingWrites
} from './vendor/firebase.js';

/* The SDK's CACHE_SIZE_UNLIMITED constant, which our trimmed
   vendor bundle doesn't re-export. It is literally -1. */
const CACHE_SIZE_UNLIMITED = -1;

const firebaseConfig = {
    apiKey:            "AIzaSyDNJnwrYVsfkiEwG_mvE-eJLaGgpso62tE",
    authDomain:        "lifehub---scribble.firebaseapp.com",
    projectId:         "lifehub---scribble",
    storageBucket:     "lifehub---scribble.firebasestorage.app",
    messagingSenderId: "806581871178",
    appId:             "1:806581871178:web:7ed5d73f3b1d619eccbcb3",
    measurementId:     "G-PLS8FFLM71"
};

/* ── App: reuse if a sibling module already made it ── */
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

/* ── Firestore + offline cache ─────────────────────
   persistentLocalCache writes everything you've read to
   IndexedDB and serves reads from it when there's no
   network. persistentMultipleTabManager is what lets you
   have the editor and the archive open in two tabs
   without one of them losing the cache.

   cacheSizeBytes defaults to 40MB, past which Firestore
   evicts least-recently-used documents. That's sensible
   for an app you re-fetch from; it's wrong for an archive,
   where the old project you haven't opened in a year is
   exactly the one you'd want to still be there offline.
   Unlimited means nothing is dropped behind your back.

   initializeFirestore throws if the instance already
   exists (a sibling module beat us here) — in that case
   the cache is already configured, so fall through.
─────────────────────────────────────────────────── */
let db;
try {
    db = initializeFirestore(app, {
        localCache: persistentLocalCache({
            tabManager:     persistentMultipleTabManager(),
            cacheSizeBytes: CACHE_SIZE_UNLIMITED
        })
    });
} catch (e) {
    db = getFirestore(app);
}

window.SCRIBBLE_DB = db;

/* ── Timestamp helper ──────────────────────────────
   serverTimestamp() reads back as null until the write
   reaches the server, so offline every "Deleted On",
   "Archived On" and Recent entry comes back blank.
   Writing localMs alongside it gives the UI something
   real to sort and display from immediately.

   Use:  { ...nowFields() }        instead of
         { createdAt: serverTimestamp() }

   and read with:  whenMs(data, 'createdAt')
─────────────────────────────────────────────────── */
export function nowFields(field = 'createdAt') {
    return { [field]: serverTimestamp(), [field + 'LocalMs']: Date.now() };
}

export function whenMs(data, field) {
    if (!data) return 0;
    const v = data[field];
    if (v && typeof v.toDate === 'function') return v.toDate().getTime();
    return data[field + 'LocalMs'] || 0;
}

export function whenDate(data, field) {
    const ms = whenMs(data, field);
    return ms ? new Date(ms) : null;
}

window.SCRIBBLE_TIME = { nowFields, whenMs, whenDate };

/* ══════════════════════════════════════════════════
   NON-BLOCKING WRITES
   ══════════════════════════════════════════════════
   The one thing that breaks an offline Firestore app.

   setDoc / updateDoc / deleteDoc / addDoc return a
   promise that resolves when the SERVER acknowledges the
   write. The local cache is updated immediately and any
   onSnapshot listener fires straight away — but that
   promise stays pending, forever, while you're offline.

   So `await updateDoc(...)` is a trap: everything after
   it never runs. Rename a project offline and the write
   lands in the queue, the UI updates from the listener,
   and then the log write, the toast and the modal close
   all sit there waiting for a network that isn't coming.

   The helpers below hand back a promise that resolves as
   soon as the write is QUEUED, which is the moment the
   app actually cares about. The real promise is still
   watched, only for logging — an offline write is not an
   error, it's a write that hasn't flushed yet.

   Use:  await save(ref, data)     not  await setDoc(...)
         await merge(ref, patch)   not  await updateDoc(...)
         await remove(ref)         not  await deleteDoc(...)
         const ref = newRef(coll)  not  await addDoc(...)
────────────────────────────────────────────────── */

/* Swallows the pending-forever promise so an offline
   write doesn't surface as an unhandled rejection. */
function queued(promise, label) {
    promise.catch(err => console.warn('[scribble-db] ' + label, err && err.message));
    return Promise.resolve();
}

export function save(ref, data)    { return queued(setDoc(ref, data), 'set'); }
export function merge(ref, patch)  { return queued(updateDoc(ref, patch), 'update'); }
export function remove(ref)        { return queued(deleteDoc(ref), 'delete'); }

/* addDoc's whole job is to return a server-assigned id,
   which is why it can't resolve offline. doc() on a
   collection generates the same kind of id locally and
   instantly, so the id is real before the write leaves. */
export function newRef(collectionRef) {
    return doc(collectionRef);
}

/* Convenience: mint an id and write to it in one step,
   returning the ref immediately. The offline-safe
   replacement for `const ref = await addDoc(coll, data)`. */
export function add(collectionRef, data) {
    const ref = doc(collectionRef);
    queued(setDoc(ref, data), 'add');
    return ref;
}

/* A batch commits atomically; offline its commit() has
   the same pending-forever behaviour. */
export function commit(batch) {
    return queued(batch.commit(), 'batch');
}

window.SCRIBBLE_WRITE = { save, merge, remove, newRef, add, commit };

/* ── Sync status ───────────────────────────────────
   waitForPendingWrites resolves once every queued write
   has reached the server, so it's the honest answer to
   "is my offline work safe yet?" — surface it in the UI
   rather than assuming a write is done. */
export function whenSynced() {
    return waitForPendingWrites(db);
}

export function isOnline() {
    return navigator.onLine !== false;
}

window.SCRIBBLE_SYNC = { whenSynced, isOnline };

export { db, app };
