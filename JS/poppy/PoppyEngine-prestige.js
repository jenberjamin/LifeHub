/* LifeHub — Poppy's write layer for prestige.
   ────────────────────────────────────────────────────────────────
   Manual entries on the ledger: the ones no tracker covers.

   The reads live in LifeHub-poppy-firebase-fetch.js under
   "prestige/standing" and "prestige/ledger". The RULES — the tiers,
   and which rows count toward a rank — live in
   JS/lifehub-prestige-ledger.js and are not restated here.

   Load AFTER JS/lifehub-prestige-ledger.js and after the other
   PoppyEngine-*.js wrappers.

   ── WHY THREE ACTIONS AND NOT ONE WITH A SIGN ────────────────────
   Because "take 500 points off" is ambiguous in a way that matters,
   and the ambiguity is invisible until months later when her rank is
   wrong.

   Spending points is not the same as unpaying them. Buying something
   should empty the wallet without demoting her — the work that
   earned the points still happened. Correcting a bad entry should do
   both, or a number entered wrong keeps paying rank forever.

   One action with an amount would make Poppy guess which. Three
   actions make her choose, and the choice is in the verb Jen used.

     prestige_award     + balance   + rank    earned something
     prestige_spend     - balance   = rank    bought something
     prestige_correct   ± balance   ± rank    the ledger was wrong

   ── THE GUARDS ───────────────────────────────────────────────────
   This is the only place in LifeHub where points come from nowhere,
   so it is the only place a misheard number does real damage. The
   ceremony that stops that — reading it back, and a code Jen has to
   repeat — is in the engine entry, exactly like scribble_merge. What
   is here is the floor beneath it: a cap, a required reason, and a
   refusal to write a row nobody can interpret later.
*/

