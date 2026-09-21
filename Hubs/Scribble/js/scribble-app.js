/* ═══════════════════════════════════════════════════
   SCRIBBLE — APP LOGIC  v3.0
   scribble-app.js
   Phase 3 changes: ctxDelete → soft-delete flow
                    gotoRecycleBin added
═══════════════════════════════════════════════════ */

// ── State
var _projects      = [];
var _filterQuery   = '';
var _sortAsc       = false;
var _unsubProjects = null;
var _activeCtxMenu = null;
var _activeModal   = null;

/* ── ROOMS — added 2026-09-21 ──────────────────────
   'deploy' used to be a dead end: switchView('deploy')
   showed a "coming in Phase 3" placeholder and that was
   the whole of it.

   A room is the same grid over a different set of
   projects. Deployment projects are ordinary projects
   — same `projects/{pid}` document, same workspace
   page, same editor, same bin — carrying room:'deploy'.
   So everything below is shared on purpose; only the
   wording and the room being subscribed to differ.

   _room is which grid is on screen. Anything that
   CREATES has to read it, or a project made in
   Deployment lands in All Projects. */
var _room = 'all';

var ROOM_TEXT = {
    all: {
        nav:      'Project',
        eyebrow:  'Project',
        modal:    'NEW PROJECT',
        search:   'Find Projects…',
        empty:    'No projects yet — click Add New to get started.',
        noMatch:  'No projects match your search.'
    },
    deploy: {
        nav:      'Deployment',
        eyebrow:  'Deployment',
        modal:    'NEW DEPLOYMENT',
        search:   'Find Deployments…',
        empty:    'No deployments yet — click Add New to get started.',
        noMatch:  'No deployments match your search.'
    }
};
function roomText() { return ROOM_TEXT[_room] || ROOM_TEXT.all; }

/* Which room a card belongs to. Defers to the data layer so
   the label on a card and the grid it was put on can never
   disagree; the fallback is for the window between this
   script loading and the Firebase module arriving. */
function roomOfProject(p) {
    if (window.SCRIBBLE_FB && window.SCRIBBLE_FB.roomOf) return window.SCRIBBLE_FB.roomOf(p);
    return (p && p.room === 'deploy') ? 'deploy' : 'all';
}

/* Opening a project leaves this page entirely, and coming back
   used to always land on All Projects — so every trip into a
   Deployment project cost you two clicks to get back to where
   you were. Remembered here, read by SCRIBBLE_READY below.
   Wrapped: private-mode Safari throws on localStorage, and a
   forgotten room must never stop the workshop from loading. */
var ROOM_KEY = 'scribble.room';
function rememberRoom(room) {
    try { localStorage.setItem(ROOM_KEY, room); } catch (e) {}
}
function lastRoom() {
    try {
        var r = localStorage.getItem(ROOM_KEY);
        return (r === 'deploy' || r === 'all') ? r : 'all';
    } catch (e) { return 'all'; }
}

// ── Entry point (called by firebase module after DB is ready)
window.SCRIBBLE_READY = function () { switchView(lastRoom()); };

/* ─── NAVIGATION ─────────────────────────────── */
function switchView(view) {
    document.querySelectorAll('.nav-item').forEach(function(el){ el.classList.remove('active'); });
    var t = document.getElementById('nav-' + view);
    if (t) t.classList.add('active');
    if (_unsubProjects) { _unsubProjects(); _unsubProjects = null; }
    switch (view) {
        /* 2026-09-21 — 'deploy' was a dead branch showing a "coming in
           Phase 3" placeholder. Both rooms now run the same three lines;
           the room is state, not a separate code path, which is what
           keeps the two grids from drifting apart as either one grows. */
        case 'all':
        case 'deploy':
            _room = view;
            rememberRoom(view);
            /* Cleared on every room change. Carrying it over meant
               switching rooms while a search was typed showed an empty
               grid and a search box that looked empty too. */
            _filterQuery = '';
            applyRoomChrome();
            renderProjectsShell();
            subscribeProjects();
            break;
        default:
            showEmpty('Select a view','','fa-regular fa-folder-open');
    }
}

/* The sidebar's Add button is shared by both rooms, so its label has
   to say which one it will create in — it reads "+ Project" in All
   Projects and "+ Deployment" here. The button itself is unchanged;
   addNew() reads _room. */
function applyRoomChrome() {
    var addLabel = document.querySelector('.nav-add .nav-text');
    if (addLabel) addLabel.textContent = roomText().nav;
}

function showEmpty(label, sub, iconClass) {
    var main = document.getElementById('main-panel');
    main.innerHTML =
        '<div class="empty-state">' +
        '<i class="' + iconClass + ' empty-icon"></i>' +
        '<span class="empty-label">' + esc(label) + '</span>' +
        (sub ? '<span class="empty-sub">' + esc(sub) + '</span>' : '') +
        '</div>';
}

/* ─── HEADER ─────────────────────────────────── */
function headerSearch(value) {
    var ps = document.getElementById('proj-search');
    if (ps) ps.value = value;
    filterProjects(value);
}
/* gotoLifeHub() removed 2026-09-17 — it was a console.log stub, and the
   Scribble.html header already replaced it with two plain links. */
function gotoRecycleBin()  { window.location.href = 'Scribble-recycle-bin.html'; }
function openProject(id)   {

    if (window.SCRIBBLE_FB) window.SCRIBBLE_FB.touchAccessed(id).catch(function(){});

    window.location.href = 'Scribble-project.html?id=' + id;

}

/* ─── ALL PROJECTS VIEW ──────────────────────── */
function renderProjectsShell() {
    var main = document.getElementById('main-panel');
    main.innerHTML =
        '<div class="projects-view">' +
        '<div class="projects-toolbar">' +
        /* 2026-09-21 \u2014 placeholder comes from ROOM_TEXT rather than being
           the literal "Find Projects\u2026", so the box names what it searches. */
        '<input class="projects-search" type="text" placeholder="' + esc(roomText().search) + '"' +
        ' id="proj-search" oninput="filterProjects(this.value)">' +
        '<select class="sort-select" title="Sort by" onchange="applySort(this.value)">' +
        '<option value="name_asc">Name (Ascending)</option>' +

        '<option value="name_desc">Name (Descending)</option>' +

        '<option value="accessed">Date Accessed</option>' +

        '<option value="added" selected>Date Added</option>' +

        '<option value="size">Size</option>' +

        '</select>' +
        '</div>' +
        '<div class="projects-grid" id="projects-grid"></div>' +
        '</div>';
}

function subscribeProjects() {
    if (!window.SCRIBBLE_FB) return;
    /* 2026-09-21 — listenProjects gained a leading room argument.
       Re-subscribed on every room change; switchView drops the old
       listener first, so only one is ever live. */
    _unsubProjects = window.SCRIBBLE_FB.listenProjects(_room, function(projects) {
        _projects = projects;
        renderProjectGrid(_filterQuery);
    });
}

function renderProjectGrid(query) {
    var grid = document.getElementById('projects-grid');
    if (!grid) return;
    var list = _projects;
    if (query) {
        var q = query.toLowerCase();
        list = list.filter(function(p){ return p.name.toLowerCase().indexOf(q) !== -1; });
    }
    if (!list.length) {
        /* 2026-09-21 \u2014 both strings said "projects" outright; they now
           name the room, so an empty Deployment grid doesn't claim you
           have no projects when All Projects is full of them. */
        grid.innerHTML = '<div class="proj-empty">' +
            esc(query ? roomText().noMatch : roomText().empty) +
            '</div>';
        return;
    }
    grid.innerHTML = list.map(projectCardHTML).join('');

    // Cards fade in on a stagger, but the grid is rebuilt on every
    // keystroke and every Firestore snapshot — without this the whole
    // wall would re-animate while you type. Only the first paint of a
    // given grid element gets the entrance.
    if (!grid.dataset.entered) {
        grid.dataset.entered = '1';
        grid.classList.add('grid-entering');
        setTimeout(function(){ grid.classList.remove('grid-entering'); }, 700);
    }
}

