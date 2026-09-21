/* LifeHub — Poppy's access to the PassHub logins vault.
   ────────────────────────────────────────────────────────────────
   Load AFTER the other PoppyEngine-*.js wrappers, and after
   Hubs/PassHub/js/passhub-auth.js (and passhub-access-log.js).

   ── THE ONE RULE THIS FILE IS BUILT AROUND ───────────────────────
   No secret ever becomes an action receipt.

   LifeHub-homescreen.js folds every receipt back into the history it
   sends the model on the next turn:

       if (m.done && m.done.length) text += "\n[done: " + ... + "]";

   So a handler that RETURNED a password would post that password to
   the model provider on Jen's very next message, and leave it sitting
   in the conversation from then on. Passwords are therefore written
   straight into the DOM, and the receipt says only that something was
   shown. Poppy drives the vault; she never reads it.

   What a receipt may carry is the PLATFORM NAME — "Netflix",
   "GCash" — because without it she cannot ask "the personal one or
   the work one?", which is most of the point of asking her at all.
   Set NAMES_IN_RECEIPTS to false below and receipts become bare
   counts instead: less useful, and gives the model nothing.

   Never in a receipt, under any setting: password, username,
   recovery address, phone number, auth notes, free-text notes.

   ── THE GATE ─────────────────────────────────────────────────────
   Same two steps as PassHub-core.js, against the same hashes, with
   the same budgets: name + passcode, then one of the twenty security
   questions drawn at random; three rerolls and three answers per
   identity check. Nothing is compared here — window.PH_AUTH does the
   PBKDF2 and this file only ever sees true or false.

   The challenge is DOM. The model cannot see it, cannot fill it in
   and cannot skip it: reveal() does not resolve until a human has
   passed it.

   ── AND WHAT IT STILL ISN'T ──────────────────────────────────────
   The same caveat passhub-auth.js already makes about itself. This
   stops a person at the keyboard. It does not stop a person in the
   console, and it is not what keeps the vault safe from the network
   — that would be database rules. What it adds here is that asking
   Poppy is no easier than opening PassHub, which is exactly what it
   was asked to be.
*/

