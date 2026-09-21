/* =========================================
   LIFEHUB | CINEMA SYNC (The Ghost Writer)
   "The Bridge to the Cloud"
   =========================================

   Rewritten to live on the SAME database as the rest of LifeHub:
   the Realtime Database on project 'lifehub-cae1d', alongside
   sleep_logs / hydration_logs / foodList / dailyLogs.

   The old version used a separate Firestore project ('edh-projects')
   via ES module imports. That had three problems:
     1. ES modules can't load from a file:// page, so opening the hub
        by double-clicking the HTML meant NO sync at all -- which is
        exactly how ~100 movies ended up stranded in local storage.
     2. It was a different Firebase project from every other hub.
     3. It only ever downloaded when local was completely empty, and
        uploaded by blind overwrite. Either half could lose data.

   This version is a classic script (works on file:// too), reuses the
   app that lifehub-navigation-core.js already initialises, and merges
   instead of overwriting.
   ========================================= */

(function () {
    'use strict';

    const DB_NAME   = 'LifeHub_CinemaVault';  // Must match cinema-core.js
    const META_KEY  = 'LifeHub_CinemaVault_meta';
    const TOMB_KEY  = 'LifeHub_CinemaVault_tombstones';
    const CLOUD_PATH = 'cinema_vault';
    const SAVE_DEBOUNCE_MS = 1500;
    const TOMB_TTL_DAYS = 90;   // Long enough for any device to see the delete.

    // Same config as lifehub-navigation-core.js -- one project for all hubs.
    const firebaseConfig = {
        apiKey: "AIzaSyABhqON4h0GHjFbZaDT1ysSprmpdczyC6I",
        authDomain: "lifehub-cae1d.firebaseapp.com",
        databaseURL: "https://lifehub-cae1d-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "lifehub-cae1d",
        storageBucket: "lifehub-cae1d.firebasestorage.app",
        messagingSenderId: "471522181748",
        appId: "1:471522181748:web:6861392a45fbbbec8dc721"
    };

    if (typeof firebase === 'undefined') {
        console.error("🔥 Firebase SDK missing! Cinema sync is OFFLINE (local only).");
        return;
    }

    let app;
    try { app = firebase.app(); } catch (e) { app = firebase.initializeApp(firebaseConfig); }
    const cloudRef = app.database().ref(CLOUD_PATH);

    /* ---------- helpers ---------- */

    const readLocal = () => {
        try { return JSON.parse(localStorage.getItem(DB_NAME)) || []; }
        catch (e) { console.error("Vault unreadable, treating as empty:", e); return []; }
    };

    const readMeta = () => {
        try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; }
        catch (e) { return {}; }
    };

    const stampMeta = (iso) => {
        // Best effort: the stamp is an optimisation, never worth throwing over.
        try { originalSetItem.call(localStorage, META_KEY, JSON.stringify({ lastUpdated: iso })); }
        catch (e) { /* full bucket -- device just stays non-authoritative */ }
    };

    const readTombs = () => {
        try { return JSON.parse(localStorage.getItem(TOMB_KEY)) || {}; }
        catch (e) { return {}; }
    };

    const writeTombs = (tombs) => {
        try { originalSetItem.call(localStorage, TOMB_KEY, JSON.stringify(tombs)); }
        catch (e) { /* full bucket -- cloud copy still carries the deletions */ }
    };

    /* Merge two tombstone maps ({id: deletedAtISO}), keeping the LATEST delete
       per id, and drop anything past the TTL so the map can't grow forever. */
    function mergeTombs(a, b) {
        const out = {};
        const cutoff = new Date(Date.now() - TOMB_TTL_DAYS * 864e5).toISOString();
        [a || {}, b || {}].forEach(src => {
            Object.keys(src).forEach(id => {
                const t = src[id];
                if (t < cutoff) return;
                if (!out[id] || t > out[id]) out[id] = t;
            });
        });
        return out;
    }

    /* A tombstone kills an entry UNLESS the entry was re-added afterwards --
       dateAdded is stamped at creation, so a later dateAdded means the title
       was deliberately added back and must survive. */
    function applyTombs(arr, tombs) {
        if (!tombs || Object.keys(tombs).length === 0) return arr;
        return arr.filter(item => {
            const t = item && item.id && tombs[item.id];
            if (!t) return true;
            return !!(item.dateAdded && item.dateAdded > t);
        });
    }

    /* Detect what changed between two vault snapshots and record deletions.
       Doing it here means cinema-core.js needs no changes at all -- any code
       path that removes a title is caught automatically. */
    function updateTombstones(prevIds, nextArr) {
        const nextIds = new Set(nextArr.map(m => m && m.id).filter(Boolean));
        const tombs = readTombs();
        const now = new Date().toISOString();
        let changed = false;

        prevIds.forEach(id => {
            if (!nextIds.has(id)) { tombs[id] = now; changed = true; }   // deleted
        });
        nextIds.forEach(id => {
            if (tombs[id]) { delete tombs[id]; changed = true; }         // re-added
        });

        if (changed) writeTombs(tombs);
        return tombs;
    }

    /* Union by id. Whichever snapshot is NEWER wins for entries that exist
       on both sides; entries unique to either side are always kept.
       Bias is deliberately toward keeping data over discarding it. */
    function mergeVaults(localArr, cloudArr, cloudIsNewer) {
        const byId = new Map();
        const primary   = cloudIsNewer ? cloudArr : localArr;
        const secondary = cloudIsNewer ? localArr : cloudArr;

        // Secondary first, so primary overwrites on collision.
        secondary.forEach(item => { if (item && item.id) byId.set(item.id, item); });
        primary.forEach(item   => { if (item && item.id) byId.set(item.id, item); });

        // Anything without an id can't be matched -- keep it rather than drop it.
        const orphans = localArr.concat(cloudArr).filter(i => i && !i.id);
        return Array.from(byId.values()).concat(orphans);
    }

    function refreshUI() {
        // cinema-core.js caches the vault in a module-level variable at parse
        // time, so it needs telling that the data underneath it changed.
        try {
            if (typeof cinemaData !== 'undefined') {
                /* eslint-disable no-undef */
                cinemaData = readLocal();
            }
            if (typeof renderVault === 'function') renderVault();
            if (typeof initStats  === 'function') initStats();
        } catch (e) {
            // A page that doesn't have those (like the landing page) is fine.
        }
    }

    /* ---------- 1. THE INTERCEPTOR ---------- */

    const originalSetItem = localStorage.setItem;
    let saveTimer = null;

    localStorage.setItem = function (key, value) {
        // Snapshot the ids BEFORE the write so we can spot what disappeared.
        let prevIds = null;
        if (key === DB_NAME) {
            prevIds = new Set(readLocal().map(m => m && m.id).filter(Boolean));
        }

        let localFailed = false;
        try {
            originalSetItem.apply(this, arguments);   // Save locally first...
        } catch (e) {
            // ...but a full bucket must not stop the cloud save. Losing the
            // local copy is recoverable; losing the only copy is not.
            localFailed = true;
            if (key === DB_NAME) {
                console.warn("⚠️ Local save failed (storage full) -- syncing to cloud anyway.", e);
            } else {
                throw e;   // Not our data; let the caller deal with it.
            }
        }

        if (key === DB_NAME) {
            // Record deletions/re-adds regardless of whether the local write
            // succeeded -- the cloud upload below still needs them.
            try {
                const nextArr = JSON.parse(value);
                if (Array.isArray(nextArr) && prevIds) updateTombstones(prevIds, nextArr);
            } catch (e) { /* unparseable -- saveToCloud will reject it anyway */ }

            if (localFailed) {
                // Skip the meta stamp: local no longer matches what we upload,
                // so leaving it unstamped keeps this device's copy non-authoritative.
                clearTimeout(saveTimer);
                saveTimer = setTimeout(() => saveToCloud(value, new Date().toISOString()), SAVE_DEBOUNCE_MS);
                return;
            }
            const iso = new Date().toISOString();
            stampMeta(iso);
            clearTimeout(saveTimer);
            saveTimer = setTimeout(() => saveToCloud(value, iso), SAVE_DEBOUNCE_MS);
        }
    };

    /* ---------- 2. UPLOAD ---------- */

    async function saveToCloud(jsonString, iso) {
        let data;
        try { data = JSON.parse(jsonString); }
        catch (e) { console.error("❌ Refusing to sync unparseable vault:", e); return; }

        if (!Array.isArray(data)) { console.error("❌ Vault is not an array, skipping sync."); return; }

        // GUARD: never let an empty vault wipe a populated cloud copy.
        // This is what would have destroyed the real list when the hub was
        // opened on an origin whose local storage happened to be empty.
        if (data.length === 0) {
            try {
                const snap = await cloudRef.once('value');
                const existing = (snap.val() && snap.val().vault) || [];
                if (existing.length > 0) {
                    console.warn(`🛑 Blocked: refusing to overwrite ${existing.length} cloud entries with an empty vault.`);
                    return;
                }
            } catch (e) { console.error("Guard check failed, aborting upload:", e); return; }
        }

        const tombs = readTombs();
        try {
            // Tombstones ride along so other devices learn about deletions
            // instead of helpfully re-adding the title from their stale copy.
            await cloudRef.set({ vault: data, lastUpdated: iso, tombstones: tombs });
            const n = Object.keys(tombs).length;
            console.log(`☁️ Synced ${data.length} entries to cloud${n ? ` (+${n} deletions)` : ''}.`);
        } catch (error) {
            console.error("❌ Cloud Sync Failed:", error);
        }
    }

    /* ---------- 3. RECONCILE ON LOAD ---------- */

    async function checkCloudData() {
        let snap;
        try { snap = await cloudRef.once('value'); }
        catch (e) { console.error("☁️ Cloud unreachable, running local-only:", e); return; }

        const cloud     = snap.val() || {};
        const cloudArr  = Array.isArray(cloud.vault) ? cloud.vault : [];
        const localArr  = readLocal();
        const localIso  = readMeta().lastUpdated || null;
        const cloudIso  = cloud.lastUpdated || null;

        // First run on a device that already holds data: push it up.
        if (cloudArr.length === 0 && localArr.length > 0) {
            const iso = new Date().toISOString();
            stampMeta(iso);
            console.log(`📤 Cloud is empty -- uploading ${localArr.length} local entries.`);
            return saveToCloud(JSON.stringify(localArr), iso);
        }

        if (cloudArr.length === 0 && localArr.length === 0) return;

        // A device with no meta stamp has never run this sync, so its copy is
        // the untouched original -- it wins collisions. Only a genuine, newer
        // cloud stamp beats it. (Union means nothing is dropped either way;
        // this only decides which version of a SHARED id survives.)
        const cloudIsNewer = !!(localIso && cloudIso && cloudIso > localIso);
        const united = mergeVaults(localArr, cloudArr, cloudIsNewer);

        // Deletions from EITHER side now outrank a stale copy on the other.
        // Without this the union would cheerfully resurrect anything you
        // deleted on one origin but that still existed on the other.
        const tombs  = mergeTombs(readTombs(), cloud.tombstones);
        const merged = applyTombs(united, tombs);
        writeTombs(tombs);

        const revived = united.length - merged.length;
        if (revived > 0) console.log(`🪦 Honoured ${revived} deletion(s).`);

        // Nothing changed on either side -- leave well alone.
        if (merged.length === localArr.length && merged.length === cloudArr.length) {
            console.log(`✅ Vault in sync (${merged.length} entries).`);
            return;
        }

        console.log(`🔀 Merged: ${localArr.length} local + ${cloudArr.length} cloud → ${merged.length} entries.`);

        const iso = new Date().toISOString();
        const mergedJson = JSON.stringify(merged);

        // ORDER MATTERS: get it to the cloud FIRST. Chrome shares one
        // localStorage bucket across every file:// page, so that bucket can be
        // full even when this vault is small. The local write below is the
        // step most likely to fail -- so it must not be able to block the
        // upload. (It did exactly that once: a QuotaExceededError threw before
        // the upload line and left 373 entries stranded on one laptop.)
        // Always push: we only reach this point because something differed,
        // and a length match no longer implies the CONTENTS match now that
        // tombstones can remove one entry while the merge adds another.
        await saveToCloud(mergedJson, iso);

        try {
            originalSetItem.call(localStorage, DB_NAME, mergedJson);
            stampMeta(iso);
        } catch (e) {
            console.warn("⚠️ Local storage is full -- cloud is saved and safe, " +
                         "but this device keeps its older local copy. " +
                         "Serve the hub over http:// to get a fresh storage bucket.", e);
            return;   // Don't repaint from a vault we failed to write.
        }

        refreshUI();   // Repaint instead of the old location.reload().
    }

    window.addEventListener('load', checkCloudData);
})();
