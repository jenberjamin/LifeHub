/* LifeHub — Poppy's write layer for the Hydration tracker.
   ────────────────────────────────────────────────────────────────
   The reads live in LifeHub-poppy-firebase-fetch.js under
   "hydration/today" and "hydration/history". The goal, the rates and
   the unit maths live in JS/lifehub-hydration-rules.js.

   Load AFTER JS/lifehub-hydration-rules.js, JS/lifehub-prestige-ledger.js
   and the other PoppyEngine-*.js wrappers.

   ── WHY THIS WRITES THE DATABASE DIRECTLY ────────────────────────
   Same reason as sleep, and one more.

   Alexa's water only lands if the tracker page happens to be open:
   startAlexaListener() in tracker-hydration.js is what turns an
   add_water command into a glass, and a page that is shut cannot
   listen. A glass spoken to the Echo with the laptop closed is
   silently lost once the six-hour window passes. Poppy writing the
   node herself has no such hole.

   ── WHY IT IS A TRANSACTION AND SLEEP WAS NOT ────────────────────
   A sleep log is one sealed document written once. A hydration day is
   a RUNNING TOTAL that several things add to — the page's buttons,
   Alexa, and now Poppy — and every one of them does read, add, write.

   Two of those overlapping is a lost glass: both read 40oz, both
   write 48, and 8oz vanishes with nothing to show it ever happened.
   So the day node is updated inside a Firebase transaction, which
   re-runs the whole calculation if the value changed underneath it.
   That makes Poppy's write safer than the page's own, which still
   does the naive version.

   ── WHAT IT MIRRORS ──────────────────────────────────────────────
   addWater(), checkRewards(), checkStreaks() and undoLast() in
   tracker-hydration.js. Same rates, same bonus flags, same one
   consolidated receipt per day. A glass logged by Poppy has to be
   indistinguishable from a glass logged by tapping the button.
*/

