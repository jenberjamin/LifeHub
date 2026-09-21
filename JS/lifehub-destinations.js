/* LifeHub — where the screens are.
   ────────────────────────────────────────────────────────────────
   One list of every place navigation can send you. Alexa had the only
   copy of this, buried inside NavigationIntentHandler in the Lambda,
   which is why Poppy couldn't navigate at all — the mechanism was
   fine, she just had nowhere to send anyone.

   Load this BEFORE JS/poppy/PoppyEngine-navigate.js.

   ── PATHS ARE RELATIVE TO THE PROJECT ROOT ───────────────────────
   lifehub-navigation-core.js resolves them against LIFEHUB_ROOT, which
   it derives from its own /JS/ location. Never write "../" here.

   Folder casing MATTERS. It only looks optional because file:// on
   Windows is forgiving; the day this is served over HTTP a lowercase
   "hubs/" is a 404. Every path below was checked against the real
   filesystem, casing included. If you add one, check it the same way.

   ── THE LAMBDA STILL HAS ITS OWN COPY ────────────────────────────
   Same bind as the prestige mirror: "Alexa Skill Code" deploys to
   Lambda on its own and cannot reach ../JS/ at runtime, so the Lambda
   keeps a second copy of this map and always will.

   ADD A DESTINATION HERE, ADD IT THERE TOO — Alexa Skill Code/index.js,
   inside destinationMap. Otherwise Poppy opens a page Alexa insists
   doesn't exist, which is a confusing afternoon.

   ── ONE-WAY DESTINATIONS ─────────────────────────────────────────
   Arriving somewhere needs nothing of the destination — the jump is
   performed by the page you're LEAVING, which is the one running the
   listener. So a page can be navigated to whether or not it loads
   lifehub-navigation-core.js.

   Leaving is the other half. These are currently one-way: you can be
   sent in by voice, but you'll have to click your way out.

     Scribble (all pages)   — has a service worker and its own boot
                              gate; wiring a second Firebase listener
                              into it deserves its own sitting-down.
     SEE-YOU-LATTE (all)    — a standalone app with its own server.

   ── ALIASES ──────────────────────────────────────────────────────
   Deliberately NOT sent to the model. Poppy picks an id out of the
   vocabulary() list using her own read of what Jen meant — she's far
   better at "my period tracker" → FLO than any keyword list. The
   aliases are the safety net underneath that, for when she answers
   with a spoken name instead of the id, or with the right words in
   the wrong shape.
*/

