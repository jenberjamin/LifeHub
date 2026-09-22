/* LifeHub — Poppy's navigation.
   ────────────────────────────────────────────────────────────────
   Load AFTER JS/lifehub-destinations.js and after the other
   PoppyEngine-*.js wrappers.

   ── WHY THIS IS SO SHORT ─────────────────────────────────────────
   The hard part was already built and has been running for months.
   JS/lifehub-navigation-core.js sits on every page listening to one
   Realtime Database node, and when something writes

       alexa_updates = { action: "navigate", url: "<path from root>" }

   it resolves the path against the project root and jumps. It handles
   the ghost command left behind on arrival, the PassHub session token,
   a 300ms failsafe so a slow database write can never freeze the
   screen, and the back-button cache. None of that is repeated here.

   Alexa has been writing that node from the Lambda. All Poppy was ever
   missing was permission and a map — so this file is a resolver, a
   one-line write, and a receipt.

   ── ONE SCREEN, NOT EVERY SCREEN (2026-09-21) ────────────────────
   Alexa's writes have no device on them, so every open LifeHub page
   jumps — including the Home Screen Poppy runs on, which took her
   with it. Poppy's writes now name a device, and only that screen
   moves. Jen talks to her on the phone or PC; the TV changes.

   The screens list comes from lifehub_screens, which
   lifehub-navigation-core.js keeps up to date on every page it's on.

   ── WHY IT DOESN'T JUST TAKE A URL ───────────────────────────────
   The obvious spec is {"action":"navigate","url":"Trackers/..."} and it
   would be a mistake. A model that can write an arbitrary path into
   that node can send the browser anywhere — a half-remembered filename,
   a plausible-looking folder that doesn't exist, a page from six
   refactors ago. The failure is silent and lands on a blank screen.

   So the model picks an ID out of a fixed list and the URL is looked
   up here. An id that isn't in the list is refused loudly, which is a
   thing she can say out loud and Jen can correct. Nothing the model
   writes ever reaches the address bar directly.

   ── WHY NOT SILENT ON A MISS ─────────────────────────────────────
   The base runner returns null for an action it doesn't recognise and
   the chat drops it without a word. That was the old navigation
   behaviour by accident: the ↩️ icon promised she could navigate, no
   handler existed, and she'd cheerfully announce a jump that never
   happened. Every failure below throws with something sayable instead.
*/

