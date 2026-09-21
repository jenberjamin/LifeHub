


// --- LIFEHUB CORE: FLO TRACKER ---

// 1. CONFIGURATION & STARTUP
const floConfig = { 
  apiKey: "AIzaSyABhqON4h0GHjFbZaDT1ysSprmpdczyC6I",
  authDomain: "lifehub-cae1d.firebaseapp.com",
  databaseURL: "https://lifehub-cae1d-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "lifehub-cae1d",
  storageBucket: "lifehub-cae1d.firebasestorage.app",
  messagingSenderId: "471522181748",
  appId: "1:471522181748:web:6861392a45fbbbec8dc721",
  measurementId: "G-2R3WDZNXKG"
};

// 2. SAFE INITIALIZATION (Prevents "App already exists" errors)
let floApp;
try {
    floApp = firebase.app("FloApp");
} catch (e) {
    floApp = firebase.initializeApp(floConfig, "FloApp");
}

// 3. DEFINITIONS
const dbCloud = floApp.database();

// floApp.analytics() used to be here. Firebase Analytics only supports the
// DEFAULT app and does not run over file:// at all — and if it throws, it
// throws at the top level, which stops the browser reading the rest of
// this file. Everything below would silently never run. Nothing in this
// tracker ever used the variable, so it is simply gone.

// --- APP LOGIC STARTS HERE ---
const APP_KEY = "lifehub_flo_v1";

// Nothing may be pushed to the cloud until the cloud has answered once.
// Otherwise a page opened in a fresh browser — where localStorage is
// empty — would push that emptiness over the whole cycle history.
let cloudReady = false;

// "Now", pinned to Philippine time whatever the device clock says.
// The old version formatted the time as an en-US string and re-parsed it,
// which only worked because the machine was already in Manila.
const PH_TZ = "Asia/Manila";
const PH_PARTS = new Intl.DateTimeFormat("en-CA", {
    timeZone: PH_TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
});

function getPHNow() {
    const p = {};
    for (const part of PH_PARTS.formatToParts(new Date())) p[part.type] = part.value;
    // Built from Manila's own calendar fields, so getFullYear/getMonth/
    // getDate below read back as Manila dates on any machine.
    return new Date(+p.year, +p.month - 1, +p.day,
                    +p.hour % 24, +p.minute, +p.second);
}

let currentDate = getPHNow();

// --- STARTUP ENGINE ---
console.log("Flo Engine: Initializing (Compat Mode)...");

/* --- DEEP LINKS FROM THE HOMESCREEN ---------------------------------
   The nudge panel's cards used to land on the tracker's front page,
   leaving the actual question one more click away. A card can now
   append ?open=<what> and arrive ON the thing it was asking about.

   Two rules make this safe, and both matter:

   1. It waits for the first cloud answer. openMoodModal() preloads
      the check-in already logged for this slot; run it against an
      empty local mirror and the modal opens blank, and then SAVES
      that blank over a real entry. cloudReady is the same gate
      syncToCloud() uses to refuse an empty write.

   2. It fires once. dbRef.on('value') fires again on every later
      change, and a modal that reopens itself whenever the database
      moves would be unusable.

   Adding another is one line in DEEP_LINKS plus ?open=<key> on that
   card's path in JS/homescreen/LifeHub-homescreen-nudges.js. */
const DEEP_LINKS = {
    mood: () => window.openMoodModal()
};

let deepLinkDone = false;

function runDeepLink() {
    if (deepLinkDone) return;

    let want = null;
    try {
        want = new URLSearchParams(window.location.search).get('open');
    } catch (e) {
        deepLinkDone = true;
        return;
    }

    deepLinkDone = true;
    if (!want) return;

    const open = DEEP_LINKS[want];
    if (typeof open !== 'function') {
        console.warn("Flo Engine: no deep link called '" + want + "'.");
        return;
    }

    /* Drop the parameter, so a refresh — or the back button — does
       not reopen a modal she has already dealt with. */
    try {
        history.replaceState(null, '', window.location.pathname + window.location.hash);
    } catch (e) { /* file:// can refuse this; harmless either way */ }

    open();
}

document.addEventListener('DOMContentLoaded', () => {
    // 1. CLOUD SYNC LISTENER (The Download)
    const dbRef = dbCloud.ref('flo_tracker');
    
    dbRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            localStorage.setItem(APP_KEY, JSON.stringify(data));
            console.log("Flo Engine: Cloud Synced.");
            cloudReady = true;
            updateUI();
            checkMissedLog();
            runDeepLink();
        } else {
            // An empty cloud is still an answer — it means this really is
            // a first run, not a slow connection. Saving is now safe.
            console.log("Flo Engine: Connected, but cloud is empty.");
            cloudReady = true;
            updateUI();
            runDeepLink();
        }
    });

    // 2. Activate Date Picker
    const input = document.getElementById('datePickerInput');
    if(input) {
        input.valueAsDate = getPHNow();
        // No change listener here: the input already carries
        // onchange="datePicked(this)" in the HTML, and having both meant
        // every date pick ran updateUI() twice.
    }

    // 3. Initial Paint
    updateUI();
});

// --- CLOUD SYNC FUNCTION (The Upload) ---
//
// The cloud is the master copy; this browser holds a mirror of it.
//
// This used to call .set(), which REPLACES the entire flo_tracker node
// with whatever this browser happened to be holding. Two consequences:
//
//   1. Open FLO on the laptop and the phone, and whichever saved last
//      erased everything the other had — not just the changed day, the
//      whole history.
//   2. If localStorage was empty (new browser, cleared site data, or a
//      click that landed before the first cloud reply), it pushed {} and
//      wiped the cycle history outright.
//
// .update() merges instead: keys present here are overwritten, keys only
// in the cloud are left alone. Combined with the cloudReady gate, an
// empty or stale mirror can no longer destroy the master.
function syncToCloud() {
    if (!cloudReady) {
        console.warn("Flo Engine: save skipped — the cloud hasn't answered yet.");
        return;
    }

    const localData = JSON.parse(localStorage.getItem(APP_KEY)) || {};
    if (!localData || !Object.keys(localData).length) {
        console.warn("Flo Engine: refusing to save an empty record.");
        return;
    }

    dbCloud.ref('flo_tracker').update(localData)
        .then(() => console.log("Data saved to Cloud."))
        .catch((err) => console.error("Cloud Error:", err));
}

// MAIN UI UPDATE FUNCTION
function updateUI() {
    // 1. PREPARE DATA (Moved to top)
    const options = { weekday: 'long', month: 'long', day: 'numeric' };
    const dateText = document.getElementById('dateDisplay');
    if(dateText) dateText.innerText = currentDate.toLocaleDateString('en-US', options).toUpperCase();
    
    const logDateText = document.getElementById('logDateDisplay');
    if(logDateText) {
        logDateText.innerHTML = `${currentDate.toLocaleDateString('en-US')} <span class="material-symbols-rounded icon-sm">calendar_today</span>`;
    }

    const db = JSON.parse(localStorage.getItem(APP_KEY)) || {};
    const dateKey = getLocalKey(currentDate);
    const dayData = db[dateKey] || {}; // Load today's data

    // --- NEW: THE STAMPER ---
    // If the master button is ON, we force-stamp this date as Menstrual in the DB.
    // This ensures history remembers Day 4, 5, 6 even after you turn the button off.
    if (db.isPeriodActive) {
        if (!dayData.isMenstrual) {
            dayData.isMenstrual = true;
            // Stamped so cycle-length statistics can leave pack-driven
            // bleeds out. A withdrawal bleed follows the pack's 28-day
            // schedule, not the body's — counting it as a cycle would
            // overwrite a real irregular history with the medication's
            // regularity. See periodStarts({excludePack:true}).
            if (packState(db, currentDate)) dayData.onPack = true;
            db[dateKey] = dayData;
            localStorage.setItem(APP_KEY, JSON.stringify(db));
            // This wrote to the mirror but never to the master, so the very
            // next cloud update erased the stamp — which is exactly what
            // the comment above says must not happen.
            syncToCloud();
        }
    }

    // 2. PHASE LOGIC
    let cycleDay = getCycleDay(currentDate);
    updatePhaseVisuals(cycleDay, dayData); // <--- We now pass dayData!

    // 3. BUTTON STATE
    const mainBtn = document.querySelector('.btn-main-log');
    if(mainBtn) {
        if (db.isPeriodActive) {
            mainBtn.innerHTML = `PERIOD HAS ENDED <span class="material-symbols-rounded drop">water_drop</span>`;
            mainBtn.classList.add('active-period');
            mainBtn.onclick = endPeriod; 
        } else {
            mainBtn.innerHTML = `LOG PERIOD START <span class="material-symbols-rounded drop">water_drop</span>`;
            mainBtn.classList.remove('active-period');
            mainBtn.onclick = openPeriodModal;
        }
    }

    // 4. REST OF UI
    updateButtons(dayData.pill);
    updateStreak();
    updateBubbles();
    updatePackUI(db);
    updateAlexaState();
    updateTodayLogUI(dayData);
}

// --- PHASE BOUNDARIES (ONE DEFINITION) ---
// These lived in three places with two different answers: the screen said
// menstrual was days 1-3, the calendar agreed, and the Alexa sync said 1-5
// with a comment claiming it had been "changed to match the CSS themes".
// It never was — so on days 4 and 5 the screen read FOLLICULAR while Alexa
// said Menstrual. One definition now, used by all three.
const CYCLE_LENGTH = 28;   // fallback only — see getCycleLength()
const PHASE_BOUNDS = { menstrualEnd: 5, follicularEnd: 12, ovulationEnd: 16 };

// Jen's OWN median cycle length, measured from her recorded period
// starts. 28 is only used until there are at least two cycles to
// measure — it is an average of other people, not a fact about her.
function getCycleLength(db) {
    const A = window.FloAnalysis;
    if (!A) return CYCLE_LENGTH;
    // excludePack: withdrawal bleeds are the pack's schedule, not hers.
    const stats = A.cycleStats(A.periodStarts(db || {}, { excludePack: true }));
    return stats.median || CYCLE_LENGTH;
}

// Returns { phase, observed }.
//
// `observed` is the whole point. "Menstrual" is a fact when the period
// button is on or the day carries a stamp — it was logged. Every other
// phase is arithmetic on a cycle length, and with an irregular cycle
// that arithmetic is a guess. The UI says which is which rather than
// presenting both in the same confident type.
function phaseFor(day, opts) {
    const o = opts || {};

    if (o.isPeriodActive || o.isMenstrual) {
        return { phase: "Menstrual", observed: true };
    }
    if (day <= PHASE_BOUNDS.menstrualEnd) {
        return { phase: "Menstrual", observed: false };
    }
    if (day <= PHASE_BOUNDS.follicularEnd) return { phase: "Follicular", observed: false };
    if (day <= PHASE_BOUNDS.ovulationEnd)  return { phase: "Ovulation",  observed: false };
    return { phase: "Luteal", observed: false };
}

// Whole days between two calendar dates, ignoring the time of day.
function daysBetweenDates(a, b) {
    const at = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
    const bt = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((bt - at) / 86400000);
}

// --- HELPER: GET CYCLE DAY (SYNC POINT) ---
function getCycleDay(dateToCheck) {
    const db = JSON.parse(localStorage.getItem(APP_KEY)) || {};

    // No period ever logged, or looking at a date before the first one.
    // This used to return the DAY OF THE MONTH — on September 15th it
    // announced "Day 15 of cycle", which was never a real cycle day.
    if (!db.lastPeriodDate) return 1;

    const lastP = new Date(db.lastPeriodDate);
    if (isNaN(lastP.getTime())) return 1;

    // Calendar days apart, NOT elapsed milliseconds. The old version
    // subtracted two timestamps and floored the result, so a period
    // logged at 8pm meant the cycle day only ticked over at 8pm each
    // evening instead of at midnight — whatever time of day you happened
    // to press the button became the rollover time from then on.
    const diffDays = daysBetweenDates(lastP, dateToCheck);
    if (diffDays < 0) return 1;

    return diffDays + 1;
}

// True once the cycle has run past its expected length without a new
// period being logged.
function isOverdue(day) { return day > CYCLE_LENGTH; }

// ── PILL PACK ────────────────────────────────────────────────────
// On a hormonal pack the schedule belongs to the pack, not the body:
// 21 tablets, then a 7-day break during which a withdrawal bleed is
// expected. Predicting from the pack is legitimate in a way that
// predicting an irregular natural cycle never was.
function getPack(db) {
    return (db && db.pillPack) || null;
}

function packState(db, dateObj) {
    const A = window.FloAnalysis;
    if (!A) return null;
    return A.packPosition(getPack(db), getLocalKey(dateObj || currentDate));
}

window.togglePillPack = function () {
    const db = JSON.parse(localStorage.getItem(APP_KEY)) || {};
    const on = document.getElementById('pillPackToggle').checked;

    db.pillPack = db.pillPack || { activeDays: 21, breakDays: 7 };
    db.pillPack.active = on;

    // Starting a pack with no date set defaults to today — the first
    // tablet is almost always taken the day the switch is flipped.
    if (on && !db.pillPack.startKey) {
        db.pillPack.startKey = getLocalKey(getPHNow());
    }

    localStorage.setItem(APP_KEY, JSON.stringify(db));
    syncToCloud();
    updateUI();
};

window.setPillPackStart = function (value) {
    if (!value) return;
    const db = JSON.parse(localStorage.getItem(APP_KEY)) || {};
    db.pillPack = db.pillPack || { activeDays: 21, breakDays: 7, active: true };
    db.pillPack.startKey = value;
    localStorage.setItem(APP_KEY, JSON.stringify(db));
    syncToCloud();
    updateUI();
};

/* Beginning a pack is an event, and the toggle could not express it.
   Flipping it on only ever set a start date the very first time — every
   pack after that silently inherited the old one, so the tablet number
   on screen was counted from whichever month she first switched it on.
   The 21+7 schedule does roll into the next pack by itself; this is for
   when the real world disagrees with the schedule, which with a pack
   picked up a few days late is most of the time. */
