/* LifeHub — the Sleep Protocol: rewards and penalties, in one place.
   ────────────────────────────────────────────────────────────────
   Jen's original Notion design, brought into the app. The sleep
   tracker, the prestige bank, the homescreen and Poppy all read THIS
   file, so a rule changed here changes everywhere at once — the same
   arrangement lifehub-prestige-ledger.js has for tiers.

   PURE LOGIC. Touches no Firebase and initialises no app, so it is
   safe to load on any page in any order. settle() is the one function
   that writes, and it takes the caller's database handle.

   ── THE SHAPE OF THE DATA ────────────────────────────────────────
     sleep_logs/YYYY-MM-DD              { bedtime, waketime,
                                          durationHrsVal, ... }
     prestige_system/sleep_protocol/ID  { at, date, amount, name }
                                        one row per award once earned.
                                        This node is the record of what
                                        has been paid; it is what stops
                                        a trophy paying twice, and what
                                        the homescreen watches.

   ── WHAT IS AN INTERPRETATION AND WHAT IS HERS ───────────────────
   The names, the groupings and the "5 Days Rise" style terms are
   hers, verbatim from Notion. Two things were NOT in that table and
   are therefore mine, marked ✎ below:

     ✎ the XP values      the column was empty
     ✎ the exact cutoffs  "Rise" and "Lights Out" name a thing to
                          measure but not the line to measure it
                          against

   Both are one edit each in the table below.
*/

