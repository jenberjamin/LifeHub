/* LifeHub — the Hydration Protocol: phases, rewards and penalties.
   ────────────────────────────────────────────────────────────────
   The companion to lifehub-sleep-protocol.js, and built the same way
   for the same reason: the tracker, the homescreen reminder, the bank
   and Poppy all read THIS file, so a rule changed here changes
   everywhere at once.

   It does NOT redefine the goal, the drink table or the unit maths —
   those are lifehub-hydration-rules.js and stay there. This is only
   what a trophy is, and how the day is paced.

   PURE LOGIC. No Firebase, no DOM. settle() takes the caller's
   database handle.

   ── THE SHAPE OF THE DATA ────────────────────────────────────────
     hydration_logs/YYYY-MM-DD   { total, logs: [{amount, time, type}],
                                   workoutMode, ... }
     prestige_system/hydration_protocol/ID   one row per award earned

   ── WHAT IS HERS AND WHAT IS AN INTERPRETATION ───────────────────
   The three reward names and their terms are hers, verbatim from
   Notion. Two things are mine, marked ✎:

     ✎ the XP values   the column was empty
     ✎ the PHASES      her penalty reads "&gt;3 Phase I, II, &amp; III" and
                       nothing in the app has ever defined a phase.
                       Three windows through the day is the reading
                       that makes the term mean something AND gives
                       the reminder something to pace against.
*/

