// --- LIFEHUB CORE: HYDRATION STATION (CONSOLIDATED LEDGER) ---
//
// Wrapped in an IIFE. Everything here used to sit in the global scope,
// including `const firebaseConfig` — which lifehub-navigation-core.js
// also declares. Two classic scripts sharing one global lexical scope
// meant the second to load died with "Identifier 'firebaseConfig' has
// already been declared", so voice navigation never started on this
// page. Nothing leaks out now except the handlers the HTML calls.

(function () {
'use strict';

// 1. CONFIGURATION
const firebaseConfig = {
  apiKey: "AIzaSyABhqON4h0GHjFbZaDT1ysSprmpdczyC6I",
  authDomain: "lifehub-cae1d.firebaseapp.com",
  databaseURL: "https://lifehub-cae1d-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "lifehub-cae1d",
  storageBucket: "lifehub-cae1d.firebasestorage.app",
  messagingSenderId: "471522181748",
  appId: "1:471522181748:web:6861392a45fbbbec8dc721",
  measurementId: "G-2R3WDZNXKG"
};

// 2. INITIALIZATION
// A NAMED app, like the sleep tracker's "SleepApp". The default app
// belongs to lifehub-navigation-core.js; sharing it made the two files
// race to initialise it first.
let app;
try { app = firebase.app("HydrationApp"); }
catch (e) { app = firebase.initializeApp(firebaseConfig, "HydrationApp"); }
const db = firebase.database(app);

// SETTINGS & RATES
// These come from JS/lifehub-hydration-rules.js, which the page loads
// before this file. Poppy reads the same module, so "how much is left"
// cannot mean 100oz on the wallpaper and 120oz here. Change the goal
// there and both follow.
//
// The names below are kept exactly as they were, so nothing further
// down this file had to change.
if (!window.LIFEHUB_HYDRATION) {
    console.error("💧 JS/lifehub-hydration-rules.js must load before tracker-hydration.js.");
    return;
}

const BASE_GOAL     = window.LIFEHUB_HYDRATION.BASE_GOAL;      // oz
const WORKOUT_BONUS = window.LIFEHUB_HYDRATION.WORKOUT_BONUS;  // oz
const RATES         = window.LIFEHUB_HYDRATION.RATES;

// ── MANILA TIME ────────────────────────────────────────────────
// Every date here is a Philippine calendar date. This file used to use
// toISOString(), which returns UTC — so between midnight and 8am Manila
// it produced YESTERDAY's date. Water logged at 2am went into the wrong
// day's node, the drought audit checked the wrong day, and the chart's
// labels (local) disagreed with its data keys (UTC).
const PH_TZ = "Asia/Manila";
const PH_DATE_FMT = new Intl.DateTimeFormat("en-CA", {
    timeZone: PH_TZ, year: "numeric", month: "2-digit", day: "2-digit"
});

function phDateKey(date) { return PH_DATE_FMT.format(date || new Date()); }
function phToday() { return phDateKey(new Date()); }

function phHour() {
    return parseInt(new Date().toLocaleString("en-US", {
        timeZone: PH_TZ, hour12: false, hour: "2-digit"
    }), 10);
}

// Date-key arithmetic with no timezone in play — a key is a bare
// calendar date, so shifting it is pure counting.
function shiftKey(key, days) {
    const [y, m, d] = String(key).split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d) + days * 86400000);
    return t.getUTCFullYear() + '-' +
           String(t.getUTCMonth() + 1).padStart(2, '0') + '-' +
           String(t.getUTCDate()).padStart(2, '0');
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Weekday derived from the KEY, so the bar's label and its data can
// never describe different days.
function labelForKey(key) {
    const [y, m, d] = String(key).split('-').map(Number);
    return DAY_SHORT[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

// STATE
let activeDate = phToday();
let currentGoal = BASE_GOAL;
let isWorkoutDay = false;
let activeListener = null;

let activeDayData = {
    amount: 0,
    totalWage: 0,        // Tracks total points earned today
    ledgerId: null,      // The ID of today's ONE transaction receipt
    logs: [],
    rewardClaimed: false,
    droughtPenaltyApplied: false,
    bonuses: {           // Track which specific bonuses are active
        completion: false,
        streak7: false,
        streak30: false
    }
};

const $ = (id) => document.getElementById(id);

// --- DOM LOADED ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Set Date Picker to Today
    const dateInput = $('logDate');
    if (dateInput) {
        dateInput.value = activeDate;

        // 2. Add Listener for Date Change
        dateInput.addEventListener('change', (e) => {
            activeDate = e.target.value;
            switchDateListener(activeDate);
        });
    }

    // 3. Initial Load
    switchDateListener(activeDate);
    loadHistoryChart();

    // 4. Audit Yesterday (Drought Check)
    auditYesterday();

    // 5. Modal backdrop. This used to run at the top level of the file
    // while the script sat in <head> — #historyModal did not exist yet,
    // so it threw and every line below it, the Alexa listener included,
    // was never reached.
    const modal = $('historyModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) window.closeHistoryModal();
        });
    }

    startAlexaListener();
});

