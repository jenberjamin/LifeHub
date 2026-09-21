/* ═══════════════════════════════════════════════════
   SCRIBBLE — WHAT POPPY CAN DO HERE
   ═══════════════════════════════════════════════════
   Poppy lives in the LifeHub homescreen. Two windows share no
   JavaScript, so she can't call ctxLogs() across the gap — she sends
   a command, and a page picks it up.

   The channel itself is in LifeHub-surface.js, which every page
   already loads. It handles the listening, the age guards, and
   writing back whether it worked. This file only says what Scribble
   can do about it.

   Close and save aren't here. Those are built in and work by pressing
   the panel's own buttons, which is why the general record keeps its
   unsaved-edits guard without this file mentioning it.

   ── ADDING ONE ───────────────────────────────────────────────
   One line in the list below. The name is the `action` string Poppy
   sends. Throw to refuse — the message reaches her, so write it for
   Jen rather than for a log.

   Plain script, no imports: it only touches functions scribble-app.js
   already put on the page.
═══════════════════════════════════════════════════ */

(function () {

    if (!window.LIFEHUB_SURFACE || typeof window.LIFEHUB_SURFACE.on !== 'function') {
        console.warn('[Scribble] LifeHub-surface.js missing — Poppy can\'t reach this page.');
        return;
    }

    /* Every one of these is the same function the right-click menu
       calls. No second implementation to drift out of step. */
    const PANELS = {
        view_contents:        'ctxViewContents',
        show_logs:            'ctxLogs',
        show_records:         'ctxRecords',
        show_general_records: 'ctxGeneralRecord'
    };

    /* scribble-app.js runs before this, but its project list arrives
       over the network — so the function can exist while the project
       it needs is still missing. Both are checked, and the wording is
       for Jen because that is where it ends up. */
    function open(fnName, cmd) {
        const fn = window[fnName];
        if (typeof fn !== 'function') {
            throw new Error("That panel isn't available on this page.");
        }
        if (!cmd || !cmd.projectId) throw new Error('Which project?');

        /* ctxViewContents and ctxRecords return quietly when the project
           isn't in the live list. Nothing would open, and the ack would
           still say done — so it's caught here, while it can still be
           said out loud. */
        const list = window._projects;
        if (Array.isArray(list) && list.length &&
            !list.some(p => p.id === cmd.projectId)) {
            throw new Error("That project isn't on the Scribble page right now.");
        }

        /* Returned, not awaited here: the modals fetch before they draw,
           and the channel waits on this promise so the ack lands after
           the panel is actually on screen. */
        return fn(cmd.projectId);
    }

    Object.keys(PANELS).forEach(action => {
        window.LIFEHUB_SURFACE.on(action, cmd => open(PANELS[action], cmd));
    });

})();
