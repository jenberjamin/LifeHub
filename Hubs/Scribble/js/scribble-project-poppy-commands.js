/* ═══════════════════════════════════════════════════
   SCRIBBLE — WHAT POPPY CAN DO INSIDE A PROJECT
   js/scribble-project-poppy-commands.js
   Added 2026-09-17

   The companion to js/scribble-poppy-commands.js. That one
   runs on the workshop and speaks about PROJECTS. This one
   runs on Scribble-project.html and speaks about the three
   tiers inside one: MODULES, SECTIONS and DOCUMENT FILES.

   The channel itself is in LifeHub-surface.js. This file
   only says what the project page can do about it.

   ═══════════════════════════════════════════════════
   THE THREE RULES THIS FILE IS BUILT ON
   ═══════════════════════════════════════════════════

   ── 1. THE TIER IS IN THE ACTION NAME ──────────────
   Not in a field. `file_bin`, `module_bin`, `section_bin`
   — never `bin` with a tier argument.

   Because the router in PoppyEngine-core.js gates on the
   WORDS Jen actually said. One action per tier means one
   guidelines block per tier, and the rules genuinely
   differ by tier: a module can only live at a project's
   root, only folders can merge, only modules can be
   promoted, only document files have versions and exports.
   One shared handler would need all four rulesets crammed
   into a single prompt.

   It also moves where the guarantee lives. With the tier
   in the name, a tier-ambiguous command CANNOT be sent.
   With the tier in a field, you are trusting the model to
   fill the field correctly — which is the thing we are
   specifically not trusting.

   The tier strings are `module` / `section` / `file`:
   singular, lowercase, exactly the keys of COLL in
   js/scribble-project-firebase.js. They pass straight into
   PROJECT_FB with no translation, so there is no mapping
   layer and therefore no mapping bug.

   ── 2. NAMES ARE RESOLVED HERE, NOT BY POPPY ───────
   findProject() in JS/poppy/PoppyEngine-scribble.js works
   because projects are few, flat, and globally named — it
   resolves a name to an id in the wallpaper and sends the
   id.

   Items cannot work that way. They live in a tree, scoped
   to one project, split across three collections, and
   their names legitimately repeat: the same `notes` in six
   projects, the same `index.html` in four modules. For
   Poppy to resolve them she would have to pull every item
   of every project on every message — expensive, and stale
   the moment anything is renamed.

   The page already has the answer. `_contents` is live in
   memory, kept fresh by listenProjectContents, and it is
   the same array the grid draws from. So the command
   carries the WORDS and resolve() does the lookup, against
   data that cannot be out of date.

   ── 3. NOTHING DESTRUCTIVE HAPPENS BY NAME ─────────
   The elevation that matters most.

   Every safe action takes a name. Every destructive one
   takes a `ref` — an id this page handed back from a
   `_locate` one turn earlier. Poppy cannot delete by the
   name Jen said; she has to ask which thing it is, hear
   the path back, and then act on the id.

   By the time anything destructive happens, the spoken
   name is out of the loop entirely. A misheard word cannot
   reach the wrong document.

   ── AND A PROPERTY WORTH KEEPING ───────────────────
   No handler in this file writes to Firestore, except the
   pin toggle. Everything destructive OPENS THE PAGE'S OWN
   DIALOG, prefilled, and stops. Jen confirms by voice with
   the `confirm` command that LifeHub-surface.js already
   provides, which presses the dialog's real button.

   So the type-the-name gate, the cascade count, the
   duplicate-name refusal and every other guard the page
   already has stay in the loop. Poppy gains reach without
   gaining the ability to change anything on her own.

   ═══════════════════════════════════════════════════
   ADDING ONE
   ═══════════════════════════════════════════════════
   Safe and reversible → resolve(tier, cmd.name), act.
   Destructive → byRef(tier, cmd.ref), open the dialog.

   Return a STRING. It becomes what Poppy says, and for a
   locate it is also how the ref gets back to her. Throw to
   refuse — the message reaches her, so write it for Jen
   rather than for a log.

   Plain script, no imports. It only touches functions
   scribble-project-app.js already put on the page.
═══════════════════════════════════════════════════ */

