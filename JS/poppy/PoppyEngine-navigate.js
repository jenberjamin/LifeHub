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

    if (fileOf(dest.url) === currentFile()) {
      /* Not an error — she asked for something reasonable. But the
         listener would wipe the node and do nothing, so the honest
         receipt is that we're already here. */
      return "Already on " + dest.name;
    }

    return db().ref(NAV_NODE)
      .set({ action: "navigate", url: dest.url })
      .then(() => "Opening " + dest.name)
      .catch(() => { throw new Error("I couldn't reach the database to make the jump."); });
  }


  window.LIFEHUB_ACTIONS = {

    describe() {
      return prior.describe() + "\n\n" + [
        "## NAVIGATION",
        "You can move Jen between screens. Same fenced block:",
        "",
        '  {"action":"navigate","to":"SLEEP"} — opens the Sleep tracker',
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
