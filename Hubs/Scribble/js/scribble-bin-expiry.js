/* ═══════════════════════════════════════════════════
   SCRIBBLE — BIN EXPIRY SWEEP
   js/scribble-bin-expiry.js

   The bin has always shown a 30-day countdown, but
   nothing ever acted on it — an item hit zero, displayed
   "Expired", and stayed forever. This makes the countdown
   real.

   Anything already at zero days is permanently deleted,
   using the bin's own permanentDeleteGroup() so
   subcollections and version history are purged properly
   rather than orphaned.

   It only ever touches items whose countdown has already
   reached zero. Nothing with days left is at risk.

   ── WHERE IT RUNS — CORRECTED 2026-09-17 ──────────
   This said "Runs once when the recycle bin page opens"
   and "To turn it off: remove this file's script tag from
   Scribble-recycle-bin.html. Nothing else depends on it."

   Both were out of date. Scribble.html loads it too, and
   deliberately — its own tag says "an expired item should
   not need you to visit the bin to go". So removing the
   one tag would NOT have turned it off, and whoever tried
   would have concluded the sweep was broken rather than
   that the instructions were.

   To turn it off, remove the tag from BOTH:
     Scribble-recycle-bin.html
     Scribble.html
═══════════════════════════════════════════════════ */

import './scribble-boot.js';
import { db, whenMs } from './scribble-db.js';
import { collection, getDocs, getDocsFromCache } from './vendor/firebase.js';

/*
 * The bin page already holds a live listener on this collection, so
 * by the time the sweep runs the documents are sitting in the local
 * cache. Reading from the server again was a second full download of
 * the bin on every page load, purely to answer a question the page
 * had already answered.
 *
 * Cache first, server only if the cache has nothing — which happens
 * on a cold load where the sweep somehow beat the listener.
 */
async function readBin() {
    try {
        const cached = await getDocsFromCache(collection(db, 'bin'));
        if (!cached.empty) return cached;
    } catch (e) { /* no cache yet — fall through */ }
    return getDocs(collection(db, 'bin'));
}

const RETENTION_DAYS = 30;

/* Same formula the bin page displays with, so what gets
   swept always matches what the Days Left column said.

   Takes the whole document rather than one field, so whenMs
   can fall back to deletedAtLocalMs. Deleted offline, the
   server timestamp reads back null — which scored this as a
   30-day-old item on day zero. It was never actually swept
   (null was the "broken row, leave alone" case below), but
   the bin still showed it as Expired the moment you deleted
   it. Now it counts down from when you actually deleted it. */
function daysLeft(data) {
    const ms = whenMs(data, 'deletedAt');
    if (!ms) return null;   // no timestamp at all — never sweep it
    const gone = Math.floor((Date.now() - ms) / 86400000);
    return Math.max(0, RETENTION_DAYS - gone);
}

async function sweepExpired() {
    if (!window.BIN_FB || typeof window.BIN_FB.permanentDeleteGroup !== 'function') {
        console.warn('[Bin expiry] BIN_FB not ready — skipped.');
        return { swept: 0, groups: [] };
    }

    let snap;
    try {
        snap = await readBin();
    } catch (e) {
        console.warn('[Bin expiry] could not read the bin:', e.message);
        return { swept: 0, groups: [] };
    }

    /* One entry per group. A 40-item group has 40 bin documents that all
       expire on the same day; deleting the group once removes all of them,
       and calling it 40 times would throw 39 times on already-gone docs. */
    const expired = new Map();

    snap.forEach(d => {
        const data = d.data();
        const left = daysLeft(data);

        /* null means the document has no deletedAt at all. That's a broken
           row, not an old one — leave it alone rather than destroy it. */
        if (left === null || left > 0) return;

        const gid = data.groupId || d.id;
        if (!expired.has(gid)) expired.set(gid, data.name || 'Untitled');
    });

    if (!expired.size) return { swept: 0, groups: [] };

    const done = [];
    for (const [groupId, name] of expired) {
        try {
            await window.BIN_FB.permanentDeleteGroup(groupId);
            done.push(name);
        } catch (e) {
            console.warn('[Bin expiry] could not delete "' + name + '":', e.message);
        }
    }

    if (done.length) {
        console.log('[Bin expiry] permanently deleted ' + done.length +
                    ' expired group(s): ' + done.join(', '));
    }
    return { swept: done.length, groups: done };
}

window.BIN_EXPIRY = {
    sweep: sweepExpired,
    RETENTION_DAYS,

    /* BIN_EXPIRY.preview() lists what a sweep WOULD delete without
       deleting anything. Worth running first. */
    async preview() {
        const snap = await readBin();
        const rows = [];
        snap.forEach(d => {
            const data = d.data();
            const left = daysLeft(data);
            if (left === null) rows.push((data.name || 'Untitled') + ' — no deletedAt, will be skipped');
            else if (left === 0) rows.push((data.name || 'Untitled') + ' — EXPIRED, would be deleted');
        });
        console.log(rows.length ? rows.join('\n') : 'Nothing is expired.');
        return rows;
    }
};

/* Deliberately after a tick: BIN_FB is defined by a sibling module and
   the bin's own listener should paint before anything is removed. */
setTimeout(sweepExpired, 1500);
