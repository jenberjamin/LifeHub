/* LifeHub — Poppy's write layer for the Sleep tracker.
   ────────────────────────────────────────────────────────────────
   Everything Poppy can DO to the sleep record lives here.

   The reads live in LifeHub-poppy-firebase-fetch.js under the
   "sleep/..." registry keys. This file only writes.

   Load LAST, after JS/poppy/PoppyEngine-scribble.js — it wraps
   whatever LIFEHUB_ACTIONS is by then, the same way that file wraps
   the wallpaper actions. Each new app is another wrapper, and no
   earlier file has to be reopened.

   ── WHY IT WRITES THE DATABASE DIRECTLY ─────────────────────────
   Not through the tracker page, and not through alexa_updates.

   The page may not be open — Jen talks to Poppy from the wallpaper,
   and the tracker is usually shut. A command that needed the page
   would work only when she'd already gone to the place she was
   trying to avoid going. Writing sleep_logs works either way, and
   the tracker's own on('value') listener redraws it if it happens
   to be open.

   alexa_updates is a different thing again: a command queue for a
   page that IS open, with its own age guards and replay defences.
   Poppy has no need of the queue — she is holding the whole log
   already, so she writes it.

   ── THE PART THAT MATTERS ───────────────────────────────────────
   A night logged by Poppy has to be indistinguishable from one
   logged by hand: same fields, same prestige bands, same streak
   bonuses, same ledger entry. saveSleepLog() in tracker-sleep.js is
   the original and this mirrors it deliberately — if that file's
   bands change, change them here too.
*/