function projectCardHTML(p) {
    /* 2026-09-21 — ROOM. The eyebrow and the big faded backdrop glyph
       were both the literal 'deployed_code' / "Project".

       Read from the card's OWN room, not from _room, so a card is
       always labelled by what it is rather than by which grid happens
       to be on screen — that matters the moment anything lists both
       rooms together (search across rooms, Recent, the bin).

       Still a Material Symbol, not the sidebar's Font Awesome
       layer-group: .pc-eyebrow-icon and .pc-backdrop are sized and
       positioned as Material Symbols in scribble.css, and swapping the
       font in would break the backdrop's placement. 'layers' is the
       closest glyph in the family. */
    var _pRoom   = roomOfProject(p);
    var _glyph   = _pRoom === 'deploy' ? 'layers' : 'deployed_code';
    var _label   = ROOM_TEXT[_pRoom].eyebrow;
    var _u       = _ms(p, 'updatedAt');
    var updated  = _u ? relativeTime(new Date(_u)) : '\u2014';
    var pinClass = p.pinned ? ' pinned' : '';
    var pinBadge = p.pinned
        ? '<i class="fa-solid fa-thumbtack" style="font-size:7px;color:var(--sub)" title="Pinned"></i>'
        : '';
    return (
        '<div class="project-card" id="card-' + p.id + '" onclick="openProject(\'' + p.id + '\')" oncontextmenu="event.preventDefault();showCtxMenu(event,\'' + p.id + '\')">' +
        '<div class="pc-header">' +
        '<span class="material-symbols-outlined pc-eyebrow-icon">' + _glyph + '</span>' +
        '<span class="pc-eyebrow-text">' + esc(_label) + '</span>' +
        pinBadge +
        '<button class="card-dots-btn" onclick="showCtxMenu(event,\'' + p.id + '\')" title="Options">' +
        '<i class="fa-solid fa-ellipsis"></i></button>' +
        '</div>' +
        '<span class="material-symbols-outlined pc-backdrop">' + _glyph + '</span>' +
        '<span class="card-name" id="name-' + p.id + '">' + esc(p.name) + '</span>' +
        '<div class="pc-divider"></div>' +
        '<div class="pc-footer">' +
        '<span class="card-date">' + updated + '</span>' +
        '<button class="card-pin-btn' + pinClass + '"' +
        ' onclick="event.stopPropagation();togglePin(\'' + p.id + '\',' + (p.pinned ? 'true' : 'false') + ')"' +
        ' title="' + (p.pinned ? 'Unpin' : 'Pin') + '">' +
        '<i class="fa-solid fa-thumbtack"></i></button>' +
        '</div>' +
        '</div>'
    );
}

/* ─── ADD NEW ────────────────────────────────── */
/* 2026-09-21 — ROOM. Creates into whichever room you are standing in;
   the modal says which so the button can never create somewhere you
   weren't looking. The field is still "PROJECT NAME" in both rooms —
   a Deployment IS a project, and the name is checked against every
   project in both rooms (see createProject in scribble-firebase.js). */
function addNew() {
    var _glyph = _room === 'deploy' ? 'layers' : 'deployed_code';
    showModal(
        '<div class="modal-title">' +
        '<span class="material-symbols-outlined" style="font-size:20px;color:var(--sub)">' + _glyph + '</span>' +
        esc(roomText().modal) + '</div>' +
        '<div class="modal-field-label">PROJECT NAME</div>' +
        '<input class="modal-input" type="text" id="new-proj-name" maxlength="80"' +
        ' onkeydown="if(event.key===\'Enter\')submitNewProject()">' +
        '<div class="modal-field-label">DESCRIPTION</div>' +
        '<textarea class="modal-textarea" id="new-proj-desc" style="min-height:150px"></textarea>' +
        '<div class="modal-footer">' +
        '<button class="modal-btn primary" onclick="submitNewProject()">CREATE</button>' +
        '<button class="modal-btn" onclick="closeModal()">CANCEL</button>' +
        '</div>'
    );
    setTimeout(function(){ var el=document.getElementById('new-proj-name'); if(el)el.focus(); }, 50);
}

async function submitNewProject() {
    var nameEl = document.getElementById('new-proj-name');
    var descEl = document.getElementById('new-proj-desc');
    var name   = nameEl ? nameEl.value.trim() : '';
    var desc   = descEl ? descEl.value.trim() : '';
    if (!name) { if (nameEl){ nameEl.classList.add('error'); nameEl.focus(); } return; }

    /* Checked BEFORE the modal closes, so a clash leaves the New Project
       box exactly as you left it — name and description still there to
       edit. Closing first and then failing would throw away the lot. */
    var clash = null;
    try {
        clash = await window.SCRIBBLE_FB.findProjectClash(name);
    } catch (e) { /* offline read failed — let the write below decide */ }

    if (clash) {
        window.showNameClash({
            kind:  'project',
            typed: name,
            clash: clash,
            onEdit: function () {
                var el = document.getElementById('new-proj-name');
                if (el) { el.classList.add('error'); el.focus(); el.select(); }
            }
        });
        return;
    }

    closeModal();
    try {
        /* 2026-09-21 — third argument added. Without it every project
           created from the Deployment grid was written with no room,
           which reads as 'all' — so it was created successfully and
           then vanished, because the grid you made it in doesn't list
           that room. */
        await window.SCRIBBLE_FB.createProject(name, desc, _room);
    } catch (err) {
        if (err && err.code === 'duplicate-name' && err.clash) {
            window.showNameClash({ kind: 'project', typed: name, clash: err.clash });
        } else {
            alert('Could not create that project.');
        }
    }
}

/* ─── CONTEXT MENU ───────────────────────────── */
function showCtxMenu(e, projectId) {
    e.stopPropagation();
    hideCtxMenu();
    var p = _projects.find(function(x){ return x.id === projectId; });
    if (!p) return;
    var pinLabel     = p.pinned ? 'UNPIN' : 'PIN';
    var pinIconColor = p.pinned ? 'color:var(--accent)' : '';
    var menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.id = 'ctx-menu';
    menu.innerHTML =
        '<div class="ctx-item" onclick="ctxPin(\'' + p.id + '\',' + p.pinned + ')">' +
        '<i class="fa-solid fa-thumbtack" style="' + pinIconColor + '"></i>' + pinLabel + '</div>' +
        '<div class="ctx-item" onclick="ctxRename(\'' + p.id + '\')">' +
        '<i class="fa-regular fa-pen-to-square"></i>RENAME</div>' +
        '<div class="ctx-item" onclick="ctxViewContents(\'' + p.id + '\')">' +
        '<i class="fa-regular fa-file-lines"></i>VIEW CONTENTS</div>' +
        '<div class="ctx-divider"></div>' +
        '<div class="ctx-item" onclick="ctxDuplicate(\'' + p.id + '\')">' +
        '<i class="fa-regular fa-copy"></i>DUPLICATE</div>' +
        '<div class="ctx-item" onclick="ctxLogs(\'' + p.id + '\')">' +
        '<i class="fa-regular fa-clock"></i>LOGS</div>' +
        '<div class="ctx-item" onclick="ctxRecords(\'' + p.id + '\')">' +
'<i class="fa-solid fa-book-bookmark"></i>RECORDS</div>' +
        '<div class="ctx-item" onclick="ctxGeneralRecord(\'' + p.id + '\')">' +
        '<i class="fa-solid fa-hard-drive"></i>GENERAL RECORD</div>' +
'<div class="ctx-item" onclick="ctxMerge(\'' + p.id + '\')">' +
'<i class="fa-solid fa-code-merge"></i>MERGE</div>' +
        '<div class="ctx-item" onclick="ctxArchive(\'' + p.id + '\')">' +
        '<i class="material-symbols-outlined" style="font-size:13px">inventory_2</i>ARCHIVE</div>' +
        '<div class="ctx-divider"></div>' +
        '<div class="ctx-item danger" onclick="ctxDelete(\'' + p.id + '\')">' +
        '<i class="fa-regular fa-trash-can"></i>DELETE</div>';
    document.body.appendChild(menu);
    _activeCtxMenu = menu;

    var menuW = 174, menuH = 300;

    var left, top;

    if (e.clientX !== undefined && e.type === 'contextmenu') {

        left = e.clientX;

        top  = e.clientY;

    } else {

        var rect = e.currentTarget.getBoundingClientRect();

        left = rect.right - menuW;

        top  = rect.bottom + 4;

    }

    if (left + menuW > window.innerWidth) left = window.innerWidth - menuW - 8;

    if (left < 8) left = 8;

    if (top + menuH > window.innerHeight) top = top - menuH;

    if (top < 8) top = 8;

    menu.style.left = left + 'px';

    menu.style.top  = top  + 'px';

}

