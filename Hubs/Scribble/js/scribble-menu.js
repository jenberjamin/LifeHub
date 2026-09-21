/* ═══════════════════════════════════════════════════
   SCRIBBLE — HEADER MENU
   js/scribble-menu.js

   One menu at the far right of the header, after the
   LifeHub button, holding the tools that aren't
   navigation: access history, backup, and whatever
   comes next.

   ── WHY A MENU AT ALL ─────────────────────────────
   Every feature that earned a header icon made the
   header worse. Two was already crowded and the next
   one would have been unreadable — a row of unlabelled
   glyphs you have to hover to identify. A menu costs one
   extra click and gives every item a name, which is the
   right trade once there are more than two.

   ── WHY INJECTED, NOT MARKUP ──────────────────────
   The same block would otherwise be pasted into four
   HTML files and drift apart the first time one gets
   edited alone. Adding a fifth page is now just
   including this script.

   ── ADDING AN ITEM ────────────────────────────────
   One entry in ITEMS below. `when` decides whether it
   appears at all, so a page that never loads the backup
   module simply does not show that row rather than
   showing one that fails. `danger: true` sets the row
   apart — a rule above it and a red label — for the ones
   you should not click by accident.
═══════════════════════════════════════════════════ */

(function () {

    const ITEMS = [
        {
            id:    'menu-history',
            icon:  'fa-solid fa-shield-halved',
            label: 'Access history',
            hint:  'Sign-ins and failed attempts',
            when:  () => typeof window.openAccessLog === 'function',
            run:   () => window.openAccessLog()
        },
        {
            id:    'menu-devices',
            icon:  'fa-solid fa-laptop',
            label: 'Devices',
            hint:  'What has opened Scribble on this account',
            when:  () => typeof window.openScribbleDevices === 'function',
            run:   () => window.openScribbleDevices()
        },
        {
            id:    'menu-backup',
            icon:  'fa-solid fa-download',
            label: 'Download a backup',
            hint:  'Save the whole archive as JSON',
            when:  () => typeof window.runScribbleBackup === 'function',
            run:   () => window.runScribbleBackup()
        },
        {
            id:     'menu-signout',
            icon:   'fa-solid fa-right-from-bracket',
            label:  'Sign out of this device',
            hint:   'Needs the account password to get back in',
            danger: true,
            when:   () => typeof window.scribbleDisconnectDevice === 'function',
            run:    () => window.scribbleDisconnectDevice()
        }
    ];

    let wrap = null, panel = null, btn = null;

    function build() {
        /* Appended to the right cluster, so it lands after the LifeHub
           button — last thing in the header. The panel is right-aligned
           in CSS to match; left-aligned from here it would hang off the
           edge of the window. */
        const host = document.querySelector('.header-right');
        if (!host || document.getElementById('hdr-menu-wrap')) return;

        wrap = document.createElement('div');
        wrap.className = 'hdr-menu-wrap';
        wrap.id = 'hdr-menu-wrap';

        btn = document.createElement('button');
        btn.className = 'hdr-menu-btn';
        btn.id = 'hdr-menu-btn';
        btn.type = 'button';
        btn.title = 'Menu';
        btn.setAttribute('aria-haspopup', 'true');
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-label', 'Menu');
        btn.innerHTML = '<i class="fa-solid fa-bars"></i>';

        panel = document.createElement('div');
        panel.className = 'hdr-menu';
        panel.id = 'hdr-menu';
        panel.setAttribute('role', 'menu');
        panel.hidden = true;

        wrap.appendChild(btn);
        wrap.appendChild(panel);
        host.appendChild(wrap);

        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            panel.hidden ? open() : close();
        });

        /* Anywhere else closes it. Capture phase, so a click that also
           triggers something underneath still dismisses the menu. */
        document.addEventListener('click', function (e) {
            if (!panel.hidden && !wrap.contains(e.target)) close();
        }, true);

        document.addEventListener('keydown', function (e) {
            if (panel.hidden) return;
            if (e.key === 'Escape') { close(); btn.focus(); return; }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                moveFocus(e.key === 'ArrowDown' ? 1 : -1);
            }
        });
    }

    /*
     * Rebuilt on every open rather than once at startup: the modules
     * that provide these items are ES modules and may still be loading
     * when this classic script runs. Checking at open time means a row
     * appears as soon as its feature is actually available, instead of
     * being decided too early and missing.
     */
    function open() {
        panel.innerHTML = '';

        const available = ITEMS.filter(it => {
            try { return it.when(); } catch (e) { return false; }
        });

        if (!available.length) {
            panel.innerHTML = '<div class="hdr-menu-empty">Nothing available on this page.</div>';
        } else {
            available.forEach(function (it) {
                const row = document.createElement('button');
                row.type = 'button';
                row.className = 'hdr-menu-item' + (it.danger ? ' danger' : '');
                row.id = it.id;
                row.setAttribute('role', 'menuitem');
                row.innerHTML =
                    '<i class="' + it.icon + '"></i>' +
                    '<span class="hdr-menu-text">' +
                      '<span class="hdr-menu-label">' + it.label + '</span>' +
                      '<span class="hdr-menu-hint">' + it.hint + '</span>' +
                    '</span>';
                row.addEventListener('click', function () {
                    close();
                    /* Next frame, so the menu is gone before a modal
                       opens on top of where it was. */
                    requestAnimationFrame(() => it.run());
                });
                panel.appendChild(row);
            });
        }

        panel.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
        btn.classList.add('open');

        const first = panel.querySelector('.hdr-menu-item');
        if (first) first.focus();
    }

    function close() {
        if (!panel || panel.hidden) return;
        panel.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
        btn.classList.remove('open');
    }

    function moveFocus(step) {
        const rows = Array.from(panel.querySelectorAll('.hdr-menu-item'));
        if (!rows.length) return;
        const i = rows.indexOf(document.activeElement);
        const next = (i + step + rows.length) % rows.length;
        rows[next].focus();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', build);
    } else {
        build();
    }

    window.SCRIBBLE_MENU = { open, close, items: ITEMS };

})();
