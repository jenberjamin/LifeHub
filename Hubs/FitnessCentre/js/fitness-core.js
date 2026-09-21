/* FILENAME: core.js
   AUTHOR: JEN BERJAMIN
   VERSION: 5.0
*/

// --- 1. STORAGE KEYS ---
const STORAGE_KEY_LOGS = "LifeHub_Measurements";
const STORAGE_KEY_GOALS = "LifeHub_Goals";
const STORAGE_KEY_GALLERY = "LifeHub_Gallery";
const STORAGE_KEY_USER = "LifeHub_RPG_User"; 
const STORAGE_KEY_TEMPLATES = "lh_templates"; // Added for Sync
const STORAGE_KEY_EXERCISES = "lh_exercises"; // The exercise library

// --- 2. CONFIGURATION & RULES ---
const SYSTEM_CONFIG = {
    exchangeRate: 10,         // 10 MGP = 1 FP
    baseCompleteFP: 20,       // Full Workout
    basePartialFP: 10,        // Partial Workout 
    prestigeRatio: 0.8,       // 80% of FP converts to Prestige
    lutealMultiplier: 1.25,   // +25% Bonus 
    streakBuffer: 48,         // Hours before streak breaks
    graceCap: 2,              // Max Grace uses per week
    maxSetScore: 15           // Cap set score to prevent economy breaks
};

/* --- HEIGHT & BMI -----------------------------------------------------
   One height, read from one place.

   BMI used to be worked out in three places from three different heights:
   the measurements page used UserProfile.height or 165, while the gallery
   and the lobby HUD each hardcoded 1.60 m. The same 52 kg therefore read
   as 19.1 on one page and 20.3 on the other two. Worse, `height` was
   never part of the profile schema, so setting it on the measurements
   page changed nothing anywhere else.

   DEFAULT_HEIGHT_CM is a placeholder until she sets her real height once
   on the Measurements page — after which every page follows it. */
const DEFAULT_HEIGHT_CM = 165;

function getHeightCm() {
    const h = parseFloat(typeof UserProfile !== 'undefined' && UserProfile.height);
    return (h > 0) ? h : DEFAULT_HEIGHT_CM;
}

/* Display-ready: every caller prints this straight into the page, and
   "--" is what they should all show when there is no weight to work
   from. */
function calculateBMI(weightKg) {
    const w = parseFloat(weightKg);
    const m = getHeightCm() / 100;
    if (!(w > 0) || !(m > 0)) return "--";
    return (w / (m * m)).toFixed(1);
}

/* Fitness Level Curve (Milestone Progression)
   ──────────────────────────────────────────────────────────────────────
   GATEKEEPER: a tier may carry a `gate`, which holds the rank until a
   named muscle reaches a level. FP keeps accruing while gated — the bar
   pins at 100% and the tracker shows "GATEKEEPER LOCKED (XP BANKING
   ACTIVE)" — and the rank lands the moment the muscle catches up. It
   stops raw volume alone from carrying her past a body part she has been
   avoiding.

       { lvl: 5, req: 400, gate: { muscle: "Glutes", lvl: 3 } }

   `muscle` must match a name in MUSCLE_LEVELS/DISPLAY_ORDER exactly.

   NO TIER DECLARES ONE TODAY, so the whole mechanism is inert: every
   check reads `nextTier.gate` and finds nothing. The engine side is
   written and tested — what's missing is the design call about which
   muscle should hold which rank, which is Jen's to make. Add a gate to
   any tier below and it takes effect immediately, no code change. */
const FITNESS_LEVELS = [
    { lvl: 1, req: 0 },
    { lvl: 2, req: 50 },
    { lvl: 3, req: 150 },
    { lvl: 4, req: 250 }, 
    { lvl: 5, req: 400 }, 
    { lvl: 6, req: 600 },
    { lvl: 7, req: 850 },
    { lvl: 8, req: 1150 },
    { lvl: 9, req: 1500 },
    { lvl: 10, req: 1900 }, 
    { lvl: 11, req: 2350 },
    { lvl: 12, req: 2850 },
    { lvl: 13, req: 3400 },
    { lvl: 14, req: 4000 },
    { lvl: 15, req: 4650 }, 
    { lvl: 16, req: 5350 },
    { lvl: 17, req: 6100 },
    { lvl: 18, req: 6900 },
    { lvl: 19, req: 7750 },
    { lvl: 20, req: 8650 }, 
    { lvl: 21, req: 10000 }
];

// Muscle Group Curve (Arithmetic +100 Gap)
const MUSCLE_LEVELS = [
    { lvl: 1, req: 0 },
    { lvl: 2, req: 100 },
    { lvl: 3, req: 300 },
    { lvl: 4, req: 600 },
    { lvl: 5, req: 1000 },
    { lvl: 6, req: 1500 },
    { lvl: 7, req: 2100 },
    { lvl: 8, req: 2800 },
    { lvl: 9, req: 3600 },
    { lvl: 10, req: 4500 }
];

// --- 3. INITIALIZATION ---

/* These four are read straight out of localStorage, which is now a CACHE of
   the cloud vault rather than the source of truth. hydrateFromCache() below
   re-runs this whole block, so a vault update landing while the page is open
   refreshes them in place instead of needing a reload. */

let historyLogs, goals, galleryPosts, UserProfile;