(function () {

  const prior = window.LIFEHUB_ACTIONS;
  if (!prior || typeof prior.describe !== "function") {
    console.error("[Poppy prestige] LIFEHUB_ACTIONS missing — load this after the other PoppyEngine wrappers.");
    return;
  }

  const SOURCE = "POPPY";

  /* The largest single manual entry. Not a security control — it is a
     typo control. The biggest thing any tracker pays is the sleep
     30-night bonus at 50,000, so anything past a quarter of a million
     in one line is a misheard number rather than an intention, and
     she can always say it twice if she means it. */
  const MAX_ENTRY = 250000;

  function prestige() {
    if (!window.LIFEHUB_PRESTIGE) {
      throw new Error("JS/lifehub-prestige-ledger.js isn't loaded on this page.");
    }
    return window.LIFEHUB_PRESTIGE;
  }

  function db() {
    if (!window.POPPY_FETCH || typeof window.POPPY_FETCH.rtdb !== "function") {
      throw new Error("Poppy's Firebase layer isn't loaded.");
    }
    return window.POPPY_FETCH.rtdb("lifehub");
  }

  const stamp = () => firebase.database.ServerValue.TIMESTAMP;
  const points = n => Math.round(Number(n) || 0).toLocaleString();

  /* Always a positive magnitude. Which direction it goes is the
     action's business, not the number's — letting a sign through here
     is how "spend 500" becomes a 500-point gift. */
  function parseAmount(said) {
    const n = Number(String(said == null ? "" : said).replace(/[, ]/g, ""));

    if (!Number.isFinite(n) || n === 0) {
      throw new Error("How many points?");
    }
    if (n < 0) {
      throw new Error("Give me the amount as a plain number — the action decides the direction.");
    }
    if (n > MAX_ENTRY) {
      throw new Error(points(n) + " is larger than I'll write in one go (" +
                      points(MAX_ENTRY) + " is the cap). Is that the number you meant?");
    }
    return Math.round(n);
  }

  /* A ledger row with no reason on it is unreadable six months later,
     and this is the one row type with no tracker behind it to explain
     where it came from. */
  function parseReason(said) {
    const text = String(said == null ? "" : said).trim();
    if (!text) throw new Error("What's it for? The ledger line needs a reason.");
    if (text.length > 120) return text.slice(0, 117) + "...";
    return text;
  }

  /* Every write is balance + one ledger row, in that order. The
     balance is a transaction() so two screens writing at once can't
     lose one of them. */
  function post(delta, tx) {
    const d = db();
    d.ref("prestige_system/balance").transaction(c => (c || 0) + delta);
    return d.ref("prestige_system/transactions").push(tx);
  }


  async function award(cmd) {
    const amount = parseAmount(cmd.amount);
    const reason = parseReason(cmd.reason);

    await post(amount, prestige().row(amount, reason, SOURCE, stamp()));
    return "Awarded " + points(amount) + " prestige — " + reason;
  }

  /* Spending. The row is negative and deliberately NOT a correction:
     it empties the wallet and leaves the rank where it was. */
  async function spend(cmd) {
    const amount = parseAmount(cmd.amount);
    const reason = parseReason(cmd.reason);

    /* Refusing to overdraw. The balance is spendable points and there
       is nothing in LifeHub that lends them, so a negative balance is
       always a mistake — and one that quietly makes every later total
       wrong. Read fresh rather than trusting the fetch, which ran
       before Jen's last few words. */
    const have = Number((await db().ref("prestige_system/balance").once("value")).val()) || 0;
    if (amount > have) {
      throw new Error("That's " + points(amount) + " and there's only " +
                      points(have) + " in the balance.");
    }

    await post(-amount, prestige().row(-amount, reason, SOURCE, stamp()));
    return "Spent " + points(amount) + " prestige — " + reason +
           " (" + points(have - amount) + " left)";
  }

  /* Correcting. Moves the balance AND the rank, in whichever
     direction, because the premise is that the ledger was wrong. */
  async function correct(cmd) {
    const amount = parseAmount(cmd.amount);
    const reason = parseReason(cmd.reason);

    const up = String(cmd.direction || "").toLowerCase();
    if (up !== "add" && up !== "remove") {
      throw new Error('Say whether this correction adds or removes — direction must be "add" or "remove".');
    }

    const P = prestige();
    if (up === "remove") {
      await post(-amount, P.reversal(amount, "Correction: " + reason, SOURCE, stamp()));
      return "Corrected: removed " + points(amount) + " prestige — " + reason;
    }

    /* An upward correction is still a correction — it is marked so
       that a later reversal of THIS row behaves symmetrically. */
    await post(amount, P.row(amount, "Correction: " + reason, SOURCE, stamp(),
                             { correction: true }));
    return "Corrected: added " + points(amount) + " prestige — " + reason;
  }


  const ACTIONS = {

    prestige_award: {
      spec: '{"action":"prestige_award","amount":2000,"reason":"Finished the tax paperwork"} ' +
            '— adds prestige for something no tracker covers. Counts toward her rank. ' +
            'amount is a plain positive number; reason is her own words for what she did. ' +
            'This is the action that creates points out of nothing, so it is the one to be slowest about: ' +
            'read the amount and the reason back to her and get the confirmation code before sending it.',
      run: (cmd) => award(cmd)
    },

    prestige_spend: {
      spec: '{"action":"prestige_spend","amount":5000,"reason":"Bought the good coffee"} ' +
            '— takes prestige OUT of the spendable balance for something she bought or claimed. ' +
            'Does NOT lower her rank: the work that earned the points still happened. ' +
            'Refused if the balance is too low. amount is a plain positive number.',
      run: (cmd) => spend(cmd)
    },

    prestige_correct: {
      spec: '{"action":"prestige_correct","amount":3500,"direction":"remove","reason":"Sleep log double-counted on the 8th"} ' +
            '— fixes a ledger that is WRONG. Moves the balance and the rank together, in whichever direction. ' +
            'direction is exactly "add" or "remove". ' +
            'Use this ONLY when a number should never have been there, or should have been and was not. ' +
            'Spending is not a correction — that is prestige_spend. ' +
            'Never send this to undo a tracker entry: sleep logs are fixed with sleep_amend or sleep_delete, which adjust the ledger themselves.',
      run: (cmd) => correct(cmd)
    }

  };


  window.LIFEHUB_ACTIONS = {

    describe() {
      const own = Object.keys(ACTIONS).map(k => "  " + ACTIONS[k].spec);
      return prior.describe() + "\n\n" + [
        "You can also write manual entries on the prestige ledger. Same fenced block:",
        ""
      ].concat(own).concat([
        "",
        "These three are the only way prestige moves without a tracker behind it,",
        "so they are the only way a misheard sentence can change what she is worth.",
        "Never send one on an amount you inferred, rounded, or converted. If she",
        "did not say a number out loud, ask for it."
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

  Object.keys(prior).forEach(k => {
    if (!(k in window.LIFEHUB_ACTIONS)) window.LIFEHUB_ACTIONS[k] = prior[k];
  });

})();