function hideCtxMenu() {
    if (_activeCtxMenu) { _activeCtxMenu.remove(); _activeCtxMenu = null; }
}

document.addEventListener('click', hideCtxMenu);
document.addEventListener('keydown', function(e){
    if (e.key === 'Escape') { hideCtxMenu(); closeModal(); }
});

/* ─── PIN ────────────────────────────────────── */
function ctxPin(id, pinned)   { hideCtxMenu(); window.SCRIBBLE_FB.togglePin(id, pinned); }
function togglePin(id, pinned){ window.SCRIBBLE_FB.togglePin(id, pinned); }

/* ─── RENAME ─────────────────────────────────── */
function ctxRename(id) {
    hideCtxMenu();
    var p      = _projects.find(function(x){ return x.id === id; });
    var nameEl = document.getElementById('name-' + id);
    if (!p || !nameEl) return;
    var input      = document.createElement('input');
    input.className = 'card-name-input';
    input.id        = 'name-' + id;
    input.value     = p.name;
    input.maxLength = 80;
    var committed = false;
    /*
     * fromBlur distinguishes the two ways out, because a clash should
     * mean different things:
     *
     *   Enter  — you meant to commit, so stay in the field and fix it.
     *   Blur   — you clicked away, so revert. Refocusing here instead
     *            would trap you in the input: every attempt to leave
     *            fires blur, which refocuses, which fires blur again.
     */
    async function doSave(fromBlur) {
        if (committed) return;
        var newName = input.value.trim();

        if (newName && newName !== p.name) {
            var clash = null;
            try {
                clash = await window.SCRIBBLE_FB.findProjectClash(newName, id);
            } catch (e) { /* offline read failed — let the write decide */ }

            if (clash) {
                if (fromBlur) { doCancel(); return; }   // clicked away: revert
                input.classList.add('error');
                window.showNameClash({
                    kind:  'project',
                    typed: newName,
                    clash: clash,
                    onEdit: function () {
                        if (input.parentNode) { input.focus(); input.select(); }
                    }
                });
                return;                       // still not committed — try again
            }
        }

        committed = true;
        var span = document.createElement('span');
        span.className = 'card-name'; span.id = 'name-' + id;
        span.textContent = newName || p.name;
        if (input.parentNode) input.replaceWith(span);

        if (newName && newName !== p.name) {
            window.SCRIBBLE_FB.renameProject(id, p.name, newName)
                .catch(function(err) {
                    if (err && err.code === 'duplicate-name' && err.clash) {
                        window.showNameClash({ kind: 'project', typed: newName, clash: err.clash });
                    } else {
                        alert('Could not rename that project.');
                    }
                });
        }
    }
    function doCancel() {
        if (committed) return; committed = true;
        var span = document.createElement('span');
        span.className = 'card-name'; span.id = 'name-' + id;
        span.textContent = p.name;
        if (input.parentNode) input.replaceWith(span);
    }
    input.addEventListener('keydown', function(e){
        if (e.key === 'Enter')  { e.preventDefault(); doSave(false); }
        if (e.key === 'Escape') { doCancel(); }
    });
    input.addEventListener('blur', function(){ doSave(true); });
    nameEl.replaceWith(input);
    input.focus(); input.select();
}

/* ─── VIEW CONTENTS ──────────────────────────── */
async function ctxViewContents(id) {
    hideCtxMenu();
    var p = _projects.find(function(x){ return x.id === id; });
    if (!p) return;
    var counts = await window.SCRIBBLE_FB.getProjectCounts(id);
    showModal(
        '<div class="vc-header">' +
        '<div class="modal-title" style="margin-bottom:0">' +
        '<span class="material-symbols-outlined" style="font-size:18px;color:var(--sub)">deployed_code</span>' +
        esc(p.name) + '</div>' +
        '<button class="modal-close-btn" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<textarea class="modal-textarea" id="vc-desc" style="min-height:210px">' + esc(p.description || '') + '</textarea>' +
        /* Sections added 2026-09-17 — getProjectCounts has always
           returned all three tiers and this panel showed two of them,
           so a project's sections were invisible here. */
        '<div class="vc-stats">' +
        '<span class="vc-stat"><strong>' + counts.modules  + '</strong> Modules</span>' +
        '<span class="vc-stat"><strong>' + counts.sections + '</strong> Sections</span>' +
        '<span class="vc-stat"><strong>' + counts.files    + '</strong> Files</span>' +
        '</div>' +
        '<div class="modal-footer">' +
        '<button class="modal-btn primary" onclick="saveViewContents(\'' + id + '\')">SAVE</button>' +
        '<button class="modal-btn" onclick="closeModal()">CLOSE</button>' +
        '</div>', '560px'
    );
}

async function saveViewContents(id) {
    var descEl = document.getElementById('vc-desc');
    await window.SCRIBBLE_FB.updateDescription(id, descEl ? descEl.value : '');
    closeModal();
}

/* ─── DUPLICATE ──────────────────────────────── */
function ctxDuplicate(id) {
    hideCtxMenu();
    showModal(
        '<div class="modal-title" style="justify-content:center">' +
        '<i class="fa-regular fa-copy" style="font-size:20px;color:var(--sub)"></i></div>' +
        '<p class="modal-body-text">Are you sure you want to clone this Project?</p>' +
        '<div class="modal-footer">' +
        '<button class="modal-btn primary" onclick="doDuplicate(\'' + id + '\')">DUPLICATE</button>' +
        '<button class="modal-btn" onclick="closeModal()">CANCEL</button>' +
        '</div>', '400px'
    );
}
async function doDuplicate(id) { closeModal(); await window.SCRIBBLE_FB.duplicateProject(id); }

/* ─── LOGS ───────────────────────────────────── */
/*
 * Landing-page project log.
 * Three things it now does that it didn't:
 *   1. stamps the PATH  — which module/section the item lives under
 *   2. filters by KIND  — created / renamed / deleted / etc.
 *   3. pages 50 at a time instead of one endless scroll
 *
 * Path/kind come from fields writeProjectLog started storing.
 * Entries written BEFORE that change have no path and are shown
 * as "unattributed" rather than faked.
 */
var _logsCtx = { id: '', all: [], sort: 'newest', kind: 'all', minor: false, page: 1 };
var LOGS_PAGE_SIZE = 50;

var LOG_KIND_LABELS = {
    all:     'All Kinds',
    create:  'Created',
    rename:  'Renamed',
    move:    'Moved',
    copy:    'Copied',
    link:    'Symlinks',
    version: 'Versions',
    record:  'Records',
    tag:     'Tags',
    merge:   'Merged',
    delete:  'Deleted',
    restore: 'Restored',
    /* Added 2026-09-17 — scribble-archive-firebase.js and archiveProject()
       both stamp kind:'archive' explicitly, but neither log reader had an
       entry for it. So shelving showed up as "Other", and picking ANY
       specific kind filtered every archive event out of the list. */
    archive: 'Archived',
    content: 'Content Edits',
    meta:    'Other',
    legacy:  'Unattributed (old)'
};

async function ctxLogs(id) {
    hideCtxMenu();
    _logsCtx = { id: id, all: [], sort: 'newest', kind: 'all', minor: false, page: 1 };
    _logsCtx.all = await window.SCRIBBLE_FB.getProjectLogs(id);
    renderLogsModal();
}