window.startNewPack = function () {
    const db = JSON.parse(localStorage.getItem(APP_KEY)) || {};
    const todayKey = getLocalKey(getPHNow());
    const p = packState(db);

    // Re-anchoring mid-pack throws away the count, so say so first.
    if (p && !p.onBreak && p.tabletNumber > 1) {
        const ok = confirm(
            `Today becomes tablet 1.\n\n` +
            `The current pack is on tablet ${p.tabletNumber} of ${p.activeDays}. ` +
            `Tablets already logged stay in your history — only the ` +
            `schedule moves.`
        );
        if (!ok) return;
    }

    db.pillPack = db.pillPack || { activeDays: 21, breakDays: 7 };
    db.pillPack.active = true;
    db.pillPack.startKey = todayKey;

    localStorage.setItem(APP_KEY, JSON.stringify(db));
    syncToCloud();
    updateUI();
};

/* A combined pill is a clock-bound thing — the pack works on being
   taken at about the same hour, not merely on the right day. Storing
   the hour lets the card say "due at 9:00 PM" instead of leaving her to
   remember, and lets a logged tablet record when it was actually
   swallowed rather than only that it was. */
window.setPillDoseTime = function (value) {
    const db = JSON.parse(localStorage.getItem(APP_KEY)) || {};
    db.pillPack = db.pillPack || { activeDays: 21, breakDays: 7 };
    if (value) db.pillPack.doseTime = value;
    else delete db.pillPack.doseTime;
    localStorage.setItem(APP_KEY, JSON.stringify(db));
    syncToCloud();
    updateUI();
};

/* Pack settings open as a modal, the same as the mood and stats
   panels. The card itself has no room to spare: in the flow the
   settings pushed the Daily Log off the bottom, and as a popover they
   covered the very card they configure. */
function setPackSettings(open) {
    const modal = document.getElementById('pillPackModal');
    const gear = document.getElementById('pillPackGear');
    if (!modal) return;
    modal.classList.toggle('hidden', !open);
    if (gear) gear.setAttribute('aria-expanded', String(!!open));
}

window.togglePackSettings = function () {
    const modal = document.getElementById('pillPackModal');
    if (!modal) return;
    setPackSettings(modal.classList.contains('hidden'));
};
window.closePackSettings = function () { setPackSettings(false); };

// Clicking the dimmed surround closes it; clicking the card does not.
document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'pillPackModal') setPackSettings(false);
});

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    setPackSettings(false);
    const journal = document.getElementById('notesHistoryModal');
    if (journal && !journal.classList.contains('hidden')) {
        journal.classList.add('hidden');
    }
});

/* Clicking the dim surround closes the journal, like the pack sheet. */
document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'notesHistoryModal') {
        e.target.classList.add('hidden');
    }
});

// "21:05" → "9:05 PM". Returns "" for anything unparseable.
function prettyTime(hhmm) {
    if (!hhmm || typeof hhmm !== 'string') return '';
    const [h, m] = hhmm.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return '';
    const ampm = h < 12 ? 'AM' : 'PM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// Minutes between two "HH:MM" stamps, positive when `then` is later.
function minutesApart(from, then) {
    const a = String(from).split(':').map(Number);
    const b = String(then).split(':').map(Number);
    if (a.some(isNaN) || b.some(isNaN)) return null;
    return (b[0] * 60 + b[1]) - (a[0] * 60 + a[1]);
}

// "3h 12m", "45m". Sign is the caller's business.
function spanWords(mins) {
    const t = Math.abs(Math.round(mins));
    const h = Math.floor(t / 60), m = t % 60;
    if (!h) return `${m}m`;
    return m ? `${h}h ${m}m` : `${h}h`;
}

/* Everything about the tablet that someone who cannot see this page
   would need in order to answer a question about it. Published to
   alexa_flo_state alongside the cycle, for Alexa and for Poppy.

   Written from here rather than computed by each reader: the tracker
   is the only place that holds the day records, and a second
   implementation of "which tablet is today" is a second answer. */
function buildPillState(db) {
    const A = window.FloAnalysis;
    const pack = getPack(db);
    const todayKey = getLocalKey(getPHNow());
    const today = (db && db[todayKey]) || {};

    const state = {
        onPack: !!(pack && pack.active && pack.startKey),
        doseTime: (pack && pack.doseTime) || null,
        todayStatus: today.pill || null,
        todayTakenAt: today.pillTime || null,
        streak: computePillStreak(db, getPHNow())
    };

    if (!state.onPack || !A) return state;

    const p = A.packPosition(pack, todayKey);
    if (!p) return state;

    state.packNumber   = p.packNumber;
    state.activeDays   = p.activeDays;
    state.onBreak      = p.onBreak;
    state.tabletNumber = p.tabletNumber;          // null during the break
    state.breakStartsIn = p.onBreak ? 0 : p.breakStartsIn;
    state.nextPackIn   = p.nextPackIn;

    /* How this pack has actually gone, as opposed to how it was
       scheduled. This is the part that makes advice possible. */
    const adh = A.packAdherence(db, pack, todayKey);
    if (adh) {
        state.packStartKey = adh.packStartKey;
        state.tabletsDue     = adh.activeDaysElapsed;
        state.tabletsTaken   = adh.taken;
        state.tabletsSkipped = adh.skipped;
        state.tabletsUnlogged = adh.unlogged;
        state.consecutiveSkipped = adh.currentGap;
    }

    return state;
}

// The pack panel: which tablet today is, and when the break lands.
function updatePackUI(db) {
    const toggle = document.getElementById('pillPackToggle');
    const startInput = document.getElementById('pillPackStart');
    const status = document.getElementById('pillPackStatus');
    // The mobile page loads this same file without the pack panel.
    if (!toggle || !startInput || !status) return;

    const timeInput = document.getElementById('pillDoseTime');
    const startField = document.getElementById('pillStartField');
    const timeField = document.getElementById('pillTimeField');
    const newPackBtn = document.getElementById('btnNewPack');
    const hint = document.getElementById('pillPackHint');

    const pack = getPack(db);
    toggle.checked = !!(pack && pack.active);
    if (pack && pack.startKey) startInput.value = pack.startKey;
    if (timeInput) timeInput.value = (pack && pack.doseTime) || '';

    // Off a pack, the date and the hour are answers to questions nobody
    // asked. Hide the fields rather than the panel, so the toggle that
    // brings them back stays where it was.
    if (startField) startField.style.display = toggle.checked ? '' : 'none';
    if (timeField) timeField.style.display = toggle.checked ? '' : 'none';
    if (newPackBtn) newPackBtn.style.display = toggle.checked ? '' : 'none';

    const p = packState(db);

    if (hint) {
        hint.innerText = !toggle.checked
            ? 'Turn this on while you are taking a pack.'
            : (p
                ? 'The break rolls into the next pack on its own. Use the button only when you actually start one on a different day.'
                : 'Set the date of your first tablet.');
    }

    if (!p) {
        status.innerText = toggle.checked ? 'Set the date of your first tablet.' : '';
        updateDoseLine(db, null);
        return;
    }

    let text = p.onBreak
        ? `Break day ${p.breakDayNumber} of ${p.breakDays} · bleed expected · next pack in ${p.nextPackIn}d`
        : `Tablet ${p.tabletNumber} of ${p.activeDays} · break in ${p.breakStartsIn}d`;

    // What the schedule assumed vs what was actually taken.
    const A = window.FloAnalysis;
    const adh = A ? A.packAdherence(db, pack, getLocalKey(getPHNow())) : null;
    if (adh && (adh.skipped > 0 || adh.unlogged > 0)) {
        text += `\n${adh.taken} of ${adh.activeDaysElapsed} tablets logged`;
        if (adh.skipped) text += ` · ${adh.skipped} skipped`;
        if (adh.currentGap >= 2) text += ` · ${adh.currentGap} in a row right now`;
    }
    status.innerText = text;
    updateDoseLine(db, p);
}

/* The one line about timing. On today it counts toward the next dose;
   on any other day it reports what was recorded, and never pretends a
   past day is still actionable. */
function updateDoseLine(db, p) {
    const line = document.getElementById('pillDoseLine');
    if (!line) return;

    line.classList.remove('is-due');

    const pack = getPack(db);
    const due = pack && pack.doseTime;
    const key = getLocalKey(currentDate);
    const now = getPHNow();
    const isToday = (key === getLocalKey(now));
    const dayData = (db && db[key]) || {};
    const taken = (dayData.pill === 'ontime' || dayData.pill === 'late');

    // A tablet that was logged says when it went down, today or not.
    if (taken && dayData.pillTime) {
        let t = `Taken at ${prettyTime(dayData.pillTime)}`;
        if (due) {
            const off = minutesApart(due, dayData.pillTime);
            if (off !== null && Math.abs(off) >= 15) {
                t += ` · ${spanWords(off)} ${off > 0 ? 'after' : 'before'} ${prettyTime(due)}`;
            }
        }
        line.innerText = t;
        return;
    }

    if (!due || !isToday || !p || p.onBreak || taken) {
        line.innerText = (due && isToday && p && p.onBreak)
            ? 'Break week — no tablet today.'
            : '';
        return;
    }

    // Still owed today: how long until it, or how long since.
    const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:` +
                    `${String(now.getMinutes()).padStart(2, '0')}`;
    const off = minutesApart(due, nowHHMM);
    if (off === null) { line.innerText = ''; return; }

    if (off < 0) {
        line.innerText = `Due at ${prettyTime(due)} · in ${spanWords(off)}`;
    } else {
        line.classList.add('is-due');
        line.innerText = `Due at ${prettyTime(due)} · ${spanWords(off)} ago`;
    }
}

/* ── INTENT: CLINICAL RECORDS LIVE IN PASSHUB ─────────────────────
   Deliberately NOT built here.

   Jen is seeing an OB about this, and wants somewhere to record the
   results down to individual values — progesterone counts, panels,
   prescriptions, visit findings. That belongs in PassHub, alongside
   the other sensitive records, not in the FLO tracker.

   Shape agreed, for whoever builds it:

     visits: date · provider · reason · findings · plan · follow-up
     labs:   date · panel name
             results: [ { name, value, unit, refLow, refHigh } ]
             notes

   Keyed by date so a value like progesterone can be charted across
   visits later. FLO should eventually be able to LINK to a record
   (e.g. "labs drawn on this cycle day") without storing it, so the
   clinical data has exactly one home.

   Boundary that must hold wherever it gets built: the software
   records and displays these numbers. It does not interpret them,
   flag them as normal or abnormal, or infer anything from them.
   It is a record to hand to a doctor, not a second opinion. */

// PHASE SWITCHER
function updatePhaseVisuals(day, dayData = {}) { // <--- Added dayData parameter
    const db = JSON.parse(localStorage.getItem(APP_KEY)) || {};
    const body = document.body;
    const title = document.getElementById('phaseTitle');
    const subtitle = document.getElementById('cycleDaySubtitle');

    body.className = '';

    // ── ON A PACK ─────────────────────────────────────────────────
    // Follicular / Ovulation / Luteal describe a natural cycle. A
    // hormonal pack largely suppresses ovulation, so showing
    // "OVULATION" on tablet 14 would be wrong in a worse way than
    // before — wrong while looking right. The pack gets its own
    // vocabulary instead.
    const pk = packState(db, currentDate);
    if (pk) {
        const bleeding = db.isPeriodActive || dayData.isMenstrual || !!dayData.flow;
        const A = window.FloAnalysis;
        const adh = A ? A.packAdherence(db, getPack(db), getLocalKey(currentDate)) : null;

        // Bleeding during ACTIVE tablets is breakthrough bleeding — a
        // different thing from the expected break-week bleed, and the
        // one actually worth flagging. It was previously indistinguishable:
        // the theme turned red but the header still read "ON PACK".
        const breakthrough = bleeding && !pk.onBreak;

        body.classList.add(pk.onBreak || bleeding ? 'theme-menstrual' : 'theme-follicular');
        body.classList.add('theme-pill');
        if (breakthrough) body.classList.add('is-breakthrough');
        body.classList.add(bleeding ? 'phase-observed' : 'phase-estimated');

        title.innerText = breakthrough ? "BREAKTHROUGH"
                        : pk.onBreak   ? "BREAK WEEK"
                        : "ON PACK";
        title.setAttribute('data-source', bleeding ? 'logged' : 'expected');
        title.title = breakthrough
            ? "Bleeding logged during active tablets. Worth noting for your OB — especially alongside any missed tablets."
            : pk.onBreak
                ? "Withdrawal bleed is expected during the break. Logging it is still what makes it a fact."
                : "Active tablets. Ovulation is normally suppressed on a combined pack.";

        let line = pk.onBreak
            ? `Break day ${pk.breakDayNumber} of ${pk.breakDays}` +
              (bleeding ? " · bleeding logged" : " · bleed expected")
            : `Tablet ${pk.tabletNumber} of ${pk.activeDays} · pack ${pk.packNumber}`;

        // A gap in tablets is the usual explanation for a bleed that
        // looks unexplained against the schedule, so the two are shown
        // together rather than leaving her to connect them.
        if (adh && adh.skipped > 0) {
            line += ` · ${adh.skipped} missed`;
            if (adh.currentGap >= 2) line += ` (${adh.currentGap} in a row)`;
        }
        subtitle.innerText = line;
        return;
    }

    // One shared definition — see phaseFor(). The stamp and the live
    // button still force Menstrual regardless of the day number.
    const result = phaseFor(day, {
        isPeriodActive: db.isPeriodActive,
        isMenstrual: dayData.isMenstrual
    });

    body.classList.add('theme-' + result.phase.toLowerCase());
    body.classList.add(result.observed ? 'phase-observed' : 'phase-estimated');

    // A logged phase and a calculated one should not read with the same
    // confidence. The word "estimated" is the honest part of this UI.
    title.innerText = result.phase.toUpperCase();
    title.setAttribute('data-source', result.observed ? 'logged' : 'estimated');
    title.title = result.observed
        ? "Logged — you recorded your period on this day."
        : "Estimated from your cycle length. Not observed.";

    // Day count, plus what can honestly be said about where it sits.
    const len = getCycleLength(db);
    let text = `Day ${day} of cycle`;

    if (!result.observed) text += " · estimated";

    if (day > len) {
        const over = day - len;
        text = `Day ${day} — ${over} day${over === 1 ? '' : 's'} past your usual ${len}`;
    }
    subtitle.innerText = text;
}

// BUTTON CLICK FUNCTION
window.setPill = function(status) {
    const db = JSON.parse(localStorage.getItem(APP_KEY)) || {};
    const dateKey = getLocalKey(currentDate);
    const dayData = db[dateKey] || {};

    // Clicking the active button again clears the entry.
    const cleared = (dayData.pill === status);
    if (cleared) {
        delete dayData.pill;
        delete dayData.pillTime;
    } else {
        dayData.pill = status;

        /* Stamp the hour it was actually swallowed — but only when the
           tablet is being logged on the day it belongs to. Back-filling
           Tuesday on Thursday would otherwise record Thursday's clock
           as Tuesday's dose time, which is worse than no time at all. */
        const now = getPHNow();
        if ((status === 'ontime' || status === 'late') &&
            dateKey === getLocalKey(now)) {
            dayData.pillTime = `${String(now.getHours()).padStart(2, '0')}:` +
                               `${String(now.getMinutes()).padStart(2, '0')}`;
        } else {
            delete dayData.pillTime;
        }
    }

    db[dateKey] = dayData;
    localStorage.setItem(APP_KEY, JSON.stringify(db));

    // Un-clicking used to still run the payout for the status just
    // removed. Passing null instead lets handleAltheaPayout value the day
    // at zero, which refunds whatever it had already paid for it.
    handleAltheaPayout(cleared ? null : status);

    syncToCloud(); // <--- SYNC (after the payout, so it saves too)
    updateUI();
}

// VISUAL UPDATES
function updateButtons(status) {
    ['btnPillOntime', 'btnPillLate', 'btnPillStock', 'btnPillMissed'].forEach(id => {
        const btn = document.getElementById(id);
        if(btn) {
            btn.className = 'btn-pill'; 
            if(id.includes('Ontime')) btn.innerText = "ON TIME";
            if(id.includes('Late')) btn.innerText = "LATE";
            if(id.includes('Stock')) btn.innerText = "NO STOCK";
            if(id.includes('Missed')) btn.innerText = "MISSED";
        }
    });

    if(status) {
        const map = {
            'ontime': { id: 'btnPillOntime', class: 'active-success', label: 'ON TIME ✓' },
            'late':   { id: 'btnPillLate',   class: 'active-warn',    label: 'LATE ✓' },
            'nostock':{ id: 'btnPillStock',  class: 'active-danger',  label: 'NO STOCK' },
            'missed': { id: 'btnPillMissed', class: 'active-danger',  label: 'MISSED' }
        };
        const config = map[status];
        if(config) {
            const btn = document.getElementById(config.id);
            if(btn) {
                btn.classList.add(config.class);
                if(config.label) btn.innerText = config.label;
            }
        }
    }
}

function updateStreak() {
    const db = JSON.parse(localStorage.getItem(APP_KEY)) || {};
    // Same counter the bonuses use — see computePillStreak().
    const streak = computePillStreak(db, getPHNow());

    const el = document.getElementById('pillStreak');
    if (el) el.innerText = streak + (streak === 1 ? " Day" : " Days");
}

function updateBubbles() {
    const bubbles = document.querySelectorAll('.week-bubbles .bubble');
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
    const db = JSON.parse(localStorage.getItem(APP_KEY)) || {};

    bubbles.forEach((b, i) => {
        const d = new Date(startOfWeek);
        d.setDate(startOfWeek.getDate() + i);
        
        const key = getLocalKey(d);
        const data = db[key] || {};

        b.className = 'bubble'; 
        b.style = ""; 
        b.innerText = ["S","M","T","W","T","F","S"][i];

        if(data.pill === 'ontime' || data.pill === 'late') b.classList.add('status-pink');
        else if(data.pill === 'missed' || data.pill === 'nostock') b.classList.add('status-burgundy');
        else if(i===0 || i===6) b.classList.add('default-weekend');
        else b.classList.add('default-weekday');

        if(key === getLocalKey(currentDate)) {
            b.classList.add('selected-day-indicator');
        }
    });
}

// --- CALENDAR FIXES ---
window.openCalendar = function() {
    const input = document.getElementById('datePickerInput');
    if (!input) return;

    // The input is deliberately invisible (opacity:0, pointer-events:none)
    // so only the styled date text shows. The old fallback called
    // input.click(), which does nothing on a pointer-events:none element —
    // so if showPicker() threw, nothing opened at all. Pointer events are
    // re-enabled for the moment of the click and put back afterwards.
    const restore = input.style.pointerEvents;
    input.style.pointerEvents = 'auto';

    try {
        if (typeof input.showPicker === 'function') input.showPicker();
        else input.click();
    } catch (error) {
        try { input.click(); } catch (e) { /* nothing more to try */ }
    } finally {
        setTimeout(() => { input.style.pointerEvents = restore; }, 0);
    }
}

window.datePicked = function(input) {
    if(input.value) {
        const parts = input.value.split('-');
        currentDate = new Date(parts[0], parts[1] - 1, parts[2]);
        updateUI();
    }
}

// --- LOGIC: AUTO-MARK MISSED ---
function checkMissedLog() {
    const db = JSON.parse(localStorage.getItem(APP_KEY)) || {};

    // Nothing to be missed before tracking started. Without this, the very
    // first time the app was ever opened it marked yesterday as a missed
    // pill — a day that predates the tracker existing.
    if (!db.lastPeriodDate) return;

    const today = getPHNow();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const key = getLocalKey(yesterday);

    // Don't reach back before the cycle began either.
    const startKey = getLocalKey(new Date(db.lastPeriodDate));
    if (key < startKey) return;

    const dayData = db[key] || {};

    if (!dayData.pill) {
        dayData.pill = 'missed';
        db[key] = dayData;
        localStorage.setItem(APP_KEY, JSON.stringify(db));
        syncToCloud(); // <--- SYNC
        console.log(`Flo Engine: Auto-marked ${key} as MISSED`);
    }
}

// --- CYCLE ENGINE ---
window.openPeriodModal = function() {
    const db = JSON.parse(localStorage.getItem(APP_KEY)) || {};
    const modal = document.getElementById('periodModal');
    const title = document.getElementById('modalTitle');
    const msg = document.getElementById('modalMessage');
    
    modal.classList.remove('hidden');

    // ── ON A PACK ─────────────────────────────────────────────────
    // The "you are N days later than expected" wording below is built
    // on a natural 28-day cycle and means nothing here. On a pack the
    // answer to "should I log this?" is always yes — the stamp is the
    // only record that bleeding actually happened, as opposed to having
    // been expected — so the modal says what the bleed IS instead of
    // second-guessing its timing.
    const pk = packState(db, currentDate);
    if (pk) {
        if (pk.onBreak) {
            title.innerText = "Break-week bleed";
            msg.innerText = `Day ${pk.breakDayNumber} of your ${pk.breakDays}-day break — a withdrawal bleed is expected here. ` +
                            `Logging it records that it actually happened. It won't be counted as one of your natural cycles.`;
        } else {
            const A = window.FloAnalysis;
            const adh = A ? A.packAdherence(db, getPack(db), getLocalKey(currentDate)) : null;
            const gap = adh && adh.skipped
                ? ` You've skipped ${adh.skipped} tablet${adh.skipped === 1 ? '' : 's'} this pack` +
                  (adh.currentGap >= 2 ? `, ${adh.currentGap} in a row` : '') + '.'
                : '';
            title.innerText = "Bleeding on active tablets";
            msg.innerText = `You're on tablet ${pk.tabletNumber} of ${pk.activeDays}, so this is breakthrough bleeding rather than your break-week bleed.${gap} ` +
                            `Log it — it's worth having on record for your OB. It won't be counted as one of your natural cycles.`;
        }
        return;
    }

    if (!db.lastPeriodDate) {
        title.innerText = "Welcome, Jen";
        msg.innerText = "Is today the first day of your period? This will start your cycle tracking.";
        return;
    }

    const lastDate = new Date(db.lastPeriodDate);
    const expectedDate = new Date(lastDate);
    expectedDate.setDate(lastDate.getDate() + 28); 
    
    const diffTime = currentDate - expectedDate; 
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (Math.abs(diffDays) <= 3) {
        title.innerText = "Perfect Timing!";
        msg.innerText = "Your cycle is right on track. Ready to log Day 1?";
    } else if (diffDays > 0) {
        title.innerText = "Cycle Update";
        msg.innerText = `You are ${diffDays} days later than expected. We will adjust the cycle count.`;
    } else {
        title.innerText = "Cycle Update";
        msg.innerText = `You are ${Math.abs(diffDays)} days early. We will reset to Day 1.`;
    }
}

