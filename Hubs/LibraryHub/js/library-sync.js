/* =========================================
   LIFEHUB | LIBRARY SYNC (The Archivist)
   "The Bridge to the Cloud"
   =========================================

   Same shape as CinemaHub's cinema-sync.js, on the same database:
   the Realtime Database on 'lifehub-cae1d', node 'library_vault'.

   WHAT SYNCS
     LifeHub_LibraryVault    reading progress, bookmarks, annotations, notes,
                             status, ratings      -- merged by book id
     LifeHub_Vocabulary      the word bank        -- merged by word, which is
                             what the app itself treats as unique (the entry
                             'id' is Date.now(), so two devices can collide)
     LifeHub_IgnoredShared   shared-shelf blocklist -- plain union, it only
                             ever grows, and a union is already the right
                             answer for a list of "don't bring this back"

   WHAT DOES NOT SYNC, DELIBERATELY
     LifeHub_BookContent     the actual book files, in IndexedDB. shared-library
                             alone is ~100MB of PDFs -- that does not belong in
                             a Realtime Database. Books stay on the device that
                             holds them; your PROGRESS through them follows you.
     LifeHub_ReaderPreferences / LifeHub_ViewMode
                             font, size, brightness, grid-vs-list. Genuinely
                             per-device -- what suits a laptop rarely suits a
                             phone.
   ========================================= */

