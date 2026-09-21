/* ═══════════════════════════════════════════════════
   SCRIBBLE — OPEN DOCUMENTS, EVERYWHERE
   js/scribble-session-tabs.js

   The editor's tabs only existed on the project page, so
   walking over to the bin or the archive meant losing
   sight of what you were in the middle of. This carries
   that strip to every page.

   ── WHAT IS STORED ────────────────────────────────
   Names and ids. NOT content — that lives in Firestore
   and is re-read when a file is actually opened, so this
   record stays a few hundred bytes no matter how large
   the files are.

       { v, activeId, projectId, tabs: [ {id,name,type,projectId,…} ] }

   localStorage rather than Firestore on purpose: which
   documents you have open is a property of THIS browser,
   not of the archive. Syncing it would mean the tablet
   yanking the laptop's tabs around.

   ── WHO WRITES IT ─────────────────────────────────
   scribble-editor-app.js, from renderTabs() — the one
   function every tab mutation already funnels through,
   so opening, closing, switching and reordering are all
   captured by a single hook.

   ── WHO READS IT ──────────────────────────────────
   • Every non-editor page renders the strip below the
     header. Clicking a tab returns you to that file.
   • The project page restores the whole set, so the
     session follows you rather than collapsing to the
     one file you clicked.

   Classic script, not a module: the editor and all four
   page scripts are classic, and this needs no Firestore.
═══════════════════════════════════════════════════ */

(function () {

    const KEY     = 'scribbleOpenTabs';
    const VERSION = 1;
    const MAX     = 24;          /* a runaway session cannot bloat storage */

    /* ══════════════════════════════════════════════
       STORE
    ══════════════════════════════════════════════ */
    function save(openFiles, activeId, fallbackPid) {
        try {
            if (!openFiles || !openFiles.length) { clear(); return; }

            const tabs = openFiles.slice(0, MAX).map(f => ({
                id:        f.id,
                name:      f.name || 'Untitled',
                type:      f.type || '',
                /* A symlink's tab shows the link's name but its content
                   lives in the source project — keep both so the strip
                   can label it and the editor can still find it. */
                projectId: f._overridePid || f.projectId || fallbackPid || null,
                isSymlink: f.isSymlink === true || !!f._symlinkDisplayName,
                linkName:  f._symlinkDisplayName || null
            })).filter(t => t.id && t.projectId);

            if (!tabs.length) { clear(); return; }

            localStorage.setItem(KEY, JSON.stringify({
                v: VERSION,
                activeId: activeId || tabs[0].id,
                savedAt: Date.now(),
                tabs
            }));
        } catch (e) { /* storage full or blocked — the strip just goes stale */ }
    }

    function load() {
        try {
            const raw = localStorage.getItem(KEY);
            if (!raw) return null;
            const s = JSON.parse(raw);
            if (!s || s.v !== VERSION || !Array.isArray(s.tabs) || !s.tabs.length) return null;
            return s;
        } catch (e) { return null; }
    }

    function clear() {
        try { localStorage.removeItem(KEY); } catch (e) {}
        render();
    }

    /* Removing one tab from another page. */
    function drop(id) {
        const s = load();
        if (!s) return;
        s.tabs = s.tabs.filter(t => t.id !== id);
        if (!s.tabs.length) { clear(); return; }
        if (s.activeId === id) s.activeId = s.tabs[0].id;
        try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
        render();
    }

    /* ══════════════════════════════════════════════
       THE STRIP
       Only on pages that are not the editor — the
       project page has the real tabs already.
    ══════════════════════════════════════════════ */
    function isEditorPage() {
        return !!document.getElementById('editor-tabs') ||
               /Scribble-project\.html$/i.test(location.pathname);
    }

    function label(t) {
        const base = t.linkName || t.name;
        return base + (t.type && !t.linkName ? '.' + t.type : '');
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /*
     * The dock is the project page's minimised editor tab, carried
     * across: same corner, same shape, same file-icon-and-count. On the
     * project page it maximises the editor; here there is no editor to
     * maximise, so it opens a list of what you have going and each row
     * takes you back to that file.
     */
    let listOpen = false;

    function render() {
        if (isEditorPage()) return;

        let dock = document.getElementById('ots-dock');
        const s = load();

        if (!s) {
            if (dock) dock.remove();
            listOpen = false;
            return;
        }

        if (!dock) {
            dock = document.createElement('div');
            dock.id = 'ots-dock';
            document.body.appendChild(dock);
        }

        const rows = s.tabs.map(t => {
            const active = t.id === s.activeId ? ' active' : '';
            return '<div class="ots-row' + active + '" ' +
                   'title="' + esc(label(t)) + ' — click to reopen" ' +
                   'onclick="SCRIBBLE_TABS.go(\'' + t.projectId + '\',\'' + t.id + '\')">' +
                     (t.isSymlink
                        ? '<i class="fa-solid fa-link ots-icon"></i>'
                        : '<i class="fa-regular fa-file ots-icon"></i>') +
                     '<span class="ots-name">' + esc(label(t)) + '</span>' +
                     '<span class="ots-close" title="Close" ' +
                           'onclick="event.stopPropagation();SCRIBBLE_TABS.drop(\'' + t.id + '\')">' +
                       '<i class="fa-solid fa-xmark"></i></span>' +
                   '</div>';
        }).join('');

        dock.innerHTML =
            '<div class="ots-list' + (listOpen ? '' : ' hidden') + '" id="ots-list">' +
              '<div class="ots-list-head">' +
                '<span>Open documents</span>' +
                '<button type="button" class="ots-closeall" title="Close all" ' +
                        'onclick="event.stopPropagation();SCRIBBLE_TABS.clear()">Close all</button>' +
              '</div>' +
              rows +
            '</div>' +
            '<div class="ots-pill" onclick="SCRIBBLE_TABS.toggle()" ' +
                 'title="' + s.tabs.length + ' open — click to see them">' +
              '<i class="fa-regular fa-file"></i>' +
              '<span class="ots-count">' + s.tabs.length + '</span>' +
            '</div>';
    }

    function toggle() {
        listOpen = !listOpen;
        const list = document.getElementById('ots-list');
        if (list) list.classList.toggle('hidden', !listOpen);
    }

    /* Anywhere else closes the list. */
    document.addEventListener('click', function (e) {
        if (!listOpen) return;
        const dock = document.getElementById('ots-dock');
        if (dock && !dock.contains(e.target)) { listOpen = false; render(); }
    }, true);

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && listOpen) { listOpen = false; render(); }
    });

    /* Back to the file. The project page reads ?open= and restores the
       rest of the session around it. */
    function go(projectId, fileId) {
        location.href = 'Scribble-project.html?id=' + encodeURIComponent(projectId) +
                        '&open=' + encodeURIComponent(fileId);
    }

    /* Another tab of the browser changed the session — keep this one
       honest rather than showing a set that is no longer open. */
    window.addEventListener('storage', function (e) {
        if (e.key === KEY) render();
    });

    window.SCRIBBLE_TABS = { save, load, clear, drop, go, render, toggle };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', render);
    } else {
        render();
    }

})();
