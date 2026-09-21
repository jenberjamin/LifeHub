/* ═══════════════════════════════════════════
   SCRIBBLE — GATE LOGIC
   js/scribble-gate.js

   Step 1  name + passcode
   Step 2  ONE question, drawn at random from the twenty
           you set in Scribble-setup.html

   No credential lives in this file any more. Everything
   is verified against hashes in Firestore — see
   js/scribble-auth.js for what is actually stored.

   Reads go through the Firestore offline cache, so once
   the gate has loaded online even once it keeps working
   with no network.
═══════════════════════════════════════════ */

import {
    isConfigured, verifyIdentity, pickQuestion, verifyAnswer, cryptoAvailable
} from './scribble-auth.js';
import { record } from './scribble-access-log.js';
import {
    authReady, isSignedIn, signIn, authErrorMessage
} from './scribble-session.js';

const GATE = {
    stateKey: "SCRIBBLE_LOCK",       // shared with js/scribble-guard.js
    redirect: "Scribble.html",
    setup:    "Scribble-setup.html"
};

/* ── Attempt caps ──────────────────────────────
   Both budgets are spent per identity check: get past
   step 1 and you get three rerolls and three answers.
   Running either one dry drops you back to step 1, which
   costs you the passcode again — annoying on purpose, and
   recoverable, which a hard lock would not be.

   Every spend is written to the access log, so a run of
   these showing up when you weren't at the keyboard is
   exactly the thing the History button is there to show. */
const MAX_REROLLS = 3;
const MAX_ANSWERS = 3;

let rerollsLeft = MAX_REROLLS;
let answersLeft = MAX_ANSWERS;

/* ── Where to land after unlocking ─────────────
   The guard sends you here with ?from= (and the page's
   own query, so a project link survives the round trip). */
function returnTarget() {
    const params = new URLSearchParams(location.search);
    const from   = params.get('from');
    if (!from || !/^Scribble[A-Za-z0-9-]*\.html$/.test(from)) return GATE.redirect;

    params.delete('from');
    const rest = params.toString();
    return rest ? from + '?' + rest : from;
}

// ── DOM refs ──────────────────────────────────
const card    = document.getElementById('card');
const step0   = document.getElementById('step-0');
const step1   = document.getElementById('step-1');
const step2   = document.getElementById('step-2');
const inpName = document.getElementById('inp-name');
const inpPass = document.getElementById('inp-pass');
const inpAns  = document.getElementById('inp-ans');
const err1    = document.getElementById('err-1');
const err2    = document.getElementById('err-2');
const qText   = document.getElementById('question-text');
const btnVerify = document.getElementById('btn-verify');
const btnUnlock = document.getElementById('btn-unlock');
const btnAnother = document.getElementById('btn-another');

const inpEmail   = document.getElementById('inp-email');
const inpSecret  = document.getElementById('inp-secret');
const err0       = document.getElementById('err-0');
const sessNote   = document.getElementById('sess-note');
const btnConnect = document.getElementById('btn-connect');

/* Which of the twenty is on screen right now. */
let currentQ = null;

/* ══════════════════════════════════════════════
   STARTUP
   An unconfigured Scribble sends you to setup —
   otherwise there would be nothing to verify against
   and no way in at all.
══════════════════════════════════════════════ */
(async function init() {
    if (!cryptoAvailable()) {
        step1.classList.remove('hidden');
        err1.textContent = 'Open Scribble over https:// or localhost.';
        btnVerify.disabled = true;
        return;
    }

    /* Wait for a stored session to be restored from IndexedDB. Offline
       this still settles immediately — it reads local state, it does
       not ask a server. */
    await authReady;

    if (!isSignedIn()) {
        /* No account session, so nothing can be read from Firestore
           yet — including the gate's own credentials. Connect first. */
        if (new URLSearchParams(location.search).get('reason') === 'session') {
            sessNote.textContent = 'Your session ended. Sign in again to reconnect this device.';
        }
        step0.classList.remove('hidden');
        inpEmail.focus();
        return;
    }

    await afterSession();
})();

/* Runs once a Firebase session exists. From here the credentials
   document is readable and the gate proper can start. */