(function () {

    if (!window.LIFEHUB_SURFACE || typeof window.LIFEHUB_SURFACE.on !== 'function') {
        console.warn('[Scribble project] LifeHub-surface.js missing — Poppy can\'t reach this page.');
        return;
    }
    if (typeof window.findItem !== 'function') {
        console.warn('[Scribble project] scribble-project-app.js must load first.');
        return;
    }

    const on = (name, fn) => window.LIFEHUB_SURFACE.on(name, fn);

    /* Called through window rather than held as a reference: these are
       hoisted declarations in a sibling script, and a later refactor to
       const would break a captured reference silently. This way the
       failure is a sentence Jen can read. */
    function call(fnName) {
        const fn = window[fnName];
        if (typeof fn !== 'function') {
            throw new Error("That isn't available on this page.");
        }
        return fn.apply(null, Array.prototype.slice.call(arguments, 1));
    }


    /* ══════════════════════════════════════════════════
       THE TIERS
    ══════════════════════════════════════════════════ */
    const TIERS = {
        module:  { plural: 'modules',        pool: () => window._contents.modules  },
        section: { plural: 'sections',       pool: () => window._contents.sections },
        file:    { plural: 'document files', pool: () => window._contents.files    }
    };

    /* The same comparison findItemClash uses. Case is ignored, and
       nothing else is — spaces, hyphens and dots inside a name are real
       characters. If these two ever disagree, voice and typing would
       disagree about what counts as the same name. */
    function norm(s) {
        return String(s == null ? '' : s).trim().toLowerCase();
    }

    /* A file's identity is name AND extension everywhere else in
       Scribble, so "notes.txt" has to be sayable. Colour files are
       labelled the way createFile logs them. */
    function labelOf(item, tier) {
        if (tier !== 'file' || !item.type) return item.name || 'Untitled';
        if (item.type === 'colour') return (item.name || 'Untitled') + ' [colour]';
        return (item.name || 'Untitled') + '.' + item.type;
    }

    /* "LIFEHUB / CSS" — the folder chain above an item, rooted at
       whichever project is actually on screen. The `seen` set matters:
       a looping parent chain would hang this, which is why every path
       walker in the codebase carries one. */
    function pathOf(item) {
        const folders = window._contents.modules.concat(window._contents.sections);
        const parts = [];
        let cur = item.parentId || null;
        const seen = new Set();
        while (cur && !seen.has(cur)) {
            seen.add(cur);
            const anc = folders.find(x => x.id === cur);
            if (!anc) break;
            parts.unshift(anc.name || 'Untitled');
            cur = anc.parentId || null;
        }
        return [call('viewProjectName')].concat(parts).join(' / ');
    }

    function fullPath(item, tier) {
        return pathOf(item) + ' / ' + labelOf(item, tier);
    }


    /* ══════════════════════════════════════════════════
       RESOLVING A SPOKEN NAME
       ══════════════════════════════════════════════════
       Widens in steps and stops at the first that hits, so
       an exact name can never be beaten by a loose one —
       the same shape as findProject(), which Jen already
       knows the behaviour of.

       ── WHERE YOU ARE STANDING COMES FIRST ────────────
       Steps 1 and 3 only look in _currentParentId, the
       folder the grid is showing. That is what makes "the
       notes file" mean the one in front of you rather than
       one three folders away with the same name — and it is
       how you would point at it if you were using a mouse.

       Only when the current folder has nothing does it
       widen to the whole project.
    ══════════════════════════════════════════════════ */
    function resolve(tier, said) {
        const spec = TIERS[tier];
        if (!spec) throw new Error('I only know about modules, sections and document files.');

        const pool = spec.pool().filter(x => !x.deleted && !x.archived);
        const want = norm(said);

        if (!want) throw new Error('Which ' + tier + '?');

        if (!pool.length) {
            throw new Error('I can\'t see any ' + spec.plural + ' here — either ' +
                call('viewProjectName') + ' has none, or its contents are still loading.');
        }

        const here  = x => (x.parentId || null) === window._currentParentId;
        /* Both the bare name and the name-with-extension, so "notes" and
           "notes.txt" both find the same file. */
        const names = x => [norm(labelOf(x, tier)), norm(x.name)];

        const steps = [
            x => here(x) && names(x).indexOf(want) !== -1,
            x =>            names(x).indexOf(want) !== -1,
            x => here(x) && names(x).some(n => n.indexOf(want) === 0),
            x =>            names(x).some(n => n.indexOf(want) === 0),
            x =>            names(x).some(n => n.indexOf(want) !== -1)
        ];

        let hits = [];
        for (const test of steps) {
            hits = pool.filter(test);
            if (hits.length) break;
        }

        if (hits.length === 1) return hits[0];

        /* Ambiguity is answered with PATHS, not a count. "That matches
           three files" is useless; naming where each one lives is the
           whole point of being specific. */
        if (hits.length > 1) {
            const shown = hits.slice(0, 5).map(x => fullPath(x, tier));
            throw new Error('That matches ' + hits.length + ' ' + spec.plural + ': ' +
                shown.join(' · ') +
                (hits.length > 5 ? ' · and ' + (hits.length - 5) + ' more' : '') +
                '. Which one?');
        }

        throw new Error('There is no ' + tier + ' called “' + said +
                        '” in ' + call('viewProjectName') + '.');
    }

    /*
     * The other half of rule 3. A destructive command arrives with a
     * ref instead of a name, and this is the only way in.
     *
     * findItem is the page's own lookup — not a second implementation,
     * so a ref that no longer resolves fails the same way the grid
     * would. Contents are live, so an item deleted or moved away
     * between the locate and the act is caught here rather than acted
     * on blind.
     */
    function byRef(tier, ref) {
        if (!TIERS[tier]) throw new Error('I only know about modules, sections and document files.');

        const id = String(ref == null ? '' : ref).trim();
        if (!id) {
            throw new Error('I need the ref from a locate first — ask me to find it, ' +
                            'then tell me to act on what I found.');
        }

        const item = call('findItem', tier, id);
        if (!item) {
            throw new Error('That ref isn\'t a ' + tier + ' in ' + call('viewProjectName') +
                            ' any more. Locate it again.');
        }
        return item;
    }


    /* ══════════════════════════════════════════════════
       WHERE AM I
       Read-only, and the thing Poppy should ask before she
       guesses. Cheap: everything here is already in memory.
    ══════════════════════════════════════════════════ */
    on('where', () => {
        const c = window._contents;
        const inFolder = n => n.filter(x => (x.parentId || null) === window._currentParentId).length;

        const place = window._path.length
            ? call('viewProjectName') + ' / ' + window._path.map(p => p.name).join(' / ')
            : 'the root of ' + call('viewProjectName');

        const portal = (window._viewProjectId && window._viewProjectId !== window._projectId)
            ? ' You came in through a link from ' + window._projectName + '.'
            : '';

        return 'You are in ' + place + ' — ' +
               inFolder(c.modules)  + ' modules, ' +
               inFolder(c.sections) + ' sections, ' +
               inFolder(c.files)    + ' document files here.' + portal;
    });


    /* ══════════════════════════════════════════════════
       PER-TIER ACTIONS
       Generated, so a fourth tier would be one line and
       three tiers cannot drift apart.
    ══════════════════════════════════════════════════ */
    Object.keys(TIERS).forEach(tier => {

        /* ── LOCATE — the gateway to everything destructive ──────
           Changes nothing. Its whole job is to turn a spoken name
           into a path Jen can recognise and a ref Poppy can quote. */
        on(tier + '_locate', cmd => {
            const item = resolve(tier, cmd && cmd.name);
            const kids = (tier === 'file')
                ? 0
                : call('getDescendantCount', item.id, window._contents);

            return fullPath(item, tier) +
                   (item.isSymlink ? ' · a LINK to ' + (item.targetProjectName || 'another project') : '') +
                   (kids ? ' · ' + kids + ' item' + (kids === 1 ? '' : 's') + ' inside' : '') +
                   (item.pinned ? ' · pinned' : '') +
                   ' · ref ' + item.id;
        });

        /* ── SAFE, BY NAME ──────────────────────────────────────
           Reversible or read-only, so a misheard name costs a
           click to undo and nothing else. */

        on(tier + '_open', cmd => {
            const item = resolve(tier, cmd && cmd.name);
            if (tier === 'module')  call('openModule',  item.id);
            if (tier === 'section') call('openSection', item.id);
            if (tier === 'file')    call('openFile',    item.id);
            return 'Opened ' + fullPath(item, tier) + '.';
        });

        on(tier + '_pin',   cmd => setPin(tier, cmd && cmd.name, true));
        on(tier + '_unpin', cmd => setPin(tier, cmd && cmd.name, false));

        on(tier + '_logs', cmd => {
            const item = resolve(tier, cmd && cmd.name);
            call('ctxLogsItem', tier, item.id);
            return 'Opened the log for ' + fullPath(item, tier) + '.';
        });

        on(tier + '_records', cmd => {
            const item = resolve(tier, cmd && cmd.name);
            call('ctxRecords', tier, item.id);
            return 'Opened the records for ' + fullPath(item, tier) + '.';
        });

        /* ── DESTRUCTIVE, BY REF, AND ONLY AS FAR AS THE DIALOG ──
           Each one opens the page's own confirmation and stops. The
           answer tells Jen exactly what is on screen and what to say
           next, so a voice flow reads like the click flow. */

        on(tier + '_rename', cmd => {
            const item = byRef(tier, cmd && cmd.ref);
            const want = String((cmd && cmd.name) == null ? '' : cmd.name).trim();

            if (!want) throw new Error('What should it be called instead?');
            if (norm(want) === norm(item.name)) {
                return labelOf(item, tier) + ' is already called that.';
            }

            call('ctxRenameItem', tier, item.id);

            /* ctxRenameItem builds the modal synchronously and only
               defers the focus, so the input is here already. */
            const el = document.getElementById('rename-input');
            if (!el) throw new Error("The rename box didn't open.");
            el.value = want;

            return 'Rename box is open for ' + fullPath(item, tier) + ' with “' +
                   want + '” typed in. Say save to commit it, or close to back out.';
        });

        on(tier + '_bin', cmd => {
            const item = byRef(tier, cmd && cmd.ref);
            const kids = call('getDescendantCount', item.id, window._contents);

            call('ctxDeleteItem', tier, item.id);

            return 'Bin dialog is open for ' + fullPath(item, tier) +
                   (kids ? ' — ' + kids + ' nested item' + (kids === 1 ? '' : 's') +
                           ' go with it' : '') +
                   '. Say confirm to move it to the bin, or close to back out.';
        });

        on(tier + '_archive', cmd => {
            const item = byRef(tier, cmd && cmd.ref);
            call('ctxArchiveItem', tier, item.id);
            return 'Archive dialog is open for ' + fullPath(item, tier) +
                   '. Nothing expires on the shelf. Say confirm to shelve it, ' +
                   'or close to back out.';
        });

        on(tier + '_duplicate', cmd => {
            /* Additive — it only ever creates. By name is fine. */
            const item = resolve(tier, cmd && cmd.name);
            call('ctxDuplicateItem', tier, item.id);
            return 'Duplicate dialog is open for ' + fullPath(item, tier) +
                   '. Say confirm to make the copy.';
        });
    });


    function setPin(tier, said, want) {
        const item = resolve(tier, said);

        /* Asking for the state it is already in should do nothing rather
           than flip it — "pin that" said twice shouldn't unpin it. */
        if (!!item.pinned === !!want) {
            return labelOf(item, tier) + ' was already ' +
                   (want ? 'pinned' : 'unpinned') + '.';
        }

        call('ctxPinItem', tier, item.id);
        return (want ? 'Pinned ' : 'Unpinned ') + fullPath(item, tier) + '.';
    }


    /* ══════════════════════════════════════════════════
       TIER-SPECIFIC — the things only one tier can do
    ══════════════════════════════════════════════════ */

    /* Modules only. The module does not move, it BECOMES the project,
       so its own shell disappears and its children land at the new
       project's root. */
    on('module_promote', cmd => {
        const item = byRef('module', cmd && cmd.ref);
        if (item.isSymlink) {
            throw new Error('That is a link to a module in another project. ' +
                            'Promote the original instead.');
        }
        const kids = call('getDescendantCount', item.id, window._contents);
        call('ctxPromoteModule', item.id);
        return 'Promote dialog is open for ' + labelOf(item, 'module') + ' — ' + kids +
               ' item' + (kids === 1 ? '' : 's') + ' would move to the new project\'s root, ' +
               'and the module leaves ' + call('viewProjectName') +
               '. Say confirm to go ahead.';
    });

    /* Document files only. */
    on('file_versions', cmd => {
        const item = resolve('file', cmd && cmd.name);
        call('ctxVersionHistory', item.id, item.name);
        return 'Opened version history for ' + fullPath(item, 'file') + '.';
    });

    on('file_export', cmd => {
        const item = resolve('file', cmd && cmd.name);
        call('ctxExportItem', 'file', item.id);
        return 'Export dialog is open for ' + fullPath(item, 'file') +
               '. Pick a format on screen.';
    });

    on('file_details', cmd => {
        const item = resolve('file', cmd && cmd.name);
        call('ctxViewContents', 'file', item.id);
        return 'Opened details for ' + fullPath(item, 'file') + '.';
    });


    /* ══════════════════════════════════════════════════
       THE PAGE ITSELF — no tier involved
       `sort` and `filter` keep the SAME action names the
       workshop uses. One vocabulary, two implementations:
       on the workshop they rearrange projects, here they
       rearrange this project's contents. Jen says the same
       thing either way, which is the point.
    ══════════════════════════════════════════════════ */

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

        /* The visible <select> has to agree with the grid, or clearing it
           by hand afterwards restores nothing. Scoped past any open
           modal: the activity log has a .sort-select of its own. */
        const sel = Array.prototype.slice
            .call(document.querySelectorAll('.sort-select'))
            .filter(s => !s.closest('.modal-overlay'))[0];
        if (sel) sel.value = mode;

        call('applySort', mode);
        return 'Sorted ' + call('viewProjectName') + ' by ' + SORT_MODES[mode] + '.';
    });

    on('filter', cmd => {
        const q = (cmd && typeof cmd.query === 'string') ? cmd.query : '';
        const box = document.getElementById('project-search');
        if (box) box.value = q;
        call('filterContents', q);
        return q ? 'Filtered to “' + q + '”.' : 'Cleared the filter.';
    });

    on('up', () => {
        if (!window._path.length) {
            throw new Error('You are already at the root of ' + call('viewProjectName') + '.');
        }
        call('navigateUp');
        /* Read AFTER the move — _path has been popped by now. */
        return 'Went up to ' + (window._path.length
            ? window._path[window._path.length - 1].name
            : 'the root of ' + call('viewProjectName')) + '.';
    });

    on('root', () => {
        if (!window._path.length) {
            return 'Already at the root of ' + call('viewProjectName') + '.';
        }
        call('navigateTo', -1);
        return 'Back at the root of ' + call('viewProjectName') + '.';
    });

    on('activity', () => {
        call('openActivityLog');
        return 'Opened the activity log for ' + call('viewProjectName') + '.';
    });

    on('general_record', () => {
        call('openGeneralRecord');
        return 'Opened the general record for ' + call('viewProjectName') + '.';
    });

})();
