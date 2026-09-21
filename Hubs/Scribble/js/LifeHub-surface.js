/* LifeHub — ACTIVE SURFACE
   ────────────────────────────────────────────────────────────────
   Tells Poppy which app you're looking at, so you don't have to
   say it. "Rename this to Draft 2" lands on the right thing.

   ── TO ADD IT TO A PAGE ──────────────────────────────────────────
   ONE line at the bottom of the page, above its own scripts:

     <script src="../../js/LifeHub-surface.js"></script>

   Adjust the ../ for how deep the page sits. Nothing else — the
   Firebase SDK loads itself, and the page identifies itself from
   the PAGES map below.

   A page not in the map still works: the app is guessed from the
   filename and the surface reads "unknown section". To pin it
   exactly, either add it to the map or tag the script:

     <script src="../../js/LifeHub-surface.js"
             data-app="Scribble" data-surface="Project"></script>

   ── ONE DOCUMENT PER DEVICE ──────────────────────────────────────
   The tablet, TV and monitor each get their own document. Poppy
   uses whichever was focused most recently, so a tracker left open
   on the TV can't steal context from the screen you're typing on.

   Name a device once, from its own console:
       LIFEHUB_SURFACE.name("TV")
*/

(function () {

  /* Poppy's own Firebase project — deliberately not the app's, so
     every app writes to one place and Poppy makes one read. */
  const POPPY_CFG = {
    apiKey:            "AIzaSyAx_5K2xAS27b7w5Hxpn_x-uYruW8VhQwU",
    authDomain:        "poppy-e510a.firebaseapp.com",
    projectId:         "poppy-e510a",
    storageBucket:     "poppy-e510a.firebasestorage.app",
    messagingSenderId: "257678903570",
    appId:             "1:257678903570:web:ebb7f7c2b15a7c17bb0bcb"
  };

  const SDK = [
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"
  ];

  /* ══════════════════════════════════════════════════════
     PAGES — generated from LifeHub-search.js
     ══════════════════════════════════════════════════════
     Same names and sections you already use there, so Poppy
     hears your vocabulary. When you add a page to the search
     registry, add it here too. */

  const PAGES = {
    /* RENAMED 2026-09-17 — this key was "LifeHub-Wallpaper.html", a file
       that does not exist anywhere in LifeHub. The home screen is
       LifeHub-HomeScreen.html, which every other reference in the repo
       already uses (the search registry, lifehub-destinations.js, the
       Alexa skill, and the nav button in every hub and tracker).

       "Wallpaper" is a TAG on the home screen's search entry, not its
       filename, which is most likely where the slip came from.

       The cost of the typo: identify() found no match, fell through to
       the GUESS list, and reported the home screen as "LifeHub /
       unknown section" — so Poppy could not name the page she lives on. */
    "LifeHub-HomeScreen.html":                     { app: "LifeHub",           surface: "Home Screen" },
    "LifeHub.html":                                { app: "LifeHub",           surface: "Lobby" },
    "LifeHub-hubs.html":                           { app: "LifeHub",           surface: "Portal" },
    "Scribble.html":                               { app: "Scribble",          surface: "Workshop" },
    "Scribble-archive.html":                       { app: "Scribble",          surface: "Archive" },
    "Scribble-recycle-bin.html":                   { app: "Scribble",          surface: "Recycle Bin" },
    "PassHub.html":                                { app: "PassHub",           surface: "App" },
    "PassHub-about.html":                          { app: "PassHub",           surface: "About Me" },
    "PassHub-logins.html":                         { app: "PassHub",           surface: "Logins" },
    "PassHub-docs.html":                           { app: "PassHub",           surface: "Documents" },
    "PassHub-subscriptions.html":                  { app: "PassHub",           surface: "Subscriptions" },
    "PassHub-connections.html":                    { app: "PassHub",           surface: "Contacts" },
    "PassHub-notes.html":                          { app: "PassHub",           surface: "Secure Notes" },
    "PassHub-entry.html":                          { app: "PassHub",           surface: "Entries" },
    "FITNESS-CENTRE.html":                         { app: "Fitness Centre",    surface: "App" },
    "fitness-centre-history_log.html":             { app: "Fitness Centre",    surface: "History Dashboard" },
    "fitness-centre-measurement.html":             { app: "Fitness Centre",    surface: "Measurements" },
    "fitness-centre-gallery.html":                 { app: "Fitness Centre",    surface: "Gallery" },
    "fitness-centre-exercise_index.html":          { app: "Fitness Centre",    surface: "Exercises Index" },
    "fitness-centre-calendar.html":                { app: "Fitness Centre",    surface: "Calendar" },
    "fitness-centre-active_session.html":          { app: "Fitness Centre",    surface: "Active Session" },
    "fitness-centre-training_deck.html":           { app: "Fitness Centre",    surface: "Workout Deck" },
    "fitness-centre-progress_tracker.html":        { app: "Fitness Centre",    surface: "Progress Tracker" },
    "See-You-Latte.html":                          { app: "See You Latte",     surface: "App" },
    "See-You-Latte-Rooms.html":                    { app: "See You Latte",     surface: "Rooms" },
    "See-You-Latte-Chats.html":                    { app: "See You Latte",     surface: "Chats" },
    "See-You-Latte-World.html":                    { app: "See You Latte",     surface: "Worldbuilding" },
    "See-You-Latte-Studio.html":                   { app: "See You Latte",     surface: "Studio" },
    "See-You-Latte-Library.html":                  { app: "See You Latte",     surface: "Library" },
    "LibraryHub.html":                             { app: "LibraryHub",        surface: "App" },
    "LibraryHub-Collections.html":                 { app: "LibraryHub",        surface: "Collections" },
    "Reading_Room.html":                           { app: "LibraryHub",        surface: "Reading Room" },
    "CinemaHub.html":                              { app: "CinemaHub",         surface: "App" },
    "CinemaHub-Collections.html":                  { app: "CinemaHub",         surface: "Collections" },
    "FoodHub.html":                                { app: "FoodHub",           surface: "App" },
    "food-list.html":                              { app: "FoodHub",           surface: "Food List" },
    "food-statistics.html":                        { app: "FoodHub",           surface: "Statistics" },
    "food-history.html":                           { app: "FoodHub",           surface: "History" },
    "InspoHub.html":                               { app: "InspoHub",          surface: "App" },
    "LifeHub-tracker-sleep.html":                  { app: "Sleep",             surface: "Tracker" },
    "LifeHub-mobile-sleep.html":                   { app: "Sleep",             surface: "Mobile Version" },
    "LifeHub-tracker-hydration.html":              { app: "Hydration",         surface: "Tracker" },
    "LifeHub-mobile-hydration.html":               { app: "Hydration",         surface: "Mobile Version" },
    "LifeHub-tracker-FLO.html":                    { app: "FLO",               surface: "Tracker" },
    "LifeHub-mobile-flo.html":                     { app: "FLO",               surface: "Mobile Version" },
    "LifeHub-mobile-home-upkeep.html":             { app: "Home Upkeep",       surface: "Mobile Version" },
    "LifeHub-tracker-self-upkeep.html":            { app: "Self Upkeep",       surface: "Tracker" },
    "LifeHub-mobile-self-upkeep.html":             { app: "Self Upkeep",       surface: "Mobile Version" },
    "Sims_4_Gallery -Version_14 - Gameplay Path.html": { app: "Sims 4 HQ",         surface: "App" },
    "gemini-entry-counter.html":                   { app: "Gemini Entry Counter", surface: "Tool" },
    "PoppyEngine-Editor.html":                     { app: "Poppy Engine Editor", surface: "Tool" },
    "chronicle_v7.html":                           { app: "Chronicle",         surface: "Tool" },
    "WordBook.html":                               { app: "Word Book",         surface: "Tool" },
    "TagBook-editor.html":                         { app: "TagBook Editor",    surface: "Tool" },
    "gemini-json-builder.html":                    { app: "Fine Tuning Gemini Editor", surface: "Tool" },
  };

  /* Anything not in PAGES — a new page, or one you haven't
     registered yet. Filename prefix is enough to get the app right;
     the section stays unknown until you map it. */
  const GUESS = [
    [/^scribble/i,          "Scribble"],
    [/^passhub/i,           "PassHub"],
    [/^fitness[-_]?centre/i,"Fitness Centre"],
    [/^see-you-latte/i,     "See You Latte"],
    [/^cinemahub/i,         "CinemaHub"],
    [/^libraryhub/i,        "LibraryHub"],
    [/^foodhub|^food-/i,    "FoodHub"],
    [/^inspohub/i,          "InspoHub"],
    [/^chronicle/i,         "Chronicle"],
    [/^wordbook/i,          "Word Book"],
    [/^lifehub/i,           "LifeHub"]
  ];

  const DEVICE_KEY = "lifehub.deviceId";
  const NAME_KEY   = "lifehub.deviceName";

  const me   = document.currentScript;
  const file = (location.pathname.split("/").pop() || "").trim();

  function identify() {
    /* An explicit tag always wins — it's the escape hatch. */
    if (me && me.dataset.app) {
      return { app: me.dataset.app, surface: me.dataset.surface || "" };
    }
    if (PAGES[file]) return PAGES[file];

    for (const [rx, app] of GUESS) {
      if (rx.test(file)) return { app: app, surface: "unknown section" };
    }
    return { app: file.replace(/\.html?$/i, "") || "unknown", surface: "" };
  }

  const WHERE = identify();

  function deviceId() {
    let id = null;
    try { id = localStorage.getItem(DEVICE_KEY); } catch (e) {}
    if (!id) {
      id = "dev_" + Math.random().toString(36).slice(2, 10);
      try { localStorage.setItem(DEVICE_KEY, id); } catch (e) {}
    }
    return id;
  }

  function deviceName() {
    try { return localStorage.getItem(NAME_KEY) || "this device"; }
    catch (e) { return "this device"; }
  }

  /* Loads whichever pieces of the compat SDK the page hasn't already
     got. Scribble's pages use ES modules; those are a separate instance
     and the two don't interfere.

     Both are checked separately, and that matters: the trackers load
     firebase-app-compat and firebase-DATABASE-compat, so `firebase`
     exists on them while `firebase.firestore` doesn't. Testing only
     for initializeApp returned early on exactly those pages and left
     store() throwing on a Firestore that was never loaded — Poppy
     couldn't see the tracker or send it anything.

     ── BROUGHT ACROSS 2026-09-17 ────────────────────────────────
     This copy still had the old single `initializeApp` test. The
     version in JS/poppy/LifeHub-surface.js had been fixed and this
     one never received it — the only way the two files had drifted.

     ── ONE LOAD, NOT THREE ─────────────────────────────────────
     Also fixed 2026-09-17: the check above is a snapshot, and three
     callers take it within the same millisecond on a cold page:

        enter("load")  → write()   → loadSDK()
        watchDialog()  → write()   → loadSDK()   (it sets lastWrite = 0
                                                  to skip the throttle)
        boot()         → listen()  → loadSDK()

     None of them had finished appending a script when the next one
     looked, so `need` was still non-empty every time and the same two
     SDK files went into <head> two or three times over. The second
     copy of firebase-app-compat to execute prints

        "Firebase is already defined in the global scope."

     which was the mystery warning on every page. Harmless, but it also
     meant fetching the SDK repeatedly for nothing.

     Holding the in-flight promise makes the later callers wait on the
     first load instead of starting their own. Cleared when it settles,
     so a failed load can still be retried. */
  let sdkLoading = null;

  function loadSDK() {
    const need = SDK.filter((src, i) =>
      i === 0 ? !(window.firebase && firebase.initializeApp)
              : !(window.firebase && firebase.firestore));

    if (!need.length) return Promise.resolve();

    /* Something is already fetching. Wait for it rather than racing it —
       and note this is checked AFTER `need`, so a page that has app but
       not firestore still joins the load already under way. */
    if (sdkLoading) return sdkLoading;

    sdkLoading = need.reduce((chain, src) => chain.then(() => new Promise((ok, no) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = ok;
      s.onerror = () => no(new Error("could not load " + src));
      document.head.appendChild(s);
    })), Promise.resolve());

    /* Released on settle, success or failure. The `need` test above is
       what stops a completed load from running again. */
    sdkLoading = sdkLoading.finally(() => { sdkLoading = null; });

    return sdkLoading;
  }

  function store() {
    let app;
    try { app = firebase.app("poppy"); }
    catch (e) { app = firebase.initializeApp(POPPY_CFG, "poppy"); }
    return app.firestore();
  }

  /* Extra detail a page can set for itself — which project is open,
     which file is being edited:
       LIFEHUB_SURFACE.detail({ project: "Scribble Mobile" }) */
  let detail = {};
  let lastWrite = 0;
  let isOpen    = true;      // the page exists — false only once it closes
  let lastFocus = Date.now();// used to break ties between open pages

  /* ── CAN POPPY ACTUALLY BE REACHED? ──────────────────────────
     Added 2026-09-17. null = not tried yet · true = the last write
     landed · false = it was refused or failed.

     This exists because the dot used to lie. dot() is called BEFORE
     the write is attempted, so it went green and said "Poppy can act
     here" whether or not anything reached her — and when Poppy's own
     Firestore rules refuse this project (the surface writes and the
     commands listener are both unauthenticated), the only sign was a
     console warning nobody had a reason to open.

     A green dot over a dead channel costs an afternoon of debugging
     voice commands that were never going to arrive. Now the dot has
     a third state and says which one it is. */
  let reachable = null;

  /* Focus fires constantly. A repeat inside two seconds carries no
     new information and just burns quota. */
  async function write(reason) {
    const now = Date.now();
    /* A close must never be swallowed by the throttle — a stuck
       open:true is the one failure that misleads Poppy. */
    if (isOpen && now - lastWrite < 2000) return;
    lastWrite = now;

    dot();

    try {
      await loadSDK();
      await store().collection("surface").doc(deviceId()).set({
        app:     WHERE.app,
        surface: WHERE.surface,
        device:  deviceName(),
        detail:  detail,

        /* open      — the page is loaded. Only a close clears this.
           visible   — not minimised or buried behind another tab.
           lastFocus — when it last had focus, for breaking ties.

           Focus is deliberately NOT what makes a page active: talking
           to Poppy means focusing her window, which blurs whatever
           you're asking about. */
        open:      isOpen,
        visible:   !document.hidden,
        lastFocus: lastFocus,

        reason:  reason,
        at:      Date.now()
      });

      /* It landed. Repaint only when the answer CHANGES, so the steady
         state costs nothing. */
      if (reachable !== true) { reachable = true; dot(); }
    } catch (e) {
      /* Never break the app this is riding in. */
      if (reachable !== false) { reachable = false; dot(); }
      console.warn("[Surface] not written:", e.message);
    }
  }

  function enter(reason) {
    isOpen = true;
    if (reason === "focus") lastFocus = Date.now();
    return write(reason);
  }
  function leave(reason) { isOpen = false; return write(reason); }

  /* ── The green light ──────────────────────────────────────────
     A dot in the corner showing exactly what Poppy sees.

     ── THREE STATES, as of 2026-09-17 ───────────────────────────
       grey    this page is not the live one (closed, or hidden
               behind another tab)
       amber   open, but the last write to Poppy's project was
               REFUSED or failed — she cannot see this page and the
               command channel is down. Hover it for the reason.
       green   open, and the last write actually landed.

     It used to be two states, and the green one was a guess: dot()
     runs before the write is attempted, so it lit up regardless.
     Amber is the state that was missing, and it is the one worth
     having — see `reachable` above.

     Turn the dot off per page with data-dot="off". */
  let dotEl = null;

  function dot() {
    if (me && me.dataset.dot === "off") return;
    if (!document.body) return;

    if (!dotEl) {
      dotEl = document.createElement("div");
      dotEl.setAttribute("aria-hidden", "true");
      dotEl.style.cssText =
        "position:fixed;right:8px;bottom:8px;width:7px;height:7px;" +
        "border-radius:50%;z-index:2147483647;pointer-events:none;" +
        "transition:background .25s,box-shadow .25s,opacity .25s;opacity:.75";
      document.body.appendChild(dotEl);
    }

    const open  = isOpen && !document.hidden;
    const where = WHERE.app + (WHERE.surface ? " / " + WHERE.surface : "");

    let colour, glow, note;
    if (!open) {
      colour = "#4a4a4a"; glow = "none";
      note   = " — not open";
    } else if (reachable === false) {
      colour = "#e0a33e"; glow = "0 0 6px rgba(224,163,62,.9)";
      note   = " — open, but Poppy cannot be reached. " +
               "Her project refused the write; see the console.";
    } else if (reachable === null) {
      colour = "#6a6a6a"; glow = "none";
      note   = " — open, still reaching Poppy…";
    } else {
      colour = "#37d67a"; glow = "0 0 6px rgba(55,214,122,.9)";
      note   = " — open, Poppy can act here";
    }

    dotEl.title            = where + note;
    dotEl.style.background = colour;
    dotEl.style.boxShadow  = glow;
  }

  /* ══════════════════════════════════════════════════════
     UI COMMANDS — Poppy's hands, on every page
     ══════════════════════════════════════════════════════
     This file is already the one line every app carries, and it
     already talks to Poppy's project. So the channel lives here
     rather than in any single app: wire a new app in, and "close it"
     works on it the same day.

     Poppy writes a command addressed to ONE device — the screen the
     surface read says is live — and that page runs it and writes back.
     Anything else open stays untouched.

     ── CLOSE AND CONFIRM ARE NOT REGISTERED ─────────────────────────
     They drive the buttons the dialog already has. Clicking CANCEL
     runs whatever CANCEL runs, which is how Scribble's general record
     keeps its unsaved-edits guard without this file knowing it exists.
     A close that called an app's own closeModal() directly would walk
     straight past it.

     ── IF A PAGE NEEDS SOMETHING ELSE ───────────────────────────────
       LIFEHUB_SURFACE.on("save", () => mySave());
     Registered handlers win over the built-ins. */

  const HANDLERS = {};

  /* Where a dialog might be. Broad on purpose — an app that uses none
     of these can add its own with data-dialog on the script tag. */
  const DIALOG_SELECTORS = [
    ".modal-overlay", "dialog[open]", "[role=dialog]",
    ".modal.show", ".modal.open", ".chat-overlay.show", ".panel.open"
  ];

  /* Button text, not button class. Classes differ per app; the words
     on the button are how Jen thinks about them and are consistent. */
  const DISMISS_WORDS = ["cancel", "close", "dismiss", "back", "not now", "no", "×", "✕", "✖"];
  const CONFIRM_WORDS = ["save", "create", "confirm", "ok", "okay", "apply",
                         "done", "yes", "submit", "add", "update", "rename"];

  /* Is this thing actually on screen?

     NOT offsetParent. That is null for any position:fixed element, and a
     modal overlay is always fixed — so the obvious check rejects exactly
     the dialogs it is meant to find. Measured instead: an element with
     real width and height, not display:none, not visibility:hidden, not
     fully transparent. */
  function onScreen(el) {
    if (!el) return false;
    if (el.tagName === "DIALOG") return el.hasAttribute("open");

    const r = el.getBoundingClientRect();
    if (!r || r.width < 1 || r.height < 1) return false;

    const cs = window.getComputedStyle ? getComputedStyle(el) : null;
    if (!cs) return true;
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    if (parseFloat(cs.opacity || "1") < 0.05) return false;
    return true;
  }

  function openDialog() {
    const extra = (me && me.dataset.dialog) ? [me.dataset.dialog] : [];
    for (const sel of DIALOG_SELECTORS.concat(extra)) {
      const found = document.querySelectorAll(sel);
      /* Last match wins. Stacked dialogs append, so the last one in
         the document is the one on top. Walked backwards because an
         app may keep hidden panels in the markup permanently — the
         homescreen does — and the visible one is what matters. */
      for (let i = found.length - 1; i >= 0; i--) {
        if (onScreen(found[i])) return found[i];
      }
    }
    return null;
  }

  function buttonIn(root, words) {
    const all = root.querySelectorAll("button, [role=button], .btn, a.btn");
    for (const b of all) {
      if (b.disabled) continue;
      const label = (b.textContent || "").trim().toLowerCase();
      const aria  = (b.getAttribute("aria-label") || "").trim().toLowerCase();
      if (words.some(w => label === w || aria === w)) return b;
    }
    /* Nothing matched exactly, so allow the word to sit inside a longer
       label — "Save all", "Close panel". Exact is tried first so a
       "Save" can never be beaten by a "Don't save". */
    for (const b of all) {
      if (b.disabled) continue;
      const label = (b.textContent || "").trim().toLowerCase();
      if (words.some(w => w.length > 2 && label.includes(w))) return b;
    }
    return null;
  }

  function pressIn(kind, words, fallbackEsc) {
    const dlg = openDialog();
    if (!dlg) throw new Error("Nothing open to " + kind + ".");

    const btn = buttonIn(dlg, words);
    if (btn) { btn.click(); return; }

    /* Escape is the last resort and only ever for dismissing. There is
       no keyboard equivalent of "save", and guessing at one would be
       the kind of mistake that loses work. */
    if (fallbackEsc) {
      document.dispatchEvent(new KeyboardEvent("keydown",
        { key: "Escape", keyCode: 27, bubbles: true }));
      return;
    }
    throw new Error("I can see a panel but no " + kind + " button on it.");
  }

  const BUILT_IN = {
    close:   () => pressIn("close",   DISMISS_WORDS, true),
    confirm: () => pressIn("save",    CONFIRM_WORDS, false)
  };

  /* A modal being open is something Poppy should know before she speaks,
     not something she discovers by trying. Published on the surface
     record, so it arrives in the same line that says where Jen is. */
  function watchDialog() {
    let was = null;
    const check = () => {
      const dlg = openDialog();
      const now = dlg ? (dialogTitle(dlg) || "open") : null;
      if (now !== was) {
        was = now;
        detail = Object.assign({}, detail);
        if (now) detail.modal = now; else delete detail.modal;
        lastWrite = 0;
        write("modal");
      }
    };
    new MutationObserver(check).observe(document.documentElement,
      { childList: true, subtree: true });
    check();
  }

  function dialogTitle(dlg) {
    const h = dlg.querySelector(".modal-title, .ov-title, .panel-title, h1, h2, h3");
    const t = h && (h.textContent || "").trim();
    return t ? t.slice(0, 40) : null;
  }

  async function runCommand(db, id, cmd) {
    const ref = db.collection("commands").doc(id);
    try {
      const fn = HANDLERS[cmd.action] || BUILT_IN[cmd.action];
      if (!fn) {
        /* Naming the app matters. These commands go to whatever screen is
           live, so "I can't do that" leaves Jen guessing whether the
           command was wrong or the screen was. */
        throw new Error(WHERE.app
          ? "There's nothing like that in " + WHERE.app + "."
          : "I can't do that on this screen.");
      }

      /* ── A HANDLER CAN NOW ANSWER, NOT JUST SUCCEED ──────────────
         Added 2026-09-17. This used to be a bare `await fn(cmd)` and
         the return value was dropped on the floor, so the only thing
         a page could ever tell Poppy was "it worked".

         That made a whole class of command impossible: anything that
         ASKS the page something. A voice command cannot safely delete
         an item by the name Jen said — names repeat across folders —
         but it can ask the page "which one is that, exactly?", have
         the page answer with a path and an id, and then act on the id.
         The answer is the half that was missing.

         Strings only, deliberately. Whatever comes back here is what
         Poppy ends up saying, and a string is the one shape that is
         both readable out loud and safe to pass through a layer that
         does not know what it means. A handler that wants to hand back
         an id puts it IN the sentence. */
      const answer = await fn(cmd);

      const patch = { status: "done", handledAt: Date.now() };
      if (typeof answer === "string" && answer) patch.result = answer;
      await ref.update(patch);
    } catch (err) {
      try {
        await ref.update({
          status: "failed",
          error:  (err && err.message) || "That didn't work.",
          handledAt: Date.now()
        });
      } catch (e) { /* Poppy times out and says so */ }
    }
  }

  const STARTED_AT = Date.now();
  const claimed = {};

  async function listen() {
    await loadSDK();
    store().collection("commands")
      .where("device", "==", deviceId())
      .where("status", "==", "pending")
      .onSnapshot(snap => {
        snap.docChanges().forEach(ch => {
          if (ch.type !== "added") return;
          const id = ch.doc.id;
          if (claimed[id]) return;

          const cmd = ch.doc.data();
          const at = typeof cmd.at === "number" ? cmd.at : 0;
          /* Commands from before this page loaded, or older than half a
             minute, belong to a moment that has passed. Firing late is
             worse than not firing — a panel that shuts by itself two
             minutes on is indistinguishable from a bug. */
          if (!at || at < STARTED_AT || Date.now() - at > 30000) return;

          claimed[id] = true;
          runCommand(store(), id, cmd);
        });
      }, err => {
        /* The channel is the half that matters most: without it Poppy
           can see the page and still not act on it. Same amber dot —
           "reachable" means reachable in both directions. */
        if (reachable !== false) { reachable = false; dot(); }
        console.warn("[Surface] commands:", err.message);
      });
  }


  window.LIFEHUB_SURFACE = {
    where: WHERE,
    write: write,
    get open(){ return isOpen; },

    /* ── ADDED 2026-09-17 ─────────────────────────────────────
       "Scribble / Workshop" — the one readable line for anything
       that wants to stamp where it happened.

       js/scribble-access-log.js has been reading LIFEHUB_SURFACE
       .current since it was written, and it never existed: the
       object only ever exposed `where`, the {app, surface} pair.
       So every access-log row ever written recorded surface: null.
       Added here rather than patched there — it is the surface's
       job to say where it is, and the next thing to reach for
       `.current` should find it. */
    get current() {
      if (!WHERE || !WHERE.app) return null;
      return WHERE.app + (WHERE.surface ? " / " + WHERE.surface : "");
    },

    /* true / false / null — see the note on `reachable`. Worth a
       glance in the console before blaming a voice command. */
    get reachable(){ return reachable; },

    name(n) {
      try { localStorage.setItem(NAME_KEY, String(n || "").trim()); } catch (e) {}
      lastWrite = 0;
      return write("renamed");
    },

    detail(obj) {
      detail = obj || {};
      lastWrite = 0;
      return write("detail");
    },

    /* Register a handler for this page. Overrides the built-in of the
       same name, so an app with a real save can claim "confirm". */
    on(name, fn) {
      if (typeof fn === "function") HANDLERS[String(name)] = fn;
      return this;
    },

    /* ── RUN A COMMAND BY HAND ────────────────────────────────
       Added 2026-09-17.

       Fires a registered handler exactly as an arriving command
       would: same handler, same argument, same return value. The
       only thing it skips is Firestore.

       Which is the point. Poppy's project has its own rules, and
       while they refuse this app nothing can be delivered — so
       without this there was no way to tell a broken handler from a
       blocked channel. They are completely different problems and
       they looked identical.

           await LIFEHUB_SURFACE.test('where')
           await LIFEHUB_SURFACE.test('file_locate', { name: 'notes' })
           await LIFEHUB_SURFACE.test('file_bin',    { ref: 'f3K9qLm2' })

       Returns whatever the handler returns — the same sentence Poppy
       would have said. Throws the same refusal she would have heard,
       so a wrong name or a stale ref reads exactly as it would in
       conversation.

       Safe to leave in. It reaches only handlers this page already
       registered, so it can do nothing a voice command could not
       already do. */
    test(action, cmd) {
        const fn = HANDLERS[String(action)] || BUILT_IN[String(action)];
        if (!fn) {
            const known = Object.keys(HANDLERS).concat(Object.keys(BUILT_IN)).sort();
            return Promise.reject(new Error(
                'No handler for "' + action + '" on this page. This page knows: ' +
                (known.length ? known.join(', ') : '(none)')));
        }
        return Promise.resolve(fn(cmd || {}));
    },

    /* Everything this page can be told to do. Worth a look before
       writing vocabulary for it. */
    can() {
        return Object.keys(HANDLERS).concat(Object.keys(BUILT_IN)).sort();
    },

    /* What Poppy would find if she sent close right now — for checking
       in the console rather than by deleting something. */
    probe() {
      const dlg = openDialog();
      if (!dlg) return "no dialog open";
      return {
        title:   dialogTitle(dlg) || "(untitled)",
        close:   (buttonIn(dlg, DISMISS_WORDS) || {}).textContent || "(none — Escape)",
        confirm: (buttonIn(dlg, CONFIRM_WORDS) || {}).textContent || "(none)"
      };
    }
  };

  if (document.body) enter("load");
  else document.addEventListener("DOMContentLoaded", () => enter("load"));

  /* The bus and the modal watcher, once the page is up. Failures here
     must never take the app down with them. */
  function boot() {
    try { watchDialog(); } catch (e) { console.warn("[Surface] modal watch:", e.message); }
    listen().catch(e => console.warn("[Surface] commands off:", e.message));
  }
  if (document.body) boot();
  else document.addEventListener("DOMContentLoaded", boot);

  /* Focus only stamps lastFocus. Losing focus is NOT losing presence —
     that was the bug: clicking into Poppy blurred the very app you were
     asking her about. */
  window.addEventListener("focus", () => enter("focus"));

  /* Minimised or buried behind another tab. Still open, just not
     on screen. */
  document.addEventListener("visibilitychange", () => { lastWrite = 0; write("visibility"); });

  /* Closing the tab. This write often doesn't finish — the staleness
     backstop in the read layer is what covers that case. */
  window.addEventListener("pagehide", () => leave("closed"));

})();
