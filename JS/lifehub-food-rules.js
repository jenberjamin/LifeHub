/* LifeHub — food rules, in one place.
   ────────────────────────────────────────────────────────────────
   The daily targets, the wage rubric, and — the reason this file
   exists — ONE way of reading a logged item's macros.

   Same idea as lifehub-hydration-rules.js and lifehub-prestige-ledger.js.
   FoodHub had three copies of DAILY_GOALS (tracker, history,
   statistics), three hand-written copies of the same totalling loop,
   and only one of the three parsed macros safely. Sugar read 0 on the
   dashboard while the other four macros read fine, and there were
   three different places it could have been going wrong.

   PURE LOGIC. No Firebase, no DOM. Load before the FoodHub scripts.
*/

(function () {

  /* ══════════════════════════════════════════════════════
     THE TARGETS
     ══════════════════════════════════════════════════════
     semi / ult are the two thresholds a macro is scored against.
     Sugar is the odd one out: a LIMIT, not a goal — going over is the
     bad direction, which is why it renders as grams rather than a
     percentage and turns red instead of filling up. */

  const DAILY_GOALS = {
    cal:   { semi: 2200, ult: 2700 },
    prot:  { semi: 110,  ult: 130 },
    carb:  { semi: 250,  ult: 280 },
    fat:   { semi: 60,   ult: 70 },
    sugar: { limit: 60 }
  };

  const WAGE_RATES = {
    GOLD:          3000,   // 2,700+ kcal
    GREEN:         1000,   // 2,200 - 2,699 kcal
    RED:          -1000,   // under 2,200 kcal (sanction)
    PROTEIN_BONUS:  500,   // hit 130g protein
    SUGAR_LIMIT:     60,   // the red line, in grams

    /* The sugar tax halves the day's wage — which does nothing at all
       on a day the wage is already negative. So a day under 2,200 kcal
       could carry any amount of sugar for free, and that is precisely
       the worst-shaped day there is: few calories, lots of sugar.
       This is what the tax costs when there is no wage left to halve. */
    SUGAR_FINE:    -750
  };


  /* ══════════════════════════════════════════════════════
     READING WHAT WAS LOGGED
     ══════════════════════════════════════════════════════
     `macros` and `micros` are stored as JSON STRINGS on both the
     catalogue item and the daily log. Mostly. Anything written by
     hand, or by an older build, can be a plain object already — so
     every reader has to cope with both, and two of the three didn't:
     history and statistics called JSON.parse() straight on it, which
     throws on an object and takes the whole day's total with it. */

  function parseBlob(data) {
    if (!data) return {};
    if (typeof data === "object") return data;
    try {
      return JSON.parse(data);
    } catch (e) {
      console.warn("[food] unreadable nutrition data:", e.message);
      return {};
    }
  }


  /* ── SUGAR ────────────────────────────────────────────────────
     Its own function because it is the one field with a history.

     Sugar started life in the optional micronutrient panel, stored
     as micros["Sugars"]. It was later promoted to a macro box of its
     own, stored as macros.sugar. Every item added BEFORE that change
     still carries its sugar in the old place — and every reader only
     ever looked in the new one, which is why the dashboard could show
     calories, protein, carbs and fat correctly and sugar as 0g.

     So both are checked, new location first. The spelling variants
     were already being tried in food-tracker.js; they are kept
     because a hand-edited row may use any of them. */
  function sugarOf(macros, micros) {
    const m = macros || {};
    const fromMacro = m.sugar != null ? m.sugar
                    : m.Sugar != null ? m.Sugar
                    : m.sugars != null ? m.sugars
                    : m.Sugars;

    const n = parseFloat(fromMacro);
    if (isFinite(n) && n !== 0) return n;

    /* Falling back only when the macro is absent OR zero. A real
       zero and a missing value are indistinguishable here, and for a
       food that has sugar recorded in the old place, showing it beats
       insisting on the zero. */
    const u = micros || {};
    const fromMicro = u["Sugars"] != null ? u["Sugars"] : u["Sugar"];
    const legacy = parseFloat(fromMicro);

    if (isFinite(legacy)) return legacy;
    return isFinite(n) ? n : 0;
  }


  /* One logged row → the grams it actually contributed, multiplier
     included. The multiplier is how many servings, and it applies to
     every macro equally. */
  function macrosOf(log) {
    const macros = parseBlob(log && log.macros);
    const micros = parseBlob(log && log.micros);
    const m = parseFloat(log && log.multiplier) || 1;

    return {
      cal:   (parseFloat(macros.cal)  || 0) * m,
      prot:  (parseFloat(macros.prot) || 0) * m,
      carb:  (parseFloat(macros.carb) || 0) * m,
      fat:   (parseFloat(macros.fat)  || 0) * m,
      sugar: sugarOf(macros, micros) * m
    };
  }


  /* A whole day's node → its totals.
     `wageProcessed` is a bookkeeping flag that lives alongside the
     logs, not a thing she ate. So is any row with no foodName. */
  function totalsFor(dayLogs) {
    const totals = { cal: 0, prot: 0, carb: 0, fat: 0, sugar: 0 };
    if (!dayLogs) return totals;

    Object.keys(dayLogs).forEach(key => {
      if (key === "wageProcessed") return;
      const log = dayLogs[key];
      if (!log || !log.foodName) return;

      const got = macrosOf(log);
      totals.cal   += got.cal;
      totals.prot  += got.prot;
      totals.carb  += got.carb;
      totals.fat   += got.fat;
      totals.sugar += got.sugar;
    });

    return totals;
  }


  /* ══════════════════════════════════════════════════════
     SCORING
     ══════════════════════════════════════════════════════
     "safe" / "warning" / "danger" for one macro. Sugar runs the other
     way round — under the limit is safe — and is the only reason this
     needs to know which macro it is looking at. */

  function bandFor(type, value) {
    const goal = DAILY_GOALS[type];
    if (!goal) return "safe";

    if (type === "sugar") {
      if (value >= goal.limit)       return "danger";
      if (value >= goal.limit * 0.8) return "warning";
      return "safe";
    }

    if (value >= goal.ult)  return "safe";
    if (value >= goal.semi) return "warning";
    return "danger";
  }


  window.LIFEHUB_FOOD = {
    DAILY_GOALS, WAGE_RATES,
    parseBlob, sugarOf, macrosOf, totalsFor, bandFor
  };

})();