(function () {

  /* id, url, the name Poppy says out loud, and the fallbacks find()
     will accept. Keep `name` short — it gets spoken back to Jen. */
  const LIST = [

    /* ── The spine ── */
    { id: "MAIN",        url: "LifeHub.html",            name: "LifeHub",
      aliases: ["main", "home", "dashboard", "front page", "lifehub"] },
    { id: "HOMESCREEN",  url: "LifeHub-HomeScreen.html", name: "the Home Screen",
      aliases: ["home screen", "homescreen", "wallpaper", "the wallpaper", "screensaver", "ambient"] },
    { id: "TRACKERS",    url: "LifeHub-trackers.html",   name: "Trackers",
      aliases: ["tracker", "trackers", "my trackers", "tracker hub"] },
    { id: "HUBS",        url: "LifeHub-hubs.html",       name: "Hubs",
      aliases: ["hub", "hubs", "my hubs"] },

    /* ── Trackers ── */
    { id: "SLEEP",       url: "Trackers/Sleep/LifeHub-tracker-sleep.html", name: "the Sleep tracker",
      aliases: ["sleep", "sleep tracker", "bedtime", "my sleep"] },
    { id: "HYDRATION",   url: "Trackers/Hydration/LifeHub-tracker-hydration.html", name: "the Hydration tracker",
      aliases: ["water", "hydration", "water tracker", "hydration tracker", "my water"] },
    { id: "FLO",         url: "Trackers/FLO/LifeHub-tracker-FLO.html", name: "FLO",
      aliases: ["flo", "period", "period tracker", "cycle", "my cycle"] },
    { id: "SELF",        url: "Trackers/Self-upkeep/LifeHub-tracker-self-upkeep.html", name: "Self-upkeep",
      aliases: ["self", "self upkeep", "self care", "selfcare", "my upkeep"] },
    { id: "HOME-UPKEEP", url: "Trackers/Home-upkeep/LifeHub-tracker-home-upkeep.html", name: "Home upkeep",
      aliases: ["home upkeep", "chores", "cleaning", "housework", "sanitation"] },

    /* ── The bank ── */
    { id: "BANK",         url: "LifeHub-prestige-bank.html", name: "the Prestige Bank",
      aliases: ["bank", "prestige", "prestige bank", "my prestige"] },
    { id: "NETWORTH",     url: "LifeHub-prestige-bank-networth.html", name: "Net Worth",
      aliases: ["net worth", "networth", "worth"] },
    { id: "TRANSACTIONS", url: "LifeHub-prestige-bank-transactions.html", name: "Transactions",
      aliases: ["transactions", "ledger", "transaction history", "spending"] },

    /* ── Fitness Centre ── */
    { id: "FITNESS",                   url: "Hubs/FitnessCentre/FITNESS-CENTRE.html", name: "the Fitness Centre",
      aliases: ["fitness", "gym", "fitness centre", "fitness center", "workout"] },
    { id: "FITNESS-MEASUREMENT",       url: "Hubs/FitnessCentre/fitness-centre-measurement.html", name: "Measurements",
      aliases: ["measurements", "measurement", "my measurements", "body measurements"] },
    { id: "FITNESS-GALLERY",           url: "Hubs/FitnessCentre/fitness-centre-gallery.html", name: "the Fitness gallery",
      aliases: ["fitness gallery", "progress photos", "gym gallery"] },
    { id: "FITNESS-EXERCISE-INDEX",    url: "Hubs/FitnessCentre/fitness-centre-exercise_index.html", name: "the Exercise index",
      aliases: ["exercise index", "exercises", "exercise list"] },
    { id: "FITNESS-HISTORY",           url: "Hubs/FitnessCentre/fitness-centre-history_log.html", name: "the Fitness history log",
      aliases: ["fitness history", "workout history", "history log", "past workouts"] },
    { id: "FITNESS-PROGRESS-TRACKER",  url: "Hubs/FitnessCentre/fitness-centre-progress_tracker.html", name: "the Progress tracker",
      aliases: ["progress tracker", "fitness progress", "my progress"] },
    { id: "FITNESS-TRAINING-DECK",     url: "Hubs/FitnessCentre/fitness-centre-training_deck.html", name: "the Training deck",
      aliases: ["training deck", "training", "my routines"] },
    { id: "FITNESS-CALENDAR",          url: "Hubs/FitnessCentre/fitness-centre-calendar.html", name: "the Fitness calendar",
      aliases: ["fitness calendar", "workout calendar", "gym calendar"] },
    { id: "FITNESS-ACTIVE-SESSION",    url: "Hubs/FitnessCentre/fitness-centre-active_session.html", name: "the active session",
      aliases: ["active session", "current workout", "start workout", "my session"] },

    /* ── PassHub ── */
    { id: "PASSHUB",               url: "Hubs/PassHub/PassHub-landing_page.html", name: "PassHub",
      aliases: ["passhub", "passwords", "vault", "my vault"] },
    { id: "PASSHUB-LOGINS",        url: "Hubs/PassHub/PassHub-logins.html", name: "PassHub Logins",
      aliases: ["logins", "my logins", "passwords list", "accounts"] },
    { id: "PASSHUB-NOTES",         url: "Hubs/PassHub/PassHub-notes.html", name: "PassHub Notes",
      aliases: ["secure notes", "passhub notes", "private notes"] },
    { id: "PASSHUB-SUBSCRIPTIONS", url: "Hubs/PassHub/PassHub-subscriptions.html", name: "Subscriptions",
      aliases: ["subscriptions", "my subscriptions", "recurring"] },
    { id: "PASSHUB-DOCUMENTS",     url: "Hubs/PassHub/PassHub-docs.html", name: "Documents",
      aliases: ["documents", "docs", "my documents", "papers"] },
    { id: "PASSHUB-CONTACTS",      url: "Hubs/PassHub/PassHub-connections.html", name: "Contacts",
      aliases: ["contacts", "connections", "my contacts", "people"] },
    { id: "PASSHUB-ENTRY",         url: "Hubs/PassHub/PassHub-entry.html", name: "the PassHub entry page",
      aliases: ["passhub entry", "vault entry"] },
    { id: "PASSHUB-ABOUT",         url: "Hubs/PassHub/PassHub-about.html", name: "About PassHub",
      aliases: ["about passhub", "passhub about"] },

    /* ── LibraryHub ── */
    { id: "LIBRARYHUB",             url: "Hubs/LibraryHub/LibraryHub.html", name: "LibraryHub",
      aliases: ["library", "libraryhub", "books", "my books"] },
    { id: "LIBRARYHUB-COLLECTIONS", url: "Hubs/LibraryHub/LibraryHub-Collections.html", name: "Library collections",
      aliases: ["library collections", "book collections", "my collections"] },
    { id: "READING-ROOM",           url: "Hubs/LibraryHub/Reading_Room.html", name: "the Reading Room",
      aliases: ["reading room", "reading", "read"] },

    /* ── CinemaHub ── */
    { id: "CINEMAHUB",             url: "Hubs/CinemaHub/CinemaHub.html", name: "CinemaHub",
      aliases: ["cinema", "cinemahub", "movies", "films", "shows"] },
    { id: "CINEMAHUB-COLLECTIONS", url: "Hubs/CinemaHub/CinemaHub-Collections.html", name: "Cinema collections",
      aliases: ["cinema collections", "movie collections", "watchlist"] },

    /* ── The rest ── */
    { id: "INSPOHUB", url: "Hubs/InspoHub/InspoHub.html", name: "InspoHub",
      aliases: ["inspo", "inspohub", "inspiration", "mood board", "moodboard"] },

    { id: "FOODHUB",            url: "Hubs/FoodHub/FoodHub.html", name: "FoodHub",
      aliases: ["food", "foodhub", "meals", "eating", "what i ate"] },
    { id: "FOODHUB-HISTORY",    url: "Hubs/FoodHub/food-history.html", name: "the Food history",
      aliases: ["food history", "meal history", "what i've eaten"] },
    { id: "FOODHUB-FOODLIST",   url: "Hubs/FoodHub/food-list.html", name: "the Food list",
      aliases: ["food list", "foodlist", "my foods"] },
    { id: "FOODHUB-STATISTICS", url: "Hubs/FoodHub/food-statistics.html", name: "Food statistics",
      aliases: ["food statistics", "food stats", "nutrition stats"] },

    /* ── Scribble ──
       One-way for now (see the header). Its own boot gate decides
       whether she actually gets in, so sending her here is safe
       regardless of whether the notebook is unlocked. */
    { id: "SCRIBBLE",         url: "Hubs/Scribble/Scribble.html", name: "Scribble",
      aliases: ["scribble", "notebook", "my notebook", "notes", "writing"] },
    { id: "SCRIBBLE-PROJECT", url: "Hubs/Scribble/Scribble-project.html", name: "the Scribble project view",
      aliases: ["scribble project", "my project", "project view"] },
    { id: "SCRIBBLE-ARCHIVE", url: "Hubs/Scribble/Scribble-archive.html", name: "the Scribble archive",
      aliases: ["scribble archive", "archive", "archived notes"] },
    { id: "SCRIBBLE-BIN",     url: "Hubs/Scribble/Scribble-recycle-bin.html", name: "the Scribble recycle bin",
      aliases: ["recycle bin", "scribble bin", "deleted notes", "trash"] },

    /* ── Tools ── */
    { id: "WORDBOOK", url: "Tools/WordBook/WordBook.html", name: "WordBook",
      aliases: ["wordbook", "words", "vocabulary", "my words"] },
    { id: "TAGBOOK",  url: "Tools/WordBook/TagBook-editor.html", name: "the TagBook editor",
      aliases: ["tagbook", "tags", "tag editor"] },

    /* ── Standalone ── One-way (see the header). */
    { id: "SEE-YOU-LATTE",         url: "Standalone/SEE-YOU-LATTE/See-You-Latte.html", name: "See You Latte",
      aliases: ["see you latte", "latte", "syl", "cafe", "coffee shop"] },
    { id: "SEE-YOU-LATTE-ROOMS",   url: "Standalone/SEE-YOU-LATTE/See-You-Latte-Rooms.html", name: "See You Latte Rooms",
      aliases: ["latte rooms", "rooms"] },
    { id: "SEE-YOU-LATTE-LIBRARY", url: "Standalone/SEE-YOU-LATTE/See-You-Latte-Library.html", name: "the See You Latte library",
      aliases: ["latte library"] }
  ];

  /* Lowercase, strip punctuation, collapse separators. "Home-Upkeep",
     "home upkeep" and "home_upkeep" all land on the same string. */
  function norm(s) {
    return String(s == null ? "" : s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  const BY_ID = {};
  LIST.forEach(d => { BY_ID[d.id] = d; });

  /* Exact id → exact alias → name → contained-in. The last step is the
     loose one and it's last on purpose: "food" must not win FOODHUB
     when she said FOODHUB-HISTORY. Longer aliases are tried first for
     the same reason. */
  const INDEX = [];
  LIST.forEach(d => {
    INDEX.push({ key: norm(d.id), d });
    INDEX.push({ key: norm(d.name), d });
    (d.aliases || []).forEach(a => INDEX.push({ key: norm(a), d }));
  });
  INDEX.sort((a, b) => b.key.length - a.key.length);

  function find(said) {
    const q = norm(said);
    if (!q) return null;

    if (BY_ID[String(said).trim().toUpperCase()]) return BY_ID[String(said).trim().toUpperCase()];

    for (const row of INDEX) if (row.key === q) return row.d;
    for (const row of INDEX) {
      /* Three is the floor. The match is whole-word bounded either
         side, so a short key can't hide inside a longer word — but
         two-letter keys would still catch far too much ordinary
         English. "flo", "gym" and "syl" all need to survive this. */
      if (row.key.length < 3) continue;
      if ((" " + q + " ").indexOf(" " + row.key + " ") !== -1) return row.d;
    }
    return null;
  }

  /* The id list handed to the model. Ids and spoken names only — the
     aliases stay here, so the prompt cost doesn't scale with how many
     ways Jen might phrase a thing. */
  function vocabulary() {
    return LIST.map(d => d.id + " (" + d.name + ")").join(", ");
  }

  window.LIFEHUB_DESTINATIONS = {
    list: LIST.slice(),
    byId: id => BY_ID[String(id || "").trim().toUpperCase()] || null,
    find,
    vocabulary,
    count: LIST.length
  };

})();
