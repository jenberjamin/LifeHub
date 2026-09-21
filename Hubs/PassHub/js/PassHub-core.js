/* ═══════════════════════════════════════════════════
   PASSHUB — GATE LOGIC
   js/PassHub-core.js

   Step 1  name + passcode
   Step 2  ONE question, drawn at random from the twenty
           you set in PassHub-setup.html

   ── WHAT THIS FILE USED TO BE ─────────────────────
   It opened with a USER_CONFIG object holding the name,
   the passcode and the security answer in plain text, and
   compared typed strings against them. Every one of those
   was readable by anyone who opened View Source on the
   page guarding your passwords.

   No credential lives here any more. Everything is
   verified against hashes in the database — see
   js/passhub-auth.js for what is actually stored.

   ── AND WHAT IT STILL ISN'T ───────────────────────
   A gate in the browser stops a person at your desk, not
   a person in your console. What it now also does is
   leave a record: js/passhub-access-log.js writes down
   every attempt, so a run of failures while you were
   asleep is something you can actually find out about.
═══════════════════════════════════════════════════ */

(function () {
'use strict';

var GATE = {
    stateKey: 'PH_LOCK',                       // shared with js/passhub-guard.js
    legacyKey: 'PH_ACCESS_TOKEN',              // still written; see grantAccess()
    redirect: 'PassHub-landing_page.html',
    setup:    'PassHub-setup.html'
};

/* ── Attempt caps ──────────────────────────────
   Both budgets are spent per identity check: get past
   step 1 and you get three rerolls and three answers.
   Running either one dry drops you back to step 1, which
   costs you the passcode again — annoying on purpose, and
   recoverable, which a hard lock would not be.

   Every spend is written to the access log, so a run of
   these showing up when you weren't at the keyboard is
   exactly the thing the history modal is there to show. */
var MAX_REROLLS = 3;
var MAX_ANSWERS = 3;

var rerollsLeft = MAX_REROLLS;
var answersLeft = MAX_ANSWERS;

/* ── Where to land after unlocking ─────────────
   The guard sends you here with ?from= so a deep link
   into a vault page survives the round trip. Checked
   against a pattern, not used raw: ?from= ends up in
   location.href and must never point off this hub. */
function returnTarget() {
    var params = new URLSearchParams(location.search);
    var from   = params.get('from');
    if (!from || !/^PassHub[A-Za-z0-9_-]*\.html$/.test(from)) return GATE.redirect;

    params.delete('from');
    params.delete('lock');
    var rest = params.toString();
    return rest ? from + '?' + rest : from;
}

// ── DOM refs ──────────────────────────────────
var loginCard   = document.getElementById('login-card');
var step1       = document.getElementById('step-1');
var step2       = document.getElementById('step-2');
var verifyBtn   = document.getElementById('verify-btn');
var unlockBtn   = document.getElementById('unlock-btn');
var rerollLink  = document.getElementById('reroll-link');
var inputName   = document.getElementById('entry-name');
var inputPass   = document.getElementById('entry-pass');
var inputAnswer = document.getElementById('entry-answer');
var questionEl  = document.getElementById('question-text');
var errorMsg    = document.getElementById('error-msg');

/* Which of the twenty is on screen right now. */
var currentQ = null;

/* ══════════════════════════════════════════════
   STARTUP
   An unconfigured PassHub sends you to setup —
   otherwise there would be nothing to verify against and
   no way in at all.
══════════════════════════════════════════════ */
(function init() {
    if (!window.PH_AUTH) {
        setError('Auth module missing — check script order.');
        verifyBtn.disabled = true;
        return;
    }

    if (!window.PH_AUTH.cryptoAvailable()) {
        setError('Open PassHub over https:// or localhost.');
        verifyBtn.disabled = true;
        return;
    }

    verifyBtn.disabled = true;
    window.PH_AUTH.isConfigured().then(function (configured) {
        if (!configured) { location.replace(GATE.setup); return; }
        verifyBtn.disabled = false;
        inputName.focus();
    }).catch(function () {
        verifyBtn.disabled = false;
        setError('Could not reach your credentials.');
    });
})();

/* ══════════════════════════════════════════════
   STEP 1 — identity
══════════════════════════════════════════════ */
verifyBtn.addEventListener('click', handleVerify);
inputName.addEventListener('keypress', function (e) { if (e.key === 'Enter') handleVerify(); });
inputPass.addEventListener('keypress', function (e) { if (e.key === 'Enter') handleVerify(); });

function handleVerify() {
    clearError();
    verifyBtn.disabled = true;
    verifyBtn.textContent = 'Checking…';

    /* PBKDF2 is deliberately slow — a couple of hundred milliseconds
       of blocked thread. The repaint is what stops the button from
       still reading "Verify Identity" while it runs. */
    setTimeout(function () {
        window.PH_AUTH.verifyIdentity(inputName.value, inputPass.value)
            .catch(function (e) { setError(e.message); return false; })
            .then(function (ok) {
                verifyBtn.disabled = false;
                verifyBtn.textContent = 'Verify Identity';

                if (!ok) {
                    log('identity-failed', 'Name typed: "' + inputName.value.trim().slice(0, 40) + '"');
                    triggerShake('Identity not recognized.');
                    inputPass.value = '';
                    return;
                }

                /* Fresh budgets for a fresh identity check. */
                rerollsLeft = MAX_REROLLS;
                answersLeft = MAX_ANSWERS;
                goToStep2();
            });
    }, 20);
}

function goToStep2() {
    loadQuestion().then(function () {
        step1.style.opacity = '0';
        setTimeout(function () {
            step1.classList.add('hidden');
            step2.classList.remove('hidden');
            step2.style.opacity = '0';
            setTimeout(function () {
                step2.style.opacity = '1';
                inputAnswer.focus();
            }, 50);
        }, 300);
    });
}

/* Drawn fresh each time, so two visits rarely ask the same thing. */
function loadQuestion(excludePrevious) {
    var avoid = (excludePrevious && currentQ) ? currentQ.index : undefined;
    return window.PH_AUTH.pickQuestion(avoid).then(function (q) {
        currentQ = q;
        questionEl.textContent = q ? q.question : 'No question available.';
        inputAnswer.value = '';
        paintBudgets();
    });
}

/* The counts go on the controls rather than in a help line —
   "three rerolls" is only useful if you can see how many are
   actually left at the moment you're deciding. */
function paintBudgets() {
    if (rerollLink) {
        rerollLink.textContent = '↻ Ask me a different question (' + rerollsLeft + ' left)';
        rerollLink.style.opacity = rerollsLeft <= 0 ? '.35' : '';
        rerollLink.style.cursor  = rerollsLeft <= 0 ? 'default' : 'pointer';
    }
    unlockBtn.textContent = answersLeft < MAX_ANSWERS
        ? 'Unlock Hub (' + answersLeft + ' ' + (answersLeft === 1 ? 'try' : 'tries') + ' left)'
        : 'Unlock Hub';
}

/*
 * Rerolling is allowed on purpose. Twenty answers typed once at setup
 * is twenty chances to have made a typo you cannot see, and being shut
 * out of your own vault by a stray keystroke is a worse outcome than
 * letting whoever already knows the passcode pick an easier question.
 */
if (rerollLink) {
    rerollLink.addEventListener('click', function () {
        if (rerollsLeft <= 0) return;
        rerollsLeft--;
        clearError();
        log('question-rerolled',
            'Skipped: "' + (currentQ ? currentQ.question : '?') + '" — ' +
            rerollsLeft + ' reroll(s) left');

        loadQuestion(true).then(function () {
            if (rerollsLeft <= 0) {
                /* Spending the last one still shows you the question it
                   bought — being cut off mid-reroll would be a bug, not
                   a policy. The NEXT one is what's refused. */
                setError('Last question — no rerolls left.');
            }
            inputAnswer.focus();
        });
    });
}

/* ══════════════════════════════════════════════
   STEP 2 — the answer
══════════════════════════════════════════════ */
unlockBtn.addEventListener('click', handleUnlock);
inputAnswer.addEventListener('keypress', function (e) { if (e.key === 'Enter') handleUnlock(); });

function handleUnlock() {
    if (!currentQ) return;
    clearError();
    unlockBtn.disabled = true;
    unlockBtn.textContent = 'Checking…';

    setTimeout(function () {
        window.PH_AUTH.verifyAnswer(currentQ.index, inputAnswer.value)
            .catch(function (e) { setError(e.message); return false; })
            .then(function (ok) {
                unlockBtn.disabled = false;

                if (!ok) {
                    answersLeft--;
                    log('answer-failed',
                        'Question: "' + currentQ.question + '" — ' + answersLeft + ' try/tries left');
                    inputAnswer.value = '';

                    if (answersLeft <= 0) { lockOut('Three wrong answers.'); return; }

                    paintBudgets();
                    triggerShake('Verification failed. ' + answersLeft +
                                 (answersLeft === 1 ? ' try left.' : ' tries left.'));
                    inputAnswer.focus();
                    return;
                }

                log('unlock', 'Answered: "' + currentQ.question + '"' +
                              (rerollsLeft < MAX_REROLLS
                                 ? ' (after ' + (MAX_REROLLS - rerollsLeft) + ' reroll(s))' : ''));
                grantAccess();
            });
    }, 20);
}

/* Out of budget: back to step 1, both counters untouched until
   the passcode is entered again. */
function lockOut(reason) {
    log('locked-out', reason);
    window.resetGate();
    inputPass.value   = '';
    inputAnswer.value = '';
    triggerShake(reason + ' Enter your passcode again.');
    inputPass.focus();
}

/* ══════════════════════════════════════════════
   IN
══════════════════════════════════════════════ */
function grantAccess() {
    /* localStorage, not sessionStorage: the unlock has to outlive
       this tab, or every new tab re-gates you. What ends a session
       now is the idle rule in js/passhub-guard.js, not the tab
       closing. */
    try {
        localStorage.setItem(GATE.stateKey, JSON.stringify({
            unlocked:   true,
            lastActive: Date.now()
        }));
    } catch (e) {
        console.warn('[PassHub gate] could not persist unlock:', e.message);
    }

    /* The old per-tab token, still written for now. The vault pages
       are being moved onto the guard one at a time, and a page that
       hasn't moved yet still checks for this. Once they all have,
       this line and their checks go together. */
    try { sessionStorage.setItem(GATE.legacyKey, 'authorized_user'); } catch (e) {}

    /* Housekeeping, fired now because nothing is waiting on it. */
    try { window.PH_ACCESS_LOG && window.PH_ACCESS_LOG.trim(); } catch (e) {}

    var target = returnTarget();
    loginCard.style.transform = 'scale(0.95)';
    loginCard.style.opacity   = '0';
    setTimeout(function () { window.location.href = target; }, 500);
}

/* ══════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════ */
window.resetGate = function () {
    step2.classList.add('hidden');
    step1.classList.remove('hidden');
    step1.style.opacity = '1';
    clearError();
};

/* The log must never be what stops you signing in. */
function log(event, detail) {
    try {
        if (window.PH_ACCESS_LOG) window.PH_ACCESS_LOG.record(event, detail);
    } catch (e) { /* ignore */ }
}

function triggerShake(msg) {
    setError(msg);
    loginCard.classList.add('shake');
    setTimeout(function () { loginCard.classList.remove('shake'); }, 400);
}

function setError(msg)  { errorMsg.textContent = msg; }
function clearError()   { errorMsg.textContent = ''; }

})();
