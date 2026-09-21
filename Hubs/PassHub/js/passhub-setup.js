/* ═══════════════════════════════════════════════════
   PASSHUB — SETUP
   js/passhub-setup.js

   Runs PassHub-setup.html: takes a name, a passcode and
   twenty question/answer pairs, hashes every secret in
   the browser, and writes the result to the database.

   ── RUNS ONCE ─────────────────────────────────────
   If a credentials record already exists this page
   refuses and shows the "already configured" state.
   That is the whole enforcement — deliberate, not
   defensive: PH_AUTH.reset() clears the record and lets
   it run again, which is the escape hatch for a passcode
   typed wrong during setup.
═══════════════════════════════════════════════════ */

(function () {
'use strict';

var $ = function (id) { return document.getElementById(id); };

var sheet = $('sheet');
var errEl = $('err');
var grid  = $('qgrid');

var STATES = ['loading', 'form', 'locked', 'nocrypto', 'done'];

function show(which) {
    STATES.forEach(function (s) {
        $('state-' + s).classList.toggle('hidden', s !== which);
    });
}

/* ══════════════════════════════════════════════════
   BUILD THE TWENTY ROWS
══════════════════════════════════════════════════ */
function buildRows() {
    var n = window.PH_AUTH.QUESTION_COUNT;
    var frag = document.createDocumentFragment();

    for (var i = 0; i < n; i++) {
        var row = document.createElement('div');
        row.className = 'qrow';
        row.innerHTML =
            '<div class="qnum">' + (i + 1) + '</div>' +
            '<input type="text" id="q-' + i + '" autocomplete="off" spellcheck="false" ' +
                   'placeholder="Question ' + (i + 1) + '">' +
            '<input type="text" id="a-' + i + '" autocomplete="off" spellcheck="false" ' +
                   'placeholder="Answer">';
        frag.appendChild(row);
    }
    grid.appendChild(frag);
}

/* ══════════════════════════════════════════════════
   GATEKEEPING ON LOAD
══════════════════════════════════════════════════ */
(function init() {
    if (!window.PH_AUTH.cryptoAvailable()) {
        $('nocrypto-msg').textContent =
            'This page is open over plain http, where browsers switch off the ' +
            'crypto API used to hash your passcode. Open PassHub over https:// ' +
            'or http://localhost and reload.';
        show('nocrypto');
        return;
    }

    window.PH_AUTH.isConfigured().then(function (configured) {
        if (configured) { show('locked'); return; }
        buildRows();
        show('form');
        $('inp-name').focus();
    }).catch(function (e) {
        console.warn('[PassHub setup]', e.message);
        /* Could not tell either way. Showing the form is the
           recoverable choice: saving over nothing is harmless, and
           saving over something is caught by the write itself. */
        buildRows();
        show('form');
    });
})();

/* ══════════════════════════════════════════════════
   VALIDATE + SAVE
══════════════════════════════════════════════════ */
function fail(msg) {
    errEl.textContent = msg;
    sheet.classList.add('shake');
    setTimeout(function () { sheet.classList.remove('shake'); }, 400);
}

function markBad(el) {
    el.classList.add('bad');
    el.addEventListener('input', function () { el.classList.remove('bad'); }, { once: true });
}

$('btn-save').addEventListener('click', function () {
    errEl.textContent = '';

    var n     = window.PH_AUTH.QUESTION_COUNT;
    var name  = $('inp-name').value.trim();
    var pass  = $('inp-pass').value;
    var pass2 = $('inp-pass2').value;

    if (!name)           return fail('Give yourself a name to type at the gate.');
    if (!pass)           return fail('A passcode is required.');
    if (pass !== pass2)  return fail('The two passcodes do not match.');
    if (pass.length < 4) return fail('Use at least 4 characters.');

    /* Every one of the twenty must be filled — a blank pair would be
       a question you can never answer, silently eating 1 in 20
       sign-ins with no way to tell why. */
    var pairs = [];
    var firstBad = null;
    for (var i = 0; i < n; i++) {
        var qEl = $('q-' + i), aEl = $('a-' + i);
        var q = qEl.value.trim(), a = aEl.value.trim();
        if (!q) { markBad(qEl); firstBad = firstBad || qEl; }
        if (!a) { markBad(aEl); firstBad = firstBad || aEl; }
        pairs.push({ q: q, a: a });
    }
    if (firstBad) {
        firstBad.focus();
        return fail('Fill in all ' + n + ' questions and their answers.');
    }

    /* Duplicate questions are allowed but pointless; duplicate ANSWERS
       are worth flagging since they quietly weaken the whole set. */
    var answers = pairs.map(function (p) { return p.a.toLowerCase(); });
    var unique  = answers.filter(function (v, k) { return answers.indexOf(v) === k; });
    if (unique.length < answers.length) {
        if (!confirm('Some answers are identical. Save anyway?')) return;
    }

    var btn = $('btn-save');
    btn.textContent = 'Hashing…';
    sheet.classList.add('busy');

    /* Twenty PBKDF2 runs at 120k iterations is a couple of seconds of
       blocked main thread. The repaint below is what stops the button
       from still reading "Save" while it happens. */
    setTimeout(function () {
        window.PH_AUTH.saveCredentials(name, pass, pairs).then(function () {
            window.PH_ACCESS_LOG.record('setup-complete', n + ' questions stored');
            $('sync-note').textContent =
                window.PH_STORE && !window.PH_STORE.isOnline()
                    ? 'Queued — it will reach the database when you are back online.'
                    : 'Synced to the database.';
            show('done');
        }).catch(function (e) {
            sheet.classList.remove('busy');
            btn.textContent = 'Save & lock it in →';
            fail(e.message || 'Could not save.');
        });
    }, 30);
});

/* Enter moves down the form rather than submitting half of it. */
document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    var fields = Array.prototype.slice.call(document.querySelectorAll('#state-form input'));
    var i = fields.indexOf(document.activeElement);
    if (i === -1) return;
    e.preventDefault();
    if (i < fields.length - 1) fields[i + 1].focus();
    else $('btn-save').click();
});

})();
