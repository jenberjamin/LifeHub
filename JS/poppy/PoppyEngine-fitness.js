/* LifeHub — Poppy's Fitness Centre actions.
   ────────────────────────────────────────────────────────────────
   Wraps LIFEHUB_ACTIONS, like every other PoppyEngine-*.js. Load it
   alongside the others on the HomeScreen, after LifeHub-homescreen.js.

   ── Where these writes land ─────────────────────────────────────
   The Fitness Centre keeps its whole hub in ONE Firestore document,
   LifeHub_Backups/Jen_Data, with measurements, gallery, templates and
   the exercise library packed inside it as JSON strings.

   Until recently that document was a backup nobody read: the hub only
   ever pulled from it on a blank device, so anything written here would
   have been overwritten by the next local save without ever being seen.
   The hub now holds a live listener on it, which is the only reason
   these actions do anything at all.

   Every write below therefore MUST stamp two fields:

     lastSync   an ISO timestamp — the hub compares it against the last
                copy it accepted, and ignores anything not newer
     writer     "POPPY" — so the hub can tell this apart from its own
                echo and knows to apply it

   Miss either and the write lands in Firestore and is silently ignored
   by every device. That is the failure this whole exercise was about.

   ── Why there is no "log my workout" here ───────────────────────
   Scoring a session — MGP per set against her own PRs, the luteal
   multiplier, streak milestones, level-ups — lives in fitness-core.js.
   Reproducing it here would be a second copy of the economy, and this
   codebase has already been bitten several times by exactly that kind
   of duplicate. She taps FINISH; the numbers come from one engine.
*/

