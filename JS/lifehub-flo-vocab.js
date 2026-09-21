/* ============================================================
   LifeHub — FLO daily-log vocabularies

   The five fields you pick from a list: mood, flow, symptoms,
   discharge and activity. For each one this file holds the exact
   options the tracker offers, what the day record calls the field,
   what it pays, and a matcher that turns Jen's own words into one of
   the options.

   Pure: no DOM, no Firebase, no clock.

   ── WHY A MATCHER AND NOT JUST A LIST ────────────────────────────
   Jen does not say "TENDER BREAST". She says her boobs hurt. Poppy
   has to land on the exact string the tracker stores, because the
   calendar, the statistics and the history all filter on it — a
   symptom logged as "sore chest" is a symptom that will never appear
   in any of them again.

   So the matching happens HERE, in one tested place, rather than
   inside a language model's judgement where it cannot be checked.
   Poppy passes through what Jen said; the action asks this file what
   that means; anything it cannot place is refused and asked about.

   ── KEEPING IT HONEST ────────────────────────────────────────────
   These lists are duplicated from the modals in
   Trackers/FLO/LifeHub-tracker-FLO.html, because those are hardcoded
   in onclick attributes and rewriting them was not worth the risk.
   The duplication is held in check by a test that parses that HTML
   and asserts the two agree exactly. If you add an option to a modal,
   add it here, and the test will tell you if you forget.

   Load BEFORE PoppyEngine-flo.js.
   ============================================================ */