(function () {

  /* ══════════════════════════════════════════════════════
     TIME
     ══════════════════════════════════════════════════════
     Times are stored as the "HH:MM" strings the tracker's
     <input type="time"> fields produce. */

  function minutesOf(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
    if (!m) return null;
    const h = Number(m[1]), min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }

  /* A bedtime needs the day wrapped or the comparisons are nonsense:
     23:00 and 01:00 are half an hour apart in real life but 22 hours
     apart as numbers, and "before 9pm" would be true of 1am.

     So bedtimes are measured in minutes SINCE NOON. Everything from
     noon onward counts up; everything after midnight keeps counting.

       18:00 → 360     21:00 → 540     23:30 → 690
       00:00 → 720     01:00 → 780     03:00 → 900

     Which makes "before 9pm" simply < 540, and "past midnight" simply
     >= 720, with no special cases. */
  function bedOffset(hhmm) {
    const mins = minutesOf(hhmm);
    if (mins === null) return null;
    return mins >= 720 ? mins - 720 : mins + 720;
  }

  const BEFORE_9PM     = 540;    // 21:00 as an offset from noon
  const PAST_MIDNIGHT  = 720;    // 00:00 as an offset from noon

  function shiftKey(key, days) {
    const [y, m, d] = String(key).split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d) + days * 86400000);
    return t.getUTCFullYear() + "-" +
           String(t.getUTCMonth() + 1).padStart(2, "0") + "-" +
           String(t.getUTCDate()).padStart(2, "0");
  }

  const PH_DATE = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit"
  });
  const phToday = () => PH_DATE.format(new Date());


  /* ══════════════════════════════════════════════════════
     TESTS ON A SINGLE NIGHT
     ══════════════════════════════════════════════════════
     Each returns true, false, or null for "this log can't answer the
     question". Null matters: a night with no bedtime recorded is not
     a night she went to bed late, and counting it as one would hand
     out a penalty for a missing field. */

  const rose        = (r) => minutesOf(r.waketime) !== null;
  const roseBefore  = (n) => (r) => {
    const m = minutesOf(r.waketime);
    return m === null ? null : m < n;
  };
  const lightsOut   = (r) => bedOffset(r.bedtime) !== null;
  const lightsBefore = (n) => (r) => {
    const o = bedOffset(r.bedtime);
    return o === null ? null : o < n;
  };
  const pastMidnight = (r) => {
    const o = bedOffset(r.bedtime);
    return o === null ? null : o >= PAST_MIDNIGHT;
  };
  /* The tracker's own Overslept band — over 9.5 hours. Kept as the
     same number tracker-sleep.js pays 1,000 for, so "Overslept" means
     one thing in this app. */
  const overslept = (r) => {
    const h = Number(r.durationHrsVal);
    return Number.isFinite(h) && h > 0 ? h > 9.5 : null;
  };


  /* ══════════════════════════════════════════════════════
     THE TABLE  ← this is the part you edit
     ══════════════════════════════════════════════════════
     term    her wording from Notion, shown to her unchanged
     mode    "streak"  N consecutive days, counting back from the
                       most recent logged day
             "total"   N days ever, consecutive or not
     need    the N
     test    which nights count
     xp      ✎ mine — the column was empty in Notion
     once    true  = a trophy. Earned once, ever. (Her table has a
                     "Claimed" checkbox, which is what this mirrors.)
             false = re-arms after the condition clears

     Penalties carry a negative xp and are edge-triggered: they fire
     when the run reaches N, then stay quiet until it breaks and
     builds again. A penalty that could only ever fire once would
     stop meaning anything after the first bad week. */

  const AWARDS = [
    /* ── Rise ─────────────────────────────────────────── */
    { id: "morning-lark",    name: "Morning Lark",
      term: "5 Days Rise",
      group: "rise", mode: "total",  need: 5, test: rose,
      xp: 2500,  once: true },

    { id: "morning-person",  name: "Morning Person",
      term: "7 Days Rise Streak",
      group: "rise", mode: "streak", need: 7, test: rose,
      xp: 7500,  once: true },

    { id: "sunrise-catcher", name: "Sunrise Catcher",
      term: "5 Rise Before 5am",
      group: "rise", mode: "total",  need: 5, test: roseBefore(5 * 60),
      xp: 5000,  once: true },

    /* ✎ "7 Rise Before 5am or 6am Streak" reads as the looser of the
       two run as a streak — seven mornings up before six. The 5am
       half is already Sunrise Catcher's, counted differently. */
    { id: "early-bird",      name: "Early Bird",
      term: "7 Rise Before 5am or 6am Streak",
      group: "rise", mode: "streak", need: 7, test: roseBefore(6 * 60),
      xp: 12000, once: true },

    /* ── Lights Out ───────────────────────────────────── */
    { id: "aligned-rested",  name: "Aligned and Rested Sync",
      term: "5 Days Lights Out",
      group: "lights", mode: "total",  need: 5, test: lightsOut,
      xp: 2500,  once: true },

    { id: "circadian-sync",  name: "Circadian Sync",
      term: "7 Days Lights Out Streak",
      group: "lights", mode: "streak", need: 7, test: lightsOut,
      xp: 7500,  once: true },

    { id: "better-tomorrow", name: "Better Tomorrow",
      term: "5 Lights out before 9pm",
      group: "lights", mode: "total",  need: 5, test: lightsBefore(BEFORE_9PM),
      xp: 5000,  once: true }
  ];

  const PENALTIES = [
    /* "3 Days No Sleep" — three days running with nothing logged at
       all. Measured on the GAP, so it is the one rule here that reads
       absent days rather than present ones. */
    { id: "cycle-disturbance", name: "Cycle Disturbance Triggered!",
      term: "3 Days No Sleep",
      group: "rise", mode: "missing", need: 3, test: null,
      xp: -5000, once: false },

    { id: "above-threshold",   name: "Above Sleep Threshold Triggered!",
      term: "3 Days Overslept",
      group: "rise", mode: "streak", need: 3, test: overslept,
      xp: -3000, once: false },

    { id: "nyctophilic",       name: "Nyctophilic Triggered!",
      term: "3 Up Past Midnight",
      group: "lights", mode: "streak", need: 3, test: pastMidnight,
      xp: -3000, once: false }
  ];

  const ALL = AWARDS.concat(PENALTIES);

  const STATE_PATH  = "prestige_system/sleep_protocol";
  const META_PATH   = "prestige_system/sleep_protocol_meta";
  const EXEMPT_PATH = "sleep_exemptions";
  const SOURCE      = "SLEEP PROTOCOL";

  /* ══════════════════════════════════════════════════════
     EXEMPTIONS
     ══════════════════════════════════════════════════════
     A day marked "I wasn't logging, and that's fine."

     Only the PENALTIES look at these, and only the ones that read an
     absence. That is the whole point: an exemption is a defence
     against being fined for a night she never claimed to have had.
     It is deliberately NOT a way to keep a reward streak alive — she
     did not log the night, so she did not earn Morning Person. Being
     excused and being credited are different things, and a flag that
     did both would make every trophy meaningless.

       sleep_exemptions/YYYY-MM-DD  { reason, at, by }
  */
  function exemptSetFrom(exemptions) {
    if (!exemptions) return new Set();
    if (exemptions instanceof Set) return exemptions;
    if (Array.isArray(exemptions)) return new Set(exemptions);
    return new Set(Object.keys(exemptions).filter(k => exemptions[k]));
  }


  /* ══════════════════════════════════════════════════════
     COUNTING
     ══════════════════════════════════════════════════════ */

  /* Accepts the raw Firebase object (keyed by date) or an array, and
     hands back rows sorted oldest first with the date guaranteed —
     old rows carry it as a field, but the KEY is the authority. */
  function rowsFrom(logs, since) {
    if (!logs) return [];
    const rows = Array.isArray(logs)
      ? logs.slice()
      : Object.keys(logs).map(k => Object.assign({}, logs[k], { date: k }));

    return rows.filter(r => r && r.date)
               /* `since` is Day 1 — the date the protocol started counting.
                  Without it, turning the protocol on would reach back
                  through the whole archive and pay out every trophy in
                  the table at once for nights logged before the rules
                  existed. Date keys are YYYY-MM-DD, so a string compare
                  IS a date compare. */
               .filter(r => !since || String(r.date) >= since)
               .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

  /* How many of the most recent CONSECUTIVE days pass the test.

     Anchored to the newest logged day rather than to today, because
     sleep is logged on waking: for most of every morning today's row
     does not exist yet, and anchoring on today would collapse a run
     to zero at midnight and restore it at breakfast. A gap of more
     than a day from the anchor means the run is already over. */
  function streakRun(rows, test) {
    if (!rows.length) return 0;

    const byDate = new Map(rows.map(r => [r.date, r]));
    const today = phToday();
    let cursor = byDate.has(today) ? today : shiftKey(today, -1);
    if (!byDate.has(cursor)) return 0;      // nothing recent — run broken

    let n = 0;
    while (byDate.has(cursor)) {
      if (test(byDate.get(cursor)) !== true) break;
      n++;
      cursor = shiftKey(cursor, -1);
    }
    return n;
  }

  function totalCount(rows, test) {
    return rows.reduce((n, r) => n + (test(r) === true ? 1 : 0), 0);
  }

  /* Consecutive days with NO log, counting back from yesterday.

     Yesterday, not today: today's night is logged on waking and an
     unlogged today at 9am is the normal state of the world, not a
     missed night. Starting the count there would fire the no-sleep
     penalty every third quiet morning. */
  function missingRun(rows, exemptions) {
    if (!rows.length) return 0;
    const have   = new Set(rows.map(r => r.date));
    const exempt = exemptSetFrom(exemptions);

    /* The run STOPS at the start of the record. rowsFrom() sorts oldest
       first, so rows[0] is the earliest night the protocol is allowed
       to see — Day 1, once one is set.

       Without this the count runs back 400 days through dates that
       were never in scope, so a fresh Day 1 with a single night logged
       still reads as a year of neglect. That is the bug that fined
       her: a silent baseline is not enough on its own if the gap
       counter ignores where the baseline is. */
    const earliest = rows[0].date;

    let n = 0;
    let cursor = shiftKey(phToday(), -1);
    while (!have.has(cursor) && n < 400 && cursor >= earliest) {
      /* An exempted day STOPS the count rather than being skipped over.
         She has said in advance that this stretch does not count, so the
         run of neglect ends there — marking any one day inside a busy
         week is enough to call off the fine, which is what makes the
         feature worth having. */
      if (exempt.has(cursor)) break;
      n++;
      cursor = shiftKey(cursor, -1);
    }
    return n;
  }

  function progressOf(rows, def, exemptions) {
    if (def.mode === "missing") return missingRun(rows, exemptions);
    if (def.mode === "streak")  return streakRun(rows, def.test);
    return totalCount(rows, def.test);
  }

  /* Where every rule stands right now. The shape Poppy and the
     tracker both render, so neither has to know how any of it is
     counted. */
  function evaluate(logs, exemptions, since) {
    const rows = rowsFrom(logs, since);
    return ALL.map(def => {
      const progress = progressOf(rows, def, exemptions);
      return {
        id:       def.id,
        name:     def.name,
        term:     def.term,
        group:    def.group,
        xp:       def.xp,
        penalty:  def.xp < 0,
        once:     def.once,
        need:     def.need,
        progress: progress,
        met:      progress >= def.need
      };
    });
  }

  function byId(id) {
    return ALL.find(d => d.id === id) || null;
  }


  /* ══════════════════════════════════════════════════════
     SETTLING UP
     ══════════════════════════════════════════════════════
     Reads the logs and the record of what has already been paid,
     works out what is newly due, pays it, and returns what it did.

     Called after a night is written — by the tracker page and by
     Poppy, so a night logged either way settles identically.

     `prestige` is window.LIFEHUB_PRESTIGE and `stamp` the caller's
     server-time sentinel, for the same reason the ledger takes them:
     the compat and modular SDKs spell it differently and this file
     refuses to know which one it is running under. */
  /* The row written to prestige_system/sleep_protocol, and the little
     object handed back to the caller. Split out only so the two
     branches above cannot drift apart. */
  function stamp_(def, progress, today) {
    return {
      at:       Date.now(),
      date:     today,
      name:     def.name,
      term:     def.term,
      amount:   def.xp,
      progress: progress,
      met:      true
    };
  }

  function receipt(def) {
    return { id: def.id, name: def.name, term: def.term,
             amount: def.xp, penalty: def.xp < 0 };
  }

  function settle(db, prestige, stamp, options) {
    const opts = options || {};

    return Promise.all([
      db.ref("sleep_logs").once("value"),
      db.ref(STATE_PATH).once("value"),
      db.ref(EXEMPT_PATH).once("value"),
      db.ref(META_PATH).once("value")
    ]).then(([logSnap, stateSnap, exemptSnap, metaSnap]) => {
      const meta  = metaSnap.val() || {};
      const today = phToday();

      /* ── FIRST RUN IS ALWAYS A SILENT BASELINE ──────────────────
         With no Day 1 recorded, this is the first time the protocol
         has run — so it records today and settles NOTHING.

         A correctness rule, not an optimisation. Without it the first
         settle replays an archive logged before these rules existed:
         the cumulative trophies pay out for nights from months ago,
         and Cycle Disturbance reads the gap since the last entry as
         days of neglect. Setting Day 1 by hand was never a reasonable
         thing to require — forgetting it costs real prestige, and the
         cost lands silently.

         An explicit opts.since overrides this, for a deliberate
         re-baseline through startFrom() or resetTo(). */
      if (!opts.since && !meta.startDate) {
        return db.ref(META_PATH)
                 .set({ startDate: today, at: Date.now(), auto: true })
                 .then(() => []);
      }

      const since  = opts.since || meta.startDate;
      const rows   = rowsFrom(logSnap.val(), since);
      const state  = stateSnap.val() || {};
      const exempt = exemptSnap.val() || {};

      const updates = {};
      const paid    = [];

      ALL.forEach(def => {
        const progress = progressOf(rows, def, exempt);
        const met      = progress >= def.need;
        const prior    = state[def.id] || null;

        /* ── a trophy (once: true) ──────────────────────
           Present in the node means earned, full stop. The condition
           falling away later changes nothing: she did earn it. */
        if (def.once) {
          if (met && !prior) {
            updates[def.id] = stamp_(def, progress, today);
            paid.push(receipt(def));
          }
          return;
        }

        /* ── edge-triggered (once: false) ───────────────
           Fires on the TRANSITION into met, never while it stays
           met — so a fourth overslept night does not fine her again
           for the same run. Breaking the run writes met:false, which
           is what re-arms it. */
        const wasMet = prior ? prior.met === true : false;

        if (met && !wasMet) {
          updates[def.id] = stamp_(def, progress, today);
          paid.push(receipt(def));
        } else if (!met && wasMet) {
          updates[def.id] = Object.assign({}, prior,
                                          { met: false, progress: progress });
        }
      });

      if (!Object.keys(updates).length) return [];

      const writes = [db.ref(STATE_PATH).update(updates)];

      /* One ledger row per award, named as she named it, so the bank's
         transaction list reads "Morning Person — 7 Days Rise Streak"
         rather than a lump sum with no story. */
      if (!opts.skipLedger && paid.length && prestige) {
        paid.forEach(p => {
          const why = p.name + " — " + p.term;
          db.ref("prestige_system/balance")
            .transaction(c => (c || 0) + p.amount);
          writes.push(
            db.ref("prestige_system/transactions")
              .push(prestige.row(p.amount, why, SOURCE, stamp))
          );
        });
      }

      return Promise.all(writes).then(() => paid);
    });
  }


  /* ══════════════════════════════════════════════════════
     EXEMPTIONS — the writes
     ══════════════════════════════════════════════════════
     Deliberately separate from the log. An exemption is not a night
     with no sleep in it; it is a note saying no night was claimed, and
     conflating the two would put a phantom row in the history and the
     charts. */

  function exempt(db, date, reason, by) {
    const key = String(date || phToday());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
      return Promise.reject(new Error("An exemption needs a date as YYYY-MM-DD."));
    }
    if (key > phToday()) {
      return Promise.reject(new Error(key + " hasn't happened yet."));
    }
    return db.ref(EXEMPT_PATH + "/" + key).set({
      reason: String(reason || "").trim() || "No reason given",
      at:     Date.now(),
      by:     String(by || "LifeHub")
    }).then(() => key);
  }

  function unexempt(db, date) {
    const key = String(date || phToday());
    return db.ref(EXEMPT_PATH + "/" + key).remove().then(() => key);
  }

  function readExemptions(db) {
    return db.ref(EXEMPT_PATH).once("value").then(s => s.val() || {});
  }

  /* ══════════════════════════════════════════════════════
     DAY 1
     ══════════════════════════════════════════════════════
     Starts the protocol from a given date: forgets everything already
     settled and refuses to count any night before it.

     This is the ONLY safe way to switch the rules on over an existing
     archive. Without it, the next save would replay months of history
     through a table that did not exist at the time and pay out the
     whole board in one alert. */
  function startFrom(db, date) {
    const key = String(date || phToday());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
      return Promise.reject(new Error("Day 1 needs a date as YYYY-MM-DD."));
    }
    return Promise.all([
      db.ref(STATE_PATH).remove(),
      db.ref(META_PATH).set({ startDate: key, at: Date.now() })
    ]).then(() => key);
  }

  /* startFrom() with the money given back.
     ────────────────────────────────────────────────────────────────
     startFrom() alone forgets what was settled but leaves the ledger
     rows standing, so anything already paid stays in the balance and
     in the rank. That is correct for a first-time setup on an empty
     ledger and WRONG after the protocol has run against an archive it
     was never meant to see — which is what happens if it settles a
     history logged before the rules existed.

     So this reverses every row it wrote first, then starts over.

     Refunds go through prestige.reversal(), never a plain negative
     row: lifetime prestige ignores negatives unless they say they are
     corrections, so a hand-rolled one would take the points out of the
     balance and leave them in the rank forever.

     opts.purge DELETES the original rows instead of appending
     corrections — for rows that should never have existed at all,
     rather than real events that later proved wrong. It is narrow: it
     removes only rows whose source is this protocol AND whose
     description matches an award currently in the state node, so it
     cannot touch a night's own prestige or anything another tracker
     wrote. See the fuller note in lifehub-hydration-protocol.js. */
  function resetTo(db, date, prestige, stamp, options) {
    const opts = options || {};
    if (!opts.purge && (!prestige || typeof prestige.reversal !== "function")) {
      return Promise.reject(new Error("resetTo needs window.LIFEHUB_PRESTIGE."));
    }

    return db.ref(STATE_PATH).once("value").then(snap => {
      const state = snap.val() || {};
      const rows  = Object.keys(state).map(id => Object.assign({ id }, state[id]))
                          .filter(r => r.met === true && Number(r.amount));

      if (!rows.length) {
        return startFrom(db, date).then(day1 => ({ day1: day1, undone: [] }));
      }

      const undone = [];
      const work = [];

      rows.forEach(r => {
        const amount = Number(r.amount) || 0;

        /* The balance moves the opposite way to however it went. A
           refunded PENALTY gives points back; a refunded trophy takes
           them away. */
        db.ref("prestige_system/balance").transaction(c => (c || 0) - amount);
        undone.push({ id: r.id, name: r.name || r.id, amount: -amount });

        if (!opts.purge) {
          work.push(db.ref("prestige_system/transactions").push(
            prestige.reversal(amount, "Sleep Protocol reset — " +
                              (r.name || r.id), SOURCE, stamp)));
        }
      });

      if (!opts.purge) {
        return Promise.all(work)
          .then(() => startFrom(db, date))
          .then(day1 => ({ day1: day1, undone: undone, mode: "reversed" }));
      }

      const wanted = {};
      rows.forEach(r => { wanted[(r.name || r.id) + " — " + (r.term || "")] = true; });

      return db.ref("prestige_system/transactions").once("value").then(txSnap => {
        const all = txSnap.val() || {};
        const removed = [];

        Object.keys(all).forEach(key => {
          const tx = all[key];
          if (!tx || tx.source !== SOURCE) return;
          if (!wanted[String(tx.description)]) return;
          removed.push({ key: key, description: tx.description, amount: tx.amount });
        });

        return Promise.all(
          removed.map(r => db.ref("prestige_system/transactions/" + r.key).remove())
        ).then(() => startFrom(db, date))
         .then(day1 => ({ day1: day1, undone: undone,
                          mode: "purged", removed: removed }));
      });
    });
  }


  window.LIFEHUB_SLEEP_PROTOCOL = {
    AWARDS, PENALTIES, ALL,
    STATE_PATH, META_PATH, EXEMPT_PATH, SOURCE,
    exempt, unexempt, readExemptions, startFrom, resetTo, exemptSetFrom,
    /* the helpers, exported so the tests and Poppy can reach them */
    minutesOf, bedOffset, rowsFrom, streakRun, totalCount, missingRun,
    evaluate, progressOf, byId, settle
  };

})();