(function () {

  const prior = window.LIFEHUB_ACTIONS;
  if (!prior || typeof prior.describe !== "function") {
    console.error("[Poppy fitness] LIFEHUB_ACTIONS missing — load this after the other PoppyEngine wrappers.");
    return;
  }

  const SOURCE     = "POPPY";
  const VAULT_PATH = "LifeHub_Backups/Jen_Data";

  /* MIRRORS SYSTEM_CONFIG.graceCap in Hubs/FitnessCentre/js/fitness-core.js.
     Poppy runs on a different page and cannot import from the hub, so this
     is a deliberate copy. If the cap ever changes there, change it here. */
  const GRACE_CAP = 2;

  /* MIRRORS bodyParts in Hubs/FitnessCentre/js/fitness-measurement.js.
     Used to turn what she says ("waist") into the exact key the hub
     stores, so a measurement Poppy writes is readable by the charts. */
  const BODY_PARTS = [
    "Weight", "Shoulders", "Chest", "Left Bicep", "Right Bicep",
    "Left Forearm", "Right Forearm", "Upper Abs", "Waist", "Lower Abs",
    "Hips", "Left Thigh", "Right Thigh", "Left Calf", "Right Calf"
  ];

  function db() {
    if (!window.POPPY_FETCH || typeof window.POPPY_FETCH.db !== "function") {
      throw new Error("Poppy's Firebase layer isn't loaded.");
    }
    return window.POPPY_FETCH.db("fitness");
  }

  /* MIRRORS getWeekNumber() in fitness-core.js — ISO week, so Poppy and
     the hub agree on when the weekly grace budget resets. Same algorithm,
     deliberately not "close enough": a different week boundary would let
     her spend three grace days in one week without either side noticing. */
  function isoWeek(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  function parseList(raw) {
    if (Array.isArray(raw)) return raw.filter(Boolean);
    try { const v = JSON.parse(raw || "[]"); return Array.isArray(v) ? v.filter(Boolean) : []; }
    catch (e) { return []; }
  }

  /* One transaction per write.

     A transaction rather than a plain update because the hub may be open
     on her phone writing the same document — read-modify-write without one
     would drop whichever landed first. */
  function editVault(mutate) {
    const store = db();
    const ref = store.doc(VAULT_PATH);

    return store.runTransaction(function (tx) {
      return tx.get(ref).then(function (snap) {
        if (!snap.exists) {
          throw new Error("The Fitness Centre hasn't synced to the cloud yet — open it once on any device first.");
        }

        const data   = snap.data() || {};
        const result = mutate(data);

        const patch = Object.assign({}, result.patch, {
          lastSync: new Date().toISOString(),   // must be newer than the hub's last accepted copy
          writer:   SOURCE                      // must not look like the hub's own echo
        });

        tx.update(ref, patch);
        return result.message;
      });
    });
  }

  function profileOf(data) {
    return Object.assign({}, data.userProfile || {});
  }

  /* The hub trims its journal to the last 100 entries; matching that here
     keeps the document from growing without limit from Poppy's side. */
  function pushLog(P, entry) {
    P.systemLogs = (P.systemLogs || []).concat([entry]);
    if (P.systemLogs.length > 100) P.systemLogs = P.systemLogs.slice(-100);
    return P;
  }


  /* ── GRACE ───────────────────────────────────────────────────────
     Mirrors activateGrace() in fitness-core.js, including the part the
     hub's own button forgot for a long time: stamping lastWorkout. That
     single field is what bridges the gap in the streak rule. Without it
     the day is logged, looks protected, and the streak breaks anyway. */
  function grace(cmd) {
    const reason = String(cmd && cmd.reason != null ? cmd.reason : "").trim() || "Streak Paused";
    if (reason.length > 120) throw new Error("Keep the reason short enough to read back later.");

    return editVault(function (data) {
      const P   = profileOf(data);
      const now = new Date();

      // Weekly reset, mirroring checkGraceReset().
      const week = isoWeek(now);
      if (P.lastGraceWeek !== week) { P.graceUsed = 0; P.lastGraceWeek = week; }

      const covered = (P.graceUsed || 0) < GRACE_CAP;

      if (covered) {
        P.graceUsed  = (P.graceUsed || 0) + 1;
        P.lastWorkout = now.toISOString();   // bridges the gap; does NOT advance the streak
      }

      pushLog(P, {
        text: "[GRACE PROTOCOL] " + reason,
        date: now.toISOString(),
        type: "grace",
        highlight: true
      });

      const left = Math.max(0, GRACE_CAP - (P.graceUsed || 0));

      return {
        patch: { userProfile: P },
        message: covered
          ? "Grace applied — " + reason + ". Streak held at " + (P.streak || 0) +
            " day" + ((P.streak === 1) ? "" : "s") + ". " + left + " of " + GRACE_CAP + " left this week."
          : "Rest day logged — " + reason + ". Your grace budget is spent this week, so the streak isn't protected."
      };
    });
  }


  /* ── LUTEAL ──────────────────────────────────────────────────────
     A standing preference the Active Session reads when it opens, so
     "turn luteal on" survives until she turns it off. Before this the
     toggle existed only as a checkbox on one screen, with nothing behind
     it to set — which is why it could not be switched from anywhere. */
  function luteal(cmd) {
    const said = cmd && cmd.on;
    let on;
    if (said === true || said === false) on = said;
    else {
      const s = String(said == null ? "" : said).trim().toLowerCase();
      if (["on", "true", "yes", "start", "begin"].indexOf(s) !== -1) on = true;
      else if (["off", "false", "no", "stop", "end"].indexOf(s) !== -1) on = false;
      else throw new Error('Say whether luteal goes on or off — "on" or "off".');
    }

    return editVault(function (data) {
      const P = profileOf(data);
      P.luteal = { active: on, since: new Date().toISOString() };

      return {
        patch: { userProfile: P },
        message: on
          ? "Luteal phase on — workouts will score the 25% bonus until you turn it off."
          : "Luteal phase off — workouts score normally again."
      };
    });
  }


  /* ── MEASUREMENTS ────────────────────────────────────────────────
     Writes ONLY what she actually said. The hub stores sparse records on
     purpose: copying unmeasured parts forward makes a three-week-old
     waist look like today's. */
  function measure(cmd) {
    const raw = (cmd && cmd.values) ? cmd.values : null;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error('Give the measurements as values, e.g. {"Weight":52,"Waist":70}.');
    }

    const clean = {};
    Object.keys(raw).forEach(function (key) {
      const canonical = BODY_PARTS.find(function (p) {
        return p.toLowerCase() === String(key).trim().toLowerCase();
      });
      if (!canonical) {
        throw new Error('"' + key + '" isn\'t a body part the tracker knows. ' +
                        "It uses: " + BODY_PARTS.join(", ") + ".");
      }

      const n = Number(String(raw[key]).replace(/[, ]/g, ""));
      if (!isFinite(n) || n <= 0) throw new Error(canonical + " needs a positive number.");

      /* A typo control, not a health judgement. Weight in kg and
         everything else in cm both sit comfortably under 300; 520 for 52
         is the mistake this catches. */
      if (n > 300) {
        throw new Error(n + " for " + canonical + " looks like a slip — " +
                        "the tracker stores kilos and centimetres. Say it again if you meant it.");
      }
      clean[canonical] = n;
    });

    const parts = Object.keys(clean);
    if (!parts.length) throw new Error("Nothing to log — which measurement?");

    return editVault(function (data) {
      const list = parseList(data.measurements_backup);
      list.push({ date: new Date().toISOString(), data: clean });

      return {
        patch: { measurements_backup: JSON.stringify(list) },
        message: "Logged — " + parts.map(function (p) {
          return p + " " + clean[p] + (p === "Weight" ? "kg" : "cm");
        }).join(", ") + "."
      };
    });
  }


  const ACTIONS = {

    fitness_grace: {
      spec: '{"action":"fitness_grace","reason":"PCOS flare"} ' +
            '— takes a protected rest day in the Fitness Centre. Pauses the streak without breaking it ' +
            'and writes the reason onto the calendar. reason is her own words for why. ' +
            'Two protected days a week; past that the day is still logged but the streak is NOT protected, ' +
            'and the reply will say so. Use this when she says she is skipping, resting, too busy, ' +
            'unwell or flaring — not when she says she already trained.',
      run: (cmd) => grace(cmd)
    },

    fitness_luteal: {
      spec: '{"action":"fitness_luteal","on":"on"} ' +
            '— turns the luteal-phase bonus on or off. While on, every workout scores 25% more. ' +
            'on is exactly "on" or "off". It stays as set until changed, so turn it off when she says ' +
            'the phase has ended — leaving it on inflates everything she logs.',
      run: (cmd) => luteal(cmd)
    },

    fitness_measure: {
      spec: '{"action":"fitness_measure","values":{"Weight":52,"Waist":70}} ' +
            '— logs body measurements. values holds ONLY the parts she actually said; ' +
            'never carry another part forward or estimate one, because a stored number is ' +
            'indistinguishable from a measured one afterwards. ' +
            'Weight is kilos, everything else centimetres. ' +
            'Valid parts: Weight, Shoulders, Chest, Left Bicep, Right Bicep, Left Forearm, ' +
            'Right Forearm, Upper Abs, Waist, Lower Abs, Hips, Left Thigh, Right Thigh, ' +
            'Left Calf, Right Calf.',
      run: (cmd) => measure(cmd)
    }

  };


  window.LIFEHUB_ACTIONS = {

    describe() {
      const own = Object.keys(ACTIONS).map(k => "  " + ACTIONS[k].spec);
      return prior.describe() + "\n\n" + [
        "You can also act on the Fitness Centre. Same fenced block:",
        ""
      ].concat(own).concat([
        "",
        "You CANNOT log or score a workout — that is done by tapping FINISH in the",
        "Active Session, because the points, PRs and level-ups are calculated there.",
        "If she says she has finished training, tell her the session needs finishing",
        "in the app; do not try to record it."
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

})();
