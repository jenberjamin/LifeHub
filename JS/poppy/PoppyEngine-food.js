/* LifeHub — Poppy's write layer for FoodHub.
   ────────────────────────────────────────────────────────────────
   The reads live in LifeHub-poppy-firebase-fetch.js under
   "food/catalogue" and "food/today". The targets, the wage rubric and
   the macro reader live in JS/lifehub-food-rules.js.

   Load AFTER JS/lifehub-food-rules.js and the other PoppyEngine-*.js
   wrappers.

   ── WHAT THIS IS FOR ─────────────────────────────────────────────
   Jen stopped tracking food because the tracker asked her to be a
   nutrition database while eating. Every new snack meant opening the
   list, inventing a serving size, and finding five numbers before she
   could log a biscuit. So the list stayed tiny and the habit died.

   Poppy already knows roughly what is in a chicken adobo or a 7/11
   donut. This lets her put that knowledge in the catalogue and log
   the meal in one sentence.

   ── TWO NODES ────────────────────────────────────────────────────
   foodList    the CATALOGUE. One row per food, with the macros for
               ONE serving. Reused every time that food is eaten.
   dailyLogs   what was eaten, keyed by Manila date. Each row
               SNAPSHOTS the item's macros at the moment of logging,
               so correcting the catalogue later does not rewrite
               history — and a log of a food is not a reference to it.

   ── ESTIMATES ARE MARKED ─────────────────────────────────────────
   Anything Poppy invents carries estimatedBy: "Poppy". These numbers
   are informed guesses, not label readings, and a year from now the
   difference matters — the food list is the one place in LifeHub
   where guessed data becomes permanent and compounds. The flag is
   what lets it be found and fixed.
*/

