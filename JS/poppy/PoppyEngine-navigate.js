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
      ].join("\n");
    },

    run(cmd) {
      const name = String((cmd && cmd.action) || "").trim().toLowerCase();
      if (name === "navigate" || name === "open" || name === "go" || name === "goto") {
        return Promise.resolve()
          .then(() => navigate(cmd))
          .catch(err => { throw new Error(err.message || "That didn't work."); });
      }
      return prior.run(cmd);
    }
  };

  Object.keys(prior).forEach(k => {
    if (!(k in window.LIFEHUB_ACTIONS)) window.LIFEHUB_ACTIONS[k] = prior[k];
  });

})();