(function () {

  const prior = window.LIFEHUB_ACTIONS;
  if (!prior || typeof prior.describe !== "function") {
    console.error("[Poppy navigate] LIFEHUB_ACTIONS missing — load this after the other PoppyEngine wrappers.");
    return;
  }

  /* The node lifehub-navigation-core.js listens on. The name is a
     historical accident — it predates Poppy and every page in the
     project already listens to it, so it stays. It means "somebody
     asked for a jump", not "Alexa asked for a jump". */
  const NAV_NODE = "alexa_updates";

  function destinations() {
    if (!window.LIFEHUB_DESTINATIONS) {
      throw new Error("JS/lifehub-destinations.js isn't loaded on this page.");
    }
    return window.LIFEHUB_DESTINATIONS;
  }

  function db() {
    if (!window.POPPY_FETCH || typeof window.POPPY_FETCH.rtdb !== "function") {
      throw new Error("Poppy's Firebase layer isn't loaded.");
    }
    return window.POPPY_FETCH.rtdb("lifehub");
  }

  /* Same filename comparison lifehub-navigation-core.js uses, so the
     two agree about what "already there" means. */
  function currentFile() {
    const href = window.location.href;
    return decodeURIComponent(
      href.substring(href.lastIndexOf("/") + 1).split("?")[0].split("#")[0]
    );
  }

  const fileOf = (url) => url.split("/").pop().split("?")[0].split("#")[0];


  /* ── Which screens are on ─────────────────────────────────────
     Added 2026-09-21. lifehub-navigation-core.js keeps one row per
     device under lifehub_screens — name, page, online — and the
     server flips it offline when the connection drops.

     Held as a live subscription rather than read per message, because
     describe() is synchronous: the list has to already be here when
     the prompt is built. */
  const SCREENS_NODE = "lifehub_screens";
  let screens = {};
  let screensReady = false;

  try {
    db().ref(SCREENS_NODE).on("value",
      s => { screens = s.val() || {}; screensReady = true; },
      e => console.warn("[Poppy navigate] can't see the screens:", e.message));
  } catch (e) {
    console.warn("[Poppy navigate] screens list off:", e.message);
  }

  /* This device. The navigation core on this page made the id. */
  function myId() {
    if (window.LIFEHUB_SCREEN) return window.LIFEHUB_SCREEN.id;
    try { return localStorage.getItem("lifehub.deviceId"); } catch (e) { return null; }
  }

  /* A row that says online but hasn't been rewritten in half a day is a
     connection the server never saw close. Rare, but a TV that's been
     "on" since yesterday is worse than one Poppy admits she can't see. */
  const STALE_MS = 12 * 60 * 60 * 1000;

  function online() {
    const now = Date.now();
    return Object.keys(screens)
      .map(id => Object.assign({ id: id }, screens[id]))
      .filter(s => s && s.online && s.name && (!s.at || now - s.at < STALE_MS));
  }

  /* "Sleep tracker" rather than "LifeHub-tracker-sleep.html". */
  function pageName(file) {
    const d = destinations().list.find(x => fileOf(x.url) === file);
    return d ? d.name : (file || "somewhere");
  }

  /* Where a jump goes when she didn't say. The TV if it's on — that's
     the whole point of driving it from here — otherwise this screen. */
  function defaultScreen() {
    const me = myId();
    const tv = online().find(s => s.tv && s.id !== me);
    return tv || null;
  }

  const HERE_WORDS = ["here", "this", "this screen", "this one", "me", "my screen"];

  /* Returns { id, name, page, here } or throws something sayable. */
  function resolveScreen(said) {
    const me = myId();
    const q = String(said || "").trim().toLowerCase().replace(/^the\s+/, "");

    if (!q) {
      const tv = defaultScreen();
      if (tv) return { id: tv.id, name: tv.name, page: tv.page, here: false };
      return { id: me, name: "here", page: currentFile(), here: true };
    }

    if (HERE_WORDS.indexOf(q) !== -1) {
      return { id: me, name: "here", page: currentFile(), here: true };
    }

    const want = (q === "television" || q === "telly") ? "tv" : q;
    const all = online();
    const hit = all.find(s => String(s.name).toLowerCase() === want) ||
                all.find(s => want === "tv" && s.tv);

    if (!hit) {
      const names = all.filter(s => s.id !== me).map(s => s.name)
        .filter((n, i, a) => a.indexOf(n) === i);
      throw new Error("I can't see " + (want === "tv" ? "the TV" : "“" + said + "”") +
        " — it's off, or on a page I can't steer yet (Scribble, See You Latte)." +
        (names.length ? " Screens I can reach: " + names.join(", ") + "." : ""));
    }
    return { id: hit.id, name: hit.id === me ? "here" : hit.name, page: hit.page, here: hit.id === me };
  }

  /* For the prompt: which screens exist right now, one line. */
  function screensLine() {
    const me = myId();
    if (!screensReady) return "Screens: not known yet — leave `on` out and it goes to this screen.";
    const rows = online().map(s =>
      s.name + (s.id === me ? " (this one, where she's typing)" : "") +
      " — showing " + pageName(s.page));
    return "Screens showing LifeHub right now: " + (rows.length ? rows.join("; ") : "only this one") + ".";
  }


  /* ── Wallpaper on another screen (2026-09-22) ─────────────────
     The wallpaper actions (theme, paint, next…) used to only ever
     touch the Home Screen Poppy was running on, so "change the TV's
     wallpaper to Nexform" did nothing from the phone, and from the PC
     it changed the PC. Now they take `on` like navigate does and go
     down the remote's channel, lifehub_remote/<screen id>, as key
     "wallpaper". The TV's navigation core hands them to the Home
     Screen (see LIFEHUB_WALLPAPER in LifeHub-homescreen.js).

     Names are checked here, before sending, against the same lists
     the Home Screen uses (LifeHub-homescreen-slides.js, -paints.js),
     so a wrong one is refused out loud rather than lost on the TV. */
  const WALL = {
    theme: "theme", paint: "paint", color: "paint", colour: "paint",
    next: "next", prev: "prev", previous: "prev",
    pause: "pause", play: "play", resume: "play", lock: "lock"
  };

  /* True on the Home Screen, where there's a wallpaper right here. */
  const hasWallpaper = () => !!window.LIFEHUB_WALLPAPER;

  function themeList() {
    return Object.keys(window.LIFEHUB_SLIDES || {})
      .filter(k => (window.LIFEHUB_SLIDES[k] || []).length);
  }
  function paintList() {
    return (window.LIFEHUB_PAINTS || []).map(p => p.name);
  }

  /* Just the fields the Home Screen reads, with names in their real
     casing. Throws something sayable on a name that doesn't exist. */
  function cleanWallpaper(act, cmd) {
    if (act === "theme") {
      const want = String(cmd.theme || cmd.name || "").trim().toLowerCase();
      if (want === "random") return { action: "theme", theme: "Random" };
      const hit = themeList().find(t => t.toLowerCase() === want);
      if (!hit) throw new Error("“" + (cmd.theme || cmd.name || "") + "” isn't one of the wallpaper themes." +
        (themeList().length ? " There's " + themeList().join(", ") + " and Random." : ""));
      return { action: "theme", theme: hit };
    }
    if (act === "paint") {
      const want = String(cmd.color || cmd.colour || "").trim().toLowerCase();
      const hit = paintList().find(c => c.toLowerCase() === want);
      if (!hit) throw new Error("“" + (cmd.color || cmd.colour || "") + "” isn't one of the paint colours.");
      return { action: "paint", color: hit };
    }
    return { action: act };
  }

  const RECEIPT = {
    theme: c => "Theme · " + c.theme, paint: c => "Paint · " + c.color,
    next: () => "Next background", prev: () => "Previous background",
    pause: () => "Slideshow paused", play: () => "Slideshow playing", lock: () => "Locked"
  };

  function wallpaper(act, cmd) {
    const said = cmd && (cmd.on || cmd.screen || cmd.device);

    /* On the Home Screen with no `on`: this wallpaper, as it always was. */
    if (hasWallpaper() && !String(said || "").trim()) return prior.run(cmd);

    const screen = resolveScreen(said);
    if (screen.here) {
      if (hasWallpaper()) return prior.run(cmd);
      throw new Error("I can't see the TV — it's off, or on a page I can't steer yet. " +
        "Open LifeHub on it and ask me again.");
    }

    const clean = cleanWallpaper(act, cmd);
    const away = screen.page && screen.page !== "LifeHub-HomeScreen.html";
    return db().ref("lifehub_remote/" + screen.id)
      .set({
        key: "wallpaper",
        cmd: clean,
        n: Math.random().toString(36).slice(2),
        at: firebase.database.ServerValue.TIMESTAMP,
        by: "poppy"
      })
      .then(() => RECEIPT[act](clean) + " on the " + screen.name.replace(/^the\s+/i, "") +
        (away ? " (opening the Home Screen)" : ""))
      .catch(() => { throw new Error("I couldn't reach the database to change it."); });
  }

  /* For the prompt. On the Home Screen she already has the full list
     from the wallpaper's own describe(); she only needs to learn `on`.
     Anywhere else (the phone) she needs the whole list. */
  function wallpaperDescribe() {
    const tv = defaultScreen();
    if (hasWallpaper()) {
      return [
        "## WALLPAPER ON ANOTHER SCREEN",
        "Every wallpaper action above also takes `on`, like navigate. Add it when she",
        "means a different screen's wallpaper, e.g. “change the TV's wallpaper to Nexform”:",
        "",
        '  {"action":"theme","theme":"Nexform","on":"TV"}',
        "",
        "Leave `on` out and it changes this screen's wallpaper, as before."
      ].join("\n");
    }
    return [
      "## THE TV'S WALLPAPER",
      "You can change the Home Screen wallpaper on the TV from here. Same block;",
      "it goes to " + (tv ? "the " + tv.name : "the TV (it isn't on right now, so it would be refused)") +
        ", or add `on` with a screen name from the line above.",
      "If the TV is on another page, it goes back to the Home Screen first.",
      "",
      '  {"action":"theme","theme":"NAME"} — one of: ' + themeList().concat(["Random"]).join(", "),
      '  {"action":"paint","color":"NAME"} — clock and logo colour, one of: ' + paintList().join(", "),
      '  {"action":"next"} / {"action":"prev"} — step the background',
      '  {"action":"pause"} / {"action":"play"} — hold or resume the slideshow',
      '  {"action":"lock"} — locks the TV. You cannot unlock; only Jen can, with her code.',
      "",
      "“Change the wallpaper to Nexform”, “put the space pictures on”, “make the clock",
      "cream” all mean these. Only send one when she asked for a change."
    ].join("\n");
  }


  /* ── Refreshing a screen (2026-09-22) ─────────────────────────
     The remote's Reload button, for when the remote isn't to hand:
     the same { key: "reload" } press down lifehub_remote/<screen id>,
     which the navigation core on that screen turns into a reload of
     whatever page it's showing. */
  function refresh(cmd) {
    const screen = resolveScreen(cmd && (cmd.on || cmd.screen || cmd.device));
    if (screen.here) {
      if (!window.LIFEHUB_SCREEN) {
        throw new Error("I can't see the TV — it's off, or on a page I can't steer yet (Scribble, See You Latte).");
      }
      /* This very screen. A moment's wait so the receipt shows first. */
      setTimeout(() => window.location.reload(), 1500);
      return "Refreshing this screen";
    }
    return db().ref("lifehub_remote/" + screen.id)
      .set({
        key: "reload",
        n: Math.random().toString(36).slice(2),
        at: firebase.database.ServerValue.TIMESTAMP,
        by: "poppy"
      })
      .then(() => "Refreshing the " + screen.name.replace(/^the\s+/i, "") +
        (screen.page ? " (" + pageName(screen.page) + ")" : ""))
      .catch(() => { throw new Error("I couldn't reach the database to refresh it."); });
  }


  /* ── The action ───────────────────────────────────────────────── */

  function navigate(cmd) {
    const said = (cmd && (cmd.to || cmd.destination || cmd.id || cmd.page)) || "";

    /* A raw path instead of an id — the exact thing the header refuses.
       This has to be checked BEFORE the empty test, because a model that
       sends {"action":"navigate","url":"..."} has sent no `to` at all,
       and "I don't know where you want to go" would be a confusing
       thing to say about a message that plainly said where. */
    if (!String(said).trim() && cmd && cmd.url) {
      throw new Error("I go by name, not by path — tell me the screen and I'll look it up.");
    }

    if (!String(said).trim()) {
      throw new Error("I don't know where you want to go.");
    }

    const dest = destinations().find(said);
    if (!dest) {
      throw new Error("“" + said + "” isn't a screen I can open.");
    }

    const screen = resolveScreen(cmd && (cmd.on || cmd.screen || cmd.device));
    const where = screen.here ? "" : " on the " + screen.name.replace(/^the\s+/i, "");

    if (fileOf(dest.url) === screen.page) {
      /* Not an error — she asked for something reasonable. But the
         listener would wipe the node and do nothing, so the honest
         receipt is that we're already there. */
      return "Already on " + dest.name + where;
    }

    if (!screen.id) {
      throw new Error("This screen has no device id — lifehub-navigation-core.js isn't loaded here.");
    }

    /* device: only that screen jumps; every other LifeHub page ignores it.
       at: the server's clock, so a TV that was off can tell the command
       is old when it comes back on, and drop it instead of obeying. */
    return db().ref(NAV_NODE)
      .set({
        action: "navigate",
        url: dest.url,
        device: screen.id,
        at: firebase.database.ServerValue.TIMESTAMP,
        by: "poppy"
      })
      .then(() => "Opening " + dest.name + where)
      .catch(() => { throw new Error("I couldn't reach the database to make the jump."); });
  }


  window.LIFEHUB_ACTIONS = {

    describe() {
      return prior.describe() + "\n\n" + [
        "## NAVIGATION",
        "You can move Jen between screens. Same fenced block:",
        "",
        '  {"action":"navigate","to":"SLEEP"} — opens the Sleep tracker',
        '  {"action":"navigate","to":"SLEEP","on":"TV"} — opens it on the TV',
        '  {"action":"navigate","to":"SLEEP","on":"here"} — opens it on this screen',
        "",
        screensLine(),
        "",
        "`on` is which screen changes. Use a name from the line above, or",
        "\"here\" for the screen she's typing on. Leave it out and it goes to " +
          (defaultScreen() ? "the " + defaultScreen().name : "this screen") + ".",
        "Sending it \"here\" replaces the page you're running on, so this chat",
        "closes — only do that when she clearly means this screen. “On the TV”,",
        "“put it up”, “show it on the big screen” all mean the TV.",
        "",
        "`to` must be one of these ids, exactly as written:",
        "",
        destinations().vocabulary(),
        "",
        "Pick the id that matches what she meant, not just what she said —",
        "“my period tracker” is FLO, “where I keep my passwords” is PASSHUB.",
        "If two fit, prefer the more specific: “my food history” is",
        "FOODHUB-HISTORY, not FOODHUB.",
        "",
        "If nothing fits, say so and name the closest one instead of guessing.",
        "An id that isn't on this list is refused, and she gets an error rather",
        "than a jump.",
        "",
        "Navigating changes what is on her screen immediately, so only send it",
        "when she asked to go somewhere. A question ABOUT a tracker is not a",
        "request to open it — “how did I sleep” wants an answer, not a jump."
      ].join("\n") + "\n\n" + wallpaperDescribe() + "\n\n" + [
        "## REFRESHING A SCREEN",
        "  {\"action\":\"refresh\"} — reloads whatever page is showing on " +
          (defaultScreen() ? "the " + defaultScreen().name : "the TV") + ", like the remote's Reload button",
        "  {\"action\":\"refresh\",\"on\":\"NAME\"} — a different screen from the line above",
        "“Refresh the TV”, “reload the TV”, “the TV's stuck, restart it” all mean this.",
        "Only send it when she asked; it doesn't change which page is showing."
      ].join("\n");
    },

    run(cmd) {
      const name = String((cmd && cmd.action) || "").trim().toLowerCase();
      if (name === "navigate" || name === "open" || name === "go" || name === "goto") {
        return Promise.resolve()
          .then(() => navigate(cmd))
          .catch(err => { throw new Error(err.message || "That didn't work."); });
      }
      if (name === "refresh" || name === "reload") {
        return Promise.resolve()
          .then(() => refresh(cmd))
          .catch(err => { throw new Error(err.message || "That didn't work."); });
      }
      if (WALL[name]) {
        return Promise.resolve()
          .then(() => wallpaper(WALL[name], cmd))
          .catch(err => { throw new Error(err.message || "That didn't work."); });
      }
      return prior.run(cmd);
    }
  };

  Object.keys(prior).forEach(k => {
    if (!(k in window.LIFEHUB_ACTIONS)) window.LIFEHUB_ACTIONS[k] = prior[k];
  });

})();