window.confirmPeriodStart = function() {
    const db = JSON.parse(localStorage.getItem(APP_KEY)) || {};
    db.lastPeriodDate = currentDate.toISOString();
    db.isPeriodActive = true;
    // db.altheaStreak = 0 used to live here. The streak is now derived
    // from the day records by computePillStreak(), so zeroing the stored
    // field did nothing except leave a wrong number sitting in the data
    // until the next payout recomputed it.
    localStorage.setItem(APP_KEY, JSON.stringify(db));
    syncToCloud(); 
    closeModal();
    updateUI(); 
}

window.endPeriod = function() {
    const db = JSON.parse(localStorage.getItem(APP_KEY)) || {};
    db.isPeriodActive = false;
    localStorage.setItem(APP_KEY, JSON.stringify(db));
    syncToCloud(); // <--- SYNC
    updateUI(); 
}

window.closeModal = function() {
    document.getElementById('periodModal').classList.add('hidden');
}

// --- MOOD TRACKER ENGINE ---
let activeMoods = new Set(); // Use a Set to handle multiple unique moods

/* Which of the three check-ins we are in, for TODAY only. Browsing a
   past day has no "now" in it, so slot logic stays out of the way and
   the modal behaves as it always did. */
function currentMoodSlot() {
    const V = window.LIFEHUB_FLO_VOCAB;
    if (!V) return null;
    const now = getPHNow();
    if (getLocalKey(currentDate) !== getLocalKey(now)) return null;
    return V.moodSlotAt(now.getHours());
}

window.openMoodModal = function() {
    /* Preload THIS CHECK-IN, not the whole day.

       Mood is asked three times, so the question is "how are you
       now", and the answer should not arrive with breakfast's mood
       already ticked. But it must not start blank either: reopening
       the afternoon's check-in to add a second feeling used to wipe
       the first, because saving replaced the day outright. */
    const db = JSON.parse(localStorage.getItem(APP_KEY)) || {};
    const dayData = db[getLocalKey(currentDate)] || {};
    const slot = currentMoodSlot();

    let preload = [];
    if (slot) {
        const stored = (dayData.moodSlots || {})[slot.id];
        preload = Array.isArray(stored) ? stored : (stored ? [stored] : []);
    } else {
        /* A past day, or the small hours: fall back to the day's
           whole mood list, which is what this modal always showed. */
        preload = Array.isArray(dayData.mood) ? dayData.mood
                : (dayData.mood ? String(dayData.mood).split(', ') : []);
    }

    activeMoods = new Set(preload.filter(Boolean));

    document.querySelectorAll('.mood-item').forEach(el => {
        /* The label sits in the second span; the first is the icon. */
        const name = (el.querySelector('span:last-child') || el).textContent.trim();
        el.classList.toggle('selected', activeMoods.has(name));
    });

    /* Say which check-in this is, so three prompts a day do not feel
       like the same question asked over and over. */
    const heading = document.querySelector('#moodModal .modal-header-text');
    if (heading) {
        heading.textContent = slot ? slot.ask : 'How are you feeling today, Jen?';
    }

    document.getElementById('moodModal').classList.remove('hidden');
}

window.closeMoodModal = function() {
    document.getElementById('moodModal').classList.add('hidden');
}

window.selectMood = function(element, moodName) {
    // Toggle Logic: If it's there, remove it. If not, add it.
    if (activeMoods.has(moodName)) {
        activeMoods.delete(moodName);
        element.classList.remove('selected');
    } else {
        activeMoods.add(moodName);
        element.classList.add('selected');
    }
}

window.saveMoodEntry = function() {
    if(activeMoods.size === 0) {
        closeMoodModal();
        return;
    }
    const db = JSON.parse(localStorage.getItem(APP_KEY)) || {};
    const dateKey = getLocalKey(currentDate);
    const dayData = db[dateKey] || {};
    
    // 1. SAVE THE DATA
    const moodList = Array.from(activeMoods);
    const V = window.LIFEHUB_FLO_VOCAB;
    const slot = currentMoodSlot();

    if (V && slot) {
        /* Write into this check-in, and keep `mood` as the union of
           all three. Everything that already reads `mood` — the
           calendar, the statistics, the journal chips — carries on
           working without knowing slots exist. */
        dayData.moodSlots = Object.assign({}, dayData.moodSlots);
        dayData.moodSlots[slot.id] = moodList;
        dayData.mood = V.moodUnion(dayData.moodSlots);
    } else {
        dayData.mood = moodList;
    }

    // 2. SMART PAYOUT — PER CHECK-IN, NOT PER DAY
    //
    // Mood is asked three times, so paying once said the afternoon and
    // the evening were not worth answering. The money attaches to the
    // SLOT: 250 for the day's first check-in, 100 for each after.
    // A slot cannot pay twice however often she reopens it, and there
    // are only ever three, so there is nothing here to farm.
    if (!dayData.rewards) dayData.rewards = {}; // Ensure container exists

    if (V && slot) {
        const done = V.moodSlotsDone(dayData);
        const settled = V.settleMoodSlots(dayData.moodSlotsPaidFor, done);

        if (settled.amount > 0) {
            const which = settled.charged.join(', ');
            payPrestige(settled.amount, `Mood Log (${which}): ${moodList.join(', ')}`);
            dayData.moodSlotsPaidFor = settled.paidFor;

            // The day-count streak advances on the day's FIRST check-in
            // only — it counts days logged, not check-ins.
            const firstOfDay = settled.paidFor.length === settled.charged.length;
            if (firstOfDay) {
                dayData.rewards['MOOD'] = true;
                db.moodStreak = V.nextCount(db.moodStreak);
                checkGenericStreak('MOOD', db.moodStreak);
            }
        }

    } else if (!dayData.rewards['MOOD']) {
        // A past day, or the small hours: no slot to attribute it to,
        // so it falls back to the old once-a-day rate.
        payPrestige(250, `Mood Log: ${moodList.join(', ')}`);
        dayData.rewards['MOOD'] = true;
        db.moodStreak = (db.moodStreak || 0) + 1;
        if (db.moodStreak > 30) db.moodStreak = 1;
        checkGenericStreak('MOOD', db.moodStreak);
    }

    // 3. SINGLE SAVE & SYNC
    db[dateKey] = dayData;
    localStorage.setItem(APP_KEY, JSON.stringify(db));
    syncToCloud(); 
    
    updateTodayLogUI(dayData); 
    closeMoodModal();
}