function hydrateFromCache() {

// Legacy Data
historyLogs = loadData(STORAGE_KEY_LOGS, []);
goals = loadData(STORAGE_KEY_GOALS, { "Weight": 40 });
galleryPosts = loadData(STORAGE_KEY_GALLERY, []);

// RPG User Data (The "Character Sheet")
UserProfile = loadData(STORAGE_KEY_USER, {
    fitnessPoints: 0,    
    fitnessLevel: 1,
    prestigeCurrency: 0,
    height: DEFAULT_HEIGHT_CM,
    streak: 0,
    bestStreak: 0,
    lastWorkout: null,
    graceUsed: 0,        
    lastGraceWeek: getWeekNumber(new Date()), 
    muscles: {},         
    prs: {},
    systemLogs: [],
    profileSlides: [],
    schedule: {} 
});

// --- SYSTEM PATCH: DATA MIGRATION ---
if (!UserProfile.prs) UserProfile.prs = {};
if (!UserProfile.muscles) UserProfile.muscles = {};
if (typeof UserProfile.prestigeCurrency === 'undefined') UserProfile.prestigeCurrency = 0;
if (typeof UserProfile.streak === 'undefined') UserProfile.streak = 0;
if (typeof UserProfile.fitnessPoints === 'undefined') UserProfile.fitnessPoints = 0;
if (!UserProfile.systemLogs) UserProfile.systemLogs = [];
if (!(parseFloat(UserProfile.height) > 0)) UserProfile.height = DEFAULT_HEIGHT_CM;

/* Measurements are assumed to be in date order everywhere — getCurrentLog()
   takes the last element, the chart slices the last N, the compare list is
   indexed by position. Nothing guaranteed it, so a restore that merged the
   backup in a different order would quietly make an older entry "current".
   Sorting once here fixes every reader at the same time, and the next save
   writes the tidy order back. */
if (Array.isArray(historyLogs)) {
    historyLogs.sort((a, b) => {
        const ta = a && a.date ? new Date(a.date).getTime() : 0;
        const tb = b && b.date ? new Date(b.date).getTime() : 0;
        return (isNaN(ta) ? 0 : ta) - (isNaN(tb) ? 0 : tb);
    });
}

/* bestStreak arrived long after the streak did, so there is no stored
   record to read — it has to be seeded once from whatever the history can
   still prove.

   The only durable evidence of a past peak is the milestone lines in the
   system log, and those only fire at 4, 8, 12, 20 and 50. A streak that
   peaked at 19 left a "12 Days" line and nothing above it, so this seeds
   12. It is a FLOOR, not a record: it can understate a real best but can
   never invent one. Anything higher gets picked up the moment the live
   streak passes it. */
if (typeof UserProfile.bestStreak === 'undefined') {
    let seed = UserProfile.streak || 0;

    UserProfile.systemLogs.forEach(log => {
        const found = /\[STREAK MILESTONE\]\s*(\d+)/.exec(log && log.text || "");
        if (found) {
            const days = parseInt(found[1], 10);
            if (days > seed) seed = days;
        }
    });

    UserProfile.bestStreak = seed;
    console.log(`Best streak seeded from history: ${seed} days (floor — milestones only mark 4/8/12/20/50).`);
}
if (!UserProfile.profileSlides) UserProfile.profileSlides = [];
if (!UserProfile.schedule) UserProfile.schedule = {};

}   // end hydrateFromCache

hydrateFromCache();

// Run Weekly Grace Reset Check on Load
checkGraceReset();

console.log("LifeHub Core v5.0: CLOUD CONNECTED");

// --- 4. THE LOGIC ENGINES ---

/* --- WHAT THE NUMBERS IN A SET MEAN ----------------------------------
   A set is stored as a bare positional array — ["20","10"] — with no units
   and no type on it. What each slot means comes entirely from the
   exercise's type, and this table is the only place that says so.

   The Training Deck knew this and built its inputs per type; every screen
   that READ a set back did not. All four of them printed slot 0 as "KG"
   and slot 1 as "REPS", so a plank logged as 30 sec displayed as 30
   kilos for 2 reps. The scoring was always right — it reads the slots
   with the type — but the labels above the numbers lied.

   Order is load-bearing: the slot order here must match the order
   calculateSetScore() reads v1 and v2 in. */
const SET_UNITS = {
    "Weight & Reps":   ["KG", "REPS"],
    "Reps":            ["REPS"],
    "Time":            ["SEC", "MIN"],
    "Distance":        ["M"],
    "Distance & Time": ["M", "MIN"]
};

function unitsFor(type) {
    return SET_UNITS[type] || SET_UNITS["Reps"];
}

/* Find an exercise inside a logged workout.

   Records come in two shapes: newer ones store the library id as `dbId`,
   older ones as `id`. Code that filtered on both and then looked up only
   `dbId` got undefined back and threw on the next line — that bug existed
   separately in the Active Session and the Exercise Index. It lives here
   now so there is one copy to be right.

   Loose == on purpose: ids have been stored as both numbers and strings. */
function findLoggedExercise(log, dbId) {
    if (!log || !Array.isArray(log.exercises)) return null;
    return log.exercises.find(e => e && (e.dbId == dbId || e.id == dbId)) || null;
}

/**
 * ENGINE A: RELATIVE EFFORT CALCULATOR
 */