// --- CORE LOGIC ---

function switchDateListener(dateStr) {
    if (activeListener) db.ref('hydration_logs/' + activeListener).off();

    activeListener = dateStr;
    const logRef = db.ref('hydration_logs/' + dateStr);

    logRef.on('value', (snapshot) => {
        const data = snapshot.val();

        if (data) {
            activeDayData.amount = data.total || 0;
            activeDayData.totalWage = data.totalWage || 0;
            activeDayData.ledgerId = data.ledgerId || null;
            activeDayData.logs = data.logs || [];
            activeDayData.rewardClaimed = data.rewardClaimed || false;
            activeDayData.droughtPenaltyApplied = data.droughtPenaltyApplied || false;

            // Load Bonus States
            activeDayData.bonuses = data.bonuses || { completion: false, streak7: false, streak30: false };

            isWorkoutDay = data.workoutMode || false;
            if ($('workoutToggle')) $('workoutToggle').checked = isWorkoutDay;
        } else {
            // New Day
            resetDayState();
        }

        recalcGoal();
        updateUI();
    });
}

function resetDayState() {
    activeDayData = {
        amount: 0,
        totalWage: 0,
        ledgerId: null,
        logs: [],
        rewardClaimed: false,
        droughtPenaltyApplied: false,
        bonuses: { completion: false, streak7: false, streak30: false }
    };
    isWorkoutDay = false;
    if ($('workoutToggle')) $('workoutToggle').checked = false;
}

window.toggleWorkoutMode = function () {
    isWorkoutDay = $('workoutToggle').checked;
    recalcGoal();
    updateUI();

    // Writes only the one field it owns. This used to go through
    // saveToCloud(), which pushed the WHOLE in-memory day back to
    // Firebase — so flicking this switch could quietly overwrite a
    // glass that had arrived from the queue a moment earlier.
    saveWorkoutMode(activeDate, isWorkoutDay).catch(function (err) {
        console.error("Could not save workout mode:", err);
    });
};

function recalcGoal() {
    // Through the shared rules rather than the two constants, so that
    // viewing or backfilling an older date is judged against the goal
    // that was in force then. Doing the arithmetic here would use
    // today's 60oz for a day logged under the old 100oz and hand out a
    // completion bonus the day never earned.
    currentGoal = window.LIFEHUB_HYDRATION.goalFor(isWorkoutDay, activeDate);
}

