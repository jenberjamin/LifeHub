/* ============================================================
   LifeHub — the intake queue

   Alexa's side of every tracker, drained here.

   ── THE PROBLEM THIS SOLVES ──────────────────────────────────────
   Alexa used to log water by writing a command to alexa_updates and
   trusting that the hydration TRACKER PAGE was open to hear it. A
   glass spoken to the Echo with the laptop shut was silently gone
   once the six-hour window passed. The same was true of a whole
   night's sleep: finalize_log asked the sleep page to press its own
   save button, and no page meant no log.

   ── WHY IT DRAINS HERE ───────────────────────────────────────────
   Because this file runs on the wallpaper, which is open whenever the
   PC is. Not "whenever Jen happens to have the hydration tracker up"
   — always.

   And because the wallpaper already has the real logic loaded.
   PoppyEngine-hydration.js and PoppyEngine-sleep.js hold the first-sip
   window, the goal check, the streak milestones, the consolidated
   receipt, the sleep bands and the Sleep Protocol. The alternative was
   porting all of it into a Lambda, giving every rate a THIRD home to
   drift out of step with. This way Alexa gets the same code Poppy
   uses, and the skill only has to know how to say "she drank this".

   ── DURABILITY ───────────────────────────────────────────────────
   Nothing expires. An item sits in the queue until it is applied, so
   a PC that was off all weekend catches up when it wakes rather than
   dropping what was said. An item that FAILS is not deleted either —
   it is marked with the reason and left, because a glass Jen actually
   drank should never vanish because of a bug.

   Load AFTER PoppyEngine-hydration.js and PoppyEngine-sleep.js.
   ============================================================ */