function calculateSetScore(dbId, type, val1, val2) {
    let vol = 0;
    const v1 = parseFloat(val1) || 0;
    const v2 = parseFloat(val2) || 0;

    if (type === "Weight & Reps") vol = v1 * v2;
    else if (type === "Reps") vol = v1;
    else if (type === "Time") vol = v1 + (v2 * 60);
    else if (type === "Distance") vol = v1;
    // Distance & Time was offered by the Exercise Index but had no branch
    // here at all, so vol stayed 0: it paid a flat 8 points a set, never
    // recorded a PR, and never progressed. Scored on distance, with the
    // time logged alongside it — the engine ranks a set by "more is
    // better" against your own PR, and a pace would need the opposite.
    else if (type === "Distance & Time") vol = v1;
    
    const pr = UserProfile.prs[dbId] || 0;
    let score = 0;

    if (pr === 0) {
        score = 8.0; 
    } else {
        score = (vol / pr) * 10; 
    }

    if (score > SYSTEM_CONFIG.maxSetScore) score = SYSTEM_CONFIG.maxSetScore; 

    return { score: score, vol: vol, isPR: (vol > pr) };
}

/**
 * ENGINE B: WORKOUT PROCESSOR
 */
function processWorkoutSession(activeWorkout, isLuteal, isComplete) {
    const report = {
        earnedMGP: {}, 
        totalSessionMGP: 0,
        baseFP: isComplete ? SYSTEM_CONFIG.baseCompleteFP : SYSTEM_CONFIG.basePartialFP,
        effortFP: 0,
        streakFP: 0,
        totalFP: 0,
        earnedPrestige: 0,
        levelUps: [],
        newPRs: [],
        skippedExercises: [],
        setsPlanned: 0,
        setsCompleted: 0,
        projectedStreak: 0,
        generatedLogs: []
    };

    // 1. Process Exercises for MGP
    //
    // Only ticked sets pay. `ex.completedSets` is a boolean per set, sent
    // up by the active session from the checkboxes she actually pressed.
    // This engine used to score every set in the template whether or not
    // it happened, so ticking one box out of eight still paid for eight —
    // and since prestige is a cut of that, the bank was being quoted a
    // workout she hadn't done.
    //
    // When completedSets is absent the whole exercise counts. That keeps
    // older records and any other caller scoring exactly as before,
    // rather than silently zeroing out history.
    if (activeWorkout.exercises) {
        activeWorkout.exercises.forEach(ex => {
            const plannedSets = (ex.sets && Array.isArray(ex.sets)) ? ex.sets : [];
            const hasTickData = Array.isArray(ex.completedSets);

            const doneSets = plannedSets.filter((set, i) => !hasTickData || ex.completedSets[i]);

            report.setsPlanned += plannedSets.length;
            report.setsCompleted += doneSets.length;

            // Nothing logged against this exercise — no flat bonus, no
            // volume, no PR. It did not happen.
            if (doneSets.length === 0) {
                report.skippedExercises.push(ex.name);
                return;
            }

            let exerciseMGP = 15;
            let maxVolInSession = 0;

            doneSets.forEach(set => {
                const result = calculateSetScore(ex.dbId, ex.type, set[0], set[1]);
                exerciseMGP += result.score;
                if(result.vol > maxVolInSession) maxVolInSession = result.vol;
            });

            const currentPR = UserProfile.prs[ex.dbId] || 0;
            if (maxVolInSession > currentPR) {
                UserProfile.prs[ex.dbId] = maxVolInSession;
                report.newPRs.push(ex.name);
            }

            if(ex.details && ex.details.target && Array.isArray(ex.details.target)) {
                ex.details.target.forEach(muscle => {
                    if (!report.earnedMGP[muscle]) report.earnedMGP[muscle] = 0;
                    report.earnedMGP[muscle] += exerciseMGP;
                    report.totalSessionMGP += exerciseMGP;
                });
            }
        });
    }

    // 2. Luteal Multiplier
    if (isLuteal) {
        const multi = SYSTEM_CONFIG.lutealMultiplier;
        // Multiply first, we round at the end
        report.totalSessionMGP = report.totalSessionMGP * multi;
        report.baseFP = Math.round(report.baseFP * multi); 
        
        for (let m in report.earnedMGP) {
            report.earnedMGP[m] = report.earnedMGP[m] * multi;
        }
        // LOG LUTEAL
        report.generatedLogs.push({
            text: `[LUTEAL BONUS] 25% Multiplier Applied`,
            type: 'bonus', highlight: true
        });
    }

    // 3. CLEAN UP MGP (ROUNDING STEP)
    report.totalSessionMGP = Math.round(report.totalSessionMGP);
    for (let m in report.earnedMGP) {
        report.earnedMGP[m] = Math.round(report.earnedMGP[m]);
    }

    // 4. Currency Exchange (MGP -> FP)
    report.effortFP = Math.round(report.totalSessionMGP / SYSTEM_CONFIG.exchangeRate);

    // 5. Streak Logic
    //
    // Ask the streak rule what today's workout makes it, rather than
    // assuming +1. A second session on a day already counted leaves the
    // streak where it is — and a milestone bonus is only paid on the
    // workout that actually reaches the milestone, not on every workout
    // logged while sitting on it.
    const projectedStreak = projectStreak(new Date());
    const streakAdvanced = projectedStreak > (UserProfile.streak || 0);
    report.projectedStreak = projectedStreak;

    let bonus = 0;

    if (streakAdvanced) {
        if (projectedStreak === 50) bonus = 1500;
        else if (projectedStreak === 20) bonus = 450;
        else if (projectedStreak === 12) bonus = 200;
        else if (projectedStreak === 8) bonus = 100;
        else if (projectedStreak === 4) bonus = 50;
    }

    report.streakFP = bonus;

    if (bonus > 0) {
        report.generatedLogs.push({
            text: `[STREAK MILESTONE] ${projectedStreak} Days! +${bonus} FP`,
            type: 'milestone', highlight: true
        });
    }

    // 6. Totals
    report.totalFP = Math.round(report.baseFP + report.effortFP + report.streakFP);
    report.earnedPrestige = Math.round(report.totalFP * SYSTEM_CONFIG.prestigeRatio);

    // 7. Generate Standard Logs
    const status = isComplete ? "COMPLETE" : "PARTIAL";
    report.generatedLogs.push({
        text: `[WORKOUT ${status}] +${report.baseFP} Base FP`,
        type: 'workout', highlight: false
    });

    for (const [muscle, points] of Object.entries(report.earnedMGP)) {
        if(points > 0) {
            report.generatedLogs.push({
                text: `[+${points} MGP] ${muscle} Growth`,
                type: 'mgp', highlight: false
            });
        }
    }

    if(report.earnedPrestige > 0) {
        report.generatedLogs.push({
            text: `[+${report.earnedPrestige} PRESTIGE] Funds Acquired`,
            type: 'prestige', highlight: true
        });
    }

    // 8. Commit to System
    updateSystem(report);
    
    return report;
}

