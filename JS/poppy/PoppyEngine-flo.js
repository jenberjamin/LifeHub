/* LifeHub — Poppy's write layer for the Althea pill.
   ────────────────────────────────────────────────────────────────
   One action: record today's tablet, and pay for it exactly as the
   tracker's own buttons would.

   The reads live in LifeHub-poppy-firebase-fetch.js under
   "flo/pill" and "flo/cycle". The RULES — what a tablet is worth,
   how the streak is counted, which milestones pay — live in
   JS/lifehub-pill-rules.js and are not restated here.

   Load AFTER JS/lifehub-pill-rules.js, JS/lifehub-prestige-ledger.js
   and the other PoppyEngine-*.js wrappers.

   ── WHY THIS WRITES DIRECTLY ─────────────────────────────────────
   Alexa logs a tablet by posting to the alexa_updates mailbox, which
   only becomes a real entry when the FLO page happens to be open —
   the same gap that swallowed Jen's water logs before the intake
   queue. Poppy runs on the wallpaper, which is always open, so she
   writes flo_tracker directly and settles the ledger herself.

   That is only safe because the wage table is now shared. If it ever
   drifts back into two copies, this file starts paying different
   money for the same tablet.

   ── WHAT THIS DELIBERATELY DOES NOT DO ───────────────────────────
   Flow, symptoms, mood, basal temperature, discharge and notes are
   NOT here. Jen is building those out separately; Alexa's protocol
   already covers them, and half-implementing the same thing in a
   second place is how the two start disagreeing.

   Nothing here is ever backdated either. Every action writes today.
   A past date changes cycle lengths that other numbers are computed
   from, and that is worth seeing on a screen while you do it.
*/