function updateTodayLogUI(dayData) {
    const rows = document.querySelectorAll('.log-row');
    rows.forEach(row => {
        const key = row.querySelector('.key').innerText;
        const val = row.querySelector('.val');
        
        // An unlogged day used to display "CALM", "NORMAL" and "NORMAL"
        // for mood, flow and discharge — indistinguishable from having
        // actually logged those values. On a tracker where the gaps are
        // part of the data, that matters. Blank days now read "NONE",
        // like symptoms and medicine always did.
        // asList() throughout: these are arrays from the modals, but a
        // day written from elsewhere can hold a comma string, and
        // calling .join on one throws.
        if(key.includes('MOOD')) {
            const moods = asList(dayData.mood);
            val.innerText = moods.length ? moods.join(', ') : "NONE";
            // The accent was added but never removed, so it stuck to days
            // with nothing on them.
            val.classList.toggle('accent', moods.length > 0);
        }
        if(key.includes('FLOW')) {
            val.innerText = dayData.flow || "NONE";
            val.classList.toggle('accent', !!dayData.flow);
        }
        if(key.includes('ACTIVITY')) {
            val.innerText = dayData.activity || "PREFER NOT TO SAY"; 
            if(dayData.activity) val.classList.add('accent');
            else val.classList.remove('accent');
        }
        if(key.includes('SYMPTOMS')) {
            const list = asList(dayData.symptoms);
            val.innerText = list.length ? list.join(', ') : "NONE";
            val.classList.toggle('accent', list.length > 0);
        }
        if(key.includes('MEDICINE')) {
            const list = asList(dayData.medicine);
            val.innerText = list.length ? list.join(', ') : "NONE";
            val.classList.toggle('accent', list.length > 0);
        }
        if(key.includes('BASAL TEMP')) {
            if (dayData.temp) {
                val.innerText = dayData.temp;
                val.classList.add('accent');
            } else {
                val.innerText = "NONE";
                val.classList.remove('accent');
            }
        }
        if(key.includes('DISCHARGE')) {
            if (dayData.discharge) {
                val.innerText = dayData.discharge;
                val.classList.add('accent');
            } else {
                val.innerText = "NONE";
                val.classList.remove('accent');
            }
        }
        if(key.includes('NOTES')) {
            if (dayData.notes && dayData.notes.trim().length > 0) {
                val.innerText = "YES";
                val.classList.add('accent');
            } else {
                val.innerText = "NO";
                val.classList.remove('accent');
            }
        }
    });
}

// --- FLOW TRACKER ENGINE ---
let tempSelectedFlow = "";
window.openFlowModal = function() {
    document.getElementById('flowModal').classList.remove('hidden');
    tempSelectedFlow = ""; 
    document.querySelectorAll('.flow-item').forEach(el => el.classList.remove('selected'));
}
window.closeFlowModal = function() { document.getElementById('flowModal').classList.add('hidden'); }
window.selectFlow = function(element, flowName) {
    document.querySelectorAll('.flow-item').forEach(el => el.classList.remove('selected'));
    element.classList.add('selected');
    tempSelectedFlow = flowName;
}
window.saveFlowEntry = function() {
    if(!tempSelectedFlow) { closeFlowModal(); return; }
    const db = JSON.parse(localStorage.getItem(APP_KEY)) || {};
    const dateKey = getLocalKey(currentDate);
    const dayData = db[dateKey] || {};
    dayData.flow = tempSelectedFlow;
    db[dateKey] = dayData;
    localStorage.setItem(APP_KEY, JSON.stringify(db));
    syncToCloud(); // <--- SYNC
    updateTodayLogUI(dayData);
    // Paid once a day. Without this guard, re-saving the flow paid 300
    // again every time — and correcting a flow you mis-tapped is a
    // normal thing to do, so it paid for being wrong. The Alexa path
    // for the same field has always been guarded; this one was not.
    if (!isPaidToday('FLOW')) {
        payPrestige(300, "Daily Log: Flow info");
    }
    closeFlowModal();
}

// --- ACTIVITY TRACKER ENGINE ---
let tempSelectedActivity = "";
window.openActivityModal = function() {
    document.getElementById('activityModal').classList.remove('hidden');
    tempSelectedActivity = ""; 
    document.querySelectorAll('.activity-item').forEach(el => el.classList.remove('selected'));
}
window.closeActivityModal = function() { document.getElementById('activityModal').classList.add('hidden'); }
window.selectActivity = function(element, actName) {
    document.querySelectorAll('.activity-item').forEach(el => el.classList.remove('selected'));
    element.classList.add('selected');
    tempSelectedActivity = actName;
}

window.saveActivityEntry = function() {
    if(!tempSelectedActivity) { closeActivityModal(); return; }
    
    const db = JSON.parse(localStorage.getItem(APP_KEY)) || {};
    const dateKey = getLocalKey(currentDate);
    const dayData = db[dateKey] || {};
    
    // 1. SAVE DATA
    dayData.activity = tempSelectedActivity;
    
    // 2. SMART PAYOUT
    if (!dayData.rewards) dayData.rewards = {};
    
    if (!dayData.rewards['ACTIVITY']) {
        // Detailed Receipt
        const desc = `Activity Log: ${tempSelectedActivity}`; 
        payPrestige(200, desc);
        
        dayData.rewards['ACTIVITY'] = true;
        
        // Handle Streak
        db.activityStreak = (db.activityStreak || 0) + 1;
        if(db.activityStreak > 30) db.activityStreak = 1; 
        checkGenericStreak('ACTIVITY', db.activityStreak);
    }
    
    // 3. SINGLE SAVE & SYNC
    db[dateKey] = dayData;
    localStorage.setItem(APP_KEY, JSON.stringify(db));
    syncToCloud(); 
    
    updateTodayLogUI(dayData);
    closeActivityModal();
}

// --- SYMPTOMS ENGINE (MULTI-SELECT) ---
let activeSymptoms = new Set(); 
window.openSymptomsModal = function() {
    /* Load what is already down for the day before showing the modal.

       Without this, the list you save REPLACES the day's symptoms
       rather than adding to them — so logging a headache at breakfast
       and cramps after lunch left only the cramps, and the headache
       was gone with no sign it had ever been there. It only looked
       like it worked within a single page session, because the Set
       below happened to still be populated. */
    const db = JSON.parse(localStorage.getItem(APP_KEY)) || {};
    const dayData = db[getLocalKey(currentDate)] || {};

    const already = Array.isArray(dayData.symptoms) ? dayData.symptoms
                  : (dayData.symptoms ? String(dayData.symptoms).split(', ') : []);

    activeSymptoms = new Set(already);

    const master = document.querySelector('.symptom-master-toggle');
    if (master) master.classList.toggle('selected',
        activeSymptoms.has('EVERYTHING IS FINE'));

    document.querySelectorAll('.s-item').forEach(item => {
        item.classList.toggle('selected',
            activeSymptoms.has(item.textContent.trim()));
    });

    /* The free-text box starts empty every time: whatever was typed
       into it last is already in the list above, and leaving it there
       would add a duplicate on the next save. */
    const specify = document.getElementById('symptomSpecify');
    if (specify) specify.value = '';

    document.getElementById('symptomsModal').classList.remove('hidden');
}
window.closeSymptomsModal = function() { document.getElementById('symptomsModal').classList.add('hidden'); }

window.toggleSymptom = function(el, name) {
    const master = document.querySelector('.symptom-master-toggle');
    const allItems = document.querySelectorAll('.s-item');

    if (name === 'EVERYTHING IS FINE') {
        activeSymptoms.clear();
        allItems.forEach(item => item.classList.remove('selected'));
        if (activeSymptoms.has('EVERYTHING IS FINE')) {
            activeSymptoms.delete('EVERYTHING IS FINE');
            master.classList.remove('selected');
        } else {
            activeSymptoms.add('EVERYTHING IS FINE');
            master.classList.add('selected');
        }
        return;
    }

    activeSymptoms.delete('EVERYTHING IS FINE');
    master.classList.remove('selected');

    if (activeSymptoms.has(name)) {
        activeSymptoms.delete(name);
        el.classList.remove('selected');
    } else {
        activeSymptoms.add(name);
        el.classList.add('selected');
    }
}

window.saveSymptomsEntry = function() {
    const db = JSON.parse(localStorage.getItem(APP_KEY)) || {};
    const dateKey = getLocalKey(currentDate);
    const dayData = db[dateKey] || {};
    let finalList = Array.from(activeSymptoms);
    const customText = document.getElementById('symptomSpecify').value;
    if (customText.trim() !== "") { finalList.push(customText.trim()); }

    const V = window.LIFEHUB_FLO_VOCAB;

    // "Everything is fine" cannot share a day with a real complaint.
    if (V) finalList = V.resolveExclusive('symptoms', finalList);

    dayData.symptoms = finalList;

    /* PAID PER SYMPTOM, NOT PER SAVE.
       Noticing a headache in the morning and cramps in the afternoon
       is two acts of recording, and both are worth something. Paying
       once a day said the second one wasn't. Paying on every save
       meant re-opening the modal minted prestige.
       So the money attaches to the symptom: 300 for the day's first,
       100 for each new one after it, five extras at most, and nothing
       at all for one that has already paid. See settleSymptoms(). */
    if (V) {
        const settled = V.settleSymptoms(dayData.symptomsPaidFor, finalList);
        if (settled.amount > 0) {
            const n = settled.charged.length;
            payPrestige(settled.amount,
                `Daily Log: Symptoms (${settled.charged.join(', ')})`);
            dayData.symptomsPaidFor = settled.paidFor;
            // Keep the old flag in step, so anything reading rewards
            // still sees that symptoms paid today.
            if (!dayData.rewards) dayData.rewards = {};
            dayData.rewards['SYMPTOMS'] = true;
            console.log(`🩸 Symptoms: +${settled.amount} for ${n} new`);
        } else if (settled.paidFor.length > (dayData.symptomsPaidFor || []).length) {
            // Hit the daily ceiling: record them as settled anyway so
            // they can't come round again for another go.
            dayData.symptomsPaidFor = settled.paidFor;
        }
    }

    db[dateKey] = dayData;
    localStorage.setItem(APP_KEY, JSON.stringify(db));
    syncToCloud(); // <--- SYNC
    updateTodayLogUI(dayData);
    closeSymptomsModal();
}

// --- MEDICINE ENGINE (MULTI-SELECT) ---
let activeMeds = new Set();
window.openMedicineModal = function() {
    /* Preload the day, for the same reason symptoms does: saving
       REPLACES the list, so without this, taking paracetamol at noon
       after logging vitamins at breakfast erased the vitamins. */
    const db = JSON.parse(localStorage.getItem(APP_KEY)) || {};
    const dayData = db[getLocalKey(currentDate)] || {};

    const already = Array.isArray(dayData.medicine) ? dayData.medicine
                  : (dayData.medicine ? String(dayData.medicine).split(', ') : []);

    activeMeds = new Set(already);

    document.querySelectorAll('.med-item').forEach(item => {
        item.classList.toggle('selected', activeMeds.has(item.textContent.trim()));
    });

    /* Anything she typed in before is already in the list above, so
       clearing the box stops the next save adding it twice. */
    const specify = document.getElementById('medSpecify');
    if (specify) specify.value = '';

    document.getElementById('medicineModal').classList.remove('hidden');
}
window.closeMedicineModal = function() { document.getElementById('medicineModal').classList.add('hidden'); }
window.toggleMedicine = function(el, name) {
    if (activeMeds.has(name)) {
        activeMeds.delete(name);
        el.classList.remove('selected');
    } else {
        activeMeds.add(name);
        el.classList.add('selected');
    }
}
window.saveMedicineEntry = function() {
    const db = JSON.parse(localStorage.getItem(APP_KEY)) || {};
    const dateKey = getLocalKey(currentDate);
    const dayData = db[dateKey] || {};
    let finalList = Array.from(activeMeds);
    const customText = document.getElementById('medSpecify').value;
    if (customText.trim() !== "") { finalList.push(customText); }
    dayData.medicine = finalList;
    db[dateKey] = dayData;
    localStorage.setItem(APP_KEY, JSON.stringify(db));
    syncToCloud(); // <--- SYNC
    updateTodayLogUI(dayData);
    // Once a day, like the Alexa path for the same field.
    if (!isPaidToday('MEDICINE')) {
        payPrestige(300, "Daily Log: Medicine");
    }
    closeMedicineModal();
}

