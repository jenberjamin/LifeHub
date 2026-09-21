const Alexa = require('ask-sdk-core');
const axios = require('axios');

// ==========================================
// ⚙️ SYSTEM CONFIGURATION
// ==========================================
// OPTIONS: 'Brian' (British Male), 'Matthew' (US Male), 'Joanna' (US Female), 'Danielle' (US Female)
const SYSTEM_VOICE = 'Amy'; 

const FIREBASE_UPDATE_URL = 'https://lifehub-cae1d-default-rtdb.asia-southeast1.firebasedatabase.app/alexa_updates.json';
const FIREBASE_MEMORY_URL = 'https://lifehub-cae1d-default-rtdb.asia-southeast1.firebasedatabase.app/alexa_memory.json';
const FIREBASE_UPKEEP_STATE = 'https://lifehub-cae1d-default-rtdb.asia-southeast1.firebasedatabase.app/alexa_upkeep_state.json';
const TIMEZONE = 'Asia/Manila';

// ==========================================
// 🔔 SENDING A COMMAND
// ==========================================
// Every write to the alexa_updates mailbox goes through here, and the
// only thing it adds is a timestamp.
//
// ── Why this exists ──────────────────────────────────────────────
// alexa_updates is a doorbell that STAYS RUNG. A page's on('value')
// listener fires once the moment it connects, with whatever command is
// already sitting there — so every tracker guards itself the same way:
//
//     const ts = Number(data.timestamp) || 0;
//     if (ts && Date.now() - ts > MAX_AGE) return;   // too old
//     if (alreadyHandled(ts)) return;                // seen it
//     markHandled(ts);
//
// Every one of those guards collapses when the timestamp is missing.
// `ts` becomes 0, the age check is skipped because 0 is falsy,
// alreadyHandled(0) returns false, and markHandled(0) records nothing.
// The command is therefore treated as brand new on every single page
// load, forever, until something else overwrites the mailbox.
//
// Twenty-four commands were being sent without one. "Alexa, check off
// the dishes" re-paid on every reload of the upkeep tracker; a symptom
// spoken once was re-logged and re-paid each time the FLO page opened.
// The guards were all written correctly and none of them could run.
//
// Sleep's commands already carried a timestamp, which is why sleep was
// the one place this never showed up.
// `payload` is merged second, so a command that already sets its own
// timestamp — the sleep ones do — keeps it rather than being stamped
// twice with slightly different numbers.
async function sendCommand(payload) {
    return axios.put(FIREBASE_UPDATE_URL, Object.assign({
        timestamp: Date.now()
    }, payload));
}

// ==========================================
// 📥 THE INTAKE QUEUE
// ==========================================
// Where anything Alexa needs WRITTEN to a tracker goes.
//
// ── Why this exists ──────────────────────────────────────────────
// alexa_updates is a doorbell: it tells a page that is already open to
// do something. That worked for filling in a form Jen was looking at,
// and it silently failed for everything else — a glass of water spoken
// with the laptop shut expired after six hours, and a whole night's
// sleep needed the sleep page open to save itself.
//
// This node is a POSTBOX instead. Items sit here until something
// applies them; nothing expires. The wallpaper drains it
// (JS/homescreen/LifeHub-homescreen-intake-queue.js), because it is
// open whenever the PC is, and because it already has the real logging
// code loaded — the first-sip window, the streak milestones, the sleep
// bands, the Sleep Protocol. Reimplementing those here would give
// every rate a third home to drift out of step with.
//
// So the skill's job is only to say WHAT happened. The rules stay in
// one place.
//
// ── The shape of an item ─────────────────────────────────────────
//   kind        "water" | "water_undo" | "workout" | "sleep"
//   ...fields   whatever that kind needs; passed straight through
//   source      who said it, for the log
//   at          when, so a stuck item can be aged by eye
const FIREBASE_INTAKE_URL = 'https://lifehub-cae1d-default-rtdb.asia-southeast1.firebasedatabase.app/pending_intake.json';

// POST, not PUT: push-style, so two things spoken in a row are two
// items rather than one overwriting the other. PUT on the node is what
// alexa_updates does, and it is exactly why that channel could only
// ever hold one pending thing at a time.
//
// Returns true only if Firebase actually took it. The caller uses that
// to decide what to say out loud — telling Jen a glass is logged when
// it isn't is worse than admitting the write failed.
async function queueIntake(item) {
    try {
        await axios.post(FIREBASE_INTAKE_URL, Object.assign({
            source: 'alexa',
            at: Date.now()
        }, item));
        return true;
    } catch (error) {
        console.log("Intake queue error:", error && error.message);
        return false;
    }
}
const UPKEEP_TASKS = [
    { id: 's1', keys: ['phone'], pts: 40 },
    { id: 's2', keys: ['phone charger'], pts: 30 },
    { id: 's3', keys: ['laptop'], pts: 80 },
    { id: 's4', keys: ['laptop charger'], pts: 50 },
    { id: 's5', keys: ['harddrive', 'drive'], pts: 25 },
    { id: 's6', keys: ['earpods', 'headphone'], pts: 50 },
    { id: 's7', keys: ['alexa'], pts: 30 },
    { id: 's8', keys: ['pc', 'computer'], pts: 120 },
    { id: 's9', keys: ['mouse'], pts: 50 },
    { id: 's10', keys: ['extension', 'cord'], pts: 80 },
    { id: 's11', keys: ['scale', 'weight'], pts: 20 },
    { id: 's12', keys: ['piano'], pts: 40 },
    { id: 's13', keys: ['fan', 'electric fan'], pts: 100 },
    { id: 's14', keys: ['ac', 'aircon', 'conditioner'], pts: 200 },
    { id: 's15', keys: ['desk'], pts: 50 },
    { id: 's16', keys: ['mini desk', 'mini-desk'], pts: 100 },
    { id: 's17', keys: ['mirror'], pts: 30 },
    { id: 's18', keys: ['workout', 'equipment'], pts: 100 },
    { id: 's19', keys: ['easel'], pts: 20 },
    { id: 's20', keys: ['pens', 'pencils'], pts: 20 },
    { id: 's21', keys: ['covers', 'books'], pts: 50 },
    { id: 's22', keys: ['beauty', 'products'], pts: 120 },
    { id: 's23', keys: ['shoes'], pts: 20 },
    { id: 's24', keys: ['wallets'], pts: 25 },
    { id: 's25', keys: ['ids', 'cards'], pts: 30 },
    { id: 's26', keys: ['knobs', 'door'], pts: 100 },
    { id: 's27', keys: ['switches', 'light'], pts: 100 },
    { id: 's28', keys: ['faucets'], pts: 50 },
    { id: 's29', keys: ['handles'], pts: 50 },
    { id: 's30', keys: ['flush', 'toilet'], pts: 50 },
    { id: 's31', keys: ['washing machine', 'touchpad'], pts: 50 },
    { id: 's32', keys: ['remote'], pts: 20 },
    { id: 'u1', keys: ['bed', 'make bed'], pts: 50 },
    { id: 'u2', keys: ['bedsheet', 'sheets'], pts: 100 },
    { id: 'u3', keys: ['pillow', 'cases'], pts: 80 },
    { id: 'u4', keys: ['blanket'], pts: 50 },
    { id: 'u5', keys: ['towel'], pts: 50 },
    { id: 'u6', keys: ['ceiling'], pts: 150 },
    { id: 'u7', keys: ['floor'], pts: 200 },
    { id: 'u8', keys: ['dishes'], pts: 50 },
    { id: 'u9', keys: ['laundry'], pts: 50 },
    { id: 'u15', keys: ['trash', 'garbage'], pts: 50 }
];

// --- HELPER: VOICE WRAPPER ---
// This wraps your text in the voice tags automatically
function say(text) {
    return `<voice name="${SYSTEM_VOICE}">${text}</voice>`;
}

// --- HELPER: GET TIME ---
// Lambda runs on UTC, so every user-facing date and time in this skill has
// to be asked for in Manila terms explicitly. Nothing below may use the
// bare Date getters (getHours/getDate) — they read UTC and will be 8 hours
// behind, which silently files a 1 AM log under the previous day.
// Takes an optional moment so a backdated wake ("I woke up 20 minutes
// ago") can be stamped with the time it actually happened.
function getManilaTime(date) {
    return (date || new Date()).toLocaleTimeString('en-US', {
        timeZone: TIMEZONE,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
    });
}

// --- HELPER: MANILA CALENDAR DATE ("YYYY-MM-DD") ---
// en-CA formats as YYYY-MM-DD, matching the key the browser trackers use
// for sleep_logs. Sending this along with a command means the page files
// the log under the day Jen actually woke up, rather than re-deriving it
// from whatever the laptop clock happens to say when the page is open.
function getManilaDateKey(date) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(date || new Date());
}

// --- HELPER: MANILA HOUR (0-23) ---
function getManilaHour() {
    return parseInt(new Date().toLocaleString('en-US', {
        timeZone: TIMEZONE, hour12: false, hour: '2-digit'
    }), 10);
}

// --- HELPER: CALCULATE DURATION ---
function getDurationString(startTimeMs, endTimeMs) {
    if (!startTimeMs) return null;
    const diffMs = endTimeMs - startTimeMs;
    if (diffMs < 0) return null;

    const diffHrs = Math.floor(diffMs / 3600000); 
    const diffMins = Math.round(((diffMs % 3600000) / 60000));

    let durationText = "";
    if (diffHrs > 0) durationText += `${diffHrs} hours`;
    if (diffHrs > 0 && diffMins > 0) durationText += " and ";
    if (diffMins > 0) durationText += `${diffMins} minutes`;
    
    if (durationText === "") durationText = "less than a minute";
    return durationText;
}

// ==========================================
// 🌙 MODULE: SLEEP TRACKER
// ==========================================

// ── THE WAKE-UP PROTOCOL ──────────────────────────────────────────
// Three scenarios, one shared record:
//
//   1. "I'm going to sleep"  → SleepIntent stamps bedtime, remembers when.
//   2. "I'm up"              → WakeIntent stamps waketime + duration, then
//                              walks quality → feeling → factors and
//                              finalises.
//   3. "Update my sleep log" → UpdateSleepLogIntent re-enters the same walk
//                              without touching the times.
//
// Each step is gated on sessionAttributes.sleepState. Without that gate,
// QualityResponseIntent fires on ANY bare number Jen says — including one
// meant for a FLO or hydration prompt — and patches it into the sleep log.
// (This mirrors the floState bouncer already used further down.)

const SLEEP_STEPS = {
    BEDTIME: 'SLEEP_AWAITING_BEDTIME',
    QUALITY: 'SLEEP_AWAITING_QUALITY',
    FEELING: 'SLEEP_AWAITING_FEELING',
    FACTORS: 'SLEEP_AWAITING_FACTORS'
};

// A bedtime marker is only usable if it was set in the past and within the
// last 16 hours. Anything older is a night Jen never closed out — using it
// would report a duration measured from two nights ago, which is exactly
// how you end up being told you slept 48 hours.
const SLEEP_MARKER_MAX_AGE_MS = 16 * 3600000;

function isFreshSleepStart(startTime, now) {
    if (!startTime) return false;
    const age = (now || Date.now()) - startTime;
    return age > 0 && age < SLEEP_MARKER_MAX_AGE_MS;
}

// The question the walk is currently waiting on, so a handler that
// interrupts it can put Jen back where she was.
function currentSleepQuestion(step) {
    if (step === SLEEP_STEPS.BEDTIME) return "what time did you go to sleep?";
    if (step === SLEEP_STEPS.QUALITY) return "how would you rate your sleep, one to ten?";
    if (step === SLEEP_STEPS.FEELING) return "were you deep and restored, adequate, or inadequate?";
    return "any factors?";
}

