/* ═══════════════════════════════════════════════════
   PASSHUB — AUTH
   js/passhub-auth.js

   Credentials live in the Realtime Database, not in this
   file, and not as anything readable when they get there.

   ── WHAT THIS REPLACED ────────────────────────────
   PassHub-core.js used to open with:

       name: "jen", passcode: "...", securityAnswer: "..."

   in plain text, in a file the browser hands to anyone who
   opens View Source. The vault behind that gate holds every
   password you own, so it was the one place in LifeHub that
   could least afford it.

   ── WHAT IS ACTUALLY STORED ───────────────────────
   passhub-auth/credentials
     salt        random 32 hex chars, made once at setup
     nameHash    PBKDF2(name)
     passHash    PBKDF2(passcode)
     questions   [ { q: "plain text question", aHash: PBKDF2(answer) } × 20 ]

   Only the question TEXT is readable, because it has to be
   shown to you. Every secret is a one-way hash: the gate
   hashes what you type and compares digests, so nothing
   anywhere can be read back into an answer.

   That also means a forgotten passcode is GONE — there is
   no copy to recover. Re-running setup is the only way back
   in (see js/passhub-setup.js).

   ── WHAT THIS IS NOT ──────────────────────────────
   A gate that runs in the browser can always be walked
   around by someone who opens the console — this stops
   casual reading, it is not access control. What would keep
   the vault itself safe is database security rules, which
   are a separate job from this file.

   ── WHY PBKDF2 AND NOT PLAIN SHA-256 ──────────────
   A bare SHA-256 of a short passcode falls to a wordlist in
   seconds. PBKDF2 at 120k iterations makes each guess cost
   ~100ms, so the stored digest is worth very little to
   anyone who reads it.

   Requires crypto.subtle — https:// or localhost only. Over
   plain http on a LAN address it is undefined, and every
   call here throws with a clear message rather than
   silently failing open.

   Load AFTER passhub-firebase.js:

     <script src="js/vendor/firebase-app-compat.js"></script>
     <script src="js/vendor/firebase-database-compat.js"></script>
     <script src="js/passhub-firebase.js"></script>
     <script src="js/passhub-auth.js"></script>
═══════════════════════════════════════════════════ */