function renderLogsModal() {
    var kindOpts = Object.keys(LOG_KIND_LABELS).map(function(k) {
        return '<option value="' + k + '"' + sel(_logsCtx.kind, k) + '>' + LOG_KIND_LABELS[k] + '</option>';
    }).join('');

    showModal(
        '<div class="logs-modal-top">' +
        '<div class="modal-title" style="margin-bottom:0">' +
        '<i class="fa-regular fa-clock" style="font-size:16px;color:var(--sub)"></i>LOGS</div>' +
        '<select class="logs-sort-select" onchange="logsSetKind(this.value)">' + kindOpts + '</select>' +
        '<select class="logs-sort-select" onchange="logsSetSort(this.value)">' +
            '<option value="newest"    ' + sel(_logsCtx.sort,'newest')    + '>Newest First</option>' +
            '<option value="oldest"    ' + sel(_logsCtx.sort,'oldest')    + '>Oldest First</option>' +
            '<option value="today"     ' + sel(_logsCtx.sort,'today')     + '>Today</option>' +
            '<option value="yesterday" ' + sel(_logsCtx.sort,'yesterday') + '>Yesterday</option>' +
            '<option value="lastweek"  ' + sel(_logsCtx.sort,'lastweek')  + '>Last Week</option>' +
        '</select></div>' +
        '<label class="logs-minor-toggle">' +
            '<input type="checkbox"' + (_logsCtx.minor ? ' checked' : '') +
            ' onchange="logsSetMinor(this.checked)"> Show content edits' +
        '</label>' +
        '<div class="logs-modal-list" id="logs-modal-list"></div>' +
        '<div class="logs-modal-pager">' +
            '<span class="logs-modal-count" id="logs-modal-count"></span>' +
            '<button class="modal-btn" id="logs-prev" onclick="logsPage(-1)">PREV</button>' +
            '<span class="logs-modal-pageno" id="logs-modal-pageno"></span>' +
            '<button class="modal-btn" id="logs-next" onclick="logsPage(1)">NEXT</button>' +
        '</div>' +
        '<div class="modal-footer" style="margin-top:12px">' +
        '<button class="modal-btn" onclick="closeModal()">CLOSE</button></div>',
        '640px'
    );
    paintLogsList();
}

function logsSetKind(v)  { _logsCtx.kind  = v;  _logsCtx.page = 1; paintLogsList(); }
function logsSetSort(v)  { _logsCtx.sort  = v;  _logsCtx.page = 1; paintLogsList(); }
function logsSetMinor(v) { _logsCtx.minor = v;  _logsCtx.page = 1; paintLogsList(); }
function logsPage(d)     { _logsCtx.page += d;  paintLogsList(); }

/* Kept for any old call sites still passing (id, sortMode). */
async function refreshLogsModal(id, sortMode) {
    if (sortMode) _logsCtx.sort = sortMode;
    paintLogsList();
}

function filterLogsByKind(logs) {
    return logs.filter(function(l) {
        var kind = l.kind || 'legacy';
        /* Content autosaves are hidden by default but never deleted —
           tick "Show content edits" to bring them back. */
        if (!_logsCtx.minor && kind === 'content') return false;
        if (_logsCtx.kind !== 'all' && kind !== _logsCtx.kind) return false;
        return true;
    });
}

function paintLogsList() {
    var el = document.getElementById('logs-modal-list');
    if (!el) return;

    var rows  = sortLogs(filterLogsByKind(_logsCtx.all), _logsCtx.sort);
    var total = rows.length;
    var pages = Math.max(1, Math.ceil(total / LOGS_PAGE_SIZE));
    if (_logsCtx.page > pages) _logsCtx.page = pages;
    if (_logsCtx.page < 1)     _logsCtx.page = 1;

    var start = (_logsCtx.page - 1) * LOGS_PAGE_SIZE;
    el.innerHTML = buildLogsHTML(rows.slice(start, start + LOGS_PAGE_SIZE));
    el.scrollTop = 0;

    var cnt  = document.getElementById('logs-modal-count');
    var pno  = document.getElementById('logs-modal-pageno');
    var prev = document.getElementById('logs-prev');
    var next = document.getElementById('logs-next');
    if (cnt)  cnt.textContent = total + ' entr' + (total === 1 ? 'y' : 'ies');
    if (pno)  pno.textContent = _logsCtx.page + ' / ' + pages;
    if (prev) prev.disabled = _logsCtx.page <= 1;
    if (next) next.disabled = _logsCtx.page >= pages;
}

function sortLogs(logs, mode) {
    var now   = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var yest  = new Date(today.getTime()); yest.setDate(yest.getDate() - 1);
    var week  = new Date(today.getTime()); week.setDate(week.getDate() - 7);
    function ts(l){ return _ms(l, 'timestamp'); }
    var arr = logs.slice();
    switch (mode) {
        case 'newest':    return arr.sort(function(a,b){ return ts(b)-ts(a); });
        case 'oldest':    return arr.sort(function(a,b){ return ts(a)-ts(b); });
        case 'today':     return arr.filter(function(l){ return ts(l)>=today.getTime(); }).sort(function(a,b){ return ts(b)-ts(a); });
        case 'yesterday': return arr.filter(function(l){ return ts(l)>=yest.getTime()&&ts(l)<today.getTime(); }).sort(function(a,b){ return ts(b)-ts(a); });
        case 'lastweek':  return arr.filter(function(l){ return ts(l)>=week.getTime()&&ts(l)<yest.getTime(); }).sort(function(a,b){ return ts(b)-ts(a); });
        default:          return arr;
    }
}

function buildLogsHTML(logs) {
    if (!logs.length) return '<div class="logs-modal-empty">No entries for this period.</div>';
    return logs.map(function(l){
        /* _ms — a log line written offline dated as "—" here. */
        var _d = _ms(l, 'timestamp');
        var d  = _d ? new Date(_d) : null;

        /* THE PATH STAMP — the whole point.
           itemPath is "Project / Module / Section"; itemName is the
           thing itself. Older entries have neither. */
        var stamp = '';
        if (l.itemPath || l.itemName) {
            var name = l.itemName
                ? esc(l.itemName) + (l.fileType ? '.' + esc(l.fileType) : '')
                : '';
            stamp = '<div class="log-modal-stamp">' +
                '<i class="fa-solid fa-folder-tree"></i> ' +
                (l.itemPath ? '<span class="log-stamp-path">' + esc(l.itemPath) + '</span>' : '') +
                (name ? '<span class="log-stamp-sep">/</span><span class="log-stamp-name">' + name + '</span>' : '') +
                '</div>';
        } else {
            stamp = '<div class="log-modal-stamp log-stamp-none">no path recorded \u2014 logged before path tracking</div>';
        }

        var kind = l.kind || 'legacy';
        return '<div class="log-modal-row k-' + esc(kind) + '">' +
            '<div class="log-modal-time">' + (d ? formatLogDate(d) : '\u2014') + '<br>' + (d ? formatLogTime(d) : '') + '</div>' +
            '<div class="log-modal-main">' +
                '<div class="log-modal-action">' + esc(l.action || '') + '</div>' +
                stamp +
            '</div>' +
            '<div class="log-modal-kind">' + esc(kind) + '</div>' +
        '</div>';
    }).join('');
}


/* ─── GENERAL RECORD ──────────────────────────────
   Every file in the project, one sheet. Paste storage
   paths down the columns; only edited rows are written,
   straight onto each file's own record. */
var _grCtx = { pid: '', rows: [], edits: {}, search: '', missingOnly: false };

async function ctxGeneralRecord(id) {
    hideCtxMenu();
    var p = _projects.find(function(x){ return x.id === id; });
    _grCtx = { pid: id, rows: [], edits: {}, search: '', missingOnly: false };

    showModal(
        '<div class="vc-header">' +
        '<div class="modal-title" style="margin-bottom:0">' +
        '<i class="fa-solid fa-hard-drive" style="font-size:16px;color:var(--sub)"></i>' +
        'GENERAL RECORD</div>' +
        '<button class="modal-close-btn" onclick="grClose()"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="gr-sub">' + esc(p ? p.name : 'Project') +
        ' \u2014 storage paths for every file. Saves onto each file\u2019s own record.</div>' +
        '<div class="gr-toolbar">' +
            '<input class="modal-input gr-search" type="text" placeholder="Filter by name or folder\u2026" ' +
                   'oninput="grSetSearch(this.value)">' +
            '<label class="gr-only-missing"><input type="checkbox" onchange="grSetMissing(this.checked)"> Only missing</label>' +
        '</div>' +
        '<div class="gr-table-wrap" id="gr-table-wrap">' +
            '<div class="gr-loading">Loading\u2026</div>' +
        '</div>' +
        '<div class="modal-footer gr-footer">' +
            '<span class="gr-status" id="gr-status"></span>' +
            '<button class="modal-btn" onclick="grClose()">CLOSE</button>' +
            '<button class="modal-btn primary" id="gr-save-btn" disabled onclick="grSaveAll()">SAVE</button>' +
        '</div>',
        '860px'
    );

    try {
        _grCtx.rows = await window.SCRIBBLE_FB.getAllFileRecords(id);
    } catch (e) {
        var w = document.getElementById('gr-table-wrap');
        if (w) w.innerHTML = '<div class="gr-loading">Could not load: ' + esc(e.message || 'error') + '</div>';
        return;
    }
    grRender();
}