// Duration between two Manila "HH:MM" clock times, rolling past midnight.
// Used when Jen supplies the bedtime by voice and there is no timestamp to
// subtract — the same rule the browser's calculateDuration() applies.
function durationFromTimes(bedHHMM, wakeHHMM) {
    const parse = (t) => {
        const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim());
        return m ? (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) : null;
    };
    const bed = parse(bedHHMM);
    const wake = parse(wakeHHMM);
    if (bed === null || wake === null) return null;

    let mins = wake - bed;
    if (mins <= 0) mins += 24 * 60;   // crossed midnight

    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;

    let text = "";
    if (hrs > 0) text += `${hrs} hours`;
    if (hrs > 0 && rem > 0) text += " and ";
    if (rem > 0) text += `${rem} minutes`;
    return text || "less than a minute";
}

function setSleepState(handlerInput, state) {
    const attrs = handlerInput.attributesManager.getSessionAttributes() || {};
    attrs.sleepState = state;
    handlerInput.attributesManager.setSessionAttributes(attrs);
}

function getSleepState(handlerInput) {
    const attrs = handlerInput.attributesManager.getSessionAttributes() || {};
    return attrs.sleepState || null;
}

// Opening the walk claims the session exclusively.
//
// THIS IS THE FIX FOR THE "I SAY YES AND END UP IN FLO" PROBLEM.
// floState and mode are sticky: LogBasalTempIntentHandler sets
// AWAITING_TEMP, LogSymptomHandler sets ONE_SHOT_MED_CHECK, SetZoneIntent
// sets WAITING_FOR_TIMER — and none of them clear it if the conversation
// wanders off. A leftover value then makes the FLO and upkeep handlers
// claim answers that were meant for the sleep questions. Clearing both
// here means the wake-up walk always starts from a clean session.
function beginSleepWalk(handlerInput, step) {
    const attrs = handlerInput.attributesManager.getSessionAttributes() || {};
    attrs.sleepState = step;
    attrs.floState = null;
    attrs.mode = null;
    handlerInput.attributesManager.setSessionAttributes(attrs);
}

// ── THE NIGHT, ACCUMULATED IN THE SESSION ────────────────────────────
// The walk used to build the log in the BROWSER: each step patched a
// field into alexa_updates, the open page put it in its form, and
// finalize_log told that page to press its own save button. Which
// meant a night spoken with the laptop shut was never written at all.
//
// Now every step also remembers itself here, so that by the time she
// answers the last question the session is holding a complete night
// and can post it to the intake queue on its own.
//
// The alexa_updates patches are KEPT. They are now purely cosmetic —
// if the tracker page happens to be open, its fields still fill in as
// she talks, which is nice to watch. It just isn't what saves.
function rememberSleep(handlerInput, patch) {
    const attrs = handlerInput.attributesManager.getSessionAttributes() || {};
    attrs.sleepDraft = Object.assign({}, attrs.sleepDraft, patch);
    handlerInput.attributesManager.setSessionAttributes(attrs);
}

// Shared so that "no factors" and a named factor finish identically.
async function finalizeSleepLog(handlerInput, factorId) {
    const attrs = handlerInput.attributesManager.getSessionAttributes() || {};
    const draft = attrs.sleepDraft || {};

    // The tracker's own chip labels. "None" is the skill's way of saying
    // she declined, not a factor.
    const factors = (factorId && factorId !== "None") ? [factorId] : [];

    // Still patched, so an open page shows the chip light up. Cosmetic.
    try {
        await axios.patch(FIREBASE_UPDATE_URL, {
            factor_tag: factorId,
            last_update: "factor",
            timestamp: Date.now()
        });
    } catch (error) {
        console.log("Firebase Error:", error);
    }

    setSleepState(handlerInput, null);

    // No wake time means this walk came in through "update my sleep
    // log", which re-asks quality → feeling → factors without touching
    // the times. That is an AMENDMENT to a night already on the record,
    // not a new one — queued as such, or it would be refused as a
    // duplicate and the answers she just gave would be dropped.
    const queued = draft.waketime
        ? await queueIntake({
            kind:     "sleep",
            date:     draft.date,
            bedtime:  draft.bedtime,
            waketime: draft.waketime,
            quality:  draft.quality,
            feeling:  draft.feeling,
            factors:  factors
        })
        : await queueIntake({
            kind:     "sleep_amend",
            date:     draft.date || getManilaDateKey(),
            quality:  draft.quality,
            feeling:  draft.feeling,
            factors:  factors
        });

    // The draft is spent either way — a failed queue is reported out
    // loud, and retrying from a stale session would log the wrong times.
    const after = handlerInput.attributesManager.getSessionAttributes() || {};
    after.sleepDraft = null;
    handlerInput.attributesManager.setSessionAttributes(after);

    return queued;
}

const SleepIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'SleepIntent';
    },
    async handle(handlerInput) {
        const timeNow = getManilaTime();
        const timestampNow = Date.now();

        try {
            await sendCommand({
                action: "set_bedtime",
                value: timeNow,
                timestamp: timestampNow
            });
            await axios.patch(FIREBASE_MEMORY_URL, {
                last_sleep_start: timestampNow
            });
        } catch (error) {
            console.log("Firebase Error:", error);
        }

        const speakOutput = `Logging bedtime at ${timeNow}. Goodnight, Jen.`;

        // Nothing follows bedtime, so close the session instead of leaving
        // the ring lit waiting for an answer that never comes.
        return handlerInput.responseBuilder
            .speak(say(speakOutput))
            .withShouldEndSession(true)
            .getResponse();
    }
};

// Shared by WakeIntent ("I'm up") and WakeCorrectionIntent ("I woke up
// twenty minutes ago"). The only thing that differs between them is
// which moment counts as waking, so it is the one argument.
async function runWakeUp(handlerInput, wakeMoment, greeting) {
        const timeNow = getManilaTime(wakeMoment);
        const timestampNow = wakeMoment.getTime();
        const hello = greeting || "Good morning Jen.";

        let startTime = null;
        try {
            const memoryCheck = await axios.get(FIREBASE_MEMORY_URL);
            startTime = memoryCheck.data ? memoryCheck.data.last_sleep_start : null;
        } catch (error) {
            console.log("Firebase Error:", error);
        }

        // ── NO BEDTIME ON RECORD ──────────────────────────────────────
        // Either Jen never said goodnight, or the marker is from a night
        // that was never closed out. Ask instead of guessing: the browser
        // would otherwise compute a duration against whatever stale value
        // is sitting in its bedtime field, which is how a 48-hour night
        // gets logged. Nothing is written to Firebase yet — the record is
        // opened once, in ProvideBedtimeIntentHandler, with both times.
        if (!isFreshSleepStart(startTime, timestampNow)) {
            beginSleepWalk(handlerInput, SLEEP_STEPS.BEDTIME);

            const attrs = handlerInput.attributesManager.getSessionAttributes();
            attrs.pendingWakeTime = timeNow;
            attrs.pendingWakeDate = getManilaDateKey(wakeMoment);
            handlerInput.attributesManager.setSessionAttributes(attrs);

            const why = startTime
                ? "but the bedtime I have on file is too old to use"
                : "but I don't have a bedtime logged from last night";

            return handlerInput.responseBuilder
                .speak(say(`${hello} Clocking wake up at ${timeNow} — ${why}. What time did you go to sleep?`))
                .reprompt(say("What time did you go to sleep? You can also say you don't remember."))
                .getResponse();
        }

        // ── NORMAL PATH: bedtime marker is good ───────────────────────
        const durationString = getDurationString(startTime, timestampNow);
        const durationSpeech = durationString
            ? `That is a total of ${durationString}.`
            : "I have updated the tracker.";

        // The Manila clock time the marker was set at, so the browser can
        // fill its bedtime field from the record rather than from a draft.
        const bedHHMM = new Date(startTime).toLocaleTimeString('en-US', {
            timeZone: TIMEZONE, hour12: false, hour: '2-digit', minute: '2-digit'
        });

        try {
            // put(), not patch(): this OPENS a fresh wake-up record. The
            // quality/feeling/factor steps below patch into it, and the
            // browser reads the finished object when finalize_log lands.
            // Sending the Manila date means the page files the log under
            // the day Jen woke up instead of re-deriving it from the
            // laptop clock whenever the tab happens to be open.
            await sendCommand({
                action: "set_waketime",
                value: timeNow,
                bedtime: bedHHMM,
                date: getManilaDateKey(wakeMoment),
                timestamp: timestampNow
            });

            // Consume the bedtime marker. Left in place, saying "I'm up"
            // twice would measure the second wake from the same old
            // bedtime and report a duration that already elapsed.
            await axios.patch(FIREBASE_MEMORY_URL, { last_sleep_start: null });
        } catch (error) {
            console.log("Firebase Error:", error);
        }

        // The times are the perishable half of the night — true at this
        // moment and nowhere else. Held in the session from here so the
        // log can be written whether or not a page is ever opened.
        rememberSleep(handlerInput, {
            bedtime:  bedHHMM,
            waketime: timeNow,
            date:     getManilaDateKey(wakeMoment)
        });

        beginSleepWalk(handlerInput, SLEEP_STEPS.QUALITY);

        const speakOutput = `${hello} Clocking wake up at ${timeNow}. ${durationSpeech} On a scale of one to ten, how would you rate your sleep quality?`;

        return handlerInput.responseBuilder
            .speak(say(speakOutput))
            .reprompt(say('How would you rate your sleep?'))
            .getResponse();
}

const WakeIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'WakeIntent';
    },
    handle(handlerInput) {
        return runWakeUp(handlerInput, new Date());
    }
};

// "I woke up twenty minutes ago" / "actually, thirty minutes ago".
// This intent was already in the interaction model with a {minutes}
// slot but had no handler, so saying it fell through to the intent
// reflector — Alexa would answer "You just triggered
// WakeCorrectionIntent" and nothing was logged.
const WakeCorrectionIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'WakeCorrectionIntent';
    },
    async handle(handlerInput) {
        const slots = handlerInput.requestEnvelope.request.intent.slots || {};

        // Two optional slots so "twenty minutes ago", "two hours ago" and
        // "an hour and twenty minutes ago" all work. Reading them
        // defensively means this still behaves if only `minutes` exists
        // in the interaction model.
        const num = (s) => {
            const v = s && s.value;
            const n = parseInt(v, 10);
            return isNaN(n) ? 0 : n;
        };
        const hours = num(slots.hours);
        const minutes = num(slots.minutes);
        const mins = hours * 60 + minutes;

        // 12 hours is the ceiling. Beyond that it is not a correction,
        // it is a different night, and backdating that far would report
        // a duration measured from the wrong bedtime.
        if (mins <= 0 || mins > 720) {
            const why = mins > 720
                ? "That's more than twelve hours back — too far for a correction."
                : "";
            return handlerInput.responseBuilder
                .speak(say(`${why} How long ago did you wake up?`.trim()))
                .reprompt(say("Say it in minutes or hours — for example, twenty minutes ago, or two hours ago."))
                .getResponse();
        }

        const wakeMoment = new Date(Date.now() - mins * 60000);
        const spoken = getManilaTime(wakeMoment);
        const step = getSleepState(handlerInput);

        // ── Correcting mid-walk ───────────────────────────────────────
        // The walk is already open and the record already exists, so
        // only the time is amended. Restarting would throw away a
        // quality score she has already given.
        if (step) {
            try {
                await axios.patch(FIREBASE_UPDATE_URL, {
                    value: spoken,
                    timestamp: Date.now()
                });
            } catch (error) {
                console.log("Firebase Error:", error);
            }

            return handlerInput.responseBuilder
                .speak(say(`Corrected — wake up at ${spoken}. Back to it: ${currentSleepQuestion(step)}`))
                .reprompt(say(currentSleepQuestion(step)))
                .getResponse();
        }

        // ── Said instead of "I'm up" ──────────────────────────────────
        // Opens the whole wake-up walk, just backdated.
        return runWakeUp(handlerInput, wakeMoment, "Got it, backdating that.");
    }
};

