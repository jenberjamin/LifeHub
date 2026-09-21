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

    const on = (name, fn) => window.LIFEHUB_SURFACE.on(name, fn);

    /* Calling through window rather than holding a reference: these are
       hoisted function declarations, but a later refactor to const would
       break a captured reference silently, and this way the failure is a
       sentence Jen can read. */
    function call(fnName, arg) {
        const fn = window[fnName];
        if (typeof fn !== 'function') {
            throw new Error("That isn't available on this page.");
        }
        return fn(arg);
    }


    /* ── PANELS ──────────────────────────────────────────────────
       Every one is the same function the right-click menu calls. No
       second implementation to drift out of step. */
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
    function openPanel(fnName, cmd) {
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

        /* Returned, not awaited: the modals fetch before they draw, and
           the channel waits on this promise so the ack lands after the
           panel is actually on screen. */
        return call(fnName, cmd.projectId);
    }

    Object.keys(PANELS).forEach(action => {
        on(action, cmd => openPanel(PANELS[action], cmd));
    });


    /* ── THE LANDING PAGE ────────────────────────────────────────
       Sorting and filtering only mean anything on the projects grid.
       On the archive or bin page these functions don't exist, and the
       refusal above says so. */

    /* The five values in the sort dropdown. Checked here rather than
       trusting the model: applySort falls through to 'added' for
       anything it doesn't recognise, so a wrong mode would quietly
       sort by date and report success. */
    const SORT_MODES = {
        name_asc:  'name, A to Z',
        name_desc: 'name, Z to A',
        accessed:  'date accessed',
        added:     'date added',
        size:      'size'
    };

    on('sort', cmd => {
        const mode = String((cmd && cmd.mode) || '').trim();
        if (!SORT_MODES[mode]) {
            throw new Error('I can sort by name, date added, date accessed or size.');
        }
        /* The <select> is the visible record of the sort. Left alone it
           would keep showing the old choice while the grid disagreed. */
        const sel = document.querySelector('.sort-select');
        if (sel) sel.value = mode;
        return call('applySort', mode);
    });

    on('filter', cmd => {
        const q = (cmd && typeof cmd.query === 'string') ? cmd.query : '';
        /* Same reason: the box has to show what the grid is filtered by,
           or clearing it by hand afterwards won't restore anything. */
        const box = document.getElementById('proj-search');
        if (box) box.value = q;
        return call('filterProjects', q);
    });


    /* ── INSIDE THE LOGS PANEL ───────────────────────────────────
       These act on whatever the panel is currently showing, so they
       only work while it's open. _logsCtx.id is empty until ctxLogs
       has run. */
    function logsOpen() {
        const c = window._logsCtx;
        if (!c || !c.id) throw new Error("The activity log isn't open.");
        return c;
    }

    const LOG_SORTS = {
        newest: 'newest first', oldest: 'oldest first',
        today: 'today', yesterday: 'yesterday', lastweek: 'last week'
    };

    on('logs_sort', cmd => {
        logsOpen();
        const v = String((cmd && cmd.mode) || '').trim();
        if (!LOG_SORTS[v]) {
            throw new Error('I can show newest, oldest, today, yesterday or last week.');
        }
        const sel = document.querySelector('.logs-sort-select');
        if (sel) sel.value = v;
        return call('logsSetSort', v);
    });

    on('logs_minor', cmd => {
        logsOpen();
        /* Absent means turn it on — "show me the content edits" is the
           only reason to reach for this. */
        const want = (cmd && cmd.show === false) ? false : true;
        const box = document.querySelector('.logs-minor input, input.logs-minor');
        if (box) box.checked = want;
        return call('logsSetMinor', want);
    });

    on('logs_page', cmd => {
        const c = logsOpen();
        /* logsPage takes a delta and does no bounds checking of its own —
           paging past the end paints an empty list and leaves the counter
           stranded, so the edges are refused here instead. */
        const d = Number((cmd && cmd.delta) || 0);
        if (d !== 1 && d !== -1) throw new Error('Next page or previous page?');
        if (d === -1 && (c.page || 1) <= 1) throw new Error("That's the first page.");
        return call('logsPage', d);
    });


    /* ── THE RECENT PANEL ────────────────────────────────────────
       clearRecent hides everything older than now by writing a
       watermark to localStorage. The log entries themselves are
       untouched, so this is a view being cleared, not data. */
    on('clear_recent', () => call('clearRecent'));

    on('toggle_recent', cmd => {
        const list = document.getElementById('recent-list') ||
                     document.querySelector('.logs-list');
        if (!list) throw new Error("I can't find the Recent panel.");

        const isOpen = list.style.display !== 'none';
        /* Asking for the state it's already in should do nothing rather
           than flip it — "collapse that" said twice shouldn't reopen it. */
        const want = (cmd && typeof cmd.open === 'boolean') ? cmd.open : !isOpen;
        if (want === isOpen) {
            return want ? 'Recent is already open' : 'Recent is already collapsed';
        }
        return call('toggleLogs');
    });


    /* ── THE RECORDS PANEL ───────────────────────────────────────
       copyRecordsPath reads #rec-path, which only exists while that
       panel is up. */
    on('copy_path', () => {
        if (!document.getElementById('rec-path')) {
            throw new Error("The Records panel isn't open.");
        }
        return call('copyRecordsPath');
    });

})();
