/* LifeHub — hydration rules, in one place.
   ────────────────────────────────────────────────────────────────
   The goal, the rates, and what a "glass" means.

   Same idea as JS/lifehub-prestige-ledger.js: the tracker page and
   Poppy both need these numbers, and two copies of a goal is how you
   end up being told you're 8oz short on one screen and finished on
   another. Change the goal here and both follow.

   PURE LOGIC. No Firebase, no DOM. Safe to load anywhere, in any
   order, before or after the SDK.

   ── THE STORAGE UNIT IS OUNCES ───────────────────────────────────
   hydration_logs stores `total` and every log entry in US fluid
   ounces, because that is what the tracker's buttons and its goal
   have always been in. Everything Jen says in millilitres, litres or
   glasses is converted to oz on the way in and stays that way.
*/

(function () {

  /* ══════════════════════════════════════════════════════
     THE GOAL
     ══════════════════════════════════════════════════════ */

  /* 60 oz — six 10oz glasses — with 75 on a workout day.

     It was 100 (ten glasses) and 124. That is roughly three litres of
     drink on top of food, well above the usual 2–2.5L-including-food
     guidance, and it is the wrong shape of target for rebuilding a
     habit: a goal missed every day stops being a goal. Raise it as the
     rhythm comes back — that is what this line is for, and it is meant
     to move more than once.

     Everything downstream follows from these two numbers: the
     completion bonus, the streak test, the drought audit, and the
     three phases in lifehub-hydration-protocol.js, which are
     percentages rather than fixed ounces for exactly this reason. */
  const BASE_GOAL     = 60;    // oz
  const WORKOUT_BONUS = 15;    // oz added on a workout day

  /* Goals BEFORE this date are judged against what they were logged
     under, not against the number above.
     ────────────────────────────────────────────────────────────────
     computeStreak() tests every past day against goalFor(), so
     LOWERING the goal silently turns days that fell short into days
     that met it. A long-broken streak rebuilds itself out of history
     and pays STREAK_7 (+5,000) and STREAK_30 (+25,000) for weeks that
     were never earned under these terms.

     So the old goal is kept, and any day before the change is still
     measured by it. Set GOAL_CHANGED_ON to null to drop this and let
     the new goal apply to all of history. */
  const GOAL_CHANGED_ON = "2026-09-11";
  const PRIOR_GOAL      = { base: 100, workoutBonus: 24 };

  function goalFor(workoutMode, dateKey) {
    const historic = GOAL_CHANGED_ON && dateKey &&
                     String(dateKey) < GOAL_CHANGED_ON;

    const base  = historic ? PRIOR_GOAL.base         : BASE_GOAL;
    const bonus = historic ? PRIOR_GOAL.workoutBonus : WORKOUT_BONUS;

    return workoutMode ? (base + bonus) : base;
  }


  /* ══════════════════════════════════════════════════════
     THE RATES
     ══════════════════════════════════════════════════════
     Mirrored from tracker-hydration.js. FIRST_SIP applies between
     4am and 8am Manila and only on the current day — backfilling
     last Tuesday at 6am must not pay a morning bonus for a sip that
     wasn't taken this morning. */

  const RATES = {
    PER_OZ:         10,
    FIRST_SIP_MULT: 2.5,
    FIRST_SIP_FROM: 4,      // inclusive, Manila hour
    FIRST_SIP_TO:   8,      // exclusive
    COMPLETION:     1000,
    DROUGHT_FINE:   -500,
    DROUGHT_LIMIT:  40,     // under this in a day is fined the next morning
    STREAK_7:       5000,
    STREAK_30:      25000
  };

  function isFirstSipHour(hour) {
    return hour >= RATES.FIRST_SIP_FROM && hour < RATES.FIRST_SIP_TO;
  }

  /* What one sip is worth. Kept as a function so the multipliers can
     never be applied in one place and forgotten in another.

     Paid on the volume as DRUNK, not on the goal-adjusted volume — a
     drink is discounted once, by its own `pays` rate, and discounting
     it twice would make alcohol's zero into a rounding argument.
     `drink` is optional; nothing means water, at full rate. */
  function wageFor(oz, firstSip, drink) {
    const rate = drink && typeof drink.pays === "number" ? drink.pays : 1;
    return (Number(oz) || 0) * RATES.PER_OZ *
           (firstSip ? RATES.FIRST_SIP_MULT : 1) * rate;
  }


  /* ══════════════════════════════════════════════════════
     UNITS
     ══════════════════════════════════════════════════════
     Jen thinks in glasses and bottles and reads labels in millilitres.
     The tracker only ever knew ounces, so this is the translation
     layer between the two.

     GLASS and BOTTLE are conventions, not physics.

     10oz for a glass because that is what the Alexa skill has always
     counted one as, and it matches a quick-add button on the tracker.
     Every glass Jen has ever logged by voice is a 10 — changing it to
     the textbook 8 would make her history mean something it didn't.

     20oz for a bottle because that is the tracker's own bottle
     button. Alexa used to say 16, which matched nothing in the UI;
     that was the odd one out and it lost.

     These two lines are the whole convention. Change one and the
     tracker, Poppy and the Alexa skill all follow — the skill carries
     a marked copy, because Lambda can't load a browser file. */

  const GLASS_OZ  = 10;
  const BOTTLE_OZ = 20;

  const ML_PER_OZ = 29.5735295625;   // US fluid ounce, exactly

  /* Every spelling that has ever come out of a voice assistant or a
     bottle label. Keys are matched lowercase with punctuation gone. */
  const UNITS = {
    oz: 1, ozs: 1, ounce: 1, ounces: 1, "fl oz": 1, floz: 1,
    "fluid ounce": 1, "fluid ounces": 1,

    ml: 1 / ML_PER_OZ, mls: 1 / ML_PER_OZ,
    millilitre: 1 / ML_PER_OZ, millilitres: 1 / ML_PER_OZ,
    milliliter: 1 / ML_PER_OZ, milliliters: 1 / ML_PER_OZ,

    l: 1000 / ML_PER_OZ, liter: 1000 / ML_PER_OZ, liters: 1000 / ML_PER_OZ,
    litre: 1000 / ML_PER_OZ, litres: 1000 / ML_PER_OZ,

    cl: 10 / ML_PER_OZ, centilitre: 10 / ML_PER_OZ, centilitres: 10 / ML_PER_OZ,

    cup: GLASS_OZ, cups: GLASS_OZ,
    glass: GLASS_OZ, glasses: GLASS_OZ,

    bottle: BOTTLE_OZ, bottles: BOTTLE_OZ
  };

  function normaliseUnit(unit) {
    return String(unit == null ? "" : unit)
      .toLowerCase().replace(/[.]/g, "").replace(/\s+/g, " ").trim();
  }

  /* amount + unit → ounces, rounded to one decimal the way the
     tracker's own custom-amount box does.

     Throws on an unknown unit rather than assuming ounces. Guessing
     here would turn "500 ml" into 500oz — five times her daily goal
     in one sip — and it would look perfectly plausible in the log. */
  function toOunces(amount, unit) {
    const n = Number(amount);
    if (!isFinite(n) || n <= 0) {
      throw new Error("How much did you drink?");
    }

    const key = normaliseUnit(unit);

    /* No unit given means ounces: it is the tracker's own unit and
       what every button on the page is labelled in. */
    const factor = key === "" ? 1 : UNITS[key];

    if (factor === undefined) {
      throw new Error('I don’t know the unit “' + unit +
        '”. Try oz, ml, litres, glasses or bottles.');
    }

    const oz = Math.round(n * factor * 10) / 10;

    if (oz <= 0) throw new Error("That rounds to nothing.");

    /* A sanity ceiling. 400oz is nearly 12 litres — past the point
       where drinking it would be dangerous, so it is far more likely
       to be a misheard number or a unit that went astray. */
    if (oz > 400) {
      throw new Error(oz.toFixed(0) + " oz is more than anyone drinks in a day — " +
                      "did I get the units right?");
    }

    return oz;
  }

  /* The other direction, for saying it back. Ounces are precise but
     "you need 32 more ounces" means less to most people than "four
     more glasses". */
  function inGlasses(oz) {
    return Math.round(((Number(oz) || 0) / GLASS_OZ) * 10) / 10;
  }

  function inMl(oz) {
    return Math.round((Number(oz) || 0) * ML_PER_OZ);
  }

  /* "3 glasses", "1 glass" — the plural, done once. */
  function glassPhrase(oz) {
    const g = inGlasses(oz);
    return g + (g === 1 ? " glass" : " glasses");
  }


  /* ══════════════════════════════════════════════════════
     WHAT SHE DRANK
     ══════════════════════════════════════════════════════
     Two numbers per drink, because "does it hydrate me" and "does it
     deserve points" are different questions and conflating them makes
     the tracker lie about one or the other.

       goal   how much of the volume counts toward the daily target.
              This is physiology. Coffee, tea, juice and soft drinks
              retain fluid about as well as water does — the idea that
              caffeine dehydrates you at normal drinking doses is not
              what the research shows — so they are 1.0. Milk is
              actually better than water; it is still capped at 1.0
              because a drink that counted double would make the goal
              easier to hit by drinking less.

       pays   how much prestige it earns, as a fraction of water's
              rate. This is NOT physiology — it is Jen deciding what
              the system should encourage. A milkshake hydrates her;
              it should not throw a party.

     Alcohol is the one real exception on the goal side: genuinely
     diuretic, and dose-dependent. 0.3 says most of a beer is water
     without pretending the alcohol in it is free.

     ── TUNING ───────────────────────────────────────────────────────
     This table is the whole feature. Change a number here and the
     tracker, Poppy and the history all follow. */

  /* `caloric` means the drink is FOOD as well as fluid, and belongs in
     FoodHub too. A glass of milk is 130-ish calories that would
     otherwise never reach the food log — Jen drank one and only the
     burger she ate alongside it showed up.
     Water, black coffee and plain tea are fluid and nothing else. */

  const DRINKS = {
    water:     { label: "Water",       goal: 1.0, pays: 1.00 },
    milk:      { label: "Milk",        goal: 1.0, pays: 0.75, caloric: true },
    smoothie:  { label: "Smoothie",    goal: 1.0, pays: 0.50, caloric: true },
    juice:     { label: "Juice",       goal: 1.0, pays: 0.50, caloric: true },
    tea:       { label: "Tea",         goal: 1.0, pays: 0.50, caffeine: true },
    coffee:    { label: "Coffee",      goal: 1.0, pays: 0.50, caffeine: true },
    sports:    { label: "Sports drink",goal: 1.0, pays: 0.50, caloric: true },
    soda:      { label: "Soft drink",  goal: 1.0, pays: 0.25, caloric: true },
    energy:    { label: "Energy drink",goal: 1.0, pays: 0.25, caffeine: true, caloric: true },
    milkshake: { label: "Milkshake",   goal: 1.0, pays: 0.25, caloric: true },
    alcohol:   { label: "Alcohol",     goal: 0.3, pays: 0.00, alcohol: true, caloric: true }
  };

  const DEFAULT_DRINK = "water";

  /* Everything she might actually say, mapped to one of the eleven.
     Generous on purpose: an unrecognised drink is refused, and being
     refused because you said "flat white" would be irritating. */
  const DRINK_ALIASES = {
    water: "water", h2o: "water", "sparkling water": "water",
    "mineral water": "water", "ice water": "water", "cold water": "water",
    "warm water": "water", "hot water": "water", "lemon water": "water",

    coffee: "coffee", espresso: "coffee", latte: "coffee", americano: "coffee",
    cappuccino: "coffee", mocha: "coffee", macchiato: "coffee",
    "flat white": "coffee", "iced coffee": "coffee", "black coffee": "coffee",
    brew: "coffee", cortado: "coffee",

    tea: "tea", "green tea": "tea", "black tea": "tea", "iced tea": "tea",
    "herbal tea": "tea", chai: "tea", matcha: "tea",

    milk: "milk", "chocolate milk": "milk", "almond milk": "milk",
    "oat milk": "milk", "soy milk": "milk",

    juice: "juice", "orange juice": "juice", "apple juice": "juice",
    oj: "juice", "fruit juice": "juice", "mango juice": "juice",

    soda: "soda", "soft drink": "soda", softdrink: "soda", pop: "soda",
    coke: "soda", cola: "soda", pepsi: "soda", sprite: "soda",
    "root beer": "soda", "fizzy drink": "soda", "soda water": "water",

    "energy drink": "energy", "red bull": "energy", redbull: "energy",
    monster: "energy",

    "sports drink": "sports", gatorade: "sports", powerade: "sports",
    electrolytes: "sports", "electrolyte drink": "sports",

    milkshake: "milkshake", shake: "milkshake", "protein shake": "milkshake",
    frappe: "milkshake", frappuccino: "milkshake",

    smoothie: "smoothie", "fruit smoothie": "smoothie",

    alcohol: "alcohol", beer: "alcohol", wine: "alcohol", lager: "alcohol",
    cider: "alcohol", cocktail: "alcohol", whisky: "alcohol",
    whiskey: "alcohol", vodka: "alcohol", gin: "alcohol", rum: "alcohol",
    "red wine": "alcohol", "white wine": "alcohol", champagne: "alcohol",
    prosecco: "alcohol", soju: "alcohol", sake: "alcohol", tequila: "alcohol",
    brandy: "alcohol", liquor: "alcohol", booze: "alcohol"
  };

  function normaliseDrink(said) {
    return String(said == null ? "" : said)
      .toLowerCase().replace(/[.]/g, "").replace(/\s+/g, " ").trim();
  }

  /* Aliases longest first, so a phrase containing two of them resolves
     to the more specific one: "soda water" is water, not soda, and an
     "energy drink" is not a drink of energy. */
  const ALIASES_BY_LENGTH = Object.keys(DRINK_ALIASES)
    .sort((a, b) => b.length - a.length);

  /* Jen says brands and descriptions, not categories — "bear brand
     milk", "iced caramel latte", "coke zero", "a tall glass of orange
     juice". Exact matching refused all four, which is not a nicety:
     the action threw, and by then Poppy had already said it was
     logged.

     So a known drink is looked for INSIDE the phrase, on whole-word
     boundaries — "milk" matches "bear brand milk" but not
     "milkshake", which is its own entry. */
  function containedAlias(key) {
    const padded = " " + key + " ";
    for (let i = 0; i < ALIASES_BY_LENGTH.length; i++) {
      const alias = ALIASES_BY_LENGTH[i];
      if (padded.indexOf(" " + alias + " ") !== -1) return DRINK_ALIASES[alias];
    }
    return null;
  }

  /* Name → the drink's rules. An empty name is water, because water is
     what this tracker has always been about and every existing entry
     in Firebase predates the field.

     Throws on something it doesn't recognise rather than assuming
     water. Assuming would quietly pay full prestige for a beer. */
  function drinkFor(said) {
    const key = normaliseDrink(said);
    if (key === "") return Object.assign({ key: DEFAULT_DRINK }, DRINKS[DEFAULT_DRINK]);

    /* A plural she said naturally: "two coffees". */
    const singular = key.replace(/s$/, "");

    /* Exact first, so a precise name can never be beaten by a loose
       one, then the contained scan for everything she actually says. */
    const id = DRINK_ALIASES[key] || DRINK_ALIASES[singular] ||
               (DRINKS[key] ? key : null) || (DRINKS[singular] ? singular : null) ||
               containedAlias(key) || containedAlias(singular);

    if (!id) {
      throw new Error('I don’t know what to count “' + said + '” as. ' +
        'Try water, coffee, tea, milk, juice, soda, an energy or sports drink, ' +
        'a smoothie, a milkshake, or alcohol.');
    }
    return Object.assign({ key: id }, DRINKS[id]);
  }

  /* Volume as drunk → volume that counts toward the goal. */
  function effectiveOz(oz, drink) {
    return Math.round((Number(oz) || 0) * (drink ? drink.goal : 1) * 10) / 10;
  }


  /* ══════════════════════════════════════════════════════
     WHAT A DRINK DOES TO TONIGHT'S SLEEP
     ══════════════════════════════════════════════════════
     Caffeine and Alcohol are already factor chips on the sleep
     tracker, and Jen ticks them by hand the morning after. She
     shouldn't have to remember at 7am what she drank at 11pm.

     Caffeine has a half-life of about five hours, so an afternoon
     coffee is still measurably in her at bedtime — 2pm is the line.
     Alcohol wrecks sleep architecture regardless of dose, but a beer
     at lunch is genuinely gone by night, so it gets a later start. */

  const SLEEP_FACTOR_FROM = { caffeine: 14, alcohol: 12 };   // Manila hour

  /* A tag is only about the night it was drunk for. If that night is
     never logged, the tag must not sit there waiting to attach itself
     to some future morning — a coffee last Tuesday has nothing to say
     about next Friday's sleep.

     36 hours: comfortably longer than the gap between drinking and
     logging the next morning, comfortably shorter than two nights. */
  const SLEEP_FACTOR_TTL_MS = 36 * 3600000;

  function factorTagFresh(stampedAt, now) {
    if (!stampedAt) return true;   /* written before stamps existed */
    const age = (now || Date.now()) - Number(stampedAt);
    return age >= 0 && age < SLEEP_FACTOR_TTL_MS;
  }

  /* Which sleep log this drink belongs to — remembering that a sleep
     log is filed under the morning she WAKES, not the evening she
     drank. Anything from 4am onward belongs to the night that ends
     tomorrow; a 2am coffee belongs to the night ending this morning. */
  function sleepNightFor(dateKey, hour) {
    return hour < 4 ? dateKey : shiftKey(dateKey, 1);
  }

  /* The sleep factor a drink earns at this hour, or null. The strings
     match the chips in tracker-sleep.js exactly — "Caffeine",
     "Alcohol" — because they end up in the same array. */
  function sleepFactorFor(drink, hour) {
    if (!drink) return null;
    if (drink.alcohol && hour >= SLEEP_FACTOR_FROM.alcohol) return "Alcohol";
    if (drink.caffeine && hour >= SLEEP_FACTOR_FROM.caffeine) return "Caffeine";
    return null;
  }


  /* ══════════════════════════════════════════════════════
     STREAKS
     ══════════════════════════════════════════════════════
     Consecutive days that met their own goal, ending at endKey.
     A day's goal depends on whether it was a workout day, so the
     entry decides its own target rather than being measured against
     today's.

     `assumeEndMet` exists because the caller often knows the last day
     is met before it has been written — the tracker passes true from
     inside checkRewards for exactly that reason. */

  function shiftKey(key, days) {
    const [y, m, d] = String(key).split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d) + days * 86400000);
    return t.getUTCFullYear() + "-" +
           String(t.getUTCMonth() + 1).padStart(2, "0") + "-" +
           String(t.getUTCDate()).padStart(2, "0");
  }

  function computeStreak(logsByDate, endKey, assumeEndMet) {
    const data = logsByDate || {};
    let streak = 0;
    let key = endKey;

    for (let i = 0; i < 400; i++) {
      const entry = data[key];
      /* The KEY is passed so a day is judged against the goal that was
         in force when it was logged. Without it, lowering the goal
         rebuilds broken streaks out of history. */
      const goal = goalFor(entry && entry.workoutMode, key);
      const total = entry ? (entry.total || 0) : 0;
      const met = (i === 0 && assumeEndMet) || (entry && total >= goal);

      if (!met) break;
      streak++;
      key = shiftKey(key, -1);
    }
    return streak;
  }

  /* The tracker pays at every seventh and every thirtieth day, not
     only the first — `streak % 7 === 0` — and each day's node carries
     its own flags so the same milestone can't be paid twice for the
     same day. Both rules are hers; this only puts them in one place. */
  function streakBonusFor(streak, bonuses) {
    const b = bonuses || {};
    const out = { amount: 0, parts: [] };

    if (streak > 0 && streak % 7 === 0 && !b.streak7) {
      out.amount += RATES.STREAK_7;
      out.parts.push("streak7");
    }
    if (streak > 0 && streak % 30 === 0 && !b.streak30) {
      out.amount += RATES.STREAK_30;
      out.parts.push("streak30");
    }
    return out;
  }


  window.LIFEHUB_HYDRATION = {
    BASE_GOAL, WORKOUT_BONUS, RATES,
    GLASS_OZ, BOTTLE_OZ, ML_PER_OZ, UNITS,
    DRINKS, DRINK_ALIASES, DEFAULT_DRINK,
    SLEEP_FACTOR_FROM, SLEEP_FACTOR_TTL_MS,
    goalFor, isFirstSipHour, wageFor,
    toOunces, inGlasses, inMl, glassPhrase,
    drinkFor, effectiveOz, sleepNightFor, sleepFactorFor, factorTagFresh,
    shiftKey, computeStreak, streakBonusFor
  };

})();
