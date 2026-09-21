/* ============================================================
   LifeHub — Althea pill rules

   What a tablet is worth, and how the streak is counted. Pure
   functions over the FLO day records: no DOM, no Firebase, no clock
   of its own.

   This file exists because the answer now has three readers:

     · the FLO tracker, when a button is pressed
     · Poppy, when Jen tells her she has taken it
     · anything later that needs to agree with both

   Before it, the wage table and the milestone table lived inside
   tracker-flo.js, which meant Poppy could only log a tablet by
   waiting for the tracker page to be open and paying nothing if it
   was not. Two copies of a wage table drift, and a drifting wage
   table is a prestige balance that nobody can audit.

   Load BEFORE tracker-flo.js and before PoppyEngine-flo.js.
   ============================================================ */
(function () {
  'use strict';

  /* ── WHAT A DAY IS WORTH ──────────────────────────────────────
     NO STOCK pays nothing rather than costing something: running out
     is a supply problem, not a lapse, and fining her for it would
     make the honest answer the expensive one.

     MISSED costs five times what ON TIME pays. That asymmetry is the
     point — a combined pill only works taken, and the ledger should
     say so. */
  const WAGES = {
    ontime:  500,
    late:    200,
    nostock: 0,
    missed: -2500
  };

  /* Paid once each, the day the streak reaches them. 21 is a full
     pack of active tablets. */
  const MILESTONES = { 7: 1050, 14: 2800, 21: 5250 };

  /* The two statuses that mean the tablet actually went down. */
  const TAKEN = ['ontime', 'late'];

  const isTaken = (status) => TAKEN.indexOf(status) !== -1;

  /* A day's worth. Unknown or absent statuses are worth nothing
     rather than throwing — an unlogged day is a real state. */
  function wageFor(status) {
    return Object.prototype.hasOwnProperty.call(WAGES, status)
      ? WAGES[status] : 0;
  }

  /* What to actually post, given what was already paid for that day.
     Paying the DIFFERENCE is what makes corrections safe: logging
     MISSED and then fixing it to ON TIME moves +3,000, not +500 on
     top of a fine that stays. Re-pressing the same button moves
     nothing at all. */
  function settle(status, alreadyPaid) {
    const target = wageFor(status);
    const paid = Number(alreadyPaid) || 0;
    return { target, delta: target - paid };
  }

  /* ── THE STREAK ────────────────────────────────────────────────
     Derived, never stored. Walking the records means editing a past
     day corrects the count by itself, and no amount of clicking can
     inflate it.

     `keyFor(offset)` hands back the YYYY-MM-DD key `offset` days
     before the end date. The caller owns the calendar, so this file
     never has to know which timezone anyone is in. */
  function streak(days, keyFor, maxLookback) {
    let count = 0;
    const limit = maxLookback || 365;

    for (let i = 0; i < limit; i++) {
      const entry = (days && days[keyFor(i)]) || {};

      /* Today unlogged is not a break — the day is not over. */
      if (i === 0 && !entry.pill) continue;

      if (isTaken(entry.pill)) count++;
      else break;
    }
    return count;
  }

  /* Which milestone, if any, this streak has just reached and has
     not already been paid for. `paidSoFar` is the day's own record of
     milestones settled, so the same one cannot pay twice however many
     times the day is edited. */
  function milestoneFor(count, paidSoFar) {
    const amount = MILESTONES[count];
    if (!amount) return null;
    if (paidSoFar && paidSoFar[count]) return null;
    return { days: count, amount };
  }

  /* Plain words for a status, for anything that has to say it out
     loud rather than draw it. */
  function describe(status) {
    switch (status) {
      case 'ontime':  return 'taken on time';
      case 'late':    return 'taken late';
      case 'nostock': return 'not taken — out of stock';
      case 'missed':  return 'missed';
      default:        return 'not logged';
    }
  }

  window.LIFEHUB_PILL = {
    WAGES, MILESTONES, TAKEN,
    isTaken, wageFor, settle, streak, milestoneFor, describe
  };
})();