function grClose() {
    if (Object.keys(_grCtx.edits).length &&
        !confirm('You have unsaved record edits. Close anyway?')) return;
    _grCtx.edits = {};
    closeModal();
}

function grSetSearch(v)  { _grCtx.search = (v || '').toLowerCase(); grRender(); }
function grSetMissing(v) { _grCtx.missingOnly = v; grRender(); }

/* Pending edit wins over what's stored. */
function grVal(row, field) {
    var e = _grCtx.edits[row.id];
    if (e && e[field] !== undefined) return e[field];
    return row.records[field] || '';
}

function grRender() {
    var wrap = document.getElementById('gr-table-wrap');
    if (!wrap) return;

    var rows = _grCtx.rows.filter(function(r) {
        if (_grCtx.search &&
            (r.name + ' ' + r.path).toLowerCase().indexOf(_grCtx.search) === -1) return false;
        if (_grCtx.missingOnly && (grVal(r,'onedrive') || grVal(r,'hdPath'))) return false;
        return true;
    });

    if (!rows.length) {
        wrap.innerHTML = '<div class="gr-loading">' +
            (_grCtx.rows.length ? 'Nothing matches that filter.' : 'No files in this project yet.') + '</div>';
        grSyncStatus();
        return;
    }

    wrap.innerHTML =
        '<table class="gr-table"><thead><tr>' +
            '<th class="gr-col-file">File</th>' +
            '<th class="gr-col-link">Cloud / OneDrive</th>' +
            '<th class="gr-col-link">Hard Drive Path</th>' +
        '</tr></thead><tbody>' +
        rows.map(function(r) {
            var dirty = _grCtx.edits[r.id] ? ' gr-dirty' : '';
            var blank = (!grVal(r,'onedrive') && !grVal(r,'hdPath')) ? ' gr-blank' : '';
            return '<tr class="gr-row' + dirty + blank + '" id="gr-row-' + r.id + '">' +
                '<td class="gr-file">' +
                    '<div class="gr-file-name">' + esc(r.name) + '.' + esc(r.type) + '</div>' +
                    '<div class="gr-file-path">' + esc(r.path) + '</div>' +
                '</td>' +
                '<td><input class="gr-input" type="text" spellcheck="false" placeholder="https://\u2026" ' +
                    'value="' + esc(grVal(r,'onedrive')) + '" ' +
                    'oninput="grEdit(\'' + r.id + '\',\'onedrive\',this.value)"></td>' +
                '<td><input class="gr-input" type="text" spellcheck="false" placeholder="D:\\\\Backups\\\\\u2026" ' +
                    'value="' + esc(grVal(r,'hdPath')) + '" ' +
                    'oninput="grEdit(\'' + r.id + '\',\'hdPath\',this.value)"></td>' +
            '</tr>';
        }).join('') + '</tbody></table>';

    grSyncStatus();
}

function grEdit(id, field, value) {
    var row = _grCtx.rows.find(function(r){ return r.id === id; });
    if (!row) return;
    if (!_grCtx.edits[id]) _grCtx.edits[id] = {};
    _grCtx.edits[id][field] = value;

    /* Typed then reverted is not an edit. */
    var e = _grCtx.edits[id];
    var same = Object.keys(e).every(function(k){ return (e[k] || '') === (row.records[k] || ''); });
    if (same) delete _grCtx.edits[id];

    var tr = document.getElementById('gr-row-' + id);
    if (tr) tr.classList.toggle('gr-dirty', !!_grCtx.edits[id]);
    grSyncStatus();
}

function grSyncStatus() {
    var n   = Object.keys(_grCtx.edits).length;
    var btn = document.getElementById('gr-save-btn');
    var st  = document.getElementById('gr-status');
    if (btn) { btn.disabled = (n === 0);
               btn.textContent = n ? 'SAVE ' + n + ' CHANGE' + (n !== 1 ? 'S' : '') : 'SAVE'; }
    if (st) {
        var done = _grCtx.rows.filter(function(r){ return grVal(r,'onedrive') || grVal(r,'hdPath'); }).length;
        st.textContent = done + ' of ' + _grCtx.rows.length + ' files recorded';
    }
}

async function grSaveAll() {
    var ids = Object.keys(_grCtx.edits);
    if (!ids.length) return;
    var btn = document.getElementById('gr-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'SAVING\u2026'; }

    /* customLinks isn't shown here, so carry it through untouched —
       this sheet must never wipe a field it doesn't display. */
    var changes = ids.map(function(id) {
        var row = _grCtx.rows.find(function(r){ return r.id === id; });
        var e   = _grCtx.edits[id];
        return {
            id: id, name: row.name, path: row.path, type: row.type,
            records: {
                onedrive:    e.onedrive !== undefined ? e.onedrive.trim() : (row.records.onedrive || ''),
                hdPath:      e.hdPath   !== undefined ? e.hdPath.trim()   : (row.records.hdPath   || ''),
                customLinks: row.records.customLinks || []
            }
        };
    });

    var res = await window.SCRIBBLE_FB.saveRecordsBulk(_grCtx.pid, changes);

    /* Failed rows stay dirty so nothing typed is silently lost. */
    var failedIds = (res.failed || []).map(function(f){ return f.id; });
    changes.forEach(function(c) {
        if (failedIds.indexOf(c.id) !== -1) return;
        var row = _grCtx.rows.find(function(r){ return r.id === c.id; });
        if (row) row.records = c.records;
        delete _grCtx.edits[c.id];
    });

    grRender();
    if (failedIds.length) {
        alert(res.saved + ' saved, ' + failedIds.length + ' failed.\nFailed rows are still highlighted \u2014 try again.');
    }
}



/* ─── RECENT: WINDOW + CLEAR ──────────────────────
   Two independent limits on what the panel shows:

   1. A rolling 24h window. Anything older simply drops
      off, so the panel stays a "what am I working on"
      list rather than an ever-growing history.
   2. A manual Clear, stored as a timestamp in
      localStorage.

   Both are DISPLAY-ONLY. Nothing is written to Firebase
   and no file is touched — clearing hides rows, and the
   next time you edit a file it reappears. There is no way
   for this to lose data. */
var RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
var RECENT_CLEAR_KEY = 'scribbleRecentClearedAt';

function recentCutoff() {
    var cleared = parseInt(localStorage.getItem(RECENT_CLEAR_KEY) || '0', 10) || 0;
    /* Whichever is more recent wins: the 24h edge, or your last Clear. */
    return Math.max(cleared, Date.now() - RECENT_WINDOW_MS);
}

function showRecentCtxMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    hideCtxMenu();

    var menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.id = 'ctx-menu';
    menu.innerHTML =
        '<div class="ctx-item" onclick="clearRecent()">' +
        '<i class="fa-regular fa-circle-xmark"></i>CLEAR</div>' +
        '<div class="ctx-item" onclick="loadRecentNow()">' +
        '<i class="fa-solid fa-rotate"></i>REFRESH</div>';
    document.body.appendChild(menu);
    _activeCtxMenu = menu;

    var menuW = 174, menuH = 76;
    var left = Math.min(e.clientX, window.innerWidth  - menuW - 8);
    var top  = Math.min(e.clientY, window.innerHeight - menuH - 8);
    menu.style.left = Math.max(8, left) + 'px';
    menu.style.top  = Math.max(8, top)  + 'px';
}

function clearRecent() {
    hideCtxMenu();
    localStorage.setItem(RECENT_CLEAR_KEY, String(Date.now()));
    if (typeof window.loadRecent === 'function') window.loadRecent();
}

function loadRecentNow() {
    hideCtxMenu();
    if (typeof window.loadRecent === 'function') window.loadRecent();
}

/* ─── ARCHIVE ─────────────────────────────────────
   Shelving is not deleting: the project keeps every
   module, file, version and log exactly as it is and
   simply stops appearing on this page. Nothing expires. */
function gotoArchive() { window.location.href = 'Scribble-archive.html'; }

