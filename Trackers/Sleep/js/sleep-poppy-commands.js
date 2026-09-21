/* ═══════════════════════════════════════════════════
   SLEEP TRACKER — WHAT POPPY CAN DO HERE
   ═══════════════════════════════════════════════════
   Poppy lives in the LifeHub homescreen. Two windows share no
   JavaScript, so she can't set a field on this page directly — she
   sends a command, and this file picks it up.

   The channel itself is in JS/poppy/LifeHub-surface.js. It handles
   the listening, the age guards, and writing back whether it worked.
   This file only says what the sleep tracker can do about it.

   ── WHAT IS AND ISN'T HERE ───────────────────────────────────────
   Saving is NOT here, and that is deliberate. Poppy writes sleep_logs
   directly from PoppyEngine-sleep.js, because the tracker is usually
   shut when Jen talks to her — a save that needed this page open would
   work only when she'd already gone to the place she was avoiding.
   The tracker's own on('value') listener redraws either way.

   What's left is the two things that only make sense with the page in
   front of her: filling the form for her to check, and opening the
   archive. Closing a panel isn't here either — LifeHub-surface.js does
   that by pressing the panel's own button.

   Plain script, no imports: it only touches what tracker-sleep.js has
   already put on the page.
═══════════════════════════════════════════════════ */

(function () {

    if (!window.LIFEHUB_SURFACE || typeof window.LIFEHUB_SURFACE.on !== 'function') {
        console.warn('[Sleep] LifeHub-surface.js missing — Poppy can\'t reach this page.');
        return;
    }

    /* Setting .value from code fires no event, and the styled pickers
       repaint on 'change' — so every write goes through this, or the
       visible field keeps showing the previous value over a real one.
       Same reason the Alexa listener in tracker-sleep.js does it. */
    function setField(id, val) {
        const el = document.getElementById(id);
        if (!el) return false;
        el.value = val;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }

    /* The chips have no value to set — they're divs with a class, and
       the selected list lives in a closure inside tracker-sleep.js.
       Clicking is the only way in, which also means the count stays
       correct: a chip already on is left alone rather than toggled off. */
    function setFactors(wanted) {
        const want = (wanted || []).map(f => String(f).toUpperCase());
        const chips = document.querySelectorAll('.chip');
        if (!chips.length) return;

        chips.forEach(chip => {
            const on = chip.classList.contains('selected');
            const shouldBeOn = want.indexOf(chip.innerText.trim().toUpperCase()) !== -1;
            if (on !== shouldBeOn) chip.click();
        });
    }

    /* Fills the form and stops. Nothing is saved — she presses LOG
       SLEEP herself, which is the whole point of this command over
       Poppy writing the log outright. */
    function fill(cmd) {
        let touched = 0;

        if (cmd.date)     touched += setField('logDate', cmd.date) ? 1 : 0;
        if (cmd.bedtime)  touched += setField('bedtime', cmd.bedtime) ? 1 : 0;
        if (cmd.waketime) touched += setField('waketime', cmd.waketime) ? 1 : 0;
        if (cmd.feeling)  touched += setField('sleepFeeling', cmd.feeling) ? 1 : 0;

        /* The range slider carries its own printed number, which is a
           separate element and doesn't follow the input on its own. */
        if (cmd.quality) {
            const q = document.getElementById('quality');
            const label = document.getElementById('qualityVal');
            if (q) {
                q.value = cmd.quality;
                q.dispatchEvent(new Event('input', { bubbles: true }));
                if (label) label.innerText = cmd.quality;
                touched++;
            }
        }

        if (Array.isArray(cmd.factors)) { setFactors(cmd.factors); touched++; }

        if (!touched) throw new Error("I couldn't find those fields on the tracker.");

        /* The duration display is driven by a 'change' listener on both
           time inputs, so it has already recalculated by now — but only
           if both were filled. Saying so beats a silent "0 hr 0 min". */
        const bed = document.getElementById('bedtime');
        const wake = document.getElementById('waketime');
        if (bed && wake && bed.value && !wake.value) {
            throw new Error("Filled that in, but there's no wake time yet so the hours are still blank.");
        }
    }

    window.LIFEHUB_SURFACE.on('sleep_fill', fill);

    /* tracker-sleep.js is shared with the mobile page, which has the
       function but not the modal it draws into — so the element is
       checked, not just the function, or the mobile page would throw
       from inside openHistoryModal() and report a stack trace as the
       reason Poppy couldn't open something that isn't there. */
    window.LIFEHUB_SURFACE.on('sleep_open_history', () => {
        if (typeof window.openHistoryModal !== 'function' ||
            !document.getElementById('historyModal')) {
            throw new Error("There's no sleep archive on this screen.");
        }
        window.openHistoryModal();
    });

})();
