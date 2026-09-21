/* ============================================================
   LifeHub — FLO cycle analysis

   Pure functions over the day records. No DOM, no Firebase, no
   side effects — so every claim below can be tested in isolation.

   The governing rule of this file: SAY ONLY WHAT THE DATA SHOWS.

   A 28-day calendar model tells an irregular cycle what it ought to
   be doing. These functions instead read what was actually observed
   and stay silent when there isn't enough to speak from.

   Two observations carry real information:

     MUCUS  — watery / egg-white discharge appears BEFORE ovulation.
              This is the part that looks forward.
     TEMP   — basal temperature rises AFTER ovulation and stays up.
              This is the part that confirms, always in hindsight.

   Neither depends on cycle length, which is why they work here.

   Load BEFORE tracker-flo.js.
   ============================================================ */
(function () {
  'use strict';

  /* ------------------------------------------------------------
     DATE KEYS
     ------------------------------------------------------------ */
  function keyToUTC(key) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN;
  }

  function shiftKey(key, days) {
    const t = keyToUTC(key);
    if (isNaN(t)) return null;
    const d = new Date(t + days * 86400000);
    return d.getUTCFullYear() + '-' +
           String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
           String(d.getUTCDate()).padStart(2, '0');
  }

  function daysBetweenKeys(a, b) {
    return Math.round((keyToUTC(b) - keyToUTC(a)) / 86400000);
  }

  const isDateKey = (k) => /^\d{4}-\d{2}-\d{2}$/.test(k);

  /* Every day record, oldest first. The db object also holds settings
     like isPeriodActive and altheaStreak, so keys are filtered. */
  function dayKeys(db) {
    return Object.keys(db || {}).filter(isDateKey).sort();
  }

  /* ------------------------------------------------------------
     TEMPERATURE
     ------------------------------------------------------------ */

  /* Stored as a display string — "36.5°C", sometimes with the degree
     sign mangled to "Â°C" by an encoding round-trip. Pull the number
     back out of whatever shape it arrived in. */
  function parseTemp(value) {
    if (typeof value === 'number') return isFinite(value) ? value : null;
    if (typeof value !== 'string') return null;
    const m = /(\d+(?:[.,]\d+)?)/.exec(value.replace(',', '.'));
    if (!m) return null;
    const n = parseFloat(m[1]);
    if (!isFinite(n)) return null;
    /* A plausible basal reading, in C or F. Anything else is a typo. */
    if (n >= 30 && n <= 45) return n;              // Celsius
    if (n >= 90 && n <= 110) return (n - 32) / 1.8; // Fahrenheit -> C
    return null;
  }

  /* Every recorded temperature, oldest first. */
  function tempSeries(db) {
    return dayKeys(db)
      .map(k => ({ key: k, temp: parseTemp((db[k] || {}).temp) }))
      .filter(r => r.temp !== null);
  }

  /* ── THE THREE-OVER-SIX RULE ────────────────────────────────
     The standard charting convention: a shift is recognised when
     three consecutive readings sit above the highest of the previous
     six. Ovulation is then placed at the day BEFORE the first of the
     three — always in the past, never ahead.

     Deliberate choices:

     - It works on the previous six READINGS, not the previous six
       calendar days, so an occasional missed morning doesn't erase
       the baseline.
     - `minRise` guards against a baseline being cleared by noise
       alone. 0.2 C is the usual figure.
     - It returns null far more often than not. Silence is the
       correct output when the data doesn't show a shift, and an
       anovulatory cycle is one where no shift will ever appear. */
  function detectTempShift(series, opts) {
    const o = opts || {};
    const minRise = typeof o.minRise === 'number' ? o.minRise : 0.2;
    const baselineN = 6;
    const runN = 3;

    if (!series || series.length < baselineN + runN) return null;

    for (let i = baselineN; i <= series.length - runN; i++) {
      const baseline = series.slice(i - baselineN, i);
      const coverline = Math.max.apply(null, baseline.map(r => r.temp));
      const run = series.slice(i, i + runN);

      const allAbove = run.every(r => r.temp > coverline);
      const clears = (run[runN - 1].temp - coverline) >= minRise;

      if (allAbove && clears) {
        return {
          /* First high reading. */
          shiftKey: run[0].key,
          /* Ovulation is conventionally placed the day before it. */
          estimatedOvulation: shiftKey(run[0].key, -1),
          coverline: Math.round(coverline * 100) / 100,
          confirmedOn: run[runN - 1].key,   // when three-in-a-row completed
          rise: Math.round((run[runN - 1].temp - coverline) * 100) / 100
        };
      }
    }
    return null;
  }

  /* ------------------------------------------------------------
     MUCUS — the forward-looking half
     ------------------------------------------------------------ */
  /* Substring match, so both the current labels ("CLEAR & WATERY",
     "CLEAR & STRETCHY") and the retired ones ("WATERY", "EGG WHITE")
     still register as fertile. */
  const FERTILE_MUCUS = ['EGG WHITE', 'WATERY', 'STRETCHY'];

  function isFertileMucus(value) {
    if (!value) return false;
    const v = String(value).toUpperCase();
    return FERTILE_MUCUS.some(f => v.indexOf(f) !== -1);
  }

  function fertileMucusDays(db, fromKey, toKey) {
    return dayKeys(db).filter(k => {
      if (fromKey && k < fromKey) return false;
      if (toKey && k > toKey) return false;
      return isFertileMucus((db[k] || {}).discharge);
    });
  }

  /* ------------------------------------------------------------
     PERIOD HISTORY
     ------------------------------------------------------------ */

  /* A period start is a menstrual day whose previous day was not one.
     Reconstructed from the per-day stamps, so history that predates
     any explicit record is still recoverable.

     `gapDays` stops a one-day break mid-period from registering as a
     whole new cycle. */
  /* `excludePack` leaves out bleeds that happened while a pack was
     running.

     This matters more than it looks. A withdrawal bleed is caused by
     stopping the hormones on a 28-day schedule — it is not the body
     completing a cycle. Counting those in the cycle-length statistics
     would quietly overwrite a real, irregular history with the pack's
     tidy 28, and the tracker would then report a regularity that
     belongs to the medication rather than to her. Coming off the pack
     later, the "your usual length" figure would be a fiction.

     Days stamped while a pack was active carry onPack:true — see
     updateUI() in tracker-flo.js. */
  function periodStarts(db, opts) {
    const gapDays = (opts && opts.gapDays) || 2;
    const excludePack = !!(opts && opts.excludePack);

    const menstrual = dayKeys(db).filter(k => {
      const d = db[k] || {};
      if (!d.isMenstrual) return false;
      if (excludePack && d.onPack) return false;
      return true;
    });
    const starts = [];

    menstrual.forEach(k => {
      const prev = starts.length ? starts[starts.length - 1].last : null;
      if (prev === null || daysBetweenKeys(prev, k) > gapDays) {
        starts.push({ start: k, last: k });
      } else {
        starts[starts.length - 1].last = k;
      }
    });

    return starts.map(s => s.start);
  }

  /* Cycle lengths between consecutive starts, plus the summary figures.
     Median rather than mean: one 70-day cycle shouldn't drag the whole
     estimate with it. */
  function cycleStats(starts) {
    const lengths = [];
    for (let i = 1; i < (starts || []).length; i++) {
      const n = daysBetweenKeys(starts[i - 1], starts[i]);
      /* Under 15 days apart is almost certainly one period recorded in
         two pieces, not two cycles. Over 180 is a gap in tracking. */
      if (n >= 15 && n <= 180) lengths.push(n);
    }

    if (!lengths.length) {
      return { count: 0, lengths: [], median: null, min: null, max: null, spread: null };
    }

    const sorted = lengths.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2
      ? sorted[mid]
      : Math.round((sorted[mid - 1] + sorted[mid]) / 2);

    return {
      count: lengths.length,
      lengths: lengths,
      median: median,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      spread: sorted[sorted.length - 1] - sorted[0]
    };
  }

  /* ------------------------------------------------------------
     PUTTING IT TOGETHER
     ------------------------------------------------------------ */

  /* What can honestly be said about the cycle running from `startKey`.
     Every field is either an observation or explicitly labelled an
     estimate; nothing is asserted from the calendar alone. */
  function analyseCycle(db, startKey, todayKey) {
    const from = startKey || null;
    const series = tempSeries(db).filter(r => !from || r.key >= from);

    const shift = detectTempShift(series);
    const mucus = fertileMucusDays(db, from, todayKey);

    return {
      cycleStart: from,
      /* Observed: temperature rose and stayed up. Past tense, always. */
      tempShift: shift,
      /* Observed: fertile-quality mucus was recorded on these days. */
      fertileMucusDays: mucus,
      /* Only ever set when the temperatures actually showed it. */
      ovulationConfirmed: shift ? shift.estimatedOvulation : null
    };
  }

  /* Prediction, stated as a range and never as a single date, because
     a single date would be a claim the data cannot support. Returns
     null until there are at least two recorded cycles to measure. */
  function predictNextPeriod(stats, lastStartKey, todayKey) {
    if (!stats || !stats.count || !lastStartKey) return null;

    const elapsed = daysBetweenKeys(lastStartKey, todayKey);
    return {
      basedOnCycles: stats.count,
      medianLength: stats.median,
      earliestKey: shiftKey(lastStartKey, stats.min),
      likelyKey:   shiftKey(lastStartKey, stats.median),
      latestKey:   shiftKey(lastStartKey, stats.max),
      daysToEarliest: Math.max(0, stats.min - elapsed),
      daysToLikely:   Math.max(0, stats.median - elapsed),
      daysToLatest:   Math.max(0, stats.max - elapsed),
      /* Wide spread means the median is barely worth quoting. Say so
         rather than dressing it up. */
      confident: stats.count >= 3 && stats.spread <= 9
    };
  }

  /* ------------------------------------------------------------
     PILL PACK
     ------------------------------------------------------------
     A hormonal pack imposes its own schedule: 21 active tablets, then
     a 7-day break during which a withdrawal bleed is expected. That
     bleed is caused by stopping the hormones, not by a cycle running
     its course — so on a pack the calendar genuinely IS predictive,
     but it is predicting the pack, not the body.

     This is also why the temperature rule goes quiet here. Combined
     pills largely suppress ovulation, so there is usually no sustained
     rise to find. Silence is the expected result, not a failure — and
     the UI should say so rather than leave it looking broken. */

  /* How the pack has ACTUALLY gone, as opposed to where the calendar
     says it should be.

     The two drift apart the moment a tablet is missed: on pack day 17
     with three missed days, only fourteen tablets have been taken. The
     schedule doesn't know that on its own, and the difference is the
     part worth seeing — bleeding commonly follows a gap in tablets,
     so a bleed that looks unexplained against the calendar is often
     explained by this.

     Reports what happened. It does not advise on what to do about a
     missed tablet — that belongs to the pack leaflet and her OB. */
  function packAdherence(db, pack, todayKey) {
    const pos = packPosition(pack, todayKey);
    if (!pos) return null;

    const packStart = shiftKey(todayKey, -(pos.dayInPack - 1));
    let taken = 0, missed = 0, nostock = 0, unlogged = 0;
    let currentGap = 0, longestGap = 0, lastMissedKey = null;

    /* Only the active-tablet days of THIS pack. */
    const upTo = Math.min(pos.dayInPack, pos.activeDays);
    for (let i = 0; i < upTo; i++) {
      const k = shiftKey(packStart, i);
      const status = ((db && db[k]) || {}).pill;

      if (status === 'ontime' || status === 'late') {
        taken++;
        currentGap = 0;
      } else {
        if (status === 'missed') { missed++; lastMissedKey = k; }
        else if (status === 'nostock') { nostock++; lastMissedKey = k; }
        else unlogged++;

        if (status === 'missed' || status === 'nostock') {
          currentGap++;
          if (currentGap > longestGap) longestGap = currentGap;
        }
      }
    }

    const skipped = missed + nostock;
    return {
      packStartKey: packStart,
      activeDaysElapsed: upTo,
      taken, missed, nostock, unlogged, skipped,
      /* Consecutive skipped tablets ending today. */
      currentGap,
      longestGap,
      lastMissedKey,
      /* Tablets the schedule assumed vs tablets actually logged. */
      shortfall: Math.max(0, upTo - taken)
    };
  }

  function packPosition(pack, todayKey) {
    if (!pack || !pack.active || !pack.startKey) return null;

    const activeDays = pack.activeDays || 21;
    const breakDays  = pack.breakDays  || 7;
    const packLength = activeDays + breakDays;

    const elapsed = daysBetweenKeys(pack.startKey, todayKey);
    if (isNaN(elapsed) || elapsed < 0) return null;

    const packNumber = Math.floor(elapsed / packLength) + 1;
    const dayInPack  = (elapsed % packLength) + 1;
    const onBreak    = dayInPack > activeDays;

    const breakStartsIn = onBreak ? 0 : (activeDays - dayInPack) + 1;
    const breakDayNumber = onBreak ? dayInPack - activeDays : 0;
    const nextPackIn = packLength - dayInPack + 1;

    return {
      packNumber,
      dayInPack,
      packLength,
      activeDays,
      breakDays,
      onBreak,
      /* Which tablet of the pack today is, or null in the break. */
      tabletNumber: onBreak ? null : dayInPack,
      breakDayNumber,
      breakStartsIn,
      nextPackIn,
      /* A withdrawal bleed is expected during the break. Expected is
         not the same as observed — the day stamps remain the record
         of what actually happened. */
      bleedExpected: onBreak
    };
  }

  window.FloAnalysis = {
    parseTemp, tempSeries, detectTempShift,
    isFertileMucus, fertileMucusDays,
    periodStarts, cycleStats,
    analyseCycle, predictNextPeriod,
    packPosition, packAdherence,
    shiftKey, daysBetweenKeys, dayKeys,
    FERTILE_MUCUS
  };
})();