function ctxArchive(id) {
    hideCtxMenu();
    var p = _projects.find(function(x){ return x.id === id; });
    if (!p) return;

    showModal(
        '<div class="modal-title"><i class="material-symbols-outlined" ' +
        'style="font-size:17px;color:var(--sub)">inventory_2</i>ARCHIVE PROJECT</div>' +
        '<p class="modal-body-text">Move <strong>' + esc(p.name) + '</strong> to the archive?</p>' +
        '<p class="modal-body-text" style="color:var(--sub)">' +
        'It leaves All Projects but nothing is deleted \u2014 contents, versions and ' +
        'logs stay intact. It keeps indefinitely until you restore it.</p>' +
        '<p class="modal-body-text" style="color:var(--sub)" id="arc-counts">Counting contents…</p>' +
        '<div class="modal-field-label">NOTE (OPTIONAL)</div>' +
        '<input class="modal-input" type="text" id="arc-why" maxlength="160" ' +
               'placeholder="Why are you shelving this?">' +
        '<div class="modal-footer">' +
        '<button class="modal-btn" onclick="closeModal()">CANCEL</button>' +
        '<button class="modal-btn primary" onclick="ctxArchiveStep2(\'' + id + '\')">CONTINUE</button>' +
        '</div>', '440px'
    );
    var el = document.getElementById('arc-why');
    if (el) el.focus();

    _fillProjectCounts(id, 'arc-counts');
}

/*
 * The note has to be read HERE, before the modal is replaced by the
 * type-to-confirm step — the input is gone by the time the archive
 * actually runs, so reading it later would silently drop whatever
 * you wrote.
 */
function ctxArchiveStep2(id) {
    var p = _projects.find(function(x){ return x.id === id; });
    if (!p) return;

    var el   = document.getElementById('arc-why');
    var note = el ? el.value.trim() : '';

    typeToConfirm({
        id: id,
        name: p.name,
        title: 'CONFIRM ARCHIVE',
        icon: 'inventory_2',
        iconIsMaterial: true,
        iconColour: '#B08A5C',
        lead: 'This shelves <strong>' + esc(p.name) + '</strong> and everything inside it. ' +
              'Nothing is deleted, and it keeps until you restore it.',
        buttonLabel: 'ARCHIVE',
        buttonClass: 'primary',
        run: function () { return window.SCRIBBLE_FB.archiveProject(id, note); }
    });
}

/* doArchive() was here until 2026-09-17. It archived straight from
   step one, bypassing the type-the-project-name gate, and was left
   behind when ctxArchiveStep2 + typeToConfirm took over. Nothing
   called it — grepped across every js and html file in this folder.
   Removed rather than kept, because a one-click archive sitting next
   to a two-step one is the kind of thing that gets wired back up by
   accident. The live path is ctxArchive → ctxArchiveStep2 →
   typeToConfirm → SCRIBBLE_FB.archiveProject. */

/* ─── MERGE PROJECT ──────────────────────────────────── */
function ctxMerge(id) {
    hideCtxMenu();
    var p      = _projects.find(function(x){ return x.id === id; });
    var others = _projects.filter(function(x){ return x.id !== id; });
    if (!p) return;

    if (!others.length) {
        showModal(
            '<div class="merge-proj-header">' +
            '<i class="fa-solid fa-code-merge merge-proj-icon"></i>' +
            '<div class="merge-proj-title">MERGE PROJECT</div></div>' +
            '<p class="modal-body-text" style="color:var(--sub);margin-top:4px">No other projects to merge into.</p>' +
            '<div class="modal-footer"><button class="modal-btn" onclick="closeModal()">CLOSE</button></div>',
            '380px'
        );
        return;
    }

    var optHTML = others.map(function(o){
        return '<option value="' + o.id + '">' + esc(o.name) + '</option>';
    }).join('');

    showModal(
        /* ── Header ── */
        '<div class="merge-proj-header">' +
        '<i class="fa-solid fa-code-merge merge-proj-icon"></i>' +
        '<div class="merge-proj-title">MERGE PROJECT</div>' +
        '<div class="merge-proj-subtitle">Restructuring operation &middot; Irreversible</div>' +
        '</div>' +

        /* ── Warning ── */
        /* WORDING FIX, 2026-09-17 — this strip and the two lines further
           down all said the source was "moved to the bin". It is not.
           mergeProjects() ends with remove(doc(db,'projects',sourceId)) —
           a hard delete. No bin row, no 30 days, no undo. The dialog was
           promising a safety net that does not exist, which is the worst
           possible thing to be wrong about on this particular button. */
        '<div class="merge-warning-strip">' +
        '<i class="fa-solid fa-triangle-exclamation"></i>' +
        '<span>The source project is <strong>permanently deleted</strong> once its contents are transferred. ' +
        'It does <strong>not</strong> go to the recycle bin and it cannot be restored.</span>' +
        '</div>' +

        /* ── Flow ── */
        '<div class="merge-proj-flow">' +

        '<div class="merge-proj-card source-card">' +
        '<div class="merge-proj-card-label">Source</div>' +
        '<div class="merge-proj-card-name">' + esc(p.name) + '</div>' +
        '<div class="merge-proj-card-note"><i class="fa-solid fa-triangle-exclamation" style="font-size:7px"></i> deleted for good</div>' +
        '</div>' +

        '<div class="merge-proj-arrow">' +
        '<i class="fa-solid fa-arrow-right-long"></i>' +
        '<span>into</span>' +
        '</div>' +

        '<div class="merge-proj-card target-card">' +
        '<div class="merge-proj-card-label">Target</div>' +
        '<select class="merge-proj-select" id="merge-target" onchange="onMergeTargetChange(this)">' + optHTML + '</select>' +
        '<div class="merge-proj-card-note"><i class="fa-solid fa-layer-group" style="font-size:7px"></i> keeps its content</div>' +
        '</div>' +

        '</div>' +

        /* ── Rename ── */
        '<div class="modal-field-label">Rename merged project ' +
        '<span style="color:#C0BEBC;font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></div>' +
        '<input class="modal-input" type="text" id="merge-rename-input" maxlength="80" placeholder="' + esc(others[0].name) + '">' +

        /* ── Consequences ── */
        '<div class="merge-consequences">' +
        '<div class="merge-cons-title">What will happen</div>' +
        '<div class="merge-cons-item"><i class="fa-solid fa-circle" style="font-size:4px"></i>' +
        ' All modules, sections and files from <strong>' + esc(p.name) + '</strong> move into the selected project</div>' +
        '<div class="merge-cons-item"><i class="fa-solid fa-circle" style="font-size:4px"></i>' +
        ' <strong>' + esc(p.name) + '</strong> is permanently deleted — not binned, and not recoverable</div>' +
        '<div class="merge-cons-item"><i class="fa-solid fa-circle" style="font-size:4px"></i>' +
        ' The target project keeps all its existing content intact</div>' +
        '</div>' +

        /* ── Confirm checkbox ── */
        '<label class="merge-confirm-row">' +
        '<input type="checkbox" id="merge-confirm-check" onchange="toggleMergeBtn()">' +
        '<span>I understand this will permanently restructure both projects</span>' +
        '</label>' +

        /* ── Footer ── */
        '<div class="modal-footer">' +
        '<button class="modal-btn danger" id="do-merge-btn" onclick="doMerge(\'' + id + '\')" disabled>MERGE</button>' +
        '<button class="modal-btn" onclick="closeModal()">CANCEL</button>' +
        '</div>',
        '560px'
    );
}

function onMergeTargetChange(sel) {
    var renameEl = document.getElementById('merge-rename-input');
    if (renameEl && !renameEl.value.trim()) {
        var opt = sel.options[sel.selectedIndex];
        if (opt) renameEl.placeholder = opt.text;
    }
}

function toggleMergeBtn() {
    var cb  = document.getElementById('merge-confirm-check');
    var btn = document.getElementById('do-merge-btn');
    if (btn) btn.disabled = !(cb && cb.checked);
}

async function doMerge(sourceId) {
    var sel      = document.getElementById('merge-target');
    var targetId = sel ? sel.value : '';
    if (!targetId) return;
    var renameEl = document.getElementById('merge-rename-input');
    var newName  = renameEl ? renameEl.value.trim() : '';
    closeModal();
    await window.SCRIBBLE_FB.mergeProjects(sourceId, targetId, newName);
}