(function () {

  const prior = window.LIFEHUB_ACTIONS;
  if (!prior || typeof prior.describe !== "function") {
    console.error("[Poppy flo] LIFEHUB_ACTIONS missing — load this after the other PoppyEngine wrappers.");
    return;
  }

  const SOURCE = "POPPY";
  const NODE = "flo_tracker";

  /* Manila, like every other date key in LifeHub. */
  const PH_DATE = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit"
  });
  const today = () => PH_DATE.format(new Date());

  function nowHHMM() {
    const s = new Date().toLocaleString("en-US", {
      timeZone: "Asia/Manila", hour12: false,
      hour: "2-digit", minute: "2-digit"
    });
    const [h, m] = s.split(":").map(n => parseInt(n, 10));
    return String(h % 24).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  }

  function rules() {
    if (!window.LIFEHUB_PILL) {
      throw new Error("JS/lifehub-pill-rules.js isn't loaded on this page.");
    }
    return window.LIFEHUB_PILL;
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
  const points = n => Math.round(Number(n) || 0).toLocaleString();

  function parseStatus(said) {
    const s = String(said == null ? "" : said).trim().toLowerCase();
    if (rules().WAGES.hasOwnProperty(s)) return s;
    throw new Error('status must be one of: ontime, late, nostock, missed.');
  }

  /* Posting to the ledger: balance and row together, balance as a
     transaction so two writers can't lose one of them. Same shape as
     PoppyEngine-prestige.js — deliberately, so there is one way
     prestige moves. */
  function post(delta, description) {
    const d = db();
    d.ref("prestige_system/balance").transaction(c => (c || 0) + delta);
    return d.ref("prestige_system/transactions")
            .push(prestige().row(delta, description, SOURCE, stamp()));
  }

  /* The streak has to be counted over the real records, so this pulls
     back enough days to walk. 40 covers a full pack plus its break
     with room to spare; a streak longer than that is already past
     every milestone. */
  async function recentDays(key) {
    const snap = await db().ref(NODE).orderByKey()
                           .endAt(key).limitToLast(40).once("value");
    return snap.val() || {};
  }

  async function logPill(cmd) {
    const R = rules();
    const status = parseStatus(cmd.status);
    const key = today();

    const existing = (await db().ref(NODE + "/" + key).once("value")).val() || {};

    /* Already answered. Say so rather than silently overwriting — if
       she means to change it, the tracker is the place, and the
       difference-based settle below would otherwise quietly move the
       ledger on a sentence she may not have meant as a correction. */
    if (existing.pill && existing.pill === status) {
      return "Today's tablet is already down as " + R.describe(status) +
             (existing.pillTime ? " at " + existing.pillTime : "") + ".";
    }
    if (existing.pill) {
      throw new Error("Today is already logged as " + R.describe(existing.pill) +
                      ". Changing it moves prestige, so do that in the FLO " +
                      "tracker where you can see what it costs.");
    }

    /* Pay the difference from whatever this day already paid. On a
       fresh day that is the whole wage; the arithmetic is shared with
       the tracker so a later correction there behaves correctly. */
    const { target, delta } = R.settle(status, existing.altheaPaidAmount);

    const update = { pill: status, altheaPaidAmount: target };
    if (R.isTaken(status)) update.pillTime = nowHHMM();

    await db().ref(NODE + "/" + key).update(update);

    if (delta !== 0) {
      await post(delta, "Althea: " + status.toUpperCase());
    }

    /* The streak, recomputed over the records now that today is in
       them — never incremented, so this can't inflate anything. */
    const days = await recentDays(key);
    days[key] = Object.assign({}, days[key], update);

    const streak = R.streak(days, (offset) => shiftKey(key, -offset));

    let extra = "";
    const hit = R.milestoneFor(streak, existing.streakMilestonePaid);
    if (hit) {
      await post(hit.amount, "Althea Streak: " + hit.days + " Days 🛡️");
      const paid = Object.assign({}, existing.streakMilestonePaid);
      paid[hit.days] = true;
      await db().ref(NODE + "/" + key).update({ streakMilestonePaid: paid });
      extra = " That's a " + hit.days + "-day streak — " +
              points(hit.amount) + " prestige on top.";
    }

    await db().ref(NODE + "/altheaStreak").set(streak);

    const money = delta === 0 ? "no change to prestige"
                : (delta > 0 ? "+" : "") + points(delta) + " prestige";

    return "Logged today's tablet as " + R.describe(status) +
           (update.pillTime ? " at " + update.pillTime : "") +
           " (" + money + "). Streak: " + streak +
           " day" + (streak === 1 ? "" : "s") + "." + extra;
  }

  /* ── THE PERIOD ───────────────────────────────────────────────────
     Two fields carry a period, and only one of them is the record:

       isPeriodActive   the live switch. True while it is running.
       <date>.isMenstrual   the day stamps. THIS is what every cycle
                        statistic is computed from — see periodStarts()
                        in flo-cycle-analysis.js.

     The tracker stamps each day as it is opened. Poppy cannot rely on
     that: the FLO page might not be opened for the whole period, and a
     five-day bleed with one stamp on it reads as a one-day period and
     quietly corrupts the cycle lengths behind it. So she stamps the
     span herself, on the way in and again on the way out.
     ──────────────────────────────────────────────────────────────── */

  /* Whole days between two YYYY-MM-DD keys. Counting on the date parts
     only — parsing them into local Dates is what lets a timezone move
     the answer by one. */
  function daysBetween(fromKey, toKey) {
    const p = (k) => {
      const [y, m, d] = String(k).split("-").map(Number);
      return Date.UTC(y, m - 1, d);
    };
    return Math.round((p(toKey) - p(fromKey)) / 86400000);
  }

  /* Stamp every day from `fromKey` to `toKey` inclusive as menstrual.
     onPack is stamped alongside so cycle-length statistics can leave
     withdrawal bleeds out: a bleed on the pack's 28-day schedule is
     the medication's regularity, not hers, and counting it would
     overwrite a real irregular history with a tidy fake one. */
  async function stampMenstrual(fromKey, toKey, onPack) {
    const span = Math.max(0, daysBetween(fromKey, toKey));
    if (span > 14) {
      throw new Error("That would stamp " + (span + 1) + " days as a period. " +
                      "Something is off — do this one in the FLO tracker.");
    }

    const patch = {};
    for (let i = 0; i <= span; i++) {
      const k = shiftKey(fromKey, i);
      patch[k + "/isMenstrual"] = true;
      if (onPack) patch[k + "/onPack"] = true;
    }
    await db().ref(NODE).update(patch);
    return span + 1;
  }

  /* Is a pack running today? Read from the pack itself rather than the
     published cheat sheet, which may be days old. */
  async function onPackNow(key) {
    const pack = (await db().ref(NODE + "/pillPack").once("value")).val();
    if (!pack || !pack.active || !pack.startKey) return false;
    const A = window.FloAnalysis;
    if (!A || !A.packPosition) return false;
    return !!A.packPosition(pack, key);
  }

  async function periodStart(cmd) {
    const key = today();
    const root = await db().ref(NODE).once("value");
    const data = root.val() || {};

    if (data.isPeriodActive) {
      const since = data.lastPeriodDate
        ? " (started " + String(data.lastPeriodDate).slice(0, 10) + ")" : "";
      throw new Error("A period is already marked as running" + since +
                      ". If that one is over, end it first.");
    }

    const pack = await onPackNow(key);

    await db().ref(NODE).update({
      isPeriodActive: true,
      /* An ISO string, because that is what the tracker writes here
         and what its own reader expects. */
      lastPeriodDate: new Date().toISOString()
    });
    await stampMenstrual(key, key, pack);

    let note = "Logged the start of your period today.";
    if (pack) {
      note += " You're on a pack, so I've marked it as a pack bleed — " +
              "it won't be counted as one of your own cycles.";
    }
    return note;
  }

  async function periodEnd(cmd) {
    const key = today();
    const root = await db().ref(NODE).once("value");
    const data = root.val() || {};

    if (!data.isPeriodActive) {
      throw new Error("There's no period marked as running right now.");
    }

    /* Back-fill. Every day from the start to today gets stamped,
       because the tracker only stamps days it was open for and this is
       the last chance to make the span match what actually happened. */
    const startKey = data.lastPeriodDate
      ? String(data.lastPeriodDate).slice(0, 10) : key;
    const pack = await onPackNow(key);

    let stamped = 1;
    try {
      stamped = await stampMenstrual(startKey, key, pack);
    } catch (err) {
      /* A span too long to be a period. End it anyway — leaving the
         switch on is worse — but say what was not stamped. */
      await db().ref(NODE).update({ isPeriodActive: false });
      throw new Error("Ended it, but " + err.message.toLowerCase());
    }

    await db().ref(NODE).update({ isPeriodActive: false });

    return "Logged the end of your period — " + stamped + " day" +
           (stamped === 1 ? "" : "s") + " from " + startKey + ".";
  }

  /* ── THE DAILY LOG ────────────────────────────────────────────────
     Mood, flow, symptoms, discharge and activity. Five fields, one
     shape: pick from a fixed list, write it onto today, pay once.

     The vocabularies and the matching live in JS/lifehub-flo-vocab.js
     — Jen says "my boobs hurt" and the tracker stores "TENDER BREAST",
     and that translation has to happen in a tested place rather than
     inside a language model's judgement. Poppy passes her words
     through; the matcher decides; anything it cannot place comes back
     unmatched so she can ask instead of guessing.
     ──────────────────────────────────────────────────────────────── */

  function vocab() {
    if (!window.LIFEHUB_FLO_VOCAB) {
      throw new Error("JS/lifehub-flo-vocab.js isn't loaded on this page.");
    }
    return window.LIFEHUB_FLO_VOCAB;
  }

  async function logChoice(fieldName, cmd) {
    const V = vocab();
    const f = V.spec(fieldName);
    if (!f) throw new Error("I don't know a field called " + fieldName + ".");

    const said = cmd.value != null ? cmd.value : cmd.values;

    /* Flow can arrive as Alexa's 1-5 score. */
    let matched, unmatched = [];
    if (fieldName === 'flow' && said != null && String(said).trim().match(/^[1-5]$/)) {
      matched = [V.fromScale(said)];
    } else if (f.multi) {
      const r = V.matchAll(fieldName, said);
      matched = r.matched;
      unmatched = r.unmatched;
    } else {
      const hit = V.match(fieldName, said);
      matched = hit ? [hit] : [];
      if (!hit && String(said || '').trim()) unmatched = [String(said).trim()];
    }

    if (!matched.length) {
      throw new Error("I couldn't place \"" + String(said || '').trim() +
                      "\" as " + f.label.toLowerCase() + ". The options are: " +
                      f.options.join(', ') + ".");
    }

    const key = today();
    const day = (await db().ref(NODE + "/" + key).once("value")).val() || {};

    /* Multi fields accumulate across the day: she may report cramps in
       the morning and a headache at night, and the second should not
       erase the first. Single fields are a current reading and simply
       replace. */
    let stored;
    if (f.multi) {
      const before = Array.isArray(day[f.field]) ? day[f.field]
                   : (day[f.field] ? String(day[f.field]).split(', ') : []);
      const merged = before.slice();
      matched.forEach(m => { if (merged.indexOf(m) === -1) merged.push(m); });
      /* A day cannot be both symptom-free and full of symptoms. */
      stored = V.resolveExclusive(fieldName, merged);
    } else {
      stored = matched[0];
    }

    const update = {};

    /* ARRAYS for the multi fields, strings for the single ones —
       exactly what the tracker's own modals write.

       This was a comma string, and it was wrong in a way that only
       showed up somewhere else: the calendar calls symptoms.forEach,
       the daily-log panel calls medicine.join, and the Alexa merge
       calls symptoms.push. A string satisfies none of those, so one
       symptom logged through Poppy took out the whole month's
       calendar with a TypeError. The shape the readers expect is not
       negotiable, and it is an array. */
    update[f.field] = stored;

    /* Mood is asked three times a day, so it records WHICH check-in
       this was as well as what it was. `mood` stays the union of the
       three, because everything else reads that. Without this, Poppy
       and the tracker would write the same field in two shapes and
       the homescreen could not tell an answered afternoon from an
       unanswered one. */
    let slotNote = '';
    if (fieldName === 'mood') {
      const slot = V.moodSlotAt(phHour());
      if (slot) {
        const slots = Object.assign({}, day.moodSlots);
        const had = Array.isArray(slots[slot.id]) ? slots[slot.id] : [];
        const merged = had.slice();
        matched.forEach(m => { if (merged.indexOf(m) === -1) merged.push(m); });

        slots[slot.id] = merged;
        update.moodSlots = slots;
        update[f.field] = V.moodUnion(slots);     // an array, like the modal
        slotNote = ' (' + slot.label + ')';
      }
    }

    const rewards = Object.assign({}, day.rewards);
    let earned = 0;
    const notes = [];
    let firstToday = !rewards[f.reward];
    let capped = false;

    if (f.slotPaidField && update.moodSlots) {
      /* Mood pays per CHECK-IN, not per day and not per distinct
         mood — "okay" this morning and "okay" tonight are two real
         readings of the day. 250 for the first, 100 for each after.
         See settleMoodSlots(). */
      const done = V.moodSlotsDone({ moodSlots: update.moodSlots });
      const settled = V.settleMoodSlots(day[f.slotPaidField], done);
      update[f.slotPaidField] = settled.paidFor;

      if (settled.amount > 0) {
        await post(settled.amount,
                   "Mood Log (" + settled.charged.join(', ') + "): " +
                   update.moodSlots[V.moodSlotAt(phHour()).id].join(', '));
        earned += settled.amount;

        /* The day-count streak counts DAYS logged, so it advances on
           the day's first check-in only. */
        if (settled.paidFor.length === settled.charged.length) {
          rewards[f.reward] = true;
          update.rewards = rewards;

          const c = V.COUNTERS.mood;
          const current = (await db().ref(NODE + "/" + c.counter).once("value")).val();
          const count = V.nextCount(current);
          await db().ref(NODE + "/" + c.counter).set(count);

          const bonus = V.bonusFor('mood', count);
          if (bonus) {
            await post(bonus.amount, bonus.label + " 🔥");
            earned += bonus.amount;
            notes.push(bonus.label);
          }
        }
      }
      firstToday = false;

    } else if (f.paidField) {
      /* Symptoms pay per symptom, not per save — see settleSymptoms().
         Noticing cramps at breakfast and a headache after lunch is two
         acts of recording and both are worth something; saving the
         same list twice is worth nothing. */
      const settled = V.settleSymptoms(day[f.paidField], stored);
      update[f.paidField] = settled.paidFor;
      capped = settled.capped;

      if (settled.amount > 0) {
        rewards[f.reward] = true;
        update.rewards = rewards;
        await post(settled.amount,
                   "Daily Log: " + f.label + " (" + settled.charged.join(', ') + ")");
        earned += settled.amount;
      }
      /* The day-count bonus below keys off this, and for symptoms
         there is no counter anyway. */
      firstToday = false;

    } else if (firstToday) {
      rewards[f.reward] = true;
      update.rewards = rewards;
      await post(f.pays, "Daily Log: " + f.label);
      earned += f.pays;
    }

    await db().ref(NODE + "/" + key).update(update);

    /* The day-count bonus, for the three fields that have one. Only
       ever advanced on the day's FIRST log, alongside the base pay. */
    if (firstToday && V.COUNTERS[fieldName]) {
      const c = V.COUNTERS[fieldName];
      const root = (await db().ref(NODE + "/" + c.counter).once("value")).val();
      const count = V.nextCount(root);
      await db().ref(NODE + "/" + c.counter).set(count);

      const bonus = V.bonusFor(fieldName, count);
      if (bonus) {
        await post(bonus.amount, bonus.label + " 🔥");
        earned += bonus.amount;
        notes.push(bonus.label);
      }
    }

    /* The receipt. Everything Poppy needs to say it back accurately,
       including what she failed to place — that is the bit she must
       not quietly swallow. */
    let line = "Logged " + f.label.toLowerCase() + slotNote + ": " +
               (fieldName === 'mood' && update.moodSlots
                 ? update.moodSlots[V.moodSlotAt(phHour()).id].join(', ')
                 : (Array.isArray(stored) ? stored.join(', ') : stored)) + ".";
    if (earned) line += " +" + points(earned) + " prestige.";
    else if (capped) line += " That's the day's symptom cap, so no prestige for this one.";
    else if (f.slotPaidField) line += " This check-in already paid, so nothing extra.";
    else line += " Already paid for today, so no prestige this time.";
    if (notes.length) line += " " + notes.join(" ") + "!";
    if (unmatched.length) {
      line += " I couldn't place: " + unmatched.join("; ") +
              " — ask her what those should be, or leave them.";
    }
    return line;
  }

  /* ── THE OPEN FIELDS ──────────────────────────────────────────────
     Basal temperature and notes: no list to pick from, so no matcher.
     What they need instead is a number that is actually plausible, and
     text kept exactly as she said it.
     ──────────────────────────────────────────────────────────────── */

  /* Pay a field's flat rate if today has not had it, and advance the
     day-count bonus if it has one. Shared by temp and notes so the two
     cannot drift from each other or from the modals. */
  async function payDaily(f, fieldName, key, day, describe) {
    const V = vocab();
    const rewards = Object.assign({}, day.rewards);
    if (rewards[f.reward]) return { earned: 0, note: '' };

    rewards[f.reward] = true;
    await db().ref(NODE + "/" + key + "/rewards").update(rewards);
    await post(f.pays, "Daily Log: " + f.label + (describe ? " (" + describe + ")" : ""));

    let earned = f.pays, note = '';

    if (V.COUNTERS[fieldName]) {
      const c = V.COUNTERS[fieldName];
      const current = (await db().ref(NODE + "/" + c.counter).once("value")).val();
      const count = V.nextCount(current);
      await db().ref(NODE + "/" + c.counter).set(count);

      const bonus = V.bonusFor(fieldName, count);
      if (bonus) {
        await post(bonus.amount, bonus.label + " 🔥");
        earned += bonus.amount;
        note = " " + bonus.label + "!";
      }
    }
    return { earned: earned, note: note };
  }

  async function logTemp(cmd) {
    const V = vocab();
    const f = V.OPEN_FIELDS.temp;

    const A = window.FloAnalysis;
    if (!A || !A.parseTemp) {
      throw new Error("The cycle analysis module isn't loaded on this page.");
    }

    /* parseTemp is the tracker's own validator: it takes Celsius or
       Fahrenheit, converts F to C, and returns null for anything
       outside a plausible basal range. Reusing it means Poppy cannot
       accept a reading the ovulation detection would then choke on —
       and a mis-heard "thirty six" as "three six" is exactly the kind
       of number that would otherwise land in the chart. */
    const raw = cmd.value != null ? cmd.value : cmd.temp;
    const celsius = A.parseTemp(
      String(raw == null ? '' : raw) + (cmd.unit ? ' ' + cmd.unit : '')
    );

    if (celsius === null) {
      throw new Error('"' + String(raw || '').trim() + '" is not a basal ' +
                      'temperature I can use — I need something between ' +
                      '30 and 45°C, or 90 and 110°F.');
    }

    const key = today();
    const day = (await db().ref(NODE + "/" + key).once("value")).val() || {};
    const stored = f.format(celsius);

    await db().ref(NODE + "/" + key).update({ temp: stored });

    const paid = await payDaily(f, 'temp', key, day, stored);

    let line = "Logged your basal temp: " + stored + ".";
    /* If she gave it in Fahrenheit, say the conversion out loud —
       silently changing her number is how you lose her trust in it. */
    if (/f/i.test(String(cmd.unit || raw))) {
      line += " (" + String(raw).trim() + "°F)";
    }
    line += paid.earned
      ? " +" + points(paid.earned) + " prestige." + paid.note
      : " Already logged today, so no prestige this time.";
    return line;
  }

  async function logMedicine(cmd) {
    return logChoice('medicine', cmd);
  }

  async function logNotes(cmd) {
    const V = vocab();
    const f = V.OPEN_FIELDS.notes;

    const text = String(cmd.value == null ? '' : cmd.value).trim();
    if (!text) throw new Error("There's nothing to write down.");
    if (text.length > f.maxLength) {
      throw new Error("That's longer than the note field holds (" +
                      f.maxLength + " characters).");
    }

    const key = today();
    const day = (await db().ref(NODE + "/" + key).once("value")).val() || {};
    const existing = String(day.notes == null ? '' : day.notes).trim();

    /* Notes ADD to the day rather than replacing it. A note is a
       thought at a moment, and a second thought does not cancel the
       first — overwriting would silently destroy something written in
       her own words, which is the one thing on this tracker that
       cannot be reconstructed from anything else. */
    const combined = existing ? existing + "\n\n" + text : text;
    await db().ref(NODE + "/" + key).update({ notes: combined });

    const paid = await payDaily(f, 'notes', key, day, null);

    let line = existing ? "Added to today's note." : "Written down.";
    line += paid.earned
      ? " +" + points(paid.earned) + " prestige."
      : " Today's note already paid, so nothing extra.";
    return line;
  }

  /* YYYY-MM-DD shifted by whole days, without ever building a local
     Date — which is how a timezone creeps back in and moves the key. */
  function shiftKey(key, days) {
    const [y, m, d] = String(key).split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d) + days * 86400000);
    return t.getUTCFullYear() + "-" +
           String(t.getUTCMonth() + 1).padStart(2, "0") + "-" +
           String(t.getUTCDate()).padStart(2, "0");
  }


  const ACTIONS = {

    flo_log_pill: {
      spec: '{"action":"flo_log_pill","status":"ontime"} ' +
            '— records TODAY\'s Althea tablet and pays the ledger for it. ' +
            'status is exactly one of: "ontime", "late", "nostock", "missed". ' +
            'Use "nostock" only when she ran out — it costs nothing, because that is a supply ' +
            'problem rather than a lapse. Use "missed" only when she says she missed it: it is a ' +
            '2,500 prestige fine and not a guess to make on her behalf. ' +
            'If she just says she took it and does not say when, that is "ontime". ' +
            'Refused if today is already logged — changing a logged day moves prestige, ' +
            'and that belongs in the FLO tracker where she can see the cost. ' +
            'Read "flo/pill" first: it tells you whether today is already down, ' +
            'and whether a tablet is even due (there is none during the break week).',
      run: (cmd) => logPill(cmd)
    },

    flo_period_start: {
      spec: '{"action":"flo_period_start"} ' +
            '— marks TODAY as the first day of her period. No other fields. ' +
            'Send it when she says her period started, it came, or she came on — today. ' +
            'Refused if one is already marked as running, so read "flo/cycle" first: ' +
            'it says whether a period is running and when it started. ' +
            'Do NOT send this for spotting she describes as light or mid-cycle, ' +
            'and do NOT send it for a past date — backdating a period start moves ' +
            'every cycle length behind it, and that belongs in the tracker.',
      run: (cmd) => periodStart(cmd)
    },

    flo_period_end: {
      spec: '{"action":"flo_period_end"} ' +
            '— marks her period as finished, today being the last day. No other fields. ' +
            'This also fills in every day from the start to today, which is what makes ' +
            'the cycle-length statistics right: the tracker only stamps days it was ' +
            'actually opened on. Refused if no period is marked as running.',
      run: (cmd) => periodEnd(cmd)
    },

    flo_log_mood: {
      spec: '{"action":"flo_log_mood","value":"anxious and tired"} ' +
            '— records her mood on today. Pass HER WORDS in value; the matcher maps them ' +
            'onto the tracker\'s list, and tells you if it cannot. Several moods are fine ' +
            'and they accumulate through the day rather than replacing each other. ' +
            'Pays 250 the first time each day, plus a bonus at 7, 15 and 30 days.',
      run: (cmd) => logChoice('mood', cmd)
    },

    flo_log_flow: {
      spec: '{"action":"flo_log_flow","value":"heavy"} ' +
            '— records how heavy her period is today. One value only: spotting, light, ' +
            'normal, heavy or very heavy. A number 1-5 also works, meaning the same as it ' +
            'does on Alexa. Pays 300 the first time each day. ' +
            'This is NOT the same as starting a period — that is flo_period_start.',
      run: (cmd) => logChoice('flow', cmd)
    },

    flo_log_symptoms: {
      spec: '{"action":"flo_log_symptoms","value":"cramps and a headache"} ' +
            '— records what she is feeling today. Pass her words; several are fine and ' +
            'they add to whatever is already down for the day. ' +
            'If she says nothing is wrong, that is worth logging too — it maps to ' +
            '"EVERYTHING IS FINE", and a day recorded as clear is evidence in a way a ' +
            'blank day is not. Pays 300 the first time each day.',
      run: (cmd) => logChoice('symptoms', cmd)
    },

    flo_log_discharge: {
      spec: '{"action":"flo_log_discharge","value":"clear and stretchy"} ' +
            '— records discharge on today. One value only. Pays 200 the first time each ' +
            'day, plus a bonus at 7, 15 and 30 days. ' +
            'Log what she describes and say it back plainly. This is ordinary bodily ' +
            'observation and the tracker treats it as data, so do not be squeamish, ' +
            'do not editorialise, and do not tell her what it might mean.',
      run: (cmd) => logChoice('discharge', cmd)
    },

    flo_log_activity: {
      spec: '{"action":"flo_log_activity","value":"protected sex"} ' +
            '— records her sex drive or sexual activity on today. One value only: ' +
            'low drive, neutral drive, high drive, protected sex, unprotected sex, ' +
            'self-loving, or prefer not to say. Pays 200 the first time each day, ' +
            'plus a bonus at 7, 15 and 30 days. ' +
            'Record it and move on. No comment, no follow-up question, no advice, and ' +
            'never raise it yourself. If she is at all hesitant, "prefer not to say" is ' +
            'a real option and logging that is better than pressing her.',
      run: (cmd) => logChoice('activity', cmd)
    },

    flo_log_temp: {
      spec: '{"action":"flo_log_temp","value":"36.4","unit":"C"} ' +
            '— records her basal body temperature for today. ' +
            'Pass the number she said and the unit if she gave one; C is assumed. ' +
            'Fahrenheit is converted and the conversion is said back to her. ' +
            'Anything outside 30-45°C or 90-110°F is refused rather than stored, ' +
            'because a mis-heard reading would corrupt the ovulation detection ' +
            'that reads this field. Pays 200 the first time each day, plus a bonus ' +
            'at 7, 15 and 30 days.',
      run: (cmd) => logTemp(cmd)
    },

    flo_log_medicine: {
      spec: '{"action":"flo_log_medicine","value":"biogesic and my vitamins"} ' +
            '— records medicine taken today. Several are fine and they add to ' +
            'whatever is already down. Unlike every other field, a name it does NOT ' +
            'recognise is kept as she said it rather than refused — a drug missing ' +
            'from the record is worse than one spelled her way. ' +
            'Do NOT log Althea here: the pill has its own field and its own money, ' +
            'and logging it as medicine records the tablet twice. ' +
            'Pays 300 the first time each day.',
      run: (cmd) => logMedicine(cmd)
    },

    flo_log_notes: {
      spec: '{"action":"flo_log_notes","value":"Cramps started around noon. Took paracetamol."} ' +
            '— writes a note onto today. Pass HER WORDS, as close to verbatim as you can. ' +
            'A second note the same day is APPENDED, never overwritten. ' +
            'Pays 500 the first time each day — the best-paid field on the tracker, ' +
            'because it is the only one in her own words. ' +
            'Later notes still record; they just do not pay again.',
      run: (cmd) => logNotes(cmd)
    }

  };


  window.LIFEHUB_ACTIONS = {

    describe() {
      const own = Object.keys(ACTIONS).map(k => "  " + ACTIONS[k].spec);
      return prior.describe() + "\n\n" + [
        "You can also log her contraceptive pill. Same fenced block:",
        ""
      ].concat(own).concat([
        "",
        "Two things about this one that are not like the other trackers:",
        "",
        "  · It is medication, so never infer a status she did not give you.",
        "    \"I think I took it\" is not a log — ask.",
        "  · During the pack's 7-day break there is no tablet due at all.",
        "    \"flo/pill\" says whether today is a break day; if it is, and she",
        "    says she took one, something is wrong and it is worth saying so",
        "    rather than writing it down.",
        "",
        "You can also mark a period started or ended. Two things about those:",
        "",
        "  · Only ever TODAY. Backdating a start moves every cycle length",
        "    behind it, so a past date belongs in the tracker.",
        "  · Ending one fills in the days between, which is what makes her",
        "    cycle statistics right. So do encourage her to tell you when it",
        "    ends — that is the half people forget, and without it a five-day",
        "    period can go on record as a one-day one.",
        "",
        "The rest of the daily log is yours too: mood, flow, symptoms, discharge,",
        "activity, basal temperature, medicine and notes. Three of those need",
        "care beyond the ordinary:",
        "",
        "  · ACTIVITY is recorded and never mentioned again. No comment, no",
        "    follow-up, and never raised by you.",
        "  · TEMPERATURE feeds the ovulation detection, so a wrong number is not",
        "    just a wrong number. Anything implausible is refused rather than",
        "    stored — pass what she said and let it be refused.",
        "  · NOTES are appended, never overwritten. They are the only thing here",
        "    in her own words and the only thing that cannot be reconstructed.",
        "",
        "None of these is a place to interpret anything. You record what she",
        "tells you and you say it back. What it means is her OB's question."
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

})();