/**
 * ENGINE C: SYSTEM UPDATE (The Save)
 */
function updateSystem(report) {
    const timestamp = new Date().toISOString();

    // 1. Update Muscles
    for (const [muscle, points] of Object.entries(report.earnedMGP)) {
        if (!UserProfile.muscles[muscle]) UserProfile.muscles[muscle] = { xp: 0, level: 1 };
        
        let mData = UserProfile.muscles[muscle];
        let oldLvl = mData.level;
        mData.xp += points;
        
        let stat = getLevelStatus(mData.xp, MUSCLE_LEVELS);
        mData.level = stat.level;
        
        if (mData.level > oldLvl) {
            report.generatedLogs.push({ text: `[LEVEL UP] ${muscle} -> Level ${mData.level}`, type: 'levelup', highlight: true });
        }
    }

    // 2. Update Fitness Points & Prestige
    let oldFitLvl = UserProfile.fitnessLevel;
    UserProfile.fitnessPoints += report.totalFP;
    UserProfile.prestigeCurrency += report.earnedPrestige;
    
    let fitStat = getLevelStatus(UserProfile.fitnessPoints, FITNESS_LEVELS, true);
    UserProfile.fitnessLevel = fitStat.level;

    if (UserProfile.fitnessLevel > oldFitLvl) {
        report.generatedLogs.push({ text: `[RANK UP] FITNESS LEVEL ${UserProfile.fitnessLevel}`, type: 'levelup', highlight: true });
    }

    // 3. The "Ghost" Streak Logic
    //
    // The number was already decided in step 5 of the processor. Taking
    // it from the report rather than recalculating means the bonus she
    // was paid and the streak she was given can never describe two
    // different workouts.
    const now = new Date();
    UserProfile.streak = report.projectedStreak || projectStreak(now);
    UserProfile.lastWorkout = now.toISOString();

    // The high-water mark. Raised silently — while she is setting a record
    // every day is a new one, and a log line each time would bury the feed.
    if (UserProfile.streak > (UserProfile.bestStreak || 0)) {
        UserProfile.bestStreak = UserProfile.streak;
    }

    // 4. SAVE LOGS TO JOURNAL
    report.generatedLogs.forEach(log => {
        log.date = timestamp;
        UserProfile.systemLogs.push(log);
    });

    if(UserProfile.systemLogs.length > 100) {
        UserProfile.systemLogs = UserProfile.systemLogs.slice(-100);
    }

    saveSystemData();
    console.log("SYSTEM SYNC COMPLETE:", report);
}

/**
 * ENGINE D: LEVEL CALCULATOR (Infinite & Gated)
 */
function getLevelStatus(currentPoints, levelTable, gateCheck = null) {
    let currentLvl = 1;
    let nextThreshold = levelTable[1].req;
    let prevThreshold = 0;
    let tableIndex = -1;
    let isCapped = false;

    for (let i = 0; i < levelTable.length - 1; i++) {
        const nextTier = levelTable[i+1];
        if (currentPoints >= nextTier.req) {
            let isGated = false;
            if (nextTier.gate && gateCheck) {
                const mStat = UserProfile.muscles[nextTier.gate.muscle] || { level: 1 };
                if (mStat.level < nextTier.gate.lvl) isGated = true;
            }
            if (isGated) {
                isCapped = true;
                return { level: levelTable[i].lvl, pct: 100, currentPoints: currentPoints, nextReq: nextTier.req, isCapped: true };
            }
            currentLvl = nextTier.lvl;
            prevThreshold = nextTier.req;
            tableIndex = i + 1;
        } else {
            nextThreshold = nextTier.req;
            break;
        }
    }

    if (tableIndex === levelTable.length - 1 && !isCapped) {
        const lastDefined = levelTable[levelTable.length - 1];
        const extraPoints = currentPoints - lastDefined.req;
        const pointsPerInfiniteLevel = 1000; 
        const extraLevels = Math.floor(extraPoints / pointsPerInfiniteLevel);
        currentLvl = lastDefined.lvl + extraLevels;
        prevThreshold = lastDefined.req + (extraLevels * pointsPerInfiniteLevel);
        nextThreshold = prevThreshold + pointsPerInfiniteLevel;
    }

    const range = nextThreshold - prevThreshold;
    const gained = currentPoints - prevThreshold;
    let pct = Math.floor((gained / range) * 100);
    if (pct > 100) pct = 100;

    return { level: currentLvl, pct: pct, currentPoints: currentPoints, nextReq: nextThreshold, isCapped: isCapped };
}

