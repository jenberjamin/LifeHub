/* LifeHub — Poppy's read layer.
   ────────────────────────────────────────────────────────────────
   Poppy reads Firebase directly. No server, no localhost — so this
   works from the wallpaper over file://, and from your phone later.

   Three parts, in order down the file:

     1. PROJECTS   the Firebase config for each project she reads from
     2. REGISTRY   fetch target  →  which project, which path, which
                   operation. THIS is the part you add to.
     3. fetchHandler   runs before the API call, returns the lines
                   that get injected into the prompt.

   Every Firebase project is a NAMED app, so credentials never
   collide. Add as many as you like — the only rule is that each
   name is used once.

   Load AFTER the firebase compat scripts and BEFORE
   JS/LifeHub-poppy.js.
*/

(function () {

  /* ══════════════════════════════════════════════════════
     1. PROJECTS — one entry per Firebase project
     ══════════════════════════════════════════════════════
     Copied from that project's own config. Add the other 17
     here as you wire them up; nothing else needs to change. */

  const PROJECTS = {

    scribble: {
      apiKey:            "AIzaSyDNJnwrYVsfkiEwG_mvE-eJLaGgpso62tE",
      authDomain:        "lifehub---scribble.firebaseapp.com",
      projectId:         "lifehub---scribble",
      storageBucket:     "lifehub---scribble.firebasestorage.app",
      messagingSenderId: "806581871178",
      appId:             "1:806581871178:web:7ed5d73f3b1d619eccbcb3"
    },

    /* The Fitness Centre. Firestore, and unlike every other tracker the
       whole hub lives in ONE document — LifeHub_Backups/Jen_Data — with
       measurements, gallery, templates and the exercise library packed
       inside it as JSON STRINGS (Firestore rejects nested arrays, and a
       set is one). Every fitness read below parses what it needs out of
       that single document. */
    fitness: {
      apiKey:            "AIzaSyAOgtrNsZFu0LaKW7uzHc61kBCNcBc2XSE",
      authDomain:        "fitness-centre-aabaa.firebaseapp.com",
      projectId:         "fitness-centre-aabaa",
      storageBucket:     "fitness-centre-aabaa.firebasestorage.app",
      messagingSenderId: "706584906698",
      appId:             "1:706584906698:web:0469958c2564db64775d33"
    },

    /* PassHub's vault. Realtime Database, so it carries a databaseURL
       and is only reached through rtdbFor().

       There is no registry entry below that reads it, and that is
       deliberate: the registry feeds Poppy's context, and nothing
       from this project may ever reach the model. Only
       PoppyEngine-passhub.js touches it, and only to paint onto the
       screen — see the header of that file. */
    passhub: {
      apiKey:            "AIzaSyD4AwI1GwDvtx8y6yx6We-oSzV92GGCEvE",
      authDomain:        "access-vault-a3d09.firebaseapp.com",
      databaseURL:       "https://access-vault-a3d09-default-rtdb.asia-southeast1.firebasedatabase.app",
      projectId:         "access-vault-a3d09",
      storageBucket:     "access-vault-a3d09.firebasestorage.app",
      messagingSenderId: "43855013406",
      appId:             "1:43855013406:web:6a954853b8c14ec785b00f"
    },

    poppy: {
      apiKey:            "AIzaSyAx_5K2xAS27b7w5Hxpn_x-uYruW8VhQwU",
      authDomain:        "poppy-e510a.firebaseapp.com",
      projectId:         "poppy-e510a",
      storageBucket:     "poppy-e510a.firebasestorage.app",
      messagingSenderId: "257678903570",
      appId:             "1:257678903570:web:ebb7f7c2b15a7c17bb0bcb"
    },

    /* Every tracker — sleep, hydration, FLO, both upkeeps — and the
       prestige ledger. This one is the REALTIME DATABASE, not Firestore,
       so it carries a databaseURL and is only ever reached through
       rtdbFor(). A registry entry that reads it must say kind: "rtdb". */
    lifehub: {
      apiKey:            "AIzaSyABhqON4h0GHjFbZaDT1ysSprmpdczyC6I",
      authDomain:        "lifehub-cae1d.firebaseapp.com",
      databaseURL:       "https://lifehub-cae1d-default-rtdb.asia-southeast1.firebasedatabase.app",
      projectId:         "lifehub-cae1d",
      storageBucket:     "lifehub-cae1d.firebasestorage.app",
      messagingSenderId: "471522181748",
      appId:             "1:471522181748:web:6861392a45fbbbec8dc721"
    }

    // passhub: { ... },

  };


  /* ══════════════════════════════════════════════════════
     2. REGISTRY — fetch target → where and how to read it
     ══════════════════════════════════════════════════════

     The key is exactly what you type into Fetch Targets in the
     PoppyEngine editor.

     project   which entry in PROJECTS above
     path      Firestore collection path
     op        "count" | "list" | "doc" | "buckets" | "surface"
     exclude   field names that disqualify a document when truthy
     field     which field to read (list op)
     label     how it appears in the prompt

     ── The operations ────────────────────────────────────
     count   how many documents, after exclusions
     list    the value of `field` from each document
     doc     one document, only the fields named in `fields`
  */

  const REGISTRY = {

    /* ── FITNESS CENTRE ───────────────────────────────────
       All seven read the same single document and each answers one
       question in a few lines. Put only the one she asked for on an
       entry — they are cheap individually but they are not free, and
       six of them on one message is six times the prompt. */

    "fitness/standing": {
      project: "fitness", op: "fitness.standing",
      label: "Fitness standing"
    },

    "fitness/next": {
      project: "fitness", op: "fitness.next",
      label: "Next workout"
    },

    "fitness/recent": {
      project: "fitness", op: "fitness.recent", limit: 6,
      label: "Recent workouts"
    },

    "fitness/measurements": {
      project: "fitness", op: "fitness.measurements",
      label: "Measurements"
    },

    "fitness/gallery": {
      project: "fitness", op: "fitness.gallery", limit: 4,
      label: "Progress gallery"
    },

    "fitness/muscles": {
      project: "fitness", op: "fitness.muscles",
      label: "Muscle levels"
    },

    "fitness/weekly": {
      project: "fitness", op: "fitness.weekly",
      label: "This week in the gym"
    },

    "scribble/projects.count": {
      project: "scribble",
      path:    "projects",
      op:      "count",
      exclude: ["deleted", "archived"],
      label:   "Scribble projects"
    },

    "scribble/projects.list": {
      project: "scribble",
      path:    "projects",
      op:      "list",
      field:   "name",
      exclude: ["deleted", "archived"],
      limit:   40,
      label:   "Scribble project names"
    },

    "scribble/projects.buckets": {
      project: "scribble",
      path:    "projects",
      op:      "buckets",
      label:   "Scribble projects"
    },

    /* When things happened. A single collection read — no subcollection
       scan — so this is cheap enough to sit on an inquiry entry, unlike
       stats. */
    "scribble/projects.dates": {
      project: "scribble",
      path:    "projects",
      op:      "dates",
      label:   "Scribble project dates"
    },

    /* What is actually inside each project, and what points into it.
       Expensive — it reads every subcollection of every project — so put
       this ONLY on entries that have to tell Jen what she's about to lose.
       Not on pin, not on rename. */
    "scribble/projects.stats": {
      project: "scribble",
      path:    "projects",
      op:      "stats",
      label:   "Scribble project contents"
    },

    /* ── WHICH DEVICES HAVE OPENED SCRIBBLE ───────────────
       Added 2026-09-18. One small collection, one read — a row per
       device, not per visit, so this stays cheap however long the
       register gets.

       ── WHAT IT CAN AND CANNOT ANSWER ─────────────────────
       js/scribble-devices.js keeps firstSeen and lastSeen and
       overwrites lastSeen on each visit (throttled to one write per
       ten minutes). There is no per-visit record anywhere, so:

         which devices, signed in or out, first seen, last seen
           → answerable, and exactly.
         "every time the tablet opened Scribble"
           → NOT answerable. Nothing stores it.

       The entry that uses this says so out loud rather than letting
       Poppy improvise a history out of two dates. */
    "scribble/devices": {
      project: "scribble",
      path:    "scribble-devices",
      op:      "devices",
      label:   "Scribble devices"
    },

    /* ── THE GATE'S OWN HISTORY ────────────────────────────
       Added 2026-09-18. Every unlock, every failed attempt, every
       reroll and every lock, newest first.

       Bounded by orderBy + readLimit because this collection only
       ever grows. 300 rows is roughly a season of ordinary use and
       is read in one trip.

       ── WHAT IT CANNOT SAY, AND WHY ────────────────────────
       Two silences are deliberate and one is a gap:

         · what was TYPED at a failed attempt — never recorded, by
           design. js/scribble-access-log.js: "A log you'd have to
           keep secret is not much of a log."
         · name vs passcode — the gate checks both in one call, so
           a wrong either way is one identity-failed. Identity can
           be told from question; name cannot be told from passcode.
         · the gate merely being OPENED — not recorded at all, so an
           attempt abandoned without typing leaves no trace.

       And one join that does not exist: a row carries a user-agent
       string, not a device id, so this cannot be tied to the device
       register. Two machines with the same browser and OS read as
       one. Fixing that is one field in record(). */
    "scribble/access": {
      project:   "scribble",
      path:      "scribble-access-log",
      op:        "access",
      orderBy:   "timestamp",
      readLimit: 300,
      label:     "Scribble access log"
    },

    /* Where Jen is looking right now. Put this on EVERY command entry
       so she never has to name the app she's already staring at. */
    "poppy/surface": {
      project: "poppy",
      path:    "surface",
      op:      "surface",
      staleMinutes: 90
    },

    /* ── SLEEP ─────────────────────────────────────────────────────
       The Realtime Database, keyed by the Manila calendar date Jen
       WOKE UP on. All three read the same node and differ only in what
       they say about it, so put on an entry only the one that answers
       the question being asked.

       recent    the nights themselves — times, hours, quality, factors
       summary   the shape of them — average, debt, streak, patterns
       today     whether last night is already logged, and what's in
                 the form if it isn't. Every WRITE entry needs this:
                 the tracker seals a date once, so a log Poppy sends
                 for a night already recorded is refused, and knowing
                 that BEFORE she speaks is the difference between
                 "already got that one" and a failed action. */

    "sleep/recent": {
      project: "lifehub",
      kind:    "rtdb",
      path:    "sleep_logs",
      op:      "sleep.recent",
      limit:   14,
      label:   "Sleep — recent nights"
    },

    "sleep/summary": {
      project: "lifehub",
      kind:    "rtdb",
      path:    "sleep_logs",
      op:      "sleep.summary",
      /* Two weeks of nights is enough to see a pattern and few enough
         that a bad week still shows through instead of being averaged
         away by a good month. */
      limit:   30,
      label:   "Sleep"
    },

    "sleep/today": {
      project: "lifehub",
      kind:    "rtdb",
      path:    "sleep_logs",
      op:      "sleep.today",
      limit:   7,
      label:   "Sleep — today"
    },

    /* ── PRESTIGE ──────────────────────────────────────────────────
       The currency every tracker pays into. Two reads, because the
       questions are different sizes:

       standing   what she has, what she's earned, what tier that is,
                  and how far the next one is. Cheap enough to hang on
                  anything that mentions points.
       ledger     the actual rows — what paid, when, from where. For
                  "where did that come from" and "what did I earn
                  today", which standing alone can't answer. */

    "prestige/standing": {
      project: "lifehub",
      kind:    "rtdb",
      op:      "prestige.standing",
      label:   "Prestige"
    },

    "prestige/ledger": {
      project: "lifehub",
      kind:    "rtdb",
      op:      "prestige.ledger",
      limit:   15,
      label:   "Prestige — recent activity"
    },

    /* ── HYDRATION ─────────────────────────────────────────────────
       today     where she is against the goal right now, what's left,
                 what she's drunk and when, and whether the drought
                 fine is in play. Every hydration entry wants this —
                 it is also what stops Poppy logging into a day she
                 has already finished without saying so.
       history   the last fortnight of days, for patterns. */

    "hydration/today": {
      project: "lifehub",
      kind:    "rtdb",
      path:    "hydration_logs",
      op:      "hydration.today",
      /* Enough days back for the streak to be counted honestly. */
      limit:   40,
      label:   "Hydration — today"
    },

    /* ── FOOD ──────────────────────────────────────────────────────
       catalogue   what is already on her food list, so Poppy reuses an
                   item rather than inventing a second "Chicken Adobo"
                   with different numbers. Every logging entry needs it.
       today       what she has eaten today and where that leaves the
                   day's macros. */

    "food/catalogue": {
      project: "lifehub",
      kind:    "rtdb",
      path:    "foodList",
      op:      "food.catalogue",
      label:   "Food list"
    },

    "food/today": {
      project: "lifehub",
      kind:    "rtdb",
      path:    "dailyLogs",
      op:      "food.today",
      label:   "Food — today"
    },

    "hydration/history": {
      project: "lifehub",
      kind:    "rtdb",
      path:    "hydration_logs",
      op:      "hydration.history",
      limit:   14,
      label:   "Hydration — recent days"
    },

    /* ── FLO ───────────────────────────────────────────────────────
       Both of these read alexa_flo_state — the cheat sheet the FLO
       tracker publishes, which Alexa has been reading for months.
       Poppy reads it too rather than re-deriving anything: the cycle
       maths is genuinely subtle (an irregular cycle, ovulation only
       ever confirmed after the fact) and a second implementation
       would be a second set of answers.

       Which means both go stale if the tracker has not been opened.
       Every line below is stamped with when it was last written, so
       Poppy can say "as of Tuesday" rather than stating an old number
       as though it were now.

       pill    the tablet: which one today is, whether it is logged,
               how this pack has actually gone. Every pill entry wants
               this — it is also what stops Poppy logging a tablet
               that is already logged.
       cycle   the phase, her own cycle lengths, and what is predicted
               versus what was observed. */

    "flo/pill": {
      project: "lifehub",
      kind:    "rtdb",
      op:      "flo.pill",
      label:   "Althea pill"
    },

    "flo/cycle": {
      project: "lifehub",
      kind:    "rtdb",
      op:      "flo.cycle",
      label:   "Cycle"
    },

    /* today   what is already on today's FLO day record, and what each
               field has already been paid. Unlike the two above this
               reads the day itself rather than the published cheat
               sheet, so it is never stale — which matters, because it
               is what stops Poppy logging a mood that is already down
               and telling Jen she earned prestige she did not. */
    "flo/today": {
      project: "lifehub",
      kind:    "rtdb",
      path:    "flo_tracker",
      op:      "flo.today",
      label:   "FLO — today"
    }

  };


  /* ══════════════════════════════════════════════════════
     3. MACHINERY — you shouldn't need to touch below here
     ══════════════════════════════════════════════════════ */

  const apps = {};

  /* Name → document, filled by the buckets read below. A stable object
     rather than a fresh one each time, so anything holding a reference
     to it keeps seeing current data. */
  const index = {};

  /* Named apps. Reusing an existing one matters because this file
     may load on a page that already initialised the same project. */
  function appFor(name) {
    const cfg = PROJECTS[name];
    if (!cfg) throw new Error('No Firebase config named "' + name + '"');
    if (!window.firebase || !firebase.initializeApp) {
      throw new Error("Firebase compat scripts aren't loaded.");
    }

    try {
      return firebase.app(name);
    } catch (err) {
      return firebase.initializeApp(cfg, name);
    }
  }

  function dbFor(name) {
    if (apps[name]) return apps[name];
    apps[name] = appFor(name).firestore();
    return apps[name];
  }

  /* The trackers are on the Realtime Database, which is a different SDK
     from Firestore and a different script tag. A page that loads Poppy
     but not firebase-database-compat.js can still read Scribble — it
     just can't read sleep, and this is where it finds that out. */
  const rtdbs = {};

  function rtdbFor(name) {
    if (rtdbs[name]) return rtdbs[name];
    if (!window.firebase || !firebase.database) {
      throw new Error("firebase-database-compat.js isn't loaded on this page.");
    }
    rtdbs[name] = firebase.database(appFor(name));
    return rtdbs[name];
  }

  /* Scribble soft-deletes: documents stay in the collection with
     deleted / archived flags. A Firestore where() can't filter them,
     because documents created before the flag existed don't carry
     the field at all and get skipped by the query. So the filtering
     happens here, exactly as the Scribble UI does it. */
  function keep(data, exclude) {
    if (!exclude || !exclude.length) return true;
    return !exclude.some(f => data && data[f]);
  }

  /* ══════════════════════════════════════════════════════
     SLEEP — the Realtime Database reads
     ══════════════════════════════════════════════════════
     Manila dates, the same way tracker-sleep.js and the nudges panel
     do them. Poppy runs on a laptop whose clock may be anything; the
     log keys are Philippine calendar dates, and a mismatch here would
     have her say last night is unlogged while it sits in the database
     under tomorrow's key. */

  const PH_TZ = "Asia/Manila";
  const PH_DATE = new Intl.DateTimeFormat("en-CA", {
    timeZone: PH_TZ, year: "numeric", month: "2-digit", day: "2-digit"
  });

  const phToday = () => PH_DATE.format(new Date());

  /* % 24 because en-US with hour12:false reports midnight as "24".
     This one ends up in a sentence Poppy reads out, so "24:00" would
     be a small oddity in her mouth rather than an invisible one. */
  const phHour = () => parseInt(new Date().toLocaleString("en-US", {
    timeZone: PH_TZ, hour12: false, hour: "2-digit"
  }), 10) % 24;

  /* Pure counting on the date parts — parsing a key into a local Date
     is what lets a timezone shift the answer by one. */
  function shiftKey(key, days) {
    const [y, m, d] = String(key).split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d) + days * 86400000);
    return t.getUTCFullYear() + "-" +
           String(t.getUTCMonth() + 1).padStart(2, "0") + "-" +
           String(t.getUTCDate()).padStart(2, "0");
  }

  function daysBetween(fromKey, toKey) {
    const p = k => {
      const [y, m, d] = String(k).split("-").map(Number);
      return Date.UTC(y, m - 1, d);
    };
    return Math.round((p(toKey) - p(fromKey)) / 86400000);
  }

  const SLEEP_GOAL_HOURS = 8;

  /* The node is keyed by date, so limitToLast on the key is already
     "the most recent N nights" — no client-side sort of the whole
     history, and no reading years of it to answer "how did I sleep". */
  async function readSleepLogs(spec) {
    const snap = await rtdbFor(spec.project)
      .ref(spec.path)
      .orderByKey()
      .limitToLast(spec.limit || 14)
      .once("value");

    /* The KEY is the date, not the `date` field inside the document.
       They normally agree, but the key is what the tracker seals on —
       so it's the one that decides which night a row is. */
    const val = snap.val() || {};
    return Object.keys(val)
      .map(k => Object.assign({}, val[k], { date: k }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  const hoursOf = r => Number(r && r.durationHrsVal) || 0;

  function sleepLine(r) {
    const bits = [];
    if (r.bedtime || r.waketime) {
      bits.push((r.bedtime || "?") + "–" + (r.waketime || "?"));
    }
    bits.push(hoursOf(r) ? hoursOf(r).toFixed(1) + "h" : "no duration");
    if (r.quality) bits.push("quality " + r.quality + "/10");
    if (r.feeling) bits.push(String(r.feeling).toLowerCase());
    if (r.factors && r.factors.length) bits.push("factors: " + r.factors.join(", "));
    return "  " + r.date + " — " + bits.join(", ");
  }

  /* How many nights back from `from` are logged without a gap. The
     tracker counts the same way when it pays the streak bonus, so a
     number Poppy says out loud matches the one the tracker banks. */
  function streakBack(rows, from) {
    const have = new Set(rows.map(r => r.date));
    let n = 0, k = from;
    while (have.has(k) && n < 400) { n++; k = shiftKey(k, -1); }
    return n;
  }

  async function readSleep(spec) {
    const rows = await readSleepLogs(spec);
    const today = phToday();
    const lastNight = shiftKey(today, -1);

    if (spec.op === "sleep.today") {
      const logged = rows.find(r => r.date === today);
      const before = rows.find(r => r.date === lastNight);

      const lines = [];

      /* ── The bedtime marker ──────────────────────────────────────
         Set by "I'm going to sleep" — from Poppy or from Alexa, they
         share the field. It is the difference between a night in
         progress and a night that was never started, and Poppy can't
         tell those apart from the logs alone: both look like nothing
         on record for today.

         Sixteen hours matches SLEEP_MARKER_MAX_AGE_MS in the Alexa
         skill and markerFresh() in PoppyEngine-sleep.js. All three
         have to agree or she'll offer to close out a night the write
         layer will then refuse. */
      const marker = Number(
        (await rtdbFor(spec.project).ref("alexa_memory/last_sleep_start")
           .once("value")).val()
      ) || null;

      if (marker) {
        const ageH = (Date.now() - marker) / 3600000;
        const at = new Date(marker).toLocaleTimeString("en-GB", {
          timeZone: PH_TZ, hourCycle: "h23", hour: "2-digit", minute: "2-digit"
        });

        /* A stale marker carries its DATE, not just a clock time and an
           hour count. "23:14 (744 hours ago)" is a month, and a month
           said that way gets read back to Jen as her last LOG being from
           last month — which it is not. The marker is a goodnight that
           was never closed out; the logs are three lines below and they
           are the ones that say when she last slept. */
        const on = PH_DATE.format(new Date(marker));

        lines.push(ageH > 0 && ageH < 16
          ? "Jen marked her bedtime at " + at + ", " + ageH.toFixed(1) +
            " hours ago, and has not said she's woken up yet. If she says " +
            "she's up, that marker is the bedtime — no need to ask for one."
          : "There is an OLD bedtime marker left over from " + on + " at " + at +
            " (" + Math.round(ageH) + " hours ago). This is a stale goodnight " +
            "that was never closed out — it is NOT a sleep log, and it says " +
            "nothing about when Jen last logged a night. Do not quote its age " +
            "as her last log; the logged dates below are the record. It is too " +
            "stale to measure a night from, so ask her for a bedtime.");
      } else {
        lines.push("No bedtime marker is set — she hasn't told anyone she's going to bed.");
      }
      lines.push(logged
        ? "Tonight's log (" + today + ") is ALREADY SAVED and sealed — " +
          "it cannot be written again, only amended or deleted: " +
          sleepLine(logged).trim()
        : "No log saved yet for " + today + " (the night Jen just woke from). " +
          "It is " + String(phHour()).padStart(2, "0") + ":00 in Manila.");

      lines.push(before
        ? "The night before (" + lastNight + ") is logged: " + sleepLine(before).trim()
        : "The night before (" + lastNight + ") was never logged.");

      /* Which dates are taken, so a log for "Tuesday" isn't attempted
         against a sealed one. */
      const recent = rows.slice(-7).map(r => r.date);
      lines.push("Dates already sealed this week: " +
                 (recent.length ? recent.join(", ") : "none"));

      return spec.label + ":\n" + lines.map(l => "  " + l).join("\n");
    }

    if (spec.op === "sleep.recent") {
      if (!rows.length) return spec.label + ": nothing logged yet";
      return spec.label + " (newest last, dated by the morning she woke):\n" +
             rows.map(sleepLine).join("\n");
    }

    /* ── summary ───────────────────────────────────────────────────
       The numbers she'd otherwise have to open the tracker to see,
       plus the two things a chart can't say: what the bad nights have
       in common, and whether the trend is going the right way. */
    if (spec.op === "sleep.summary") {
      if (!rows.length) return spec.label + ": nothing logged yet";

      const last7 = rows.slice(-7);
      const slept = last7.filter(r => hoursOf(r) > 0);

      const total = slept.reduce((s, r) => s + hoursOf(r), 0);
      const avg = slept.length ? total / slept.length : 0;

      /* The tracker's own debt: measured against the nights actually
         logged, not against seven. A week with two missing logs is a
         gap in the record, not eleven hours of debt. */
      const debt = (last7.length * SLEEP_GOAL_HOURS) - total;

      const quality = last7.filter(r => Number(r.quality));
      const avgQ = quality.length
        ? quality.reduce((s, r) => s + Number(r.quality), 0) / quality.length
        : null;

      /* Which factors show up on the short nights specifically —
         a factor on every night explains nothing. */
      const short = rows.filter(r => hoursOf(r) > 0 && hoursOf(r) < 6);
      const tally = {};
      short.forEach(r => (r.factors || []).forEach(f => { tally[f] = (tally[f] || 0) + 1; }));
      const blamed = Object.keys(tally)
        .sort((a, b) => tally[b] - tally[a])
        .slice(0, 3)
        .map(f => f + " (" + tally[f] + " of " + short.length + " short nights)");

      const bedtimes = last7.map(r => r.bedtime).filter(Boolean);
      const streak = streakBack(rows, rows.some(r => r.date === phToday())
        ? phToday() : shiftKey(phToday(), -1));

      const newest = rows[rows.length - 1];
      const gap = daysBetween(newest.date, phToday());

      const lines = [
        "logged nights on record (last " + (spec.limit || 30) + " days): " + rows.length,
        "last 7 days — average " + (avg ? avg.toFixed(1) + "h" : "no durations") +
          " across " + slept.length + " night(s), against an " + SLEEP_GOAL_HOURS + "h goal",
        "sleep debt this week: " + (debt > 0
          ? debt.toFixed(1) + "h short"
          : Math.abs(debt).toFixed(1) + "h ahead"),
        avgQ ? "average quality: " + avgQ.toFixed(1) + "/10" : null,
        "current logging streak: " + streak + " night(s) in a row",
        "most recent log: " + newest.date +
          (gap === 0 ? " (today)" : gap === 1 ? " (yesterday)" : " (" + gap + " days ago)"),
        bedtimes.length ? "recent bedtimes: " + bedtimes.join(", ") : null,
        short.length
          ? "nights under 6h in this window: " + short.length +
            (blamed.length ? " — factors logged on them: " + blamed.join("; ")
                           : " — no factors were tagged on them")
          : "no nights under 6h in this window"
      ].filter(Boolean);

      /* ── The Sleep Protocol ──────────────────────────────────────
         Jen's own rewards and penalties. What has actually been EARNED
         comes from prestige_system/sleep_protocol, which settle()
         writes off the whole history — not from the window above, so
         a trophy won last year is still reported as won.

         Progress on the ones still outstanding is counted from this
         window only, and is labelled as such: "5 Days Rise" is
         cumulative over all time, and saying "3 of 5" off thirty days
         would be wrong in the one direction that matters. */
      const protocol = await readSleepProtocol(spec);
      if (protocol) lines.push(protocol);

      return spec.label + ":\n" + lines.map(l => "  " + l).join("\n");
    }

    return null;
  }

  /* Returns one indented block, or null if the rules module isn't on
     the page — Poppy runs on the homescreen, where it is, but this file
     is also loaded by pages that may not carry it. */
  async function readSleepProtocol(spec) {
    const P = window.LIFEHUB_SLEEP_PROTOCOL;
    if (!P) return null;

    const db = rtdbFor(spec.project);

    const [stateSnap, logSnap] = await Promise.all([
      db.ref(P.STATE_PATH).once("value"),
      db.ref("sleep_logs").orderByKey().limitToLast(spec.limit || 30).once("value")
    ]);

    const state = stateSnap.val() || {};

    /* Exemptions and Day 1 both change what the numbers MEAN, so they
       are read here rather than left out: a penalty that has been
       called off must not be reported as live, and progress counted
       from before Day 1 would be progress toward nothing. */
    const [exemptSnap, metaSnap] = await Promise.all([
      db.ref(P.EXEMPT_PATH).once("value"),
      db.ref(P.META_PATH).once("value")
    ]);
    const exemptions = exemptSnap.val() || {};
    const meta       = metaSnap.val() || {};

    const standing = P.evaluate(logSnap.val() || {}, exemptions, meta.startDate);

    const earned = P.AWARDS
      .filter(a => state[a.id])
      .map(a => a.name);

    /* Only the ones she is actually close to. A list of every trophy
       she has not won is a chore to read and says nothing. */
    const close = standing
      .filter(r => !r.penalty && !state[r.id] && r.progress > 0)
      .sort((a, b) => (b.progress / b.need) - (a.progress / a.need))
      .slice(0, 3)
      .map(r => r.name + " " + r.progress + "/" + r.need + " (" + r.term + ")");

    const live = standing
      .filter(r => r.penalty && r.met)
      .map(r => r.name);

    const out = ["sleep protocol — earned: " +
                 (earned.length ? earned.join(", ") : "none yet")];

    if (close.length) {
      out.push("  closest unearned (counted over this window only): " +
               close.join("; "));
    }
    if (live.length) {
      out.push("  penalty conditions currently met: " + live.join(", "));
    }

    if (meta.startDate) {
      out.push("  protocol counting from: " + meta.startDate + " (day 1)");
    }

    /* The recent ones only. A year of excused days is not context, and
       what she ever needs to know is whether the stretch she is asking
       about is already covered. */
    const excused = Object.keys(exemptions).sort().slice(-10);
    if (excused.length) {
      out.push("  nights excused from the missed-log penalty (most recent): " +
               excused.map(d => d + (exemptions[d] && exemptions[d].reason
                                       ? " (" + exemptions[d].reason + ")" : "")).join(", "));
    }

    return out.join("\n  ");
  }

  /* ══════════════════════════════════════════════════════
     HYDRATION — where she is against the goal
     ══════════════════════════════════════════════════════
     The goal, the rates and the unit maths are not here. They live in
     JS/lifehub-hydration-rules.js so the tracker page and Poppy can
     never disagree about how much a day needs. This turns them into
     sentences. */

  function hydrationRules() {
    const H = window.LIFEHUB_HYDRATION;
    if (!H) throw new Error("JS/lifehub-hydration-rules.js isn't loaded on this page.");
    return H;
  }

  async function readHydrationDays(spec) {
    const snap = await rtdbFor(spec.project)
      .ref(spec.path)
      .orderByKey()
      .limitToLast(spec.limit || 14)
      .once("value");
    return snap.val() || {};
  }

  const ozTxt = n => (Math.round((Number(n) || 0) * 10) / 10) + " oz";

  function dayLine(H, key, entry) {
    const total = (entry && entry.total) || 0;
    const goal = H.goalFor(entry && entry.workoutMode);
    const met = total >= goal;
    const b = (entry && entry.bonuses) || {};

    const extras = [];
    if (entry && entry.workoutMode) extras.push("workout day");
    if (b.completion) extras.push("goal met");
    if (b.streak7) extras.push("7-day bonus");
    if (b.streak30) extras.push("30-day bonus");
    if (entry && entry.droughtPenaltyApplied) extras.push("drought fine paid");

    return "  " + key + " — " + ozTxt(total) + " of " + goal + " oz" +
           " (" + Math.round((total / goal) * 100) + "%" + (met ? ", met" : "") + ")" +
           (extras.length ? " — " + extras.join(", ") : "");
  }

  async function readHydration(spec) {
    const H = hydrationRules();
    const days = await readHydrationDays(spec);
    const today = phToday();

    if (spec.op === "hydration.history") {
      const keys = Object.keys(days).sort();
      if (!keys.length) return spec.label + ": nothing logged yet";

      const met = keys.filter(k =>
        (days[k].total || 0) >= H.goalFor(days[k].workoutMode)).length;

      return spec.label + " (newest last):\n" +
             keys.map(k => dayLine(H, k, days[k])).join("\n") +
             "\n  — met the goal on " + met + " of the last " + keys.length + " day(s)";
    }

    /* ── today ─────────────────────────────────────────────────── */
    const entry = days[today] || null;
    const total = (entry && entry.total) || 0;
    const workout = !!(entry && entry.workoutMode);
    const goal = H.goalFor(workout);
    const left = Math.max(0, goal - total);
    const hour = phHour();

    const lines = [];

    lines.push("today is " + today + ", and it is " +
               String(hour).padStart(2, "0") + ":00 in Manila");
    lines.push("drunk so far: " + ozTxt(total) + " (" + H.glassPhrase(total) +
               ", " + H.inMl(total) + " ml)");
    lines.push("goal: " + goal + " oz" +
               (workout ? " (workout day — the usual " + H.BASE_GOAL +
                          " plus " + H.WORKOUT_BONUS + ")"
                        : " (not marked a workout day)"));

    lines.push(left > 0
      ? "still to drink: " + ozTxt(left) + " — about " + H.glassPhrase(left) +
        ", or " + H.inMl(left) + " ml"
      : "goal already met, by " + ozTxt(total - goal) + " over");

    /* The two things that pay, and the one that fines. Poppy should be
       able to say "one more glass and the thousand lands" without
       working the arithmetic out herself. */
    const b = (entry && entry.bonuses) || {};
    if (!b.completion && left > 0) {
      lines.push("meeting the goal pays " + H.RATES.COMPLETION +
                 " prestige, not yet earned today");
    } else if (b.completion) {
      lines.push("the " + H.RATES.COMPLETION + " completion bonus is already paid today");
    }

    if (H.isFirstSipHour(hour)) {
      lines.push("IT IS THE FIRST-SIP WINDOW (" + H.RATES.FIRST_SIP_FROM + "am–" +
                 H.RATES.FIRST_SIP_TO + "am): water logged right now earns " +
                 H.RATES.FIRST_SIP_MULT + "x, so " + H.RATES.PER_OZ * H.RATES.FIRST_SIP_MULT +
                 " prestige an ounce instead of " + H.RATES.PER_OZ);
    }

    if (total < H.RATES.DROUGHT_LIMIT) {
      lines.push("DROUGHT WARNING: under " + H.RATES.DROUGHT_LIMIT +
                 " oz by the end of the day is fined " + Math.abs(H.RATES.DROUGHT_FINE) +
                 " prestige tomorrow morning. She is " +
                 ozTxt(H.RATES.DROUGHT_LIMIT - total) + " away from being safe.");
    }

    /* Counted as though today were already met, then corrected — the
       honest answer to "what's my streak" differs depending on whether
       today is in the bag yet, and she means the second one. */
    const streakIfMet = H.computeStreak(days, today, true);
    const doneStreak = total >= goal ? streakIfMet : streakIfMet - 1;
    lines.push("goal-streak: " + Math.max(0, doneStreak) + " day(s)" +
               (total >= goal ? "" : ", and meeting today's goal would make it " + streakIfMet));

    const sips = (entry && entry.logs) || [];

    /* How to describe one entry. Entries written before drink types
       existed carry no `drink` and are water by definition — the
       tracker's buttons only ever added water. */
    const drinkName = s => {
      const d = s.drink && H.DRINKS[s.drink];
      return d ? d.label.toLowerCase() : "water";
    };

    const sipTxt = s => {
      const counted = s.effective != null && s.effective !== s.amount
        ? " → " + ozTxt(s.effective) + " counted" : "";
      return ozTxt(s.amount) + " " + drinkName(s) + counted + " at " + s.time +
             (s.type && s.type !== "Standard" ? " [" + s.type + "]" : "");
    };

    if (sips.length) {
      lines.push("logged today (oldest first): " + sips.map(sipTxt).join("; "));

      const last = sips[sips.length - 1];
      lines.push("the most recent entry — the one an undo would remove — is " +
                 ozTxt(last.amount) + " " + drinkName(last) + " at " + last.time);

      /* Water versus everything else. The goal doesn't care, but she
         might — and it is the honest answer to "am I actually drinking
         water or just coffee". */
      const waterOz = sips.filter(s => !s.drink || s.drink === "water")
                          .reduce((n, s) => n + (Number(s.amount) || 0), 0);
      const otherOz = sips.reduce((n, s) => n + (Number(s.amount) || 0), 0) - waterOz;
      if (otherOz > 0) {
        lines.push("of that, " + ozTxt(waterOz) + " was plain water and " +
                   ozTxt(otherOz) + " was something else");
      }
    } else {
      lines.push("nothing logged today yet, so there is nothing to undo");
    }

    /* What the drinks have already put on tonight's sleep log, so
       Poppy doesn't offer to tag something that is already tagged. */
    try {
      const night = H.sleepNightFor(today, hour);
      const pending = (await rtdbFor(spec.project)
        .ref("sleep_pending_factors/" + night).once("value")).val() || {};
      const tags = Object.keys(pending).filter(k => pending[k]);
      if (tags.length) {
        lines.push("already queued onto the sleep log for " + night + ": " +
                   tags.join(", ") + " — from what she drank, added automatically");
      }
    } catch (err) { /* a missing node is the normal case */ }

    return spec.label + ":\n" + lines.map(l => "  " + l).join("\n");
  }


  /* ══════════════════════════════════════════════════════
     FOOD — the list, and what she has eaten today
     ══════════════════════════════════════════════════════
     The targets and the macro reader come from
     JS/lifehub-food-rules.js, the same module the FoodHub pages use.
     Nothing about what a day should contain is decided here. */

  function foodRules() {
    const F = window.LIFEHUB_FOOD;
    if (!F) throw new Error("JS/lifehub-food-rules.js isn't loaded on this page.");
    return F;
  }

  async function readFood(spec) {
    const F = foodRules();
    const today = phToday();

    if (spec.op === "food.catalogue") {
      const raw = (await rtdbFor(spec.project).ref(spec.path).once("value")).val() || {};
      const ids = Object.keys(raw);
      if (!ids.length) {
        return spec.label + ": empty — nothing has been added yet, so anything " +
               "she eats will need a new entry.";
      }

      /* Grouped by category, because that is how the page shows it and
         how she thinks about a meal. Serving is included on every line:
         it is the unit the numbers belong to, and logging without it
         means multiplying by an unknown. */
      const byCat = {};
      ids.forEach(id => {
        const it = raw[id] || {};
        const macros = F.parseBlob(it.macros);
        const micros = F.parseBlob(it.micros);
        const cat = it.category || "UNCATEGORIZED";
        (byCat[cat] = byCat[cat] || []).push(
          "    " + (it.name || "Untitled") +
          " — per " + (it.serving || "?") + ": " +
          (macros.cal || 0) + " cal, " +
          (macros.prot || 0) + "p / " + (macros.carb || 0) + "c / " +
          (macros.fat || 0) + "f, " +
          F.sugarOf(macros, micros) + "g sugar" +
          (it.estimatedBy ? "  [estimated]" : ""));
      });

      const lines = Object.keys(byCat).sort().map(
        c => "  " + c + ":\n" + byCat[c].join("\n"));

      return spec.label + " (" + ids.length + " items — REUSE one of these " +
             "if it matches what she ate, rather than adding a near-duplicate):\n" +
             lines.join("\n");
    }

    if (spec.op === "food.today") {
      const day = (await rtdbFor(spec.project).ref(spec.path + "/" + today)
        .once("value")).val() || {};

      const rows = Object.keys(day)
        .filter(k => k !== "wageProcessed" && day[k] && day[k].foodName)
        .map(k => day[k]);

      const t = F.totalsFor(day);
      const g = F.DAILY_GOALS;
      const hour = phHour();

      /* Gaps, not just totals. "1,450 calories" needs arithmetic before
         it means anything; "750 short of green" is the answer to the
         question she actually asked. */
      const toGreen = Math.max(0, g.cal.semi - t.cal);
      const toGold  = Math.max(0, g.cal.ult  - t.cal);
      const toProt  = Math.max(0, g.prot.ult - t.prot);
      const sugarLeft = g.sugar.limit - t.sugar;

      const lines = [
        "it is " + String(hour).padStart(2, "0") + ":00 in Manila",

        "eaten today (" + today + "), " + rows.length + " item(s): " + (rows.length
          ? rows.map(r => (parseFloat(r.multiplier) || 1) + "x " + r.foodName +
                          " at " + (r.time || "?")).join("; ")
          : "nothing yet"),

        "calories: " + Math.round(t.cal) +
          (toGreen > 0
            ? " — " + Math.round(toGreen) + " short of GREEN (" + g.cal.semi +
              ") and " + Math.round(toGold) + " short of GOLD (" + g.cal.ult + ")"
            : toGold > 0
              ? " — GREEN is met; " + Math.round(toGold) + " more reaches GOLD (" +
                g.cal.ult + ", pays " + F.WAGE_RATES.GOLD.toLocaleString() + ")"
              : " — GOLD is met (" + g.cal.ult + "+). Nothing above this is penalised."),

        "protein: " + Math.round(t.prot) + "g" +
          (toProt > 0
            ? " — " + Math.round(toProt) + "g short of the " + g.prot.ult +
              "g bonus (+" + F.WAGE_RATES.PROTEIN_BONUS + ")"
            : " — the " + g.prot.ult + "g bonus is earned"),

        "carbs: " + Math.round(t.carb) + "g · fat: " + Math.round(t.fat) + "g",

        "sugar: " + Math.round(t.sugar) + "g of a " + g.sugar.limit + "g LIMIT" +
          (sugarLeft > 0
            ? " — " + Math.round(sugarLeft) + "g of headroom left (" +
              F.bandFor("sugar", t.sugar) + ")"
            : " — OVER by " + Math.round(-sugarLeft) + "g. The day's food prestige " +
              "is already halved; there is nothing left to protect, so do not " +
              "keep bringing it up."),

        /* Under 2,200 is an actual sanction, and it is the failure mode
           she is actually at risk of. Named plainly so it can be said
           before the day runs out rather than after. */
        (toGreen > 0
          ? "AT RISK: a day that ends under " + g.cal.semi + " kcal is sanctioned " +
            F.WAGE_RATES.RED.toLocaleString() + " prestige."
          : null)
      ].filter(Boolean);

      if (rows.length) {
        const last = rows[rows.length - 1];
        lines.push("the most recent entry — the one an undo would remove — is " +
                   (parseFloat(last.multiplier) || 1) + "x " + last.foodName);
      }

      return spec.label + ":\n" + lines.map(l => "  " + l).join("\n");
    }

    return null;
  }


  /* ══════════════════════════════════════════════════════
     PRESTIGE — what the points add up to
     ══════════════════════════════════════════════════════
     The rules are not here. Tiers, and the question of which rows
     count toward a rank, live in JS/lifehub-prestige-ledger.js so
     that Poppy and the prestige card can never disagree about what
     Jen's rank is. This only turns the answer into sentences. */

  function ledger() {
    const P = window.LIFEHUB_PRESTIGE;
    if (!P) throw new Error("JS/lifehub-prestige-ledger.js isn't loaded on this page.");
    return P;
  }

  const points = n => Math.round(Number(n) || 0).toLocaleString();

  /* Manila calendar date of a ledger row. The timestamps are server
     epoch milliseconds, and "today" has to mean the same day here as
     it does in every tracker. */
  function txDateKey(ts) {
    return PH_DATE.format(new Date(Number(ts) || 0));
  }

  function txLine(tx) {
    const when = new Date(Number(tx.timestamp) || 0).toLocaleString("en-GB", {
      timeZone: PH_TZ, day: "numeric", month: "short",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    });
    const amt = (Number(tx.amount) > 0 ? "+" : "") + points(tx.amount);
    return "  " + when + " — " + amt + "  " + (tx.description || "(no description)") +
           "  [" + (tx.source || "?") + "]" +
           (ledger().isCorrection(tx) && Number(tx.amount) < 0 ? " (correction)" : "");
  }

  async function readPrestige(spec) {
    const P = ledger();
    const state = await P.read(rtdbFor(spec.project));

    if (spec.op === "prestige.standing") {
      const t = state.tier;
      const today = phToday();

      /* What today has been worth so far. She asks this more than any
         other prestige question and it is not derivable from the
         balance, which carries every day ever. */
      const todayRows = state.transactions.filter(x => txDateKey(x.timestamp) === today);
      const todayNet = todayRows.reduce((s, x) => s + (Number(x.amount) || 0), 0);

      /* Which trackers are actually paying. A rank is the sum of
         habits, and naming them is what makes the number mean
         something to her. */
      const bySource = {};
      state.transactions.forEach(x => {
        const s = x.source || "Unknown";
        bySource[s] = (bySource[s] || 0) + (Number(x.amount) || 0);
      });
      const top = Object.keys(bySource)
        .sort((a, b) => bySource[b] - bySource[a])
        .slice(0, 4)
        .map(s => s + " " + (bySource[s] > 0 ? "+" : "") + points(bySource[s]));

      const lines = [
        "balance (spendable): " + points(state.balance),
        "lifetime prestige (this is what sets her rank): " + points(state.lifetime),
        "current tier: " + t.name,
        t.next
          ? "next tier: " + t.next + " at " + points(t.nextAt) +
            " — " + points(t.toNext) + " to go"
          : "she is at the highest tier; there is nothing above this one",
        "earned today (" + today + "): " + (todayNet > 0 ? "+" : "") + points(todayNet) +
          " across " + todayRows.length + " entr" + (todayRows.length === 1 ? "y" : "ies"),
        "ledger rows on record: " + state.transactions.length,
        top.length ? "lifetime by source: " + top.join(", ") : null
      ].filter(Boolean);

      return spec.label + ":\n" + lines.map(l => "  " + l).join("\n");
    }

    if (spec.op === "prestige.ledger") {
      const rows = state.transactions.slice(0, spec.limit || 15);
      if (!rows.length) return spec.label + ": nothing on the ledger yet";
      return spec.label + " (newest first):\n" + rows.map(txLine).join("\n");
    }

    return null;
  }

  /* ── FLO ─────────────────────────────────────────────────────────
     Both reads come off alexa_flo_state, which the FLO tracker
     publishes. Nothing here computes a cycle or a pack position —
     that would be a second answer to a question that already has one.
     ────────────────────────────────────────────────────────────── */

  /* How long ago the tracker last published. A cheat sheet is only
     as true as its last write, and saying an old number flatly is
     how Poppy ends up confidently wrong. */
  function freshness(lastUpdate) {
    const t = Number(lastUpdate);
    if (!t) return "never written — the FLO tracker has not synced";
    const mins = Math.round((Date.now() - t) / 60000);
    if (mins < 90) return "current (synced " + mins + "m ago)";
    const hrs = Math.round(mins / 60);
    if (hrs < 36) return "synced " + hrs + "h ago";
    return "STALE — last synced " + Math.round(hrs / 24) + " days ago; " +
           "say so rather than quoting these as today's numbers";
  }

  async function readFlo(spec) {
    /* Today's day record, read straight from the tracker's data rather
       than the published summary — this one must never be stale. */
    if (spec.op === "flo.today") {
      const key = phToday();
      const day = (await rtdbFor(spec.project)
        .ref("flo_tracker/" + key).once("value")).val() || {};

      const V = window.LIFEHUB_FLO_VOCAB;
      const rewards = day.rewards || {};
      const lines = [];

      (V ? V.ALL_KEYS : []).forEach(name => {
        const f = V.anyField(name);
        const have = day[f.field];

        /* Notes can be long. Say that one exists and roughly how much
           of it, rather than pasting a paragraph into every read. */
        if (name === 'notes') {
          const text = String(have == null ? '' : have).trim();
          lines.push("Notes: " + (text
            ? text.length + " characters written" +
              (text.length > 90 ? " — starts \"" + text.slice(0, 80).replace(/\s+/g, ' ') + "…\""
                                : " — \"" + text.replace(/\s+/g, ' ') + "\"")
            : "nothing written yet") +
            (rewards[f.reward] ? "  [already paid today]" : ""));
          return;
        }

        /* Mood is three check-ins, not one field, so say which are
           answered — "logged today" would hide an unanswered evening
           behind a cheerful morning. */
        if (name === 'mood' && V.MOOD_SLOTS) {
          const slots = day.moodSlots || {};
          const parts = V.MOOD_SLOTS.map(s => {
            const v = slots[s.id];
            const list = Array.isArray(v) ? v : (v ? [v] : []);
            return s.id + ": " + (list.length ? list.join(', ') : "—");
          });
          lines.push("Mood (3 check-ins) — " + parts.join("  ·  ") +
                     (rewards[f.reward] ? "   [already paid today]" : ""));
          return;
        }

        lines.push(f.label + ": " + (have ? have : "not logged yet") +
                   (rewards[f.reward] ? "  [already paid today]" : ""));
      });

      /* Symptoms is the one field paid per item, so the count of what
         has already paid is what decides whether a new one earns. */
      if (Array.isArray(day.symptomsPaidFor) && day.symptomsPaidFor.length) {
        const V2 = window.LIFEHUB_FLO_VOCAB;
        const cap = V2 ? V2.spec('symptoms').maxExtras + 1 : 6;
        lines.push("  (" + day.symptomsPaidFor.length + " of " + cap +
                   " symptoms have paid today)");
      }

      /* The pill sits on the same record and is asked about in the
         same breath, so it belongs in the same answer. */
      lines.push("Pill: " + (day.pill || "not logged yet") +
                 (day.pillTime ? " at " + day.pillTime : ""));

      if (day.isMenstrual) lines.push("today is marked as a period day");

      return spec.label + " (" + key + "):\n" +
             lines.map(l => "  " + l).join("\n") +
             "\n  NOTE: a field marked already paid can still be added to — " +
             "it just will not pay again today.";
    }

    const snap = await rtdbFor(spec.project).ref("alexa_flo_state").once("value");
    const d = snap.val();
    if (!d) {
      return spec.label + ": nothing published yet — the FLO tracker " +
             "has to be opened once before there is anything to read";
    }

    if (spec.op === "flo.pill") {
      const p = d.pill;
      if (!p) {
        return spec.label + ": the tracker has not published the pill yet " +
               "(it syncs when the FLO page is opened)";
      }
      if (!p.onPack) {
        return spec.label + ":\n  not on a pack right now\n" +
               "  data " + freshness(d.lastUpdate);
      }

      const lines = [];
      if (p.onBreak) {
        lines.push("break week — no tablet due today (day " +
                   (p.nextPackIn != null ? p.nextPackIn + " until the next pack" : "?") + ")");
        lines.push("a withdrawal bleed during the break is expected, not a period");
      } else {
        lines.push("tablet " + p.tabletNumber + " of " + p.activeDays +
                   " (pack " + p.packNumber + "), break starts in " + p.breakStartsIn + "d");
      }

      lines.push(p.doseTime
        ? "due at " + p.doseTime + " each day"
        : "no dose time set — she has not told the tracker what hour she takes it");

      lines.push("today: " + (window.LIFEHUB_PILL
        ? window.LIFEHUB_PILL.describe(p.todayStatus)
        : (p.todayStatus || "not logged")) +
        (p.todayTakenAt ? " at " + p.todayTakenAt : ""));

      lines.push("streak: " + p.streak + " day" + (p.streak === 1 ? "" : "s"));

      if (p.tabletsDue != null) {
        lines.push("this pack: " + p.tabletsTaken + " of " + p.tabletsDue +
                   " tablets logged" +
                   (p.tabletsSkipped ? ", " + p.tabletsSkipped + " skipped" : "") +
                   (p.tabletsUnlogged ? ", " + p.tabletsUnlogged + " never logged either way" : ""));
        if (p.consecutiveSkipped >= 2) {
          lines.push("*** " + p.consecutiveSkipped + " skipped in a row ending today — " +
                     "this is the one thing here worth raising with her unprompted");
        }
      }

      lines.push("data " + freshness(d.lastUpdate));
      return spec.label + ":\n" + lines.map(l => "  " + l).join("\n");
    }

    if (spec.op === "flo.cycle") {
      const lines = [];

      /* First, because it changes how everything below reads. */
      lines.push(d.periodActive
        ? "A PERIOD IS RUNNING RIGHT NOW (started " +
          (d.lastPeriodStart || "date unknown") + ") — she has not marked it ended"
        : "no period currently running" +
          (d.lastPeriodStart ? "; last one started " + d.lastPeriodStart : ""));

      lines.push("phase: " + (d.phase || "unknown") +
                 (d.phaseObserved
                   ? " (observed — read off what she actually logged)"
                   : " (ESTIMATED from cycle length, not observed)"));
      lines.push("cycle day: " + (d.day != null ? d.day : "unknown"));

      /* Her own numbers, never a textbook 28. */
      if (d.cyclesRecorded) {
        lines.push("her cycle length: median " + d.cycleLengthMedian + "d" +
                   (d.cycleLengthMin ? " (range " + d.cycleLengthMin +
                    "–" + d.cycleLengthMax + "d)" : "") +
                   " across " + d.cyclesRecorded + " recorded cycle" +
                   (d.cyclesRecorded === 1 ? "" : "s"));
      } else {
        lines.push("no complete cycles recorded yet — there is no personal " +
                   "baseline to speak from, so do not quote one");
      }

      if (d.daysToPeriod != null) {
        let when = "next period: about " + d.daysToPeriod + "d away";
        if (d.daysToPeriodEarliest != null && d.daysToPeriodLatest != null) {
          when += " (between " + d.daysToPeriodEarliest +
                  " and " + d.daysToPeriodLatest + "d)";
        }
        when += d.predictionConfident
          ? ""
          : " — LOW CONFIDENCE: few cycles or a wide spread, so hedge it";
        lines.push(when);
      }

      /* Ovulation is reported only when the temperatures actually
         showed it, which is always after the fact. Null is honest. */
      lines.push(d.ovulationConfirmedOn
        ? "ovulation confirmed on " + d.ovulationConfirmedOn +
          " (from a sustained temperature rise — this is hindsight, not a forecast)"
        : "ovulation NOT confirmed this cycle — never predict a date for it; " +
          "it is only ever known afterwards, from temperature");

      if (d.fertileMucusDays && d.fertileMucusDays.length) {
        lines.push("fertile-type mucus logged on: " + d.fertileMucusDays.join(", "));
      }

      /* A pack changes what the cycle even means. */
      if (d.pill && d.pill.onPack) {
        lines.push("SHE IS ON A HORMONAL PACK — a bleed during the break week " +
                   "is a withdrawal bleed on the pack's schedule, not her own " +
                   "cycle, and ovulation is normally suppressed. Do not read " +
                   "these phase numbers as her natural cycle.");
      }

      lines.push("data " + freshness(d.lastUpdate));
      return spec.label + ":\n" + lines.map(l => "  " + l).join("\n");
    }

    return null;
  }

  /* ══════════════════════════════════════════════════════
     FITNESS CENTRE
     ══════════════════════════════════════════════════════
     One document holds the entire hub, so every read here is the same
     three steps: fetch the vault once, parse the part it needs, answer
     in a handful of lines.

     The raw document is NEVER handed over. Templates alone can run to
     tens of kilobytes of sets, and dropping that into the prompt would
     crowd out everything else Poppy knows. */

  const FITNESS_DOC = "LifeHub_Backups/Jen_Data";
  const FITNESS_GRACE_CAP = 2;    // mirrors SYSTEM_CONFIG.graceCap in fitness-core.js

  /* One network read serves every fitness target in the same message —
     asking for streak, next workout and measurements at once would
     otherwise fetch the same document three times.

     The PROMISE is cached, not the result. fetchHandler runs its targets
     through Promise.all, so they all start before any of them finishes:
     caching the resolved document still let four targets fire four reads,
     because none of them had resolved yet when the others looked. Sharing
     the in-flight promise is what actually collapses them into one.

     A failed read drops the cache so the next message can try again
     rather than inheriting the rejection for fifteen seconds. */
  let _fitMemo = { at: 0, p: null };

  function fitnessVault(db) {
    if (_fitMemo.p && (Date.now() - _fitMemo.at) < 15000) return _fitMemo.p;

    const p = db.doc(FITNESS_DOC).get()
      .then(snap => (snap.exists ? (snap.data() || {}) : null))
      .catch(err => { _fitMemo = { at: 0, p: null }; throw err; });

    _fitMemo = { at: Date.now(), p: p };
    return p;
  }

  function fitList(raw) {
    if (Array.isArray(raw)) return raw.filter(Boolean);
    try { const v = JSON.parse(raw || "[]"); return Array.isArray(v) ? v.filter(Boolean) : []; }
    catch (e) { return []; }
  }

  /* Local calendar day. Timestamps in the vault are UTC ISO strings while
     workout dates are local "YYYY-MM-DD", and comparing them as text is
     the bug we just spent a session removing from the hub itself. */
  function fitDay(value) {
    if (!value) return "";
    const plain = /^(\d{4}-\d{2}-\d{2})$/.exec(String(value));
    if (plain) return plain[1];
    const d = new Date(value);
    if (isNaN(d.getTime())) return "";
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
           "-" + String(d.getDate()).padStart(2, "0");
  }

  function fitMidnight(ymd) {
    const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fitDay(ymd));
    return p ? new Date(+p[1], +p[2] - 1, +p[3]) : null;
  }

  function fitPretty(value) {
    const d = fitMidnight(value);
    return d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "unknown date";
  }

  /* "today" / "yesterday" / "5 days ago" — she asks in those terms, so
     answering in raw dates makes her do the arithmetic. */
  function fitAgo(value) {
    const d = fitMidnight(value);
    if (!d) return "unknown";
    const now = new Date();
    const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - d) / 86400000);
    if (days <= 0)  return "today";
    if (days === 1) return "yesterday";
    if (days < 14)  return days + " days ago";
    return fitPretty(value);
  }

  function fitMins(seconds) {
    const s = Math.max(0, Math.round(Number(seconds) || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? (h + "h " + m + "m") : (m + "m");
  }

  async function readFitness(spec, db) {
    const vault = await fitnessVault(db);
    if (!vault) return spec.label + ": no fitness vault yet — the hub hasn't synced.";

    const P         = vault.userProfile || {};
    const templates = fitList(vault.templates_backup);
    const measures  = fitList(vault.measurements_backup);
    const gallery   = fitList(vault.gallery_backup);
    const library   = fitList(vault.exercises_backup);
    const goals     = vault.goals || {};
    const L         = [];

    /* ── Streak, level, prestige, grace ────────────────── */
    if (spec.op === "fitness.standing") {
      L.push("Streak: " + (P.streak || 0) + " day" + ((P.streak === 1) ? "" : "s") +
             "  (best " + (P.bestStreak || 0) + ")");
      L.push("Level " + (P.fitnessLevel || 1) + " · " + (P.fitnessPoints || 0) + " FP · " +
             (P.prestigeCurrency || 0) + " prestige banked");
      L.push("Grace: " + (P.graceUsed || 0) + " of " + FITNESS_GRACE_CAP + " used this week");
      L.push("Last workout: " + (P.lastWorkout ? fitAgo(P.lastWorkout) : "none recorded"));
      if (P.height) L.push("Height on file: " + P.height + "cm");
    }

    /* ── What's planned ────────────────────────────────── */
    else if (spec.op === "fitness.next") {
      const today   = fitDay(new Date());
      const pending = templates.filter(t => t && !t.isCompleted && t.date);

      const describe = (t) => {
        const names = (Array.isArray(t.exercises) ? t.exercises : [])
          .map(e => e && e.name).filter(Boolean);
        const muscles = [...new Set((Array.isArray(t.exercises) ? t.exercises : []).flatMap(e => {
          if (e && e.details && Array.isArray(e.details.target)) return e.details.target;
          const lib = library.find(x => x && x.id == (e && e.dbId));
          return (lib && Array.isArray(lib.target)) ? lib.target : [];
        }))].slice(0, 4);
        return '"' + (t.name || "Untitled") + '" · ' + names.length +
               (names.length === 1 ? " exercise" : " exercises") +
               (muscles.length ? " · " + muscles.join(", ") : "");
      };

      const todays = pending.filter(t => fitDay(t.date) === today);
      if (todays.length) todays.forEach(t => L.push("TODAY — " + describe(t)));
      else L.push("Nothing scheduled for today.");

      const upcoming = pending.filter(t => fitDay(t.date) > today)
                              .sort((a, b) => fitDay(a.date) < fitDay(b.date) ? -1 : 1);
      if (upcoming.length) L.push("Next: " + fitPretty(upcoming[0].date) + " — " + describe(upcoming[0]));

      const overdue = pending.filter(t => fitDay(t.date) < today);
      if (overdue.length) L.push("Deferred / missed: " + overdue.length +
                                 " (oldest " + fitPretty(overdue.sort((a,b) => fitDay(a.date) < fitDay(b.date) ? -1 : 1)[0].date) + ")");
    }

    /* ── Finished sessions ─────────────────────────────── */
    else if (spec.op === "fitness.recent") {
      const done = templates.filter(t => t && t.isCompleted)
        .sort((a, b) => (fitMidnight(b.date) || 0) - (fitMidnight(a.date) || 0))
        .slice(0, Math.max(1, spec.limit || 6));

      if (!done.length) L.push("No completed workouts recorded.");
      done.forEach(t => {
        const s = t.summary;
        const bits = [fitPretty(t.date), (t.name || "Untitled")];
        if (s) {
          bits.push(s.totalMGP + " MGP", s.totalFP + " FP", s.prestige + " prestige");
          if (typeof s.exercisesCompleted === "number")
            bits.push(s.exercisesCompleted + "/" + s.exercisesPlanned + " done");
        }
        if (t.durationSeconds) bits.push(fitMins(t.durationSeconds));
        L.push(bits.join(" · "));
      });
      L.push("(" + templates.filter(t => t && t.isCompleted).length + " completed in total)");
    }

    /* ── Body measurements ─────────────────────────────── */
    else if (spec.op === "fitness.measurements") {
      if (!measures.length) L.push("No measurements logged yet.");
      else {
        const sorted = measures.slice().sort((a, b) =>
          (new Date(a.date).getTime() || 0) - (new Date(b.date).getTime() || 0));
        const last = sorted[sorted.length - 1];
        L.push("Last logged " + fitAgo(last.date) + " (" + fitPretty(last.date) + ") · " +
               sorted.length + " entries in total");

        /* Entries are sparse — a record stores only what was typed — so
           "current" means the most recent entry that carried each part. */
        const latest = {};
        sorted.forEach(m => {
          if (!m || !m.data) return;
          Object.keys(m.data).forEach(part => {
            const val = m.data[part];
            if (val !== "" && val !== null && val !== undefined) latest[part] = { v: val, on: m.date };
          });
        });

        const parts = Object.keys(latest).slice(0, 16);
        if (parts.length) {
          L.push(parts.map(p => {
            const unit = (p === "Weight") ? "kg" : "cm";
            const goal = goals[p] ? " (goal " + goals[p] + ")" : "";
            return p + " " + latest[p].v + unit + goal;
          }).join(" · "));
        }
        const stale = parts.filter(p => fitDay(latest[p].on) !== fitDay(last.date));
        if (stale.length) L.push("Carried from earlier entries: " + stale.slice(0, 8).join(", "));
      }
    }

    /* ── Progress photos ───────────────────────────────── */
    else if (spec.op === "fitness.gallery") {
      if (!gallery.length) L.push("No progress photos yet.");
      else {
        const sorted = gallery.slice().sort((a, b) =>
          (fitMidnight(b.dateCaptured) || 0) - (fitMidnight(a.dateCaptured) || 0));
        L.push(gallery.length + " post" + (gallery.length === 1 ? "" : "s") +
               " · latest " + fitAgo(sorted[0].dateCaptured));
        sorted.slice(0, Math.max(1, spec.limit || 4)).forEach(p => {
          const cats = (Array.isArray(p.images) ? p.images : []).map(i => i && i.cat).filter(Boolean);
          L.push(fitPretty(p.dateCaptured) + " — \"" + (p.tag || "Update") + "\"" +
                 (cats.length ? " (" + cats.join(", ") + ")" : "") +
                 (p.diary ? " · note: " + String(p.diary).slice(0, 60) : ""));
        });
      }
    }

    /* ── Muscle group levels ───────────────────────────── */
    else if (spec.op === "fitness.muscles") {
      const m = P.muscles || {};
      const rows = Object.keys(m).map(k => ({ name: k, lvl: (m[k] && m[k].level) || 1, xp: (m[k] && m[k].xp) || 0 }))
                               .sort((a, b) => b.lvl - a.lvl || b.xp - a.xp);
      if (!rows.length) L.push("No muscle progress recorded yet.");
      else {
        L.push(rows.slice(0, 12).map(r => r.name + " Lv" + r.lvl + " (" + Math.round(r.xp) + " MGP)").join(" · "));
        const untouched = rows.filter(r => r.xp === 0).map(r => r.name);
        if (untouched.length) L.push("Untouched: " + untouched.slice(0, 8).join(", "));
      }
    }

    /* ── The last seven days ───────────────────────────── */
    else if (spec.op === "fitness.weekly") {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 6);
      const from = new Date(cutoff.getFullYear(), cutoff.getMonth(), cutoff.getDate());

      const week = templates.filter(t => {
        if (!t || !t.isCompleted) return false;
        const d = fitMidnight(t.date);
        return d && d >= from;
      });

      let mgp = 0, fp = 0, prestige = 0, exercises = 0, seconds = 0;
      week.forEach(t => {
        if (t.summary) {
          mgp += t.summary.totalMGP || 0;
          fp += t.summary.totalFP || 0;
          prestige += t.summary.prestige || 0;
          exercises += t.summary.exercisesCompleted || 0;
        } else if (Array.isArray(t.exercises)) {
          exercises += t.exercises.length;     // older record, no summary
        }
        seconds += t.durationSeconds || 0;
      });

      L.push(week.length + " workout" + (week.length === 1 ? "" : "s") + " · " +
             exercises + " exercises · " + fitMins(seconds));
      if (mgp || fp || prestige) L.push("+" + mgp + " MGP · +" + fp + " FP · +" + prestige + " prestige");
      const days = [...new Set(week.map(t => fitMidnight(t.date)))]
        .filter(Boolean).sort((a, b) => a - b)
        .map(d => d.toLocaleDateString("en-GB", { weekday: "short" }));
      if (days.length) L.push("Trained: " + days.join(", "));
      if (!week.length) L.push("Nothing completed in the last seven days.");
    }

    else return null;

    return spec.label + ":\n" + L.map(l => "  " + l).join("\n");
  }

  async function readOne(key) {
    const spec = REGISTRY[key];
    if (!spec) return null;

    /* The Realtime Database reads branch off before the Firestore
       handle is ever asked for — they don't share a single line of it. */
    if (spec.kind === "rtdb") {
      if (spec.op.indexOf("prestige.")  === 0) return readPrestige(spec);
      if (spec.op.indexOf("hydration.") === 0) return readHydration(spec);
      if (spec.op.indexOf("food.")      === 0) return readFood(spec);
      if (spec.op.indexOf("flo.")       === 0) return readFlo(spec);
      return readSleep(spec);
    }

    const db = dbFor(spec.project);

    /* ── PASSAGE, added 2026-09-17 ────────────────────────────────
       Scribble is the one guarded project LifeHub reads. Its rules
       refuse anyone without a session, and this page has one only
       because Scribble leaves a copy of yours behind — but Firebase
       needs a moment to find that copy after the page loads.

       Reading before it does is refused in exactly the same words
       as having no session at all, so without this wait a cold load
       would look like the passage had failed when it had merely
       been beaten to the punch. dbFor() above is what creates the
       named app the session belongs to, so this has to come after
       it, not before.

       Resolves to null when there is no session — signed out, or
       the passage removed. Then the read is refused and returns
       "(<key> unavailable)", exactly as it did before any of this.

       See: JS/poppy/LifeHub-poppy-scribble-passage.js
    ───────────────────────────────────────────────────────────── */
    if (spec.project === "scribble" && window.LIFEHUB_SCRIBBLE_PASSAGE) {
      await LIFEHUB_SCRIBBLE_PASSAGE.ready(appFor(spec.project));
    }

    /* Firestore, but not a collection read — the whole hub is one
       document, so these have their own reader. */
    if (spec.op.indexOf("fitness.") === 0) return readFitness(spec, db);

    if (spec.op === "doc") {
      const snap = await db.doc(spec.path).get();
      if (!snap.exists) return spec.label + ": not found";
      const data = snap.data();
      const picked = (spec.fields || Object.keys(data))
        .map(f => f + "=" + data[f])
        .join(", ");
      return spec.label + ": " + picked;
    }

    /* ── BOUNDED READS, added 2026-09-18 ──────────────────────────
       Most collections here have a natural ceiling — you own as many
       projects as you own. An append-only log does not: the access log
       gains a row every idle lock, so it grows for as long as Scribble
       is used, and reading all of it to summarise the recent part would
       cost more every month.

       `orderBy` on a spec turns the read into a window. Kept general
       rather than special-cased on the op, so the next append-only
       collection needs no new code here. */
    const snap = spec.orderBy
      ? await db.collection(spec.path)
            .orderBy(spec.orderBy, spec.direction || "desc")
            .limit(spec.readLimit || 300)
            .get()
      : await db.collection(spec.path).get();

    const rows = [];
    snap.forEach(d => {
      /* The document id rides along on every row. A read that drops it
         can only ever produce a sentence — the write layer needs to be
         able to address the document it just read about. */
      const data = Object.assign({ id: d.id }, d.data());
      /* buckets needs the excluded ones — sorting them IS the job. */
      if (spec.op === "buckets" || keep(data, spec.exclude)) rows.push(data);
    });

    /* One document per device. The most recently focused wins, so a
       tracker left open on the TV can't outrank the monitor she's
       actually typing on.

       Anything older than staleMinutes is treated as nobody being
       there — better for Poppy to ask than to act on yesterday. */
    if (spec.op === "surface") {
      const all = rows.filter(r => r && r.app);

      /* Presence means OPEN, not focused. Asking Poppy anything means
         focusing her window, which blurs the app being asked about —
         so focus can never be what marks a surface active.

         Preference order: open and on screen, then open but minimised,
         then whatever wrote last (a page killed by force never gets to
         say goodbye). Ties break on which was focused most recently. */
      const byFocus = (a, b) => (b.lastFocus || b.at || 0) - (a.lastFocus || a.at || 0);

      const onScreen = all.filter(r => r.open && r.visible);
      const minimised = all.filter(r => r.open && !r.visible);
      const pool = onScreen.length ? onScreen : (minimised.length ? minimised : all);
      const live = pool.slice().sort(byFocus)[0];

      if (!live) return "Active surface: unknown";

      /* The command channel needs to reach ONE screen. This is the same
         document the line below describes, so what Poppy says and what
         she acts on can't drift apart. */
      window.POPPY_FETCH.active = {
        device:  live.id || null,
        app:     live.app || null,
        surface: live.surface || null,
        modal:   (live.detail && live.detail.modal) || null
      };

      const ageMin = (Date.now() - (live.at || 0)) / 60000;
      if (!live.open && ageMin > (spec.staleMinutes || 90)) {
        return "Active surface: unknown (nothing open; last seen " +
               Math.round(ageMin / 60) + "h ago on " + live.app + ")";
      }
      if (!live.open) {
        return "Active surface: none open — last was " + live.app +
               (live.surface ? " / " + live.surface : "");
      }

      /* Two screens open at once is normal — the TV and the monitor.
         Poppy acts on one but needs to know the other is there. */
      const others = pool.filter(r => r !== live).map(r => r.app);

      let line = "Active surface: " + live.app;
      if (live.surface) line += " / " + live.surface;
      if (live.device)  line += " (on " + live.device + ")";
      if (!live.visible) line += " [minimised]";

      const d = live.detail || {};
      const extras = Object.keys(d).map(k => k + ": " + d[k]);
      if (extras.length) line += " — " + extras.join(", ");

      if (others.length) line += " | also open: " + others.join(", ");

      return line;
    }

    /* Every project lives in exactly one of three places, and the flags
       on its own document say which. Reading them together is the only
       way the three numbers can't disagree with each other.

       deleted wins over archived: shelving something and then binning it
       leaves both flags set, and the bin is where it actually is. */
    if (spec.op === "buckets") {
      const b = { active: [], archived: [], bin: [] };

      /* This read is also what the write layer navigates by. Every name
         Poppy just told Jen about is left behind here, keyed lowercase,
         so a name she says back can be turned into a document id without
         a second round trip. Rebuilt from scratch each read — a project
         renamed on the page must not keep answering to its old name. */
      Object.keys(index).forEach(k => delete index[k]);

      rows.forEach(r => {
        const name = r.name || "Untitled";

        index[name.toLowerCase()] = {
          id:       r.id,
          name:     name,
          pinned:   !!r.pinned,
          archived: !!r.archived,
          deleted:  !!r.deleted
        };

        if (r.deleted)       b.bin.push(name);
        else if (r.archived) b.archived.push(name);
        else                 b.active.push(name);
      });
      return spec.label + " — active: " + b.active.length +
             " (" + (b.active.join(", ") || "none") + ")" +
             " | archived: " + b.archived.length +
             " (" + (b.archived.join(", ") || "none") + ")" +
             " | in the bin: " + b.bin.length +
             " (" + (b.bin.join(", ") || "none") + ")";
    }

    /* ── stats ─────────────────────────────────────────────────────
       Counts, and the thing counts alone would hide.

       A symlink lives in the project that POINTS, not the one pointed at,
       so nothing inside a project can tell you what depends on it. The only
       way to know is to read every project's subcollections and look at
       where the links aim — which is exactly what findSymlinksToAny does
       on the Scribble page.

       This matters because scribble-firebase.js's softDeleteProject has no
       symlink cascade, unlike the item-level delete in
       scribble-project-firebase.js. Binning a project leaves every pointer
       aimed into it hanging. So the inbound count isn't decoration on a
       confirmation prompt — it's the part that doesn't come back. */
    if (spec.op === "stats") {
      const live = rows.filter(r => !r.deleted && !r.archived);
      const stats = {};
      live.forEach(r => {
        stats[r.id] = { name: r.name || "Untitled",
                        modules: 0, sections: 0, files: 0, inbound: 0 };
      });

      /* Every subcollection of every live project, read once. The same
         pass produces both the counts and the link map — a second pass
         could disagree with the first if anything changed between them. */
      const links = [];
      await Promise.all(live.map(async r => {
        const base = db.collection(spec.path).doc(r.id);
        const [m, s, f] = await Promise.all([
          base.collection("modules").get(),
          base.collection("sections").get(),
          base.collection("files").get()
        ]);
        const tally = (snap, key) => snap.forEach(d => {
          const data = d.data();
          if (data.deleted) return;
          /* A link is a pointer, not content. Counting it as a file would
             overstate what the project actually holds. */
          if (data.isSymlink) {
            links.push({ from: r.id, target: data.targetProjectId || null });
            return;
          }
          stats[r.id][key]++;
        });
        tally(m, "modules"); tally(s, "sections"); tally(f, "files");
      }));

      /* A link from a project into itself isn't a dependency that breaks
         when that project goes — it goes with it. */
      links.forEach(l => {
        if (l.target && l.target !== l.from && stats[l.target]) {
          stats[l.target].inbound++;
        }
      });

      const lines = Object.keys(stats).map(id => {
        const t = stats[id];
        let line = "  " + t.name + " — " + t.modules + " modules, " +
                   t.sections + " sections, " + t.files + " files";
        line += t.inbound
          ? "; " + t.inbound + " link" + (t.inbound === 1 ? "" : "s") +
            " from other projects point into it and will be left broken if it goes"
          : "; nothing links into it";
        return line;
      });

      if (!lines.length) return spec.label + ": no active projects";
      return spec.label + ":\n" + lines.join("\n");
    }

    /* ── dates ─────────────────────────────────────────────────────
       Firestore hands back a Timestamp object, not a date. Documents
       written before a field existed don't carry it at all, and a write
       made moments ago carries a pending sentinel that hasn't resolved
       yet — so every read here has to survive being handed nothing.

       Both forms are given. "3 days ago" is how Jen asks the question;
       the calendar date is what she needs if the answer matters. */
    /* ══════════════════════════════════════════════════════════════
       ACCESS LOG — added 2026-09-18

       Laid out as a DAY TIMELINE rather than a flat list, because
       almost everything Jen asks of this is really a question about
       sequence: did those failures turn into a success, how fast did
       they come, what time of day was it, where did someone give up.
       A list sorted by time answers those only if you hold the whole
       thing in your head; a timeline answers them by being read.

       Then two roll-ups — by question and by browser signature —
       because "which of my 20 gets failed most" and "has this device
       been here before" are counts, not sequences.
    ══════════════════════════════════════════════════════════════ */
    if (spec.op === "access") {
      const ms = r => {
        const v = r.timestamp;
        if (v && typeof v.toDate === "function") {
          try { return v.toDate().getTime(); } catch (e) { /* fall through */ }
        }
        if (v && v.seconds) return v.seconds * 1000;
        return r.timestampLocalMs || 0;
      };

      /* Same reduction the devices register and the viewer both use. */
      const shortAgent = ua => {
        if (!ua) return "unknown device";
        const os =
          /Windows NT/.test(ua)       ? "Windows" :
          /Android/.test(ua)          ? "Android" :
          /iPhone|iPad|iPod/.test(ua) ? "iOS"     :
          /Mac OS X/.test(ua)         ? "macOS"   :
          /Linux/.test(ua)            ? "Linux"   : "unknown OS";
        const br =
          /Edg\//.test(ua)            ? "Edge"    :
          /OPR\//.test(ua)            ? "Opera"   :
          /Firefox\//.test(ua)        ? "Firefox" :
          /Chrome\//.test(ua)         ? "Chrome"  :
          /Safari\//.test(ua)         ? "Safari"  : "browser";
        return br + " on " + os;
      };

      /* Every detail string the gate writes puts the interesting part
         in the first pair of quotes — the question, the name typed,
         the email. Pulling it out generically rather than matching each
         sentence shape means a reworded log line still reads. */
      const quoted = d => {
        const m = /"([^"]*)"/.exec(String(d || ""));
        return m ? m[1] : null;
      };

      const SHORT = {
        "unlock":            "in",
        "identity-failed":   "identity",
        "answer-failed":     "answer",
        "question-rerolled": "reroll",
        "locked-out":        "LOCKED OUT",
        "idle-lock":         "idle",
        "manual-lock":       "manual",
        "setup-complete":    "SETUP"
      };
      const MARK = {
        "unlock":            "OK",
        "identity-failed":   "FAIL",
        "answer-failed":     "FAIL",
        "question-rerolled": "skip",
        "locked-out":        "STOP",
        "idle-lock":         "lock",
        "manual-lock":       "lock",
        "setup-complete":    "KEY"
      };

      const evs = rows
        .map(r => ({
          t:      ms(r),
          event:  String(r.event || "unknown"),
          detail: r.detail || "",
          said:   quoted(r.detail),
          agent:  shortAgent(r.agent),
          surface: r.surface || null
        }))
        .filter(e => e.t)
        .sort((a, b) => b.t - a.t);

      if (!evs.length) {
        return spec.label + " — nothing recorded yet.";
      }

      const count = {};
      evs.forEach(e => { count[e.event] = (count[e.event] || 0) + 1; });

      const dt   = t => new Date(t);
      const dkey = t => dt(t).toDateString();
      const dlab = t => dt(t).toLocaleDateString(undefined,
                          { weekday: "short", day: "numeric", month: "short" });
      const clock = t => {
        const d = dt(t);
        return String(d.getHours()).padStart(2, "0") + ":" +
               String(d.getMinutes()).padStart(2, "0");
      };

      /* ── The timeline ── */
      const days = [];
      const byDay = {};
      evs.forEach(e => {
        const k = dkey(e.t);
        if (!byDay[k]) { byDay[k] = []; days.push(k); }
        byDay[k].push(e);
      });

      const DAY_CAP = 14;      /* days shown in full */
      const EV_CAP  = 24;      /* events per day before it is summarised */

      const timeline = days.slice(0, DAY_CAP).map(k => {
        const list = byDay[k].slice().sort((a, b) => a.t - b.t);
        const ins  = list.filter(e => e.event === "unlock").length;
        const fails = list.filter(e =>
          e.event === "identity-failed" || e.event === "answer-failed").length;

        const shown = list.slice(0, EV_CAP).map(e => {
          const bit = clock(e.t) + " " + MARK[e.event] + " " + (SHORT[e.event] || e.event);
          return e.said ? bit + ' "' + e.said + '"' : bit;
        });
        if (list.length > EV_CAP) {
          shown.push("... and " + (list.length - EV_CAP) + " more that day");
        }

        return "  " + dlab(list[0].t) + " — " + ins + " signed in, " +
               fails + " failed\n      " + shown.join("\n      ");
      });

      /* ── The 20 questions, as a set ── */
      const qs = {};
      const bump = (q, field) => {
        if (!q) return;
        if (!qs[q]) qs[q] = { answered: 0, failed: 0, skipped: 0 };
        qs[q][field]++;
      };
      evs.forEach(e => {
        if (e.event === "unlock")            bump(e.said, "answered");
        if (e.event === "answer-failed")     bump(e.said, "failed");
        if (e.event === "question-rerolled") bump(e.said, "skipped");
      });
      const qLines = Object.keys(qs)
        .sort((a, b) => (qs[b].answered + qs[b].failed + qs[b].skipped) -
                        (qs[a].answered + qs[a].failed + qs[a].skipped))
        .map(q => '  "' + q + '" — asked ' +
             (qs[q].answered + qs[q].failed + qs[q].skipped) +
             ", answered " + qs[q].answered +
             ", failed " + qs[q].failed +
             ", skipped " + qs[q].skipped);

      /* ── Browser signatures ── */
      const ags = {};
      evs.forEach(e => {
        if (!ags[e.agent]) ags[e.agent] = { n: 0, first: e.t, last: e.t };
        const a = ags[e.agent];
        a.n++;
        if (e.t < a.first) a.first = e.t;
        if (e.t > a.last)  a.last  = e.t;
      });
      const aLines = Object.keys(ags)
        .sort((a, b) => ags[b].last - ags[a].last)
        .map(a => "  " + a + " — " + ags[a].n + " events, " +
             dlab(ags[a].first) + " to " + dlab(ags[a].last));

      const span = dlab(evs[evs.length - 1].t) + " to " + dlab(evs[0].t);
      const tally = Object.keys(count)
        .map(k => (SHORT[k] || k) + " " + count[k]).join(" | ");

      return spec.label + " — " + evs.length + " events, " + span + "." +
        (evs.length >= 300 ? " (capped at the 300 most recent)" : "") +
        "\n  " + tally +
        "\n  WHAT THIS CANNOT SAY: nothing typed at a failed attempt is ever" +
        " stored, not even a wrong answer; a wrong name and a wrong passcode" +
        " are both 'identity' because the gate checks them together; and the" +
        " gate being opened is not recorded, so an attempt abandoned without" +
        " typing leaves no trace. Rows carry a browser signature, not a" +
        " device id, so two machines with the same browser and OS read as one." +
        "\n\nBY DAY (newest first" +
        (days.length > DAY_CAP ? ", " + DAY_CAP + " of " + days.length + " days" : "") +
        ")\n" + timeline.join("\n") +
        (qLines.length ? "\n\nQUESTIONS SEEN\n" + qLines.join("\n") : "") +
        (aLines.length ? "\n\nBROWSER SIGNATURES\n" + aLines.join("\n") : "");
    }

    /* ══════════════════════════════════════════════════════════════
       DEVICES — added 2026-09-18
       A register of what has been in, not a list of live sessions.

       ── READ THE PAIR, NOT THE FIELD ──────────────────────────────
       Scribble writes every stamp twice: the server clock plus a
       plain millisecond companion, because serverTimestamp() reads
       back null until the write lands. A device registered offline
       has firstSeen === null and firstSeenLocalMs set. Reading only
       the server field would date it "—" and sort it oldest — the
       same bug that was fixed in eleven places inside Scribble
       itself. This mirrors whenMs() from js/scribble-db.js.
    ══════════════════════════════════════════════════════════════ */
    if (spec.op === "devices") {
      const ms = (r, field) => {
        const v = r[field];
        if (v && typeof v.toDate === "function") {
          try { return v.toDate().getTime(); } catch (e) { /* fall through */ }
        }
        if (v && v.seconds) return v.seconds * 1000;
        return r[field + "LocalMs"] || 0;
      };

      const ago = t => {
        const mins = Math.round((Date.now() - t) / 60000);
        if (mins < 1)    return "just now";
        if (mins < 60)   return mins + (mins === 1 ? " minute ago" : " minutes ago");
        const hrs = Math.round(mins / 60);
        if (hrs < 24)    return hrs + (hrs === 1 ? " hour ago" : " hours ago");
        const days = Math.round(hrs / 24);
        if (days < 31)   return days + (days === 1 ? " day ago" : " days ago");
        const months = Math.round(days / 30.4);
        if (months < 18) return months + (months === 1 ? " month ago" : " months ago");
        return Math.round(days / 365) + " years ago";
      };

      const fmt = t => new Date(t).toLocaleDateString(undefined,
        { day: "numeric", month: "short", year: "numeric" });

      const dateBit = (labelText, t) =>
        t ? labelText + " " + fmt(t) + " (" + ago(t) + ")" : null;

      /* Same reduction js/scribble-devices.js shows in its viewer, so
         the name Poppy says matches the name on the screen. */
      const shortAgent = ua => {
        if (!ua) return "unknown device";
        const os =
          /Windows NT/.test(ua)       ? "Windows" :
          /Android/.test(ua)          ? "Android" :
          /iPhone|iPad|iPod/.test(ua) ? "iOS"     :
          /Mac OS X/.test(ua)         ? "macOS"   :
          /Linux/.test(ua)            ? "Linux"   : "unknown OS";
        const br =
          /Edg\//.test(ua)            ? "Edge"    :
          /OPR\//.test(ua)            ? "Opera"   :
          /Firefox\//.test(ua)        ? "Firefox" :
          /Chrome\//.test(ua)         ? "Chrome"  :
          /Safari\//.test(ua)         ? "Safari"  : "browser";
        return br + " on " + os;
      };

      /* The device this screen is, so one row can be marked as here.
         Same localStorage key LifeHub-surface.js and scribble-devices.js
         both use — one device is one device across all of LifeHub. */
      let hereId = null;
      try { hereId = localStorage.getItem("lifehub.deviceId"); } catch (e) {}

      const devices = rows.map(r => ({
        id:        r.id,
        label:     (r.label || "").trim(),
        agent:     shortAgent(r.agent),
        platform:  (r.platform || "").trim(),
        account:   r.account || null,
        lastPage:  r.lastPage || null,
        first:     ms(r, "firstSeen"),
        last:      ms(r, "lastSeen"),
        out:       ms(r, "signedOutAt"),
        here:      !!hereId && r.id === hereId
      })).sort((a, b) => b.last - a.last);

      if (!devices.length) {
        return spec.label + " — none registered. A device appears here " +
               "only after it has opened Scribble at least once while " +
               "signed in and online.";
      }

      const inCount  = devices.filter(d => !d.out).length;
      const outCount = devices.length - inCount;

      const lines = devices.map(d => {
        const name  = d.label || d.agent;
        const state = d.here ? "THIS SCREEN"
                    : d.out  ? "signed out"
                             : "signed in";

        const bits = [
          dateBit("first seen", d.first),
          dateBit("last seen",  d.last),
          d.out ? dateBit("signed out", d.out) : null
        ].filter(Boolean);

        const extra = [
          d.label ? d.agent : null,          /* only if the label hid it */
          d.platform || null,
          d.account || null,
          d.lastPage ? "last on " + d.lastPage : null
        ].filter(Boolean).join(", ");

        return "  " + name + " [" + state + "] — " +
               (bits.join(", ") || "no dates recorded") +
               (extra ? " · " + extra : "") +
               " · id " + d.id;
      });

      return spec.label + " — " + devices.length +
             (devices.length === 1 ? " device" : " devices") +
             ", " + inCount + " signed in, " + outCount + " signed out." +
             " NOTE: one row per device, not per visit — only first and " +
             "last are recorded, so there is no per-visit history to read.\n" +
             lines.join("\n");
    }

    if (spec.op === "dates") {
      const when = v => {
        if (!v) return null;
        if (typeof v.toDate === "function") { try { return v.toDate(); } catch (e) { return null; } }
        if (v.seconds) return new Date(v.seconds * 1000);
        if (v instanceof Date) return v;
        const d = new Date(v);
        return isNaN(d.getTime()) ? null : d;
      };

      const ago = d => {
        const mins = Math.round((Date.now() - d.getTime()) / 60000);
        if (mins < 1)    return "just now";
        if (mins < 60)   return mins + (mins === 1 ? " minute ago" : " minutes ago");
        const hrs = Math.round(mins / 60);
        if (hrs < 24)    return hrs + (hrs === 1 ? " hour ago" : " hours ago");
        const days = Math.round(hrs / 24);
        if (days < 31)   return days + (days === 1 ? " day ago" : " days ago");
        const months = Math.round(days / 30.4);
        if (months < 18) return months + (months === 1 ? " month ago" : " months ago");
        return Math.round(days / 365) + " years ago";
      };

      /* Local time, because Jen asks in local time. */
      const fmt = d => d.toLocaleDateString(undefined,
        { day: "numeric", month: "short", year: "numeric" });

      const say = (labelText, v) => {
        const d = when(v);
        if (!d) return null;
        return labelText + " " + fmt(d) + " (" + ago(d) + ")";
      };

      /* Archived and binned ones are included and marked. "When did I
         make that" is a fair question about a project that isn't on the
         page any more — arguably more likely, not less. */
      const lines = rows.map(r => {
        const bits = [say("created", r.createdAt), say("updated", r.updatedAt)]
          .filter(Boolean);
        if (r.deleted)       bits.push(say("binned", r.deletedAt)   || "in the bin");
        else if (r.archived) bits.push(say("archived", r.archivedAt) || "archived");
        if (!bits.length) return "  " + (r.name || "Untitled") + " — no dates recorded";
        return "  " + (r.name || "Untitled") + " — " + bits.join(", ");
      });

      if (!lines.length) return spec.label + ": nothing to report";
      return spec.label + ":\n" + lines.join("\n");
    }

    if (spec.op === "count") {
      return spec.label + ": " + rows.length;
    }

    if (spec.op === "list") {
      const vals = rows
        .map(r => r[spec.field || "name"])
        .filter(Boolean)
        .slice(0, spec.limit || 40);
      return spec.label + " (" + vals.length + "): " + vals.join(", ");
    }

    return null;
  }

  /* Reads every target in parallel. A target that fails returns a
     line saying so rather than throwing — a broken read should
     degrade Poppy's answer, not kill the message. */
  async function fetchHandler(targets) {
    if (!targets || !targets.length) return "";

    const results = await Promise.all(targets.map(async key => {
      try {
        return await readOne(key);
      } catch (err) {
        console.warn("[Poppy fetch] " + key + " —", err.message);
        return "(" + key + " unavailable)";
      }
    }));

    const lines = results.filter(Boolean);
    if (!lines.length) return "";

    return "## LIVE DATA\n" + lines.join("\n");
  }

  window.POPPY_FETCH = {
    run: fetchHandler,
    registry: REGISTRY,

    /* ── What the write layer needs ────────────────────────────────
       Reading is only half of it. These two are what turn "unpin the
       lifehub project" into a write against a real document.

       db("scribble")  the same named-app Firestore handle the reads
                       use, so a write lands in the same project and
                       never initialises a second copy of the app.

       ids             name → { id, name, pinned, archived, deleted },
                       lowercase keys. Filled by the buckets read, so
                       it is populated by the time an action runs — the
                       fetch happens before the model is called, and the
                       action runs after it replies. Empty means no
                       buckets read has happened yet this session. */
    db: dbFor,

    /* The trackers' side of the same idea: POPPY_FETCH.rtdb("lifehub")
       is the Realtime Database handle the sleep reads use, so a write
       lands in the same place and never initialises a second app. */
    rtdb: rtdbFor,

    ids: index,

    /* Filled by the surface read: which single screen a UI command
       should be delivered to. Null until that read has run. */
    active: null,

    /* POPPY_FETCH.test("scribble/projects.count") in the console —
       reads it once and prints what Poppy would see. */
    async test(key) {
      const out = await fetchHandler([key]);
      console.log(out || "(nothing returned)");
      return out;
    }
  };

})();
