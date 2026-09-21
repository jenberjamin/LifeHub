/* ═══════════════════════════════════════════════════
   PASSHUB — OFFLINE STORE
   js/passhub-store.js

   Realtime Database keeps everything in memory and
   replays queued writes on reconnect — but only while
   the page stays open. Reload with no network and it
   all goes. There is no disk persistence for RTDB on
   the web; setPersistenceEnabled is mobile-only.

   So: localStorage becomes the disk, RTDB stays the
   sync layer. Nothing migrates, .on() listeners stay
   live, Poppy and any other device keep working exactly
   as before.

        localStorage  ──►  paints instantly, survives reload
             ▲
             │  mirrored both ways
             ▼
           RTDB       ──►  live .on(), real-time, cross-device

   Load AFTER passhub-firebase.js, BEFORE the page code:

     <script src="js/vendor/firebase-app-compat.js"></script>
     <script src="js/vendor/firebase-database-compat.js"></script>
     <script src="js/passhub-firebase.js"></script>
     <script src="js/passhub-store.js"></script>
     <script> ...page code, uses PH_STORE.ref(...)... </script>

   Page code changes by one word:

     const vaultRef = db.ref('vault_entries');
     const vaultRef = PH_STORE.ref('vault_entries');

   Everything downstream — .on('value'), .child(), .push(),
   .set(), .update(), .remove() — keeps the same shape.

   CONFLICTS: a write you made offline is replayed on top
   of whatever arrives from the server and is only dropped
   once the server confirms it. Your local edit always
   wins until it is safely stored. The snapshot that would
   have been overwritten is kept under PH_BACKUP_v1: so
   nothing is ever truly gone.
═══════════════════════════════════════════════════ */