// --- 5. GRACE SYSTEM ---

function checkGraceReset() {
    const currentWeek = getWeekNumber(new Date());
    if (currentWeek !== UserProfile.lastGraceWeek) {
        UserProfile.graceUsed = 0;
        UserProfile.lastGraceWeek = currentWeek;
        saveSystemData();
        console.log("Weekly Grace Cap Reset");
    }
}

/* How many protected rest days are left this week. Read-only, so the UI
   can warn her BEFORE she commits rather than after. Runs the weekly
   reset first, or a budget from last week would look spent. */
function graceRemaining() {
    checkGraceReset();
    return Math.max(0, SYSTEM_CONFIG.graceCap - (UserProfile.graceUsed || 0));
}

/* Take a rest day.

   The day is ALWAYS recorded — she rested, and the calendar should say so.
   What's rationed is the PROTECTION: only a grace day within the weekly
   cap bridges the streak. Past the cap it's logged honestly and the streak
   takes its chances.

   The bridge is `lastWorkout`. That field is really "last day covered",
   not "last day trained" — projectStreak() measures the gap from it, so
   stamping today tells the streak rule this day is accounted for. The
   streak number is deliberately NOT advanced: paused, exactly as the log
   line has always claimed.

   This function existed and was correct for two years. It simply had no
   callers — the session page grew its own copy that logged the day, spent
   the budget, and forgot this one line, so every Grace day since broke
   the streak it promised to protect. */
function activateGrace(reason) {
    const label = (reason && String(reason).trim()) || "Streak Paused";
    const isProtected = graceRemaining() > 0;

    if (isProtected) {
        UserProfile.graceUsed += 1;
        UserProfile.lastWorkout = new Date().toISOString();
    }

    UserProfile.systemLogs.push({
        text: `[GRACE PROTOCOL] ${label}`,
        date: new Date().toISOString(),
        type: "grace", highlight: true
    });

    saveSystemData();

    return {
        protected: isProtected,
        used: UserProfile.graceUsed || 0,
        cap: SYSTEM_CONFIG.graceCap,
        remaining: graceRemaining(),
        reason: label
    };
}

/* --- STREAK RULE ------------------------------------------------------
   A streak counts DAYS TRAINED, not workouts logged.

   This used to be raw hours between timestamps, which had two faults.
   Two sessions in one afternoon each added a day, so the streak ran
   ahead of the calendar and paid milestone bonuses early. And an
   identical calendar gap counted or didn't depending on the clock —
   Monday 8am to Wednesday 7am was 47 hours and survived, Monday 8pm to
   Wednesday 9pm was 49 hours and reset, though both are "trained, rested
   a day, trained".

   Now it compares local calendar days. streakBuffer stays the source of
   truth, read as the largest gap that survives: 48 hours means she may
   miss one day. */

function dayGap(from, to) {
    const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    return Math.round((b - a) / 86400000);
}

function projectStreak(now) {
    if (!UserProfile.lastWorkout) return 1;

    const last = new Date(UserProfile.lastWorkout);
    if (isNaN(last)) return 1;

    const gap = dayGap(last, now);
    const maxGap = Math.max(1, Math.round(SYSTEM_CONFIG.streakBuffer / 24));

    // Already trained today — the day is banked, nothing more to add.
    if (gap <= 0) return UserProfile.streak || 1;

    if (gap <= maxGap) return (UserProfile.streak || 0) + 1;

    return 1;
}

/* --- WHAT DAY DID THIS HAPPEN ON? ------------------------------------
   The system keeps two different kinds of date and they do not line up.

   Timestamps — system logs, measurements — are written with
   toISOString(), which is UTC. Days — template dates, the date pickers,
   calendar cells — are written in LOCAL time as "YYYY-MM-DD".

   Comparing them by text, which is what `log.date.startsWith(dateStr)`
   and `log.date.split('T')[0]` were both doing, works only while the two
   happen to agree. Here in UTC+8 they disagree for every workout finished
   before 08:00: a session logged at 7am on the 14th is stamped
   "2026-09-13T23:00:00Z" and gets filed under the 13th. Early workouts
   landed on the wrong calendar square, and their MGP and prestige went
   missing from the history card for the day they belonged to.

   This converts a timestamp to the local calendar day it actually
   happened on. A value that is already a plain "YYYY-MM-DD" is returned
   untouched — it has no clock to convert, and parsing it would reintroduce
   the very shift we are removing. */
