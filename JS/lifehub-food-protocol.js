/* LifeHub — the Food Protocol: weekly rewards and one penalty.
   ────────────────────────────────────────────────────────────────
   The third of its kind, after lifehub-sleep-protocol.js and
   lifehub-hydration-protocol.js, and built to the same contract so the
   tracker, the homescreen toast, the bank and Poppy all read THIS file.

   It does NOT redefine the targets or the wage rubric — those are
   lifehub-food-rules.js and stay there. This is only what a trophy is.

   PURE LOGIC. No Firebase, no DOM. settle() takes the caller's handle.

   ── WHY WEEKLY ───────────────────────────────────────────────────
   FoodHub already pays per day: +3,000 at gold, +1,000 at green,
   -1,000 under 2,200, +500 for protein, and half the day's wage back
   if sugar goes over. That is a complete daily system and this does
   not duplicate it.

   What the day cannot see is a WEEK. Eating well on Tuesday is worth
   something; eating well for seven days is worth much more than seven
   times as much, and it is the thing that was never recognised — the
   reason the habit collapsed was that nothing accumulated.

   ── JEN IS GAINING WEIGHT ────────────────────────────────────────
   Every award here rewards eating MORE. There is deliberately no
   penalty for a heavy week, a high total, or sugar — sugar already has
   its tax on the day, and a second one would mean paying twice for one
   biscuit.

   The single penalty is for NOT LOGGING, because that is the actual
   failure mode: the tracker died from silence, not from bad days.

   ── THE SHAPE OF THE DATA ────────────────────────────────────────
     dailyLogs/YYYY-MM-DD/<pushId>   { foodName, multiplier, macros }
     prestige_system/food_protocol/ID    one row per award earned
*/