// Answers "What time did you go to sleep?" — only reachable from the
// BEDTIME step, so the time vocabulary can't collide with anything else.
const ProvideBedtimeIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ProvideBedtimeIntent'
            && getSleepState(handlerInput) === SLEEP_STEPS.BEDTIME;
    },
    async handle(handlerInput) {
        const attrs = handlerInput.attributesManager.getSessionAttributes() || {};
        const slot = handlerInput.requestEnvelope.request.intent.slots.bedtime;
        const spoken = slot && slot.value;

        // AMAZON.TIME resolves vague phrases to period codes — NI (night),
        // EV (evening), MO, AF — which carry no clock time. Re-ask rather
        // than inventing one.
        if (!spoken || !/^\d{1,2}:\d{2}$/.test(spoken)) {
            return handlerInput.responseBuilder
                .speak(say("I need a clock time, like eleven thirty PM. What time did you go to sleep?"))
                .reprompt(say("What time did you go to sleep?"))
                .getResponse();
        }

        const wakeTime = attrs.pendingWakeTime || getManilaTime();
        const durationString = durationFromTimes(spoken, wakeTime);

        try {
            await sendCommand({
                action: "set_waketime",
                value: wakeTime,
                bedtime: spoken,
                date: attrs.pendingWakeDate || getManilaDateKey(),
                timestamp: Date.now()
            });
            await axios.patch(FIREBASE_MEMORY_URL, { last_sleep_start: null });
        } catch (error) {
            console.log("Firebase Error:", error);
        }

        // The bedtime she just spoke, plus the wake time held from the
        // moment she said she was up.
        rememberSleep(handlerInput, {
            bedtime:  spoken,
            waketime: wakeTime,
            date:     attrs.pendingWakeDate || getManilaDateKey()
        });

        setSleepState(handlerInput, SLEEP_STEPS.QUALITY);

        const durationSpeech = durationString ? ` That is a total of ${durationString}.` : "";

        return handlerInput.responseBuilder
            .speak(say(`Got it, ${spoken}.${durationSpeech} On a scale of one to ten, how would you rate your sleep quality?`))
            .reprompt(say('How would you rate your sleep?'))
            .getResponse();
    }
};

// SCENARIO 3: "Update my sleep log" / "Log my sleep"
// Re-runs the quality → feeling → factors walk on its own, for when the
// morning conversation got interrupted or Jen wants to revise it later.
const UpdateSleepLogIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'UpdateSleepLogIntent';
    },
    handle(handlerInput) {
        beginSleepWalk(handlerInput, SLEEP_STEPS.QUALITY);

        return handlerInput.responseBuilder
            .speak(say("Sure. Let's update your sleep log. On a scale of one to ten, how would you rate your sleep quality?"))
            .reprompt(say('How would you rate your sleep?'))
            .getResponse();
    }
};

const QualityResponseIntentHandler = {
    canHandle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes() || {};

        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'QualityResponseIntent'
            // 🔒 BOUNCER: a bare number is only a sleep score while the
            // wake-up walk is actually open. Otherwise "seven" said to any
            // other prompt would land in the sleep log.
            && getSleepState(handlerInput) === SLEEP_STEPS.QUALITY
            && !sessionAttributes.floState;
    },
    async handle(handlerInput) {
        const slot = handlerInput.requestEnvelope.request.intent.slots.score;
        const score = slot && slot.value;

        // Alexa will happily pass "seventy" through AMAZON.NUMBER. Anything
        // off the 1-10 scale is a mishear, so ask again rather than storing it.
        const n = parseInt(score, 10);
        if (!score || isNaN(n) || n < 1 || n > 10) {
            return handlerInput.responseBuilder
                .speak(say("I need a number from one to ten. How would you rate your sleep?"))
                .reprompt(say('A number from one to ten, please.'))
                .getResponse();
        }

        try {
            /* The timestamp is not decoration on a patch — it is what
               makes the listener look at all. A patch leaves the
               PREVIOUS command's timestamp in place, the sleep page
               has already marked that one handled, so alreadyHandled()
               returned true and the score was dropped without a
               sound. The factor and waketime patches already stamp
               themselves; these two were simply missed. */
            await axios.patch(FIREBASE_UPDATE_URL, {
                quality_score: String(n),
                last_update: "quality",
                timestamp: Date.now()
            });
        } catch (error) {
            console.log("Firebase Error:", error);
        }

        rememberSleep(handlerInput, { quality: String(n) });

        setSleepState(handlerInput, SLEEP_STEPS.FEELING);

        const speakOutput = 'Solid. How was your sleep?';
        return handlerInput.responseBuilder
            .speak(say(speakOutput))
            .reprompt(say('Are you feeling restored or groggy?'))
            .getResponse();
    }
};

const FeelingResponseIntentHandler = {
    canHandle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes() || {};

        const step = getSleepState(handlerInput);

        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'FeelingResponseIntent'
            // 🔒 BOUNCER: Only run if we are NOT in a FLO protocol
            && !sessionAttributes.floState
            // 🔒 WALK-ONLY, for the same reason as the factors step below:
            // "adequate" / "inadequate" / "restored" are words another
            // workshop will want. Gated strictly rather than allowing a
            // standalone use, so all three answer intents behave alike.
            && step === SLEEP_STEPS.FEELING;
    },
    async handle(handlerInput) {
        // The model's canonical names are Deep / Light / Groggy, but the
        // browser assigns feeling_status straight into a <select> whose
        // options read "Deep & Restored" / "Adequate" / "Inadequate". A value
        // matching no option sets selectedIndex to -1, so every RESOLVED
        // feeling silently blanked the dropdown — the only value that ever
        // landed was the "Adequate" fallback, meaning this step worked solely
        // when recognition failed. Translated here rather than by renaming
        // the slot ids, so the history already saved from the page keeps the
        // same three strings.
        const FEELING_OPTIONS = {
            'DEEP': 'Deep & Restored',
            'DEEP & RESTORED': 'Deep & Restored',
            'LIGHT': 'Adequate',
            'ADEQUATE': 'Adequate',
            'GROGGY': 'Inadequate',
            'INADEQUATE': 'Inadequate'
        };

        // This chain used to be unguarded: an unresolved slot threw a
        // TypeError, which dropped Jen into the generic error message and
        // lost the whole walk. Fall back to the raw spoken value instead.
        let spokenMood = null;
        try {
            spokenMood = handlerInput.requestEnvelope.request.intent.slots
                .sleepmood.resolutions.resolutionsPerAuthority[0].values[0].value.name;
        } catch (e) {
            const slot = handlerInput.requestEnvelope.request.intent.slots.sleepmood;
            spokenMood = (slot && slot.value) || null;
        }

        // A word the model doesn't carry as a synonym yet ("amazing") lands
        // here. "Adequate" is the middling option and the one the browser
        // will certainly accept — better than a value that blanks the field.
        const moodId = FEELING_OPTIONS[String(spokenMood || '').trim().toUpperCase()]
            || 'Adequate';

        try {
            // Same as the quality patch above: without a fresh
            // timestamp the listener treats this as already handled.
            await axios.patch(FIREBASE_UPDATE_URL, {
                feeling_status: moodId,
                last_update: "feeling",
                timestamp: Date.now()
            });
        } catch (error) {
            console.log("Firebase Error:", error);
        }

        rememberSleep(handlerInput, { feeling: moodId });

        setSleepState(handlerInput, SLEEP_STEPS.FACTORS);

        const speakOutput = 'Noted. Any factors?';
        return handlerInput.responseBuilder
            .speak(say(speakOutput))
            .reprompt(say('Any factors like coffee or late workout?'))
            .getResponse();
    }
};

const FactorResponseIntentHandler = {
    canHandle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes() || {}; // <--- GET ATTRIBUTES

        const step = getSleepState(handlerInput);

        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'FactorResponseIntent'
            // 🔒 THE BOUNCER:
            // If we are currently in ANY Flo state, this handler MUST NOT run.
            // It will step aside so the Flo handlers can catch the input.
            && !sessionAttributes.floState
            // 🔒 WALK-ONLY. Not "step === null || FACTORS" — strictly the
            // factors step. The factor vocabulary ("late workout",
            // "coffee", "deadline", "events") is ordinary language that a
            // future workshop skill will want for its own slots, so this
            // intent must never be live outside the one question that
            // asked for it. It also finalises the log, and a finalise
            // fired outside the walk saves whatever half-filled form the
            // browser happens to be showing.
            && step === SLEEP_STEPS.FACTORS;
    },
    async handle(handlerInput) {
        let factorId = "None";
        try {
            // The slot is `sleepfactor` in the interaction model. This read
            // said `.factor`, which exists nowhere in the model — so the
            // chain threw on EVERY turn and factorId was always "None".
            // The browser skips "None" when picking chips, so no spoken
            // factor has ever reached the tracker, and the FLO branch below
            // was unreachable. The canonical values ("Caffeine", "Late
            // workout", …) already match the chip labels case-insensitively,
            // so nothing else needs translating.
            factorId = handlerInput.requestEnvelope.request.intent.slots.sleepfactor.resolutions.resolutionsPerAuthority[0].values[0].value.name;
        } catch(e) {
            factorId = "None";
        }

        let finalResponse = "Understood. Your sleep tracker has been updated.";
        if (factorId === 'FLO') {
            finalResponse = "Understood, logging sleep factor. Tracker updated.";
        }

        // Writes finalize_log and clears sleepState. Stamped fresh so the
        // browser can tell a live command from one left sitting in the
        // database since this morning.
        await finalizeSleepLog(handlerInput, factorId);

        return handlerInput.responseBuilder
            .speak(say(finalResponse))
            .withShouldEndSession(true)
            .getResponse();
    }
};

// ── THE GATE ──────────────────────────────────────────────────────
// "Yes" and "No" are the answers most likely to be stolen, because four
// different handlers want them: Flo_NegativeHandler, LogSymptomHandler,
// YesIntentHandler and NoIntentHandler. None of them checked whether a
// sleep walk was open, so answering "no" to "Any factors?" landed in
// whichever protocol had stale state — and the sleep log was never
// finalised, because only FactorResponseIntent writes finalize_log.
//
// This handler is registered ABOVE all of them and only wakes up while
// sleepState is set, so it can't affect FLO or the upkeep timers.
const SleepWalkYesNoHandler = {
    canHandle(handlerInput) {
        const name = Alexa.getIntentName(handlerInput.requestEnvelope);
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (name === 'AMAZON.YesIntent' || name === 'AMAZON.NoIntent')
            && getSleepState(handlerInput) !== null;
    },
    async handle(handlerInput) {
        const name = Alexa.getIntentName(handlerInput.requestEnvelope);
        const step = getSleepState(handlerInput);
        const isNo = (name === 'AMAZON.NoIntent');

        // "What time did you go to sleep?" → "No" / "I don't remember".
        // Move on with no times rather than stalling: a log with quality
        // and feeling is worth more than no log at all, and an invented
        // bedtime is worse than a blank one.
        if (step === SLEEP_STEPS.BEDTIME) {
            if (isNo) {
                const attrs = handlerInput.attributesManager.getSessionAttributes() || {};
                try {
                    await sendCommand({
                        action: "set_waketime",
                        value: attrs.pendingWakeTime || getManilaTime(),
                        bedtime: null,          // explicit: browser clears its field
                        date: attrs.pendingWakeDate || getManilaDateKey(),
                        timestamp: Date.now()
                    });
                    await axios.patch(FIREBASE_MEMORY_URL, { last_sleep_start: null });
                } catch (error) {
                    console.log("Firebase Error:", error);
                }

                setSleepState(handlerInput, SLEEP_STEPS.QUALITY);
                return handlerInput.responseBuilder
                    .speak(say("No problem, I'll leave the bedtime blank. On a scale of one to ten, how would you rate your sleep quality?"))
                    .reprompt(say('How would you rate your sleep?'))
                    .getResponse();
            }
            return handlerInput.responseBuilder
                .speak(say("What time did you go to sleep?"))
                .reprompt(say("A time like eleven thirty PM, or say you don't remember."))
                .getResponse();
        }

        // "Any factors?" → "No" is a real answer, and the one that has to
        // finish the log rather than drop it.
        if (step === SLEEP_STEPS.FACTORS) {
            if (isNo) {
                await finalizeSleepLog(handlerInput, "None");
                return handlerInput.responseBuilder
                    .speak(say("No factors then. Your sleep tracker has been updated."))
                    .withShouldEndSession(true)
                    .getResponse();
            }
            return handlerInput.responseBuilder
                .speak(say("Which one? Caffeine, alcohol, deadline, sickness, late workout, events, or FLO."))
                .reprompt(say("Which factor should I log?"))
                .getResponse();
        }

        // Yes/no isn't an answer to "rate one to ten" or "how was your
        // sleep" — re-ask the current question instead of falling through
        // to another protocol.
        if (step === SLEEP_STEPS.QUALITY) {
            return handlerInput.responseBuilder
                .speak(say("I still need a number from one to ten for your sleep quality."))
                .reprompt(say("A number from one to ten, please."))
                .getResponse();
        }

        return handlerInput.responseBuilder
            .speak(say("Were you deep and restored, adequate, or inadequate?"))
            .reprompt(say("Deep and restored, adequate, or inadequate?"))
            .getResponse();
    }
};