// 1. ADD WATER (WITH FIRST SIP LOGIC)
//
// ── WHY THIS IS A TRANSACTION ────────────────────────────────────────
// Adding water is three separate trips: read the total, add to it, write
// it back. Between the read and the write, someone else can move the
// number — the wallpaper draining a glass Alexa queued, or this page in
// another tab.
//
// Both would read 40, one would write 48 and the other 52, and the first
// glass would be GONE. Not wrong in the history — absent from it.
//
// A Firebase transaction closes that gap: if the value moved underneath,
// the handler below is simply re-run against the new value. It used to
// be safe by luck, because Alexa's water only landed while this page was
// open. Now that the queue drains on the wallpaper in the background,
// a sip can arrive at the exact moment Jen taps a button.
window.addWater = function (amount) {
    amount = Number(amount);
    if (!amount || amount <= 0 || !isFinite(amount)) return;

    // Everything decided BEFORE the transaction: the handler can be
    // re-run several times, and the clock must not move between attempts.
    const dateStr = activeDate;
    const timeStr = new Date().toLocaleTimeString('en-US', {
        timeZone: PH_TZ, hour: '2-digit', minute: '2-digit'
    });

    // FIRST SIP CHECK (4am - 8am Manila). Only for TODAY. Backfilling
    // last Tuesday at 6am shouldn't pay a morning bonus for a sip that
    // wasn't taken this morning.
    const hour = phHour();
    const isFirstSip = (dateStr === phToday() && hour >= 4 && hour < 8);
    const type = isFirstSip ? "First Sip" : "Standard";
    const totalSipWage = amount * RATES.PER_OZ * (isFirstSip ? RATES.FIRST_SIP_MULT : 1);

    // The receipt id is claimed up front so that creating the day's one
    // ledger row is decided atomically with the water going in. Making a
    // push key costs nothing and touches no network.
    const claim = db.ref('prestige_system/transactions').push().key;
    const ref = db.ref('hydration_logs/' + dateStr);

    ref.transaction(function (current) {
        const day = normaliseDay(current);

        // volume is the raw amount drunk; total is what counts toward
        // the goal. Identical for water — Poppy can log drinks where
        // they differ, so both are kept in step here too.
        day.volume = (Number(day.volume) || day.total) + amount;
        day.total += amount;
        day.totalWage += totalSipWage;

        day.logs.push({
            amount: amount, effective: amount, drink: 'water',
            time: timeStr, type: type, wage: totalSipWage
        });

        if (!day.ledgerId) day.ledgerId = claim;
        return day;
    }).then(function (res) {
        if (!res.committed) return;

        incrementBankBalance(totalSipWage);

        if (isFirstSip) {
            console.log(`⚡ FIRST SIP BONUS ACTIVE! ${amount}oz = ${totalSipWage} pts`);
        }
        return awardBonuses(dateStr, ref, claim);
    }).catch(function (err) {
        // Loudly. A sip that silently failed to save is the one thing
        // this whole rewrite exists to prevent.
        console.error("Could not save that sip:", err);
        alert("Couldn't save that one — check your connection and try again.");
    });
};

window.addCustomWater = function () {
    const input = $('customAmount');
    // parseFloat, not parseInt: "12.5" used to silently become 12.
    const amount = parseFloat(input.value);
    if (amount && amount > 0) {
        window.addWater(Math.round(amount * 10) / 10);
        input.value = '';
    }
};