(function () {

  function rules() {
    if (!window.LIFEHUB_FOOD) {
      throw new Error("JS/lifehub-food-rules.js must load before this file.");
    }
    return window.LIFEHUB_FOOD;
  }


  /* ══════════════════════════════════════════════════════
     TIME
     ══════════════════════════════════════════════════════ */

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


  /* ══════════════════════════════════════════════════════
     ✎ THE PHASES  ← pacing, for the homescreen card
     ══════════════════════════════════════════════════════
     Three windows across the eating day, each with a share of the
     day's floor that should be DONE by the time it closes. Cumulative,
     so Phase III's share is the whole thing.

     Paced against the FLOOR (2,200) rather than gold, because falling
     under the floor is the only calorie outcome that actually costs
     her — gold is upside and the card names it separately. Pacing to
     gold would mean the card reads "behind" on a perfectly good day.

     Back-loaded rather than even thirds, which is the opposite of
     hydration: she wakes at six and rarely eats much before mid
     morning, and the biggest meal of a Filipino day is not breakfast.
     An even pace would nag hardest at 9am, which is the hour she is
     least able to do anything about it.

     `from` inclusive, `to` exclusive, Manila hours. Nothing is paced
     outside Phase III's close — 11pm is not a moment to be told to
     eat, and eating then costs her sleep. */

  const PHASES = [
    { id: "I",   name: "Phase I",   label: "Morning",   from: 7,  to: 12, share: 0.20 },
    { id: "II",  name: "Phase II",  label: "Afternoon", from: 12, to: 17, share: 0.55 },
    { id: "III", name: "Phase III", label: "Evening",   from: 17, to: 22, share: 1.00 }
  ];

  function phaseAt(hour) {
    return PHASES.find(p => hour >= p.from && hour < p.to) || null;
  }

  /* How much should be eaten by the END of the phase this hour is in. */
  function targetAt(hour) {
    const p = phaseAt(hour);
    if (!p) return null;
    return Math.round(rules().DAILY_GOALS.cal.semi * p.share);
  }

  /* Where she stands right now, and everything the card needs to say
     it. Takes the raw day node — the same thing Firebase hands back —
     and totals it through the shared reader.

     Returns null outside the eating day, which the card reads as
     "nothing to say". */
  function pace(dayLogs, hour) {
    const phase = phaseAt(hour);
    if (!phase) return null;

    const F = rules();
    const g = F.DAILY_GOALS;
    const t = F.totalsFor(dayLogs);

    const target = Math.round(g.cal.semi * phase.share);
    const sugarLeft = g.sugar.limit - t.sugar;

    return {
      phase: phase, hour: hour,

      cal: t.cal, prot: t.prot, sugar: t.sugar,

      target: target,
      floor:  g.cal.semi,
      gold:   g.cal.ult,

      /* Behind for this hour — the only thing that makes the card
         speak about calories. */
      behind: t.cal < target,
      short:  Math.max(0, target - t.cal),

      toFloor: Math.max(0, g.cal.semi - t.cal),
      toGold:  Math.max(0, g.cal.ult  - t.cal),
      toProtein: Math.max(0, g.prot.ult - t.prot),

      sugarLimit: g.sugar.limit,
      sugarLeft:  sugarLeft,
      /* Close enough to be worth a heads-up, and not yet over. Once
         she is over there is nothing left to protect and saying so
         again is just nagging about a spent day. */
      sugarClose: sugarLeft > 0 && t.sugar >= g.sugar.limit * 0.8,
      sugarOver:  sugarLeft <= 0
    };
  }


  /* ══════════════════════════════════════════════════════
     ✎ THE TABLE  ← this is the part you edit
     ══════════════════════════════════════════════════════
     mode  "window"  the best rolling N-day total of some measure
           "streak"  N consecutive days passing a test
           "missed"  N consecutive recent days with nothing logged
           "count"   the WORST rolling N-day count of days passing a
                     test — for things you want fewer of

     The weekly numbers come from the daily ones, so they stay honest
     if the daily targets move:
       a green week   7 × 2,200 = 15,400
       a gold week    7 × 2,700 = 18,900
       a protein week 7 × 130g  = 910g
     Rounded down a little, because a week that misses by forty
     calories is not a week that failed. */

  function weekly(dailyTarget, slack) {
    return Math.round(dailyTarget * 7 * (1 - (slack == null ? 0.03 : slack)));
  }

  const AWARDS = [
    { id: "fed",        name: "Fed",
      term: "A green week",
      mode: "window", days: 7, measure: "cal",
      needOf: (g) => weekly(g.cal.semi),
      xp: 5000, once: true },

    { id: "well-fed",   name: "Well Fed",
      term: "A gold week",
      mode: "window", days: 7, measure: "cal",
      needOf: (g) => weekly(g.cal.ult),
      xp: 12000, once: true },

    { id: "built",      name: "Built",
      term: "A week of protein",
      mode: "window", days: 7, measure: "prot",
      needOf: (g) => weekly(g.prot.ult),
      xp: 7500, once: true },

    /* Consistency rather than volume — seven days that each cleared
       green, which is a harder and better thing than one enormous
       Sunday carrying the week. */
    { id: "steady",     name: "Steady",
      term: "7 green days in a row",
      mode: "streak", need: 7,
      test: (d, g) => d.tracked && d.cal >= g.cal.semi,
      xp: 7500, once: true },

    /* The one that is about the tracker rather than the food. Logging
       for a fortnight is what makes every other number mean anything,
       and it is the habit that actually broke. */
    { id: "on-the-record", name: "On the Record",
      term: "14 days logged in a row",
      mode: "streak", need: 14,
      test: (d) => d.tracked,
      xp: 5000, once: true },

    /* ── SUGAR ────────────────────────────────────────────────────
       Jen has a family history of diabetes, which makes this the one
       measure here that is about health rather than about the game.

       It is the only award that rewards NOT doing something, and it
       is deliberately worth more than a gold week: gaining weight is
       the goal, but doing it on sugar is the way to gain weight and a
       diagnosis at the same time. */
    { id: "clean-week", name: "Clean Week",
      term: "7 days under the sugar limit",
      mode: "streak", need: 7,
      test: (d, g) => d.tracked && d.sugar < g.sugar.limit,
      xp: 15000, once: true }
  ];

  const PENALTIES = [
    /* NOT for eating badly. For the tracker going quiet, which is the
       failure this system actually suffers from. Repeatable, and it
       cannot reach back before the protocol's Day 1. */
    { id: "off-the-record", name: "Off the Record",
      term: "4 days unlogged",
      mode: "missed", need: 4,
      xp: -2000, once: false },

    /* ── THE ONE PENALTY FOR EATING ───────────────────────────────
       Everywhere else this protocol refuses to punish eating, because
       the goal is to gain weight. Sugar is the exception, and it is
       an exception on medical grounds rather than on the game's.

       Why a COUNT of days rather than a weekly total: repeated spikes
       are the pattern that matters for insulin resistance, and a
       weekly total would let three enormous days hide behind four
       clean ones. Three over-limit days in any seven is a habit
       forming, which is the thing worth catching early.

       The daily sugar tax still applies on each of those days. This
       sits on top, and it is meant to — the day tax is proportional
       and forgettable; the pattern is what carries the risk.

       Repeatable, so it fires again each time the pattern returns. */
    { id: "sugar-spike", name: "Sugar Spike",
      term: "3 days over the limit in a week",
      mode: "count", days: 7, need: 3,
      test: (d, g) => d.tracked && d.sugar >= g.sugar.limit,
      xp: -4000, once: false }
  ];

  const ALL = AWARDS.concat(PENALTIES);

  const STATE_PATH = "prestige_system/food_protocol";
  const META_PATH  = "prestige_system/food_protocol_meta";
  const SOURCE     = "FOOD PROTOCOL";

  /* Resolved against the live targets rather than frozen here, so
     raising the calorie goal raises the weekly bar with it. */
  function needOf(def) {
    if (typeof def.needOf === "function") return def.needOf(rules().DAILY_GOALS);
    return def.need;
  }


  /* ══════════════════════════════════════════════════════
     COUNTING
     ══════════════════════════════════════════════════════ */

  /* dailyLogs is keyed by date and each value is a bag of push rows,
     so every day has to be totalled before anything can be counted.
     Done once, here, through the shared reader. */
  function rowsFrom(logs, since) {
    if (!logs) return [];
    const F = rules();

    return Object.keys(logs)
      .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date))
      .filter(date => !since || date >= since)
      .sort()
      .map(date => {
        const day = logs[date];
        const totals = F.totalsFor(day);
        /* A node holding only the wageProcessed flag is not a day she
           logged — the same rule the statistics page uses. */
        const tracked = !!day && Object.keys(day).some(
          k => k !== "wageProcessed" && day[k] && day[k].foodName);
        return Object.assign({ date: date, tracked: tracked }, totals);
      });
  }

  /* The best any rolling `days`-day window has totalled. Rolling, not
     calendar: a good week should not depend on which day the week is
     deemed to start. */
  function bestWindow(rows, days, measure) {
    if (!rows.length) return 0;
    const byDate = new Map(rows.map(r => [r.date, Number(r[measure]) || 0]));

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

  /* Consecutive days passing the test, anchored to the newest day with
     any entry — today is still in progress for most of the day, and
     anchoring on it would break every streak at midnight. */
  function streakRun(rows, test) {
    if (!rows.length) return 0;
    const g = rules().DAILY_GOALS;
    const byDate = new Map(rows.map(r => [r.date, r]));

    const today = phToday();
    let cursor = byDate.has(today) ? today : shiftKey(today, -1);
    if (!byDate.has(cursor)) return 0;

    let n = 0;
    while (byDate.has(cursor)) {
      if (test(byDate.get(cursor), g) !== true) break;
      n++;
      cursor = shiftKey(cursor, -1);
    }
    return n;
  }

  /* Consecutive recent days with nothing logged. Today is excluded: it
     is still in progress, and a day judged at 9am has logged nothing
     by definition.

     Bounded by the earliest row in the record, for the same reason the
     hydration one is — without it the count runs back through all of
     history and fines her for every day before the tracker existed. */
  function missedRun(rows) {
    if (!rows.length) return 0;
    const byDate = new Map(rows.map(r => [r.date, r]));
    const earliest = rows[0].date;

    let n = 0;
    let cursor = shiftKey(phToday(), -1);
    for (let i = 0; i < 400 && cursor >= earliest; i++) {
      const entry = byDate.get(cursor);
      if (entry && entry.tracked) break;
      n++;
      cursor = shiftKey(cursor, -1);
    }
    return n;
  }

  /* The WORST any rolling `days`-day window scores on a test you want
     few of — the mirror of bestWindow. Rolling for the same reason:
     three heavy days shouldn't escape notice by falling either side of
     a Sunday.

     Only days actually in the record are examined; an unlogged day
     cannot be over the sugar limit, and counting it as one would fine
     her for a gap that "Off the Record" already covers. */
  function worstWindowCount(rows, days, test) {
    if (!rows.length) return 0;
    const g = rules().DAILY_GOALS;
    const byDate = new Map(rows.map(r => [r.date, r]));

    let worst = 0;
    rows.forEach(r => {
      let hits = 0;
      let cursor = r.date;
      for (let i = 0; i < days; i++) {
        const entry = byDate.get(cursor);
        if (entry && test(entry, g) === true) hits++;
        cursor = shiftKey(cursor, -1);
      }
      if (hits > worst) worst = hits;
    });
    return worst;
  }

  function progressOf(rows, def) {
    if (def.mode === "window") return bestWindow(rows, def.days, def.measure);
    if (def.mode === "count")  return worstWindowCount(rows, def.days, def.test);
    if (def.mode === "missed") return missedRun(rows);
    return streakRun(rows, def.test);
  }

  function evaluate(logs, since) {
    const rows = rowsFrom(logs, since);
    return ALL.map(def => {
      const progress = progressOf(rows, def);
      const need = needOf(def);
      return {
        id: def.id, name: def.name, term: def.term,
        xp: def.xp, penalty: def.xp < 0, once: def.once,
        need: need, progress: progress, met: progress >= need
      };
    });
  }

  function byId(id) { return ALL.find(d => d.id === id) || null; }


  /* ══════════════════════════════════════════════════════
     SETTLING UP
     ══════════════════════════════════════════════════════
     Identical contract to the other two protocols' settle(). */

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
      db.ref("dailyLogs").once("value"),
      db.ref(STATE_PATH).once("value"),
      db.ref(META_PATH).once("value")
    ]).then(([logSnap, stateSnap, metaSnap]) => {
      const meta  = metaSnap.val() || {};
      const today = phToday();

      /* ── FIRST RUN IS ALWAYS A SILENT BASELINE ──────────────────
         With no Day 1 recorded, this has never run — so it records
         today and settles nothing.

         A correctness rule, not an optimisation. Without it the first
         settle judges an archive logged long before these rules
         existed: months of unlogged days read as one enormous
         "Off the Record" run and fine her the moment she next opens
         FoodHub. The hydration protocol learned this the hard way. */
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
        const met      = progress >= needOf(def);
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

  /* startFrom() with the money given back. Same two modes as the
     hydration protocol: reverse (append a correcting row, the default)
     or purge (delete the original outright, for rows that should never
     have existed). Purge only ever touches rows this protocol wrote. */
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
        db.ref("prestige_system/balance").transaction(c => (c || 0) - amount);
        undone.push({ id: r.id, name: r.name || r.id, amount: -amount });

        if (!opts.purge) {
          work.push(db.ref("prestige_system/transactions").push(
            prestige.reversal(amount, "Food Protocol reset — " +
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


  window.LIFEHUB_FOOD_PROTOCOL = {
    PHASES, AWARDS, PENALTIES, ALL,
    STATE_PATH, META_PATH, SOURCE,
    weekly, needOf, phaseAt, targetAt, pace,
    rowsFrom, bestWindow, worstWindowCount, streakRun, missedRun, progressOf,
    evaluate, byId, settle, startFrom, resetTo
  };

})();
