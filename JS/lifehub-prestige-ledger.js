/* LifeHub — the prestige ledger, in one place.
   ────────────────────────────────────────────────────────────────
   What prestige IS, rather than what any one tracker thinks it is.

   Four trackers pay into prestige_system and each carried its own
   copy of the rules — the tier names lived in the card renderer, the
   "does this count toward rank" test lived there too, and every
   tracker had its own updateBank(). This file is the shared answer,
   so a rule changed here changes everywhere at once.

   PURE LOGIC. It touches no Firebase and initialises no app, so it
   is safe to load on any page, in any order, before or after the
   SDK. The functions that need a database take a handle as their
   first argument — the caller already has one.

   ── THE SHAPE OF THE DATA ────────────────────────────────────────
     prestige_system/balance         spendable points, a number
     prestige_system/transactions    push-list of ledger rows:
                                       { amount, description,
                                         source, timestamp, kind? }
     prestige_system/net_worth       VESTIGIAL. Written by the older
                                     trackers, read by nothing. See
                                     the note on lifetimeFrom().
*/

(function () {

  /* ══════════════════════════════════════════════════════
     TIERS
     ══════════════════════════════════════════════════════
     Highest first — tierFor() takes the first threshold met, so the
     order is load-bearing. The ids match the element ids the card
     highlights. */

  const TIERS = [
    { id: "tier-sovereign",  name: "The Sovereign Class",  threshold: 100000000 },
    { id: "tier-tycoon",     name: "The Tycoon's Circle",  threshold:  10000000 },
    { id: "tier-executive",  name: "The Executive Class",  threshold:   1000000 },
    { id: "tier-elite",      name: "The Elite Class",      threshold:    500000 },
    { id: "tier-sterling",   name: "The Sterling Class",   threshold:    100000 },
    { id: "tier-foundation", name: "The Foundation Class", threshold:         0 }
  ];

  function tierFor(lifetime) {
    const n = Number(lifetime) || 0;
    const current = TIERS.find(t => n >= t.threshold) || TIERS[TIERS.length - 1];

    /* The tier above the current one, and how far off it is. Null at
       the top: there is nothing above Sovereign, and "0 to go" would
       read as though she were about to arrive somewhere. */
    const idx = TIERS.indexOf(current);
    const next = idx > 0 ? TIERS[idx - 1] : null;

    return {
      id:      current.id,
      name:    current.name,
      floor:   current.threshold,
      next:    next ? next.name : null,
      nextAt:  next ? next.threshold : null,
      toNext:  next ? next.threshold - n : null
    };
  }


  /* ══════════════════════════════════════════════════════
     WHAT COUNTS TOWARD RANK
     ══════════════════════════════════════════════════════
     Income always counts. Negative rows are where it gets interesting,
     and there are three different kinds of them:

       SPENDING     does NOT lower rank. Buying something doesn't make
                    the work that paid for it un-happen.
       CORRECTION   DOES. A number that should never have been there
                    must not keep paying rank forever.
       PENALTY      DOES. A fine is the system judging her, and Jen
                    decided a rank should be honest about the bad
                    stretches rather than only the good ones.

     A negative row is spending unless it says otherwise, because
     spending is the only one of the three that is routine.

     Two ways to say otherwise:

       kind: "correction" / "penalty"   explicit, what everything new writes
       a word in the description        the original rule, kept for history

     The word lists are KEPT, not replaced. Every row already in the
     ledger predates the kind field, so the words are the only thing
     that can classify the rows already sitting in Firebase — home
     upkeep's "Correction: {task}" lines, the sleep tracker's "Severe
     Sleep Debt (3.2 hrs)", hydration's "Drought Tax". New writers
     should set kind and not rely on their prose. */

  const RANK_WORDS = ["refund", "undo", "correction", "void", "reversal"];

  /* Deliberately narrow. These are the exact phrases the two trackers
     have always written, not a general vocabulary of unhappiness — a
     loose match here would demote her for a row that merely mentioned
     a debt. Anything new should set kind:"penalty" instead of hoping
     its wording lands on this list. */
  const PENALTY_WORDS = ["severe sleep debt", "drought tax"];

  function isCorrection(tx) {
    if (!tx) return false;
    if (tx.kind === "correction") return true;
    const desc = String(tx.description || "").toLowerCase();
    return RANK_WORDS.some(w => desc.includes(w));
  }

  function isPenalty(tx) {
    if (!tx) return false;
    if (tx.kind === "penalty") return true;
    const desc = String(tx.description || "").toLowerCase();
    return PENALTY_WORDS.some(w => desc.includes(w));
  }

  function countsTowardRank(tx) {
    const amount = Number(tx && tx.amount) || 0;
    if (amount > 0) return true;
    if (amount < 0) return isCorrection(tx) || isPenalty(tx);
    return false;
  }

  /* Lifetime prestige — the rank number — is the ledger replayed.

     This is the authoritative definition and the stored
     prestige_system/net_worth is not: that field is incremented on
     positive amounts by some trackers and decremented by none of
     them, so an undone hydration sip or a deleted sleep log leaves it
     permanently too high. Nothing reads it. Replaying costs one read
     of a list the ledger page already loads, and it cannot drift,
     because it IS the transactions.

     Accepts the raw Firebase object or an array — a snapshot .val()
     on a push-list is keyed by id, and every caller would otherwise
     write the same Object.values() line. */
  function lifetimeFrom(transactions) {
    if (!transactions) return 0;
    const rows = Array.isArray(transactions)
      ? transactions
      : Object.values(transactions);

    return rows.reduce((sum, tx) =>
      countsTowardRank(tx) ? sum + (Number(tx.amount) || 0) : sum, 0);
  }


  /* ══════════════════════════════════════════════════════
     WRITING A ROW
     ══════════════════════════════════════════════════════
     Builds the object; it does not push it. The caller owns the
     database handle and the serverTimestamp sentinel, which differ
     between the compat SDK and the modular one.

     `stamp` is whatever the caller's SDK uses for the server clock —
     firebase.database.ServerValue.TIMESTAMP in every current page. */

  function row(amount, description, source, stamp, opts) {
    const o = opts || {};
    const tx = {
      amount:      Number(amount) || 0,
      description: String(description == null ? "" : description),
      source:      String(source || "LIFEHUB"),
      timestamp:   stamp
    };
    /* The key is only added when it applies. Firebase rejects an
       explicit undefined, so `kind: o.correction ? "correction" :
       undefined` would throw rather than be ignored. */
    if (o.correction)   tx.kind = "correction";
    else if (o.penalty) tx.kind = "penalty";
    return tx;
  }

  /* A fine — the system docking her, not her spending. Takes a
     positive magnitude and writes the negative row, so a caller
     can't accidentally fine her upward. */
  function penalty(amount, description, source, stamp) {
    return row(-Math.abs(Number(amount) || 0), description, source, stamp,
               { penalty: true });
  }

  /* Taking back what a row paid. The sign is flipped for you and the
     correction flag is always set — this is the ONLY way points come
     back out of a rank, so it must not depend on the caller having
     phrased the description correctly. */
  function reversal(amount, description, source, stamp) {
    return row(-(Number(amount) || 0), description, source, stamp,
               { correction: true });
  }


  /* ══════════════════════════════════════════════════════
     READING IT BACK
     ══════════════════════════════════════════════════════
     One round trip, both numbers, on whatever Realtime Database
     handle the caller already has. Poppy uses this; so can any page
     that wants to show a total without re-deriving the rules. */

  function read(db) {
    return Promise.all([
      db.ref("prestige_system/balance").once("value"),
      db.ref("prestige_system/transactions").once("value")
    ]).then(([balSnap, txSnap]) => {
      const balance = Number(balSnap.val()) || 0;
      const raw = txSnap.val() || {};

      /* The id rides along. A row that has to be pointed at later —
         to correct it, or to say which one it was — can't be
         addressed without it. */
      const transactions = Object.keys(raw)
        .map(id => Object.assign({ id: id }, raw[id]))
        .sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));

      const lifetime = lifetimeFrom(transactions);

      return {
        balance:      balance,
        lifetime:     lifetime,
        tier:         tierFor(lifetime),
        transactions: transactions
      };
    });
  }


  window.LIFEHUB_PRESTIGE = {
    TIERS, RANK_WORDS, PENALTY_WORDS,
    tierFor, isCorrection, isPenalty, countsTowardRank, lifetimeFrom,
    row, reversal, penalty, read
  };

})();