(function () {

  const prior = window.LIFEHUB_ACTIONS;
  if (!prior || typeof prior.describe !== "function") {
    console.error("[Poppy sleep] LIFEHUB_ACTIONS missing — load this after PoppyEngine-scribble.js.");
    return;
  }

  function sleepDb() {
    if (!window.POPPY_FETCH || typeof window.POPPY_FETCH.rtdb !== "function") {
      throw new Error("Poppy's Firebase layer isn't loaded.");
    }
    return window.POPPY_FETCH.rtdb("lifehub");
  }


  /* ══════════════════════════════════════════════════════
     Manila time
     ══════════════════════════════════════════════════════
     Identical to tracker-sleep.js. A log is filed under the
     Philippine calendar date Jen WOKE UP on, whatever the laptop
     clock says — get this wrong and a 1am conversation files last
     night under tomorrow. */

  const PH_TZ = "Asia/Manila";
  const PH_DATE = new Intl.DateTimeFormat("en-CA", {
    timeZone: PH_TZ, year: "numeric", month: "2-digit", day: "2-digit"
  });

  const phToday = () => PH_DATE.format(new Date());

  function shiftKey(key, days) {
    const [y, m, d] = String(key).split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d) + days * 86400000);
    return t.getUTCFullYear() + "-" +
           String(t.getUTCMonth() + 1).padStart(2, "0") + "-" +
           String(t.getUTCDate()).padStart(2, "0");
  }

  /* The wall clock in Manila, as the "HH:MM" the tracker's time inputs
     store. hourCycle h23 rather than hour12:false, which reports
     midnight as 24 in some locales — and "24:10" is not a time the
     tracker can parse back. */
  const PH_TIME = new Intl.DateTimeFormat("en-GB", {
    timeZone: PH_TZ, hourCycle: "h23", hour: "2-digit", minute: "2-digit"
  });

  const phClock = (when) => PH_TIME.format(when || new Date());


  /* ══════════════════════════════════════════════════════
     The bedtime marker — shared with Alexa
     ══════════════════════════════════════════════════════
     "I'm going to sleep" can't write a log: the night hasn't happened
     yet and half the record doesn't exist. So it drops a marker, and
     waking up is what turns the pair into a log.

     The marker is ALEXA'S. Same node, same field, same freshness rule
     as index.js — deliberately, because saying goodnight to Alexa and
     good morning to Poppy has to work. A second marker of Poppy's own
     would make the two disagree about when Jen went to bed, and the
     one that answered first would win.

     Sixteen hours, from index.js's SLEEP_MARKER_MAX_AGE_MS. Anything
     older is a night that was never closed out, and measuring from it
     is how a 48-hour sleep gets logged. */

  const MARKER_PATH = "alexa_memory/last_sleep_start";
  const MARKER_MAX_AGE_MS = 16 * 3600000;

  function markerFresh(startTime, now) {
    if (!startTime) return false;
    const age = (now || Date.now()) - startTime;
    return age > 0 && age < MARKER_MAX_AGE_MS;
  }

  function readMarker() {
    return sleepDb().ref(MARKER_PATH).once("value").then(s => Number(s.val()) || null);
  }

  /* A marker only ever gets consumed by wokeUp(). Every other way a
     night reaches the record — dictated to Poppy, typed into the
     tracker — leaves it sitting there, and a goodnight that was closed
     out some other way then rots for weeks. It is the first line of
     the live-data block, so a month-old one gets read out as though it
     were the last thing on record.

     Only a STALE one is cleared. A fresh marker is a night in
     progress: logging yesterday at half eleven must not throw away the
     bedtime stamped half an hour ago. Best-effort — tidying up must
     never fail a log that is already written. */
  async function clearStaleMarker() {
    try {
      const marker = await readMarker();
      if (marker && !markerFresh(marker)) {
        await sleepDb().ref(MARKER_PATH).set(null);
      }
    } catch (err) {
      console.warn("[Poppy sleep] couldn't clear the stale bedtime marker:", err.message);
    }
  }

  /* The open tracker page, if there is one, fills its bedtime field
     from this — the same command Alexa sends, so tracker-sleep.js's
     existing listener handles it with no changes.

     Best-effort on purpose: the marker is the thing that matters and
     it is already written by the time this runs. A page that isn't
     open, or a write that fails, must not turn a successful goodnight
     into an error. */
  function tellOpenPage(payload) {
    return sleepDb().ref("alexa_updates").set(
      Object.assign({ timestamp: Date.now() }, payload)
    ).catch(() => {});
  }


  /* ══════════════════════════════════════════════════════
     Reading what Jen said back into what the tracker stores
     ══════════════════════════════════════════════════════
     Every one of these refuses rather than guesses. A misread time
     doesn't produce a wrong number in a chart — it produces a sealed
     row, and undoing one costs a conversation and a reversed payout
     even now that sleep_replace exists. */

  /* "23:30", "11:30 pm", "11pm", "7 AM" → "23:30". The tracker's own
     inputs are type=time and hand over 24-hour strings, so that is
     what the stored field has to look like however she said it. */
  function parseTime(said, what) {
    const raw = String(said == null ? "" : said).trim().toLowerCase();
    if (!raw) throw new Error("What time did you " + what + "?");

    const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(raw);
    if (!m) throw new Error("I couldn't read “" + said + "” as a time.");

    let h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    const suffix = m[3];

    if (min > 59) throw new Error("“" + said + "” isn't a real time.");

    if (suffix) {
      if (h < 1 || h > 12) throw new Error("“" + said + "” isn't a real time.");
      if (suffix === "pm" && h !== 12) h += 12;
      if (suffix === "am" && h === 12) h = 0;
    } else if (h > 23) {
      throw new Error("“" + said + "” isn't a real time.");
    }

    return String(h).padStart(2, "0") + ":" + String(min).padStart(2, "0");
  }

  /* Exactly the tracker's calculateDuration(): a wake time earlier
     than the bedtime is the next morning, not a negative night. */
  function durationHours(bedtime, waketime) {
    const bed = new Date("2000-01-01T" + bedtime + ":00");
    const wake = new Date("2000-01-01T" + waketime + ":00");
    if (wake < bed) wake.setDate(wake.getDate() + 1);
    return (wake - bed) / 3600000;
  }

  /* "8 hr 15 min" — the field the history list prints verbatim. */
  function durationText(hrs) {
    const h = Math.floor(hrs);
    const m = Math.round((hrs - h) * 60);
    return h + " hr " + m + " min";
  }

  function parseDate(said) {
    if (said == null || String(said).trim() === "") return phToday();

    const raw = String(said).trim().toLowerCase();
    if (raw === "today")     return phToday();
    if (raw === "yesterday") return shiftKey(phToday(), -1);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      throw new Error("I need the date as YYYY-MM-DD — I got “" + said + "”.");
    }

    /* A date in the future is always a mistake: the log is filed on the
       morning she woke, and she can't have woken from a night that
       hasn't happened. Sealing one would block the real log later. */
    if (raw > phToday()) {
      throw new Error(raw + " hasn't happened yet.");
    }
    return raw;
  }

  /* The chips on the tracker page, and the only values it will draw.
     A factor typed as anything else is stored but invisible, so an
     unknown one is refused with the list rather than saved. */
  const FACTORS = ["Caffeine", "Alcohol", "Deadline", "Sickness",
                   "Late Workout", "Events", "FLO"];

  function parseFactors(said) {
    if (said == null) return null;                    // not mentioned
    const list = Array.isArray(said) ? said : String(said).split(/\s*,\s*/);
    const out = [];

    list.map(x => String(x || "").trim()).filter(Boolean).forEach(x => {
      const hit = FACTORS.find(f => f.toLowerCase() === x.toLowerCase());
      if (!hit) {
        throw new Error("“" + x + "” isn't one of the factors. " +
                        "They are: " + FACTORS.join(", ") + ".");
      }
      if (out.indexOf(hit) === -1) out.push(hit);
    });

    return out;                                        // [] clears them
  }

  const FEELINGS = ["Deep & Restored", "Adequate", "Inadequate"];

  function parseFeeling(said) {
    if (said == null || String(said).trim() === "") return null;
    const want = String(said).trim().toLowerCase();

    const hit = FEELINGS.find(f => f.toLowerCase() === want) ||
                /* "restored", "deep", "restful" all mean the top one;
                   she says these far more often than the exact label. */
                (/(deep|restor|refresh|great|amazing)/.test(want) ? FEELINGS[0] :
                 /(adequate|fine|okay|ok|alright|decent)/.test(want) ? FEELINGS[1] :
                 /(inadequate|bad|awful|terrible|rough|poor|exhaust)/.test(want) ? FEELINGS[2] :
                 null);

    if (!hit) {
      throw new Error("Feeling has to be one of: " + FEELINGS.join(", ") + ".");
    }
    return hit;
  }

  function parseQuality(said) {
    if (said == null || String(said).trim() === "") return null;
    const n = Number(said);
    if (!Number.isFinite(n) || n < 1 || n > 10) {
      throw new Error("Quality is a number from 1 to 10.");
    }
    return String(Math.round(n));
  }


  /* ══════════════════════════════════════════════════════
     Prestige — mirrored from tracker-sleep.js
     ══════════════════════════════════════════════════════
     The bands and the bonus thresholds are hers. Kept in one function
     so an amendment can re-run it on the new duration and pay only
     the difference, rather than paying the whole night twice. */

  function basePrestige(hrs) {
    if (hrs < 4.0) return { amount: -2000, detail: "Severe Sleep Debt (" + hrs.toFixed(1) + " hrs)" };
    if (hrs < 6.0) return { amount:   500, detail: hrs.toFixed(1) + " hrs of Sleep (Low)" };
    if (hrs <= 8.5) return { amount:  3500, detail: hrs.toFixed(1) + " hrs of Sleep (Optimal)" };
    if (hrs <= 9.5) return { amount:  2500, detail: hrs.toFixed(1) + " hrs of Sleep (Extended)" };
    return { amount: 1000, detail: hrs.toFixed(1) + " hrs of Sleep (Overslept)" };
  }

  /* Consecutive logged nights ending the day before `targetDate`, plus
     the one being written — the tracker's own count, and it stops at
     35 for the same reason hers does. */
  function streakFor(logs, targetDate) {
    let streak = 0;
    let check = shiftKey(targetDate, -1);
    for (let i = 0; i < 35; i++) {
      if (logs[check]) { streak++; check = shiftKey(check, -1); }
      else break;
    }
    return streak + 1;
  }

  function streakBonus(streak) {
    if (streak === 3)  return { amount:  2000, detail: " + 3 Day Streak!" };
    if (streak === 7)  return { amount: 10000, detail: " + 7 Day Streak!" };
    if (streak === 30) return { amount: 50000, detail: " + 30 Day Streak!" };
    return { amount: 0, detail: "" };
  }

  const SOURCE = "SLEEP TRACKER";

  function prestige() {
    if (!window.LIFEHUB_PRESTIGE) {
      throw new Error("JS/lifehub-prestige-ledger.js isn't loaded on this page.");
    }
    return window.LIFEHUB_PRESTIGE;
  }

  const stamp = () => firebase.database.ServerValue.TIMESTAMP;

  /* updateBank(), field for field. net_worth only ever grows on a
     positive amount — hers does the same, so a penalty dents the
     balance without rewriting history.

     (net_worth is written here purely so a night logged by Poppy is
     byte-for-byte what the tracker would have written. Nothing reads
     that field; lifetime prestige is the ledger replayed. It goes
     when the trackers are moved onto the shared module.) */
  function updateBank(amount, description) {
    if (!amount) return Promise.resolve();

    const db = sleepDb();
    db.ref("prestige_system/balance").transaction(c => (c || 0) + amount);
    if (amount > 0) {
      db.ref("prestige_system/net_worth").transaction(c => (c || 0) + amount);
    }

    /* A negative sleep payout is the severe-debt fine for a night under
       four hours, and a fine lowers her rank as well as her balance —
       so it has to be marked as one rather than passing as spending. */
    return db.ref("prestige_system/transactions")
      .push(prestige().row(amount, description, SOURCE, stamp(),
                           amount < 0 ? { penalty: true } : null));
  }

  /* Reversing one — a deleted log, or the losing half of an amended
     duration.

     This MUST be marked as a correction, and that is the whole reason
     it goes through the shared module rather than pushing its own
     object. Lifetime prestige ignores negative rows unless they say
     they are corrections; a plainly-worded "Sleep log removed for
     2026-09-08" would take the points out of her balance and leave
     them in her rank forever. */
  function reverseBank(amount, description) {
    if (!amount) return Promise.resolve();

    const db = sleepDb();
    db.ref("prestige_system/balance").transaction(c => (c || 0) - amount);
    if (amount > 0) {
      db.ref("prestige_system/net_worth").transaction(c => (c || 0) - amount);
    }

    return db.ref("prestige_system/transactions")
      .push(prestige().reversal(amount, description, SOURCE, stamp()));
  }

  function allLogs() {
    return sleepDb().ref("sleep_logs").once("value").then(s => s.val() || {});
  }


  /* ══════════════════════════════════════════════════════
     The writes
     ══════════════════════════════════════════════════════ */

  /* Mirrors saveSleepLog(), the seal included — but the seal is now a
     question rather than a wall. The tracker page asks before replacing
     a sealed night and reverses what the first save paid; this takes
     the same two paths through one function so the two cannot drift.

       opts.replace false (default)  a logged date is refused, exactly
                                     as before. "Log it" must never
                                     silently overwrite a night.
       opts.replace true             the night is rewritten from
                                     scratch and the old payout is
                                     taken back first.

     Poppy is told in her spec to confirm before sending the second,
     because nothing here can tell "I logged that wrong" from a
     misheard date. */
  async function logNight(cmd, opts) {
    const replace = !!(opts && opts.replace);
    const date = parseDate(cmd.date);
    const bedtime = parseTime(cmd.bedtime, "go to bed");
    const waketime = parseTime(cmd.waketime, "wake up");

    const hrs = durationHours(bedtime, waketime);
    if (hrs <= 0) {
      throw new Error("That works out to no sleep at all — did I get the times the right way round?");
    }

    const logs = await allLogs();
    const existing = logs[date];

    if (existing && !replace) {
      throw new Error(date + " is already logged" +
        (existing.duration ? " (" + existing.duration + ")" : "") +
        ". I can replace it, change part of it, or delete it — " +
        "but I won't log it twice without being told to.");
    }
    if (!existing && replace) {
      throw new Error("There's no log for " + date + " to replace.");
    }

    const quality = parseQuality(cmd.quality);
    const feeling = parseFeeling(cmd.feeling);
    const factors = parseFactors(cmd.factors) || [];

    /* Factors the hydration tracker already knows about — a coffee
       after 2pm, alcohol after midday. They were parked under this
       wake date at the time they were drunk, because there was no
       sleep log yet to write them into.

       Merged, never replacing: a factor Jen named herself must not be
       dropped because the pending node was empty. Best-effort — a tag
       that can't be read must not stop a night being logged. */
    let pendingRef = null;
    try {
      pendingRef = sleepDb().ref("sleep_pending_factors/" + date);
      const pending = (await pendingRef.once("value")).val() || {};

      /* Stale tags are dropped, not merged. A coffee from a night that
         was never logged has nothing to say about this one — the node
         is cleared either way, below. */
      const H = window.LIFEHUB_HYDRATION;
      const fresh = !H || H.factorTagFresh(pending.at);

      if (fresh) {
        Object.keys(pending).forEach(f => {
          /* `at` is the stamp, not a factor. */
          if (f !== "at" && pending[f] && factors.indexOf(f) === -1) factors.push(f);
        });
      }
    } catch (err) {
      console.warn("[Poppy sleep] couldn't read pending factors:", err.message);
      pendingRef = null;
    }

    const base = basePrestige(hrs);
    const streak = streakFor(logs, date);
    const bonus = streakBonus(streak);

    const earned = base.amount + bonus.amount;
    const detail = base.detail + bonus.detail;

    const log = {
      date:            date,
      bedtime:         bedtime,
      waketime:        waketime,
      duration:        durationText(hrs),
      durationHrsVal:  hrs,
      /* The form's own defaults, so a log made without them looks like
         one saved from the page rather than one missing fields. */
      quality:         quality || "5",
      feeling:         feeling || "Adequate",
      factors:         factors,
      prestigeValue:   earned,
      /* Poppy's own two fields. The tracker ignores both; an amendment
         needs them to know what has already been paid for this night
         and what was a one-off streak bonus that must not be re-paid. */
      prestigeBase:    base.amount,
      loggedBy:        "Poppy"
    };

    await sleepDb().ref("sleep_logs/" + date).set(log);

    /* Undo the old payout BEFORE crediting the new one, and only now
       that the replacement is actually on the record — a reversal
       written for a save that then failed would dock her for a night
       she still has. The FULL prestigeValue comes back, streak bonus
       and all, because the recalculation above re-awards it: taking
       back only the base would pay the bonus twice.

       Same order and the same reasoning as the tracker page. If one
       changes, change the other. */
    const wasPaid = existing ? (Number(existing.prestigeValue) || 0) : 0;
    if (wasPaid) {
      await reverseBank(wasPaid, "Reversal — " + date + " re-logged");
    }

    await updateBank(earned, detail);

    /* Consumed only once the night is safely written — clearing it
       first would lose the tag if the save then failed. */
    if (pendingRef) await pendingRef.remove().catch(() => {});

    /* Same reasoning, one node over: a night is on the record now, so
       an abandoned bedtime marker has nothing left to measure. */
    await clearStaleMarker();

    /* The Sleep Protocol, settled the same way the tracker page settles
       it — after the night is on the record, since every rule counts
       from the logs. A night logged by voice has to earn the same
       trophies as one typed in, or the two paths pay differently for
       the same week. */
    const paid = await settleProtocol();

    /* The net is spelled out on a replacement. "3,500 prestige" on its
       own sounds like 3,500 arriving, when most of it has just been
       handed back. */
    return (existing ? "Replaced " : "Logged ") + date + " — " + durationText(hrs) +
           ", " + earned.toLocaleString() + " prestige" +
           (bonus.amount ? " (" + streak + "-night streak)" : "") +
           (wasPaid
             ? ", took back the " + wasPaid.toLocaleString() +
               " the old entry paid — net " +
               (earned - wasPaid > 0 ? "+" : "") + (earned - wasPaid).toLocaleString()
             : "") +
           protocolReceipt(paid);
  }

  /* Never allowed to break a log. The night is written and paid before
     this runs; an unreachable protocol must not turn a good morning
     into an error. */
  function settleProtocol() {
    const P = window.LIFEHUB_SLEEP_PROTOCOL;
    if (!P) {
      console.warn("[Poppy sleep] lifehub-sleep-protocol.js isn't loaded — no trophies settled.");
      return Promise.resolve([]);
    }
    return P.settle(sleepDb(), prestige(), stamp())
            .catch(e => {
              console.warn("[Poppy sleep] protocol did not settle:", e.message);
              return [];
            });
  }

  /* Spoken aloud, so it is a sentence rather than a list of rows. */
  function protocolReceipt(paid) {
    if (!paid || !paid.length) return "";

    const won  = paid.filter(p => !p.penalty).map(p => p.name);
    const lost = paid.filter(p => p.penalty).map(p => p.name);

    const parts = [];
    if (won.length)  parts.push("earned " + won.join(" and "));
    if (lost.length) parts.push("triggered " + lost.join(" and "));
    return ". You " + parts.join(", and ");
  }


  /* ── "I'm going to sleep now" ──────────────────────────────────
     Stamps the moment and stops. Nothing is logged, nothing is paid,
     and the date isn't sealed — the night is still ahead. */
  async function goodnight() {
    const now = Date.now();
    const prior = await readMarker();

    await sleepDb().ref(MARKER_PATH).set(now);

    const clock = phClock(new Date(now));
    await tellOpenPage({ action: "set_bedtime", value: clock });

    /* Saying goodnight twice is a real thing — she got up, then went
       back. The newer marker wins, and the old one is mentioned rather
       than silently discarded, because the difference between the two
       is hours of the night she's about to be told she slept. */
    if (markerFresh(prior, now)) {
      return "Bedtime marked at " + clock +
             " (replacing the one from " + phClock(new Date(prior)) + ")";
    }
    return "Bedtime marked at " + clock;
  }


  /* ── "I just woke up" ──────────────────────────────────────────
     The other half. The marker is the bedtime, now is the wake time,
     and the pair is a whole night — so this writes the real log
     through exactly the same path a dictated one takes.

     It saves IMMEDIATELY rather than asking about quality first. The
     times are the perishable part: they are true at this moment and
     nowhere else, and a conversation that wanders off before the last
     question would otherwise lose the night entirely. Quality, feeling
     and factors are opinions — they keep, and sleep_amend adds them
     whenever she gets round to it. */
  async function wokeUp(cmd) {
    const now = Date.now();
    const marker = await readMarker();

    if (!markerFresh(marker, now)) {
      throw new Error(marker
        ? "The bedtime I've got is from " + phClock(new Date(marker)) +
          ", too long ago to measure from — what time did you actually go to sleep?"
        : "I don't have a bedtime for last night — what time did you go to sleep?");
    }

    const receipt = await logNight({
      date:     phToday(),
      bedtime:  phClock(new Date(marker)),
      waketime: phClock(new Date(now)),
      quality:  cmd && cmd.quality,
      feeling:  cmd && cmd.feeling,
      factors:  cmd && cmd.factors
    });

    /* Consumed only after the log is safely written. Clearing it first
       would mean a refusal — a date already sealed, say — threw away
       the only record of when she went to bed. */
    await sleepDb().ref(MARKER_PATH).set(null);

    return receipt;
  }


  /* Changing a night already on the record.
     Only the fields she named move; anything left out keeps its value.

     If the times change the duration changes, and so does what the
     night was worth — so the difference is paid or clawed back as its
     own ledger line. The streak bonus is deliberately NOT recomputed:
     it was earned by the run of nights being unbroken, and editing a
     bedtime doesn't break it. */
  async function amendNight(cmd) {
    const date = parseDate(cmd.date);

    const logs = await allLogs();
    const log = logs[date];
    if (!log) {
      throw new Error("There's no log for " + date + " to change.");
    }

    const patch = {};
    const said = [];

    if (cmd.bedtime != null && String(cmd.bedtime).trim() !== "") {
      patch.bedtime = parseTime(cmd.bedtime, "go to bed");
      said.push("bedtime " + patch.bedtime);
    }
    if (cmd.waketime != null && String(cmd.waketime).trim() !== "") {
      patch.waketime = parseTime(cmd.waketime, "wake up");
      said.push("wake " + patch.waketime);
    }

    const quality = parseQuality(cmd.quality);
    if (quality) { patch.quality = quality; said.push("quality " + quality + "/10"); }

    const feeling = parseFeeling(cmd.feeling);
    if (feeling) { patch.feeling = feeling; said.push(feeling.toLowerCase()); }

    const factors = parseFactors(cmd.factors);
    if (factors) {
      patch.factors = factors;
      said.push(factors.length ? "factors: " + factors.join(", ") : "factors cleared");
    }

    if (!said.length) throw new Error("What should I change about it?");

    /* Recalculated from the merged pair, not from the patch alone —
       changing only the wake time still moves the duration. */
    let receipt = "";
    if (patch.bedtime || patch.waketime) {
      const bedtime = patch.bedtime || log.bedtime;
      const waketime = patch.waketime || log.waketime;

      if (!bedtime || !waketime) {
        throw new Error("That log has no " + (bedtime ? "wake time" : "bedtime") +
                        " on it, so I'd need both to work out the hours.");
      }

      const hrs = durationHours(bedtime, waketime);
      if (hrs <= 0) {
        throw new Error("That works out to no sleep at all — did I get the times the right way round?");
      }

      patch.durationHrsVal = hrs;
      patch.duration = durationText(hrs);

      /* What the night was already paid, before any streak bonus. Old
         logs predate prestigeBase, so it's recovered from the stored
         duration — the same band the tracker used at the time. */
      const wasBase = typeof log.prestigeBase === "number"
        ? log.prestigeBase
        : basePrestige(Number(log.durationHrsVal) || 0).amount;

      const now = basePrestige(hrs);
      const delta = now.amount - wasBase;

      patch.prestigeBase = now.amount;
      patch.prestigeValue = (Number(log.prestigeValue) || 0) + delta;

      if (delta) {
        const why = "Sleep log corrected for " + date + " (" + durationText(hrs) + ")";
        /* A downward correction goes through reverseBank so it is
           flagged as one. Paying it as a plain negative row would take
           the points off her balance and leave them in her rank. */
        if (delta > 0) await updateBank(delta, why);
        else           await reverseBank(-delta, why);
        receipt = ", " + (delta > 0 ? "+" : "") + delta.toLocaleString() + " prestige";
      }
    }

    patch.amendedBy = "Poppy";
    await sleepDb().ref("sleep_logs/" + date).update(patch);

    return "Updated " + date + " — " + said.join(", ") + receipt;
  }


  /* Taking a night off the record altogether — not the way to redo one.
     sleep_replace rewrites a night in place and keeps the date in her
     streak; deleting leaves a hole in it. This is for a log that should
     never have existed: the wrong date, or a night she didn't sleep.

     Everything the night was paid comes back out of the bank. Poppy is
     told in her spec to confirm before sending this — nothing here can
     tell a deliberate delete from a misheard one. */
  async function deleteNight(cmd) {
    const date = parseDate(cmd.date);

    const logs = await allLogs();
    const log = logs[date];
    if (!log) throw new Error("There's no log for " + date + " to delete.");

    await sleepDb().ref("sleep_logs/" + date).remove();

    const paid = Number(log.prestigeValue) || 0;
    if (paid) {
      await reverseBank(paid, "Sleep log removed for " + date);
    }

    return "Deleted the log for " + date +
           (paid ? " and took back " + paid.toLocaleString() + " prestige" : "");
  }


  /* ══════════════════════════════════════════════════════
     UI — filling the form instead of saving it
     ══════════════════════════════════════════════════════
     Everything above writes the database whether the tracker is open
     or not. This one is the opposite case: she is looking at the page
     and wants the fields filled so she can check them and press the
     button herself.

     It rides the same device-addressed channel Scribble's panels use,
     and js/sleep-poppy-commands.js on the tracker page answers it. */

  const ACK_TIMEOUT_MS = 4000;

  function uiCommand(action, label, payload) {
    const live = window.POPPY_FETCH && window.POPPY_FETCH.active;
    if (!live || !live.device) {
      throw new Error("I can't tell which screen you're on.");
    }
    if (live.app !== "Sleep") {
      throw new Error("The sleep tracker isn't the screen in front of you" +
                      (live.app ? " — " + live.app + " is." : "."));
    }

    const db = window.POPPY_FETCH.db("poppy");
    const doc = Object.assign({
      action: action,
      device: live.device,
      status: "pending",
      at:     Date.now()
    }, payload || {});

    return db.collection("commands").add(doc).then(ref => {
      return new Promise((resolve, reject) => {
        let settled = false;

        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          stop();
          ref.delete().catch(() => {});
          reject(new Error("The sleep tracker isn't answering."));
        }, ACK_TIMEOUT_MS);

        const stop = ref.onSnapshot(snap => {
          const d = snap.data();
          if (!d || d.status === "pending" || settled) return;
          settled = true;
          clearTimeout(timer);
          stop();
          ref.delete().catch(() => {});
          if (d.status === "done") resolve(label);
          else reject(new Error(d.error || "That didn't work."));
        }, err => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(new Error(err.message || "Lost contact with that screen."));
        });
      });
    });
  }

  /* Nothing is validated away here that logNight would accept — the
     fields are parsed the same way, so what lands in the form is what
     would have been saved. */
  function fillForm(cmd) {
    const payload = {};
    const said = [];

    if (cmd.date != null && String(cmd.date).trim() !== "") {
      payload.date = parseDate(cmd.date);
      said.push(payload.date);
    }
    if (cmd.bedtime != null && String(cmd.bedtime).trim() !== "") {
      payload.bedtime = parseTime(cmd.bedtime, "go to bed");
      said.push("bedtime " + payload.bedtime);
    }
    if (cmd.waketime != null && String(cmd.waketime).trim() !== "") {
      payload.waketime = parseTime(cmd.waketime, "wake up");
      said.push("wake " + payload.waketime);
    }

    const quality = parseQuality(cmd.quality);
    if (quality) { payload.quality = quality; said.push("quality " + quality); }

    const feeling = parseFeeling(cmd.feeling);
    if (feeling) { payload.feeling = feeling; said.push(feeling.toLowerCase()); }

    const factors = parseFactors(cmd.factors);
    if (factors) { payload.factors = factors; said.push("factors: " + (factors.join(", ") || "none")); }

    if (!said.length) throw new Error("What should I put in the form?");

    return uiCommand("sleep_fill", "Filled in " + said.join(", "), payload);
  }


  /* ══════════════════════════════════════════════════════
     Exemptions
     ══════════════════════════════════════════════════════
     "Don't fine me for that week, I was away."

     The rules and the storage are in lifehub-sleep-protocol.js; this
     turns what she said into a date and reports back. An exemption
     only ever calls off a PENALTY — it does not keep a reward streak
     alive, and Poppy is told to say so, because "excuse Tuesday" and
     "give me Tuesday" are very different requests and she should not
     be able to grant the second by accident. */

  function protocol() {
    const P = window.LIFEHUB_SLEEP_PROTOCOL;
    if (!P) throw new Error("JS/lifehub-sleep-protocol.js isn't loaded on this page.");
    return P;
  }

  /* A range, because the reason she wants this is usually a stretch of
     days rather than one — "I was in hospital all last week". */
  function datesBetween(fromKey, toKey) {
    const out = [];
    let cursor = fromKey;
    for (let i = 0; i < 400 && cursor <= toKey; i++) {
      out.push(cursor);
      cursor = shiftKey(cursor, 1);
    }
    return out;
  }

  async function exemptDays(cmd) {
    const P = protocol();
    const db = sleepDb();

    const from = parseDate(cmd.date || cmd.from);
    const to   = cmd.to ? parseDate(cmd.to) : from;

    if (to < from) throw new Error("Those dates are the wrong way round.");

    const days = datesBetween(from, to);
    if (days.length > 60) {
      throw new Error("That's " + days.length + " days — too many to excuse in one go.");
    }

    /* A day already logged does not need excusing, and marking it would
       be a confusing thing to find later. */
    const logs = await allLogs();
    const already = days.filter(d => logs[d]);
    const target = days.filter(d => !logs[d]);

    if (!target.length) {
      throw new Error(days.length === 1
        ? from + " is already logged, so there's nothing to excuse."
        : "All of those nights are already logged, so there's nothing to excuse.");
    }

    for (const d of target) {
      await P.exempt(db, d, cmd.reason, "Poppy");
    }

    const span = target.length === 1
      ? target[0]
      : target.length + " days (" + target[0] + " to " + target[target.length - 1] + ")";

    return "Excused " + span +
           (cmd.reason ? " — " + cmd.reason : "") +
           ". No missed-log penalty for those." +
           (already.length ? " (" + already.length + " of them were already logged.)" : "");
  }

  async function unexemptDays(cmd) {
    const P = protocol();
    const db = sleepDb();

    const from = parseDate(cmd.date || cmd.from);
    const to   = cmd.to ? parseDate(cmd.to) : from;
    if (to < from) throw new Error("Those dates are the wrong way round.");

    const existing = await P.readExemptions(db);
    const days = datesBetween(from, to).filter(d => existing[d]);

    if (!days.length) throw new Error("Nothing was excused in that range.");

    for (const d of days) await P.unexempt(db, d);

    return "Removed the exemption on " +
           (days.length === 1 ? days[0] : days.length + " days") + ".";
  }


  /* ══════════════════════════════════════════════════════
     ACTIONS
     ══════════════════════════════════════════════════════ */

  const ACTIONS = {

    sleep_goodnight: {
      spec: '{"action":"sleep_goodnight"} ' +
            '— she is going to bed NOW. Stamps the current time as her bedtime and stops there. ' +
            'Takes nothing: the time is this moment. Nothing is logged and no prestige is paid yet — ' +
            'the night gets written when she says she is up. ' +
            'Use for "going to sleep", "off to bed", "goodnight". ' +
            'If she is telling you about a bedtime in the PAST ("I went to bed at 11"), that is not this — that is sleep_log.',
      run: () => goodnight()
    },

    sleep_wake: {
      spec: '{"action":"sleep_wake","quality":8,"feeling":"Adequate","factors":[]} ' +
            '— she has just woken up NOW. Uses the bedtime she marked when she went to bed, ' +
            'stamps this moment as the wake time, and writes the whole night in one go. ' +
            'quality, feeling and factors are optional and only if she volunteered them in the same breath — ' +
            'the night saves without them and you can ask afterwards, then use sleep_amend. ' +
            'Use for "just woke up", "I\'m up", "good morning". ' +
            'If there is no fresh bedtime marker it comes back asking for one — pass that on, then use sleep_log with the time she gives.',
      run: (cmd) => wokeUp(cmd)
    },

    sleep_log: {
      spec: '{"action":"sleep_log","date":"","bedtime":"23:30","waketime":"07:00","quality":8,"feeling":"Deep & Restored","factors":["Caffeine"]} ' +
            '— writes a night to the sleep tracker and pays the prestige for it. ' +
            'bedtime and waketime are required; 24-hour times are safest but "11:30 pm" is read too. ' +
            'date is the morning she WOKE UP, as YYYY-MM-DD — leave it empty for today, which is almost always right. ' +
            'quality is 1-10. feeling is one of: Deep & Restored, Adequate, Inadequate. ' +
            'factors is any of: Caffeine, Alcohol, Deadline, Sickness, Late Workout, Events, FLO — only ones she actually mentioned, never guessed. ' +
            'Leave quality, feeling and factors out if she did not say; do not invent them. ' +
            'This NEVER overwrites: if the date is already logged it comes back saying so. ' +
            'When that happens, tell her what is already on the record and let her pick — ' +
            'sleep_amend to change part of it, sleep_replace to redo the whole night.',
      run: (cmd) => logNight(cmd)
    },

    sleep_replace: {
      spec: '{"action":"sleep_replace","date":"2026-09-08","bedtime":"23:30","waketime":"07:00","quality":8,"feeling":"Adequate","factors":[]} ' +
            '— rewrites a night that is ALREADY logged, from scratch. Takes the same fields as sleep_log ' +
            'and bedtime and waketime are required, because the whole night is replaced rather than patched: ' +
            'anything you leave out goes back to the form default, it does NOT keep its old value. ' +
            'The prestige the old entry paid is taken back and the new night is paid fresh. ' +
            'ASK HER FIRST — say what is currently on the record for that date and only send this after she says yes. ' +
            'Prefer sleep_amend when she is changing one or two things ("quality was more like a 4"): it keeps the rest ' +
            'and is the smaller, safer edit. Use this when the night as a whole is wrong — the wrong times, ' +
            'or a log she wants to start over.',
      run: (cmd) => logNight(cmd, { replace: true })
    },

    sleep_amend: {
      spec: '{"action":"sleep_amend","date":"2026-09-08","quality":6,"feeling":"Inadequate","factors":[],"bedtime":"","waketime":""} ' +
            '— changes a night already logged. Send ONLY the fields she is changing; anything left out keeps its value. ' +
            'date defaults to today. An empty factors array clears them. ' +
            'Changing the times re-works the hours and adjusts the prestige by the difference.',
      run: (cmd) => amendNight(cmd)
    },

    sleep_delete: {
      spec: '{"action":"sleep_delete","date":"2026-09-08"} ' +
            '— removes a night from the record entirely and takes back the prestige it paid. There is no undo. ' +
            'Use this only when the night should not be there at all — a log on the wrong date, or one she never slept. ' +
            'If she wants to REDO it, sleep_replace does that in one step and keeps the date in her streak; ' +
            'deleting and re-logging leaves a gap in between. ' +
            'ASK HER FIRST and only send it after she says yes.',
      run: (cmd) => deleteNight(cmd)
    },

    sleep_fill: {
      spec: '{"action":"sleep_fill","bedtime":"23:30","waketime":"07:00","quality":8,"feeling":"Adequate","factors":[]} ' +
            '— types into the sleep tracker form WITHOUT saving, so she can check it and press LOG SLEEP herself. ' +
            'Needs the sleep tracker to be the screen she is looking at. ' +
            'Use this only when she asks you to fill it in or set it up; if she asks you to LOG it, use sleep_log.',
      run: (cmd) => fillForm(cmd)
    },

    sleep_exempt: {
      spec: '{"action":"sleep_exempt","date":"2026-09-08","to":"","reason":"away for work"} ' +
            '— marks nights she did NOT log as excused, so the missed-log penalty ' +
            '("Cycle Disturbance", 3 days with nothing logged) does not fire for them. ' +
            'date is the first day; to is an optional last day for a range — leave it out for a single night. ' +
            'reason is short and in her words, and is worth asking for if she did not say. ' +
            'Use for "I was away", "don\'t count last week", "I was in hospital", "excuse those days". ' +
            'IMPORTANT: this only calls off penalties. It does NOT keep a reward streak alive and does not ' +
            'count as a logged night — if she seems to want the trophy rather than the reprieve, say plainly ' +
            'that an exemption cannot do that. Nights already logged are skipped; they need no excusing.',
      run: (cmd) => exemptDays(cmd)
    },

    sleep_unexempt: {
      spec: '{"action":"sleep_unexempt","date":"2026-09-08","to":""} ' +
            '— removes an exemption she asked for earlier, putting those nights back in ' +
            'reach of the missed-log penalty. date, and optionally to for a range. ' +
            'Use for "actually count that week after all", "remove the exemption".',
      run: (cmd) => unexemptDays(cmd)
    },

    sleep_open_history: {
      spec: '{"action":"sleep_open_history"} ' +
            '— opens the Sleep Archive panel on the tracker page. Needs the tracker to be open in front of her. ' +
            'She is asking to LOOK at it, so do not also summarise it.',
      run: () => uiCommand("sleep_open_history", "Opened the sleep archive")
    }

  };


  /* ══════════════════════════════════════════════════════
     Wrapping, not replacing
     ══════════════════════════════════════════════════════ */

  window.LIFEHUB_ACTIONS = {

    describe() {
      const own = Object.keys(ACTIONS).map(k => "  " + ACTIONS[k].spec);
      return prior.describe() + "\n\n" + [
        "You can also act on the Sleep tracker. Same fenced block, these actions:",
        ""
      ].concat(own).concat([
        "",
        "Sleep dates are Philippine calendar dates and a log belongs to the",
        "morning she woke up on, not the evening she went to bed. Never send a",
        "sleep action on times you inferred — if she said one of the two times",
        "and not the other, ask for the missing one."
      ]).join("\n");
    },

    run(cmd) {
      const name = cmd && cmd.action;
      if (ACTIONS[name]) {
        return Promise.resolve()
          .then(() => ACTIONS[name].run(cmd))
          .catch(err => { throw new Error(err.message || "That didn't work."); });
      }
      return prior.run(cmd);
    }
  };

  Object.keys(prior).forEach(k => {
    if (!(k in window.LIFEHUB_ACTIONS)) window.LIFEHUB_ACTIONS[k] = prior[k];
  });


  /* ══════════════════════════════════════════════════════
     The same door, for things that aren't Poppy
     ══════════════════════════════════════════════════════
     Alexa collects a whole night by voice — bedtime, wake time,
     quality, feeling, factors — and then has to get it written. It
     used to do that by asking an open tracker page to press its own
     save button, which meant a night spoken with the laptop shut was
     lost. Now it parks the finished night in a queue and this applies
     it, via LifeHub-homescreen-intake-queue.js.

     The same path Poppy uses, deliberately: the seal, the prestige
     bands, the streak bonuses, the pending caffeine tags and the
     Sleep Protocol are one implementation, not three. */
  window.LIFEHUB_SLEEP_INTAKE = {
    /* Takes what sleep_log takes:
       { date, bedtime, waketime, quality, feeling, factors }. */
    log:    (cmd) => logNight(cmd || {}),
    amend:  (cmd) => amendNight(cmd || {})
  };

})();