function localDay(value) {
    if (!value) return "";

    if (typeof value === 'string') {
        const plain = /^(\d{4}-\d{2}-\d{2})$/.exec(value);
        if (plain) return plain[1];
    }

    const d = (value instanceof Date) ? value : new Date(value);
    if (isNaN(d.getTime())) return "";

    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* Midnight at the start of a local day, as a Date.

   Plain "YYYY-MM-DD" values come from date pickers and mean local days, but
   new Date("2026-09-14") parses them as UTC midnight — a different calendar
   day anywhere west of Greenwich. Building the Date from its parts keeps
   everything local. Lived in the gallery; the history log needed it too. */
function localMidnight(ymd) {
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
    if (parts) return new Date(+parts[1], +parts[2] - 1, +parts[3]);

    const d = new Date(ymd);
    return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/* The last instant of a given local day.

   Needed because "as of 14 September" has to include everything logged on
   the 14th. `new Date("2026-09-14")` is UTC midnight, which here is 8am
   local — so a measurement taken at 10am that day fell outside it and a
   photo dated the 14th showed the weight from before it. */
function endOfLocalDay(value) {
    const ymd = localDay(value);
    if (!ymd) return null;

    const p = ymd.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2], 23, 59, 59, 999);
}

function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    var weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
    return weekNo;
}

// --- 6. UTILITIES ---

function loadData(key, fallback) {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
}

// --- MODIFIED SAVE SYSTEM (HYBRID CLOUD) ---
function saveSystemData() {
    // 1. Save Locally (Primary)
    localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(historyLogs));
    localStorage.setItem(STORAGE_KEY_GOALS, JSON.stringify(goals));
    localStorage.setItem(STORAGE_KEY_GALLERY, JSON.stringify(galleryPosts));
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(UserProfile));
    
    console.log("System Saved (Local).");

    // 2. Trigger Cloud Sync (Silent)
    if (window.syncToCloud) {
        window.syncToCloud();
    }
}

/* --- SPARSE MEASUREMENTS ----------------------------------------------
   A record now stores ONLY what was actually typed into it. Logging just a
   weight writes just a weight, instead of copying last week's waist and
   hips in alongside it and presenting them as today's numbers.

   The cost is that no single entry is a complete picture any more, so
   "what is my waist" means "the most recent entry that recorded one".
   That is this function. It returns the value, when it was taken, and
   where it sits in the list, so the caller can walk further back for the
   measurement before it.

   `uptoIndex` limits the search to entries at or before that position —
   used by the compare view to ask what a number was as of some past date.

   Entries written before this change still carry their copied values, and
   there is no way to tell a copied number from a typed one after the fact,
   so history is left exactly as it is. */
function getLatestMeasurement(part, uptoIndex) {
    if (!Array.isArray(historyLogs)) return null;

    let i = (typeof uptoIndex === 'number') ? uptoIndex : historyLogs.length - 1;
    if (i > historyLogs.length - 1) i = historyLogs.length - 1;

    for (; i >= 0; i--) {
        const log = historyLogs[i];
        const raw = (log && log.data) ? log.data[part] : undefined;
        if (raw === undefined || raw === null || raw === '') continue;

        const value = parseFloat(raw);
        if (isNaN(value)) continue;

        return { value: value, date: log.date, index: i };
    }
    return null;
}

function getStatsForDate(targetDateStr) {
    const sortedLogs = [...historyLogs].sort((a, b) => new Date(a.date) - new Date(b.date));
    let foundStats = { Weight: "--", BMI: "--" };

    // The END of that day, so a measurement taken at any hour of it counts.
    const target = endOfLocalDay(targetDateStr);
    if (!target) return foundStats;

    sortedLogs.forEach(log => {
        const logDate = new Date(log.date);
        if (logDate <= target) {
            const w = log.data.Weight;
            if(w) {
                foundStats.Weight = w + "kg";
                foundStats.BMI = calculateBMI(w);   // was a hardcoded 1.60 m
            }
        }
    });
    return foundStats;
}

// --- 8. FIREBASE SATELLITE DISH ---

/* Was the "have we auto-pulled yet this tab" latch, back when a pull only
   happened at boot. The live vault pulls whenever the document changes, so
   nothing reads this any more. restoreFromCloud() below is kept as a manual
   recovery tool — call it from the console. */
const RESTORE_FLAG = "lh_restore_checked";   // vestigial

function getVault() {
    return db.collection("LifeHub_Backups").doc("Jen_Data");
}

/**
 * Is this device a blank slate? If nothing has been logged here, we must
 * NEVER push it up — an empty upload would erase the real vault.
 */
function isLocalBlank() {
    const count = (key) => {
        try {
            const parsed = JSON.parse(localStorage.getItem(key) || "[]");
            return Array.isArray(parsed) ? parsed.length : 0;
        } catch (e) {
            return 0;
        }
    };

    const hasTemplates = count(STORAGE_KEY_TEMPLATES) > 0;
    const hasMeasurements = count(STORAGE_KEY_LOGS) > 0;
    const hasGallery = count(STORAGE_KEY_GALLERY) > 0;
    // The exercise library counts as real data — it is typed in by hand,
    // one exercise at a time, and nothing seeds it. A device holding only
    // the library is a device someone has used.
    const hasExercises = count(STORAGE_KEY_EXERCISES) > 0;
    const hasProgress = UserProfile.fitnessPoints > 0 ||
                        UserProfile.prestigeCurrency > 0 ||
                        (UserProfile.systemLogs && UserProfile.systemLogs.length > 0);

    return !hasTemplates && !hasMeasurements && !hasGallery && !hasExercises && !hasProgress;
}