(function () {
  'use strict';

  const QUEUE_PATH = 'pending_intake';

  /* Two screens can run the wallpaper — the monitor and the TV. Both
     see the same queue, so an item is CLAIMED before it is applied or
     the glass gets logged twice. */
  const DEVICE_KEY = 'lifehub.surface.device';

  function deviceId() {
    try {
      let id = localStorage.getItem(DEVICE_KEY);
      if (!id) {
        id = 'dev_' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(DEVICE_KEY, id);
      }
      return id;
    } catch (e) {
      /* Private mode. A per-session id still prevents the common case
         of one machine double-applying; two machines both in private
         mode is not a case worth more code than this. */
      return 'dev_session_' + Math.random().toString(36).slice(2, 10);
    }
  }

  const ME = deviceId();

  /* A claim older than this is assumed dead — the tab that took it was
     closed mid-flight. Generous, because the cost of re-claiming too
     early is a double-logged glass and the cost of waiting is a glass
     logged five minutes late. */
  const CLAIM_STALE_MS = 5 * 60 * 1000;

  function db() {
    if (!window.POPPY_FETCH || typeof window.POPPY_FETCH.rtdb !== 'function') {
      console.warn('[intake] Poppy\'s Firebase layer is not loaded — the queue will not drain.');
      return null;
    }
    return window.POPPY_FETCH.rtdb('lifehub');
  }

  /* What each kind of item does. The item's own fields are handed
     straight through, so adding a tracker later is a line here and a
     matching LIFEHUB_*_INTAKE on its action file. */
  const HANDLERS = {
    water: (item) => {
      if (!window.LIFEHUB_INTAKE) throw new Error('hydration actions not loaded');
      return window.LIFEHUB_INTAKE.log({
        amount: item.amount,
        unit:   item.unit,
        drink:  item.drink,
        date:   item.date
      });
    },

    water_undo: () => {
      if (!window.LIFEHUB_INTAKE) throw new Error('hydration actions not loaded');
      return window.LIFEHUB_INTAKE.undo({});
    },

    workout: (item) => {
      if (!window.LIFEHUB_INTAKE) throw new Error('hydration actions not loaded');
      return window.LIFEHUB_INTAKE.workout({ on: item.on !== false, date: item.date });
    },

    sleep: (item) => {
      if (!window.LIFEHUB_SLEEP_INTAKE) throw new Error('sleep actions not loaded');
      return window.LIFEHUB_SLEEP_INTAKE.log({
        date:     item.date,
        bedtime:  item.bedtime,
        waketime: item.waketime,
        quality:  item.quality,
        feeling:  item.feeling,
        factors:  item.factors
      });
    },

    /* "Update my sleep log" — she re-answers quality, feeling and
       factors for a night already written. Sent as an amendment
       because logging it again would be refused as a duplicate and
       her answers would be dropped on the floor. */
    sleep_amend: (item) => {
      if (!window.LIFEHUB_SLEEP_INTAKE) throw new Error('sleep actions not loaded');
      return window.LIFEHUB_SLEEP_INTAKE.amend({
        date:    item.date,
        quality: item.quality,
        feeling: item.feeling,
        factors: item.factors
      });
    }
  };

  /* Claim by transaction, so two wallpapers racing for the same item
     produce one winner and one no-op rather than two logged glasses. */
  function claim(ref) {
    return ref.transaction(item => {
      if (!item) return;                       // gone already
      if (item.done) return;                   // applied, awaiting cleanup

      const held = item.claimedAt && (Date.now() - item.claimedAt) < CLAIM_STALE_MS;
      if (item.claimedBy && item.claimedBy !== ME && held) return;   // someone else has it

      item.claimedBy = ME;
      item.claimedAt = Date.now();
      return item;
    }).then(res => {
      const val = res.committed && res.snapshot.val();
      return (val && val.claimedBy === ME) ? val : null;
    });
  }

  async function apply(id, item) {
    const ref = db().ref(QUEUE_PATH + '/' + id);

    const mine = await claim(ref);
    if (!mine) return;                          // another screen took it

    const run = HANDLERS[mine.kind];
    if (!run) {
      /* An unknown kind is a skill sending something this build does
         not understand yet. Left in place, not deleted — an older
         wallpaper must not eat an item a newer one could handle. */
      await ref.update({
        error: 'Unknown intake kind "' + mine.kind + '"',
        erroredAt: Date.now(),
        claimedBy: null
      }).catch(() => {});
      return;
    }

    try {
      const receipt = await run(mine);
      console.log('💧 intake applied:', mine.kind, '—', receipt);

      /* Removed only once it is genuinely written. */
      await ref.remove();
    } catch (err) {
      /* NOT removed. A glass she actually drank must not disappear
         because of a bug or a flaky write. The claim is released so
         another screen, or this one after a reload, can try again. */
      console.warn('[intake] failed to apply', id, '—', err.message);
      await ref.update({
        error: err.message || String(err),
        erroredAt: Date.now(),
        attempts: (Number(mine.attempts) || 0) + 1,
        claimedBy: null,
        claimedAt: null
      }).catch(() => {});
    }
  }

  function start() {
    const database = db();
    if (!database) return;

    const queue = database.ref(QUEUE_PATH);

    /* child_added fires for everything already there on connect, which
       is exactly what catching up means — a weekend of speaking to
       Alexa with the PC off arrives the moment it comes back on. */
    queue.on('child_added', snap => {
      const item = snap.val();
      if (!item || item.done) return;

      /* An item that has failed several times is left alone rather
         than retried forever on every reload. It stays in the queue,
         visible, with its reason attached. */
      if ((Number(item.attempts) || 0) >= 3) {
        console.warn('[intake] giving up on', snap.key, '—', item.error);
        return;
      }

      apply(snap.key, item);
    }, err => {
      console.warn('[intake] could not watch the queue:', err.message);
    });

    console.log('💧 intake queue watching — Alexa can log with every page shut.');
  }

  /* The action files are loaded at the end of the body; this may run
     before them depending on where it is placed. Waiting for the
     window load event costs nothing and removes the ordering trap. */
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start);

})();