// 2. UNDO LAST ENTRY
// The button in the HTML has always called this; it was never written,
// so clicking it threw a ReferenceError.
window.undoLast = function () {
    const logs = activeDayData.logs || [];
    if (!logs.length) {
        alert("Nothing to undo for " + activeDate + ".");
        return;
    }

    const last = logs[logs.length - 1];
    const wage = last.wage || 0;

    if (!confirm(`Remove the last entry?\n\n+${last.amount} oz at ${last.time}\n(${wage} pts will be taken back)`)) {
        return;
    }

    // Transactional for the same reason as addWater: this reads the
    // day, removes from it and writes it back, and a glass arriving
    // from the queue in between would otherwise be wiped out by the
    // write. `refund` is recomputed on every attempt because the
    // handler may run more than once.
    const dateStr = activeDate;
    const ref = db.ref('hydration_logs/' + dateStr);

    let refund = 0;
    let removed = null;

    ref.transaction(function (current) {
        if (!current) return;
        const day = normaliseDay(current);
        if (!day.logs.length) return;

        const entry = day.logs.pop();
        const entryWage = Number(entry.wage) || 0;

        // What comes off the goal is what went ON to it. Poppy can log
        // drinks that only partly count — a beer contributes about a
        // third of its volume — and those entries carry an `effective`
        // alongside the volume drunk. Entries from the buttons on this
        // page are always water, where the two are the same number, and
        // entries written before drink types existed have no
        // `effective` at all.
        const countedOz = (entry.effective != null ? entry.effective : entry.amount) || 0;

        day.total = Math.max(0, day.total - countedOz);
        day.volume = Math.max(0, (Number(day.volume) || 0) - (Number(entry.amount) || 0));
        day.totalWage -= entryWage;

        removed = entry;
        refund = entryWage;

        // If this drops the day back under goal, the day is no longer
        // met — so EVERY bonus that being met paid for is released: the
        // flags and the points, so crossing the goal again pays once
        // rather than twice or not at all.
        //
        // The streak bonuses used to be left behind here, and that was
        // the hole worth caring about: cross the goal on day seven,
        // bank the 5,000, undo back under it, and the 5,000 stayed. A
        // glass Alexa misheard could be worth twenty-five thousand
        // points. Anything the day earned by being complete goes when
        // it stops being complete.
        // Through goalFor(), not the constants: a day before the goal
        // changed is still judged by the goal it was logged under.
        const goal = window.LIFEHUB_HYDRATION.goalFor(day.workoutMode, dateStr);
        if (day.total < goal) {
            if (day.bonuses.completion) {
                day.bonuses.completion = false;
                day.rewardClaimed = false;
                day.totalWage -= RATES.COMPLETION;
                refund += RATES.COMPLETION;
            }
            if (day.bonuses.streak7) {
                day.bonuses.streak7 = false;
                day.totalWage -= RATES.STREAK_7;
                refund += RATES.STREAK_7;
            }
            if (day.bonuses.streak30) {
                day.bonuses.streak30 = false;
                day.totalWage -= RATES.STREAK_30;
                refund += RATES.STREAK_30;
            }
        }

        if (day.totalWage < 0) day.totalWage = 0;
        return day;
    }).then(function (res) {
        if (!res.committed || !removed) return;

        incrementBankBalance(-refund);
        return writeReceipt(res.snapshot.val(), null)
            .then(settleHydrationProtocol);
    }).catch(function (err) {
        console.error("Could not undo that:", err);
        alert("Couldn't undo that — check your connection and try again.");
    });
};

// --- FIREBASE SYNC ---

// The Hydration Protocol — Jen's Notion trophies and the Dehydrated
// penalty. The rules and payouts live in JS/lifehub-hydration-protocol.js
// so this page, the homescreen and Poppy all agree on what a trophy is;
// this only kicks it, AFTER the day's node is written, because every
// rule is counted from the logs.
//
// Never allowed to break a sip. The drink is already saved and paid by
// the time this runs.
function settleHydrationProtocol() {
    const P = window.LIFEHUB_HYDRATION_PROTOCOL;
    if (!P || !window.LIFEHUB_PRESTIGE) return Promise.resolve([]);

    return P.settle(db, window.LIFEHUB_PRESTIGE,
                    firebase.database.ServerValue.TIMESTAMP)
            .then((paid) => {
                // Deliberately silent here. This runs on EVERY sip and
                // every flick of the workout switch, and a modal alert
                // on that path would interrupt the one action the
                // tracker exists to make frictionless.
                //
                // The homescreen toast is the notification surface: it
                // watches prestige_system/hydration_protocol and shows
                // whatever this writes, without blocking anything.
                if (paid && paid.length) console.log("[hydration] settled:", paid);
                return paid;
            })
            .catch((e) => {
                console.warn("[hydration] protocol did not settle:", e.message);
                return [];
            });
}

// A day node with every field present and the right type, whether it
// came back from Firebase fully formed, half-written by an older build,
// or not at all. Every transaction handler starts here so none of them
// has to guess.
function normaliseDay(d) {
    const day = Object.assign({
        total: 0,
        totalWage: 0,
        ledgerId: null,
        logs: [],
        workoutMode: false,
        rewardClaimed: false,
        droughtPenaltyApplied: false,
        bonuses: { completion: false, streak7: false, streak30: false }
    }, d || {});

    day.logs = Array.isArray(day.logs) ? day.logs.slice() : [];
    day.bonuses = Object.assign(
        { completion: false, streak7: false, streak30: false }, day.bonuses || {});
    day.total = Number(day.total) || 0;
    day.totalWage = Number(day.totalWage) || 0;
    return day;
}