async function afterSession() {
    step0.classList.add('hidden');

    let configured = false;
    try {
        configured = await isConfigured();
    } catch (e) {
        step1.classList.remove('hidden');
        err1.textContent = 'Could not reach your credentials.';
        return;
    }

    if (!configured) { location.replace(GATE.setup); return; }

    step1.classList.remove('hidden');
    inpName.focus();
}

/* ══════════════════════════════════════════════
   STEP 0 — connect this device
══════════════════════════════════════════════ */
btnConnect.addEventListener('click', handleConnect);
inpEmail.addEventListener('keypress', e => { if (e.key === 'Enter') handleConnect(); });
inpSecret.addEventListener('keypress', e => { if (e.key === 'Enter') handleConnect(); });

async function handleConnect() {
    err0.textContent = '';
    const email  = inpEmail.value.trim();
    const secret = inpSecret.value;
    if (!email || !secret) { triggerError(err0, 'Email and password are both needed.'); return; }

    btnConnect.disabled = true;
    btnConnect.textContent = 'Connecting…';
    try {
        await signIn(email, secret);
        inpSecret.value = '';
        await afterSession();
    } catch (e) {
        record('identity-failed', 'Account sign-in failed for "' + email.slice(0, 40) + '"');
        triggerError(err0, authErrorMessage(e));
        inpSecret.value = '';
    } finally {
        btnConnect.disabled = false;
        btnConnect.textContent = 'Connect →';
    }
}

/* The gate used to carry a "Send a reset email" button here. It was
   removed on purpose: a one-click password reset sitting on the
   sign-in screen is a bigger risk than a forgotten password, because
   anyone who reaches this page could fire it at the account's inbox.
   Resetting is now a deliberate act, done from the Firebase console.
   resetPassword() still exists in js/scribble-session.js if it is
   ever wanted somewhere safer. */

// ── Step 1: Verify identity ───────────────────
btnVerify.addEventListener('click', handleVerify);
inpName.addEventListener('keypress', e => { if (e.key === 'Enter') handleVerify(); });
inpPass.addEventListener('keypress', e => { if (e.key === 'Enter') handleVerify(); });

async function handleVerify() {
    err1.textContent = '';
    btnVerify.disabled = true;
    btnVerify.textContent = 'Checking…';

    let ok = false;
    try {
        ok = await verifyIdentity(inpName.value, inpPass.value);
    } catch (e) {
        err1.textContent = e.message;
    }

    btnVerify.disabled = false;
    btnVerify.textContent = 'Verify →';

    if (ok) {
        /* Fresh budgets for a fresh identity check. */
        rerollsLeft = MAX_REROLLS;
        answersLeft = MAX_ANSWERS;
        await goToStep2();
    } else {
        record('identity-failed', 'Name typed: "' + inpName.value.trim().slice(0, 40) + '"');
        triggerError(err1, "Identity not recognized.");
        inpPass.value = '';
    }
}

async function goToStep2() {
    await loadQuestion();

    step1.style.opacity = '0';
    setTimeout(() => {
        step1.classList.add('hidden');
        step2.classList.remove('hidden');
        step2.style.opacity = '0';
        setTimeout(() => {
            step2.style.opacity = '1';
            inpAns.focus();
        }, 40);
    }, 260);
}

/* Drawn fresh each time, so two visits rarely ask the same thing. */
async function loadQuestion(excludePrevious) {
    const avoid = (excludePrevious && currentQ) ? currentQ.index : undefined;
    currentQ = await pickQuestion(avoid);
    qText.textContent = currentQ ? '"' + currentQ.question + '"' : 'No question available.';
    inpAns.value = '';
    paintBudgets();
}

/* The counts are on the buttons rather than in a help line —
   "three rerolls" is only useful if you can see how many are
   actually left at the moment you're deciding. */