/* ─── RECORDS ────────────────────────────────── */
async function ctxRecords(id) {
    hideCtxMenu();
    var p = _projects.find(function(x){ return x.id === id; });
    if (!p) return;
    var saved = await window.SCRIBBLE_FB.getProjectRecords(id);
    var rec   = saved || { onedrive: '', hdPath: '', customLinks: [] };
    showModal(
        '<div class="vc-header">' +
        '<div class="modal-title" style="margin-bottom:0">' +
        '<i class="fa-solid fa-book-bookmark" style="font-size:16px;color:var(--sub)"></i>' +
        'RECORDS</div>' +
        '<button class="modal-close-btn" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +

        '<div class="modal-field-label">SCRIBBLE PATH</div>' +
        '<div class="records-path-row">' +
        '<div class="records-path-display" id="rec-path">' + esc(p.name) + '</div>' +
        '<button class="records-copy-btn" onclick="copyRecordsPath()" title="Copy path">' +
        '<i class="fa-regular fa-copy"></i></button>' +
        '</div>' +

        '<div class="modal-field-label">ONEDRIVE LINK</div>' +
        '<input class="modal-input" type="text" id="rec-onedrive" placeholder="https://1drv.ms/\u2026" value="' + esc(rec.onedrive || '') + '">' +

        '<div class="modal-field-label">HARD DRIVE PATH</div>' +
        '<input class="modal-input" type="text" id="rec-hdpath" placeholder="D:\\Projects\\\u2026" value="' + esc(rec.hdPath || '') + '">' +

        '<div class="modal-field-label">CUSTOM LINKS</div>' +
        '<div id="records-custom-links"></div>' +
        '<button class="records-add-link-btn" onclick="addCustomLinkRow(\'\',\'\')">' +
        '<i class="fa-solid fa-plus"></i> ADD LINK</button>' +

        '<div class="modal-footer">' +
        '<button class="modal-btn primary" onclick="saveRecordsProject(\'' + id + '\')">SAVE</button>' +
        '<button class="modal-btn" onclick="closeModal()">CANCEL</button>' +
        '</div>',
        '560px'
    );
    (rec.customLinks || []).forEach(function(lk) { addCustomLinkRow(lk.label, lk.url); });
}

function copyRecordsPath() {
    var el = document.getElementById('rec-path');
    if (!el) return;
    var text = el.textContent || '';
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function() {
            el.style.color = 'var(--accent)';
            setTimeout(function(){ el.style.color = ''; }, 1200);
        });
    } else {
        var ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta);
        ta.select(); document.execCommand('copy');
        document.body.removeChild(ta);
    }
}

function addCustomLinkRow(label, url) {
    var container = document.getElementById('records-custom-links');
    if (!container) return;
    var row = document.createElement('div');
    row.className = 'records-link-row';
    row.innerHTML =
        '<input class="records-link-label modal-input" type="text" placeholder="Label" value="' + esc(String(label || '')) + '">' +
        '<input class="records-link-url modal-input"   type="text" placeholder="URL or path" value="' + esc(String(url || '')) + '">' +
        '<button class="records-link-remove" onclick="this.parentNode.remove()" title="Remove">' +
        '<i class="fa-solid fa-xmark"></i></button>';
    container.appendChild(row);
}

function collectCustomLinks() {
    var links = [];
    document.querySelectorAll('#records-custom-links .records-link-row').forEach(function(row) {
        var l = (row.querySelector('.records-link-label') || {}).value || '';
        var u = (row.querySelector('.records-link-url')   || {}).value || '';
        l = l.trim(); u = u.trim();
        if (l || u) links.push({ label: l, url: u });
    });
    return links;
}

async function saveRecordsProject(id) {
    var records = {
        onedrive:    (document.getElementById('rec-onedrive') || {}).value || '',
        hdPath:      (document.getElementById('rec-hdpath')   || {}).value || '',
        customLinks: collectCustomLinks()
    };
    records.onedrive = records.onedrive.trim();
    records.hdPath   = records.hdPath.trim();
    closeModal();
    await window.SCRIBBLE_FB.saveProjectRecords(id, records);
}

/* ═══════════════════════════════════════════════════
   TYPE-TO-CONFIRM
   Shared second step for the two actions that take a
   whole project off the board: bin and archive.

   ── WHY TWO STEPS ─────────────────────────────────
   A project is not one thing — it is every module,
   section, file and version under it. The old bin
   confirmation did not even name what it was about to
   move, so a mis-clicked context menu and a reflexive
   CONFIRM could take the lot in under a second.

   The first step explains and counts. The second makes
   you type the name, which is the only kind of
   confirmation a reflex cannot produce.

   ── MATCHING ──────────────────────────────────────
   Trimmed and case-insensitive, matching the naming
   rule everywhere else in Scribble. Typing the letters
   is the proof of intent; making you hit Shift in the
   right places would only add frustration, not safety.
═══════════════════════════════════════════════════ */
var _confirmCtx = null;

/*
 * opts: { id, name, title, icon, iconIsMaterial, lead, note,
 *         buttonLabel, buttonClass, run }
 */
function typeToConfirm(opts) {
    _confirmCtx = opts;

    var iconHTML = opts.iconIsMaterial
        ? '<span class="material-symbols-outlined" style="font-size:30px;color:' +
              (opts.iconColour || 'var(--sub)') + '">' + opts.icon + '</span>'
        : '<i class="' + opts.icon + '" style="font-size:26px;color:' +
              (opts.iconColour || 'var(--sub)') + '"></i>';

    showModal(
        '<div class="modal-title" style="justify-content:center;flex-direction:column;gap:10px">' +
        iconHTML +
        '<span>' + esc(opts.title) + '</span>' +
        '</div>' +
        '<p class="modal-body-text">' + opts.lead + '</p>' +
        '<div class="modal-field-label">TYPE THE PROJECT NAME TO CONFIRM</div>' +
        '<div class="confirm-echo" id="confirm-echo">' + esc(opts.name) + '</div>' +
        '<input class="modal-input" type="text" id="confirm-type" autocomplete="off" ' +
               'spellcheck="false" placeholder="Type it exactly" ' +
               'oninput="onConfirmType()" onkeydown="if(event.key===\'Enter\')runConfirm()">' +
        '<div class="confirm-hint" id="confirm-hint">The names must match before this can go ahead.</div>' +
        '<div class="modal-footer">' +
        '<button class="modal-btn" onclick="closeModal()">CANCEL</button>' +
        '<button class="modal-btn ' + (opts.buttonClass || 'danger') + '" id="confirm-go" ' +
                'disabled onclick="runConfirm()">' + esc(opts.buttonLabel) + '</button>' +
        '</div>',
        '430px'
    );

    setTimeout(function () {
        var el = document.getElementById('confirm-type');
        if (el) el.focus();
    }, 50);
}

function _confirmMatches() {
    var el = document.getElementById('confirm-type');
    if (!el || !_confirmCtx) return false;
    var typed = el.value.trim().toLowerCase();
    var want  = String(_confirmCtx.name || '').trim().toLowerCase();
    return typed !== '' && typed === want;
}

function onConfirmType() {
    var ok   = _confirmMatches();
    var btn  = document.getElementById('confirm-go');
    var hint = document.getElementById('confirm-hint');
    var el   = document.getElementById('confirm-type');

    if (btn) btn.disabled = !ok;
    if (el)  el.classList.toggle('matched', ok);
    if (hint) {
        hint.textContent = ok
            ? 'Names match.'
            : 'The names must match before this can go ahead.';
        hint.classList.toggle('ok', ok);
    }
}

async function runConfirm() {
    if (!_confirmMatches() || !_confirmCtx) return;
    var ctx = _confirmCtx;
    _confirmCtx = null;
    closeModal();
    try {
        await ctx.run();
    } catch (err) {
        alert('Could not complete that: ' +
              (err && err.message ? err.message : 'unknown error'));
    }
}

/* Fills the "holds N modules, N sections, N files" line once the
   counts come back. Fired from step one so the wait never blocks
   the modal appearing. */
async function _fillProjectCounts(id, elId) {
    var el = document.getElementById(elId);
    if (!el || !window.SCRIBBLE_FB || !window.SCRIBBLE_FB.getProjectCounts) return;
    try {
        var c = await window.SCRIBBLE_FB.getProjectCounts(id);
        var total = (c.modules || 0) + (c.sections || 0) + (c.files || 0);
        var live = document.getElementById(elId);
        if (!live) return;                      // modal closed while counting
        live.textContent = total === 0
            ? 'This project is empty.'
            : 'Everything inside goes with it — ' +
              c.modules + ' module' + (c.modules === 1 ? '' : 's') + ', ' +
              c.sections + ' section' + (c.sections === 1 ? '' : 's') + ', and ' +
              c.files + ' file' + (c.files === 1 ? '' : 's') + '.';
    } catch (e) { /* counts are a courtesy, never a blocker */ }
}