// --- BASAL TEMP ENGINE ---
window.openTempModal = function() {
    document.getElementById('tempModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('tempInput').focus(), 100);
}
window.closeTempModal = function() { document.getElementById('tempModal').classList.add('hidden'); }

window.saveTempEntry = function() {
    const input = document.getElementById('tempInput');
    const value = input.value;
    if(!value) { closeTempModal(); return; }
    
    const db = JSON.parse(localStorage.getItem(APP_KEY)) || {};
    const dateKey = getLocalKey(currentDate);
    const dayData = db[dateKey] || {};
    
    // 1. SAVE DATA
    dayData.temp = value + "°C";
    
    // 2. SMART PAYOUT
    if (!dayData.rewards) dayData.rewards = {};
    
    if (!dayData.rewards['TEMP']) {
        // Detailed Receipt
        const desc = `Basal Temp: ${value}°C`; 
        payPrestige(200, desc);
        
        dayData.rewards['TEMP'] = true;
        
        // Handle Streak (Using TEMP category)
        db.tempStreak = (db.tempStreak || 0) + 1;
        checkGenericStreak('TEMP', db.tempStreak);
    }
    
    // 3. SINGLE SAVE & SYNC
    db[dateKey] = dayData;
    localStorage.setItem(APP_KEY, JSON.stringify(db));
    syncToCloud(); 
    
    updateTodayLogUI(dayData);
    closeTempModal();
    input.value = "";
}

// --- DISCHARGE ENGINE ---
let tempSelectedDischarge = "";
window.openDischargeModal = function() {
    document.getElementById('dischargeModal').classList.remove('hidden');
    tempSelectedDischarge = ""; 
    document.querySelectorAll('.d-item').forEach(el => el.classList.remove('selected'));
}
window.closeDischargeModal = function() { document.getElementById('dischargeModal').classList.add('hidden'); }
window.selectDischarge = function(element, val) {
    document.querySelectorAll('.d-item').forEach(el => el.classList.remove('selected'));
    element.classList.add('selected');
    tempSelectedDischarge = val;
}


window.saveDischargeEntry = function() {
    if(!tempSelectedDischarge) { closeDischargeModal(); return; }
    
    const db = JSON.parse(localStorage.getItem(APP_KEY)) || {};
    const dateKey = getLocalKey(currentDate);
    const dayData = db[dateKey] || {};
    
    // 1. SAVE DATA
    dayData.discharge = tempSelectedDischarge;
    
    // 2. SMART PAYOUT
    if (!dayData.rewards) dayData.rewards = {};
    
    if (!dayData.rewards['DISCHARGE']) {
        // Detailed Receipt
        const desc = `Discharge Log: ${tempSelectedDischarge}`; 
        payPrestige(200, desc);
        
        dayData.rewards['DISCHARGE'] = true;
        
        // Handle Streak
        db.dischargeStreak = (db.dischargeStreak || 0) + 1;
        checkGenericStreak('DISCHARGE', db.dischargeStreak);
    }
    
    // 3. SINGLE SAVE & SYNC
    db[dateKey] = dayData;
    localStorage.setItem(APP_KEY, JSON.stringify(db));
    syncToCloud(); 
    
    updateTodayLogUI(dayData);
    closeDischargeModal();
}
// --- NOTES ENGINE ---
window.openNotesModal = function() {
    const db = JSON.parse(localStorage.getItem(APP_KEY)) || {};
    const dateKey = getLocalKey(currentDate);
    const dayData = db[dateKey] || {};
    document.getElementById('dailyNoteInput').value = dayData.notes || "";
    document.getElementById('notesModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('dailyNoteInput').focus(), 100);
}
window.closeNotesModal = function() { document.getElementById('notesModal').classList.add('hidden'); }
window.saveNotesEntry = function() {
    const text = document.getElementById('dailyNoteInput').value;
    const db = JSON.parse(localStorage.getItem(APP_KEY)) || {};
    const dateKey = getLocalKey(currentDate);
    const dayData = db[dateKey] || {};
    dayData.notes = text;
    db[dateKey] = dayData;
    localStorage.setItem(APP_KEY, JSON.stringify(db));
    syncToCloud(); // <--- SYNC
    updateTodayLogUI(dayData);
if (!isPaidToday('NOTES')) {
        payPrestige(500, "Daily Log: Notes");
    }
    closeNotesModal();
}

/* ══════════════════════════════════════════════════════════════════
   THE JOURNAL

   Notes were write-only. Every other field on this tracker has
   somewhere to be read back — the calendar carries the stamps, stats
   carry the shapes — but the one field in her own words could only be
   seen on the day it was written, by navigating to that day, if she
   remembered it existed.

   So: all of them, newest first, searchable, with just enough of the
   day around each to know what she was writing about.
   ═════════════════════════════════════════════════════════════════ */

window.openNotesHistory = function () {
    document.getElementById('notesHistoryModal').classList.remove('hidden');
    renderNotesHistory();
    /* Focus after the paint, or the modal's own transition eats it. */
    setTimeout(() => {
        const box = document.getElementById('nhSearch');
        if (box) box.focus();
    }, 60);
};

window.closeNotesHistory = function () {
    document.getElementById('notesHistoryModal').classList.add('hidden');
};

/* "2026-09-14" → "Monday, 14 September 2026". Built from the parts so
   no timezone can shift the date by one on the way through. */
function journalDate(key) {
    const [y, m, d] = String(key).split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
}

/* Every note, newest first. */
function collectNotes(db) {
    const A = window.FloAnalysis;
    const keys = A && A.dayKeys ? A.dayKeys(db)
               : Object.keys(db).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();

    const out = [];
    keys.forEach(k => {
        const day = db[k] || {};
        const text = String(day.notes == null ? '' : day.notes).trim();
        if (text) out.push({ key: k, text: text, day: day });
    });

    /* dayKeys() hands them back oldest first. */
    return out.reverse();
}

/* The few facts that make a note make sense a year later. Kept short
   on purpose — this is context, not a second daily log. */
function journalChips(day) {
    const chips = [];
    if (day.isMenstrual) chips.push({ text: 'period', period: true });
    if (day.flow) chips.push({ text: 'flow: ' + day.flow });

    const moods = asList(day.mood);
    if (moods.length) chips.push({ text: moods.slice(0, 3).join(' · ') });

    const symptoms = asList(day.symptoms);
    if (symptoms.length) {
        chips.push({ text: symptoms.slice(0, 3).join(' · ') +
                           (symptoms.length > 3 ? ' +' + (symptoms.length - 3) : '') });
    }
    if (day.pill) chips.push({ text: 'pill: ' + day.pill });
    return chips;
}

/* The daily fields are stored as arrays by some paths and as comma
   strings by others. Read both rather than picking a winner — the
   history is already written either way. */
function asList(v) {
    if (Array.isArray(v)) return v.filter(Boolean);
    if (!v) return [];
    return String(v).split(',').map(s => s.trim()).filter(Boolean);
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

/* Highlight the search term inside a note. Escapes first, so a note
   containing markup is shown as text rather than rendered. */
function highlight(text, term) {
    const safe = escapeHtml(text);
    if (!term) return safe;
    const pattern = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return safe.replace(new RegExp('(' + pattern + ')', 'gi'), '<mark>$1</mark>');
}

window.renderNotesHistory = function () {
    const list = document.getElementById('nhList');
    const count = document.getElementById('nhCount');
    if (!list) return;

    const db = JSON.parse(localStorage.getItem(APP_KEY)) || {};
    const term = (document.getElementById('nhSearch')?.value || '').trim();
    const all = collectNotes(db);

    const shown = term
        ? all.filter(n => n.text.toLowerCase().includes(term.toLowerCase()))
        : all;

    if (!all.length) {
        count.textContent = '';
        list.innerHTML = '<div class="nh-empty">Nothing written down yet.<br>' +
            'Notes you add from the daily log will collect here.</div>';
        return;
    }

    if (!shown.length) {
        count.textContent = '';
        list.innerHTML = '<div class="nh-empty">No notes matching &ldquo;' +
            escapeHtml(term) + '&rdquo;.</div>';
        return;
    }

    count.textContent = term
        ? shown.length + ' of ' + all.length + ' notes'
        : all.length + (all.length === 1 ? ' note' : ' notes');

    list.innerHTML = shown.map(n => {
        const chips = journalChips(n.day).map(c =>
            '<span class="nh-chip' + (c.period ? ' is-period' : '') + '">' +
            escapeHtml(c.text) + '</span>').join('');

        return '<div class="nh-entry">' +
            '<button class="nh-date" onclick="jumpToDay(\'' + n.key + '\')" ' +
                    'title="Open this day">' +
                journalDate(n.key) +
                '<span class="material-symbols-rounded">arrow_forward</span>' +
            '</button>' +
            '<div class="nh-text">' + highlight(n.text, term) + '</div>' +
            (chips ? '<div class="nh-meta">' + chips + '</div>' : '') +
        '</div>';
    }).join('');
};

/* Reading a note and wanting to see that day is the same impulse. */
window.jumpToDay = function (key) {
    const [y, m, d] = String(key).split('-').map(Number);
    currentDate = new Date(y, m - 1, d);

    const input = document.getElementById('datePickerInput');
    if (input) input.value = key;

    closeNotesHistory();
    updateUI();
};

// --- LOG PANEL DATE PICKER ---
window.openLogCalendar = function() {
    const input = document.getElementById('logDatePickerInput');
    if (input && 'showPicker' in HTMLInputElement.prototype) {
        try { input.showPicker(); } catch (error) { input.click(); }
    } else { input.click(); }
}
window.logDatePicked = function(input) {
    if(input.value) {
        const parts = input.value.split('-');
        currentDate = new Date(parts[0], parts[1] - 1, parts[2]);
        updateUI(); 
    }
}

// --- CALENDAR VIEW ENGINE ---
let calViewDate = getPHNow(); 
window.openCalendarView = function() {
    document.getElementById('calendarView').classList.remove('hidden');
    renderCalendar(); 
}
window.closeCalendarView = function() { document.getElementById('calendarView').classList.add('hidden'); }
window.changeMonth = function(offset) {
    calViewDate.setMonth(calViewDate.getMonth() + offset);
    renderCalendar();
}

// --- EXCLUSIVE TOGGLE LOGIC ---
window.switchFocusMode = function(activeId) {
    const modes = ['toggleActivity', 'toggleSymptoms', 'toggleMed', 'toggleTemp', 'toggleDischarge', 'toggleNotes'];
    if (document.getElementById(activeId).checked) {
        modes.forEach(id => {
            if (id !== activeId) {
                const el = document.getElementById(id);
                if(el) el.checked = false;
            }
        });
    }
    renderCalendar();
}

function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const title = document.getElementById('calMonthTitle');
    const db = JSON.parse(localStorage.getItem(APP_KEY)) || {};
    
    const showPhase     = document.getElementById('togglePhase')?.checked;
    const showPills     = document.getElementById('togglePills')?.checked;
    const showFlow      = document.getElementById('toggleFlow')?.checked;
    const showMood      = document.getElementById('toggleMood')?.checked;
    const showActivity  = document.getElementById('toggleActivity')?.checked;
    const showSymptoms  = document.getElementById('toggleSymptoms')?.checked;
    const showMed       = document.getElementById('toggleMed')?.checked;
    const showTemp      = document.getElementById('toggleTemp')?.checked;
    const showDischarge = document.getElementById('toggleDischarge')?.checked;
    const showNotes     = document.getElementById('toggleNotes')?.checked;

    if(!grid) return;
    grid.innerHTML = "";
    
    const options = { month: 'long', year: 'numeric' };
    title.innerText = calViewDate.toLocaleDateString('en-US', options);

    const year = calViewDate.getFullYear();
    const month = calViewDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    /* ── PHASE COLOURING ──────────────────────────────────────────
       Worked out once for the whole grid.

       This used to count from db.lastPeriodDate alone and loop every
       28 days forever. Two things were wrong with that. It ignored
       every period start she has actually logged, so a month from
       last year was coloured by arithmetic rather than by what
       happened in it. And 28 is not her number — getCycleLength()
       reads her own median, and the header has used it for months,
       so the calendar and the header could disagree about the same
       day while a comment below claimed they could not.

       Now each day is measured from the most recent period start ON
       OR BEFORE it, which is what a cycle day actually means. */
    const A = window.FloAnalysis;
    const cycleLen = getCycleLength(db);

    /* Every logged start, oldest first. Pack bleeds are INCLUDED
       here — they are excluded from the length statistics because
       they are the medication's schedule, but she did bleed, and the
       calendar shows what happened. */
    let starts = (showPhase && A) ? A.periodStarts(db, {}) : [];

    /* Nothing logged, but an old anchor exists: fall back to it so
       days recorded before the day-stamps existed still colour. */
    if (showPhase && !starts.length && db.lastPeriodDate) {
        starts = [getLocalKey(new Date(db.lastPeriodDate))];
    }

    /* Past this far from a start it is a gap in tracking rather than
       a very long cycle, and colouring it would be an invention. */
    const PHASE_RUNOUT = cycleLen + 14;
    
    for(let i=0; i<firstDayIndex; i++) { grid.appendChild(document.createElement('div')); }
    
    for(let d=1; d<=daysInMonth; d++) {
        const cell = document.createElement('div');
        cell.className = 'clean-tile'; 
        
        cell.onclick = function() {
            currentDate = new Date(year, month, d); 
            updateUI();           
            closeCalendarView();  
        };

        const dateObj = new Date(year, month, d); 
        const dateKey = getLocalKey(dateObj); 
        const dayData = db[dateKey] || {};

        // --- LAYER 1: PILL ---
        let pillHtml = '';
        if (showPills && dayData.pill) {
            let pClass = 'pb-success'; 
            if (dayData.pill === 'missed' || dayData.pill === 'nostock') pClass = 'pb-danger';
            pillHtml = `<span class="material-symbols-rounded pill-badge ${pClass}">pill</span>`;
        }

        // --- LAYER 2: MOOD ---
        let moodHtml = '';
        if (showMood && dayData.mood) {
            const moodMap = {
                'ELATED': 'sentiment_excited', 'EXCITED': 'sentiment_very_satisfied', 'HAPPY': 'mood',
                'OKAY': 'sentiment_satisfied', 'CALM': 'sentiment_calm', 'MEH': 'sentiment_neutral',
                'HOLDING ON': 'sentiment_content', 'NOT OKAY': 'sentiment_dissatisfied', 'CONFUSED': 'mood_bad',
                'SAD': 'sentiment_sad', 'DEPRESSED': 'sentiment_frustrated', 'STRESSED': 'sentiment_stressed',
                'ANXIOUS': 'sentiment_very_dissatisfied', 'SICK': 'sick', 'IRATE': 'sentiment_extremely_dissatisfied',
                'PLAYFUL': 'face_6', 'HUMPY': 'cruelty_free', 'NEUTRAL': 'filter_drama'
            };

            // 1. Standardise to an array. This used to wrap a string
            // whole — so a comma-separated "HAPPY, CALM" became one
            // unmatched entry and drew the fallback neutral face
            // instead of two real moods.
            const moodList = asList(dayData.mood);

            // 2. Slice to grab only the top 2
            const topTwo = moodList.slice(0, 2);

            // 3. Build the HTML
            let icons = '';
            topTwo.forEach(m => {
                const icon = moodMap[m] || 'sentiment_neutral';
                icons += `<span class="material-symbols-rounded">${icon}</span>`;
            });

            // 4. Wrap in our new container
            if (topTwo.length > 0) {
                moodHtml = `<div class="mood-group-center">${icons}</div>`;
            }
        }

        // --- LAYER 3: TEMP ---
        let tempHtml = '';
        if (showTemp && dayData.temp) {
            tempHtml = `<div class="mini-text-tc">${dayData.temp}</div>`;
        }

        // --- LAYER 4: FLOW ---
        let dropsHtml = '';
        if (showFlow && dayData.flow) {
            let count = 1;
            if(dayData.flow === 'LIGHT') count = 2;
            if(dayData.flow === 'NORMAL') count = 3;
            if(dayData.flow === 'HEAVY') count = 4;
            if(dayData.flow === 'VERY HEAVY') count = 5;
            dropsHtml = `<div class="flow-indicators">`;
            for(let k=0; k<count; k++) dropsHtml += `<span class="material-symbols-rounded mini-drop">water_drop</span>`;
            dropsHtml += `</div>`;
        }

        // --- LAYER 5: BOTTOM LEFT (Symptoms/Med) ---
        //
        // Read through asList(). These are written as arrays by the
        // modals, but a day saved from elsewhere can hold a comma
        // string — and calling .forEach on one threw, which took out
        // the whole month's grid rather than one cell's icons.
        const symList = asList(dayData.symptoms);
        const medList = asList(dayData.medicine);

        let blHtml = '';
        if ((showSymptoms && symList.length > 0) ||
            (showMed && medList.length > 0)) {
            blHtml = `<div class="bl-group">`;
            if(showSymptoms && symList.length) {
                const symMap = {
                    'EVERYTHING IS FINE': 'thumb_up', 'ACNE': 'scatter_plot', 'HAIRFALL': 'emergency_heat_2',
                    'NAUSEA': 'sick', 'CHILLS': 'sick', 'FEVERISH': 'sick', 'COLD': 'sick',
                    'DIZZINESS': 'sentiment_stressed', 'FATIGUE': 'sentiment_stressed', 
                    'HEADACHE': 'sentiment_stressed', 'MIGRAINE': 'sentiment_stressed', 
                    'DIARRHEA': 'sentiment_stressed', 'CONSTIPATION': 'sentiment_stressed',
                    'BACKACHE': 'sentiment_stressed', 'BODY ACHE': 'sentiment_stressed', 
                    'STOMACHACHE': 'sentiment_stressed', 'WEARING DIAPER': 'bath_bedrock', 'TENDER BREAST': 'adjust',
                    'BLOATING': 'bubble_chart', 'CRAMPS': 'gynecology', 'ITCHINESS': 'microbiology', 
                    'DRYNESS': 'microbiology', 'IRRITATION': 'microbiology'
                };
                let uniqueIcons = new Set();
                symList.forEach(s => {
                    const cleanS = s.trim().toUpperCase();
                    if(symMap[cleanS]) uniqueIcons.add(symMap[cleanS]);
                    else uniqueIcons.add('healing'); 
                });
                uniqueIcons.forEach(icon => {
                    blHtml += `<span class="material-symbols-rounded mini-icon-bl">${icon}</span>`;
                });
            }
            // One icon per medicine. On a comma string this counted
            // CHARACTERS, so "BIOGESIC" drew eight pills.
            if(showMed && medList.length > 0) {
                for(let i = 0; i < medList.length; i++) {
                    blHtml += `<span class="material-symbols-rounded mini-icon-bl">pill</span>`;
                }
            }
            blHtml += `</div>`;
        }

        // --- LAYER 6: ACTIVITY ---
        let activityHtml = '';
        if (showActivity && dayData.activity) {
            const actMap = {
                'LOW DRIVE': 'battery_low', 'NEUTRAL DRIVE': 'fireplace',
                'HIGH DRIVE': 'local_fire_department', 'PROTECTED SEX': 'shield_with_heart',
                'UNPROTECTED SEX': 'partner_heart', 'SELF-LOVING': 'volunteer_activism',
                'PREFER NOT TO SAY': 'heart_smile'
            };
            let icon = actMap[dayData.activity] || 'favorite';
            activityHtml = `<span class="material-symbols-rounded mini-icon-activity">${icon}</span>`;
        }

        // --- LAYER 7: DISCHARGE ---
        let disHtml = '';
        if(showDischarge && dayData.discharge) {
            // The calendar cells are tiny, so each option gets a one-word
            // form. The old labels stay in the map: days logged before the
            // list was reworded still have to render.
            const shortMap = {
                'CLEAR & WATERY': 'WATERY', 'CLEAR & STRETCHY': 'STRETCHY',
                'MILKY OR CREAMY': 'CREAMY', 'THICK & CLUMPY': 'CLUMPY',
                'YELLOW, GREEN, OR GRAY': 'DISCOLOURED', 'BROWN OR DARK RED': 'BROWN',
                'SPOTTING': 'SPOTTING',
                'NORMAL BLEEDING': 'BLEEDING', 'HEAVY BLOOD CLOT': 'HEAVY CLOTS',

                /* retired labels, kept for old entries */
                'NORMAL DISCHARGE': 'NORMAL', 'STICKY': 'STICKY', 'CREAMY': 'CREAMY',
                'WATERY': 'WATERY', 'EGG WHITE': 'EGG WHITE', 'WITH BLOOD': 'BLOODY',
                'GREEN': 'GREEN'
            };
            const displayText = shortMap[dayData.discharge] || dayData.discharge;
            disHtml = `<div class="mini-text-discharge">${displayText}</div>`;
        }

        // --- LAYER 8: NOTES ---
        let notesHtml = '';
        if(showNotes && dayData.notes && dayData.notes.trim().length > 0) {
            notesHtml = `<span class="material-symbols-rounded mini-icon-note">description</span>`;
        }

        cell.innerHTML = `
            <span class="day-number-tl">${d}</span>
            ${pillHtml}
            ${moodHtml}
            ${tempHtml}
            ${dropsHtml}
            ${blHtml} 
            ${activityHtml} 
            ${disHtml}
            ${notesHtml}
        `;
        
        const todayKey = getLocalKey(getPHNow()); 
        if(dateKey === todayKey) cell.classList.add('is-today');
        
        if(showPhase && starts.length) {
            /* The most recent start on or before this day. Date keys
               sort the same way lexically as they do chronologically,
               so a plain string compare is the whole search. */
            let anchor = null;
            for (let i = starts.length - 1; i >= 0; i--) {
                if (starts[i] <= dateKey) { anchor = starts[i]; break; }
            }

            if (anchor) {
                const since = A
                    ? A.daysBetweenKeys(anchor, dateKey)
                    : Math.round((new Date(dateKey) - new Date(anchor)) / 86400000);

                /* Days before the first start she ever logged, and
                   days too far past one to be part of it, stay
                   uncoloured — an honest blank rather than a guess. */
                if (since >= 0 && since < PHASE_RUNOUT) {
                    const cycleDay = since + 1;

                    // Same phaseFor() the screen and the Alexa sync use,
                    // and now the same cycle day too, so the calendar
                    // and the header cannot disagree.
                    cell.classList.add('phase-' +
                        phaseFor(cycleDay, { isMenstrual: dayData.isMenstrual })
                            .phase.toLowerCase());
                }
            }

            /* Today, while a period is running, is menstrual whatever
               the arithmetic says — it was logged, and logged beats
               calculated. */
            if (dateKey === todayKey && db.isPeriodActive) {
                cell.classList.remove('phase-follicular', 'phase-ovulation', 'phase-luteal');
                cell.classList.add('phase-menstrual');
            }
        }
        
        grid.appendChild(cell);
    } // <--- Closes the FOR loop
}

// --- TIMEZONE FIX HELPER ---
function getLocalKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// --- STATS ENGINE ---
window.openStatsModal = function() {
    calculateStats();
    document.getElementById('statsModal').classList.remove('hidden');
}

window.closeStatsModal = function() {
    document.getElementById('statsModal').classList.add('hidden');
}

// --- STATS ENGINE (BIOLOGICAL CYCLE) ---
function calculateStats() {
    const db = JSON.parse(localStorage.getItem(APP_KEY)) || {};
    let moodStats = { happy: 0, neutral: 0, friction: 0, total: 0 };
    let libidoStats = { high: 0, med: 0, low: 0, total: 0 };
    let flowStats = { high: 0, med: 0, low: 0, total: 0 };

    let daysToLookBack = 7; 
    
    if (db.lastPeriodDate) {
        daysToLookBack = getCycleDay(getPHNow()); 
        daysToLookBack = Math.max(1, Math.min(daysToLookBack, 40)); 
    }

    for (let i = 0; i < daysToLookBack; i++) {
        let d = getPHNow();
        d.setDate(d.getDate() - i);
        const key = getLocalKey(d);
        const data = db[key] || {};

        if (data.mood) {
            /* asList, not a bare wrap. Wrapping a comma string whole
               made "HAPPY, CALM" a single entry that matched no group
               and fell to the else below — so a good day was counted
               as FRICTION. Same shape of bug the calendar had. */
            const moods = asList(data.mood);

            const moodGroups = {
                'HAPPY':    ['ELATED', 'EXCITED', 'HAPPY', 'OKAY', 'CALM', 'PLAYFUL', 'HUMPY'],
                'NEUTRAL':  ['MEH', 'HOLDING ON', 'NEUTRAL'],
                'FRICTION': ['IRATE', 'SICK', 'ANXIOUS', 'STRESSED', 'DEPRESSED', 'SAD', 'CONFUSED', 'NOT OKAY']
            };

            // Loop through ALL selected moods for that day
            moods.forEach(mStr => {
                const m = mStr.toUpperCase();
                if (moodGroups.HAPPY.includes(m))        moodStats.happy++;
                else if (moodGroups.NEUTRAL.includes(m)) moodStats.neutral++;
                else if (moodGroups.FRICTION.includes(m)) moodStats.friction++;
                else return;   // not a mood we know — don't count it as anything
                moodStats.total++;
            });
        }

        if (data.activity) {
            const a = data.activity;
            const libidoGroups = {
                'HIGH': ['HIGH DRIVE', 'SELF-LOVING', 'PROTECTED SEX', 'UNPROTECTED SEX'],
                'MED':  ['NEUTRAL DRIVE', 'PREFER NOT TO SAY'],
                'LOW':  ['LOW DRIVE']
            };
            if (libidoGroups.HIGH.includes(a))      libidoStats.high++;
            else if (libidoGroups.MED.includes(a))  libidoStats.med++;
            else                                    libidoStats.low++;
            libidoStats.total++;
        }

        if (data.flow) {
            const f = data.flow;
            const flowGroups = {
                'HIGH': ['HEAVY', 'VERY HEAVY'],
                'MED':  ['NORMAL'],
                'LOW':  ['SPOTTING', 'LIGHT']
            };
            if (flowGroups.HIGH.includes(f))     flowStats.high++;
            else if (flowGroups.MED.includes(f)) flowStats.med++;
            else                                 flowStats.low++;
            flowStats.total++;
        }
    }

    drawMoodDonut(moodStats);
    drawStandardDonut('donutLibido', libidoStats);
    drawStandardDonut('donutFlow', flowStats);
}

function drawMoodDonut(data) {
    const el = document.getElementById('donutMood');
    if (!el) return;
    if (data.total === 0) { el.style = "--p1:0%; --p2:0%;"; return; }
    const p1 = (data.happy / data.total) * 100;
    const p2 = p1 + ((data.neutral / data.total) * 100);
    el.style = `--p1: ${p1}%; --p2: ${p2}%;`;
}

function drawStandardDonut(id, data) {
    const el = document.getElementById(id);
    if (!el || data.total === 0) { if(el) el.style = "--p1:0%; --p2:0%;"; return; }
    const p1 = (data.high / data.total) * 100;
    const p2 = p1 + ((data.med / data.total) * 100);
    el.style = `--p1: ${p1}%; --p2: ${p2}%;`;
}

// --- RESET ENGINE ---
window.goToToday = function() {
    currentDate = getPHNow();
    const input = document.getElementById('datePickerInput');
    if(input) input.valueAsDate = getPHNow();
    updateUI();
    console.log("Warped back to Today.");
}


// ==========================================
// 💎 PRESTIGE BOUNTY HUNTER (The Integration)
// ==========================================

// 1. THE PAYOUT TRIGGER
/* ── THE BANK ──────────────────────────────────────────────────────
   This delegated to window.deposit(), which is defined in
   JS/lifehub-core-prestige-system.js — and this page does not load
   that file. The comment in the HTML said it "isn't needed" because
   payPrestige is defined here; but payPrestige was only a wrapper
   around the thing that was missing.

   So every branch fell to the else, logged "Points not awarded" to a
   console nobody was watching, and paid nothing. Not the pill, not
   the streak milestones, not mood, symptoms, flow, notes, temp,
   discharge or activity — the whole FLO economy, silently zero.

   It now writes the ledger directly through the shared row builder,
   the same way the other trackers do, on the named app this file
   already has. No window.deposit, nothing to forget to load, and a
   loud error if the rules module is missing. */
const PRESTIGE_SOURCE = "FLO TRACKER";

function payPrestige(amount, description) {
    const P = window.LIFEHUB_PRESTIGE;
    if (!P) {
        console.error("[FLO] lifehub-prestige-ledger.js isn't loaded — not paying.");
        return;
    }

    const value = Number(amount) || 0;
    if (!value) return;

    const stamp = firebase.database.ServerValue.TIMESTAMP;
    dbCloud.ref('prestige_system/balance').transaction(c => (c || 0) + value);

    /* Negatives come in two flavours here and the ledger keeps them
       apart: taking back what a row paid (a correction), versus the
       system docking her for a tablet she missed (a penalty). Both
       move the rank; only one of them means the ledger was wrong. */
    let tx;
    if (value > 0) {
        tx = P.row(value, description, PRESTIGE_SOURCE, stamp);
    } else if (/correction|adjustment|undo|refund/i.test(String(description))) {
        tx = P.reversal(Math.abs(value), description, PRESTIGE_SOURCE, stamp);
    } else {
        tx = P.penalty(Math.abs(value), description, PRESTIGE_SOURCE, stamp);
    }

    dbCloud.ref('prestige_system/transactions').push(tx);
}

// 2. STREAK CALCULATOR (Generic)
function checkGenericStreak(category, days) {
    // Definition of rewards
    const rewards = {
        7: { amount: 0, label: '' }, // Placeholder, logic handled below based on category
        15: { amount: 0, label: '' },
        30: { amount: 0, label: '' }
    };

    // Category Specifics
    if (category === 'MOOD') {
        rewards[7] = { amount: 525, label: 'Mood Streak: 7 Days' };
        rewards[15] = { amount: 1500, label: 'Mood Streak: 15 Days' };
        rewards[30] = { amount: 3750, label: 'Mood Streak: 30 Days' };
    } 
    else if (['ACTIVITY', 'TEMP', 'DISCHARGE'].includes(category)) {
        rewards[7] = { amount: 420, label: `${category} Streak: 7 Days` };
        rewards[15] = { amount: 1200, label: `${category} Streak: 15 Days` };
        rewards[30] = { amount: 3000, label: `${category} Streak: 30 Days` };
    }

    // Check if we hit a milestone
    if (rewards[days]) {
        payPrestige(rewards[days].amount, rewards[days].label + " 🔥");
    }
}

// 3. DAILY CAP CHECKER
// Ensures you don't get paid twice for the same log on the same day
function isPaidToday(category) {
    const db = JSON.parse(localStorage.getItem(APP_KEY)) || {};
    const dateKey = getLocalKey(currentDate);
    const dayData = db[dateKey] || {};
    
    // Create a 'rewards' object in the day data if it doesn't exist
    if (!dayData.rewards) dayData.rewards = {};
    
    if (dayData.rewards[category]) {
        return true; // Already paid
    } else {
        // Mark as paid
        dayData.rewards[category] = true;
        
        // Save to Local Storage
        db[dateKey] = dayData;
        localStorage.setItem(APP_KEY, JSON.stringify(db));
        
        // CRITICAL FIX: Send the "Paid" stamp to the cloud immediately
        // so the cloud doesn't overwrite us with an unpaid version.
        syncToCloud(); 
        
        return false; // Not paid yet, go ahead
    }
}

// 4. ALTHEA MANAGER
function handleAltheaPayout(status) {
    const db = JSON.parse(localStorage.getItem(APP_KEY)) || {};
    const dateKey = getLocalKey(currentDate);
    const dayData = db[dateKey] || {};

    // A. PERIOD BUFFER CHECK
    //
    // Off a pack, a period means no pills are due, so scoring them would
    // be meaningless — that is what this buffer is for.
    //
    // ON a pack it was actively wrong. Breakthrough bleeding happens
    // while the active tablets are still being taken, so logging the
    // bleed silently switched off pill scoring for days she was still
    // taking them — and the streak, which is now computed from the day
    // records, would have counted days that were never paid or locked.
    // During the break week there are no tablets anyway, so nothing is
    // lost by letting this run.
    if (db.isPeriodActive && !packState(db, currentDate)) {
        console.log("In Period Buffer. No Althea penalties or standard points.");
        return;
    }

    // --- 1. DEFINE VALUES ---
    // The wage table moved to JS/lifehub-pill-rules.js so Poppy can pay
    // the same amounts when she logs a tablet. Two copies of a wage
    // table drift, and a drifted one is a balance nobody can audit.
    const RULES = window.LIFEHUB_PILL;
    if (!RULES) {
        console.error("[FLO] JS/lifehub-pill-rules.js isn't loaded — not paying.");
        return;
    }

    // --- 2. CALCULATE THE DIFFERENCE ---
    // Pay only the difference from what this day already paid, so a
    // correction moves the ledger once and in the right direction.
    const { target: newValue, delta: difference } =
        RULES.settle(status, dayData.altheaPaidAmount);

    // --- 3. EXECUTE TRANSACTION ---
    if (difference !== 0) {
        // Create a smart description
        let desc = `Althea: ${status.toUpperCase()}`;
        if (oldValue !== 0) {
            desc = `Althea Adjustment: ${status.toUpperCase()}`;
        }

        payPrestige(difference, desc);
        
        // Save the new "Paid Amount" so we don't double pay next time
        dayData.altheaPaidAmount = newValue;
    }

    // --- 4. STREAK LOGIC ---
    // There used to be TWO streaks. This function kept a running counter
    // in db.altheaStreak by adding 1 each time, while updateStreak() drew
    // the number on screen by walking back through the actual days. They
    // were never reconciled, so the display could read 9 while the bonus
    // logic thought you were on 3 — and the "rescue" branch below guessed
    // at a value of 1 when it lost track.
    //
    // Now there is one: the day data IS the streak. Recomputing from it
    // also means editing a past day corrects the count automatically, and
    // clicking the same button repeatedly can't inflate anything.
    db[dateKey] = dayData;                     // so the walk sees this change
    const streak = computePillStreak(db, currentDate);
    db.altheaStreak = streak;

    // Milestones pay once per day, whatever route got you here.
    if (!dayData.streakMilestonePaid) dayData.streakMilestonePaid = {};
    const hit = RULES.milestoneFor(streak, dayData.streakMilestonePaid);
    if (hit) {
        payPrestige(hit.amount, `Althea Streak: ${hit.days} Days 🛡️`);
        dayData.streakMilestonePaid[hit.days] = true;
    }

    // Save Everything
    db[dateKey] = dayData; // Make sure daily data is updated
    localStorage.setItem(APP_KEY, JSON.stringify(db));
}

// The one place a pill streak is counted. Walks back from `endDate`,
// skipping an unlogged today so the number doesn't drop to zero every
// midnight before the pill is taken.
function computePillStreak(db, endDate) {
    const RULES = window.LIFEHUB_PILL;
    if (!RULES) return 0;

    // The walk itself lives in the rules module, which Poppy shares.
    // The calendar stays here: only this file knows the tracker reads
    // Manila dates off a Date built from Manila's own parts.
    return RULES.streak(db, (offset) => {
        const pointer = new Date(endDate);
        pointer.setDate(pointer.getDate() - offset);
        return getLocalKey(pointer);
    });
}

// ==========================================
// 🚀 ALEXA REAL-TIME LISTENER (WEALTH EDITION)
// ==========================================
// dbCloud, not firebase.database(). The default app belongs to
// lifehub-navigation-core.js — this only worked because that file
// happened to load first, and would have thrown "No Firebase App
// '[DEFAULT]' has been created" the moment the script order changed.
const alexaRef = dbCloud.ref('alexa_updates');

// alexa_updates is ONE shared mailbox for every tracker. Commands sit
// there until something clears them, and this listener fires once on
// connect with whatever is already inside.
const FLO_COMMAND_MAX_AGE_MS = 10 * 60 * 1000;   // 10 minutes
const FLO_SEEN_KEY = 'flo_last_alexa_ts';

function floAlreadyHandled(ts) {
    try { return ts && Number(localStorage.getItem(FLO_SEEN_KEY)) >= ts; }
    catch (e) { return false; }
}
function floMarkHandled(ts) {
    try { if (ts) localStorage.setItem(FLO_SEEN_KEY, String(ts)); }
    catch (e) { /* private mode — the age check still applies */ }
}

alexaRef.on('value', (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    // ── ONLY FLO'S OWN POST ───────────────────────────────────────
    // Everything below used to run for ANY command, and the cleanup at
    // the bottom then emptied the mailbox — so with this page open, a
    // "log my water" or a sleep finalise was deleted two seconds after
    // it arrived, before the tracker it was addressed to ever saw it.
    if (typeof data.action !== 'string' || data.action.indexOf('flo_') !== 0) return;

    const floTs = Number(data.timestamp) || 0;
    if (floTs && Date.now() - floTs > FLO_COMMAND_MAX_AGE_MS) {
        console.log("⌛ Ignoring stale FLO command from", new Date(floTs).toLocaleString());
        return;
    }
    if (floAlreadyHandled(floTs)) return;
    floMarkHandled(floTs);

    console.log("⚡ Alexa FLO Command:", data);

    // Reload DB fresh to ensure we don't overwrite anything
    const db = JSON.parse(localStorage.getItem(APP_KEY)) || {};
    let dataChanged = false;

    // --- HELPER: GET TODAY'S KEY ---
    const getTodayKey = () => {
        return getLocalKey(getPHNow());
    };
    const todayKey = getTodayKey();

    // Ensure today's object exists
    if (!db[todayKey]) db[todayKey] = {};
    const dayData = db[todayKey]; // Shortcut reference

    // ------------------------------------
    // 1. CYCLE TRIGGERS
    // ------------------------------------
    if (data.action === 'flo_start_period') {
        const now = getPHNow();
        db.lastPeriodDate = now.toISOString();
        db.isPeriodActive = true;

        /* Stamp the day itself, not just the switch.
           isPeriodActive is the live flag; the isMenstrual stamps on
           the day records are what periodStarts() reads, and every
           cycle-length statistic is computed from those. The page
           stamps each day as it is opened — but a period started by
           voice and never visited reached none of the statistics at
           all. onPack too, so a withdrawal bleed is not counted as
           one of her own cycles. */
        dayData.isMenstrual = true;
        if (packState(db, now)) dayData.onPack = true;

        // No altheaStreak reset here either — computePillStreak() derives
        // it from the day records, so writing 0 only left a wrong number
        // in the data until the next payout recomputed it.
        console.log("🔴 Period Started");
        dataChanged = true;
    }

    if (data.action === 'flo_end_period') {
        db.isPeriodActive = false;
        console.log("⚪ Period Ended");
        dataChanged = true;
    }

    // ------------------------------------
    // 2. PILL LOGGING (With Payout)
    // ------------------------------------
    if (data.action === 'flo_log_pill') {
        db[todayKey].pill = data.status; 
        
        // SAVE FIRST so the helper function sees the new status
        localStorage.setItem(APP_KEY, JSON.stringify(db));
        
        // TRIGGER PAYOUT (This helper handles the math, streaks, and saving)
        handleAltheaPayout(data.status);
        
        console.log(`💊 Pill: ${data.status} (Paid)`);
        
        // We set dataChanged to false because handleAltheaPayout already saved it
        dataChanged = false; 
        // Force a UI refresh though
        updateUI();
    }

    // ------------------------------------
    // 3. PROTOCOL: FLOW
    // ------------------------------------
    if (data.action === 'flo_log_flow') {
        db[todayKey].flow = data.value; 
        
        // PAYOUT
        if (!dayData.rewards) dayData.rewards = {};
        if (!dayData.rewards['FLOW']) {
            payPrestige(300, `Alexa Log: Flow (${data.value})`);
            dayData.rewards['FLOW'] = true;
        }

        console.log(`🩸 Flow: ${data.value}`);
        dataChanged = true;
    }

    // ------------------------------------
    // 4. PROTOCOL: SYMPTOMS
    // ------------------------------------
    if (data.action === 'flo_log_symptoms') {
        // Normalise before touching it: .filter and .push below both
        // throw on a comma string, and a day can hold one.
        dayData.symptoms = asList(dayData.symptoms);

        /* Through the matcher first, so "my boobs hurt" becomes
           TENDER BREAST instead of being stored as a phrase no icon,
           filter or statistic will ever match. The hand-rolled filler
           stripping below stays as the fallback for anything it
           cannot place — losing a symptom she actually reported would
           be worse than filing it untidily. */
        const Vy = window.LIFEHUB_FLO_VOCAB;
        const placed = Vy ? Vy.matchAll('symptoms', data.value)
                          : { matched: [], unmatched: [] };

        placed.matched.forEach(s => {
            if (dayData.symptoms.indexOf(s) === -1) dayData.symptoms.push(s);
        });
        if (placed.matched.length) {
            dayData.symptoms = Vy.resolveExclusive('symptoms', dayData.symptoms);
            placed.unmatched.forEach(u =>
                console.log("🤔 Alexa symptom not placed:", u));
        }

        /* The original hand-rolled parse, kept as the fallback and
           skipped entirely when the matcher already placed something
           — it strips EVERYTHING IS FINE unconditionally, which would
           undo a clear day the matcher had just recorded. */
        let rawText = placed.matched.length ? null : data.value.toUpperCase();

        if (rawText === null) {
            /* already handled above */
        } else if (rawText === 'EVERYTHING IS FINE') {
            dayData.symptoms = ['EVERYTHING IS FINE'];
        } else {
            dayData.symptoms = dayData.symptoms.filter(s => s !== 'EVERYTHING IS FINE');
            let cleanText = rawText.toLowerCase();
            const fillers = ["i have ", "i feel ", "i am ", "feeling ", "experiencing ", "a ", "an "];
            fillers.forEach(word => { cleanText = cleanText.split(word).join(""); });
            
            const parts = cleanText.split(/ and |, /);
            parts.forEach(p => {
                const sym = p.trim().toUpperCase();
                if (sym.length > 2 && !dayData.symptoms.includes(sym)) {
                    dayData.symptoms.push(sym);
                }
            });
        }
        
        // PAYOUT — per symptom, exactly as the page's own modal pays.
        // Routed through the same settle so the two cannot pay
        // different money for the same day, whichever one she used.
        const Vs = window.LIFEHUB_FLO_VOCAB;
        if (Vs) {
            const settled = Vs.settleSymptoms(dayData.symptomsPaidFor, dayData.symptoms);
            if (settled.amount > 0) {
                payPrestige(settled.amount,
                    `Alexa Log: Symptoms (${settled.charged.join(', ')})`);
                if (!dayData.rewards) dayData.rewards = {};
                dayData.rewards['SYMPTOMS'] = true;
            }
            dayData.symptomsPaidFor = settled.paidFor;
        }

        dataChanged = true;
    }

    // ------------------------------------
    // 5. PROTOCOL: MEDICINE
    // ------------------------------------
    if (data.action === 'flo_log_medicine') {
        // Same reason as symptoms: .push below needs a real array, and
        // .includes on a string would match a substring rather than an
        // entry — "IRON" inside "PROPAN WITH IRON".
        dayData.medicine = asList(dayData.medicine);

        /* The matcher knows the six she keeps in the house and their
           common names — "paracetamol" is BIOGESIC, "mefenamic" is
           EMIDOL. It also KEEPS anything it does not recognise, which
           is the right way round for medicine: a drug missing from
           the record because the name was unfamiliar is worse than
           one recorded in her own words. */
        const Vd = window.LIFEHUB_FLO_VOCAB;
        let added = false;

        if (Vd) {
            const r = Vd.matchAll('medicine', data.value);
            r.matched.forEach(m => {
                if (dayData.medicine.indexOf(m) === -1) {
                    dayData.medicine.push(m);
                    added = true;
                }
            });
        }

        if (!added) {
            let rawMed = data.value.toUpperCase();
            ["JUST ", " TOOK", "I TOOK ", "YES "].forEach(w => rawMed = rawMed.replace(w, ""));
            rawMed = rawMed.trim();

            if (rawMed.length > 2 && !dayData.medicine.includes(rawMed)) {
                dayData.medicine.push(rawMed);
            }
        }
        
        // PAYOUT
        if (!dayData.rewards) dayData.rewards = {};
        if (!dayData.rewards['MEDICINE']) {
            payPrestige(300, "Alexa Log: Medicine");
            dayData.rewards['MEDICINE'] = true;
        }

        dataChanged = true;
    }

    // ------------------------------------
    // 6. PROTOCOL: NOTES
    // ------------------------------------
    if (data.action === 'flo_log_notes') {
        let newNote = data.value;
        if (newNote.toLowerCase().startsWith("yes ")) newNote = newNote.substring(4);
        
        /* A blank line between, like Poppy writes. Joining with ". "
           ran two separate thoughts into one sentence, which the
           journal then showed as a single run-on paragraph. */
        if (dayData.notes) {
            dayData.notes += `\n\n${newNote}`;
        } else {
            dayData.notes = newNote;
        }
        
        // PAYOUT (Checks the 'isPaidToday' logic manually here)
        if (!dayData.rewards) dayData.rewards = {};
        if (!dayData.rewards['NOTES']) {
            payPrestige(500, "Alexa Log: Notes");
            dayData.rewards['NOTES'] = true;
        }

        dataChanged = true;
    }

    // ------------------------------------
    // 7. NEW PROTOCOLS: TEMP, DISCHARGE, ACTIVITY
    // ------------------------------------
    if (data.action === 'flo_log_temp') {
        /* VALIDATED, not just stored. parseTemp() knows what a
           plausible basal reading is and converts Fahrenheit; the
           ovulation detection reads this same field looking for a
           rise of a few tenths of a degree.

           This used to take whatever number arrived and append "°C" —
           so a misheard "thirty six point four" as "three point six
           four" went straight into the series and could invent a
           temperature shift or hide a real one. Speech recognition on
           decimals is exactly where that happens. */
        const A = window.FloAnalysis;
        const celsius = A ? A.parseTemp(String(data.value)) : null;

        if (celsius === null) {
            console.log("🌡️ Ignoring implausible basal temp from Alexa:", data.value);
        } else {
            const V = window.LIFEHUB_FLO_VOCAB;
            const stored = V ? V.OPEN_FIELDS.temp.format(celsius)
                             : (Math.round(celsius * 100) / 100) + "°C";
            db[todayKey].temp = stored;

            // PAYOUT & STREAK
            if (!dayData.rewards) dayData.rewards = {};
            if (!dayData.rewards['TEMP']) {
                payPrestige(200, `Basal Temp: ${stored}`);
                dayData.rewards['TEMP'] = true;

                db.tempStreak = V ? V.nextCount(db.tempStreak)
                                  : (db.tempStreak || 0) + 1;
                checkGenericStreak('TEMP', db.tempStreak);
            }

            dataChanged = true;
        }
    }

    /* Both of these stored data.value.toUpperCase() — the raw spoken
       phrase. "Clear and stretchy" became CLEAR AND STRETCHY, and the
       tracker's option is "CLEAR & STRETCHY", so the calendar's short
       label missed it, the statistics missed it, and the day looked
       logged while being unreadable to everything that reads it.
       The matcher maps the phrase onto the real option, and refuses
       rather than inventing one. */
    if (data.action === 'flo_log_discharge') {
        const V = window.LIFEHUB_FLO_VOCAB;
        const value = V ? V.match('discharge', data.value)
                        : String(data.value || '').toUpperCase();

        if (!value) {
            console.log("🤔 Alexa discharge not recognised:", data.value);
        } else {
            db[todayKey].discharge = value;

            // PAYOUT & STREAK
            if (!dayData.rewards) dayData.rewards = {};
            if (!dayData.rewards['DISCHARGE']) {
                payPrestige(200, `Discharge Log: ${value}`);
                dayData.rewards['DISCHARGE'] = true;

                db.dischargeStreak = V ? V.nextCount(db.dischargeStreak)
                                       : (db.dischargeStreak || 0) + 1;
                checkGenericStreak('DISCHARGE', db.dischargeStreak);
            }

            dataChanged = true;
        }
    }

    if (data.action === 'flo_log_activity') {
        const V = window.LIFEHUB_FLO_VOCAB;
        const value = V ? V.match('activity', data.value)
                        : String(data.value || '').toUpperCase();

        if (!value) {
            console.log("🤔 Alexa activity not recognised:", data.value);
        } else {
            db[todayKey].activity = value;

            // PAYOUT & STREAK
            if (!dayData.rewards) dayData.rewards = {};
            if (!dayData.rewards['ACTIVITY']) {
                payPrestige(200, `Activity Log: ${value}`);
                dayData.rewards['ACTIVITY'] = true;

                db.activityStreak = V ? V.nextCount(db.activityStreak)
                                      : (db.activityStreak || 0) + 1;
                checkGenericStreak('ACTIVITY', db.activityStreak);
            }

            dataChanged = true;
        }
    }

    // ------------------------------------
    // 8. GENERAL MOOD LOGGING
    // ------------------------------------
    if (data.action === 'flo_log_mood') {
        const Vm = window.LIFEHUB_FLO_VOCAB;

        /* Spoken words through the matcher, so "completely
           overwhelmed" becomes STRESSED rather than being stored
           verbatim as a mood no icon and no statistic will ever
           match. This used to be a bare toUpperCase(). */
        const newMood = Vm ? Vm.match('mood', data.value)
                           : String(data.value || '').toUpperCase();

        if (!newMood) {
            console.log("🤔 Alexa mood not recognised:", data.value);
        } else if (Vm && Vm.moodSlotAt(getPHNow().getHours())) {
            /* Mood is three check-ins a day now. Alexa was still
               writing one value for the whole day and paying once, so
               anything she said by voice was invisible to the
               homescreen check-in card and to the per-slot payment
               the modal and Poppy both use. */
            const slot = Vm.moodSlotAt(getPHNow().getHours());
            const slots = Object.assign({}, dayData.moodSlots);
            const had = asList(slots[slot.id]);
            if (had.indexOf(newMood) === -1) had.push(newMood);
            slots[slot.id] = had;

            dayData.moodSlots = slots;
            dayData.mood = Vm.moodUnion(slots);

            const done = Vm.moodSlotsDone(dayData);
            const settled = Vm.settleMoodSlots(dayData.moodSlotsPaidFor, done);

            if (settled.amount > 0) {
                payPrestige(settled.amount,
                    `Alexa Mood (${settled.charged.join(', ')}): ${newMood}`);
                dayData.moodSlotsPaidFor = settled.paidFor;

                /* The day-count streak counts DAYS, so it advances on
                   the day's first check-in only. */
                if (settled.paidFor.length === settled.charged.length) {
                    if (!dayData.rewards) dayData.rewards = {};
                    dayData.rewards['MOOD'] = true;
                    db.moodStreak = Vm.nextCount(db.moodStreak);
                    checkGenericStreak('MOOD', db.moodStreak);
                }
            }
            dataChanged = true;

        } else {
            /* The small hours — no check-in to attribute it to, so it
               falls back to the old once-a-day rate, exactly as the
               modal does for a past day. */
            dayData.mood = asList(dayData.mood);
            if (dayData.mood.indexOf(newMood) === -1) dayData.mood.push(newMood);

            if (!dayData.rewards) dayData.rewards = {};
            if (!dayData.rewards['MOOD']) {
                payPrestige(250, `Alexa Mood: ${newMood}`);
                dayData.rewards['MOOD'] = true;
                db.moodStreak = (db.moodStreak || 0) + 1;
                if (db.moodStreak > 30) db.moodStreak = 1;
                checkGenericStreak('MOOD', db.moodStreak);
            }
            dataChanged = true;
        }
    }

    // ------------------------------------
    // 🏁 SAVE & REFRESH
    // ------------------------------------
    if (dataChanged) {
        localStorage.setItem(APP_KEY, JSON.stringify(db));
        if (typeof syncToCloud === 'function') syncToCloud();
        
        // We force current date to today to see changes immediately
        currentDate = getPHNow(); 
        if (typeof updateUI === 'function') updateUI();
        if (typeof updateAlexaState === 'function') updateAlexaState();
    }

    // Cleanup. Safe now: this line is only reached for flo_* commands,
    // so it can no longer throw away another tracker's post.
    setTimeout(() => {
        alexaRef.set(null).catch(err =>
            console.warn("Couldn't clear the Alexa command:", err));
    }, 2000);
});

// ==========================================
// 🧠 ALEXA BRAIN SYNC (PRECISE MATCH)
// ==========================================
function updateAlexaState() {
    const db = JSON.parse(localStorage.getItem(APP_KEY)) || {};
    
    // 1. Get Current Context
    let currentDay = getCycleDay(currentDate);
    const dateKey = getLocalKey(currentDate);
    const dayData = db[dateKey] || {}; 
    
    // 2. Determine Phase — the same phaseFor() the screen uses, so what
    // Alexa says and what the page shows can no longer drift apart.
    const phaseResult = phaseFor(currentDay, {
        isPeriodActive: db.isPeriodActive,
        isMenstrual: dayData.isMenstrual
    });
    const currentPhase = phaseResult.phase;

    // 3. What can honestly be said
    //
    // These used to be arithmetic on a hardcoded 28 — a number that came
    // from nobody's body in particular. They now come from Jen's own
    // recorded cycles, and every one is published alongside how much it
    // should be trusted, so Alexa can hedge instead of asserting.
    const A = window.FloAnalysis;
    const notPast = (n) => Math.max(0, n);
    const len = getCycleLength(db);

    let stats = { count: 0, median: null, min: null, max: null, spread: null };
    let prediction = null;
    let analysis = { tempShift: null, fertileMucusDays: [], ovulationConfirmed: null };
    let cycleStartKey = null;

    if (A) {
        const starts = A.periodStarts(db, { excludePack: true });
        stats = A.cycleStats(starts);
        cycleStartKey = starts.length ? starts[starts.length - 1] : null;
        if (cycleStartKey) {
            prediction = A.predictNextPeriod(stats, cycleStartKey, dateKey);
            analysis = A.analyseCycle(db, cycleStartKey, dateKey);
        }
    }

    // Kept for the existing Alexa phrasing, now measured against HER
    // median rather than 28.
    const daysToPeriod = prediction ? prediction.daysToLikely : notPast((len - currentDay) + 1);
    const daysToLutealEnd = notPast(len - currentDay);

    // Ovulation is NOT predicted from a day number any more. It is
    // reported only once the temperatures actually showed a sustained
    // rise — which is always after the fact, and never happens at all in
    // a cycle without ovulation. Null is a valid, honest answer.
    const ovulationConfirmedOn = analysis.ovulationConfirmed;

    // 4. Publish to Firebase
    if (typeof dbCloud !== 'undefined') {
        dbCloud.ref('alexa_flo_state').set({
            phase: currentPhase,
            // false means "worked out from your cycle length", not observed.
            phaseObserved: phaseResult.observed,
            day: currentDay,

            // Her own numbers.
            cycleLengthMedian: stats.median || null,
            cycleLengthMin: stats.min || null,
            cycleLengthMax: stats.max || null,
            cyclesRecorded: stats.count || 0,

            // A range, because a single date would overstate the case.
            daysToPeriod: daysToPeriod,
            daysToPeriodEarliest: prediction ? prediction.daysToEarliest : null,
            daysToPeriodLatest: prediction ? prediction.daysToLatest : null,
            // Low spread and 3+ cycles. False = Alexa should hedge.
            predictionConfident: prediction ? prediction.confident : false,

            // Observed, not forecast.
            ovulationConfirmedOn: ovulationConfirmedOn,
            tempShiftOn: analysis.tempShift ? analysis.tempShift.shiftKey : null,
            fertileMucusDays: analysis.fertileMucusDays.slice(-5),

            daysToLutealEnd: daysToLutealEnd,

            /* Whether a period is running RIGHT NOW, as opposed to
               where the arithmetic thinks she is. Poppy needs it to
               avoid starting one that is already started, and to
               answer "am I still on" without guessing from a phase. */
            periodActive: !!db.isPeriodActive,
            lastPeriodStart: cycleStartKey || null,

            /* ── THE PILL ──────────────────────────────────────────
               Published onto the same cheat sheet the cycle uses, so
               Alexa and Poppy both read one node and can never
               disagree about which tablet today is. Everything here
               is derived from the pack and the day records — nothing
               is a second source of truth. */
            pill: buildPillState(db),

            lastUpdate: Date.now()
        });
        console.log(`📡 Alexa Sync: Day ${currentDay} (${currentPhase}` +
                    `${phaseResult.observed ? ', logged' : ', estimated'})` +
                    (ovulationConfirmedOn ? ` · ovulation ~${ovulationConfirmedOn}` : ''));
    }
}