function paintBudgets() {
    if (btnAnother) {
        btnAnother.textContent = '↻ Ask me a different question (' + rerollsLeft + ' left)';
        btnAnother.disabled = rerollsLeft <= 0;
        btnAnother.style.opacity = rerollsLeft <= 0 ? '.4' : '';
        btnAnother.style.cursor  = rerollsLeft <= 0 ? 'default' : '';
    }
    btnUnlock.textContent = answersLeft < MAX_ANSWERS
        ? 'Open Workshop → (' + answersLeft + ' ' + (answersLeft === 1 ? 'try' : 'tries') + ' left)'
        : 'Open Workshop →';
}

/* Out of budget: back to step 1, both counters untouched until
   the passcode is entered again. */
function lockOut(reason) {
    record('locked-out', reason);
    resetGate();
    inpPass.value = '';
    inpAns.value  = '';
    triggerError(err1, reason + ' Enter your passcode again.');
    inpPass.focus();
}

// ── Step 2: Security answer ───────────────────
btnUnlock.addEventListener('click', handleUnlock);
inpAns.addEventListener('keypress', e => { if (e.key === 'Enter') handleUnlock(); });

/*
 * Rerolling is allowed on purpose. Twenty answers typed once at setup
 * is twenty chances to have made a typo you cannot see, and being shut
 * out of your own archive by a stray keystroke is a worse outcome
 * than letting whoever already knows the passcode pick an easier
 * question.
 */
if (btnAnother) {
    btnAnother.addEventListener('click', async () => {
        if (rerollsLeft <= 0) return;
        rerollsLeft--;
        err2.textContent = '';
        record('question-rerolled',
               'Skipped: "' + (currentQ ? currentQ.question : '?') + '" — ' +
               rerollsLeft + ' reroll(s) left');

        await loadQuestion(true);
        if (rerollsLeft <= 0) {
            /* Spending the last one still shows you the question it
               bought — being cut off mid-reroll would be a bug, not
               a policy. The NEXT one is what's refused. */
            err2.textContent = 'Last question — no rerolls left.';
        }
        inpAns.focus();
    });
}

async function handleUnlock() {
    if (!currentQ) return;
    err2.textContent = '';
    btnUnlock.disabled = true;
    btnUnlock.textContent = 'Checking…';

    let ok = false;
    try {
        ok = await verifyAnswer(currentQ.index, inpAns.value);
    } catch (e) {
        err2.textContent = e.message;
    }

    btnUnlock.disabled = false;

    if (!ok) {
        answersLeft--;
        record('answer-failed',
               'Question: "' + currentQ.question + '" — ' + answersLeft + ' try/tries left');
        inpAns.value = '';

        if (answersLeft <= 0) {
            lockOut('Three wrong answers.');
            return;
        }
        paintBudgets();
        triggerError(err2, 'Verification failed. ' + answersLeft +
                           (answersLeft === 1 ? ' try left.' : ' tries left.'));
        inpAns.focus();
        return;
    }

    /* ── In. ── */
    record('unlock', 'Answered: "' + currentQ.question + '"' +
                     (rerollsLeft < MAX_REROLLS
                        ? ' (after ' + (MAX_REROLLS - rerollsLeft) + ' reroll(s))' : ''));

    /* localStorage, not sessionStorage: the unlock has to outlive
       this tab, or every new tab re-gates you. The 30-minute idle
       rule in scribble-guard.js is what ends a session now. */
    try {
        localStorage.setItem(GATE.stateKey, JSON.stringify({
            unlocked:   true,
            lastActive: Date.now()
        }));
    } catch (e) {
        console.warn('[Scribble gate] could not persist unlock:', e.message);
    }

    const target = returnTarget();
    card.style.opacity = '0';
    card.style.transform = 'scale(0.96)';
    setTimeout(() => { window.location.href = target; }, 420);
}

// ── Back to step 1 ────────────────────────────
document.getElementById('btn-back').addEventListener('click', resetGate);

function resetGate() {
    step2.style.opacity = '0';
    setTimeout(() => {
        step2.classList.add('hidden');
        step1.classList.remove('hidden');
        step1.style.opacity = '1';
        err2.textContent = '';
    }, 220);
}

// ── Helpers ───────────────────────────────────
function triggerError(el, msg) {
    el.textContent = msg;
    card.classList.add('shake');
    setTimeout(() => card.classList.remove('shake'), 400);
}