(function () {
  'use strict';

  /* ── THE FIELDS ────────────────────────────────────────────────
     field     what db[date][field] is called
     reward    the key in db[date].rewards that stops it paying twice
     pays      prestige, once per day
     multi     true if a day can hold several at once
     options   the exact strings the tracker stores
     aliases   what Jen actually says → the option it means
     ──────────────────────────────────────────────────────────── */

  const FIELDS = {

    mood: {
      field: 'mood', reward: 'MOOD', pays: 250, multi: true,
      label: 'Mood',

      /* ── PAID PER CHECK-IN ─────────────────────────────────────
         Like symptoms, mood is paid more than once a day — but the
         unit is different, and the difference matters.

         Symptoms pay per distinct symptom, because a second symptom
         is a second thing noticed. Mood pays per SLOT, because a
         second check-in is a second act of stopping to notice, and
         the word is not the point: "okay" this morning and "okay"
         tonight are two real readings of the day, and paying per
         distinct value would score that as nothing.

         250 for the day's first check-in, 100 for each after — three
         slots, so 450 is the most a day can hold, and there is no
         way to repeat one.                                        */
      paysEach: 100,
      slotPaidField: 'moodSlotsPaidFor',
      options: [
        'ELATED', 'EXCITED', 'HAPPY', 'OKAY', 'CALM', 'MEH',
        'HOLDING ON', 'NOT OKAY', 'CONFUSED', 'SAD', 'DEPRESSED',
        'STRESSED', 'ANXIOUS', 'SICK', 'IRATE', 'PLAYFUL',
        'HUMPY', 'NEUTRAL'
      ],
      aliases: {
        'ELATED':     ['elated', 'overjoyed', 'ecstatic', 'amazing', 'wonderful', 'on top of the world'],
        'EXCITED':    ['excited', 'buzzing', 'hyped', 'pumped', 'thrilled', 'looking forward'],
        'HAPPY':      ['happy', 'good', 'great', 'cheerful', 'glad', 'lovely', 'nice day'],
        'OKAY':       ['okay', 'ok', 'alright', 'all right', 'fine', 'not bad'],
        'CALM':       ['calm', 'peaceful', 'relaxed', 'chill', 'settled', 'serene', 'content'],
        'MEH':        ['meh', 'blah', 'flat', 'indifferent', 'whatever', 'nothing special'],
        'HOLDING ON': ['holding on', 'hanging in', 'getting by', 'coping', 'managing', 'surviving', 'barely'],
        'NOT OKAY':   ['not okay', 'not ok', 'not good', 'not great', 'bad', 'awful', 'terrible', 'rough'],
        'CONFUSED':   ['confused', 'lost', 'muddled', 'foggy', 'unsure', 'all over the place'],
        'SAD':        ['sad', 'down', 'blue', 'low', 'unhappy', 'teary', 'crying', 'upset'],
        'DEPRESSED':  ['depressed', 'hopeless', 'empty', 'numb', 'heavy', 'cannot get up'],
        'STRESSED':   ['stressed', 'overwhelmed', 'swamped', 'under pressure', 'frazzled', 'burnt out', 'burned out'],
        'ANXIOUS':    ['anxious', 'anxiety', 'worried', 'nervous', 'panicky', 'panic', 'on edge', 'restless'],
        'SICK':       ['sick', 'ill', 'unwell', 'poorly', 'under the weather'],
        'IRATE':      ['irate', 'angry', 'furious', 'mad', 'irritated', 'annoyed', 'pissed', 'raging'],
        'PLAYFUL':    ['playful', 'silly', 'goofy', 'cheeky', 'mischievous'],
        'HUMPY':      ['humpy', 'horny', 'frisky', 'turned on', 'aroused'],
        'NEUTRAL':    ['neutral', 'normal', 'same as usual', 'nothing much', 'average']
      }
    },

    flow: {
      field: 'flow', reward: 'FLOW', pays: 300, multi: false,
      label: 'Flow',
      options: ['SPOTTING', 'LIGHT', 'NORMAL', 'HEAVY', 'VERY HEAVY'],
      aliases: {
        'SPOTTING':   ['spotting', 'spots', 'barely anything', 'just a bit', 'a few drops', 'tiny bit'],
        'LIGHT':      ['light', 'lightly', 'quite light', 'not much'],
        'NORMAL':     ['normal', 'regular', 'usual', 'medium', 'moderate', 'average'],
        'HEAVY':      ['heavy', 'heavily', 'a lot', 'lots'],
        'VERY HEAVY': ['very heavy', 'really heavy', 'extremely heavy', 'flooding', 'soaking through', 'worst']
      },
      /* Alexa asks for a 1-5 score and the skill maps it. Same map
         here so a spoken "three" means the same thing either way. */
      scale: { 1: 'SPOTTING', 2: 'LIGHT', 3: 'NORMAL', 4: 'HEAVY', 5: 'VERY HEAVY' }
    },

    symptoms: {
      field: 'symptoms', reward: 'SYMPTOMS', pays: 300, multi: true,
      label: 'Symptoms',

      /* ── PAID PER SYMPTOM, NOT PER SAVE ────────────────────────
         The only field that works this way, and deliberately.

         A headache at breakfast and cramps in the afternoon are two
         separate acts of noticing and writing something down, and
         both are worth something — a flat once-a-day rate quietly
         says the second one was not worth logging, which is exactly
         the wrong lesson for the field that most benefits from being
         kept up through the day.

         What it must NOT become is a tap to farm. So the money is
         attached to the SYMPTOM, not to the save: each distinct
         symptom pays once ever, that day, and re-saving a list pays
         nothing. Padding the list is the only way to game it, and
         that only fools the person reading it back.

         paysEach   every distinct symptom after the first
         maxExtras  the ceiling, so a bad day is 800 and not 2,000
         paidField  the day record's list of what has already paid  */
      paysEach: 100,
      maxExtras: 5,
      paidField: 'symptomsPaidFor',
      options: [
        'EVERYTHING IS FINE',
        'ACNE', 'HAIRFALL', 'NAUSEA', 'DIZZINESS', 'FATIGUE', 'HEADACHE',
        'MIGRAINE', 'CHILLS', 'ITCHINESS', 'DRYNESS', 'CRAMPS',
        'WEARING DIAPER', 'TENDER BREAST', 'BLOATING', 'DIARRHEA',
        'CONSTIPATION', 'BACKACHE', 'BODY ACHE', 'STOMACHACHE', 'FEVERISH'
      ],
      /* EVERYTHING IS FINE is the positive answer, not the absence of
         one — a day recorded as symptom-free is evidence, and a blank
         day is not. It is the one option that cannot share a day with
         the others; see exclusive() below. */
      exclusive: ['EVERYTHING IS FINE'],
      aliases: {
        'EVERYTHING IS FINE': ['everything is fine', 'everything fine', 'nothing', 'no symptoms',
                               'none', 'all good', 'all fine', 'nothing to report',
                               'feeling fine', 'no complaints', 'symptom free'],
        'ACNE':           ['acne', 'pimples', 'pimple', 'spots on my face', 'breakout', 'breaking out', 'zits'],
        'HAIRFALL':       ['hairfall', 'hair fall', 'hair loss', 'losing hair', 'shedding hair'],
        'NAUSEA':         ['nausea', 'nauseous', 'queasy', 'sick to my stomach', 'want to throw up', 'like vomiting'],
        'DIZZINESS':      ['dizziness', 'dizzy', 'lightheaded', 'light headed', 'room spinning', 'vertigo'],
        'FATIGUE':        ['fatigue', 'tired', 'exhausted', 'knackered', 'no energy', 'drained', 'wiped out', 'sleepy'],
        'HEADACHE':       ['headache', 'head hurts', 'head ache', 'sore head'],
        'MIGRAINE':       ['migraine', 'migraines'],
        'CHILLS':         ['chills', 'shivering', 'shivers', 'cold sweats', 'freezing'],
        'ITCHINESS':      ['itchiness', 'itchy', 'itching', 'itch'],
        'DRYNESS':        ['dryness', 'dry'],
        'CRAMPS':         ['cramps', 'cramping', 'cramp', 'period pain', 'menstrual pain'],
        'WEARING DIAPER': ['wearing diaper', 'diaper', 'adult diaper', 'nappy'],
        'TENDER BREAST':  ['tender breast', 'tender breasts', 'sore breasts', 'sore boobs', 'boobs hurt',
                           'breast pain', 'chest tenderness', 'sensitive breasts'],
        'BLOATING':       ['bloating', 'bloated', 'puffy', 'swollen belly', 'gassy'],
        'DIARRHEA':       ['diarrhea', 'diarrhoea', 'loose stools', 'runny stomach', 'the runs'],
        'CONSTIPATION':   ['constipation', 'constipated', 'cannot go', 'blocked up'],
        'BACKACHE':       ['backache', 'back ache', 'back pain', 'sore back', 'back hurts', 'lower back pain'],
        'BODY ACHE':      ['body ache', 'body aches', 'aching all over', 'everything hurts', 'sore all over'],
        'STOMACHACHE':    ['stomachache', 'stomach ache', 'stomach pain', 'tummy ache', 'belly ache',
                           'stomach hurts', 'tummy hurts'],
        'FEVERISH':       ['feverish', 'fever', 'hot', 'burning up', 'temperature']
      }
    },

    discharge: {
      field: 'discharge', reward: 'DISCHARGE', pays: 200, multi: false,
      label: 'Discharge',
      options: [
        'CLEAR & WATERY', 'CLEAR & STRETCHY', 'MILKY OR CREAMY',
        'THICK & CLUMPY', 'YELLOW, GREEN, OR GRAY', 'BROWN OR DARK RED',
        'SPOTTING', 'NORMAL BLEEDING', 'HEAVY BLOOD CLOT'
      ],
      aliases: {
        'CLEAR & WATERY':         ['clear and watery', 'clear watery', 'watery', 'thin and clear', 'like water'],
        'CLEAR & STRETCHY':       ['clear and stretchy', 'stretchy', 'egg white', 'eggwhite',
                                   'like egg white', 'slippery', 'elastic'],
        'MILKY OR CREAMY':        ['milky', 'creamy', 'white', 'lotion like', 'milky white'],
        'THICK & CLUMPY':         ['thick and clumpy', 'clumpy', 'lumpy', 'cottage cheese', 'curd like', 'thick'],
        'YELLOW, GREEN, OR GRAY': ['yellow', 'green', 'gray', 'grey', 'yellowish', 'greenish', 'discoloured'],
        'BROWN OR DARK RED':      ['brown', 'dark red', 'brownish', 'old blood', 'rusty'],
        'SPOTTING':               ['spotting', 'spots', 'a few drops'],
        'NORMAL BLEEDING':        ['normal bleeding', 'regular bleeding', 'just blood', 'period blood'],
        'HEAVY BLOOD CLOT':       ['heavy blood clot', 'blood clot', 'clots', 'clotting', 'big clots']
      }
    },

    activity: {
      field: 'activity', reward: 'ACTIVITY', pays: 200, multi: false,
      label: 'Activity',
      options: [
        'LOW DRIVE', 'NEUTRAL DRIVE', 'HIGH DRIVE', 'PROTECTED SEX',
        'UNPROTECTED SEX', 'SELF-LOVING', 'PREFER NOT TO SAY'
      ],
      aliases: {
        'LOW DRIVE':       ['low drive', 'low libido', 'not interested', 'no drive', 'off it'],
        'NEUTRAL DRIVE':   ['neutral drive', 'neutral', 'normal drive', 'average drive'],
        'HIGH DRIVE':      ['high drive', 'high libido', 'horny', 'very into it', 'frisky'],
        'PROTECTED SEX':   ['protected sex', 'sex with a condom', 'used a condom', 'protected'],
        'UNPROTECTED SEX': ['unprotected sex', 'without a condom', 'no condom', 'unprotected'],
        'SELF-LOVING':     ['self loving', 'self-loving', 'masturbated', 'solo', 'by myself'],
        'PREFER NOT TO SAY': ['prefer not to say', 'rather not say', 'skip', 'no comment', 'private']
      },
      /* Nothing in this field is ever commented on, ranked, or brought
         up unprompted. It is recorded and left alone. */
      sensitive: true
    },

    /* Half a list and half free text. The six are what she keeps in
       the house; anything else she takes is still worth recording, so
       an unrecognised name is KEPT rather than refused — the opposite
       of every other field here.

       That is the right way round for medicine specifically: a drug
       missing from the record because Poppy did not recognise the
       name is worse than one recorded in Jen's own spelling. */
    medicine: {
      field: 'medicine', reward: 'MEDICINE', pays: 300, multi: true,
      label: 'Medicine',
      allowFreeText: true,
      options: [
        'PROPAN WITH IRON', 'ASCORBIC ACID', 'BIOGESIC',
        'EMIDOL', 'DECOLGEN', 'QUETIAPINE'
      ],
      aliases: {
        'PROPAN WITH IRON': ['propan with iron', 'propan', 'iron', 'multivitamins',
                             'multivitamin', 'my vitamins'],
        'ASCORBIC ACID':    ['ascorbic acid', 'ascorbic', 'vitamin c', 'vit c',
                             'poten cee', 'cecon'],
        'BIOGESIC':         ['biogesic', 'paracetamol', 'panadol', 'acetaminophen',
                             'tylenol', 'painkiller', 'pain reliever'],
        'EMIDOL':           ['emidol', 'mefenamic', 'mefenamic acid', 'ponstan',
                             'dolfenal', 'period painkiller'],
        'DECOLGEN':         ['decolgen', 'colds medicine', 'cold medicine',
                             'decongestant', 'neozep'],
        'QUETIAPINE':       ['quetiapine', 'seroquel', 'my quetiapine']
      }
      /* Althea is NOT here. The pill has its own field, its own
         schedule and its own money — logging it as medicine would
         record the tablet twice and pay for it twice. */
    }
  };

  /* ── THE OPEN FIELDS ───────────────────────────────────────────
     Basal temperature and notes have no list to pick from, so they
     get no vocabulary — only the day-record shape and what they pay,
     kept here so there is still one place that knows.

     Temperature validation deliberately lives elsewhere: parseTemp()
     in flo-cycle-analysis.js already knows what a plausible basal
     reading is and converts Fahrenheit, and the ovulation detection
     reads through it. A second opinion about what counts as a valid
     temperature is the last thing this needs.
     ──────────────────────────────────────────────────────────── */
  const OPEN_FIELDS = {
    temp: {
      field: 'temp', reward: 'TEMP', pays: 200, label: 'Basal temp',
      /* Stored with the degree sign, as the modal writes it. */
      format: (celsius) => (Math.round(celsius * 100) / 100) + '°C'
    },
    notes: {
      field: 'notes', reward: 'NOTES', pays: 500, label: 'Notes',
      /* The best-paid field on the tracker, and rightly: it is the
         only one in her own words, and the only one that is still
         worth reading a year later. */
      maxLength: 4000
    }
  };

  /* ── THE DAY-COUNT BONUSES ─────────────────────────────────────
     Three of the five carry a running counter and pay at 7, 15 and
     30. Flow and symptoms do not — they were never given one.

     A caution for anyone reading this later: `counter` is a plain
     tally of days logged, incremented once per day and wrapped back
     to 1 past 30. It is NOT a consecutive-day streak — skipping a
     week and logging again still advances it. The pill's streak was
     rebuilt to be derived from the records for exactly that reason;
     these were not. It is mirrored here as it is, rather than
     quietly corrected, because changing what LifeHub pays is Jen's
     decision and not a side effect of teaching Poppy to log a mood.
     ──────────────────────────────────────────────────────────── */
  const COUNTERS = {
    mood:      { counter: 'moodStreak',      category: 'MOOD',
                 bonus: { 7: 525, 15: 1500, 30: 3750 } },
    activity:  { counter: 'activityStreak',  category: 'ACTIVITY',
                 bonus: { 7: 420, 15: 1200, 30: 3000 } },
    discharge: { counter: 'dischargeStreak', category: 'DISCHARGE',
                 bonus: { 7: 420, 15: 1200, 30: 3000 } },
    temp:      { counter: 'tempStreak',      category: 'TEMP',
                 bonus: { 7: 420, 15: 1200, 30: 3000 } }
  };

  /* Past 30 the tracker wraps to 1 rather than carrying on. */
  function nextCount(current) {
    const n = (Number(current) || 0) + 1;
    return n > 30 ? 1 : n;
  }

  /* What a save of the symptoms list is worth, given what this day has
     already been paid for.

     `alreadyPaid`  the day's paidField list — symptoms that have paid
     `nowLogged`    the full list after this save

     Returns what is newly payable and what it comes to. A symptom that
     has paid once never pays again, so the same list saved twice is
     worth nothing, and removing a symptom and re-adding it is worth
     nothing either. */
  function settleSymptoms(alreadyPaid, nowLogged) {
    const f = FIELDS.symptoms;
    const paid = (alreadyPaid || []).slice();
    const list = (nowLogged || []).filter(Boolean);

    const fresh = [];
    list.forEach(s => {
      if (paid.indexOf(s) === -1 && fresh.indexOf(s) === -1) fresh.push(s);
    });

    let amount = 0, count = paid.length, capped = false;
    const charged = [];

    fresh.forEach(s => {
      if (count === 0) { amount += f.pays; charged.push(s); }
      else if (count - 1 < f.maxExtras) { amount += f.paysEach; charged.push(s); }
      else { capped = true; return; }
      count++;
    });

    return {
      amount,
      /* Everything now on record as paid — including the ones that hit
         the cap, so they cannot come back round for another go. */
      paidFor: paid.concat(fresh),
      charged,
      capped
    };
  }

  function bonusFor(field, count) {
    const c = COUNTERS[String(field || '').toLowerCase()];
    if (!c) return null;
    const amount = c.bonus[count];
    if (!amount) return null;
    return { amount, label: c.category + ' Streak: ' + count + ' Days' };
  }

  /* ── MOOD CHECK-INS ────────────────────────────────────────────
     Mood is asked three times a day, so unlike every other field it
     needs to know WHEN within the day it was answered. One reading
     called "today" cannot tell you a morning was rough and an evening
     was fine, and that difference is most of what a mood record is
     for.

     So the day holds `moodSlots` — { morning: [...], afternoon: [...],
     evening: [...] } — and `mood` stays as the flattened union of
     them, because the calendar, the statistics and the journal chips
     all read that and should keep working untouched.

     The hours are LifeHub's ordinary ones: the food protocol splits
     the day at 12 and 17 too. They are defined separately rather than
     imported because an eating window and a mood window have no
     reason to move together — they merely agree today.
     ──────────────────────────────────────────────────────────── */
  const MOOD_SLOTS = [
    { id: 'morning',   label: 'this morning',   ask: 'How\'s your morning?',
      from: 5,  to: 12 },
    { id: 'afternoon', label: 'this afternoon', ask: 'How\'s the afternoon going?',
      from: 12, to: 17 },
    { id: 'evening',   label: 'tonight',        ask: 'How was today, in the end?',
      from: 17, to: 24 }
  ];

  /* Which slot an hour falls in, or null in the small hours — 2am is
     not a morning check-in, it is the previous day refusing to end. */
  function moodSlotAt(hour) {
    const h = Number(hour);
    for (let i = 0; i < MOOD_SLOTS.length; i++) {
      if (h >= MOOD_SLOTS[i].from && h < MOOD_SLOTS[i].to) return MOOD_SLOTS[i];
    }
    return null;
  }

  function moodSlotById(id) {
    return MOOD_SLOTS.filter(s => s.id === id)[0] || null;
  }

  /* Which slots the day already has an answer for. */
  function moodSlotsDone(day) {
    const slots = (day && day.moodSlots) || {};
    return MOOD_SLOTS
      .filter(s => {
        const v = slots[s.id];
        return Array.isArray(v) ? v.length > 0 : !!v;
      })
      .map(s => s.id);
  }

  /* Everything logged across the day, in slot order, de-duplicated.
     This is what `mood` is kept as, so nothing that reads the old
     field has to learn about slots. */
  function moodUnion(slots) {
    const out = [];
    MOOD_SLOTS.forEach(s => {
      const v = (slots || {})[s.id];
      const list = Array.isArray(v) ? v : (v ? [v] : []);
      list.forEach(m => { if (m && out.indexOf(m) === -1) out.push(m); });
    });
    return out;
  }

  /* What a mood save is worth, given which check-ins have already
     paid today. Same principle as settleSymptoms: the money attaches
     to the thing, so a slot cannot pay twice however many times she
     reopens it, and there is no way to farm it — there are only ever
     three slots in a day.

     `alreadyPaid`  the day's moodSlotsPaidFor list
     `slotsDone`    every slot that now has an answer                */
  function settleMoodSlots(alreadyPaid, slotsDone) {
    const f = FIELDS.mood;
    const paid = (alreadyPaid || []).slice();

    const fresh = (slotsDone || []).filter(
      s => paid.indexOf(s) === -1 && moodSlotById(s));

    let amount = 0, count = paid.length;
    fresh.forEach(() => {
      amount += count === 0 ? f.pays : f.paysEach;
      count++;
    });

    return { amount: amount, paidFor: paid.concat(fresh), charged: fresh };
  }

  const KEYS = Object.keys(FIELDS);

  function spec(name) {
    return FIELDS[String(name || '').toLowerCase()] || null;
  }

  /* Loose text → canonical option, or null.

     Three passes, most certain first:
       1. it already IS an option
       2. it is a known alias
       3. an alias appears inside a longer sentence

     Pass 3 prefers the LONGEST alias matched, so "sore breasts" does
     not resolve to DRYNESS via a stray "dry", and "not okay" beats
     "okay". Without that, the longer, more specific option loses to
     whichever short word happened to be checked first. */
  function match(field, said) {
    const f = spec(field);
    if (!f) return null;

    const text = String(said == null ? '' : said)
      .toLowerCase().replace(/[.,!?;:]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) return null;

    const upper = text.toUpperCase();
    for (let i = 0; i < f.options.length; i++) {
      if (f.options[i] === upper) return f.options[i];
    }

    const hits = scan(f, text);
    return hits.length ? hits[0].option : null;
  }

  /* Every alias present in `text`, longest first, without overlaps.

     Longest-first is what stops "not okay" being read as OKAY, and
     "very heavy" as HEAVY. Consuming the span afterwards is what stops
     the shorter one then matching the same words over again.

     Used by match() (which takes the first) and by matchAll() (which
     takes them all), so a sentence like "everything is fine but my
     back aches" produces both, and the exclusivity rule below can then
     decide which survives. */
  function scan(f, text) {
    const pairs = [];
    f.options.forEach(option => {
      ((f.aliases && f.aliases[option]) || []).forEach(alias => {
        pairs.push({ option, alias });
      });
    });
    pairs.sort((a, b) => b.alias.length - a.alias.length);

    const taken = [];
    const overlaps = (from, to) =>
      taken.some(t => from < t.to && to > t.from);

    const hits = [];
    pairs.forEach(({ option, alias }) => {
      let at = text.indexOf(alias);
      while (at !== -1) {
        const end = at + alias.length;
        const before = at === 0 ? ' ' : text[at - 1];

        /* A trailing plural still counts: "back aches" is BACKACHE,
           "cramp" and "cramps" are the same thing. */
        let after = text[end] || ' ';
        let stop = end;
        if (after === 's' || after === 'y') {
          const nxt = text[end + 1] || ' ';
          if (!/[a-z]/.test(nxt)) { stop = end + 1; after = nxt; }
        }

        if (!/[a-z]/.test(before) && !/[a-z]/.test(after) &&
            !overlaps(at, stop)) {
          taken.push({ from: at, to: stop });
          hits.push({ option, at, length: alias.length });
          break;                     // one hit per alias is enough
        }
        at = text.indexOf(alias, at + 1);
      }
    });

    /* Longest first for match(); matchAll() re-sorts into reading
       order so a list comes back the way she said it. */
    hits.sort((a, b) => b.length - a.length);
    return hits;
  }

  /* Several at once, for the multi fields. Order is preserved and
     duplicates collapse, so "cramps and cramping" is one symptom.
     Returns what it placed AND what it could not, because the caller
     has to be able to ask about the leftovers rather than dropping
     them silently. */
  function matchAll(field, list) {
    const f = spec(field);
    if (!f) return { matched: [], unmatched: [] };

    /* Split on the joins people actually use, so that a chunk holding
       nothing recognisable can be reported back as such. Within a
       chunk, scan() finds everything — "everything is fine but my back
       aches" is one chunk with two readings in it. */
    const said = Array.isArray(list)
      ? list
      : String(list || '').split(/,|\band\b|\bplus\b|\+|;/);

    const matched = [], unmatched = [];

    said.forEach(raw => {
      const t = String(raw || '')
        .toLowerCase().replace(/[.!?;:]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!t) return;

      const hits = scan(f, t).sort((a, b) => a.at - b.at);

      if (!hits.length) {
        /* Medicine keeps what it cannot recognise: a drug missing from
           the record because the name was unfamiliar is worse than one
           recorded in her own spelling. Every other field refuses, so
           Poppy asks instead of guessing. */
        if (f.allowFreeText) {
          const kept = String(raw).trim();
          if (kept && matched.indexOf(kept) === -1) matched.push(kept);
        } else {
          unmatched.push(String(raw).trim());
        }
        return;
      }

      hits.forEach(h => {
        if (matched.indexOf(h.option) === -1) matched.push(h.option);
      });
    });

    return { matched, unmatched: exclusive(field, unmatched, matched) };
  }

  /* Some options contradict the rest of the list. "Everything is fine,
     but my back aches" is not two symptoms — it is one, and the fine
     is a figure of speech. Keeping both would record a symptom-free
     day that also had symptoms on it.

     The specific complaint wins: she said the back ache on purpose,
     whereas "everything is fine" is usually just how a sentence
     starts. Returns the unmatched list unchanged; the dropping
     happens to `matched` in place. */
  function exclusive(field, unmatched, matched) {
    const f = spec(field);
    if (!f || !f.exclusive || matched.length < 2) return unmatched;

    const others = matched.filter(m => f.exclusive.indexOf(m) === -1);
    if (others.length) {
      /* Drop the exclusive ones, keep the real complaints. */
      matched.length = 0;
      others.forEach(o => matched.push(o));
    }
    return unmatched;
  }

  /* The same rule applied to a finished list, wherever it came from.
     A day can start as EVERYTHING IS FINE and then turn into cramps,
     and the merged list must not claim both — which is a different
     moment from the one exclusive() above handles, because the two
     halves arrive hours apart rather than in one sentence. */
  function resolveExclusive(field, list) {
    const f = spec(field);
    const out = (list || []).filter(Boolean);
    if (!f || !f.exclusive || out.length < 2) return out;

    const others = out.filter(v => f.exclusive.indexOf(v) === -1);
    return others.length ? others : out;
  }

  /* The flow scale Alexa speaks in. */
  function fromScale(n) {
    const s = FIELDS.flow.scale;
    return s[Math.round(Number(n))] || null;
  }

  /* For putting the choices in front of Poppy when she has to ask. */
  function optionsFor(field) {
    const f = spec(field);
    return f ? f.options.slice() : [];
  }

  /* Either kind of field, by name — so a caller that just needs to
     know what something is called and what it pays does not have to
     know which half it lives in. */
  function anyField(name) {
    const k = String(name || '').toLowerCase();
    return FIELDS[k] || OPEN_FIELDS[k] || null;
  }

  window.LIFEHUB_FLO_VOCAB = {
    FIELDS, KEYS, COUNTERS, OPEN_FIELDS, MOOD_SLOTS,
    ALL_KEYS: Object.keys(FIELDS).concat(Object.keys(OPEN_FIELDS)),
    spec, anyField, match, matchAll, fromScale, optionsFor,
    nextCount, bonusFor, settleSymptoms, settleMoodSlots, resolveExclusive,
    moodSlotAt, moodSlotById, moodSlotsDone, moodUnion
  };
})();