window.syncToCloud = function() {
    if (typeof db === 'undefined') {
        console.warn("☁️ CLOUD SYNC: Skipped (no Firebase connection)");
        return;
    }

    // SAFETY LATCH: a blank device must never overwrite a populated vault.
    if (isLocalBlank()) {
        console.warn("☁️ CLOUD SYNC: BLOCKED — this device has no data. Refusing to overwrite the cloud backup.");
        return;
    }

    // 1. Get Raw Data (Strings)
    const rawTemplates = localStorage.getItem(STORAGE_KEY_TEMPLATES) || "[]";
    const rawLogs = localStorage.getItem(STORAGE_KEY_LOGS) || "[]";
    const rawGallery = localStorage.getItem(STORAGE_KEY_GALLERY) || "[]";
    const rawExercises = localStorage.getItem(STORAGE_KEY_EXERCISES) || "[]";

    // 2. The Big Data Packet
    // TRICK: We send the data as JSON STRINGS, not Objects.
    // This bypasses the "Nested Array" error completely because
    // Firestore just sees it as a big block of text.
    const payload = {
        userProfile: UserProfile, // This is fine as an object
        measurements_backup: rawLogs,   // Sent as String
        goals: goals,
        gallery_backup: rawGallery,     // Sent as String
        templates_backup: rawTemplates, // Sent as String
        // The exercise library. Without it a restored device gets workouts
        // that reference exercise ids nothing can resolve — every movement
        // renders as "Unknown" and, because muscle credit is looked up
        // through this table, the whole session scores zero MGP.
        exercises_backup: rawExercises, // Sent as String
        lastSync: new Date().toISOString(),
        // Who wrote this. The live listener uses it to recognise its own
        // echo, so our own save doesn't come straight back as a "remote
        // change" and rebuild the page under her hands mid-workout.
        writer: DEVICE_ID
    };

    // 3. Send to Cloud
    getVault().set(payload)
    .then(() => {
        // Remember what we just published, so the echo is identifiable and
        // a genuinely newer remote copy still wins.
        setVaultSeen(payload.lastSync);
        console.log("☁️ CLOUD SYNC: Success (Packed Mode)");
    })
    .catch((error) => {
        console.warn("☁️ CLOUD SYNC: Failed", error);
    });
};

/**
 * The way back down. Pulls the vault into localStorage.
 * Refuses to clobber a device that already has data unless force = true.
 */
window.restoreFromCloud = function(force) {
    if (typeof db === 'undefined') {
        console.warn("☁️ RESTORE: Skipped (no Firebase connection)");
        return Promise.resolve(false);
    }

    return getVault().get().then((snap) => {
        if (!snap.exists) {
            console.log("☁️ RESTORE: No cloud backup found.");
            return false;
        }

        if (!force && !isLocalBlank()) {
            console.log("☁️ RESTORE: This device already has data — skipping. Use restoreFromCloud(true) to force.");
            return false;
        }

        const data = snap.data() || {};

        // The three big ones were stored as strings — drop them straight back in.
        if (typeof data.measurements_backup === 'string') localStorage.setItem(STORAGE_KEY_LOGS, data.measurements_backup);
        if (typeof data.gallery_backup === 'string')      localStorage.setItem(STORAGE_KEY_GALLERY, data.gallery_backup);
        if (typeof data.templates_backup === 'string')    localStorage.setItem(STORAGE_KEY_TEMPLATES, data.templates_backup);
        // Absent from backups written before this key existed, so it stays
        // guarded — an older vault restores everything else and simply
        // leaves the local library alone rather than blanking it.
        if (typeof data.exercises_backup === 'string')    localStorage.setItem(STORAGE_KEY_EXERCISES, data.exercises_backup);
        if (data.goals)       localStorage.setItem(STORAGE_KEY_GOALS, JSON.stringify(data.goals));
        if (data.userProfile) localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(data.userProfile));

        console.log("☁️ RESTORE: Vault recovered (backup dated " + (data.lastSync || "unknown") + ")");
        return true;
    }).catch((error) => {
        console.warn("☁️ RESTORE: Failed", error);
        return false;
    });
};

/* ══════════════════════════════════════════════════════════════════
   9. THE LIVE VAULT — the cloud is the source of truth
   ══════════════════════════════════════════════════════════════════
   localStorage is a CACHE now, not the record. It still boots the page
   instantly and keeps everything working with no signal, but the vault
   decides what is true.

   Before this, the cloud was write-only in practice: bootCloud() pulled
   ONLY when the device was blank and pushed every other time. Anything
   written elsewhere — another device, or Poppy — was overwritten on the
   next save without ever being read. That is why Poppy could not change
   anything here however correctly she wrote it.

   The rules, in one place and deliberately boring:

     · A remote copy NEWER than what we last accepted is applied, and the
       page is told to redraw.
     · A remote copy OLDER than ours means we hold the newer data, so we
       push instead.
     · Our own write echoing back is ignored.
     · A blank vault never overwrites a device that has data, and a blank
       device never pushes over a populated vault. Both directions of
       that latch already existed and both are kept.                     */

const VAULT_SEEN_KEY = "lh_vault_seen";   // lastSync we last wrote or accepted
const DEVICE_KEY     = "lh_device_id";

const DEVICE_ID = (function () {
    let id = null;
    try { id = localStorage.getItem(DEVICE_KEY); } catch (e) {}
    if (!id) {
        id = "dev-" + Math.random().toString(36).slice(2, 10);
        try { localStorage.setItem(DEVICE_KEY, id); } catch (e) {}
    }
    return id;
})();