(function () {

  const prior = window.LIFEHUB_ACTIONS;
  if (!prior || typeof prior.describe !== "function") {
    console.error("[Poppy passhub] LIFEHUB_ACTIONS missing — load this after the other PoppyEngine wrappers.");
    return;
  }

  /* Platform names in receipts: needed for Poppy to disambiguate out
     loud. Flip to false to send the model nothing but counts. */
  const NAMES_IN_RECEIPTS = true;

  /* How long an unlock lasts, measured from the last thing it was
     used for. This is a wallpaper that stays on screen all day, so
     the window is short on purpose. */
  const SESSION_MS = 5 * 60 * 1000;

  /* Same budgets as PassHub-core.js. */
  const MAX_REROLLS = 3;
  const MAX_ANSWERS = 3;

  const VAULT_NODE = "vault_entries";

  /* Fields that may be shown on screen, in the order they read best.
     Anything not listed here is not rendered at all. */
  const SHOWN = [
    ["username",      "Username"],
    ["password",      "Password"],
    ["emailProvider", "Email provider"],
    ["recovery",      "Recovery"],
    ["number",        "Number"],
    ["auth",          "2FA / auth"],
    ["notes",         "Notes"]
  ];
  const SECRET_FIELDS = ["password"];


  /* ── Plumbing ─────────────────────────────────────────────────── */

  /* PassHub's own pages set window.PH_DB from passhub-firebase.js,
     which claims the DEFAULT Firebase app. The homescreen cannot
     afford that — the default belongs to lifehub-navigation-core.js
     — so the handle is built here from Poppy's named "passhub" app
     instead and handed to PH_AUTH the way it expects to find it. */
  function vaultDb() {
    if (!window.POPPY_FETCH || typeof window.POPPY_FETCH.rtdb !== "function") {
      throw new Error("Poppy's Firebase layer isn't loaded.");
    }
    const db = window.POPPY_FETCH.rtdb("passhub");
    if (!window.PH_DB) window.PH_DB = db;
    return db;
  }

  function auth() {
    if (!window.PH_AUTH) {
      throw new Error("The vault's lock isn't loaded on this page.");
    }
    vaultDb();                       // PH_AUTH reads window.PH_DB
    if (!window.PH_AUTH.cryptoAvailable()) {
      throw new Error(window.PH_AUTH.subtleMessage());
    }
    return window.PH_AUTH;
  }

  /* Attempts land in the same log PassHub writes, using the same
     event names so the existing history modal renders them — the
     detail line is what says it came from here. */
  function log(event, detail) {
    try {
      vaultDb();
      if (window.PH_ACCESS_LOG) {
        window.PH_ACCESS_LOG.record(event, "via Poppy — " + detail);
      }
    } catch (e) { /* the log must never be what blocks a sign-in */ }
  }


  /* ── Session ──────────────────────────────────────────────────── */

  /* Deliberately NOT PassHub's PH_LOCK. Unlocking the hub in a browser
     tab should not silently unlock the wallpaper, and this window is
     much shorter than the hub's. In memory only: a reload re-locks. */
  let unlockedUntil = 0;

  const isUnlocked = () => Date.now() < unlockedUntil;
  const touch = () => { unlockedUntil = Date.now() + SESSION_MS; };
  function lock() {
    unlockedUntil = 0;
    hidePanel();
  }

  /* A visible countdown is the honest version of "this expires" —
     otherwise the panel just vanishes and looks like a bug. */
  let tick = null;
  function startTick() {
    stopTick();
    tick = setInterval(() => {
      if (!isUnlocked()) { lock(); return; }
      const left = Math.max(0, Math.ceil((unlockedUntil - Date.now()) / 1000));
      const el = document.getElementById("pv-countdown");
      if (el) {
        el.textContent = "locks in " + Math.floor(left / 60) + ":" +
                         String(left % 60).padStart(2, "0");
      }
    }, 1000);
  }
  function stopTick() { if (tick) { clearInterval(tick); tick = null; } }


  /* ── Reading the vault ────────────────────────────────────────── */

  function allEntries() {
    return vaultDb().ref(VAULT_NODE).once("value").then(snap => {
      const raw = snap.val() || {};
      return Object.keys(raw)
        .map(k => Object.assign({ _key: k }, raw[k]))
        .filter(e => e && e.platform);
    });
  }

  const norm = (s) => String(s == null ? "" : s).trim().toLowerCase();

  /* Matched on platform, category and username — the three things
     she'd actually say. Exact platform matches sort first so "gcash"
     doesn't rank behind "GCash Business" on a substring tie. */
  function search(entries, q) {
    const needle = norm(q);
    if (!needle) return entries.slice();
    const hit = entries.filter(e =>
      norm(e.platform).indexOf(needle) !== -1 ||
      norm(e.category).indexOf(needle) !== -1 ||
      norm(e.username).indexOf(needle) !== -1 ||
      norm(e.website).indexOf(needle) !== -1);
    hit.sort((a, b) => {
      const ea = norm(a.platform) === needle ? 0 : 1;
      const eb = norm(b.platform) === needle ? 0 : 1;
      return ea - eb || norm(a.platform).localeCompare(norm(b.platform));
    });
    return hit;
  }

  /* What a receipt is allowed to say about a set of results. */
  function summarise(list) {
    if (!list.length) return "nothing";
    if (!NAMES_IN_RECEIPTS) {
      return list.length === 1 ? "1 entry" : list.length + " entries";
    }
    const names = list.slice(0, 8).map(e => e.platform);
    if (list.length > 8) names.push("and " + (list.length - 8) + " more");
    return names.join(", ");
  }


  /* ── Styles ───────────────────────────────────────────────────── */

  const CSS = `
  #pv-wrap{position:fixed;inset:0;z-index:9500;display:none;
    align-items:center;justify-content:center;
    background:rgba(6,6,9,.88);
    backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
    font-family:var(--font-ui,system-ui,sans-serif)}
  #pv-wrap.is-open{display:flex}
  #pv-card{width:min(440px,90vw);padding:30px 30px 26px;
    background:rgba(20,20,26,.96);border:1px solid rgba(255,255,255,.14);
    border-radius:4px;box-shadow:0 30px 90px rgba(0,0,0,.6)}
  #pv-card.shake{animation:pv-shake .4s}
  @keyframes pv-shake{0%,100%{transform:translateX(0)}
    20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}

  #pv-card h3{margin:0 0 4px;font-size:12px;font-weight:600;
    letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.55)}
  #pv-card .pv-q{margin:14px 0 16px;font-size:15px;line-height:1.5;
    color:rgba(255,255,255,.92)}
  #pv-card input{width:100%;box-sizing:border-box;margin-bottom:10px;
    padding:11px 12px;font-family:inherit;font-size:14px;
    background:rgba(255,255,255,.06);color:#fff;
    border:1px solid rgba(255,255,255,.18);border-radius:3px;outline:none}
  #pv-card input:focus{border-color:rgba(255,255,255,.45)}
  #pv-card .pv-row{display:flex;gap:10px;align-items:center;margin-top:14px}
  #pv-card button{padding:10px 18px;font-family:inherit;font-size:12px;
    font-weight:600;letter-spacing:.1em;text-transform:uppercase;
    border-radius:3px;cursor:pointer;border:1px solid transparent}
  #pv-card .pv-go{background:#fff;color:#111;flex:0 0 auto}
  #pv-card .pv-go[disabled]{opacity:.5;cursor:default}
  #pv-card .pv-cancel{background:none;color:rgba(255,255,255,.45);
    border-color:rgba(255,255,255,.18)}
  #pv-card .pv-cancel:hover{color:rgba(255,255,255,.9)}
  #pv-card .pv-reroll{margin-left:auto;background:none;border:0;
    color:rgba(255,255,255,.4);font-size:11px;letter-spacing:.04em;
    text-transform:none;font-weight:400;cursor:pointer;padding:4px}
  #pv-card .pv-reroll:hover{color:rgba(255,255,255,.85)}
  #pv-err{min-height:16px;margin-top:10px;font-size:11.5px;
    color:#E08A8A;letter-spacing:.02em}
  #pv-note{margin-top:16px;font-size:10.5px;line-height:1.6;
    color:rgba(255,255,255,.34)}

  /* The results panel. Corner, not centre — it is reference material
     to read off, not something to dismiss before carrying on. */
  #pv-panel{position:fixed;right:22px;bottom:22px;z-index:9400;
    display:none;width:min(360px,88vw);max-height:70vh;overflow:auto;
    padding:18px 20px 16px;
    background:rgba(18,18,23,.96);border:1px solid rgba(255,255,255,.14);
    border-radius:4px;box-shadow:0 22px 60px rgba(0,0,0,.55);
    font-family:var(--font-ui,system-ui,sans-serif)}
  #pv-panel.is-open{display:block}
  #pv-panel .pv-head{display:flex;align-items:baseline;gap:10px;
    margin-bottom:14px}
  #pv-panel .pv-title{flex:1;font-size:12px;font-weight:600;
    letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.9)}
  #pv-countdown{font-size:10px;letter-spacing:.06em;
    color:rgba(255,255,255,.38);font-variant-numeric:tabular-nums}
  #pv-panel .pv-x{background:none;border:0;color:rgba(255,255,255,.4);
    font-size:15px;line-height:1;cursor:pointer;padding:0 2px}
  #pv-panel .pv-x:hover{color:rgba(255,255,255,.9)}

  #pv-panel .pv-entry{padding:10px 0;border-top:1px solid rgba(255,255,255,.09)}
  #pv-panel .pv-entry:first-of-type{border-top:0}
  #pv-panel .pv-plat{font-size:13.5px;color:rgba(255,255,255,.95);
    margin-bottom:2px}
  #pv-panel .pv-cat{font-size:10.5px;letter-spacing:.08em;
    text-transform:uppercase;color:rgba(255,255,255,.35)}
  #pv-panel .pv-field{display:flex;gap:10px;align-items:baseline;
    margin-top:7px;font-size:12px}
  #pv-panel .pv-label{flex:0 0 96px;color:rgba(255,255,255,.4);
    font-size:10.5px;letter-spacing:.07em;text-transform:uppercase}
  #pv-panel .pv-value{flex:1;color:rgba(255,255,255,.88);
    word-break:break-all;font-variant-numeric:tabular-nums}
  #pv-panel .pv-value.pv-secret{font-family:ui-monospace,Menlo,Consolas,monospace;
    font-size:13px;letter-spacing:.02em;color:#fff}
  #pv-panel .pv-copy{flex:0 0 auto;background:none;border:0;padding:2px 4px;
    color:rgba(255,255,255,.35);font-family:inherit;font-size:10px;
    letter-spacing:.08em;text-transform:uppercase;cursor:pointer}
  #pv-panel .pv-copy:hover{color:rgba(255,255,255,.9)}
  #pv-panel .pv-empty{font-size:12px;color:rgba(255,255,255,.5)}
  `;

  let stylesIn = false;
  function ensureStyles() {
    if (stylesIn) return;
    stylesIn = true;
    const s = document.createElement("style");
    s.textContent = CSS;
    document.head.appendChild(s);
  }


  /* ── The challenge ────────────────────────────────────────────── */

  let challengeOpen = false;

  /* Resolves true once a human passes both steps, false if she
     cancels. Never resolves from anything the model does. */
  function challenge(reason) {
    if (challengeOpen) {
      return Promise.reject(new Error("The vault is already asking."));
    }
    const A = auth();
    challengeOpen = true;
    ensureStyles();

    return A.isConfigured().then(configured => {
      if (!configured) {
        challengeOpen = false;
        throw new Error("PassHub hasn't been set up on this database yet.");
      }
      return new Promise(resolve => runChallenge(A, reason, resolve));
    }).catch(e => { challengeOpen = false; throw e; });
  }

  function runChallenge(A, reason, resolve) {
    const wrap = document.createElement("div");
    wrap.id = "pv-wrap";
    wrap.className = "is-open";
    wrap.innerHTML =
      '<div id="pv-card" role="dialog" aria-modal="true" aria-label="Unlock the vault">' +
        '<h3>Vault locked</h3>' +
        '<div class="pv-q" id="pv-q"></div>' +
        '<div id="pv-fields"></div>' +
        '<div class="pv-row">' +
          '<button class="pv-go" id="pv-go">Verify</button>' +
          '<button class="pv-cancel" id="pv-cancel">Cancel</button>' +
          '<button class="pv-reroll" id="pv-reroll" hidden></button>' +
        '</div>' +
        '<div id="pv-err"></div>' +
        '<div id="pv-note"></div>' +
      '</div>';
    document.body.appendChild(wrap);

    const card   = wrap.querySelector("#pv-card");
    const qEl    = wrap.querySelector("#pv-q");
    const fields = wrap.querySelector("#pv-fields");
    const go     = wrap.querySelector("#pv-go");
    const cancel = wrap.querySelector("#pv-cancel");
    const reroll = wrap.querySelector("#pv-reroll");
    const err    = wrap.querySelector("#pv-err");
    const note   = wrap.querySelector("#pv-note");

    note.textContent = reason
      ? "Poppy asked to open " + reason + "."
      : "Poppy asked to open your vault.";

    let rerollsLeft = MAX_REROLLS;
    let answersLeft = MAX_ANSWERS;
    let currentQ = null;

    function fail(msg) {
      err.textContent = msg;
      card.classList.add("shake");
      setTimeout(() => card.classList.remove("shake"), 400);
    }

    function finish(ok) {
      stopKeys();
      challengeOpen = false;
      wrap.remove();
      resolve(ok);
    }

    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); log("locked-out", "cancelled at the prompt"); finish(false); }
      else if (e.key === "Enter") { e.preventDefault(); go.click(); }
    }
    document.addEventListener("keydown", onKey, true);
    function stopKeys() { document.removeEventListener("keydown", onKey, true); }

    cancel.addEventListener("click", () => {
      log("locked-out", "cancelled at the prompt");
      finish(false);
    });

    /* ---- step 1 ---- */
    function step1() {
      qEl.textContent = "Who's asking?";
      fields.innerHTML =
        '<input id="pv-name" type="text" placeholder="Name" autocomplete="off">' +
        '<input id="pv-pass" type="password" placeholder="Passcode" autocomplete="off">';
      reroll.hidden = true;
      go.textContent = "Verify";
      err.textContent = "";
      const n = wrap.querySelector("#pv-name");
      setTimeout(() => n && n.focus(), 30);

      go.onclick = () => {
        const name = wrap.querySelector("#pv-name").value;
        const pass = wrap.querySelector("#pv-pass").value;
        go.disabled = true;
        go.textContent = "Checking…";
        /* PBKDF2 blocks the thread for a couple of hundred ms; the
           repaint is what stops the button lying about it. */
        setTimeout(() => {
          A.verifyIdentity(name, pass)
            .catch(e => { fail(e.message); return false; })
            .then(ok => {
              go.disabled = false;
              go.textContent = "Verify";
              if (!ok) {
                log("identity-failed", 'name typed: "' + String(name).trim().slice(0, 40) + '"');
                wrap.querySelector("#pv-pass").value = "";
                fail("Not recognised.");
                return;
              }
              rerollsLeft = MAX_REROLLS;
              answersLeft = MAX_ANSWERS;
              step2();
            });
        }, 20);
      };
    }

    /* ---- step 2 ---- */
    function paintBudgets() {
      reroll.hidden = false;
      reroll.textContent = "↻ a different question (" + rerollsLeft + " left)";
      reroll.style.opacity = rerollsLeft <= 0 ? ".35" : "";
      go.textContent = answersLeft < MAX_ANSWERS
        ? "Unlock (" + answersLeft + (answersLeft === 1 ? " try" : " tries") + " left)"
        : "Unlock";
    }

    function loadQuestion(avoidSame) {
      return A.pickQuestion(avoidSame && currentQ ? currentQ.index : undefined)
        .then(q => {
          currentQ = q;
          qEl.textContent = q ? q.question : "No question available.";
          fields.innerHTML =
            '<input id="pv-answer" type="text" placeholder="Answer" autocomplete="off">';
          paintBudgets();
          const a = wrap.querySelector("#pv-answer");
          setTimeout(() => a && a.focus(), 30);
        });
    }

    function step2() {
      err.textContent = "";
      loadQuestion(false);

      reroll.onclick = () => {
        if (rerollsLeft <= 0) return;
        rerollsLeft--;
        err.textContent = "";
        log("question-rerolled",
            'skipped: "' + (currentQ ? currentQ.question : "?") + '" — ' + rerollsLeft + " left");
        loadQuestion(true).then(() => {
          if (rerollsLeft <= 0) err.textContent = "Last question — no rerolls left.";
        });
      };

      go.onclick = () => {
        if (!currentQ) return;
        const answer = wrap.querySelector("#pv-answer").value;
        go.disabled = true;
        go.textContent = "Checking…";
        setTimeout(() => {
          A.verifyAnswer(currentQ.index, answer)
            .catch(e => { fail(e.message); return false; })
            .then(ok => {
              go.disabled = false;
              if (!ok) {
                answersLeft--;
                log("answer-failed",
                    'question: "' + currentQ.question + '" — ' + answersLeft + " left");
                if (answersLeft <= 0) {
                  log("locked-out", "three wrong answers");
                  fail("Three wrong answers.");
                  setTimeout(() => step1(), 500);
                  return;
                }
                paintBudgets();
                wrap.querySelector("#pv-answer").value = "";
                fail("Not right. " + answersLeft + (answersLeft === 1 ? " try left." : " tries left."));
                return;
              }
              log("unlock", "vault opened for Poppy" +
                  (rerollsLeft < MAX_REROLLS ? " (after " + (MAX_REROLLS - rerollsLeft) + " reroll(s))" : ""));
              touch();
              startTick();
              finish(true);
            });
        }, 20);
      };
    }

    step1();
  }


  /* ── The results panel ────────────────────────────────────────── */

  function panel() {
    ensureStyles();
    let el = document.getElementById("pv-panel");
    if (el) return el;
    el = document.createElement("div");
    el.id = "pv-panel";
    document.body.appendChild(el);
    return el;
  }

  function hidePanel() {
    const el = document.getElementById("pv-panel");
    if (el) { el.classList.remove("is-open"); el.innerHTML = ""; }
    stopTick();
  }

  function head(title, withCountdown) {
    return '<div class="pv-head">' +
             '<span class="pv-title"></span>' +
             (withCountdown ? '<span id="pv-countdown"></span>' : '') +
             '<button class="pv-x" aria-label="Close">×</button>' +
           '</div>';
  }

  function mount(el, title, withCountdown) {
    el.innerHTML = head(title, withCountdown);
    el.querySelector(".pv-title").textContent = title;
    el.querySelector(".pv-x").addEventListener("click", hidePanel);
    el.classList.add("is-open");
  }

  /* textContent everywhere below — a platform name or a note is
     Jen's own text, but it is still text going into a live page. */
  function showList(list, title) {
    const el = panel();
    mount(el, title, false);

    if (!list.length) {
      const p = document.createElement("div");
      p.className = "pv-empty";
      p.textContent = "Nothing matched.";
      el.appendChild(p);
      return;
    }

    list.forEach(e => {
      const row = document.createElement("div");
      row.className = "pv-entry";
      const plat = document.createElement("div");
      plat.className = "pv-plat";
      plat.textContent = e.platform;
      const cat = document.createElement("div");
      cat.className = "pv-cat";
      cat.textContent = e.category || "Uncategorised";
      row.appendChild(plat);
      row.appendChild(cat);
      el.appendChild(row);
    });
  }

  function showEntry(entry) {
    const el = panel();
    mount(el, entry.platform, true);

    const cat = document.createElement("div");
    cat.className = "pv-cat";
    cat.textContent = entry.category || "Uncategorised";
    el.appendChild(cat);

    SHOWN.forEach(([key, label]) => {
      const raw = entry[key];
      if (raw == null || String(raw).trim() === "") return;

      const row = document.createElement("div");
      row.className = "pv-field";

      const l = document.createElement("span");
      l.className = "pv-label";
      l.textContent = label;

      const v = document.createElement("span");
      v.className = "pv-value" + (SECRET_FIELDS.indexOf(key) !== -1 ? " pv-secret" : "");
      v.textContent = String(raw);

      const copy = document.createElement("button");
      copy.className = "pv-copy";
      copy.type = "button";
      copy.textContent = "copy";
      copy.addEventListener("click", () => {
        touch();                            // reading it counts as using it
        const done = () => {
          copy.textContent = "copied";
          setTimeout(() => { copy.textContent = "copy"; }, 1400);
        };
        try {
          navigator.clipboard.writeText(String(raw)).then(done, () => {
            copy.textContent = "failed";
          });
        } catch (err) { copy.textContent = "failed"; }
      });

      row.appendChild(l);
      row.appendChild(v);
      row.appendChild(copy);
      el.appendChild(row);
    });
  }


  /* ── The actions ──────────────────────────────────────────────── */

  function find(cmd) {
    const q = (cmd && (cmd.q || cmd.query || cmd.platform || cmd.name)) || "";
    return allEntries().then(entries => {
      const hit = search(entries, q);
      showList(hit, q ? 'Logins matching "' + String(q).trim() + '"' : "All logins");
      if (!hit.length) {
        return q ? "Nothing in the vault matches “" + String(q).trim() + "”."
                 : "The vault is empty.";
      }
      return "On screen: " + summarise(hit);
    });
  }

  function reveal(cmd) {
    const q = (cmd && (cmd.q || cmd.query || cmd.platform || cmd.name)) || "";
    if (!String(q).trim()) {
      throw new Error("Tell me which login and I'll open it.");
    }

    return allEntries().then(entries => {
      const hit = search(entries, q);

      if (!hit.length) {
        return "Nothing in the vault matches “" + String(q).trim() + "”.";
      }

      /* More than one and no exact platform match: show the choices
         rather than guessing which password to put on screen. */
      if (hit.length > 1 && norm(hit[0].platform) !== norm(q)) {
        showList(hit, 'Which one? — "' + String(q).trim() + '"');
        return "More than one matches: " + summarise(hit) + ". Ask again with the exact one.";
      }

      const entry = hit[0];

      const open = isUnlocked()
        ? Promise.resolve(true)
        : challenge(entry.platform);

      return open.then(ok => {
        if (!ok) return "The vault stayed locked.";
        touch();
        startTick();
        showEntry(entry);
        /* The receipt names the platform and nothing else. The
           password is in the DOM and stays there. */
        return NAMES_IN_RECEIPTS
          ? entry.platform + " is on screen."
          : "It's on screen.";
      });
    });
  }

  function lockNow() {
    const was = isUnlocked();
    lock();
    return was ? "Vault locked." : "The vault was already locked.";
  }


  /* ── Wiring ───────────────────────────────────────────────────── */

  window.LIFEHUB_ACTIONS = {

    describe() {
      return prior.describe() + "\n\n" + [
        "## PASSWORDS AND LOGINS",
        "Jen's logins live in PassHub. You can look them up for her:",
        "",
        '  {"action":"vault_find","q":"netflix"} — lists matching logins on screen',
        '  {"action":"vault_reveal","q":"netflix"} — puts one full login on screen',
        '  {"action":"vault_lock"} — locks the vault again',
        "",
        "`q` matches the platform, the category, the username or the website.",
        "Leave it off on vault_find to list everything.",
        "",
        "IMPORTANT, and not negotiable:",
        "",
        "- You never see any password, username, recovery address or note.",
        "  They are painted straight onto her screen and nothing comes back",
        "  to you but the platform name. Do not claim to know a password, do",
        "  not guess one, and never repeat one back — you will not have it.",
        "- vault_reveal asks her for her passcode and one of her security",
        "  questions before anything appears. You cannot answer that for her",
        "  and you cannot skip it. If she cancels, the receipt says so.",
        "- Once she has answered, it stays open for a few minutes, so a",
        "  follow-up may not ask again.",
        "",
        "Say where the answer is rather than what it is: “Netflix is on",
        "screen, bottom right” is right. If several match, say which ones",
        "and let her pick — the exact platform name is what opens one."
      ].join("\n");
    },

    run(cmd) {
      const name = String((cmd && cmd.action) || "").trim().toLowerCase();

      const handler =
        (name === "vault_find"   || name === "find_login"   || name === "list_logins") ? find :
        (name === "vault_reveal" || name === "reveal_login" || name === "get_login" ||
         name === "get_password" || name === "show_login")  ? reveal :
        (name === "vault_lock"   || name === "lock_vault")  ? lockNow : null;

      if (!handler) return prior.run(cmd);

      return Promise.resolve()
        .then(() => handler(cmd))
        .catch(err => { throw new Error(err && err.message ? err.message : "The vault didn't open."); });
    }
  };

  Object.keys(prior).forEach(k => {
    if (!(k in window.LIFEHUB_ACTIONS)) window.LIFEHUB_ACTIONS[k] = prior[k];
  });

  /* Console handle, mostly so the session can be ended by hand. */
  window.POPPY_VAULT = {
    lock: lockNow,
    isUnlocked: isUnlocked,
    SESSION_MS: SESSION_MS
  };

})();