// Anything else said mid-walk — a stray FLO or upkeep phrase — would
// otherwise be claimed by that protocol's handler and abandon the walk
// silently. Catch it, say so, and hold the current question.
const SleepWalkGuardHandler = {
    canHandle(handlerInput) {
        const name = Alexa.getIntentName(handlerInput.requestEnvelope);
        // Ambiguous one-word answers only. StartPeriodProtocolIntent is
        // deliberately absent: saying "start period protocol" out loud is an
        // unmistakable request to switch, so it's allowed to take over.
        //
        // The second group is here for a harder reason than ambiguity. Every
        // protocol shares the one alexa_updates node, and each of these
        // handlers writes with put(), not patch() — so "I drank a glass of
        // water" said between the quality and factors questions REPLACED the
        // whole in-progress record. Waketime, bedtime, date and quality were
        // gone, and the finalize_log that followed saved an empty form.
        // Anything that put()s to FIREBASE_UPDATE_URL belongs on this list.
        //
        // StatusReportIntent and CycleQueryIntent are deliberately absent:
        // they only read, so they can't clobber the walk, and there's no
        // reason to stop Jen asking a question halfway through.
        const FLO_AND_UPKEEP = [
            'LogFlowIntent', 'LogSymptomIntent', 'LogMedicineIntent', 'LogNoteIntent',
            'LogBasalTempIntent', 'LogDischargeIntent',
            'LogActivityIntent', 'SetZoneIntent', 'StartTimerIntent', 'PauseTimerIntent',
            // Record-clobbering writers on the shared node:
            'HydrationIntent', 'NavigationIntent', 'StopTimerIntent',
            'CheckOffTaskIntent', 'MenstrualStartIntent', 'MenstrualEndIntent',
            'LogPillIntent', 'LogGeneralMoodIntent'
        ];
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && getSleepState(handlerInput) !== null
            && FLO_AND_UPKEEP.indexOf(name) !== -1;
    },
    handle(handlerInput) {
        const step = getSleepState(handlerInput);
        const question = step === SLEEP_STEPS.BEDTIME
            ? "what time did you go to sleep?"
            : step === SLEEP_STEPS.QUALITY
                ? "how would you rate your sleep, one to ten?"
                : step === SLEEP_STEPS.FEELING
                    ? "were you deep and restored, adequate, or inadequate?"
                    : "any factors?";

        return handlerInput.responseBuilder
            .speak(say(`Let's finish your sleep log first — ${question} Say cancel if you'd rather stop.`))
            .reprompt(say("Say cancel if you'd rather stop."))
            .getResponse();
    }
};


// ==========================================
// 💧 MODULE: HYDRATION TRACKER
// ==========================================

const HydrationIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'HydrationIntent';
    },
    async handle(handlerInput) {
        const slots = handlerInput.requestEnvelope.request.intent.slots;
        let amountToAdd = 0;
        let speechUnit = "ounces";
        let quantity = 1;
        
        if (slots.quantity && slots.quantity.value) {
            quantity = parseFloat(slots.quantity.value);
        }

        let unit = "glass"; 
        if (slots.unit && slots.unit.value) {
             try {
                unit = slots.unit.resolutions.resolutionsPerAuthority[0].values[0].value.name;
             } catch(e) {
                 unit = slots.unit.value;
             }
        }

        // ── UNITS ──────────────────────────────────────────────────
        // A PORT of JS/lifehub-hydration-rules.js. Lambda can't load a
        // browser file, so these numbers are copied — and if that file
        // changes, change these. GLASS_OZ and BOTTLE_OZ are the whole
        // convention.
        //
        // A bottle used to be 16 here and 20 everywhere else, so "a
        // bottle" meant different things to Alexa and to the tracker's
        // own bottle button. 20 wins.
        const GLASS_OZ  = 10;
        const BOTTLE_OZ = 20;
        const LITRE_OZ  = 33.8;

        if (unit === 'liter') {
            amountToAdd = quantity * LITRE_OZ;
            speechUnit = (quantity > 1) ? "liters" : "liter";
        } else if (unit === 'glass') {
            amountToAdd = quantity * GLASS_OZ;
            speechUnit = (quantity > 1) ? "glasses" : "glass";
        } else {
            // Bottle, or an unrecognised unit. This branch left speechUnit
            // as its "ounces" default while multiplying by 16, so "two
            // bottles" logged 32 oz but announced "adding 2 ounces".
            amountToAdd = quantity * BOTTLE_OZ;
            speechUnit = (quantity > 1) ? "bottles" : "bottle";
        }

        amountToAdd = Math.round(amountToAdd * 10) / 10;

        const queued = await queueIntake({
            kind:   "water",
            amount: amountToAdd,
            unit:   "oz",          // already converted above
            drink:  "water",
            // The Manila day this was drunk on. Without it the glass can
            // only be filed under whatever day it happens to be when the
            // queue is drained — one at 11pm applied at 1am would land on
            // the wrong date.
            date:   getManilaDateKey()
        });

        // Told the truth either way. A dropped glass she was told about
        // can be re-logged; one she wasn't cannot.
        const speakOutput = queued
            ? `Understood. Adding ${quantity} ${speechUnit} of water. That's ${amountToAdd} ounces.`
            : `I couldn't reach your tracker just now, so that ${speechUnit} isn't logged. Try me again in a moment.`;

        return handlerInput.responseBuilder
            .speak(say(speakOutput))
            .getResponse();
    }
};

// ==========================================
//  MODULE: TASKS HANDLER
// ==========================================

const SetZoneIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'SetZoneIntent';
    },
    async handle(handlerInput) {
        const newZone = handlerInput.requestEnvelope.request.intent.slots.zone.resolutions.resolutionsPerAuthority[0].values[0].value.name;
        let speakOutput = `Setting the zone to ${newZone}. Should I set the timer?`;
        
        // CONFLICT CHECK
        try {
            const stateCheck = await axios.get(FIREBASE_UPKEEP_STATE);
            const state = stateCheck.data;
            if (state && state.isRunning && state.activeZone !== newZone) {
                speakOutput = `The ${state.activeZone} zone is currently running. Should I stop the timer now?`;
                const sessionAttributes = handlerInput.attributesManager.getSessionAttributes() || {};
                sessionAttributes.conflictZone = state.activeZone; 
                sessionAttributes.mode = "CONFLICT_RESOLUTION";
                handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
                return handlerInput.responseBuilder.speak(say(speakOutput)).reprompt(say("Should I stop the current timer?")).getResponse();
            }
        } catch (e) { console.log("State check error", e); }

        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes() || {};
        sessionAttributes.activeZone = newZone;
        sessionAttributes.mode = "WAITING_FOR_TIMER";
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

        await sendCommand({ action: "set_zone", zone: newZone });

        return handlerInput.responseBuilder.speak(say(speakOutput)).reprompt(say("Should I start the timer?")).getResponse();
    }
};

const YesIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.YesIntent';
    },
    async handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes() || {};
        let speakOutput = "Understood.";

        // 🔒 THE TRAP: If we are waiting for a Note, and she says "Yes",
        // she probably meant "Yes I have a note."
        if (sessionAttributes.floState === "AWAITING_NOTES") {
            return handlerInput.responseBuilder
                .speak(say("Okay, what is the note?"))
                .reprompt(say("Go ahead, I'm listening."))
                .getResponse();
        }

        // ... Your existing Home Upkeep logic (Keep this!) ...
        if (sessionAttributes.mode === "WAITING_FOR_TIMER") {
            const zone = sessionAttributes.activeZone;
            await axios.put(FIREBASE_UPKEEP_STATE, { activeZone: zone, isRunning: true, startTime: Date.now() });
            await sendCommand({ action: "start_timer" });
            speakOutput = `Understood. Setting the timer for the ${zone} now.`;
        } 
        else if (sessionAttributes.mode === "CONFLICT_RESOLUTION") {
            const oldZone = sessionAttributes.conflictZone;
            await sendCommand({ action: "stop_timer" });
            await axios.put(FIREBASE_UPKEEP_STATE, { isRunning: false, activeZone: null });
            speakOutput = `Understood. I have stopped the ${oldZone} timer. Home Upkeep has been updated.`;
        }

        return handlerInput.responseBuilder.speak(say(speakOutput)).getResponse();
    }
};

const NoIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.NoIntent';
    },
    async handle(handlerInput) {
        return handlerInput.responseBuilder.speak(say("Understood.")).getResponse();
    }
};

const StartTimerIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'StartTimerIntent';
    },
    async handle(handlerInput) {
        let speakOutput = "The timer is now running.";
        try {
            const stateCheck = await axios.get(FIREBASE_UPKEEP_STATE);
            if (stateCheck.data && stateCheck.data.activeZone) {
                 await sendCommand({ action: "start_timer" }); 
                 await axios.patch(FIREBASE_UPKEEP_STATE, { isRunning: true });
                 speakOutput = `The timer for the ${stateCheck.data.activeZone} is now running.`;
            } else {
                speakOutput = "Please select a zone first.";
            }
        } catch(e) {}
        return handlerInput.responseBuilder.speak(say(speakOutput)).getResponse();
    }
};

const PauseTimerIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'PauseTimerIntent';
    },
    async handle(handlerInput) {
        await sendCommand({ action: "pause_timer" });
        await axios.patch(FIREBASE_UPKEEP_STATE, { isRunning: false });
        return handlerInput.responseBuilder.speak(say("Understood. The timer for the Home Upkeep has been paused.")).getResponse();
    }
};

const StopTimerIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'StopTimerIntent';
    },
    async handle(handlerInput) {
        let speakOutput = "Home Upkeep has been updated.";
        try {
            const stateCheck = await axios.get(FIREBASE_UPKEEP_STATE);
            if (stateCheck.data && stateCheck.data.startTime) {
                const duration = getDurationString(stateCheck.data.startTime, Date.now());
                speakOutput = `Nice work! That was ${duration}. Home Upkeep has been updated.`;
            }
        } catch(e) {}
        await sendCommand({ action: "stop_timer" });
        await axios.put(FIREBASE_UPKEEP_STATE, { isRunning: false, activeZone: null });
        return handlerInput.responseBuilder.speak(say(speakOutput)).getResponse();
    }
};

const StatusReportIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'StatusReportIntent';
    },
    async handle(handlerInput) {
        let speakOutput = "No active session.";
        try {
            const stateCheck = await axios.get(FIREBASE_UPKEEP_STATE);
            if (stateCheck.data && stateCheck.data.activeZone) {
                const duration = getDurationString(stateCheck.data.startTime, Date.now());
                speakOutput = `Current session for the ${stateCheck.data.activeZone} is ${duration}.`;
            }
        } catch(e) {}
        return handlerInput.responseBuilder.speak(say(speakOutput)).getResponse();
    }
};

const CheckOffTaskIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'CheckOffTaskIntent';
    },
    async handle(handlerInput) {
        const slots = handlerInput.requestEnvelope.request.intent.slots;
        let speakOutput = "I didn't quite catch that, Jen.";
        
        // 1. Check if Alexa successfully resolved the word to an ID
        if (slots.task && 
            slots.task.resolutions && 
            slots.task.resolutions.resolutionsPerAuthority && 
            slots.task.resolutions.resolutionsPerAuthority[0].values) {
            
            // 2. Get the ID (e.g., 's1', 'u15') directly from the resolution
            const taskId = slots.task.resolutions.resolutionsPerAuthority[0].values[0].value.id;
            const taskName = slots.task.resolutions.resolutionsPerAuthority[0].values[0].value.name;

            // 3. Send the specific ID to Firebase
            // Note: tracker-home-upkeep.js expects an array of IDs in 'taskIds'
            await sendCommand({ 
                action: "check_tasks", 
                taskIds: [taskId] 
            });

            speakOutput = `Understood. Checked off ${taskName}.`;
        }

        return handlerInput.responseBuilder
            .speak(say(speakOutput))
            .getResponse();
    }
};

// ==========================================
// 🌸 MODULE: FLO TRACKER (CYCLE PROTOCOL)
// ==========================================

// HELPER: CALCULATE DATE
function getTargetDate(slots) {
    const today = new Date();
    // Default to NOW
    let targetDate = new Date();
    
    // CASE 1: "Yesterday" / "Last Friday" (AMAZON.DATE)
    if (slots.dateInput && slots.dateInput.value) {
        // AMZ dates come as "YYYY-MM-DD"
        targetDate = new Date(slots.dateInput.value);
        // Force time to noon to avoid timezone slippage
        targetDate.setHours(12, 0, 0, 0); 
    }
    
    // CASE 2: "2 days ago" (AMAZON.NUMBER)
    else if (slots.daysAgoInput && slots.daysAgoInput.value) {
        const days = parseInt(slots.daysAgoInput.value);
        targetDate.setDate(today.getDate() - days);
    }

    return targetDate;
}

const MenstrualStartIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'MenstrualStartIntent';
    },
    async handle(handlerInput) {
        // Just send the signal. No timestamps needed from Alexa.
        await sendCommand({ 
            action: "flo_start_period"
        });

        const speakOutput = "I understand. I've logged into the start of your cycle for today.";
        
        return handlerInput.responseBuilder
            .speak(say(speakOutput))
            .getResponse();
    }
};

const MenstrualEndIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'MenstrualEndIntent';
    },
    async handle(handlerInput) {
        await sendCommand({ 
            action: "flo_end_period"
        });

        const speakOutput = "Got it. I've logged the end of your cycle. You'll likely enter your high-energy phase soon.";

        return handlerInput.responseBuilder
            .speak(say(speakOutput))
            .getResponse();
    }
};

// ==========================================
// 🌸 MODULE: FLO TRACKER ( QUERIES)
// ==========================================
const FIREBASE_FLO_STATE = 'https://lifehub-cae1d-default-rtdb.asia-southeast1.firebasedatabase.app/alexa_flo_state.json';

const CycleQueryIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'CycleQueryIntent';
    },
    async handle(handlerInput) {
        let speakOutput = "I am checking your biological clock...";
        let reprompt = "Is there anything else you'd like to know about your cycle?";

        try {
            // 1. Read the Cheat Sheet
            const response = await axios.get(FIREBASE_FLO_STATE);
            const data = response.data;

            if (!data) {
                return handlerInput.responseBuilder
                    .speak("I don't have enough data yet. Please open your LifeHub tracker on your laptop to sync the latest predictions.")
                    .getResponse();
            }

            // 2. Identify the Question
            //
            // The slot is called CycleType in the interaction model.
            // This read slots.queryType, which does not exist — so the
            // slot was ALWAYS undefined, `type` stayed "status", and
            // every branch below was unreachable. Asking "when is my
            // ovulation" got the current phase instead, and so did
            // asking about her period, her follicular phase and her
            // luteal phase. Four answers, one of them ever given.
            //
            // queryType is still read as a fallback in case the model
            // is ever renamed back.
            let type = "status";
            const slots = handlerInput.requestEnvelope.request.intent.slots || {};
            const typeSlot = slots.CycleType || slots.queryType;
            if (typeSlot && typeSlot.value) {
                // Use the Resolution value (ID) if available for cleaner matching
                try {
                    type = typeSlot.resolutions.resolutionsPerAuthority[0].values[0].value.name; 
                } catch(e) {
                    type = typeSlot.value;
                }
            }

            // 3. Formulate Response
            if (type === 'ovulation') {
                speakOutput = `Upon checking, your ovulation would likely start in ${data.daysToOvulation} days.`;
            } 
            else if (type === 'period') {
                speakOutput = `Corresponding to your tracker, your next period would likely start in ${data.daysToPeriod} days.`;
            }
            else if (type === 'follicular') {
                speakOutput = `Corresponding to your tracker, your Follicular phase would start in ${data.daysToFollicular} days.`;
            }
            else if (type === 'luteal') {
                speakOutput = `Corresponding to your tracker, your Luteal phase ends in ${data.daysToLutealEnd} days.`;
            }
            /* THE PILL. The tracker publishes it onto this same cheat
               sheet — which tablet today is, whether it is logged,
               the streak — and nothing here read it, so the one
               question with a definite answer was the one Alexa
               could not give. */
            else if (type === 'pill' || type === 'tablet' || type === 'pack') {
                const p = data.pill;
                if (!p || !p.onPack) {
                    speakOutput = "You're not on a pack at the moment.";
                } else if (p.onBreak) {
                    speakOutput = `You're on your break week. No tablet today, ` +
                                  `and your next pack starts in ${p.nextPackIn} days.`;
                } else {
                    speakOutput = `Today is tablet ${p.tabletNumber} of ${p.activeDays}, ` +
                                  `and your break starts in ${p.breakStartsIn} days. `;
                    speakOutput += p.todayStatus
                        ? `You've already logged it as ${p.todayStatus}` +
                          (p.todayTakenAt ? `, at ${p.todayTakenAt}.` : '.')
                        : `You haven't logged it yet today.`;
                    if (p.streak) {
                        speakOutput += ` Your streak is ${p.streak} day` +
                                       `${p.streak === 1 ? '' : 's'}.`;
                    }
                }
            }
            else {
                // Default: Status / Current Phase
                speakOutput = `According to your record, you are in your ${data.phase} Phase. It is day ${data.day} of your cycle.`;
            }

        } catch (error) {
            console.log("FLO Query Error:", error);
            speakOutput = "I'm having trouble accessing your cycle records right now.";
        }

        // 4. Keep Session Open
        return handlerInput.responseBuilder
            .speak(say(speakOutput))
            .reprompt(say(reprompt)) // This keeps the blue ring on!
            .getResponse();
    }
};

// ==========================================
// 🩸 MODULE: FLO PROTOCOL & LOGGING
// ==========================================

const StartPeriodProtocolHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'StartPeriodProtocolIntent';
    },
    handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes() || {};
        sessionAttributes.floState = "AWAITING_FLOW"; // <--- Set State
        // Mirror of beginSleepWalk(): starting this protocol explicitly
        // takes the session, so an abandoned sleep walk can't keep
        // intercepting the flow and symptom answers below.
        sessionAttributes.sleepState = null;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

        return handlerInput.responseBuilder
            .speak(say("Period protocol initiated. Let's get your symptoms tracked. First, on a scale of one to five, how is your flow today?"))
            .reprompt(say("How is your flow today?"))
            .getResponse();
    }
};

const LogFlowHandler = {
    canHandle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes() || {};
        
        // 1. Standard Activation
        if (Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'LogFlowIntent') {
            return true;
        }

        // 2. THE INTERCEPTOR (Steal "Three" from Sleep Tracker)
        // If we are specifically waiting for FLOW, and Alexa hears a NUMBER (QualityResponse),
        // we grab it right here.
        // ...but NOT while a sleep walk is open. Both protocols ask for a
        // number, and a stale floState used to win, sending the sleep
        // quality score into the FLO tracker instead.
        if (Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'QualityResponseIntent'
            && sessionAttributes.floState === "AWAITING_FLOW"
            && !sessionAttributes.sleepState) {
            return true;
        }

        return false;
    },
    async handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes() || {};
        const slots = handlerInput.requestEnvelope.request.intent.slots;
        
        // GET THE VALUE
        // It might be in 'flow' (LogFlowIntent) or 'score' (QualityResponseIntent)
        let flowVal = "";
        
        if (slots.flow && slots.flow.resolutions && slots.flow.resolutions.resolutionsPerAuthority) {
             // Standard Flow Intent
             flowVal = slots.flow.resolutions.resolutionsPerAuthority[0].values[0].value.name;
        } else if (slots.score && slots.score.value) {
            // Intercepted Number ("Three")
            const num = parseInt(slots.score.value);
            // Map 1-5 Numbers to your Text Values
            if (num === 5) flowVal = "VERY HEAVY";
            else if (num === 4) flowVal = "HEAVY";
            else if (num === 3) flowVal = "NORMAL";
            else if (num === 2) flowVal = "LIGHT";
            else flowVal = "SPOTTING"; // 1
        } else {
            // Fallback for "Heavy" said directly without resolution
            flowVal = slots.flow ? slots.flow.value : "NORMAL";
        }
        
        await sendCommand({ action: "flo_log_flow", value: flowVal });

        // PATH 1: Continue Protocol
        if (sessionAttributes.floState === "AWAITING_FLOW") {
            sessionAttributes.floState = "AWAITING_SYMPTOMS";
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
            return handlerInput.responseBuilder
                .speak(say("I've got it noted. Any physical symptoms you're having?"))
                .reprompt(say("Any symptoms?"))
                .getResponse();
        }

        // PATH 2: One-shot
        return handlerInput.responseBuilder
            .speak(say(`I've updated your FLO tracker. Rest well, Jen.`))
            .getResponse();
    }
};

const LogSymptomHandler = {
    canHandle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes() || {};

        // Standard Intent
        if (Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'LogSymptomIntent') {
            return true;
        }

        // INTERCEPTOR: Steal "Tired", "Groggy", OR "No" from other contexts
        // — but never out from under an open sleep walk, which asks for a
        // feeling of its own.
        if (Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'FeelingResponseIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.NoIntent')
            && sessionAttributes.floState === "AWAITING_SYMPTOMS"
            && !sessionAttributes.sleepState) {
            return true;
        }

        return false;
    },
    async handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes() || {};
        const slots = handlerInput.requestEnvelope.request.intent.slots;
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        
        let symptoms = "";

        // 1. Check for "NO" intent explicitly
        if (intentName === 'AMAZON.NoIntent') {
            symptoms = "EVERYTHING IS FINE";
        }
        // 2. Check the specific list (e.g., "Cramps")
        else if (slots && slots.commonSymptom && 
            slots.commonSymptom.resolutions && 
            slots.commonSymptom.resolutions.resolutionsPerAuthority && 
            slots.commonSymptom.resolutions.resolutionsPerAuthority[0].values) {
            symptoms = slots.commonSymptom.resolutions.resolutionsPerAuthority[0].values[0].value.name;
        } 
        // 3. Fallback to wildcards/moods
        else if (slots && slots.symptomQuery && slots.symptomQuery.value) {
            symptoms = slots.symptomQuery.value;
        }
        // Was `slots.sleepmood && slots.mood.value` — it tested one slot and
        // read a different one, so any turn that filled sleepmood but not
        // mood threw a TypeError and killed the protocol mid-flow.
        else if (slots && slots.sleepmood && slots.sleepmood.value) {
            symptoms = slots.sleepmood.value;
        }
        else if (slots && slots.mood && slots.mood.value) {
            symptoms = slots.mood.value;
        }

        // 🧹 SAM'S TRANSLATOR: Map "None" to the Button ID
        if (['none', 'nothing', 'no', 'nope', 'no symptoms', 'fine', 'im fine', 'i am fine'].includes(symptoms.toLowerCase())) {
            symptoms = "EVERYTHING IS FINE";
        }

        // Default if we still have nothing
        if (!symptoms) symptoms = "Unspecified Symptoms";
        
        await sendCommand({ action: "flo_log_symptoms", value: symptoms });

        // 🧠 SAM'S LOGIC BRANCH:
        if (sessionAttributes.floState === "AWAITING_SYMPTOMS") {
            
            // PATH A: SHE IS FINE -> SKIP MEDICINE -> GO TO NOTES
            if (symptoms === "EVERYTHING IS FINE") {
                sessionAttributes.floState = "AWAITING_NOTES"; // <--- SKIP MEDS
                handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
                
                return handlerInput.responseBuilder
                    .speak(say("Glad to hear that. Since you're feeling good, I'll skip the medicine check. Lastly, any notes or anything unusual?"))
                    .reprompt(say("Any notes?"))
                    .getResponse();
            }
            
            // PATH B: SHE HAS SYMPTOMS -> SHOW EMPATHY -> ASK MEDS
            else {
                sessionAttributes.floState = "AWAITING_MEDICINE";
                handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
                
                return handlerInput.responseBuilder
                    .speak(say(`I've logged ${symptoms}. Did you take any medicine for it?`))
                    .reprompt(say("Did you take any medicine?"))
                    .getResponse();
            }
        }

        // One-shot logic (Outside Protocol)
        let oneShotResponse = `I'm sorry to hear about the ${symptoms}. Did you take anything for it?`;
        if (symptoms === "EVERYTHING IS FINE") {
             oneShotResponse = "Glad to hear that. I've updated your tracker.";
        }

        sessionAttributes.floState = "ONE_SHOT_MED_CHECK"; 
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        return handlerInput.responseBuilder
            .speak(say(oneShotResponse))
            .reprompt(say("Did you take anything?"))
            .getResponse();
    }
};

const LogMedicineHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'LogMedicineIntent';
    },
    async handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes() || {};
        const slots = handlerInput.requestEnvelope.request.intent.slots;
        
        // 🔍 SAM'S FIX: Check Specific Medicine List FIRST
        let med = "";

        // 1. Check specific list (e.g., "Biogesic", "Advil")
        if (slots.commonMed && 
            slots.commonMed.resolutions && 
            slots.commonMed.resolutions.resolutionsPerAuthority && 
            slots.commonMed.resolutions.resolutionsPerAuthority[0].values) {
            
            med = slots.commonMed.resolutions.resolutionsPerAuthority[0].values[0].value.name;
            
        } 
        // 2. Fallback to wildcard (e.g., "Some random herbal tea")
        else if (slots.medQuery && slots.medQuery.value) {
            med = slots.medQuery.value;
        }

        if (!med) med = "Unspecified Medicine";
        
        await sendCommand({ action: "flo_log_medicine", value: med });

        // PATH 1: If in Protocol -> Move to Notes
        if (sessionAttributes.floState === "AWAITING_MEDICINE") {
            sessionAttributes.floState = "AWAITING_NOTES";
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
            return handlerInput.responseBuilder
                .speak(say(`Got it. ${med}. And lastly, anything unusual?`))
                .reprompt(say("Anything else?"))
                .getResponse();
        }

        // PATH 3 & 4: One-shot response
        sessionAttributes.floState = null; 
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        
        return handlerInput.responseBuilder
            .speak(say(`Got it. I've logged ${med} in your health tracker. Rest well, Jen.`))
            .getResponse();
    }
};

// ==========================================
// 📝 MODULE: LOG NOTE HANDLER
// ==========================================
const LogNoteHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'LogNoteIntent';
    },
    async handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes() || {};
        
        // 1. Safely extract the note from the slot
        let note = "";
        const noteSlot = handlerInput.requestEnvelope.request.intent.slots.noteQuery;
        if (noteSlot && noteSlot.value) {
            note = noteSlot.value;
        }

        // 2. Catch bypass phrases (In case Alexa heard "no notes" as the actual note)
        const bypassPhrases = ['no notes', 'no note', 'none', 'nothing', 'nothing else', 'that is it', "that's it", 'that is all', 'nope', 'we are done', "i'm good"];
        
        if (!note || bypassPhrases.includes(note.toLowerCase())) {
            // End Protocol gracefully without logging a blank note to Firebase
            sessionAttributes.floState = null;
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
            return handlerInput.responseBuilder
                .speak(say("Got it. Protocol complete. I've updated your FLO tracker. Rest well, Jen."))
                .getResponse();
        }

        // 3. Log the actual note to Firebase
        await sendCommand({ action: "flo_log_notes", value: note });

        // 4. Smart Routing: In-Protocol vs. Independent Action
        if (sessionAttributes.floState === "AWAITING_NOTES") {
            // End of Protocol
            sessionAttributes.floState = null;
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

            return handlerInput.responseBuilder
                .speak(say("Noted. Your FLO Tracker has been updated. Period Protocol is done. Rest well, Jen."))
                .getResponse();
        } else {
            // Independent One-Shot Trigger (You triggered this outside the protocol)
            // Cleanup state just in case
            sessionAttributes.floState = null;
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
            
            return handlerInput.responseBuilder
                .speak(say("I've added your note to the cycle tracker. Rest well, Jen."))
                .getResponse();
        }
    }
};


// ==========================================
// 🛑 MODULE: SMART GRACEFUL EXIT  ⚠️ NOT REGISTERED — DEAD CODE
// ==========================================
// Deliberately left out of addRequestHandlers(). It could never run:
// CancelAndStopIntentHandler is registered second and takes Cancel/Stop,
// and NoIntentHandler takes AMAZON.NoIntent long before this. Its one
// piece of logic also reads sessionAttributes.question_type, which
// nothing in this skill ever sets.
//
// Kept only for reference. To actually use it, register it ABOVE both of
// those handlers and start setting question_type somewhere.
const GracefulExitHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.NoIntent');
    },
    handle(handlerInput) {
        // 1. Check if LifeHub is currently waiting for a specific answer
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        
        // If we have a 'question_type' stored, it means we are in the middle of a check-up.
        // We shouldn't exit yet. We should redirect to the right place.
        // (This is a safety net. Ideally, your Specific Intents catch this first.)
        if (sessionAttributes.question_type === 'symptoms') {
             return handlerInput.responseBuilder
                .speak("Got it. No symptoms logged. Anything else?")
                .reprompt("Anything else?")
                .getResponse();
        }

        // 2. If no specific question is pending, then we perform the Graceful Exit
        const speakOutput = 'Understood. Keeping LifeHub synchronized. Goodbye, Jen.';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

// ==========================================
// 🛡️ MODULE: FLO "NO" INTERCEPTOR (FINAL FIX)
// ==========================================
const Flo_NegativeHandler = {
    canHandle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes() || {};
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);

        if (!sessionAttributes.floState) return false;
        // A sleep walk owns the session while it's open. This handler
        // claims FactorResponseIntent — the exact intent the sleep walk's
        // last question uses — so without this line a stale floState
        // hijacked "any factors?" and the log never finalised.
        if (sessionAttributes.sleepState) return false;

        return intentName === 'AMAZON.NoIntent'
            || intentName === 'AMAZON.StopIntent'
            || intentName === 'AMAZON.CancelIntent'
            || intentName === 'FactorResponseIntent';
    },
    async handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes() || {};
        
        // --- LOGIC 1: AWAITING SYMPTOMS ---
        // Context: "Any symptoms?" -> User: "No"
        if (sessionAttributes.floState === 'AWAITING_SYMPTOMS') {
            // SAM'S FIX: "No Symptoms" means we SKIP medicine and go to Notes.
            
            // (Optional: You can log "EVERYTHING IS FINE" here silently if you want, 
            // but usually the 'No' intent implies nothing to log)
            await sendCommand({ action: "flo_log_symptoms", value: "EVERYTHING IS FINE" });

            sessionAttributes.floState = "AWAITING_NOTES"; // <--- JUMP TO NOTES
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
            
            return handlerInput.responseBuilder
                .speak(say("That is good news. I'll skip the medicine check then. Lastly, any notes?"))
                .reprompt(say("Any notes?"))
                .getResponse();
        }

        // --- LOGIC 2: AWAITING MEDICINE ---
        // Context: "Did you take meds?" -> User: "No"
        if (sessionAttributes.floState === 'AWAITING_MEDICINE') {
            sessionAttributes.floState = "AWAITING_NOTES";
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
            
            return handlerInput.responseBuilder
                .speak(say("Understood. No medicine. Lastly, any notes?"))
                .reprompt(say("Any notes?"))
                .getResponse();
        }

        // --- LOGIC 3: AWAITING NOTES ---
        // Context: "Any notes?" -> User: "No"
        if (sessionAttributes.floState === 'AWAITING_NOTES') {
            sessionAttributes.floState = null; // CLEAN EXIT
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
            
            return handlerInput.responseBuilder
                .speak(say("Got it. Protocol complete. I've updated your FLO tracker. Rest well, Jen."))
                .getResponse();
        }
        
        // Fallback
        sessionAttributes.floState = null;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        return handlerInput.responseBuilder
                .speak(say("Protocol complete."))
                .getResponse();
    }
};



// ==========================================
// 🌸 MODULE: ALTHEA PILL TRACKER
// ==========================================
const LogPillIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'LogPillIntent';
    },
    async handle(handlerInput) {
        // 1. Get Slot Values (Did she say "On Time" or "No Stock"?)
        const slots = handlerInput.requestEnvelope.request.intent.slots;
        let statusOverride = null;
        
        if (slots.statusOverride && 
            slots.statusOverride.resolutions && 
            slots.statusOverride.resolutions.resolutionsPerAuthority && 
            slots.statusOverride.resolutions.resolutionsPerAuthority[0].values) {
            statusOverride = slots.statusOverride.resolutions.resolutionsPerAuthority[0].values[0].value.id;
        }

        // 2. Determine Status
        let finalStatus = 'late'; // Default safety
        let speakOutput = "";

        // SCENARIO A: User specified "No Stock" (Path 2)
        if (statusOverride === 'NO_STOCK') {
            finalStatus = 'nostock';
            speakOutput = "I understand. I've logged 'No Stock' in your FLO tracker for today.";
        }
        // SCENARIO B: User specified "On Time" (Path 3 - Retroactive)
        else if (statusOverride === 'ON_TIME') {
            finalStatus = 'ontime';
            speakOutput = "Got it. I've updated your Althea pill as 'On Time' in your tracker.";
        }
        // SCENARIO C: User just said "I took my pill" (Path 1 - Real Time Check)
        else {
            // Manila hour (0-23). The old round-trip built a string then
            // re-parsed it, which depended on the "en-US" output happening
            // to be parseable by Date — use the shared helper instead.
            const currentHour = getManilaHour();

            // Logic: 10:00 AM is the cutoff. 
            // So 09:59 is OK (Hour 9). 10:00 is LATE (Hour 10).
            if (currentHour < 10) {
                finalStatus = 'ontime';
                speakOutput = "Got it. I've logged your Althea pill in your tracker for today.";
            } else {
                finalStatus = 'late';
                speakOutput = "Noted. I've logged your pill. It is past ten, so I marked it as late.";
            }
        }

        // 3. Send to Firebase
        try {
            await sendCommand({
                action: "flo_log_pill",
                status: finalStatus,
                timestamp: Date.now()
            });
        } catch (error) {
            console.log("Firebase Error:", error);
            speakOutput = "I'm sorry, I couldn't reach the database.";
        }

        return handlerInput.responseBuilder
            .speak(say(speakOutput))
            .getResponse();
    }
};


// ==========================================
// 🌡️ BASAL TEMPERATURE
// ==========================================
const LogBasalTempIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'LogBasalTempIntent';
    },
    async handle(handlerInput) {
        const slots = handlerInput.requestEnvelope.request.intent.slots;
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes() || {};

        // 1. Check if we have the number
        if (slots.temp && slots.temp.value) {
            const tempVal = slots.temp.value;
            
            await sendCommand({ 
                action: "flo_log_temp", 
                value: tempVal 
            });
            
            // Clear any lingering state
            sessionAttributes.floState = null;
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

            return handlerInput.responseBuilder
                .speak(say(`Noted. ${tempVal} degrees. Your FLO tracker has been updated.`))
                .getResponse();
        } 
        
        // 2. If no number, ask for it (Conversation Mode)
        sessionAttributes.floState = "AWAITING_TEMP"; // Mark context
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

        return handlerInput.responseBuilder
            .speak(say("Sure. What is the temperature?"))
            .reprompt(say("What should I put in the record?"))
            .getResponse();
    }
};