function vaultSeen() {
    try { return localStorage.getItem(VAULT_SEEN_KEY) || ""; } catch (e) { return ""; }
}
function setVaultSeen(stamp) {
    try { localStorage.setItem(VAULT_SEEN_KEY, stamp || ""); } catch (e) {}
}

/* What to do about a snapshot. Pure on purpose — every branch here is a
   way to lose data, so it is testable without a network.

   Returns "apply" | "push" | "ignore".                                   */
function vaultDecision(remote, seenStamp, localIsBlank, deviceId) {
    if (!remote) return localIsBlank ? "ignore" : "push";      // no vault yet

    const stamp = remote.lastSync || "";

    // Our own write coming back to us.
    if (remote.writer && deviceId && remote.writer === deviceId && stamp === seenStamp) {
        return "ignore";
    }

    // A vault with nothing in it must never wipe a device that has data.
    const remoteBlank = !remote.userProfile &&
                        !remote.templates_backup &&
                        !remote.measurements_backup &&
                        !remote.gallery_backup &&
                        !remote.exercises_backup;
    if (remoteBlank) return localIsBlank ? "ignore" : "push";

    if (!stamp) return "apply";            // vault predates stamping — trust it
    if (!seenStamp) return "apply";        // we have accepted nothing yet

    if (stamp > seenStamp) return "apply"; // ISO strings compare correctly
    if (stamp < seenStamp) return "push";  // we hold something newer
    return "ignore";                       // same copy
}

/* Drop a vault payload into the cache and rebuild every in-memory value
   from it. No reload: the old code called location.reload() to achieve
   this, which is why a pull could only ever happen at boot. */
function applyVault(data) {
    if (!data) return false;

    if (typeof data.measurements_backup === 'string') localStorage.setItem(STORAGE_KEY_LOGS, data.measurements_backup);
    if (typeof data.gallery_backup === 'string')      localStorage.setItem(STORAGE_KEY_GALLERY, data.gallery_backup);
    if (typeof data.templates_backup === 'string')    localStorage.setItem(STORAGE_KEY_TEMPLATES, data.templates_backup);
    if (typeof data.exercises_backup === 'string')    localStorage.setItem(STORAGE_KEY_EXERCISES, data.exercises_backup);
    if (data.goals)       localStorage.setItem(STORAGE_KEY_GOALS, JSON.stringify(data.goals));
    if (data.userProfile) localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(data.userProfile));

    hydrateFromCache();     // re-runs every migration and the date sort
    setVaultSeen(data.lastSync || "");
    return true;
}

/* What pages subscribe to so they can redraw when the vault moves under
   them. Registering is enough — core does the rest. */
window.LIFEHUB_FITNESS = {
    deviceId: DEVICE_ID,
    _subs: [],
    onChange: function (fn) { if (typeof fn === 'function') this._subs.push(fn); return this; },
    _emit: function (reason) {
        this._subs.forEach(function (fn) {
            try { fn(reason); } catch (e) { console.warn("☁️ VAULT: a listener threw", e); }
        });
    }
};

let vaultUnsub = null;

function watchVault() {
    if (typeof db === 'undefined') {
        console.warn("☁️ CLOUD: Offline — running on cached data only.");
        return;
    }
    if (vaultUnsub) return;

    vaultUnsub = getVault().onSnapshot(function (snap) {
        const data = snap.exists ? (snap.data() || null) : null;
        const move = vaultDecision(data, vaultSeen(), isLocalBlank(), DEVICE_ID);

        if (move === "apply") {
            applyVault(data);
            console.log("☁️ VAULT: remote change applied (" + (data.writer || "unknown") + ")");
            window.LIFEHUB_FITNESS._emit("remote");
        } else if (move === "push") {
            console.log("☁️ VAULT: local copy is newer — pushing.");
            window.syncToCloud();
        }
    }, function (err) {
        console.warn("☁️ VAULT: live listener failed — falling back to cache.", err);
    });

    console.log("☁️ VAULT: live (" + DEVICE_ID + ")");
}

/* Let go of the stream. Safe to call when nothing is attached. */
function stopVaultWatch() {
    if (!vaultUnsub) return;
    try { vaultUnsub(); } catch (e) { /* already gone */ }
    vaultUnsub = null;
    console.log("☁️ VAULT: paused");
}

/* Long-lived streams and the back/forward cache do not mix.

   Navigating away from a LifeHub page freezes it into the bfcache instead
   of tearing it down, and a frozen page cannot keep a socket open. Chrome
   reports that as an error on every long-lived connection the page had —
   which in this app is three: Live Server's reload socket, the Realtime
   Database, and (since the vault went live) Firestore's Listen stream.
   The first two have always done this; the third is new because this is
   the first streaming connection the Fitness Centre has ever held.

   Firestore does reconnect on its own, but leaving it to chance in a hub
   she navigates around constantly is what produces the console noise. So:
   drop the stream on the way out, pick it up again on the way back in.
   Re-attaching also re-reads the document, so nothing is missed while it
   was detached. */
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {

    window.addEventListener('pagehide', stopVaultWatch);
    window.addEventListener('freeze', stopVaultWatch);

    // Coming back — from the bfcache, or a fresh load.
    window.addEventListener('pageshow', function () { watchVault(); });

    // A tab returning to the foreground. watchVault() is a no-op when the
    // stream is already healthy, so this only revives a dropped one.
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible') watchVault();
        });
    }
}

function bootCloud() {
    watchVault();
}

setTimeout(bootCloud, 2000);