window.PH_AUTH = (function () {
'use strict';

var AUTH_PATH  = 'passhub-auth/credentials';
var MIRROR_KEY = 'PH_AUTH_MIRROR_v1';
var ITERATIONS = 120000;
var QUESTION_N = 20;

/* How long to wait on the network before falling back to the
   local mirror. The gate must never hang on a dead connection. */
var READ_TIMEOUT_MS = 6000;

/* ══════════════════════════════════════════════════
   CRYPTO
══════════════════════════════════════════════════ */
function subtleMessage() {
    return 'Secure hashing is unavailable on this page. Open PassHub over ' +
           'https:// or http://localhost — browsers switch crypto.subtle ' +
           'off on plain http addresses.';
}

function subtle() {
    if (!window.crypto || !window.crypto.subtle) throw new Error(subtleMessage());
    return window.crypto.subtle;
}

function cryptoAvailable() {
    return !!(window.crypto && window.crypto.subtle);
}

function toHex(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i++) out += ('0' + bytes[i].toString(16)).slice(-2);
    return out;
}

function fromHex(hex) {
    var out = new Uint8Array(hex.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
}

function makeSalt() {
    var b = new Uint8Array(16);
    window.crypto.getRandomValues(b);
    return toHex(b);
}

/*
 * tag keeps the three kinds of secret in separate spaces, so the
 * same word used as both a passcode and an answer doesn't produce
 * the same digest and quietly reveal that they match.
 */
function derive(text, saltHex, tag) {
    var enc = new TextEncoder();
    return subtle().importKey(
        'raw', enc.encode(tag + ' ' + text), 'PBKDF2', false, ['deriveBits']
    ).then(function (key) {
        return subtle().deriveBits(
            { name: 'PBKDF2', salt: fromHex(saltHex), iterations: ITERATIONS, hash: 'SHA-256' },
            key, 256
        );
    }).then(function (bits) {
        return toHex(new Uint8Array(bits));
    });
}

/* Names and answers are matched forgivingly — case and stray
   spacing shouldn't be what stands between you and your vault.
   The passcode is matched EXACTLY: silently rewriting a password
   is worse than making you type it correctly. */
function loose(s) {
    return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
}

function hashName(v, salt)   { return derive(loose(v), salt, 'name'); }
function hashPass(v, salt)   { return derive(String(v), salt, 'pass'); }
function hashAnswer(v, salt) { return derive(loose(v), salt, 'answer'); }

/* ══════════════════════════════════════════════════
   READING

   RTDB has no disk cache on the web — reload with no
   network and everything it held is gone. So the record is
   mirrored to localStorage on every successful read, and
   that mirror is what answers when the network doesn't.

   The mirror holds nothing the database doesn't: salt,
   digests and question text. There is no secret in it to
   leak that isn't already one-way.
══════════════════════════════════════════════════ */
var _cache = null;

function readMirror() {
    try {
        var raw = localStorage.getItem(MIRROR_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}

function writeMirror(value) {
    try {
        if (value) localStorage.setItem(MIRROR_KEY, JSON.stringify(value));
        else localStorage.removeItem(MIRROR_KEY);
    } catch (e) { /* quota or private mode — offline just won't work */ }
}

function loadCredentials(force) {
    if (_cache && !force) return Promise.resolve(_cache);

    var db = window.PH_DB;
    if (!db || typeof db.ref !== 'function') {
        _cache = readMirror();
        return Promise.resolve(_cache);
    }

    /* A .once() against a database that can't be reached never
       rejects — it just never settles. The race is what makes
       "offline" a 6 second wait instead of a hang. */
    var live = db.ref(AUTH_PATH).once('value').then(function (snap) {
        return snap.val();
    });

    var timeout = new Promise(function (resolve) {
        setTimeout(function () { resolve(undefined); }, READ_TIMEOUT_MS);
    });

    return Promise.race([live, timeout]).then(function (value) {
        if (value === undefined) {          // timed out — fall back
            _cache = readMirror();
            return _cache;
        }
        _cache = value || null;
        writeMirror(_cache);                 // null clears the mirror too
        return _cache;
    }).catch(function (e) {
        console.warn('[PassHub auth] could not read credentials:', e.message);
        _cache = readMirror();
        return _cache;
    });
}

function isConfigured() {
    return loadCredentials().then(function (c) {
        return !!(c && c.salt && c.passHash && c.questions && c.questions.length);
    });
}

/* Firebase drops empty arrays and renumbers sparse ones, so the
   questions list can come back as an object keyed "0","1",…
   rather than an array. Normalising here means every caller can
   just index it. */
function questionList(c) {
    if (!c || !c.questions) return [];
    if (Array.isArray(c.questions)) return c.questions.filter(Boolean);
    return Object.keys(c.questions)
        .sort(function (a, b) { return Number(a) - Number(b); })
        .map(function (k) { return c.questions[k]; })
        .filter(Boolean);
}

/* ══════════════════════════════════════════════════
   VERIFYING
══════════════════════════════════════════════════ */
function verifyIdentity(name, passcode) {
    return loadCredentials().then(function (c) {
        if (!c) return false;
        return Promise.all([
            hashName(name, c.salt),
            hashPass(passcode, c.salt)
        ]).then(function (r) {
            return r[0] === c.nameHash && r[1] === c.passHash;
        });
    });
}

/* Which of the twenty you get is decided here, per attempt. */
function pickQuestion(excludeIndex) {
    return loadCredentials().then(function (c) {
        var qs = questionList(c);
        if (!qs.length) return null;

        var i = Math.floor(Math.random() * qs.length);
        if (qs.length > 1 && typeof excludeIndex === 'number') {
            while (i === excludeIndex) i = Math.floor(Math.random() * qs.length);
        }
        return { index: i, question: qs[i].q };
    });
}

function verifyAnswer(index, answer) {
    return loadCredentials().then(function (c) {
        var qs = questionList(c);
        if (!qs[index]) return false;
        return hashAnswer(answer, c.salt).then(function (h) {
            return h === qs[index].aHash;
        });
    });
}

/* ══════════════════════════════════════════════════
   WRITING  (setup only)

   pairs — [{ q, a } × QUESTION_N ], plain text in, hashes
   out. Nothing readable is ever handed to the database.
══════════════════════════════════════════════════ */
function saveCredentials(name, passcode, pairs) {
    if (!cryptoAvailable())   return Promise.reject(new Error(subtleMessage()));
    if (!String(name).trim()) return Promise.reject(new Error('Name is required.'));
    if (!String(passcode))    return Promise.reject(new Error('Passcode is required.'));
    if (!Array.isArray(pairs) || pairs.length !== QUESTION_N) {
        return Promise.reject(new Error('Exactly ' + QUESTION_N + ' questions are required.'));
    }

    var db = window.PH_DB;
    if (!db || typeof db.ref !== 'function') {
        return Promise.reject(new Error('No database connection. Setup has to run online.'));
    }

    var salt = makeSalt();

    return Promise.all([hashName(name, salt), hashPass(passcode, salt)])
        .then(function (r) {
            /* Hashed one after another rather than all twenty at once:
               PBKDF2 is deliberately slow, and twenty in parallel locks
               the main thread hard enough to look like a crash. */
            var questions = [];
            return pairs.reduce(function (chain, p) {
                return chain.then(function () {
                    return hashAnswer(p.a, salt).then(function (aHash) {
                        questions.push({ q: String(p.q).trim(), aHash: aHash });
                    });
                });
            }, Promise.resolve()).then(function () {
                return db.ref(AUTH_PATH).set({
                    version:    1,
                    salt:       salt,
                    nameHash:   r[0],
                    passHash:   r[1],
                    questions:  questions,
                    iterations: ITERATIONS,
                    createdAt:  Date.now()
                });
            });
        })
        .then(function () {
            _cache = null;          // force the next read to see the new record
            writeMirror(null);
            return true;
        });
}

/* ══════════════════════════════════════════════════
   CONSOLE HANDLE
   Deliberately present: if a typo during setup locks you
   out, this is the way back in. Anyone who can reach it
   can already edit the page's JavaScript, so it gives
   away nothing that wasn't already given.
══════════════════════════════════════════════════ */
return {
    QUESTION_COUNT:  QUESTION_N,
    cryptoAvailable: cryptoAvailable,
    subtleMessage:   subtleMessage,

    isConfigured:    isConfigured,
    loadCredentials: loadCredentials,
    questionList:    questionList,

    verifyIdentity:  verifyIdentity,
    pickQuestion:    pickQuestion,
    verifyAnswer:    verifyAnswer,
    saveCredentials: saveCredentials,

    reload: function () { return loadCredentials(true); },

    /* Wipes the record so PassHub-setup.html will run again. */
    reset: function () {
        var db = window.PH_DB;
        if (!db) return Promise.reject(new Error('No database connection.'));
        return db.ref(AUTH_PATH).remove().then(function () {
            _cache = null;
            writeMirror(null);
            try { localStorage.removeItem('PH_LOCK'); } catch (e) {}
            console.log('[PassHub auth] Credentials cleared. Open PassHub-setup.html to configure again.');
            return true;
        });
    }
};

})();