(function () {

  function rules() {
    if (!window.LIFEHUB_HYDRATION) {
      throw new Error("JS/lifehub-hydration-rules.js must load before this file.");
    }
    return window.LIFEHUB_HYDRATION;
  }

  /* ══════════════════════════════════════════════════════
     TIME
     ══════════════════════════════════════════════════════ */

  const PH_TZ = "Asia/Manila";
  const PH_DATE = new Intl.DateTimeFormat("en-CA", {
    timeZone: PH_TZ, year: "numeric", month: "2-digit", day: "2-digit"
  });
  const phToday = () => PH_DATE.format(new Date());

  const phHour = () => parseInt(new Date().toLocaleString("en-US", {
    timeZone: PH_TZ, hour12: false, hour: "2-digit"
  }), 10);

  function shiftKey(key, days) {
    const [y, m, d] = String(key).split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d) + days * 86400000);
    return t.getUTCFullYear() + "-" +
           String(t.getUTCMonth() + 1).padStart(2, "0") + "-" +
           String(t.getUTCDate()).padStart(2, "0");
  }


  /* ══════════════════════════════════════════════════════
     ✎ THE PHASES  ← this is the part you edit
     ══════════════════════════════════════════════════════
     Three windows across the waking day, each with a share of the
     goal that should be DONE by the time it closes. The shares are
     cumulative, so Phase III's share is the whole goal.

     Why front-loaded rather than even thirds: the first sip already
     pays 2.5× between 4am and 8am, drinking late keeps her up, and
     the morning is when she actually reaches for water. A flat pace
     would nag hardest in the evening, which is the worst time to be
     told to drink another 300ml.

     `from` is inclusive, `to` exclusive, in Manila hours. Nothing is
     nagged outside Phase III's close — 11pm is not a moment for a
     hydration reminder. */

  const PHASES = [
    { id: "I",   name: "Phase I",   label: "Morning",
      from: 4,  to: 11, share: 0.40 },
    { id: "II",  name: "Phase II",  label: "Afternoon",
      from: 11, to: 17, share: 0.75 },
    { id: "III", name: "Phase III", label: "Evening",
      from: 17, to: 22, share: 1.00 }
  ];

  /* The entry's own date goes through, so a day logged under the old
     100oz goal is still measured against 100 — see GOAL_CHANGED_ON in
     lifehub-hydration-rules.js. Days with no date (the reminder's
     live "today") fall through to the current goal, which is right. */
  function goalFor(entry) {
    return rules().goalFor(entry && entry.workoutMode, entry && entry.date);
  }

  function phaseAt(hour) {
    return PHASES.find(p => hour >= p.from && hour < p.to) || null;
  }

  /* How much SHOULD be down by now — the target of the phase we are
     in. Before Phase I opens and after Phase III closes there is no
     target at all, which is what stops the reminder firing at 2am. */
  function targetAt(hour, entry) {
    const phase = phaseAt(hour);
    if (!phase) return null;
    return Math.round(goalFor(entry) * phase.share);
  }

  /* Everything the reminder needs to decide whether to speak.
     Returns null outside the drinking day. */
  function pace(entry, hour) {
    const h = typeof hour === "number" ? hour : phHour();
    const phase = phaseAt(h);
    if (!phase) return null;

    const R      = rules();
    const goal   = goalFor(entry);
    const total  = Number(entry && entry.total) || 0;
    const target = Math.round(goal * phase.share);
    const short  = Math.max(0, target - total);

    return {
      phase:   phase,
      hour:    h,
      goal:    goal,
      total:   total,
      target:  target,
      short:   short,
      behind:  short > 0,
      done:    total >= goal,
      /* Rounded UP: telling her one glass when she is 1.4 short would
         leave her behind after doing exactly as she was told. */
      glasses: Math.ceil(short / R.GLASS_OZ),
      /* Whether the morning sip — the 2.5× one — has happened. */
      hadFirstSip: hasFirstSip(entry)
    };
  }

  /* The 4am–8am sip. The tracker marks those entries type:"First Sip";
     older rows predate the field, so the time is checked as well. */
  function hasFirstSip(entry) {
    const logs = (entry && entry.logs) || [];
    return logs.some(l => {
      if (!l) return false;
      if (String(l.type || "").toLowerCase().indexOf("first") === 0) return true;
      const m = /^(\d{1,2}):(\d{2})/.exec(String(l.time || "").trim());
      if (!m) return false;
      const h = Number(m[1]);
      return rules().isFirstSipHour(h);
    });
  }

  /* Which phases a FINISHED day missed. Used by the penalty, so it
     judges the day as a whole rather than the moment. */
  function phasesMissed(entry) {
    const goal = goalFor(entry);
    const total = Number(entry && entry.total) || 0;
    return PHASES.filter(p => total < Math.round(goal * p.share)).map(p => p.id);
  }

  /* ✎ WHAT KIND OF DAY WAS IT — the distinction the penalties turn on.
     ────────────────────────────────────────────────────────────────
       "stale"  she never logged. There is NO measurement here, so it
                cannot be evidence of dehydration — only of not
                tracking. Those are different failures and are fined
                separately.
       "short"  she logged, and the day still missed all three phases.
                This is the real thing: drinking, but not enough.
       "ok"     the day reached Phase I or better.

     A day is stale when it has no logs — NOT merely when it has no
     node. The drought audit and the workout switch both write a day
     shell with `total: 0` and no `logs` array (2026-09-10 is one), and
     reading those as "logged 0 oz" would feed the dehydration counter
     with days she never touched. That is the exact confusion this
     whole split exists to end, so it is checked on the logs. */
  function dayState(entry) {
    const logs = (entry && entry.logs) || [];
    if (!logs.length) return "stale";
    return phasesMissed(entry).length < PHASES.length ? "ok" : "short";
  }


  /* ══════════════════════════════════════════════════════
     THE TABLE  ← her Notion rows
     ══════════════════════════════════════════════════════
     mode  "streak"  N consecutive days passing the test
           "window"  a rolling N-day total of ounces
           "missed"  N days that missed every phase
  */

  const AWARDS = [
    { id: "first-sipper", name: "First Sipper",
      term: "7 Rise Sips Streak",
      mode: "streak", need: 7, test: hasFirstSip,
      xp: 7500, once: true },

    { id: "drinker",      name: "Drinker",
      term: "300 oz in a Week",
      mode: "window", need: 300, days: 7,
      xp: 5000, once: true },

    { id: "never-thirsty", name: "Never Thirsty",
      term: "420 oz in a Week",
      mode: "window", need: 420, days: 7,
      xp: 12000, once: true }
  ];

  const PENALTIES = [
    /* ✎ "&gt;3 Phase I, II, &amp; III" — more than three days that missed
       all three phases. "More than 3" is read as 4, since that is what
       the words say; a day that hit even Phase I does not count.

       Counted over LOGGED days only. Days she never logged are stepped
       over as if they were not there: they neither add to this count
       nor clear it. Jen's rule, and the reason for it is that a day
       with no data is not evidence she was dehydrated — it is evidence
       she was busy, or ill, or asleep. Only a day that actually
       reaches Phase I clears the count. */
    { id: "dehydrated", name: "Dehydrated Triggered!",
      term: "3 Phase I, II, & III",
      mode: "short", need: 4,
      xp: -5000, once: false },

    /* ✎ The other half of the split: four days in a row with nothing
       logged at all. Strictly consecutive — a single logged day, however
       small, resets it to zero. That is deliberate: the fine is for
       going dark, and logging anything at all means she did not.

       Priced ABOVE the dehydration fine on purpose. Drinking too little
       is a bad day; not tracking for four straight days blinds every
       other rule in this file — the streaks, the windows, the reminder
       and the dehydration count all read the logs, and none of them can
       do anything with silence. */
    { id: "untracked", name: "Hydration Untracked!",
      term: "4 Days Unlogged",
      mode: "stale", need: 4,
      xp: -8000, once: false }
  ];

  const ALL = AWARDS.concat(PENALTIES);

  const STATE_PATH = "prestige_system/hydration_protocol";
  const META_PATH  = "prestige_system/hydration_protocol_meta";
  const SOURCE     = "HYDRATION PROTOCOL";


  /* ══════════════════════════════════════════════════════
     COUNTING
     ══════════════════════════════════════════════════════ */

  function rowsFrom(logs, since) {
    if (!logs) return [];
    const rows = Object.keys(logs)
      .map(k => Object.assign({}, logs[k], { date: k }))
      .filter(r => r && r.date);

    return rows.filter(r => !since || String(r.date) >= since)
               .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

  /* Consecutive days passing the test, anchored to the newest day with
     any entry — the same rule the sleep protocol uses, and for the
     same reason: today is still in progress for most of the day, and
     anchoring on it would break every streak at midnight. */
  function streakRun(rows, test) {
    if (!rows.length) return 0;
    const byDate = new Map(rows.map(r => [r.date, r]));
    const today = phToday();
    let cursor = byDate.has(today) ? today : shiftKey(today, -1);
    if (!byDate.has(cursor)) return 0;

    let n = 0;
    while (byDate.has(cursor)) {
      if (test(byDate.get(cursor)) !== true) break;
      n++;
      cursor = shiftKey(cursor, -1);
    }
    return n;
  }

  /* The best any rolling `days`-day window has totalled. Rolling, not
     calendar: "420 oz in a Week" should not depend on which day the
     week is deemed to start. */
  function bestWindow(rows, days) {
    if (!rows.length) return 0;
    const byDate = new Map(rows.map(r => [r.date, Number(r.total) || 0]));

    let best = 0;
    rows.forEach(r => {
      let sum = 0;
      let cursor = r.date;
      for (let i = 0; i < days; i++) {
        sum += byDate.get(cursor) || 0;
        cursor = shiftKey(cursor, -1);
      }
      if (sum > best) best = sum;
    });
    return Math.round(best);
  }

  /* Both counters walk backwards from YESTERDAY. Today is excluded and
     always was: it is still in progress, and a day judged at 9am has
     missed everything by definition. That exclusion is why a penalty
     can land the moment she logs after a gap — the gap was already
     earned, and the sip only ran the audit.

     Both also STOP at the start of the record. Without that bound the
     count runs back through all of history and fines her the first
     time the protocol is switched on, for every day before the tracker
     existed. */
  function walkBack(rows, step) {
    if (!rows.length) return 0;
    const byDate   = new Map(rows.map(r => [r.date, r]));
    const earliest = rows[0].date;

    let n = 0;
    let cursor = shiftKey(phToday(), -1);
    for (let i = 0; i < 400 && cursor >= earliest; i++) {
      const verdict = step(dayState(byDate.get(cursor) || {}), n);
      if (verdict === "stop") break;
      if (verdict === "count") n++;
      /* "skip" falls through — the day is stepped over untouched. */
      cursor = shiftKey(cursor, -1);
    }
    return n;
  }

  /* Days that were LOGGED and still missed all three phases. Stale days
     are transparent: stepped over without counting or clearing, so a
     run of short days survives a week of silence in the middle of it.
     Only a day that reached Phase I stops the count. */
  function shortRun(rows) {
    return walkBack(rows, state => {
      if (state === "stale") return "skip";
      if (state === "ok")    return "stop";
      return "count";
    });
  }

  /* Days in a row with nothing logged at all. Strictly consecutive —
     any logged day, short or not, ends the run. */
  function staleRun(rows) {
    return walkBack(rows, state => (state === "stale" ? "count" : "stop"));
  }

  function progressOf(rows, def) {
    if (def.mode === "window") return bestWindow(rows, def.days);
    if (def.mode === "short")  return shortRun(rows);
    if (def.mode === "stale")  return staleRun(rows);
    return streakRun(rows, def.test);
  }

  function evaluate(logs, since) {
    const rows = rowsFrom(logs, since);
    return ALL.map(def => {
      const progress = progressOf(rows, def);
      return {
        id: def.id, name: def.name, term: def.term,
        xp: def.xp, penalty: def.xp < 0, once: def.once,
        need: def.need, progress: progress, met: progress >= def.need
      };
    });
  }

  function byId(id) { return ALL.find(d => d.id === id) || null; }


  /* ══════════════════════════════════════════════════════
     SETTLING UP
     ══════════════════════════════════════════════════════
     Identical contract to the sleep protocol's settle(). */

  function stamp_(def, progress, today) {
    return { at: Date.now(), date: today, name: def.name, term: def.term,
             amount: def.xp, progress: progress, met: true };
  }
  function receipt(def) {
    return { id: def.id, name: def.name, term: def.term,
             amount: def.xp, penalty: def.xp < 0 };
  }

  function settle(db, prestige, stamp, options) {
    const opts = options || {};

    return Promise.all([
      db.ref("hydration_logs").once("value"),
      db.ref(STATE_PATH).once("value"),
      db.ref(META_PATH).once("value")
    ]).then(([logSnap, stateSnap, metaSnap]) => {
      const meta  = metaSnap.val() || {};
      const today = phToday();

      /* ── FIRST RUN IS ALWAYS A SILENT BASELINE ──────────────────
         With no Day 1 recorded, this is the first time the protocol
         has ever run — so it records today and settles NOTHING.

         Not an optimisation; a correctness rule. Without it the first
         settle judges an archive logged before these rules existed:
         every day with no hydration node reads as a day that missed
         all three phases, so a gap of a week in the history is a
         -5,000 fine the moment the tracker is next touched. That is
         exactly what happened when the workout toggle — which saves,
         and so settles — was flipped.

         An explicit opts.since overrides this, for a deliberate
         re-baseline through startFrom(). */
      if (!opts.since && !meta.startDate) {
        return db.ref(META_PATH)
                 .set({ startDate: today, at: Date.now(), auto: true })
                 .then(() => []);
      }

      const since = opts.since || meta.startDate;
      const rows  = rowsFrom(logSnap.val(), since);
      const state = stateSnap.val() || {};

      const updates = {};
      const paid    = [];

      ALL.forEach(def => {
        const progress = progressOf(rows, def);
        const met      = progress >= def.need;
        const prior    = state[def.id] || null;

        if (def.once) {
          if (met && !prior) {
            updates[def.id] = stamp_(def, progress, today);
            paid.push(receipt(def));
          }
          return;
        }

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

      if (!opts.skipLedger && paid.length && prestige) {
        paid.forEach(p => {
          db.ref("prestige_system/balance").transaction(c => (c || 0) + p.amount);
          writes.push(db.ref("prestige_system/transactions")
                        .push(prestige.row(p.amount, p.name + " — " + p.term,
                                           SOURCE, stamp)));
        });
      }

      return Promise.all(writes).then(() => paid);
    });
  }

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
     Two ways to undo a row, and they are not the same thing:

       reverse (default)  append a correcting row. Correct accounting,
                          and what you want when the original WAS a
                          real event that later proved wrong. Both
                          rows stay in the history forever.

       purge (opts.purge) delete the original outright. For a row that
                          should never have existed at all — a bug,
                          not a mistaken judgement. There is nothing
                          to audit in a transaction that never
                          described anything real.

     Purge is deliberately narrow: it removes only rows whose source is
     this protocol AND whose description matches an award currently in
     the state node. It cannot touch a sip, a completion bonus, or
     anything the sleep tracker wrote. */
  function resetTo(db, date, prestige, stamp, options) {
    const opts = options || {};
    if (!opts.purge && (!prestige || typeof prestige.reversal !== "function")) {
      return Promise.reject(new Error("resetTo needs window.LIFEHUB_PRESTIGE."));
    }

    return db.ref(STATE_PATH).once("value").then(snap => {
      const state = snap.val() || {};
      const rows = Object.keys(state)
        .map(id => Object.assign({ id: id }, state[id]))
        .filter(r => r.met === true && Number(r.amount));

      if (!rows.length) {
        return startFrom(db, date).then(day1 => ({ day1: day1, undone: [] }));
      }

      const undone = [];
      const work = [];

      rows.forEach(r => {
        const amount = Number(r.amount) || 0;
        /* The balance moves opposite to however it went. A refunded
           PENALTY hands points back; a refunded trophy takes them. */
        db.ref("prestige_system/balance").transaction(c => (c || 0) - amount);
        undone.push({ id: r.id, name: r.name || r.id, amount: -amount });

        if (!opts.purge) {
          work.push(db.ref("prestige_system/transactions").push(
            prestige.reversal(amount, "Hydration Protocol reset — " +
                              (r.name || r.id), SOURCE, stamp)));
        }
      });

      if (!opts.purge) {
        return Promise.all(work)
          .then(() => startFrom(db, date))
          .then(day1 => ({ day1: day1, undone: undone, mode: "reversed" }));
      }

      /* Find the rows this protocol wrote for exactly these awards. */
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


  window.LIFEHUB_HYDRATION_PROTOCOL = {
    PHASES, AWARDS, PENALTIES, ALL,
    STATE_PATH, META_PATH, SOURCE,
    phaseAt, targetAt, pace, hasFirstSip, phasesMissed, dayState,
    rowsFrom, streakRun, bestWindow, shortRun, staleRun, progressOf,
    evaluate, byId, settle, startFrom, resetTo
  };

})();
