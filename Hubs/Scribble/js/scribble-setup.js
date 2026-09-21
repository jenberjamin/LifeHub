/* ═══════════════════════════════════════════════════
   SCRIBBLE — SETUP
   js/scribble-setup.js

   Runs Scribble-setup.html: takes a name, a passcode and
   twenty question/answer pairs, hashes every secret in the
   browser, and writes the result to Firestore.

   ── RUNS ONCE ─────────────────────────────────────
   If a credentials record already exists this page
   refuses and shows the "already configured" state.
   That is the whole enforcement — deliberate, not
   defensive: SCRIBBLE_AUTH.reset() clears the record
   and lets it run again, which is the escape hatch for
   a passcode typed wrong during setup.
═══════════════════════════════════════════════════ */

import {
    isConfigured, saveCredentials, cryptoAvailable, QUESTION_COUNT
} from './scribble-auth.js';
import { whenSynced, isOnline } from './scribble-db.js';
import { record } from './scribble-access-log.js';
import { authReady, isSignedIn, signIn, authErrorMessage } from './scribble-session.js';

const $ = id => document.getElementById(id);

const card    = $('card');
const errEl   = $('err');
const grid    = $('qgrid');

function show(which) {
    ['loading', 'session', 'form', 'locked', 'nocrypto', 'done']
        .forEach(s => $('state-' + s).classList.toggle('hidden', s !== which));
}

/* ══════════════════════════════════════════════════
   BUILD THE TWENTY ROWS
══════════════════════════════════════════════════ */
function buildRows() {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < QUESTION_COUNT; i++) {
        const row = document.createElement('div');
        row.className = 'qrow';
        row.innerHTML =
            '<div class="qnum">' + (i + 1) + '</div>' +
            '<input type="text" id="q-' + i + '" autocomplete="off" spellcheck="false" ' +
                   'placeholder="Question ' + (i + 1) + '" />' +
            '<input type="text" id="a-' + i + '" autocomplete="off" spellcheck="false" ' +
                   'placeholder="Answer" />';
        frag.appendChild(row);
    }
    grid.appendChild(frag);
}

/* ══════════════════════════════════════════════════
   GATEKEEPING ON LOAD
══════════════════════════════════════════════════ */
(async function init() {
    if (!cryptoAvailable()) {
        $('nocrypto-msg').textContent =
            'This page is open over plain http, where browsers switch off the ' +
            'crypto API used to hash your passcode. Open Scribble over https:// ' +
            'or http://localhost and reload.';
        show('nocrypto');
        return;
    }

    /* Setup writes to Firestore, so it needs an account session before
       it can do anything — including checking whether setup already ran. */
    await authReady;
    if (!isSignedIn()) { show('session'); $('inp-email').focus(); return; }

    await afterSession();
})();

async function afterSession() {
    let configured = false;
    try {
        configured = await isConfigured();
    } catch (e) {
        console.warn('[Scribble setup]', e.message);
    }

    if (configured) { show('locked'); return; }

    buildRows();
    show('form');
    $('inp-name').focus();
}

/* ── Connect this device ─────────────────────── */
$('btn-connect').addEventListener('click', doConnect);
$('inp-email').addEventListener('keypress', e => { if (e.key === 'Enter') doConnect(); });
$('inp-secret').addEventListener('keypress', e => { if (e.key === 'Enter') doConnect(); });

async function doConnect() {
    const errS = $('err-session');
    errS.textContent = '';
    const email  = $('inp-email').value.trim();
    const secret = $('inp-secret').value;
    if (!email || !secret) { errS.textContent = 'Email and password are both needed.'; return; }

    const btn = $('btn-connect');
    btn.disabled = true; btn.textContent = 'Connecting…';
    try {
        await signIn(email, secret);
        $('inp-secret').value = '';
        show('loading');
        await afterSession();
    } catch (e) {
        errS.textContent = authErrorMessage(e);
        card.classList.add('shake');
        setTimeout(() => card.classList.remove('shake'), 400);
    } finally {
        btn.disabled = false; btn.textContent = 'Connect →';
    }
}

/* ══════════════════════════════════════════════════
   VALIDATE + SAVE
══════════════════════════════════════════════════ */
function fail(msg) {
    errEl.textContent = msg;
    card.classList.add('shake');
    setTimeout(() => card.classList.remove('shake'), 400);
}

function markBad(el) {
    el.classList.add('bad');
    el.addEventListener('input', () => el.classList.remove('bad'), { once: true });
}

$('btn-save').addEventListener('click', async function () {
    errEl.textContent = '';

    const name  = $('inp-name').value.trim();
    const pass  = $('inp-pass').value;
    const pass2 = $('inp-pass2').value;

    if (!name)            return fail('Give yourself a name to type at the gate.');
    if (!pass)            return fail('A passcode is required.');
    if (pass !== pass2)   return fail('The two passcodes do not match.');
    if (pass.length < 4)  return fail('Use at least 4 characters.');

    /* Every one of the twenty must be filled — a blank pair would be a
       question you can never answer, silently eating 1 in 20 sign-ins. */
    const pairs = [];
    let firstBad = null;
    for (let i = 0; i < QUESTION_COUNT; i++) {
        const qEl = $('q-' + i), aEl = $('a-' + i);
        const q = qEl.value.trim(), a = aEl.value.trim();
        if (!q) { markBad(qEl); firstBad = firstBad || qEl; }
        if (!a) { markBad(aEl); firstBad = firstBad || aEl; }
        pairs.push({ q, a });
    }
    if (firstBad) {
        firstBad.focus();
        return fail('Fill in all ' + QUESTION_COUNT + ' questions and their answers.');
    }

    /* Duplicate questions are allowed but pointless; duplicate ANSWERS
       are worth flagging since they quietly weaken the whole set. */
    const answers = pairs.map(p => p.a.toLowerCase());
    if (new Set(answers).size < answers.length) {
        if (!confirm('Some answers are identical. Save anyway?')) return;
    }

    const btn = $('btn-save');
    btn.textContent = 'Hashing…';
    card.classList.add('busy');

    try {
        await saveCredentials(name, pass, pairs);
        record('setup-complete', QUESTION_COUNT + ' questions stored');

        /* The write resolves as soon as it is queued (see scribble-db.js),
           so say plainly whether it has actually reached the server yet. */
        let synced = false;
        if (isOnline()) {
            synced = await Promise.race([
                whenSynced().then(() => true),
                new Promise(r => setTimeout(() => r(false), 5000))
            ]);
        }
        $('sync-note').textContent = synced
            ? 'Synced to Firestore.'
            : 'Stored on this device — it will sync when you are back online.';

        show('done');
    } catch (e) {
        card.classList.remove('busy');
        btn.textContent = 'Save & lock it in →';
        fail(e.message || 'Could not save.');
    }
});

/* Enter moves down the form rather than submitting half of it. */
document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    const fields = Array.from(document.querySelectorAll('#state-form input'));
    const i = fields.indexOf(document.activeElement);
    if (i === -1) return;
    e.preventDefault();
    if (i < fields.length - 1) fields[i + 1].focus();
    else $('btn-save').click();
});