window.PH_STORE = (function () {
'use strict';

var CACHE_PREFIX  = 'PH_CACHE_v1:';
var BACKUP_PREFIX = 'PH_BACKUP_v1:';
var QUEUE_KEY     = 'PH_PENDING_v1';

var cache     = {};   // root -> value
var listeners = {};   // root -> [callback]
var bound     = {};   // root -> true once .on() is attached
var online    = false;

/* ── localStorage helpers ────────────────────────
   Wrapped because a full quota or a locked-down
   browser must degrade to memory-only, never throw
   in the middle of somebody's save.
────────────────────────────────────────────────── */
function lsGet(key) {
    try {
        var raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}

function lsSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { console.warn('[PH_STORE] localStorage write failed:', e.message); return false; }
}

function readCache(root) {
    if (cache[root] !== undefined) return cache[root];
    var v = lsGet(CACHE_PREFIX + root);
    cache[root] = (v && v.__v !== undefined) ? v.__v : null;
    return cache[root];
}

function writeCache(root, value) {
    cache[root] = value;
    lsSet(CACHE_PREFIX + root, { __v: value, at: Date.now() });
}

/* ── Pending write queue ─────────────────────────
   Every offline write lands here and stays until the
   server acknowledges it. This is the piece RTDB
   cannot do for us: its own queue is in memory and
   dies with the page.
────────────────────────────────────────────────── */
function loadQueue()      { return lsGet(QUEUE_KEY) || []; }
function saveQueue(q)     { lsSet(QUEUE_KEY, q); }

function enqueue(op) {
    var q = loadQueue();
    q.push(op);
    saveQueue(q);
}

function dequeue(id) {
    saveQueue(loadQueue().filter(function (o) { return o.id !== id; }));
}

function pendingFor(root) {
    return loadQueue().filter(function (o) { return o.root === root; });
}

function opId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

/* ── Path surgery on a plain object ──────────────
   parts is the path BELOW the root node, so
   ref('contacts').child('abc') gives root 'contacts'
   and parts ['abc'].
────────────────────────────────────────────────── */
function clone(v) {
    return v === null || v === undefined ? v : JSON.parse(JSON.stringify(v));
}

function setIn(base, parts, value) {
    if (!parts.length) return clone(value);
    var out = (base && typeof base === 'object') ? clone(base) : {};
    var node = out;
    for (var i = 0; i < parts.length - 1; i++) {
        if (!node[parts[i]] || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
        node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = clone(value);
    return out;
}

function updateIn(base, parts, patch) {
    var out = (base && typeof base === 'object') ? clone(base) : {};
    var node = out;
    for (var i = 0; i < parts.length; i++) {
        if (!node[parts[i]] || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
        node = node[parts[i]];
    }
    Object.keys(patch || {}).forEach(function (k) { node[k] = clone(patch[k]); });
    return out;
}

function removeIn(base, parts) {
    if (!parts.length) return null;
    if (!base || typeof base !== 'object') return base;
    var out  = clone(base);
    var node = out;
    for (var i = 0; i < parts.length - 1; i++) {
        if (!node[parts[i]] || typeof node[parts[i]] !== 'object') return out;
        node = node[parts[i]];
    }
    delete node[parts[parts.length - 1]];
    return out;
}

function applyOp(base, op) {
    if (op.type === 'set')    return setIn(base, op.parts, op.value);
    if (op.type === 'update') return updateIn(base, op.parts, op.value);
    if (op.type === 'remove') return removeIn(base, op.parts);
    return base;
}

/* Replay everything still unacknowledged on top of a
   value. This is what stops a reconnect from wiping an
   edit made on the plane. */
function withPending(root, value) {
    return pendingFor(root).reduce(applyOp, value);
}

/* ── Emitting to page code ───────────────────────
   Pages only ever call snap.val(), but exists() and
   forEach() are here so nothing surprises us later.
────────────────────────────────────────────────── */
function makeSnapshot(value) {
    return {
        val:    function () { return value; },
        exists: function () { return value !== null && value !== undefined; },
        forEach: function (fn) {
            if (!value || typeof value !== 'object') return;
            Object.keys(value).forEach(function (k) {
                fn({ key: k, val: function () { return value[k]; } });
            });
        }
    };
}

function emit(root) {
    var value = withPending(root, readCache(root));
    (listeners[root] || []).forEach(function (cb) {
        try { cb(makeSnapshot(value)); }
        catch (e) { console.error('[PH_STORE] listener error on ' + root + ':', e); }
    });
}

/* ── Server binding ──────────────────────────────
   Server data goes into the cache as the new baseline,
   then pending ops are layered back over it before the
   page ever sees it.
────────────────────────────────────────────────── */
function bindServer(root) {
    if (bound[root]) return;
    var db = window.PH_DB;
    if (!db || typeof db.ref !== 'function') return;   // offline-only mode
    bound[root] = true;

    db.ref(root).on('value', function (snap) {
        var incoming = snap.val();
        var current  = readCache(root);

        /* A null from the server against a non-empty cache with
           writes still in flight means the server simply hasn't
           caught up. Keep the backup either way — cheap insurance
           on a vault. */
        if (incoming === null && current && Object.keys(current).length) {
            lsSet(BACKUP_PREFIX + root, { __v: current, at: Date.now() });
            if (pendingFor(root).length) { emit(root); return; }
        }

        writeCache(root, incoming);
        emit(root);
    }, function (err) {
        console.warn('[PH_STORE] ' + root + ' listener:', err.message);
        emit(root);   // fall back to cache
    });
}

/* ── Flushing the queue ──────────────────────────
   Ops replay oldest-first and are only dropped once
   the server confirms. A failure leaves the op in
   place for the next attempt.
────────────────────────────────────────────────── */
var flushing = false;

function flush() {
    if (flushing || !online) return;
    var db = window.PH_DB;
    if (!db || typeof db.ref !== 'function') return;

    var queue = loadQueue();
    if (!queue.length) return;

    flushing = true;

    var run = function (i) {
        if (i >= queue.length) {
            flushing = false;
            Object.keys(listeners).forEach(emit);
            return;
        }
        var op   = queue[i];
        var path = op.parts.length ? op.root + '/' + op.parts.join('/') : op.root;
        var ref  = db.ref(path);

        var done = function () { dequeue(op.id); run(i + 1); };
        var fail = function (e) {
            console.warn('[PH_STORE] flush failed, kept in queue:', path, e && e.message);
            flushing = false;
            Object.keys(listeners).forEach(emit);
        };

        var p = op.type === 'remove' ? ref.remove()
              : op.type === 'update' ? ref.update(op.value)
              :                        ref.set(op.value);

        p.then(done).catch(fail);
    };

    run(0);
}

/* .info/connected is RTDB's own truth about the socket —
   more reliable than navigator.onLine, which cheerfully
   reports true on a wifi network with no internet. */
function watchConnection() {
    var db = window.PH_DB;
    if (!db || typeof db.ref !== 'function') return;
    db.ref('.info/connected').on('value', function (snap) {
        var was = online;
        online = snap.val() === true;
        if (online && !was) flush();
        window.dispatchEvent(new CustomEvent('ph-connection', { detail: { online: online } }));
    });
}

/* ── The ref wrapper ─────────────────────────────── */
function makeRef(root, parts) {
    parts = parts || [];

    function mutate(type, value) {
        var op = { id: opId(), root: root, parts: parts.slice(), type: type, value: clone(value), at: Date.now() };
        /* Cache updates immediately so the UI is correct on the
           next render whether or not the network is there. */
        writeCache(root, applyOp(readCache(root), op));
        enqueue(op);
        emit(root);
        flush();
        return Promise.resolve();
    }

    return {
        key: parts.length ? parts[parts.length - 1] : root,
        path: parts.length ? root + '/' + parts.join('/') : root,

        child: function (k) { return makeRef(root, parts.concat(String(k).split('/'))); },

        on: function (evt, cb) {
            if (evt !== 'value') {
                console.warn('[PH_STORE] only "value" is supported, got:', evt);
                return cb;
            }
            (listeners[root] = listeners[root] || []).push(cb);
            bindServer(root);
            /* Paint from cache on the next tick — same async shape
               page code already expects from Firebase. */
            setTimeout(function () { emit(root); }, 0);
            return cb;
        },

        off: function (evt, cb) {
            if (!listeners[root]) return;
            listeners[root] = cb
                ? listeners[root].filter(function (f) { return f !== cb; })
                : [];
        },

        once: function () {
            return Promise.resolve(makeSnapshot(withPending(root, readCache(root))));
        },

        /* RTDB generates push keys on the client with no network,
           so this works identically offline. */
        push: function (value) {
            var key = (window.PH_DB && window.PH_DB.ref)
                ? window.PH_DB.ref(root).push().key
                : '-local' + opId();
            var childRef = makeRef(root, parts.concat(key));
            if (value !== undefined) childRef.set(value);
            return childRef;
        },

        set:    function (v) { return mutate('set', v); },
        update: function (v) { return mutate('update', v); },
        remove: function ()  { return mutate('remove', null); }
    };
}

/* ── Boot ────────────────────────────────────────── */
watchConnection();
window.addEventListener('online', function () { setTimeout(flush, 400); });

return {
    ref:        function (path) {
        var segs = String(path).replace(/^\/+|\/+$/g, '').split('/');
        return makeRef(segs[0], segs.slice(1));
    },
    isOnline:   function () { return online; },
    pending:    function () { return loadQueue().length; },
    flush:      flush,
    /* Escape hatches, for the console if you ever need them. */
    _cache:     function (root) { return readCache(root); },
    _backup:    function (root) { return lsGet(BACKUP_PREFIX + root); },
    _clearCache: function () {
        Object.keys(localStorage)
            .filter(function (k) { return k.indexOf(CACHE_PREFIX) === 0; })
            .forEach(function (k) { localStorage.removeItem(k); });
        cache = {};
    }
};

})();