/* ─── DELETE ─────────────────────────────────── */
/*
 * Step one explains and counts; step two makes you type the name.
 * softDeleteProject then sets deleted:true + deletedAt on the
 * project and every item under it, writes the bin entries, and the
 * card leaves All Projects.
 */
function ctxDelete(id) {
    hideCtxMenu();
    var p = _projects.find(function(x){ return x.id === id; });
    if (!p) return;

    showModal(
        '<div class="modal-title" style="justify-content:center;flex-direction:column;gap:10px">' +
        '<span class="material-symbols-outlined" style="font-size:30px;color:#C8C6C3">recycling</span>' +
        '<span>MOVE TO BIN</span>' +
        '</div>' +
        '<p class="modal-body-text">Move <strong>' + esc(p.name) + '</strong> to the recycle bin?</p>' +
        '<p class="modal-body-text" style="color:var(--sub)" id="del-counts">Counting contents…</p>' +
        '<p class="modal-body-text" style="color:var(--sub)">' +
        'It stays recoverable from the bin for 30 days, then it is deleted for good.</p>' +
        '<div class="modal-footer">' +
        '<button class="modal-btn" onclick="closeModal()">CANCEL</button>' +
        '<button class="modal-btn danger" onclick="ctxDeleteStep2(\'' + id + '\')">CONTINUE</button>' +
        '</div>',
        '430px'
    );

    _fillProjectCounts(id, 'del-counts');
}

function ctxDeleteStep2(id) {
    var p = _projects.find(function(x){ return x.id === id; });
    if (!p) return;

    typeToConfirm({
        id: id,
        name: p.name,
        title: 'CONFIRM MOVE TO BIN',
        icon: 'recycling',
        iconIsMaterial: true,
        iconColour: '#C0392B',
        lead: 'This moves <strong>' + esc(p.name) + '</strong> and everything inside it ' +
              'to the recycle bin.',
        buttonLabel: 'MOVE TO BIN',
        buttonClass: 'danger',
        run: function () { return window.SCRIBBLE_FB.softDeleteProject(id); }
    });
}

/* doSoftDelete() was here until 2026-09-17, and mattered more than
   doArchive did: it binned a whole project with no confirmation of any
   kind. Superseded by ctxDeleteStep2 + typeToConfirm, uncalled, and
   removed for the same reason. The live path is ctxDelete →
   ctxDeleteStep2 → typeToConfirm → SCRIBBLE_FB.softDeleteProject. */

/* ─── FILTER & SORT ──────────────────────────── */
function filterProjects(q) { _filterQuery = q; renderProjectGrid(q); }

async function applySort(mode) {

    var pinned    = _projects.filter(function(p){ return  p.pinned; });

    var notPinned = _projects.filter(function(p){ return !p.pinned; });

    /* _ms, not .seconds — an offline project sorted as 0 and sank. */
    function ts(field) {

        return function(x) { return _ms(x, field); };

    }

    var byAdded    = ts('createdAt');

    var byAccessed = ts('accessedAt');

    var sorter;

    if (mode === 'name_asc')       sorter = function(a, b) { return (a.name||'').localeCompare(b.name||''); };

    else if (mode === 'name_desc') sorter = function(a, b) { return (b.name||'').localeCompare(a.name||''); };

    else if (mode === 'accessed')  sorter = function(a, b) { return byAccessed(b) - byAccessed(a); };

    else if (mode === 'size') {

        /* On-demand only — one small burst of reads, not a standing cost. */

        var all = pinned.concat(notPinned);

        var counts = await Promise.all(all.map(function(p) {

            return window.SCRIBBLE_FB.getProjectItemCount(p.id).catch(function() { return 0; });

        }));

        all.forEach(function(p, i) { p._itemCount = counts[i]; });

        sorter = function(a, b) { return (b._itemCount || 0) - (a._itemCount || 0); };

    }

    else /* 'added', default */    sorter = function(a, b) { return byAdded(b) - byAdded(a); };

    _projects = pinned.sort(sorter).concat(notPinned.sort(sorter));

    renderProjectGrid();

}

/* ─── MODAL SYSTEM ───────────────────────────── */
function showModal(content, width) {
    closeModal();
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'modal-overlay';
    overlay.addEventListener('click', function(e){ if (e.target===overlay) closeModal(); });
    var box = document.createElement('div');
    box.className = 'modal-box';
    box.style.width = width || '520px';
    box.innerHTML = content;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    _activeModal = overlay;
}
function closeModal() { if (_activeModal) { _activeModal.remove(); _activeModal = null; } }

/* ─── SESSION ────────────────────────────────── */
function lockAndLeave() {
    /* Hands off to the guard so this does exactly what an idle
       lock does — flush the editor, clear the shared record, and
       let every other tab notice via the storage event. Clearing
       a key here by hand would only have locked THIS tab. */
    if (window.SCRIBBLE_LOCK && typeof window.SCRIBBLE_LOCK.lock === 'function') {
        window.SCRIBBLE_LOCK.lock();
        return;
    }
    try { localStorage.removeItem('SCRIBBLE_LOCK'); } catch (e) {}
    window.location.href = 'Scribble-gate.html';
}

/* ─── HELPERS ────────────────────────────────── */

/* ── READING A TIMESTAMP THAT MIGHT BE OFFLINE ────────────────
   Added 2026-09-17. serverTimestamp() reads back NULL until the
   write reaches Firestore — see the TIMESTAMP note in
   js/scribble-db.js, which is why every stamp is written as a pair
   with a *LocalMs companion.

   Reading .toDate() or .seconds straight off the field therefore
   scores anything created or edited offline as 0: the card shows a
   dash and the sort drops it to the bottom, which is the exact
   opposite of where something you touched a minute ago belongs.

   whenMs does the fallback. Reached through the global because this
   is a classic script, not a module — the same route
   scribble-recycle-bin.js already takes for itemTs(). */
function _ms(obj, field) {
    if (window.SCRIBBLE_TIME && window.SCRIBBLE_TIME.whenMs) {
        return window.SCRIBBLE_TIME.whenMs(obj, field);
    }
    var v = obj && obj[field];
    return (v && v.toDate) ? v.toDate().getTime() : 0;
}

function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function sel(current, value) { return current === value ? 'selected="selected"' : ''; }

function formatDate(d) {
    var M=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    return M[d.getMonth()]+', '+d.getDate()+', '+d.getFullYear();
}
function relativeTime(d) {
    var diff=Date.now()-d.getTime(), mins=Math.floor(diff/60000), hrs=Math.floor(diff/3600000),
        days=Math.floor(diff/86400000), wks=Math.floor(days/7);
    if (mins<1)  return 'Just now';
    if (mins<60) return mins+'m ago';
    if (hrs<24)  return hrs+'h ago';
    if (days<7)  return days+'d ago';
    if (wks<5)   return wks+(wks===1?' week ago':' weeks ago');
    return formatDate(d);
}
function formatLogDate(d) {
    var M=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    return M[d.getMonth()]+' '+d.getDate()+', '+d.getFullYear();
}
function formatLogTime(d) {
    var hh=d.getHours(), mm=d.getMinutes().toString().padStart(2,'0'), ap=hh>=12?'PM':'AM';
    hh=hh%12||12; return hh+':'+mm+' '+ap;
}

/* The panel's id is recent-list; logs-list is its CLASS. Both of these
   read the wrong one and got null, so clicking the header threw and the
   saved open/closed state never restored. Looked up once, and guarded so
   a future rename degrades to doing nothing instead of breaking. */
function recentPanel() {
    return document.getElementById('recent-list') ||
           document.querySelector('.logs-list');
}

function toggleLogs() {
    var list = recentPanel();
    var chevron = document.getElementById('logs-chevron');
    if (!list) return;
    var isOpen = list.style.display !== 'none';
    list.style.display = isOpen ? 'none' : 'block';
    if (chevron) chevron.classList.toggle('open', !isOpen);
    localStorage.setItem('logsOpen', !isOpen);
}

function initLogsState() {
    var saved = localStorage.getItem('logsOpen');
    var isOpen = saved === null ? true : saved === 'true'; // default open
    var list = recentPanel();
    var chevron = document.getElementById('logs-chevron');
    if (!list) return;
    list.style.display = isOpen ? 'block' : 'none';
    if (chevron) chevron.classList.toggle('open', isOpen);
}
initLogsState();