// ==========================================
// 💧 DISCHARGE
// ==========================================
const LogDischargeIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'LogDischargeIntent';
    },
    async handle(handlerInput) {
        const slots = handlerInput.requestEnvelope.request.intent.slots;
        
        // 1. Check if we have the type
        if (slots.discharge && slots.discharge.resolutions && slots.discharge.resolutions.resolutionsPerAuthority[0].values) {
            const val = slots.discharge.resolutions.resolutionsPerAuthority[0].values[0].value.name;
            
            await sendCommand({ 
                action: "flo_log_discharge", 
                value: val 
            });

            return handlerInput.responseBuilder
                .speak(say(`Noted. ${val}. Your FLO tracker has been updated.`))
                .getResponse();
        }

        // 2. If not, ask
        return handlerInput.responseBuilder
            .speak(say("Sure. What type of discharge?"))
            .reprompt(say("Is it Creamy, Sticky, or something else?"))
            .getResponse();
    }
};

// ==========================================
// 🔥 SEXUAL ACTIVITY
// ==========================================
const LogActivityIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'LogActivityIntent';
    },
    async handle(handlerInput) {
        const slots = handlerInput.requestEnvelope.request.intent.slots;

        // 1. Check if we have the type
        if (slots.activity && slots.activity.resolutions && slots.activity.resolutions.resolutionsPerAuthority[0].values) {
            const val = slots.activity.resolutions.resolutionsPerAuthority[0].values[0].value.name;
            
            await sendCommand({ 
                action: "flo_log_activity", 
                value: val 
            });

            return handlerInput.responseBuilder
                .speak(say(`Noted. Your FLO tracker has been updated.`))
                .getResponse();
        }

        // 2. If not, ask
        return handlerInput.responseBuilder
            .speak(say("Sure. What should I put in the record?"))
            .reprompt(say("How is your drive today?"))
            .getResponse();
    }
};


// ==========================================
// 🎭 GENERAL MOOD TRACKER
// ==========================================
const LogGeneralMoodIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'LogGeneralMoodIntent';
    },
    async handle(handlerInput) {
        const slots = handlerInput.requestEnvelope.request.intent.slots;
        const moodSlot = slots.mood;

        // GATEKEEPER: If no mood was spoken yet, ask for it and keep listening
        if (!moodSlot || !moodSlot.value) {
            return handlerInput.responseBuilder
                .speak("Sure, how are you feeling?")
                .addElicitSlotDirective('mood') 
                .getResponse();
        }

        // If mood is provided, figure out exactly what it is
        let moodVal = "NEUTRAL"; // Fallback
        if (moodSlot.resolutions && moodSlot.resolutions.resolutionsPerAuthority[0].values) {
            moodVal = moodSlot.resolutions.resolutionsPerAuthority[0].values[0].value.name;
        } else {
            moodVal = moodSlot.value;
        }
        // Dictionary of personalized responses
        const moodResponses = {
            "NEAUTRAL": "Noted, Jen. Neutral is a perfectly solid baseline.",
            "NEUTRAL": "Noted, Jen. Neutral is a perfectly solid baseline.",
            "HUMPY": "I've logged humpy. Don't let it ruin your day, take it easy.",
            "PLAYFUL": "Playful it is. Go have some fun, it's on the record.",
            "IRATE": "I hear you. Deep breaths. I've safely locked that one away.",
            "SICK": "I'm sorry to hear that. Logged. Please rest up and give yourself some grace today.",
            "ANXIOUS": "Got it. Remember to pause and breathe, Jen. You're safe.",
            "STRESSED": "Logged. Remember you don't have to carry it all today. Step back if you need to.",
            "DEPRESSED": "I've logged it safely. Be incredibly gentle with yourself today. I'm in your corner.",
            "SAD": "I'm sorry you're feeling down. Recorded. Take all the time you need.",
            "CONFUSED": "Logged. It is perfectly fine to not have all the answers right now.",
            "NOT OKAY": "Logged. And it's completely valid to not be okay right now.",
            "HOLDING_ON": "I've logged it. You're doing brilliantly just by holding on. One hour at a time.",
            "MEH": "Meh is logged. A perfectly acceptable low-power mode.",
            "CALM": "Calm is a great state to be in. Added to the tracker.",
            "OKAY": "Okay is logged. Steady as she goes.",
            "HAPPY": "That's wonderful to hear, Jen. I have logged 'Happy'.",
            "EXCITED": "Brilliant. I've logged the excitement. Channel that energy!",
            "ELATED": "Fantastic. I've recorded 'Elated'. Soak it all in."
        };

        // Match the mood, or fallback to a standard response if it's not on the list
        let speechOutput = moodResponses[moodVal.toUpperCase()] || `I have safely logged ${moodVal}.`;
        // Send to Firebase
        await sendCommand({ 
            action: "flo_log_mood", 
            value: moodVal 
        });

        // Polished conversational response
        return handlerInput.responseBuilder
            .speak(speechOutput)
            .getResponse();
    }
};

// ==========================================
//  HTML HANDLER
// ==========================================
const NavigationIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'NavigationIntent';
    },
    async handle(handlerInput) {
        const slots = handlerInput.requestEnvelope.request.intent.slots;
        
        let pageUrl = null; 
        let pageName = "unknown page";

        if (slots.pagetype && 
            slots.pagetype.resolutions && 
            slots.pagetype.resolutions.resolutionsPerAuthority && 
            slots.pagetype.resolutions.resolutionsPerAuthority[0].values) {
            
            const id = slots.pagetype.resolutions.resolutionsPerAuthority[0].values[0].value.id;
            pageName = slots.pagetype.resolutions.resolutionsPerAuthority[0].values[0].value.name;

            // 🗺️ THE MAP (Clean, Structured Dictionary)
            //
            // ⚠️ THIS IS A MIRROR. The other copy is JS/lifehub-destinations.js,
            // which is what Poppy navigates by. Same bind as the prestige mirror
            // below: this folder deploys to Lambda on its own and cannot reach
            // ../JS/ at runtime, so there have to be two copies.
            //
            // ADD A DESTINATION HERE, ADD IT THERE TOO. Otherwise Alexa opens a
            // page Poppy insists doesn't exist, or the reverse.
            //
            // Paths are relative to the PROJECT ROOT — lifehub-navigation-core.js
            // resolves them against LIFEHUB_ROOT, which it derives from its own
            // /JS/ location. Do not add "../" here.
            //
            // Folder names are case-sensitive once this is served over HTTP
            // (it only "works" on Windows because file:// is forgiving), so
            // these match the real casing on disk: Hubs/FitnessCentre — one
            // word, no hyphen — and Standalone/SEE-YOU-LATTE.
            const destinationMap = {
                'MAIN': "LifeHub.html",
                'HOME-UPKEEP': "Trackers/Home-upkeep/LifeHub-tracker-home-upkeep.html",
                'TRACKERS': "LifeHub-trackers.html",
                'FLO': "Trackers/FLO/LifeHub-tracker-FLO.html",
                'SLEEP': "Trackers/Sleep/LifeHub-tracker-sleep.html",
                'SELF': "Trackers/Self-upkeep/LifeHub-tracker-self-upkeep.html",
                'HUBS': "LifeHub-hubs.html",
                // All three prestige-bank pages exist at the project root now,
                // so these resolve and navigation works. (They didn't when the
                // map was written, which is what the old warning here meant.)
                // "How much prestige do I have left" ALSO resolves to BANK —
                // see PrestigeQueryIntent below, which answers that out loud
                // instead of opening the page.
                'BANK': "LifeHub-prestige-bank.html",
                'NETWORTH': "LifeHub-prestige-bank-networth.html",
                'TRANSACTIONS': "LifeHub-prestige-bank-transactions.html",
                'HYDRATION': "Trackers/Hydration/LifeHub-tracker-hydration.html",
                'FITNESS': "Hubs/FitnessCentre/FITNESS-CENTRE.html",
                'FITNESS-MEASUREMENT': "Hubs/FitnessCentre/fitness-centre-measurement.html",
                'FITNESS-GALLERY': "Hubs/FitnessCentre/fitness-centre-gallery.html",
                'FITNESS-EXERCISE-INDEX': "Hubs/FitnessCentre/fitness-centre-exercise_index.html",
                'FITNESS-HISTORY': "Hubs/FitnessCentre/fitness-centre-history_log.html",
                'FITNESS-PROGRESS-TRACKER': "Hubs/FitnessCentre/fitness-centre-progress_tracker.html",
                'FITNESS-TRAINING-DECK': "Hubs/FitnessCentre/fitness-centre-training_deck.html",
                'FITNESS-CALENDAR': "Hubs/FitnessCentre/fitness-centre-calendar.html",
                'FITNESS-ACTIVE-SESSION': "Hubs/FitnessCentre/fitness-centre-active_session.html",
                'WORDBOOK': "Tools/WordBook/WordBook.html",
                'TAGBOOK': "Tools/WordBook/TagBook-editor.html",
                'SEE-YOU-LATTE': "Standalone/SEE-YOU-LATTE/See-You-Latte.html",
                'SEE-YOU-LATTE-ROOMS': "Standalone/SEE-YOU-LATTE/See-You-Latte-Rooms.html",
                'SEE-YOU-LATTE-LIBRARY': "Standalone/SEE-YOU-LATTE/See-You-Latte-Library.html",
                // Every "hubs/" below used to be lowercase — the exact
                // 404-over-HTTP the note above warns about, in fifteen
                // entries. The folder on disk is "Hubs".
                'PASSHUB': "Hubs/PassHub/PassHub-landing_page.html",
                'PASSHUB-LOGINS': "Hubs/PassHub/PassHub-logins.html",
                'PASSHUB-NOTES': "Hubs/PassHub/PassHub-notes.html",
                'PASSHUB-SUBSCRIPTIONS': "Hubs/PassHub/PassHub-subscriptions.html",
                'PASSHUB-DOCUMENTS': "Hubs/PassHub/PassHub-docs.html",
                'PASSHUB-CONTACTS': "Hubs/PassHub/PassHub-connections.html",
                'PASSHUB-ENTRY': "Hubs/PassHub/PassHub-entry.html",
                'PASSHUB-ABOUT': "Hubs/PassHub/PassHub-about.html",
                'LIBRARYHUB': "Hubs/LibraryHub/LibraryHub.html",
                'LIBRARYHUB-COLLECTIONS': "Hubs/LibraryHub/LibraryHub-Collections.html",
                'READING-ROOM': "Hubs/LibraryHub/Reading_Room.html",
                'CINEMAHUB': "Hubs/CinemaHub/CinemaHub.html",
                'CINEMAHUB-COLLECTIONS': "Hubs/CinemaHub/CinemaHub-Collections.html",
                'INSPOHUB': "Hubs/InspoHub/InspoHub.html",
                'FOODHUB': "Hubs/FoodHub/FoodHub.html",
                'FOODHUB-HISTORY': "Hubs/FoodHub/food-history.html",
                'FOODHUB-FOODLIST': "Hubs/FoodHub/food-list.html",
                'FOODHUB-STATISTICS': "Hubs/FoodHub/food-statistics.html",

                // The Home Screen itself. It couldn't be a destination
                // before because it wasn't running the jump listener —
                // that's fixed, so it can be both ends of a jump now.
                'HOMESCREEN': "LifeHub-HomeScreen.html",

                // Scribble. Its own boot gate decides whether she
                // actually gets in, so sending her here is safe whether
                // or not the notebook is unlocked.
                'SCRIBBLE': "Hubs/Scribble/Scribble.html",
                'SCRIBBLE-PROJECT': "Hubs/Scribble/Scribble-project.html",
                'SCRIBBLE-ARCHIVE': "Hubs/Scribble/Scribble-archive.html",
                'SCRIBBLE-BIN': "Hubs/Scribble/Scribble-recycle-bin.html"
            };

            // Grab the URL from the map. If it doesn't exist, it stays null.
            pageUrl = destinationMap[id] || null;
        }

        let speakOutput = `I couldn't find that page, Jen.`;

        // 🛑 THE FIX: Properly wrapped IF statement.
        if (pageUrl) {
            await sendCommand({ 
                action: "navigate", 
                url: pageUrl 
            });
            speakOutput = `Opening ${pageName}.`;
        } 

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt("I'm standing by.")
            .getResponse();
    }
};