// The day's ONE ledger row, written or amended in place.
//
// Because the row is amended rather than added to, an undo needs no
// correcting entry — the row simply says a smaller number afterwards,
// and lifetime prestige replays to the right total on its own.
//
// `mine` is the id claimed inside the transaction: if the committed
// node kept it, this call is the one that created the row.
function writeReceipt(day, mine) {
    if (!day || !day.ledgerId) return Promise.resolve();

    let desc = (Math.round((day.total || 0) * 10) / 10) + " oz";
    if (day.bonuses && day.bonuses.completion) desc += " + Completion";
    if (day.bonuses && day.bonuses.streak7)    desc += " + 7 Day Streak";
    if (day.bonuses && day.bonuses.streak30)   desc += " + 30 Day Streak";

    const txRef = db.ref('prestige_system/transactions/' + day.ledgerId);

    if (day.ledgerId === mine) {
        return txRef.set({
            amount: day.totalWage,
            description: desc,
            source: "HYDRATION TRACKER",
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
    }

    // The row exists; only these three move. The timestamp is bumped so
    // the day's line stays near the top of Recent Activity as it grows.
    return txRef.update({
        amount: day.totalWage,
        description: desc,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    });
}

// Only the workout switch. It changes one field and must not carry the
// rest of the in-memory day back to Firebase with it — that write is
// what used to flatten a glass that arrived while the page was open.
function saveWorkoutMode(dateStr, on) {
    return db.ref('hydration_logs/' + dateStr).transaction(function (current) {
        const day = normaliseDay(current);
        day.workoutMode = !!on;
        return day;
    }).then(function (res) {
        if (!res.committed) return;
        // Moving the goal can complete the day, or un-complete it.
        return awardBonuses(dateStr, db.ref('hydration_logs/' + dateStr), null);
    });
}

// --- REWARDS SYSTEM ---
//
// Runs AFTER the water is safely in, not as part of the same
// transaction — deciding the streak needs a read of every other day,
// and a transaction handler may not read. The flag on the day node is
// what stops a bonus being paid twice, and it is set inside a second
// transaction that re-checks it.
function awardBonuses(dateStr, ref, claim) {
    return ref.once('value').then(function (snap) {
        const day = normaliseDay(snap.val());
        const goal = window.LIFEHUB_HYDRATION.goalFor(day.workoutMode, dateStr);

        // Nothing new to pay — just keep the receipt in step with the
        // total, which has just moved.
        if (day.bonuses.completion || day.total < goal) {
            return writeReceipt(day, claim);
        }

        return db.ref('hydration_logs').once('value').then(function (all) {
            const streak = computeStreak(all.val() || {}, dateStr, true);

            let bonus = RATES.COMPLETION;
            const parts = [];
            if (streak > 0 && streak % 7 === 0 && !day.bonuses.streak7) {
                bonus += RATES.STREAK_7; parts.push('streak7');
            }
            if (streak > 0 && streak % 30 === 0 && !day.bonuses.streak30) {
                bonus += RATES.STREAK_30; parts.push('streak30');
            }

            return ref.transaction(function (cur) {
                const d = normaliseDay(cur);
                // Re-checked inside: between the read above and this
                // write, the wallpaper or another tab may have crossed
                // the goal and claimed the bonus already.
                if (d.bonuses.completion) return;      // abort, someone beat us

                d.bonuses.completion = true;
                d.rewardClaimed = true;                // legacy flag, kept
                d.totalWage += RATES.COMPLETION;

                parts.forEach(function (p) {
                    d.bonuses[p] = true;
                    d.totalWage += (p === 'streak7' ? RATES.STREAK_7 : RATES.STREAK_30);
                });
                return d;
            }).then(function (res) {
                const won = res.committed && res.snapshot.val();
                if (!won) return writeReceipt(day, claim);

                incrementBankBalance(bonus);

                let msg = `💧 GOAL MET! \n+${RATES.COMPLETION} Pts.`;
                if (parts.indexOf('streak7') !== -1)  msg += `\n🌴 OASIS BONUS (+${RATES.STREAK_7})`;
                if (parts.indexOf('streak30') !== -1) msg += `\n💎 PURE BONUS (+${RATES.STREAK_30})`;
                alert(msg);

                return writeReceipt(res.snapshot.val(), claim);
            });
        });
    }).then(settleHydrationProtocol);
}

// Consecutive days meeting goal, ending at `endKey`. Shared by the
// bonus check and the header display so the two can't disagree.
//
// Each day is judged by goalFor() with its OWN date, so lowering the
// goal doesn't retroactively turn days that fell short into days that
// met it — which would rebuild a broken streak out of history and pay
// milestones that were never earned.
function computeStreak(data, endKey, assumeEndMet) {
    let streak = 0;
    let key = endKey;

    for (let i = 0; i < 400; i++) {
        const entry = data[key];
        const goal = window.LIFEHUB_HYDRATION.goalFor(entry && entry.workoutMode, key);
        const total = entry ? (entry.total || 0) : 0;
        const met = (i === 0 && assumeEndMet) || (entry && total >= goal);

        if (!met) break;
        streak++;
        key = shiftKey(key, -1);
    }
    return streak;
}

// --- BANKING ENGINE (CONSOLIDATED) ---

function incrementBankBalance(amount) {
    if (!amount) return;
    const balanceRef = db.ref('prestige_system/balance');
    const netWorthRef = db.ref('prestige_system/net_worth');

    // Just update the numbers. The receipt is handled separately.
    balanceRef.transaction(current => (current || 0) + amount);
    if (amount > 0) {
        netWorthRef.transaction(current => (current || 0) + amount);
    }
}

// --- DROUGHT TAX (Audit Yesterday) ---
function auditYesterday() {
    // Manila yesterday. Built from the date key rather than
    // Date.setDate() + toISOString(), which named the day before
    // yesterday during Manila's early hours.
    const yStr = shiftKey(phToday(), -1);

    db.ref('hydration_logs/' + yStr).once('value').then((snapshot) => {
        const data = snapshot.val();
        // If logged < 40oz and NO tax applied yet
        if (data && !data.droughtPenaltyApplied) {
            const total = data.total || 0;
            if (total < RATES.DROUGHT_LIMIT) {
                // Mark applied FIRST. Two tabs open at once both read the
                // unflagged node and both used to fine her.
                db.ref('hydration_logs/' + yStr + '/droughtPenaltyApplied').set(true).then(() => {
                    db.ref('prestige_system/balance').transaction(c => (c || 0) + RATES.DROUGHT_FINE);

                    // Droughts get their own line item, separate from the
                    // consolidated daily receipt.
                    db.ref('prestige_system/transactions').push({
                        amount: RATES.DROUGHT_FINE,
                        description: `Drought Tax (${yStr}: ${total}oz)`,
                        source: "HYDRATION TRACKER",
                        timestamp: firebase.database.ServerValue.TIMESTAMP,

                        // A fine, not spending — so it lowers her rank as
                        // well as her balance. Marked explicitly rather than
                        // left to the words in the description.
                        // See JS/lifehub-prestige-ledger.js.
                        kind: "penalty"
                    });

                    alert(`⚠️ DROUGHT TAX APPLIED\nYesterday's Intake: ${total}oz\nFine: ${RATES.DROUGHT_FINE} Pts`);
                });
            }
        }
    });
}

// --- UI & CHART ---

function updateUI() {
    if ($('currentIntake')) $('currentIntake').innerText = activeDayData.amount;
    if ($('goalIntake')) $('goalIntake').innerText = currentGoal;

    const percentage = Math.min((activeDayData.amount / currentGoal) * 100, 100);
    if ($('percentDisplay')) $('percentDisplay').innerText = Math.round(percentage) + '%';
    if ($('waterWave')) $('waterWave').style.height = percentage + '%';

    const list = $('waterHistory');
    if (!list) return;
    list.innerHTML = '';

    if (activeDayData.logs) {
        activeDayData.logs.slice().reverse().forEach(log => {
            const div = document.createElement('div');
            div.className = 'history-item';

            // First Sip earns the bonus, so it stays marked — a glass
            // rather than the old bolt. Both class names are set because
            // the desktop page loads Material Symbols Outlined and the
            // mobile one loads Rounded; each page defines only its own,
            // so the other class is inert.
            let icon = "";
            if (log.type === "First Sip") {
                const iconStyle = "font-size: 15px; vertical-align: -3px; opacity: 0.6;";
                icon = `<span class="material-symbols-outlined material-symbols-rounded"
                              style="${iconStyle}" title="First Sip bonus">water_drop</span><span
                              class="material-symbols-outlined material-symbols-rounded"
                              style="${iconStyle}" title="First Sip bonus">wb_sunny</span>`;
            }

            div.innerHTML = `
                <span>+${log.amount} oz ${icon}</span>
                <span class="time-stamp">${log.time}</span>
            `;
            list.appendChild(div);
        });
    }
}

function loadHistoryChart() {
    const chartContainer = $('hydrationChart');
    if (!chartContainer) return;

    db.ref('hydration_logs').on('value', (snapshot) => {
        chartContainer.innerHTML = '';
        const data = snapshot.val() || {};
        const today = phToday();

        for (let i = 6; i >= 0; i--) {
            // Key first, label derived FROM the key. These used to be
            // computed independently — the key in UTC and the label in
            // local time — so before 8am the bar marked "Sun" showed
            // Saturday's water.
            const key = shiftKey(today, -i);
            const entry = data[key];
            const val = entry ? (entry.total || 0) : 0;
            const target = (entry && entry.workoutMode) ? (BASE_GOAL + WORKOUT_BONUS) : BASE_GOAL;

            const heightPct = Math.min((val / target) * 100, 100);
            const group = document.createElement('div');
            group.className = 'bar-group';
            group.innerHTML = `
                <div class="water-bar" style="height: ${heightPct}%" title="${val} / ${target} oz"></div>
                <div class="bar-label">${labelForKey(key)}</div>
            `;
            chartContainer.appendChild(group);
        }

        // A real consecutive streak, not "how many of the last 7 days met
        // goal" — which reported "2 Days" for a Monday and a Friday.
        // Today not being finished yet doesn't break it, so the number
        // doesn't drop to zero every midnight: if today isn't met, the
        // count runs from yesterday.
        const todayEntry = data[today];
        const todayGoal = (todayEntry && todayEntry.workoutMode) ? (BASE_GOAL + WORKOUT_BONUS) : BASE_GOAL;
        const todayMet = todayEntry && (todayEntry.total || 0) >= todayGoal;

        const streak = todayMet
            ? computeStreak(data, today, false)
            : computeStreak(data, shiftKey(today, -1), false);

        if ($('streakDisplay')) {
            $('streakDisplay').innerText = streak + (streak === 1 ? " Day" : " Days");
        }
    });
}


// --- MODAL LOGIC (PERSISTED) ---
window.openHistoryModal = function () {
    const modal = $('historyModal');
    const container = $('fullHistoryList');
    container.innerHTML = '<div style="text-align:center; padding:20px; opacity:0.5;">Loading Archive...</div>';
    modal.classList.add('active');

    db.ref('hydration_logs').once('value').then((snapshot) => {
        const data = snapshot.val();
        container.innerHTML = '';
        if (!data) { container.innerHTML = '<div style="text-align:center;">No records.</div>'; return; }

        const historyArray = Object.entries(data).map(([date, info]) => {
            const dailyGoal = info.workoutMode ? (BASE_GOAL + WORKOUT_BONUS) : BASE_GOAL;
            const total = info.total || 0;
            return {
                date: date,
                total: total,
                goal: dailyGoal,
                metGoal: total >= dailyGoal
            };
        });
        // Plain string compare — these are YYYY-MM-DD keys, which sort
        // chronologically on their own. No Date parsing, no timezone.
        historyArray.sort((a, b) => b.date.localeCompare(a.date));

        historyArray.forEach(day => {
            const row = document.createElement('div');
            row.className = 'history-row-compact';
            const statusIcon = day.metGoal ? '★' : '';
            row.innerHTML = `
                <div>
                    <div class="h-date">${day.date}</div>
                    <div class="h-meta">${day.metGoal ? 'Goal Met' : 'Incomplete'} ${statusIcon}</div>
                </div>
                <div style="text-align:right;">
                    <div class="h-total">${day.total} oz</div>
                    <div class="h-meta">Target: ${day.goal}</div>
                </div>
            `;
            container.appendChild(row);
        });
    });
};

window.closeHistoryModal = function () {
    const modal = $('historyModal');
    if (modal) modal.classList.remove('active');
};


// ==========================================
// 🚀 ALEXA REAL-TIME LISTENER
// ==========================================
function startAlexaListener() {
    const alexaRef = db.ref('alexa_updates');

    // Commands sit in the database until something clears them, and this
    // listener fires once on connect with whatever is already there. So
    // an old add_water re-poured itself on every page load, and two open
    // tabs both counted the same glass.
    //
    // The window is generous because Alexa is usually spoken to while the
    // laptop is shut — a short one would silently bin the glass. It is
    // safe to be generous because the command carries the Manila day it
    // was drunk on, and the date guard below refuses anything that isn't
    // today. The cost of a stale command is a glass logged late, never a
    // glass logged on the wrong day.
    const COMMAND_MAX_AGE_MS = 6 * 60 * 60 * 1000;   // 6 hours
    const SEEN_KEY = 'hydration_last_alexa_ts';

    const alreadyHandled = (ts) => {
        try { return ts && Number(localStorage.getItem(SEEN_KEY)) >= ts; }
        catch (e) { return false; }
    };
    const markHandled = (ts) => {
        try { if (ts) localStorage.setItem(SEEN_KEY, String(ts)); }
        catch (e) { /* private mode — the age check still applies */ }
    };

    alexaRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        // alexa_updates is shared with sleep, FLO and the upkeep timers.
        // Only this one action belongs to hydration.
        if (data.action !== 'add_water' || !data.amount) return;

        const ts = Number(data.timestamp) || 0;
        if (ts && Date.now() - ts > COMMAND_MAX_AGE_MS) {
            console.log("⌛ Ignoring stale Alexa command from", new Date(ts).toLocaleString());
            return;
        }
        if (alreadyHandled(ts)) return;

        // Two date guards, both about not writing water into the wrong day.
        //
        // 1. The command's own day must be today. A glass spoken at 11pm
        //    and picked up when the page opens at 1am belongs to
        //    yesterday, and this page can only write to the day it has
        //    loaded — so it is skipped rather than misfiled.
        const today = phToday();
        if (data.date && data.date !== today) {
            console.warn("⌛ Alexa command was for " + data.date +
                         ", not today — skipping rather than logging it to the wrong day.");
            return;
        }

        // 2. The page must be showing today. Browsing back through history
        //    used to mean an incoming glass was added to whichever past
        //    day was on screen.
        if (activeDate !== today) {
            console.warn("💧 Alexa sent water while a past date (" + activeDate +
                         ") is open. Switch back to today to log it.");
            return;
        }

        // Recorded BEFORE pouring. If the write fails or the tab closes
        // mid-flight, a missed glass is recoverable by hand; one that
        // re-pours on every reload is not.
        markHandled(ts);

        console.log(`💧 Alexa adding ${data.amount} oz`);
        window.addWater(Number(data.amount));

        setTimeout(() => {
            alexaRef.set(null).catch(err =>
                console.warn("Couldn't clear the Alexa command:", err));
        }, 2000);
    });
}

})();