(function () {

  const prior = window.LIFEHUB_ACTIONS;
  if (!prior || typeof prior.describe !== "function") {
    console.error("[Poppy hydration] LIFEHUB_ACTIONS missing — load this after the other PoppyEngine wrappers.");
    return;
  }

  const SOURCE = "HYDRATION TRACKER";

  function H() {
    if (!window.LIFEHUB_HYDRATION) {
      throw new Error("JS/lifehub-hydration-rules.js isn't loaded on this page.");
    }
    return window.LIFEHUB_HYDRATION;
  }

  function prestige() {
    if (!window.LIFEHUB_PRESTIGE) {
      throw new Error("JS/lifehub-prestige-ledger.js isn't loaded on this page.");
    }
    return window.LIFEHUB_PRESTIGE;
  }

  function db() {
    if (!window.POPPY_FETCH || typeof window.POPPY_FETCH.rtdb !== "function") {
      throw new Error("Poppy's Firebase layer isn't loaded.");
    }
    return window.POPPY_FETCH.rtdb("lifehub");
  }

  const stamp = () => firebase.database.ServerValue.TIMESTAMP;


  /* ── Manila time ──────────────────────────────────────────────── */

  const PH_TZ = "Asia/Manila";

  const PH_DATE = new Intl.DateTimeFormat("en-CA", {
    timeZone: PH_TZ, year: "numeric", month: "2-digit", day: "2-digit"
  });
  const phToday = () => PH_DATE.format(new Date());

  const phHour = () => parseInt(new Date().toLocaleString("en-US", {
    timeZone: PH_TZ, hour12: false, hour: "2-digit"
  }), 10) % 24;

  /* The tracker stamps each entry with this exact format — a 12-hour
     clock from toLocaleTimeString('en-US'). Matched so a row Poppy
     writes reads the same in the history list as one from a button. */
  const phClock = () => new Date().toLocaleTimeString("en-US", {
    timeZone: PH_TZ, hour: "2-digit", minute: "2-digit"
  });

  function parseDate(said) {
    if (said == null || String(said).trim() === "") return phToday();

    const raw = String(said).trim().toLowerCase();
    if (raw === "today")     return phToday();
    if (raw === "yesterday") return H().shiftKey(phToday(), -1);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      throw new Error("I need the date as YYYY-MM-DD — I got “" + said + "”.");
    }
    if (raw > phToday()) throw new Error(raw + " hasn't happened yet.");
    return raw;
  }


  /* ══════════════════════════════════════════════════════
     The receipt
     ══════════════════════════════════════════════════════
     ONE ledger row per day, updated in place as the day fills up —
     the tracker's "consolidated receipt". The day node remembers its
     id in `ledgerId`.

     Because the row is amended rather than added to, an undo needs no
     correction entry: the day's single row simply says a smaller
     number afterwards, and lifetime prestige replays to the right
     total on its own. */

  function receiptDescription(total, bonuses) {
    let desc = (Math.round(total * 10) / 10) + " oz";
    if (bonuses.completion) desc += " + Completion";
    if (bonuses.streak7)    desc += " + 7 Day Streak";
    if (bonuses.streak30)   desc += " + 30 Day Streak";
    return desc;
  }

  /* Writes the day's row, creating it if this is the first water of
     the day. `mine` is the key claimed inside the transaction — if the
     committed node kept it, we are the ones who created the row. */
  function writeReceipt(day, mine) {
    const desc = receiptDescription(day.total, day.bonuses || {});
    const ref = db().ref("prestige_system/transactions/" + day.ledgerId);

    if (day.ledgerId === mine) {
      return ref.set(prestige().row(day.totalWage, desc, SOURCE, stamp()));
    }
    /* An update, not a set: the row already exists and only these
       three fields move. The timestamp is bumped so the day's line
       stays near the top of Recent Activity as it grows — the
       tracker does the same. */
    return ref.update({
      amount:      day.totalWage,
      description: desc,
      timestamp:   stamp()
    });
  }

  function bank(delta) {
    if (!delta) return Promise.resolve();
    return db().ref("prestige_system/balance")
      .transaction(c => (c || 0) + delta);
  }

  /* A day node as the tracker would have created it. */
  function blankDay() {
    return {
      total: 0, totalWage: 0, ledgerId: null, logs: [],
      workoutMode: false, rewardClaimed: false, droughtPenaltyApplied: false,
      bonuses: { completion: false, streak7: false, streak30: false }
    };
  }

  function normalise(d) {
    const day = Object.assign(blankDay(), d || {});
    day.logs = Array.isArray(day.logs) ? day.logs.slice() : [];
    day.bonuses = Object.assign({ completion: false, streak7: false, streak30: false },
                                day.bonuses || {});
    day.total = Number(day.total) || 0;
    day.totalWage = Number(day.totalWage) || 0;
    return day;
  }


  /* ══════════════════════════════════════════════════════
     Logging water
     ══════════════════════════════════════════════════════ */

  async function logWater(cmd) {
    const h = H();
    const date = parseDate(cmd.date);
    const oz = h.toOunces(cmd.amount, cmd.unit);

    /* What it was. Refuses a drink it doesn't recognise rather than
       assuming water — assuming would pay full prestige for a beer. */
    const drink = h.drinkFor(cmd.drink);

    /* Volume as drunk, and volume that counts. They differ only for
       alcohol today, but the day node stores both so the history can
       say "you drank 12 oz of beer" while the goal only ever moved by
       the part that hydrated her. */
    const effective = h.effectiveOz(oz, drink);

    /* The morning multiplier is for water drunk THIS morning.
       Backfilling yesterday at 6am must not pay it — the tracker
       guards the same way, on activeDate === phToday(). */
    const hour = phHour();
    const firstSip = date === phToday() && h.isFirstSipHour(hour);
    const wage = h.wageFor(oz, firstSip, drink);
    const time = phClock();

    /* The key is claimed before the transaction so that creating the
       day's receipt is decided atomically with the water going in.
       Generating one costs nothing and never touches the network. */
    const claim = db().ref("prestige_system/transactions").push().key;

    const ref = db().ref("hydration_logs/" + date);

    const result = await ref.transaction(current => {
      const day = normalise(current);

      /* `total` is what the goal is measured against, so it takes the
         EFFECTIVE ounces. `volume` carries the raw amount alongside it
         for the history. Every reader that already existed compares
         total to the goal and keeps working untouched. */
      day.total += effective;
      day.volume = (Number(day.volume) || day.total - effective) + oz;
      day.totalWage += wage;

      day.logs.push({
        amount:    oz,             // as drunk
        effective: effective,      // as counted
        drink:     drink.key,
        time:      time,
        type:      firstSip ? "First Sip" : "Standard",
        wage:      wage
      });
      if (!day.ledgerId) day.ledgerId = claim;

      return day;
    });

    if (!result.committed) {
      throw new Error("Something else was writing to today's water at the same moment — try that again.");
    }

    let day = result.snapshot.val();
    let paid = wage;
    const earned = [];

    /* ── The completion bonus ──────────────────────────────────────
       Checked after the water is safely in rather than as part of the
       same transaction, because deciding it needs the streak, and the
       streak needs a read of every other day — which a transaction
       handler may not do. The flag on the day node is what stops it
       being paid twice, and it is set inside a second transaction. */
    const goal = h.goalFor(day.workoutMode);

    if (!day.bonuses.completion && day.total >= goal) {
      const others = (await db().ref("hydration_logs").once("value")).val() || {};
      const streak = h.computeStreak(others, date, true);
      const streakBonus = h.streakBonusFor(streak, day.bonuses);

      const bonusTotal = h.RATES.COMPLETION + streakBonus.amount;

      const bonusResult = await ref.transaction(current => {
        const d = normalise(current);
        /* Re-checked inside the transaction: between the read above
           and this write, the page or another device may have crossed
           the goal and claimed the bonus already. */
        if (d.bonuses.completion) return;             // abort, someone beat us
        d.bonuses.completion = true;
        d.rewardClaimed = true;
        d.totalWage += h.RATES.COMPLETION;

        streakBonus.parts.forEach(p => {
          d.bonuses[p] = true;
          d.totalWage += (p === "streak7" ? h.RATES.STREAK_7 : h.RATES.STREAK_30);
        });
        return d;
      });

      if (bonusResult.committed && bonusResult.snapshot.val()) {
        day = bonusResult.snapshot.val();
        paid += bonusTotal;
        earned.push("goal met (+" + h.RATES.COMPLETION.toLocaleString() + ")");
        if (streakBonus.parts.indexOf("streak7") !== -1) {
          earned.push(streak + "-day streak (+" + h.RATES.STREAK_7.toLocaleString() + ")");
        }
        if (streakBonus.parts.indexOf("streak30") !== -1) {
          earned.push(streak + "-day streak (+" + h.RATES.STREAK_30.toLocaleString() + ")");
        }
      }
    }

    await writeReceipt(day, claim);
    await bank(paid);

    /* A late coffee or any evening drink lands on tonight's sleep log
       as a factor. Best-effort: the water is already banked, and a
       failed tag must not turn a logged glass into an error. */
    const tagged = await tagSleepFactor(h, drink, date, hour);

    const left = Math.max(0, h.goalFor(day.workoutMode) - day.total);
    const said = (Math.round(oz * 10) / 10) + " oz of " + drink.label.toLowerCase();

    /* Only mentioned when the two numbers differ — saying "12 oz, 4 of
       which counted" about a glass of water would be noise. */
    const discounted = effective !== oz
      ? " (" + effective + " oz of it counts toward the goal)"
      : "";

    return "Logged " + said + discounted +
           (firstSip ? " — first-sip, 2.5x" : "") +
           " — " + (Math.round(day.total * 10) / 10) + " of " +
           h.goalFor(day.workoutMode) + " oz" +
           (left > 0 ? ", " + h.glassPhrase(left) + " to go" : ", goal met") +
           ", +" + Math.round(paid).toLocaleString() + " prestige" +
           (drink.pays < 1 && drink.pays > 0 ? " (" + drink.label.toLowerCase() +
              " pays " + Math.round(drink.pays * 100) + "% of water's rate)" : "") +
           (drink.pays === 0 ? " (" + drink.label.toLowerCase() + " earns nothing)" : "") +
           (earned.length ? " (" + earned.join(", ") + ")" : "") +
           (tagged ? " — tagged " + tagged + " on tonight's sleep log" : "") +
           /* Fluid is only half of what a glass of milk is. Without
              this the calories never reach FoodHub — which is exactly
              what happened on the first real morning: the milk went in
              here and only the burger beside it showed up as food. */
           (drink.caloric
             ? " — NOTE: " + drink.label.toLowerCase() + " has calories, so it " +
               "belongs in FoodHub too; send a food_log for it as well"
             : "");
  }


  /* ══════════════════════════════════════════════════════
     The sleep cross-link
     ══════════════════════════════════════════════════════
     Caffeine and Alcohol are factor chips on the sleep tracker that
     Jen ticks by hand the morning after. She shouldn't have to
     remember at 7am what she drank at 11pm.

     The sleep log doesn't exist yet — it is written when she wakes —
     so the factor is parked under the date she will wake on, and
     saveSleepLog()/logNight() merge whatever is waiting there. */

  const PENDING_PATH = "sleep_pending_factors/";

  async function tagSleepFactor(h, drink, dateKey, hour) {
    const factor = h.sleepFactorFor(drink, hour);
    if (!factor) return null;

    /* Only for drinks happening now. Backfilling last Tuesday's beer
       must not put Alcohol on tonight's sleep. */
    if (dateKey !== phToday()) return null;

    const night = h.sleepNightFor(dateKey, hour);

    try {
      /* Stamped, so a tag for a night that never gets logged expires
         instead of waiting to attach itself to some future morning.
         One stamp per node, refreshed by the newest drink — the whole
         node is about one night either way. */
      const patch = {};
      patch[factor] = true;
      patch.at = Date.now();
      await db().ref(PENDING_PATH + night).update(patch);
      return factor;
    } catch (err) {
      console.warn("[Poppy hydration] couldn't tag " + factor + ":", err.message);
      return null;
    }
  }


  /* ══════════════════════════════════════════════════════
     Undoing the last one
     ══════════════════════════════════════════════════════
     Mirrors undoLast(): dropping back under the goal releases every
     bonus that being met had paid for — completion AND the 7- and
     30-day streak milestones — so crossing the goal again pays once
     rather than twice.

     That matters most for exactly the case this action exists for. A
     glass Alexa or Poppy misheard could otherwise be worth twenty-five
     thousand points: cross the goal on day thirty, bank the bonus, undo
     the phantom glass, keep the bonus. Undo has to be able to put the
     day back exactly as it was. */

  async function undoWater(cmd) {
    const h = H();
    const date = parseDate(cmd.date);
    const ref = db().ref("hydration_logs/" + date);

    let removed = null;
    let refund = 0;
    let released = [];

    const result = await ref.transaction(current => {
      if (!current) return;                       // nothing there at all
      const day = normalise(current);
      if (!day.logs.length) return;               // nothing to undo

      const last = day.logs.pop();
      const wage = Number(last.wage) || 0;

      /* What comes off the goal is what went ON to it — the effective
         ounces, not the volume drunk. Entries written before drink
         types existed carry no `effective`, and for those the two are
         the same number. */
      const back = Number(last.effective != null ? last.effective : last.amount) || 0;

      day.total = Math.max(0, day.total - back);
      day.volume = Math.max(0, (Number(day.volume) || 0) - (Number(last.amount) || 0));
      day.totalWage -= wage;

      /* Reset every time: a transaction handler can be re-run when the
         value changes underneath it, and these would otherwise
         accumulate across attempts. */
      removed = last;
      refund = wage;
      released = [];

      /* Under the goal means the day is not met, and everything being
         met paid for goes back — completion and both streak milestones.
         Leaving the streak bonuses behind was the hole: a phantom glass
         on day thirty was worth 25,000 points that undo couldn't
         reclaim. */
      if (day.total < h.goalFor(day.workoutMode)) {
        if (day.bonuses.completion) {
          day.bonuses.completion = false;
          day.rewardClaimed = false;
          day.totalWage -= h.RATES.COMPLETION;
          refund += h.RATES.COMPLETION;
          released.push("the completion bonus");
        }
        if (day.bonuses.streak7) {
          day.bonuses.streak7 = false;
          day.totalWage -= h.RATES.STREAK_7;
          refund += h.RATES.STREAK_7;
          released.push("the 7-day streak bonus");
        }
        if (day.bonuses.streak30) {
          day.bonuses.streak30 = false;
          day.totalWage -= h.RATES.STREAK_30;
          refund += h.RATES.STREAK_30;
          released.push("the 30-day streak bonus");
        }
      }

      if (day.totalWage < 0) day.totalWage = 0;
      return day;
    });

    if (!result.committed || !removed) {
      const day = result.snapshot && result.snapshot.val();
      throw new Error(day
        ? "There's nothing logged on " + date + " to undo."
        : "Nothing is logged for " + date + " at all.");
    }

    const day = result.snapshot.val();
    await writeReceipt(day, null);          // the row exists; only amend it
    await bank(-refund);

    return "Removed " + (Math.round((removed.amount || 0) * 10) / 10) + " oz from " +
           removed.time + " — back to " + (Math.round(day.total * 10) / 10) + " of " +
           h.goalFor(day.workoutMode) + " oz, " +
           Math.round(refund).toLocaleString() + " prestige taken back" +
           (released.length
             ? " (that dropped you under the goal, so " + released.join(" and ") + " went with it)"
             : "");
  }


  /* ══════════════════════════════════════════════════════
     Workout day
     ══════════════════════════════════════════════════════
     Not decoration: it moves the goal by 24oz, which changes what
     "how much is left" means and whether the day counts toward the
     streak. Nothing is paid or taken here. */

  async function setWorkout(cmd) {
    const h = H();
    const date = parseDate(cmd.date);
    const on = cmd.on !== false;

    const ref = db().ref("hydration_logs/" + date);
    const result = await ref.transaction(current => {
      const day = normalise(current);
      day.workoutMode = on;
      return day;
    });

    if (!result.committed) throw new Error("Couldn't change that just now — try again.");

    const day = result.snapshot.val();
    const goal = h.goalFor(on);
    const left = Math.max(0, goal - day.total);

    return (on ? "Marked " : "Unmarked ") + date + " as a workout day — goal is now " +
           goal + " oz" +
           (left > 0 ? ", " + h.glassPhrase(left) + " to go" : ", already met");
  }


  /* ══════════════════════════════════════════════════════
     ACTIONS
     ══════════════════════════════════════════════════════ */

  const ACTIONS = {

    hydration_log: {
      spec: '{"action":"hydration_log","amount":500,"unit":"ml","drink":"coffee","date":""} ' +
            '— adds a drink to the hydration tracker and pays the prestige for it. ' +
            'amount is the number she said; unit is her unit, exactly as she said it — ' +
            'oz, ml, litres, glasses, cups or bottles. NEVER convert it yourself: send her number and her unit ' +
            'and the action does the maths. If she gives no unit at all, leave unit empty and it is read as ounces. ' +
            'A glass is 8 oz and a bottle is 20 oz. ' +
            'drink is WHAT she drank, in her own words — coffee, latte, tea, milk, orange juice, coke, beer, ' +
            'a milkshake, an energy drink. Leave it empty ONLY if she said water or said nothing about what it was. ' +
            'Send her word and the action maps it; do not translate it to a category yourself. ' +
            'Most drinks count fully toward the goal but pay less prestige than water; alcohol counts partly and pays nothing. ' +
            'date defaults to today — only send one if she is clearly talking about a past day.',
      run: (cmd) => logWater(cmd)
    },

    hydration_undo: {
      spec: '{"action":"hydration_undo","date":""} ' +
            '— removes the MOST RECENT water entry and takes its prestige back. ' +
            'It only ever removes the last one; there is no way to pick an older entry, so if she means a specific ' +
            'earlier glass, say that and do not send this. ' +
            'LIVE DATA names the entry that would go — read it back to her before sending if there is any doubt. ' +
            'If the undo drops her back under the goal, the completion bonus is released too, and the receipt says so.',
      run: (cmd) => undoWater(cmd)
    },

    hydration_workout: {
      spec: '{"action":"hydration_workout","on":true,"date":""} ' +
            '— marks today a workout day, which raises the goal from 100 oz to 124 oz. ' +
            'on:false unmarks it. Nothing is paid or taken; it only moves the target. ' +
            'Use when she says she worked out, trained, ran, or that the goal should be higher today.',
      run: (cmd) => setWorkout(cmd)
    }

  };


  window.LIFEHUB_ACTIONS = {

    describe() {
      const own = Object.keys(ACTIONS).map(k => "  " + ACTIONS[k].spec);
      return prior.describe() + "\n\n" + [
        "You can also act on the Hydration tracker. Same fenced block, these actions:",
        ""
      ].concat(own).concat([
        "",
        "Water is stored in ounces but she rarely speaks in them. Pass her number",
        "and her unit through untouched — a conversion you do in your head is a",
        "conversion nobody can check, and mistaking millilitres for ounces logs",
        "five times her daily goal in a single glass."
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
     Alexa can't run this file — Lambda has no browser — so a glass
     spoken to the Echo is parked in a queue and applied here instead,
     by LifeHub-homescreen-intake-queue.js.

     Exposed rather than reimplemented, and that is the whole point:
     the first-sip window, the goal check, the streak milestones, the
     consolidated receipt and the transaction guard are hard enough to
     get right once. A second copy inside a Lambda would be a third
     set of rates to keep in step with this file and the tracker. */
  window.LIFEHUB_INTAKE = {
    /* Takes exactly what hydration_log takes:
       { amount, unit, drink, date } → the receipt string. */
    log:      (cmd) => logWater(cmd || {}),
    undo:     (cmd) => undoWater(cmd || {}),
    workout:  (cmd) => setWorkout(cmd || {})
  };

})();