(function () {
    'use strict';

    const VAULT_KEY  = 'LifeHub_LibraryVault';
    const VOCAB_KEY  = 'LifeHub_Vocabulary';
    const IGNORE_KEY = 'LifeHub_IgnoredShared';
    const META_KEY   = 'LifeHub_LibraryVault_meta';
    const TOMB_KEY   = 'LifeHub_LibraryVault_tombstones';
    const CLOUD_PATH = 'library_vault';
    const SAVE_DEBOUNCE_MS = 1500;
    const TOMB_TTL_DAYS = 90;

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
        console.error("🔥 Firebase SDK missing! Library sync is OFFLINE (local only).");
        return;
    }

    let app;
    try { app = firebase.app(); } catch (e) { app = firebase.initializeApp(firebaseConfig); }
    const cloudRef = app.database().ref(CLOUD_PATH);

    const originalSetItem = localStorage.setItem;

    /* ---------- storage helpers ---------- */

    function readArr(key) {
        try { const v = JSON.parse(localStorage.getItem(key)); return Array.isArray(v) ? v : []; }
        catch (e) { console.error(`${key} unreadable, treating as empty:`, e); return []; }
    }

    function writeRaw(key, value) {
        try { originalSetItem.call(localStorage, key, value); return true; }
        catch (e) { return false; }
    }

    const readMeta  = () => { try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch (e) { return {}; } };
    const stampMeta = (iso) => writeRaw(META_KEY, JSON.stringify({ lastUpdated: iso }));

    /* tombstones: { vault: {id: iso}, vocab: {word: iso} } */
    function readTombs() {
        try {
            const t = JSON.parse(localStorage.getItem(TOMB_KEY)) || {};
            return { vault: t.vault || {}, vocab: t.vocab || {} };
        } catch (e) { return { vault: {}, vocab: {} }; }
    }
    const writeTombs = (t) => writeRaw(TOMB_KEY, JSON.stringify(t));

    /* ---------- merge primitives ---------- */

    /* Tombstones are stored as an OBJECT keyed by book id / word, and Firebase
       forbids . $ # [ ] / in a key. Books added through the Librarian carry
       OpenLibrary ids like "/works/OL16151508W", so deleting one would make
       the whole cloudRef.set() throw and kill every sync after it. Escape the
       key on the way in and look it up the same way -- it never needs decoding,
       only to be stable and legal. */
    const safeKey = (k) => String(k).replace(/[.$#\[\]\/]/g, m => '~' + m.charCodeAt(0).toString(16) + '~');

    function mergeTombMap(a, b) {
        const out = {};
        const cutoff = new Date(Date.now() - TOMB_TTL_DAYS * 864e5).toISOString();
        [a || {}, b || {}].forEach(src => Object.keys(src).forEach(k => {
            const t = src[k];
            if (t < cutoff) return;
            if (!out[k] || t > out[k]) out[k] = t;
        }));
        return out;
    }

    const mergeTombs = (a, b) => ({
        vault: mergeTombMap(a.vault, (b || {}).vault),
        vocab: mergeTombMap(a.vocab, (b || {}).vocab)
    });

    /* Union by `keyField`; the newer snapshot wins where both sides hold it. */
    function mergeLists(localArr, cloudArr, cloudIsNewer, keyField) {
        const byKey = new Map();
        const primary   = cloudIsNewer ? cloudArr : localArr;
        const secondary = cloudIsNewer ? localArr : cloudArr;

        secondary.forEach(i => { if (i && i[keyField] != null) byKey.set(i[keyField], i); });
        primary.forEach(i   => { if (i && i[keyField] != null) byKey.set(i[keyField], i); });

        const orphans = localArr.concat(cloudArr).filter(i => i && i[keyField] == null);
        return Array.from(byKey.values()).concat(orphans);
    }

    /* A tombstone removes an entry unless it was re-added afterwards.
       `stampField` is the entry's own creation time, when it has one. */
    function applyTombs(arr, tombs, keyField, stampField) {
        if (!tombs || Object.keys(tombs).length === 0) return arr;
        return arr.filter(item => {
            const t = item && item[keyField] != null && tombs[safeKey(item[keyField])];
            if (!t) return true;
            const added = stampField && item[stampField];
            return !!(added && added > t);
        });
    }

    function diffTombs(prevKeys, nextArr, tombMap, keyField) {
        const nextKeys = new Set(nextArr.map(i => i && i[keyField]).filter(k => k != null).map(safeKey));
        const now = new Date().toISOString();
        let changed = false;
        prevKeys.forEach(k => { if (!nextKeys.has(k)) { tombMap[k] = now; changed = true; } });
        nextKeys.forEach(k => { if (tombMap[k]) { delete tombMap[k]; changed = true; } });
        return changed;
    }

    // Escaped, to match how diffTombs stores them.
    const keysOf = (arr, f) => new Set(arr.map(i => i && i[f]).filter(k => k != null).map(safeKey));

    /* ---------- UI refresh ---------- */

    function refreshUI() {
        try {
            // library-core.js caches the vault in a module-level variable at
            // parse time; reading-engine.js re-reads storage every call, so it
            // needs nothing here.
            if (typeof libraryData !== 'undefined') {
                /* eslint-disable no-undef */
                libraryData = readArr(VAULT_KEY);
            }
            if (typeof renderLibrary    === 'function') renderLibrary();
            if (typeof updateVaultStats === 'function') updateVaultStats();
            if (typeof loadHubStats     === 'function') loadHubStats();   // landing page
        } catch (e) { /* page simply doesn't have these */ }
    }

    /* ---------- 1. THE INTERCEPTOR ---------- */

    let saveTimer = null;
    const WATCHED = [VAULT_KEY, VOCAB_KEY, IGNORE_KEY];

    localStorage.setItem = function (key, value) {
        let prevVaultKeys = null, prevVocabKeys = null;
        if (key === VAULT_KEY) prevVaultKeys = keysOf(readArr(VAULT_KEY), 'id');
        if (key === VOCAB_KEY) prevVocabKeys = keysOf(readArr(VOCAB_KEY), 'word');

        let localFailed = false;
        try {
            originalSetItem.apply(this, arguments);
        } catch (e) {
            localFailed = true;
            if (WATCHED.indexOf(key) === -1) throw e;   // not ours; caller's problem
            console.warn(`⚠️ Local save of ${key} failed (storage full) -- syncing to cloud anyway.`, e);
        }

        if (WATCHED.indexOf(key) === -1) return;

        // Record deletions/re-adds even if the local write failed.
        try {
            const nextArr = JSON.parse(value);
            if (Array.isArray(nextArr)) {
                const tombs = readTombs();
                let changed = false;
                if (key === VAULT_KEY && prevVaultKeys) changed = diffTombs(prevVaultKeys, nextArr, tombs.vault, 'id')   || changed;
                if (key === VOCAB_KEY && prevVocabKeys) changed = diffTombs(prevVocabKeys, nextArr, tombs.vocab, 'word') || changed;
                if (changed) writeTombs(tombs);
            }
        } catch (e) { /* unparseable -- pushAll will reject it anyway */ }

        const iso = new Date().toISOString();
        if (!localFailed) stampMeta(iso);
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => pushAll(iso), SAVE_DEBOUNCE_MS);
    };

    /* ---------- 2. UPLOAD ---------- */

    async function pushAll(iso) {
        const vault  = readArr(VAULT_KEY);
        const vocab  = readArr(VOCAB_KEY);
        const ignore = readArr(IGNORE_KEY);

        // GUARD: never let an empty vault wipe a populated cloud copy.
        if (vault.length === 0) {
            try {
                const snap = await cloudRef.once('value');
                const existing = (snap.val() && snap.val().vault) || [];
                if (existing.length > 0) {
                    console.warn(`🛑 Blocked: refusing to overwrite ${existing.length} cloud books with an empty vault.`);
                    return;
                }
            } catch (e) { console.error("Guard check failed, aborting upload:", e); return; }
        }

        try {
            await cloudRef.set({
                vault: vault,
                vocabulary: vocab,
                ignoredShared: ignore,
                tombstones: readTombs(),
                lastUpdated: iso
            });
            console.log(`📚 Synced ${vault.length} books, ${vocab.length} words to cloud.`);
        } catch (error) {
            console.error("❌ Library Sync Failed:", error);
        }
    }

    /* ---------- 3. RECONCILE ON LOAD ---------- */

    async function checkCloudData() {
        let snap;
        try { snap = await cloudRef.once('value'); }
        catch (e) { console.error("☁️ Cloud unreachable, running local-only:", e); return; }

        const cloud = snap.val() || {};
        const cloudVault  = Array.isArray(cloud.vault)         ? cloud.vault         : [];
        const cloudVocab  = Array.isArray(cloud.vocabulary)    ? cloud.vocabulary    : [];
        const cloudIgnore = Array.isArray(cloud.ignoredShared) ? cloud.ignoredShared : [];

        const localVault  = readArr(VAULT_KEY);
        const localVocab  = readArr(VOCAB_KEY);
        const localIgnore = readArr(IGNORE_KEY);

        const localIso = readMeta().lastUpdated || null;
        const cloudIso = cloud.lastUpdated || null;

        // First run anywhere: push what this device already holds.
        if (cloudVault.length === 0 && localVault.length > 0) {
            const iso = new Date().toISOString();
            stampMeta(iso);
            console.log(`📤 Cloud is empty -- uploading ${localVault.length} books.`);
            return pushAll(iso);
        }
        if (cloudVault.length === 0 && localVault.length === 0 && cloudVocab.length === 0) return;

        // A device with no meta stamp has never synced, so its copy is the
        // untouched original and wins collisions. Union means nothing is lost
        // either way -- this only picks which version of a shared key survives.
        const cloudIsNewer = !!(localIso && cloudIso && cloudIso > localIso);

        const tombs = mergeTombs(readTombs(), cloud.tombstones);

        const vault = applyTombs(
            mergeLists(localVault, cloudVault, cloudIsNewer, 'id'),
            tombs.vault, 'id', 'dateAdded');

        const vocab = applyTombs(
            mergeLists(localVocab, cloudVocab, cloudIsNewer, 'word'),
            tombs.vocab, 'word', null);

        // The blocklist is itself a record of deletions -- union, never subtract.
        const ignore = Array.from(new Set(localIgnore.concat(cloudIgnore)));

        const unchanged = vault.length  === localVault.length  && vault.length  === cloudVault.length
                       && vocab.length  === localVocab.length  && vocab.length  === cloudVocab.length
                       && ignore.length === localIgnore.length && ignore.length === cloudIgnore.length;

        if (unchanged) {
            console.log(`✅ Library in sync (${vault.length} books, ${vocab.length} words).`);
            return;
        }

        console.log(`🔀 Merged books: ${localVault.length} local + ${cloudVault.length} cloud → ${vault.length}` +
                    ` | words: ${localVocab.length} + ${cloudVocab.length} → ${vocab.length}`);

        const iso = new Date().toISOString();
        writeTombs(tombs);

        // ORDER MATTERS: cloud first. A full localStorage bucket must never be
        // able to block the upload -- that is what stranded CinemaHub's vault.
        await pushAllFrom(vault, vocab, ignore, iso);

        const ok = writeRaw(VAULT_KEY,  JSON.stringify(vault))
                 & writeRaw(VOCAB_KEY,  JSON.stringify(vocab))
                 & writeRaw(IGNORE_KEY, JSON.stringify(ignore));

        if (!ok) {
            console.warn("⚠️ Local storage is full -- cloud is saved and safe, but this device " +
                         "keeps its older local copy. Serve the hub over http:// for a fresh bucket.");
            return;
        }
        stampMeta(iso);
        refreshUI();
    }

    /* Upload an explicit merge result rather than re-reading local storage,
       which may not have been written yet (or at all, if the bucket is full). */
    async function pushAllFrom(vault, vocab, ignore, iso) {
        if (vault.length === 0) return;   // never publish an empty vault here
        try {
            await cloudRef.set({
                vault: vault,
                vocabulary: vocab,
                ignoredShared: ignore,
                tombstones: readTombs(),
                lastUpdated: iso
            });
            console.log(`📚 Synced ${vault.length} books, ${vocab.length} words to cloud.`);
        } catch (error) {
            console.error("❌ Library Sync Failed:", error);
        }
    }

    window.addEventListener('load', checkCloudData);
})();