// ==========================================
// 💎 MODULE: PRESTIGE (READ-ONLY)
// ==========================================
// ⚠️ WHAT FOLLOWS IS A MIRROR, NOT THE SOURCE OF TRUTH.
//
// JS/lifehub-prestige-ledger.js is the authority on what prestige IS. It
// exists precisely so that four trackers stop keeping private copies of
// these rules — and this is a fifth copy. It is here only because it has
// to be: Lambda deploys the "Alexa Skill Code" folder on its own, so it
// cannot reach ../JS/ at runtime, and the ledger is a browser IIFE that
// assigns to `window` and would throw the moment Node loaded it.
//
// So if the tier thresholds, the rank rules, or either word list change
// in the ledger, THEY MUST BE CHANGED HERE TOO — otherwise Alexa will
// confidently speak a number the bank page disagrees with, which is
// worse than her not knowing at all. Everything below is a line-for-line
// port of lifetimeFrom() and tierFor(). Keep it a port; don't improve it.

const FIREBASE_PRESTIGE_URL = 'https://lifehub-cae1d-default-rtdb.asia-southeast1.firebasedatabase.app/prestige_system.json';

const PRESTIGE_TIERS = [
    { id: "tier-sovereign",  name: "The Sovereign Class",  threshold: 100000000 },
    { id: "tier-tycoon",     name: "The Tycoon's Circle",  threshold:  10000000 },
    { id: "tier-executive",  name: "The Executive Class",  threshold:   1000000 },
    { id: "tier-elite",      name: "The Elite Class",      threshold:    500000 },
    { id: "tier-sterling",   name: "The Sterling Class",   threshold:    100000 },
    { id: "tier-foundation", name: "The Foundation Class", threshold:         0 }
];

const PRESTIGE_RANK_WORDS = ["refund", "undo", "correction", "void", "reversal"];
const PRESTIGE_PENALTY_WORDS = ["severe sleep debt", "drought tax"];

function prestigeTierFor(lifetime) {
    const n = Number(lifetime) || 0;
    const current = PRESTIGE_TIERS.find(t => n >= t.threshold)
        || PRESTIGE_TIERS[PRESTIGE_TIERS.length - 1];

    const idx = PRESTIGE_TIERS.indexOf(current);
    const next = idx > 0 ? PRESTIGE_TIERS[idx - 1] : null;

    return {
        name:   current.name,
        next:   next ? next.name : null,
        toNext: next ? next.threshold - n : null
    };
}

// Spending doesn't lower rank; corrections and penalties do. A negative
// row is spending unless it says otherwise — by `kind`, or by a word in
// its description for the rows that predate the kind field.
function prestigeCountsTowardRank(tx) {
    const amount = Number(tx && tx.amount) || 0;
    if (amount > 0) return true;
    if (amount === 0) return false;

    const desc = String((tx && tx.description) || "").toLowerCase();
    const isCorrection = (tx && tx.kind === "correction")
        || PRESTIGE_RANK_WORDS.some(w => desc.includes(w));
    const isPenalty = (tx && tx.kind === "penalty")
        || PRESTIGE_PENALTY_WORDS.some(w => desc.includes(w));

    return isCorrection || isPenalty;
}

// Lifetime prestige is the ledger replayed, NOT the stored
// prestige_system/net_worth — that field is incremented by some trackers
// and decremented by none, so it drifts permanently high. Nothing reads
// it, and neither does this.
function prestigeLifetimeFrom(transactions) {
    if (!transactions) return 0;
    const rows = Array.isArray(transactions)
        ? transactions
        : Object.values(transactions);

    return rows.reduce((sum, tx) =>
        prestigeCountsTowardRank(tx) ? sum + (Number(tx.amount) || 0) : sum, 0);
}

// Deliberately NOT gated on sleepState. This handler only reads, so it
// can't clobber an in-progress sleep record the way the put() handlers
// could — the same reason StatusReportIntent and CycleQueryIntent are
// left out of SleepWalkGuardHandler's list. Jen can ask mid-walk.
const PrestigeQueryIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'PrestigeQueryIntent';
    },
    async handle(handlerInput) {
        let data = null;
        try {
            const response = await axios.get(FIREBASE_PRESTIGE_URL);
            data = response.data;
        } catch (error) {
            console.log("Firebase Error:", error);
            return handlerInput.responseBuilder
                .speak(say("I couldn't reach your prestige ledger just now. Try me again in a moment."))
                .reprompt(say("Shall I try your prestige again?"))
                .getResponse();
        }

        if (!data) {
            return handlerInput.responseBuilder
                .speak(say("There's nothing in your prestige ledger yet, Jen."))
                .getResponse();
        }

        const balance = Math.round(Number(data.balance) || 0);
        const lifetime = Math.round(prestigeLifetimeFrom(data.transactions));
        const tier = prestigeTierFor(lifetime);

        // Spoken, not written: no thousands separators, because Polly
        // reads a bare integer as words on its own.
        let speakOutput = `${balance} prestige banked. Lifetime, ${lifetime} — that's ${tier.name}`;

        if (tier.next && tier.toNext > 0) {
            speakOutput += `, and you're ${tier.toNext} from ${tier.next}.`;
        } else if (!tier.next) {
            // Nothing above Sovereign. "0 to go" would read as though she
            // were about to arrive somewhere.
            speakOutput += `. There is nothing above it.`;
        } else {
            speakOutput += `.`;
        }

        return handlerInput.responseBuilder
            .speak(say(speakOutput))
            .reprompt(say("Anything else?"))
            .getResponse();
    }
};

// ==========================================
// 🌙 SLEEP ANSWERS SAID OUT OF CONTEXT
// ==========================================
// The three sleep answer intents are now strictly walk-only, which leaves
// a gap: say "late workout" with no walk open and nothing claims it, so
// it drops to IntentReflectorHandler and Alexa announces
// "You just triggered FactorResponseIntent."
//
// This catches that and offers the walk instead. It sits BELOW every FLO
// and upkeep handler and requires both states to be clear, so it can only
// ever fire on input nothing else wanted. When the skill branches to
// other workshops, give each new protocol the same treatment: gate its
// answer intents on its own state, then add one of these underneath.
const SleepAnswerOutOfContextHandler = {
    canHandle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes() || {};
        const name = Alexa.getIntentName(handlerInput.requestEnvelope);
        const SLEEP_ANSWERS = [
            'QualityResponseIntent', 'FeelingResponseIntent', 'FactorResponseIntent'
        ];

        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && SLEEP_ANSWERS.indexOf(name) !== -1
            && !getSleepState(handlerInput)
            && !sessionAttributes.floState
            && !sessionAttributes.mode;
    },
    handle(handlerInput) {
        return handlerInput.responseBuilder
            .speak(say("I'm not logging your sleep right now. Say 'I'm up' or 'update my sleep log' first, and I'll ask you properly."))
            .reprompt(say("Say 'update my sleep log' when you're ready."))
            .getResponse();
    }
};

// ==========================================
// 🧱 CORE HANDLERS
// ==========================================

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle(handlerInput) {
        const speakOutput = 'LifeHub Ready.';
        return handlerInput.responseBuilder.speak(say(speakOutput)).reprompt(say(speakOutput)).getResponse();
    }
};

const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'Say "I am up", "I am going to sleep", or "I drank a glass of water".';
        return handlerInput.responseBuilder.speak(say(speakOutput)).reprompt(say(speakOutput)).getResponse();
    }
};

const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'GracefulExitIntent');
    },
    handle(handlerInput) {
        // Leave no state behind — an abandoned walk that outlives the
        // conversation is what makes the next answer go somewhere strange.
        const attrs = handlerInput.attributesManager.getSessionAttributes() || {};
        attrs.sleepState = null;
        attrs.floState = null;
        attrs.mode = null;
        handlerInput.attributesManager.setSessionAttributes(attrs);

        // A clean, quiet luxury sign-off.
        const speakOutput = "Standing down.";

        return handlerInput.responseBuilder
            .speak(say(speakOutput))
            .withShouldEndSession(true) // 🛑 THE KILL SWITCH: This forces the microphone off.
            .getResponse();
    }
};

const FallbackIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
    },
    async handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes() || {};

        // 🔒 THE SAFETY NET: CAPTURE UNRECOGNIZED NOTES
        if (sessionAttributes.floState === "AWAITING_NOTES") {
            // We can't easily get the raw text in Fallback without complex steps, 
            // BUT we can assume she tried to say a note.
            // Since we missed the text, we have to ask her to repeat it SIMPLY.
            // (This prevents the "Log Off" error).
            
            return handlerInput.responseBuilder
                .speak(say("I missed that detail. Could you say the note again, starting with 'Note that'?"))
                .reprompt(say("Please say the note again."))
                .getResponse();
        }

        const speakOutput = 'My protocols do not recognize that command.';
        return handlerInput.responseBuilder.speak(say(speakOutput)).reprompt(say(speakOutput)).getResponse();
    }
};

const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        // Any cleanup logic goes here.
        return handlerInput.responseBuilder.getResponse();
    }
};

const IntentReflectorHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest';
    },
    handle(handlerInput) {
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        const speakOutput = `You just triggered ${intentName}`;

        return handlerInput.responseBuilder
            .speak(say(speakOutput))
            .getResponse();
    }
};

const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        console.log(`~~~~ Error handled: ${error.stack}`);
        const speakOutput = `Sorry, I had trouble doing what you asked. Please try again.`;

        return handlerInput.responseBuilder
            .speak(say(speakOutput))
            .reprompt(say(speakOutput))
            .getResponse();
    }
};

// ⚠️ ORDER IS THE ROUTING. The SDK asks each handler's canHandle() in the
// order listed and takes the FIRST that says yes — so a handler placed
// above another wins every input they both accept.
//
// The sleep handlers used to sit at the bottom, below every FLO handler.
// That is why answering a sleep question landed in the period protocol:
// FLO was simply asked first and said yes. They now sit at the top,
// which is only safe because each one is gated on sleepState — when no
// sleep walk is open they decline, and everything below behaves exactly
// as it did before.
exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        CancelAndStopIntentHandler,

        // ── SLEEP WALK (gated on sleepState — inert outside the walk) ──
        SleepWalkYesNoHandler,
        SleepWalkGuardHandler,
        QualityResponseIntentHandler,
        FeelingResponseIntentHandler,
        FactorResponseIntentHandler,
        ProvideBedtimeIntentHandler,
        SleepIntentHandler,
        WakeIntentHandler,
        WakeCorrectionIntentHandler,
        UpdateSleepLogIntentHandler,

        NavigationIntentHandler,
        LogPillIntentHandler,
        LogGeneralMoodIntentHandler,
        LogBasalTempIntentHandler,
        LogDischargeIntentHandler,
        LogActivityIntentHandler,
        MenstrualStartIntentHandler,
        MenstrualEndIntentHandler,
        CycleQueryIntentHandler,
        PrestigeQueryIntentHandler,
        StartPeriodProtocolHandler,
        LogFlowHandler,
        Flo_NegativeHandler,
        LogSymptomHandler,
        LogMedicineHandler,
        LogNoteHandler,
        SetZoneIntentHandler,     
        YesIntentHandler,          
        NoIntentHandler,           
        StartTimerIntentHandler,   
        PauseTimerIntentHandler,   
        StopTimerIntentHandler,    
        StatusReportIntentHandler, 
        CheckOffTaskIntentHandler,
        HydrationIntentHandler,

        // Last resort for sleep answers with no walk open — below every
        // other protocol so it can only catch what nothing else wanted.
        SleepAnswerOutOfContextHandler,

        HelpIntentHandler,
        FallbackIntentHandler,
        SessionEndedRequestHandler,
        IntentReflectorHandler)
    .addErrorHandlers(
        ErrorHandler)
    .lambda();