(function () {

  const prior = window.LIFEHUB_ACTIONS;
  if (!prior || typeof prior.describe !== "function") {
    console.error("[Poppy food] LIFEHUB_ACTIONS missing — load this after the other PoppyEngine wrappers.");
    return;
  }

  function F() {
    if (!window.LIFEHUB_FOOD) {
      throw new Error("JS/lifehub-food-rules.js isn't loaded on this page.");
    }
    return window.LIFEHUB_FOOD;
  }

  function db() {
    if (!window.POPPY_FETCH || typeof window.POPPY_FETCH.rtdb !== "function") {
      throw new Error("Poppy's Firebase layer isn't loaded.");
    }
    return window.POPPY_FETCH.rtdb("lifehub");
  }

  const PH_TZ = "Asia/Manila";
  const PH_DATE = new Intl.DateTimeFormat("en-CA", {
    timeZone: PH_TZ, year: "numeric", month: "2-digit", day: "2-digit"
  });
  const phToday = () => PH_DATE.format(new Date());

  /* The tracker stamps each log with this exact format, so a row Poppy
     writes reads the same in the list as one added by tapping. */
  const phClock = () => new Date().toLocaleTimeString([], {
    timeZone: PH_TZ, hour: "2-digit", minute: "2-digit"
  });

  function parseDate(said) {
    if (said == null || String(said).trim() === "") return phToday();
    const raw = String(said).trim().toLowerCase();
    if (raw === "today") return phToday();
    if (raw === "yesterday") {
      const [y, m, d] = phToday().split("-").map(Number);
      const t = new Date(Date.UTC(y, m - 1, d) - 86400000);
      return t.getUTCFullYear() + "-" +
             String(t.getUTCMonth() + 1).padStart(2, "0") + "-" +
             String(t.getUTCDate()).padStart(2, "0");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      throw new Error("I need the date as YYYY-MM-DD — I got “" + said + "”.");
    }
    if (raw > phToday()) throw new Error(raw + " hasn't happened yet.");
    return raw;
  }


  /* ══════════════════════════════════════════════════════
     The catalogue
     ══════════════════════════════════════════════════════ */

  const FOOD_CATEGORIES  = ["BREAKFAST", "LUNCH", "DINNER", "BRUNCH",
                            "SNACKS", "DESSERT", "PRE-WORKOUT",
                            "POST-WORKOUT", "STAPLE"];
  const DRINK_CATEGORIES = ["HOT DRINKS", "COLD DRINKS", "ICED DRINKS",
                            "PRE-WORKOUT", "POST-WORKOUT"];

  /* The four micronutrients on every nutrition label and in ordinary
     knowledge. Poppy is told not to attempt the vitamins — a guessed
     Vitamin B2 figure is noise wearing the clothes of data. */
  const ESTIMABLE_MICROS = {
    satfat:      "Sat. Fat",
    sodium:      "Sodium",
    fiber:       "Fiber",
    cholesterol: "Cholesterol"
  };

  function category(said, isDrink) {
    const valid = isDrink ? DRINK_CATEGORIES : FOOD_CATEGORIES;
    const want = String(said == null ? "" : said).trim().toUpperCase();

    if (!want) return isDrink ? "COLD DRINKS" : "SNACKS";
    const hit = valid.find(c => c === want);
    if (!hit) {
      throw new Error("“" + said + "” isn't one of the categories. " +
                      "They are: " + valid.join(", ") + ".");
    }
    return hit;
  }

  /* Non-negative, finite, and rounded to one decimal. A macro is
     never negative and an absurd one is a misheard number. */
  function num(v, what, max) {
    if (v == null || String(v).trim() === "") return 0;
    const n = Number(v);
    if (!isFinite(n) || n < 0) {
      throw new Error("“" + v + "” isn't a number I can use for " + what + ".");
    }
    if (max && n > max) {
      throw new Error(n + " " + what + " for one serving doesn't look right — " +
                      "is that the number you meant?");
    }
    return Math.round(n * 10) / 10;
  }

  const norm = s => String(s == null ? "" : s).toLowerCase()
                      .replace(/[^a-z0-9]+/g, " ").trim();

  /* Finds an existing item by name. Exact first, then a contained
     match — so "adobo" reaches "Chicken Adobo" but an exact name can
     never be beaten by a loose one. Ambiguity is refused rather than
     guessed: logging the wrong food is worse than asking. */
  async function findItem(said) {
    const raw = (await db().ref("foodList").once("value")).val() || {};
    const ids = Object.keys(raw);
    const want = norm(said);
    if (!want) throw new Error("Which food?");

    const rows = ids.map(id => ({ id: id, item: raw[id] || {} }));

    let hits = rows.filter(r => norm(r.item.name) === want);
    if (!hits.length) hits = rows.filter(r => norm(r.item.name).indexOf(want) !== -1);
    if (!hits.length) hits = rows.filter(r => want.indexOf(norm(r.item.name)) !== -1);

    if (hits.length === 1) return hits[0];
    if (hits.length > 1) {
      throw new Error("That matches " + hits.length + " things on your list — " +
                      hits.slice(0, 4).map(h => h.item.name).join(", ") + ". Which one?");
    }
    return null;
  }

  /* Builds the catalogue row. Mirrors saveEntry() in food-core.js
     field for field, so an item Poppy adds is indistinguishable from
     one typed into the form. */
  function buildItem(cmd) {
    const name = String(cmd.item == null ? "" : cmd.item).trim();
    if (!name) throw new Error("What's it called?");

    const serving = String(cmd.serving == null ? "" : cmd.serving).trim();
    if (!serving) {
      throw new Error("I need the serving the numbers are for — " +
                      "“1 cup”, “100 g”, “1 piece”.");
    }

    const isDrink = cmd.kind === "drink";

    const macros = {
      cal:   String(num(cmd.cal,  "calories", 5000)),
      prot:  String(num(cmd.prot, "protein",  500)),
      carb:  String(num(cmd.carb, "carbs",    1000)),
      fat:   String(num(cmd.fat,  "fat",      500)),
      sugar: String(num(cmd.sugar, "sugar",   1000))
    };

    /* Only the four she is allowed to estimate. Every other micro is
       written empty, exactly as the form writes an untouched input,
       so the shape of the row matches. */
    const micros = {};
    ["Sat. Fat", "Trans Fat", "Cholesterol", "Sodium", "Potassium",
     "Magnesium", "Fiber", "Calcium", "Iron", "Zinc", "Alcohol",
     "Vit C", "Vit A", "Vit E", "Vit B1", "Vit B2", "Vit D"
    ].forEach(k => { micros[k] = ""; });

    Object.keys(ESTIMABLE_MICROS).forEach(key => {
      const v = cmd[key];
      if (v != null && String(v).trim() !== "") {
        micros[ESTIMABLE_MICROS[key]] = String(num(v, key, 10000));
      }
    });

    return {
      name:     name,
      serving:  serving,
      category: category(cmd.category, isDrink),
      macros:   JSON.stringify(macros),
      micros:   JSON.stringify(micros),

      /* Poppy's own marks. FoodHub ignores both; they are what makes
         a guessed row findable later. */
      estimatedBy: "Poppy",
      estimatedAt: Date.now()
    };
  }

  const summarise = (item) => {
    const m = F().parseBlob(item.macros);
    return item.name + " (per " + item.serving + "): " + m.cal + " cal, " +
           m.prot + "g protein, " + m.carb + "g carbs, " + m.fat + "g fat, " +
           m.sugar + "g sugar";
  };


  /* ══════════════════════════════════════════════════════
     Adding
     ══════════════════════════════════════════════════════ */

  async function addFood(cmd) {
    const existing = await findItem(cmd.item).catch(() => null);
    if (existing) {
      throw new Error("“" + existing.item.name + "” is already on your list — " +
                      summarise(existing.item) + ". I can log that instead.");
    }

    const item = buildItem(cmd);
    const ref = await db().ref("foodList").push(item);

    return "Added " + summarise(item) + (item.category ? " [" + item.category + "]" : "") +
           (ref.key ? "" : "");
  }


  /* ══════════════════════════════════════════════════════
     Logging
     ══════════════════════════════════════════════════════
     Find-or-create, then log. One action, because "I ate a donut" is
     one thought and Jen should not have to know whether that donut is
     already in a database. */

  async function logFood(cmd) {
    const date = parseDate(cmd.date);
    const servings = cmd.servings == null || String(cmd.servings).trim() === ""
      ? 1 : Number(cmd.servings);

    if (!isFinite(servings) || servings <= 0) {
      throw new Error("How many servings?");
    }
    if (servings > 20) {
      throw new Error(servings + " servings doesn't look right — is that what you meant?");
    }

    let found = await findItem(cmd.item);
    let created = false;
    let item;

    if (found) {
      item = found.item;
    } else {
      /* Nothing on the list matches, so the nutrition has to come with
         the request. Refusing here rather than logging an empty row is
         deliberate: a zero-calorie meal in the history is worse than
         no meal, because it looks like data. */
      if (cmd.cal == null || String(cmd.cal).trim() === "") {
        throw new Error("“" + cmd.item + "” isn't on your list yet, and I'd need " +
                        "the serving size and its calories to add it.");
      }
      item = buildItem(cmd);
      await db().ref("foodList").push(item);
      created = true;
    }

    /* SNAPSHOTTED, not referenced — the same shape confirmLog() writes.
       Correcting the catalogue later must not silently rewrite what
       she is recorded as having eaten. */
    await db().ref("dailyLogs/" + date).push({
      foodName:    item.name,
      baseServing: item.serving,
      multiplier:  servings,
      time:        phClock(),
      macros:      item.macros,
      micros:      item.micros,
      loggedBy:    "Poppy"
    });

    /* What the day looks like now — the useful half of the receipt. */
    const day = (await db().ref("dailyLogs/" + date).once("value")).val() || {};
    const t = F().totalsFor(day);
    const g = F().DAILY_GOALS;

    const sugarNote = t.sugar >= g.sugar.limit
      ? " — over the " + g.sugar.limit + "g sugar limit, which halves today's prestige"
      : "";

    return (created ? "Added and logged " : "Logged ") +
           servings + "x " + item.name +
           (created ? " (new: " + summarise(item) + ")" : "") +
           " — day now " + Math.round(t.cal) + " cal, " +
           Math.round(t.prot) + "g protein, " +
           Math.round(t.sugar) + "g sugar" + sugarNote;
  }


  /* ══════════════════════════════════════════════════════
     Undoing
     ══════════════════════════════════════════════════════ */

  async function undoFood(cmd) {
    const date = parseDate(cmd.date);
    const ref = db().ref("dailyLogs/" + date);
    const day = (await ref.once("value")).val() || {};

    /* Push keys sort chronologically, so the last real row is the last
       key that isn't the wage flag. */
    const keys = Object.keys(day)
      .filter(k => k !== "wageProcessed" && day[k] && day[k].foodName)
      .sort();

    if (!keys.length) throw new Error("Nothing is logged on " + date + " to undo.");

    const last = keys[keys.length - 1];
    const row = day[last];
    await ref.child(last).remove();

    return "Removed " + (parseFloat(row.multiplier) || 1) + "x " + row.foodName +
           " from " + (row.time || date);
  }


  /* ══════════════════════════════════════════════════════
     ACTIONS
     ══════════════════════════════════════════════════════ */

  const ACTIONS = {

    food_log: {
      spec: '{"action":"food_log","item":"Double Chocolate Donut - 7/11","servings":1,' +
            '"serving":"1 piece","cal":350,"prot":5,"carb":45,"fat":18,"sugar":31,' +
            '"satfat":9,"sodium":300,"fiber":2,"cholesterol":25,"category":"DESSERT","kind":"food","date":""} ' +
            '— logs something Jen ate. ' +
            'FIRST look for the item in the Food list in LIVE DATA. If it is there, send ONLY item, servings and date — ' +
            'the nutrition is already on record and re-sending it does nothing. ' +
            'If it is NOT there, send the nutrition too and it is added to the list and logged in one go. ' +
            'servings is how many of the listed serving she had, default 1. ' +
            'serving is what ONE serving is ("1 cup", "100 g", "1 piece") and the macros must be for exactly that. ' +
            'category is one of BREAKFAST, LUNCH, DINNER, BRUNCH, SNACKS, DESSERT, PRE-WORKOUT, POST-WORKOUT, STAPLE — ' +
            'or for kind:"drink", one of HOT DRINKS, COLD DRINKS, ICED DRINKS, PRE-WORKOUT, POST-WORKOUT. ' +
            'satfat, sodium, fiber and cholesterol are optional and the ONLY micronutrients to attempt. Never guess vitamins.',
      run: (cmd) => logFood(cmd)
    },

    food_add: {
      spec: '{"action":"food_add","item":"Chicken Adobo","serving":"1 cup","cal":350,"prot":25,' +
            '"carb":8,"fat":22,"sugar":3,"sodium":900,"category":"DINNER","kind":"food"} ' +
            '— adds a food to the list WITHOUT logging it. ' +
            'Use only when she is stocking the list ("add adobo to my foods"), not when she has eaten something — ' +
            'that is food_log, which adds it as part of logging. ' +
            'Refused if something of that name is already there.',
      run: (cmd) => addFood(cmd)
    },

    food_undo: {
      spec: '{"action":"food_undo","date":""} ' +
            '— removes the MOST RECENT food entry from a day. It only ever removes the last one. ' +
            'LIVE DATA names the entry that would go; read it back if there is any doubt. ' +
            'This removes the LOG, not the item from her food list.',
      run: (cmd) => undoFood(cmd)
    }

  };


  window.LIFEHUB_ACTIONS = {

    describe() {
      const own = Object.keys(ACTIONS).map(k => "  " + ACTIONS[k].spec);
      return prior.describe() + "\n\n" + [
        "You can also act on FoodHub. Same fenced block, these actions:",
        ""
      ].concat(own).concat([
        "",
        "The food list is the one place in LifeHub where a number you invented",
        "becomes permanent and gets reused every time she eats that thing again.",
        "Reuse what is already on the list, say your estimate out loud before it",
        "is written, and never invent a serving size she didn't confirm."
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
