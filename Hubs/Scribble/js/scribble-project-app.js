/* ═══════════════════════════════════════════════════
   SCRIBBLE — PROJECT APP LOGIC  v3.0
   scribble-project-app.js

   v3.0 changes (Phase 5 — Action Menu):
   ──────────────────────────────────────
   • Context menu expanded: Pin, Rename, View Contents,
     Duplicate, Logs, Merge (stub), Move to Bin
   • Merge shown only for module/section (folder types)
   • ctxPinItem     — toggles pinned field via PROJECT_FB
   • ctxViewContents — navigates into folder or opens file
   • ctxDuplicateItem / doDuplicateItem — confirm + clone
   • ctxLogsItem    — modal showing per-item log history
   • ctxMergeItem   — placeholder stub (Phase F)
   • pinFirst()     — pinned items float to top of grid
   • Pin indicators rendered on all three card types
   • menuW bumped to 190 to fit longer labels
═══════════════════════════════════════════════════ */

var _projectId          = '';
var _projectName        = 'Unknown';
var _contents           = { modules: [], sections: [], files: [] };
var _filterQuery        = '';
var _sortAsc            = false;
var _activeCtxMenu      = null;
var _activeModal        = null;
var _createDropdownOpen = false;
var _unsubContents      = null;
var _currentFileType    = 'html';
var _currentColour      = null;
var _currentParentId    = null;
var _path               = [];
var _mergeTargetId      = null;
var _mergeTargetName    = '';
var _viewProjectId      = '';
var _dragCtx            = { active: false, itemType: '', itemId: '', item: null, pendingParentId: null };

var COLOUR_SWATCHES = [
    '#ffd483','#ff7d7d','#a1f7da','#ff7dcb',
    '#e5ff7d','#1f48ff','#7dffff','#e57dff',
    '#7dff8a','#81b673','#7d8aff','#6b6b61',
    '#fc4c00','#ff0f39','#369694','#fffaeb'
];

window.PROJECT_READY = function() { initProject(); };

/* ─── INIT ─── */
function initProject() {
    var params = new URLSearchParams(window.location.search);
    _projectId     = params.get('id') || '';
    _viewProjectId = _projectId;   // ← add this line
    if (!_projectId) { showGridEmpty('No project selected.'); return; }
    _pendingOpenId = params.get('open') || '';
    loadProjectName();
    subscribeContents();
}

/* A Recent click arrives as ?open=<fileId>. Contents load async, so the
   request is held until the file actually exists in _contents, then fired
   once and cleared. */
var _pendingOpenId = '';

function consumePendingOpen() {
    if (!_pendingOpenId) return;
    var f = _contents.files.find(function(x) { return x.id === _pendingOpenId; });
    if (!f) return;
    var id = _pendingOpenId;
    _pendingOpenId = '';
    /* Drop the param so a refresh doesn't reopen it. */
    if (window.history && window.history.replaceState) {
        window.history.replaceState({}, '', 'Scribble-project.html?id=' + encodeURIComponent(_projectId));
    }

    /* The rest of the session first, so the file you actually clicked
       ends up active rather than buried behind the restored tabs. */
    restoreSessionTabs(id);

    openFile(id);
}

/*
 * Arriving from the strip on another page reopens the WHOLE set of
 * documents, not just the one clicked — otherwise clicking a tab
 * would silently close the other three, and the strip would stop
 * describing a real session.
 *
 * `skipId` is opened separately by the caller so it lands last and
 * takes focus.
 *
 * Only files belonging to THIS project are restored here. A tab from
 * another project stays in the strip and reopens when you go to it;
 * pulling foreign files into this editor would put documents in front
 * of you that the breadcrumb says you are not in.
 */
function restoreSessionTabs(skipId) {
    if (!window.SCRIBBLE_TABS || !window.EDITOR_APP) return;

    var session = window.SCRIBBLE_TABS.load();
    if (!session || !session.tabs) return;

    session.tabs.forEach(function(t) {
        if (t.id === skipId) return;
        if (t.projectId !== _projectId) return;

        /* Re-read from live contents rather than trusting the stored
           name — it may have been renamed since the session was saved. */
        var live = _contents.files.find(function(x) { return x.id === t.id; });
        if (!live) return;              // deleted or moved away

        try { openFile(t.id); } catch (e) { /* one bad tab must not stop the rest */ }
    });
}

async function loadProjectName() {
    var p = await window.PROJECT_FB.getProject(_projectId);
    _projectName = p ? (p.name || 'Untitled') : 'Unknown';
    updateBreadcrumb();
    document.title = 'Scribble | ' + _projectName;
}

function subscribeContents() {
    if (_unsubContents) { _unsubContents(); _unsubContents = null; }
    _unsubContents = window.PROJECT_FB.listenProjectContents(_viewProjectId, function(c) {
        _contents = c;
        renderProjectGrid();
        renderRecentPanel();
        consumePendingOpen();
    });
}

/* ─── HEADER ─── */
function headerSearch(value) {
    var ps = document.getElementById('project-search');
    if (ps) ps.value = value;
    filterContents(value);
}
function filterContents(q) { _filterQuery = q; renderProjectGrid(); }

/* ─── SORT ─── */
function applySort(mode) {

    /* _ms, not .seconds — an offline item sorted as 0 and sank. */
    function ts(field) {

        return function(x) { return _ms(x, field); };

    }

    var byAdded    = ts('createdAt');

    var byAccessed = ts('accessedAt');

    function byName(a, b, dir) {

        return dir * (a.name || '').localeCompare(b.name || '');

    }

    function byNumber(getter) {

        return function(a, b) { return getter(b) - getter(a); }; // biggest first

    }

    /* "Size" for a file = real byte size. For a module/section = how many

       items live inside it, anywhere in its subtree — computed live from

       the already-loaded flat project contents, no extra Firestore reads. */

    function subtreeCount(id) {

        var all = [].concat(_contents.modules, _contents.sections, _contents.files);

        var count = 0, queue = [id], seen = { };

        seen[id] = true;

        while (queue.length) {

            var cur = queue.shift();

            all.forEach(function(x) {

                if (x.parentId === cur && !seen[x.id]) {

                    seen[x.id] = true; count++; queue.push(x.id);

                }

            });

        }

        return count;

    }

    var sorter;

    if (mode === 'name_asc')       sorter = function(a, b) { return byName(a, b, 1); };

    else if (mode === 'name_desc') sorter = function(a, b) { return byName(a, b, -1); };

    else if (mode === 'accessed')  sorter = byNumber(byAccessed);

    else if (mode === 'size') {

        sorter = function(a, b) {

            var av = a._isFile ? (a.size || 0) : subtreeCount(a.id);

            var bv = b._isFile ? (b.size || 0) : subtreeCount(b.id);

            return bv - av;

        };

    }

    else /* 'added', default */    sorter = byNumber(byAdded);

    _contents.modules  = _contents.modules.slice().sort(sorter);

    _contents.sections = _contents.sections.slice().sort(sorter);

    _contents.files     = _contents.files.slice().map(function(f) { f._isFile = true; return f; }).sort(sorter);

    renderProjectGrid();

}

/* ─── RENDER ─── */
function renderProjectGrid() {
    var grid = document.getElementById('project-grid');
    if (!grid) return;
    var modules  = pinFirst(filterItems(_contents.modules));
    var sections = pinFirst(filterItems(_contents.sections));
    var files    = pinFirst(filterItems(_contents.files));
    if (!modules.length && !sections.length && !files.length) {
        showGridEmpty(_filterQuery
            ? 'No content matches your search.'
            : 'Nothing here yet \u2014 use Create to get started.');
        return;
    }
    var html = '';
    if (modules.length) {
        html += '<div class="content-group-block">';
        html += '<div class="content-group-label">Modules</div>';
        html += '<div class="modules-group">';
        modules.forEach(function(m) { html += moduleCardHTML(m); });
        html += '</div></div>';
    }
    if (sections.length) {
        html += '<div class="content-group-block">';
        html += '<div class="content-group-label">Sections</div>';
        html += '<div class="sections-group">';
        sections.forEach(function(s) { html += sectionCardHTML(s); });
        html += '</div></div>';
    }
    if (files.length) {
        html += '<div class="content-group-block">';
        html += '<div class="content-group-label">Files</div>';
        html += '<div class="files-group">';
        files.forEach(function(f) { html += fileCardHTML(f); });
        html += '</div></div>';
    }
    grid.innerHTML = html;
}

function showGridEmpty(msg) {
    var g = document.getElementById('project-grid');
    if (g) g.innerHTML = '<div class="project-grid-empty">' + esc(msg) + '</div>';
}

function filterItems(items) {
    var filtered = items.filter(function(i) {
        return (i.parentId || null) === _currentParentId;
    });
    if (_filterQuery) {
        var q = _filterQuery.toLowerCase();
        filtered = filtered.filter(function(i) {
            return i.name.toLowerCase().indexOf(q) !== -1;
        });
    }
    return filtered;
}

/* Pinned items float to the top within their group */
function pinFirst(items) {
    return items.slice().sort(function(a, b) {
        return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
    });
}

/* ─── CARD HTML ─── */
function moduleCardHTML(m) {
    var _u        = _ms(m, 'updatedAt');
    var updated   = _u ? relativeTime(new Date(_u)) : '\u2014';
    var pinBadge  = m.pinned ? '<i class="fa-solid fa-thumbtack" style="font-size:7px;color:var(--sub)" title="Pinned"></i>' : '';
    var linkBadge = m.isSymlink ? '<span class="symlink-badge" title="Linked from ' + esc(m.targetProjectName || 'another project') + '"><i class="fa-solid fa-link"></i></span>' : '';
    return '<div class="module-card' + (m.isSymlink ? ' is-symlink' : '') + '" id="mc-' + m.id + '"' +
        ' draggable="true"' +
        ' ondragstart="onItemDragStart(event,\'module\',\'' + m.id + '\')"' +
        ' ondragend="onItemDragEnd(event)"' +
        ' ondragover="onItemDragOver(event,\'module\',\'' + m.id + '\')"' +
        ' ondragleave="onItemDragLeave(event,\'module\',\'' + m.id + '\')"' +
        ' ondrop="onItemDrop(event,\'module\',\'' + m.id + '\')"' +
        ' onclick="openModule(\'' + m.id + '\')"' +

        ' oncontextmenu="event.preventDefault();showItemCtxMenu(event,\'module\',\'' + m.id + '\')">' +
        '<div class="mc-header">' +
        '<i class="fa-solid fa-box mc-eyebrow-icon"></i>' +
        '<span class="mc-eyebrow-text">Module</span>' +
        pinBadge + linkBadge +
        '<button class="cc-dots-btn" onclick="event.stopPropagation();showItemCtxMenu(event,\'module\',\'' + m.id + '\')" title="Options"><i class="fa-solid fa-ellipsis"></i></button>' +
        '</div>' +
        '<div class="mc-body">' +
        '<div class="mc-name">' + esc(m.name) + '</div>' +
        '<div class="mc-date">' + updated + '</div>' +
        '</div></div>';
}

function sectionCardHTML(s) {
    var _u        = _ms(s, 'updatedAt');
    var updated   = _u ? relativeTime(new Date(_u)) : '\u2014';
    var pinBadge  = s.pinned ? '<i class="fa-solid fa-thumbtack" style="font-size:7px;color:var(--sub)" title="Pinned"></i>' : '';
    var linkBadge = s.isSymlink ? '<span class="symlink-badge" title="Linked from ' + esc(s.targetProjectName || 'another project') + '"><i class="fa-solid fa-link"></i></span>' : '';
    return '<div class="section-card' + (s.isSymlink ? ' is-symlink' : '') + '" id="sc-' + s.id + '"' +
        ' draggable="true"' +
        ' ondragstart="onItemDragStart(event,\'section\',\'' + s.id + '\')"' +
        ' ondragend="onItemDragEnd(event)"' +
        ' ondragover="onItemDragOver(event,\'section\',\'' + s.id + '\')"' +
        ' ondragleave="onItemDragLeave(event,\'section\',\'' + s.id + '\')"' +
        ' ondrop="onItemDrop(event,\'section\',\'' + s.id + '\')"' +
        ' onclick="openSection(\'' + s.id + '\')"' +

        ' oncontextmenu="event.preventDefault();showItemCtxMenu(event,\'section\',\'' + s.id + '\')">' +
        '<div class="sc-header">' +
        '<i class="fa-solid fa-folder sc-eyebrow-icon"></i>' +
        '<span class="sc-eyebrow-text">Section</span>' +
        pinBadge + linkBadge +
        '<button class="cc-dots-btn" onclick="event.stopPropagation();showItemCtxMenu(event,\'section\',\'' + s.id + '\')" title="Options"><i class="fa-solid fa-ellipsis"></i></button>' +
        '</div>' +
        '<div class="sc-name">' + esc(s.name) + '</div>' +
        '<div class="sc-date">' + updated + '</div>' +
        '</div>';
}

function fileTypeIcon(type) {
    if (!type || type === 'colour') return null;
    var t = type.toLowerCase();
    var code = ['html','css','js','ts','jsx','tsx','php','py','rb','java','c','cpp','go','rs','json','xml','yaml','yml','sh','sql'];
    var text = ['txt','md','log','csv'];
    if (code.indexOf(t) !== -1) return 'fa-file-code';
    if (text.indexOf(t) !== -1) return 'fa-file-lines';
    return 'fa-file';
}

function formatSize(bytes) {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return Math.round(bytes / 1024) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

function fileCardHTML(f) {
    var isColour  = f.type === 'colour';
    var bgStyle   = (isColour && f.colour) ? 'background:' + f.colour + ';' : '';
    var _u        = _ms(f, 'updatedAt');
    var updated   = _u ? relativeTime(new Date(_u)) : '';
    var size      = f.size ? formatSize(f.size) : '';
    var iconName  = fileTypeIcon(f.type);
    var iconArea  = iconName
        ? '<div class="file-card-icon-area"><i class="fa-solid ' + iconName + '"></i></div>'
        : '<div class="file-card-icon-area"></div>';
    var pillLeft  = f.pinned ? '22px' : '8px';
    var typeLabel = isColour ? ''
        : '<span class="file-card-type-label" style="left:' + pillLeft + '">' + esc((f.type || 'FILE').toUpperCase()) + '</span>';
    var pinChip   = f.pinned
        ? '<i class="fa-solid fa-thumbtack" style="position:absolute;top:9px;left:8px;font-size:7px;color:rgba(0,0,0,0.22);z-index:3" title="Pinned"></i>'
        : '';
    var linkBadge = f.isSymlink
        ? '<span class="symlink-badge file-symlink-badge" title="Linked from ' + esc(f.targetProjectName || 'another project') + '"><i class="fa-solid fa-link"></i></span>'
        : '';
    return '<div class="cc-file-wrap' + (f.isSymlink ? ' is-symlink-wrap' : '') + '" id="fw-' + f.id + '"' +
        ' draggable="true"' +
        ' ondragstart="onItemDragStart(event,\'file\',\'' + f.id + '\')"' +
        ' ondragend="onItemDragEnd(event)">' +
        '<div class="file-card' + (isColour ? ' colour-file' : '') + (f.isSymlink ? ' is-symlink' : '') + '" style="' + bgStyle + '" onclick="openFile(\'' + f.id + '\')" oncontextmenu="event.preventDefault();showItemCtxMenu(event,\'file\',\'' + f.id + '\')">' +
        pinChip + typeLabel + linkBadge +
        iconArea +
        '<div class="file-card-strip">' +
        '<div class="file-card-strip-name">' + esc(f.name) + '</div>' +
        '<div class="file-card-strip-meta">' +
        '<span class="file-card-strip-date">' + updated + '</span>' +
        '<div class="file-card-strip-right">' +
        (size ? '<span class="file-card-size">' + size + '</span>' : '') +
        '<button class="cc-dots-btn" onclick="event.stopPropagation();showItemCtxMenu(event,\'file\',\'' + f.id + '\')" title="Options"><i class="fa-solid fa-ellipsis"></i></button>' +
        '</div></div></div>' +
        '</div>' +
        '</div>';
}

/* ─── NAVIGATION ─── */
function openModule(id) {

    var m = _contents.modules.find(function(x) { return x.id === id; });

    if (!m) return;

    if (window.PROJECT_FB) window.PROJECT_FB.touchAccessed(_viewProjectId, 'module', id).catch(function(){});
    if (m.isSymlink) {
        window.PROJECT_FB.getProject(m.targetProjectId).then(function(proj) {
            var pname = proj ? (proj.name || 'Linked Project') : 'Linked Project';
            navigateDown(m.id, m.name, m.targetProjectId, pname, m.targetId);
        });
    } else {
        navigateDown(m.id, m.name, null, null, null);
    }
}

function openSection(id) {

    var s = _contents.sections.find(function(x) { return x.id === id; });

    if (!s) return;

    if (window.PROJECT_FB) window.PROJECT_FB.touchAccessed(_viewProjectId, 'section', id).catch(function(){});
    if (s.isSymlink) {
        window.PROJECT_FB.getProject(s.targetProjectId).then(function(proj) {
            var pname = proj ? (proj.name || 'Linked Project') : 'Linked Project';
            navigateDown(s.id, s.name, s.targetProjectId, pname, s.targetId);
        });
    } else {
        navigateDown(s.id, s.name, null, null, null);
    }
}

async function openFile(id) {

    var f = _contents.files.find(function(x) { return x.id === id; });

    if (!f) return;

    /* ── SYMLINK RESOLUTION ──
       A symlink card is a POINTER doc: it has no `content`, and its
       own id is not the real file's id. Handing it straight to the
       editor made getFileContent() read the pointer (→ blank editor),
       and every autosave afterwards wrote to the pointer instead of
       the original — edits silently never reached the real file.
       Resolve to the real document first, and mark it with
       _overridePid so read, save, saveVersion and listVersions all
       aim at the source project. */
    if (f.isSymlink && f.targetId) {
        var targetPid = f.targetProjectId || _viewProjectId;

        var real = null;
        if (window.PROJECT_FB && window.PROJECT_FB.getRawFileDoc) {
            real = await window.PROJECT_FB.getRawFileDoc(targetPid, f.targetId)
                .catch(function() { return null; });
        }

        if (!real) {
            alert('This link points to a file that no longer exists.\n' +
                  'The original may have been deleted or moved.');
            return;
        }

        var resolved = Object.assign({}, real, {
            id:            f.targetId,       // real doc id — tabs dedupe correctly
            _overridePid:  targetPid,
            _viaSymlinkId: f.id              // remembered for logging/UI, never written
        });

        if (window.PROJECT_FB) {
            window.PROJECT_FB.touchAccessed(targetPid, 'file', f.targetId).catch(function(){});
        }

        if (window.EDITOR_APP) {
            window.EDITOR_APP.openFileInEditor(resolved);
        } else {
            console.error('[Project] Editor application not loaded.');
        }
        return;
    }

    if (window.PROJECT_FB) window.PROJECT_FB.touchAccessed(_viewProjectId, 'file', id).catch(function(){});

    if (window.EDITOR_APP) {
        window.EDITOR_APP.openFileInEditor(f);
    } else {
        console.error('[Project] Editor application not loaded.');
    }
}

function navigateDown(id, name, portalProjectId, portalProjectName, realContentId) {
    var entry = { id: id, name: name };
    if (portalProjectId) {
        entry.portalProjectId   = portalProjectId;
        entry.portalProjectName = portalProjectName;
        entry.realContentId     = realContentId;
    } else if (_viewProjectId !== _projectId) {
        // Inherit portal context when going deeper inside a portal
        var parent = _path.length > 0 ? _path[_path.length - 1] : null;
        if (parent && parent.portalProjectId) {
            entry.portalProjectId   = parent.portalProjectId;
            entry.portalProjectName = parent.portalProjectName;
        }
    }
    _path.push(entry);
    _currentParentId = realContentId || id;
    if (portalProjectId && portalProjectId !== _viewProjectId) {
        _viewProjectId = portalProjectId;
        subscribeContents(); // listener fires renderProjectGrid
    } else {
        renderProjectGrid();
    }
    updateBreadcrumb();
}

function navigateUp() {
    _path.pop();
    var top = _path.length > 0 ? _path[_path.length - 1] : null;
    _currentParentId = top ? (top.realContentId || top.id) : null;
    var newView = (top && top.portalProjectId) ? top.portalProjectId : _projectId;
    if (newView !== _viewProjectId) {
        _viewProjectId = newView;
        subscribeContents();
    } else {
        renderProjectGrid();
    }
    updateBreadcrumb();
}

function navigateTo(index) {
    if (index === -1) {
        _path = [];
        _currentParentId = null;
        if (_viewProjectId !== _projectId) {
            _viewProjectId = _projectId;
            subscribeContents();
        } else { renderProjectGrid(); }
    } else {
        _path = _path.slice(0, index + 1);
        var top = _path[_path.length - 1];
        _currentParentId = top.realContentId || top.id;
        var newView = top.portalProjectId || _projectId;
        if (newView !== _viewProjectId) {
            _viewProjectId = newView;
            subscribeContents();
        } else { renderProjectGrid(); }
    }
    updateBreadcrumb();
}

/* ═══════════════════════════════════════════════════
   WHICH PROJECT AM I ACTUALLY LOOKING AT?
   PORTAL FIX, added 2026-09-17

   There are two project ids on this page and they are
   not the same thing:

     _projectId      the project in the URL (?id=).
                     Fixed for the life of the page.
     _viewProjectId  the project whose contents are on
                     screen RIGHT NOW.

   They diverge the moment you open a symlinked module
   or section: openModule/openSection see isSymlink,
   fetch the target project, and navigateDown() sets
   _viewProjectId to it and re-subscribes. From then on
   _contents holds the OTHER project's items and the
   breadcrumb shows a link tag.

   So every write has to name _viewProjectId. Five of
   them named _projectId, which meant the id handed in
   did not exist in the project being written to — see
   the note above ctxPinItem for what that did.

   The NAME is needed as well, for the Records path and
   the symlink label, and it only exists on whichever
   _path entry opened the portal. This is the same walk
   updateBreadcrumb does just below; kept adjacent on
   purpose so the two cannot drift apart.
═══════════════════════════════════════════════════ */
function viewProjectName() {
    if (!_viewProjectId || _viewProjectId === _projectId) return _projectName;
    for (var i = _path.length - 1; i >= 0; i--) {
        if (_path[i].portalProjectName) return _path[i].portalProjectName;
    }
    /* Inside a portal but no name recorded — better the URL project's
       name than an empty string, and it can only happen if _path was
       rebuilt without one. */
    return _projectName;
}

/* ═══════════════════════════════════════════════════
   TELLING POPPY WHERE SHE IS
   Added 2026-09-17

   LifeHub-surface.js publishes the APP and the SURFACE
   ("Scribble / Project") on its own. What it cannot know
   is which project, which folder, and whether you are
   standing inside a portal — that is this page's business,
   and LIFEHUB_SURFACE.detail() is the hook for exactly it.

   Nothing called it before, so Poppy could see that a
   project was open and had no way to name it. Every
   item-level command depends on this: "rename the notes
   file" is meaningless until she knows which project's
   notes file.

   Both project ids go out, and the portal flag with them.
   Inside a linked module the URL says one project and the
   screen shows another, so a single "project" field would
   be a coin flip — see viewProjectName() above.

   ── DEBOUNCED ────────────────────────────────────────
   detail() sets lastWrite = 0 to bypass the surface's own
   two-second throttle, which is right for a deliberate
   update and wrong for one fired from updateBreadcrumb()
   — clicking down through three folders would be three
   writes in as many hundred milliseconds. 400ms of quiet
   is plenty; navigation settles long before Poppy is
   asked anything.
═══════════════════════════════════════════════════ */
var _surfaceTimer = null;

function publishSurface() {
    if (!window.LIFEHUB_SURFACE ||
        typeof window.LIFEHUB_SURFACE.detail !== 'function') return;

    clearTimeout(_surfaceTimer);
    _surfaceTimer = setTimeout(function () {
        var d = {
            project:   viewProjectName(),
            projectId: _viewProjectId || _projectId
        };

        /* Only when they disagree, so the common case stays quiet. */
        if (_viewProjectId && _viewProjectId !== _projectId) {
            d.portal        = true;
            d.throughPortal = _projectName;   /* the project you came in from */
        }

        /* Where in the tree. Poppy needs this to say "the notes file in
           Chapter 2" back to you and mean it. */
        d.folder = _path.length ? _path[_path.length - 1].name : null;
        d.depth  = _path.length;

        try { window.LIFEHUB_SURFACE.detail(d); }
        catch (e) { /* the surface must never break this page */ }
    }, 400);
}

function updateBreadcrumb() {
    /* Every navigation lands here, which makes it the one place that
       cannot forget to tell Poppy the view moved. */
    publishSurface();

    var el = document.getElementById('breadcrumb-name');
    if (!el) return;
    var portalTag = '';
    if (_viewProjectId && _viewProjectId !== _projectId) {
        var pname = '';
        for (var i = _path.length - 1; i >= 0; i--) {
            if (_path[i].portalProjectName) { pname = _path[i].portalProjectName; break; }
        }
        if (pname) {
            portalTag = ' <span class="bc-portal-tag">' +
                '<i class="fa-solid fa-link"></i>&nbsp;' + esc(pname) + '</span>';
        }
    }
    if (_path.length === 0) {
        el.innerHTML = esc(_projectName) + portalTag;
    } else {
        var current = _path[_path.length - 1];
        el.innerHTML =
            '<span style="cursor:pointer;color:#C4C2BF;font-size:14px;margin-right:10px;transition:color 0.15s" ' +
            'onmouseover="this.style.color=\'var(--text)\'" onmouseout="this.style.color=\'#C4C2BF\'" ' +
            'onclick="navigateUp()" title="Go Back"><i class="fa-solid fa-arrow-left"></i></span>' +
            esc(current.name) + portalTag;
    }
}

function gotoAllProjects() { window.location.href = 'Scribble.html'; }
function gotoRecycleBin()  { window.location.href = 'Scribble-recycle-bin.html'; }
/* gotoLifeHub() removed 2026-09-17 — it was a console.log stub. The
   header now carries two plain links to the real LifeHub pages. */

/* ─── CREATE DROPDOWN ─── */
function toggleCreateDropdown(e) {
    e.stopPropagation();
    _createDropdownOpen = !_createDropdownOpen;
    var dd  = document.getElementById('create-dropdown');
    var btn = document.getElementById('create-btn');
    if (dd)  dd.style.display  = _createDropdownOpen ? 'block' : 'none';
    if (btn) btn.classList.toggle('open', _createDropdownOpen);
}

function closeCreateDropdown() {
    if (!_createDropdownOpen) return;
    _createDropdownOpen = false;
    var dd  = document.getElementById('create-dropdown');
    var btn = document.getElementById('create-btn');
    if (dd)  dd.style.display = 'none';
    if (btn) btn.classList.remove('open');
}

function selectCreateOption(type) {
    closeCreateDropdown();
    if (type === 'module')  { showModuleModal();  return; }
    if (type === 'section') { showSectionModal(); return; }
    showFileModal(type);
}

/* ─── MODULE MODAL ─── */
function showModuleModal() {
    showModal(
        '<div class="modal-title"><i class="fa-solid fa-box" style="font-size:20px;color:var(--sub)"></i>New Module</div>' +
        '<div class="modal-field-label">Module Name</div>' +
        '<input class="modal-input" type="text" id="new-item-name" maxlength="80" onkeydown="if(event.key===\'Enter\')submitNewItem(\'module\')">' +
        '<div class="modal-field-label">Description</div>' +
        '<textarea class="modal-textarea" id="new-item-desc" style="min-height:150px"></textarea>' +
        '<div class="modal-footer">' +
        '<button class="modal-btn primary" onclick="submitNewItem(\'module\')">CREATE</button>' +
        '<button class="modal-btn" onclick="closeModal()">CANCEL</button></div>'
    );
    setTimeout(function() { var el = document.getElementById('new-item-name'); if (el) el.focus(); }, 50);
}

/* ─── SECTION MODAL ─── */
function showSectionModal() {
    showModal(
        '<div class="modal-title"><i class="fa-solid fa-folder" style="font-size:18px;color:var(--sub)"></i>New Section</div>' +
        '<div class="modal-field-label">Section Name</div>' +
        '<input class="modal-input" type="text" id="new-item-name" maxlength="80" onkeydown="if(event.key===\'Enter\')submitNewItem(\'section\')">' +
        '<div class="modal-field-label">Description</div>' +
        '<textarea class="modal-textarea" id="new-item-desc" style="min-height:150px"></textarea>' +
        '<div class="modal-footer">' +
        '<button class="modal-btn primary" onclick="submitNewItem(\'section\')">CREATE</button>' +
        '<button class="modal-btn" onclick="closeModal()">CANCEL</button></div>'
    );
    setTimeout(function() { var el = document.getElementById('new-item-name'); if (el) el.focus(); }, 50);
}

/* ─── DUPLICATE-NAME FEEDBACK ───
   Checks run BEFORE closeModal() so a refusal never costs you what
   you typed — the modal stays open with the reason under the input. */
function _showModalError(inputEl, msg) {
    if (!inputEl) { alert(msg); return; }
    inputEl.classList.add('error');
    var existing = inputEl.parentElement.querySelector('.modal-error-msg');
    if (existing) existing.remove();
    var err = document.createElement('div');
    err.className = 'modal-error-msg';
    err.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> ' + esc(msg);
    inputEl.insertAdjacentElement('afterend', err);
    inputEl.focus();
    inputEl.select();
}

function _clearModalError(inputEl) {
    if (!inputEl) return;
    inputEl.classList.remove('error');
    var existing = inputEl.parentElement.querySelector('.modal-error-msg');
    if (existing) existing.remove();
}

async function submitNewItem(itemType) {
    var nameEl = document.getElementById('new-item-name');
    var descEl = document.getElementById('new-item-desc');
    var name   = nameEl ? nameEl.value.trim() : '';
    var desc   = descEl ? descEl.value.trim() : '';
    if (!name) { if (nameEl) { nameEl.classList.add('error'); nameEl.focus(); } return; }
    _clearModalError(nameEl);

    var clash = await window.PROJECT_FB.findItemClash(
        _viewProjectId, itemType, _currentParentId, name);
    if (clash) {
        window.showNameClash({
            kind: itemType, typed: name, clash: clash,
            onEdit: function () {
                var el = document.getElementById('new-item-name');
                if (el) { el.classList.add('error'); el.focus(); el.select(); }
            }
        });
        return;
    }

    closeModal();
    try {
        if (itemType === 'module')  await window.PROJECT_FB.createModule(_viewProjectId, _currentParentId, name, desc);
        if (itemType === 'section') await window.PROJECT_FB.createSection(_viewProjectId, _currentParentId, name, desc);
    } catch (err) {
        alert(err && err.code === 'duplicate-name' ? err.message : 'Could not create that item.');
    }
}

/* ─── FILE MODAL ─── */
function showFileModal(type) {
    _currentFileType = type;
    _currentColour   = (type === 'colour') ? COLOUR_SWATCHES[0] : null;

    showModal(
        '<div class="modal-title"><i class="fa-regular fa-file" style="font-size:18px;color:var(--sub)"></i>New File</div>' +
        '<div class="modal-field-label">File Name</div>' +
        '<div class="file-modal-name-row">' +
        '<input class="modal-input" type="text" id="new-file-name" maxlength="80" onkeydown="if(event.key===\'Enter\')submitNewFile()">' +
        buildTypeArea(type) +
        '</div>' +
        '<div class="modal-field-label">Description</div>' +
        '<textarea class="modal-textarea" id="new-file-desc" style="min-height:140px"></textarea>' +
        '<div class="modal-footer">' +
        '<button class="modal-btn primary" onclick="submitNewFile()">CREATE</button>' +
        '<button class="modal-btn" onclick="closeModal()">CANCEL</button></div>'
    );
    setTimeout(function() { var el = document.getElementById('new-file-name'); if (el) el.focus(); }, 50);
}

function buildTypeArea(type) {
    if (type === 'colour') { return buildColourPickerHTML(); }
    if (type === 'custom') {
        return '<div class="file-type-custom">' +
            '<span class="file-type-dot">.</span>' +
            '<input class="file-type-ext" type="text" id="file-type-input" maxlength="10" placeholder="ext"' +
            ' oninput="this.value=this.value.toLowerCase().replace(/[^a-z0-9]/g,\'\')"' +
            ' onkeydown="if(event.key===\'Enter\')submitNewFile()"></div>';
    }
    return '<span class="file-type-chip">.' + type.toUpperCase() + '</span>';
}

function buildColourPickerHTML() {
    var swatches = COLOUR_SWATCHES.map(function(hex, i) {
        return '<div class="colour-swatch' + (i === 0 ? ' selected' : '') + '" style="background:' + hex + '" title="' + hex + '" onclick="selectColour(\'' + hex + '\')"></div>';
    }).join('');
    return '<div class="colour-picker-wrap">' +
        '<button class="colour-picker-btn" type="button" onclick="toggleColourPicker(event)">' +
        '<div class="colour-preview" id="colour-preview" style="background:' + COLOUR_SWATCHES[0] + '"></div>' +
        '<i class="fa-solid fa-chevron-down"></i></button>' +
        '<div class="colour-picker-grid" id="colour-picker-grid" style="display:none">' + swatches + '</div>' +
        '</div>';
}

function toggleColourPicker(e) {
    e.stopPropagation();
    var grid = document.getElementById('colour-picker-grid');
    if (!grid) return;
    grid.style.display = grid.style.display === 'none' ? 'grid' : 'none';
}

function selectColour(hex) {
    _currentColour = hex;
    var preview = document.getElementById('colour-preview');
    if (preview) preview.style.background = hex;
    document.querySelectorAll('.colour-swatch').forEach(function(s) {
        s.classList.toggle('selected', s.title === hex);
    });
    var grid = document.getElementById('colour-picker-grid');
    if (grid) grid.style.display = 'none';
}

async function submitNewFile() {
    var nameEl = document.getElementById('new-file-name');
    var descEl = document.getElementById('new-file-desc');
    var name   = nameEl ? nameEl.value.trim() : '';
    var desc   = descEl ? descEl.value.trim() : '';
    if (!name) { if (nameEl) { nameEl.classList.add('error'); nameEl.focus(); } return; }
    var type   = _currentFileType;
    var colour = null;
    if (type === 'custom') {
        var extEl = document.getElementById('file-type-input');
        type = extEl ? (extEl.value.trim().toLowerCase() || 'txt') : 'txt';
    } else if (type === 'colour') {
        colour = _currentColour || COLOUR_SWATCHES[0];
    }
    _clearModalError(nameEl);

    var clash = await window.PROJECT_FB.findItemClash(
        _viewProjectId, 'file', _currentParentId, name, type);
    if (clash) {
        window.showNameClash({
            kind: 'file', typed: name, clash: clash,
            onEdit: function () {
                var el = document.getElementById('new-file-name');
                if (el) { el.classList.add('error'); el.focus(); el.select(); }
            }
        });
        return;
    }

    closeModal();
    try {
        await window.PROJECT_FB.createFile(_viewProjectId, _currentParentId, name, type, colour, desc);
    } catch (err) {
        alert(err && err.code === 'duplicate-name' ? err.message : 'Could not create that file.');
    }
}

/* ═══════════════════════════════════════════════════
   CONTEXT MENU
═══════════════════════════════════════════════════ */
function showItemCtxMenu(e, itemType, id) {
    e.stopPropagation();
    hideCtxMenu();
    var item         = findItem(itemType, id);
    var isFolderType = (itemType === 'module' || itemType === 'section');
    var pinLabel     = (item && item.pinned) ? 'UNPIN' : 'PIN';
    var pinIconCls   = (item && item.pinned) ? 'fa-solid fa-thumbtack' : 'fa-regular fa-thumbtack';
    var menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.id = 'ctx-menu';

    if (item && item.isSymlink) {
        /* ── SYMLINK MENU ── */
        menu.innerHTML =
            '<div class="ctx-item" onclick="ctxPinItem(\'' + itemType + '\',\'' + id + '\')">' +
            '<i class="fa-solid fa-thumbtack"></i>' + pinLabel + '</div>' +
            '<div class="ctx-item" onclick="ctxRenameItem(\'' + itemType + '\',\'' + id + '\')">' +
            '<i class="fa-regular fa-pen-to-square"></i>RENAME</div>' +
            '<div class="ctx-item" onclick="ctxViewContents(\'' + itemType + '\',\'' + id + '\')">' +
            '<i class="fa-solid fa-circle-info"></i>DETAILS</div>' +
            '<div class="ctx-item" onclick="ctxDuplicateItem(\'' + itemType + '\',\'' + id + '\')">' +
            '<i class="fa-regular fa-copy"></i>DUPLICATE</div>' +
            '<div class="ctx-divider"></div>' +
            '<div class="ctx-item" onclick="ctxGoToOriginal(\'' + itemType + '\',\'' + id + '\')">' +
            '<i class="fa-solid fa-arrow-up-right-from-square"></i>GO TO ORIGINAL</div>' +
            '<div class="ctx-divider"></div>' +
            '<div class="ctx-item danger" onclick="ctxDeleteSymlink(\'' + itemType + '\',\'' + id + '\')">' +
            '<i class="fa-solid fa-trash-can"></i>DELETE PERMANENTLY</div>';
    } else {
        /* ── ORIGINAL MENU ── */
        menu.innerHTML =
            '<div class="ctx-item" onclick="ctxPinItem(\'' + itemType + '\',\'' + id + '\')">' +
            '<i class="fa-solid fa-thumbtack"></i>' + pinLabel + '</div>' +
            '<div class="ctx-item" onclick="ctxRenameItem(\'' + itemType + '\',\'' + id + '\')">' +
            '<i class="fa-regular fa-pen-to-square"></i>RENAME</div>' +
            '<div class="ctx-item" onclick="ctxViewContents(\'' + itemType + '\',\'' + id + '\')">' +
            '<i class="fa-solid fa-circle-info"></i>DETAILS</div>' +
            (itemType === 'file'
                ? '<div class="ctx-item" onclick="ctxExportItem(\'' + itemType + '\',\'' + id + '\')">' +
                  '<i class="fa-solid fa-file-export"></i>EXPORT</div>' +
                  '<div class="ctx-item" onclick="ctxVersionHistory(\'' + id + '\',\'' + esc(item && item.name ? item.name : '') + '\')">' +
                  '<i class="fa-solid fa-clock-rotate-left"></i>VERSION HISTORY</div>' : '') +
            '<div class="ctx-divider"></div>' +
            '<div class="ctx-item" onclick="ctxDuplicateItem(\'' + itemType + '\',\'' + id + '\')">' +
            '<i class="fa-regular fa-copy"></i>DUPLICATE</div>' +
            '<div class="ctx-item" onclick="ctxMoveItem(\'' + itemType + '\',\'' + id + '\')">' +
            '<i class="fa-solid fa-arrow-right-arrow-left"></i>MOVE</div>' +
            '<div class="ctx-item" onclick="ctxCopyItem(\'' + itemType + '\',\'' + id + '\')">' +
            '<i class="fa-solid fa-arrow-right-arrow-left"></i>COPY</div>' +
            '<div class="ctx-item" onclick="ctxLinkItem(\'' + itemType + '\',\'' + id + '\')">' +
            '<i class="fa-solid fa-code-branch"></i>SYMLINK</div>' +
            '<div class="ctx-item" onclick="ctxLogsItem(\'' + itemType + '\',\'' + id + '\')">' +
'<i class="fa-regular fa-clock"></i>LOGS</div>' +
'<div class="ctx-item" onclick="ctxRecords(\'' + itemType + '\',\'' + id + '\')">' +
'<i class="fa-solid fa-book-bookmark"></i>RECORDS</div>' +
(isFolderType
                ? '<div class="ctx-item" onclick="ctxMergeItem(\'' + itemType + '\',\'' + id + '\')">' +
                  '<i class="fa-solid fa-code-merge"></i>MERGE</div>' : '') +
            (itemType === 'module'
                ? '<div class="ctx-item" onclick="ctxPromoteModule(\'' + id + '\')">' +
                  '<i class="fa-solid fa-arrow-up-from-bracket"></i>PROMOTE TO PROJECT</div>' : '') +
            '<div class="ctx-item" onclick="ctxArchiveItem(\'' + itemType + '\',\'' + id + '\')">' +
            '<i class="material-symbols-outlined" style="font-size:13px">inventory_2</i>ARCHIVE</div>' +
            '<div class="ctx-divider"></div>' +
            '<div class="ctx-item danger" onclick="ctxDeleteItem(\'' + itemType + '\',\'' + id + '\')">' +
            '<i class="fa-regular fa-trash-can"></i>MOVE TO BIN</div>';
    }

    document.body.appendChild(menu);
    _activeCtxMenu = menu;

    var menuW = 200, menuH = 344;   // + PROMOTE row on modules
    var left, top;

    if (e.clientX !== undefined && e.type === 'contextmenu') {
        /* Right-click: anchor right at the cursor, not the card's edges */
        left = e.clientX;
        top  = e.clientY;
    } else {
        /* Dots button click: keep the original button-relative anchor */
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

/* ═══════════════════════════════════════════════════
   VERSION HISTORY
═══════════════════════════════════════════════════ */
var _vhFileId   = '';
var _vhFileName = '';
var _vhVersions = [];
/* Version subcollections live under the file's OWN project. Inside a
   portal (a linked module) _viewProjectId != window._projectId, so the
   EDITOR_FB default would read the wrong project. Pin it explicitly. */
var _vhPid      = null;

function ctxVersionHistory(fileId, fileName) {
    hideCtxMenu();
    openVersionHistoryModal(fileId, fileName);
}

async function openVersionHistoryModal(fileId, fileName) {
    _vhFileId   = fileId;
    _vhFileName = fileName;
    _vhPid      = _viewProjectId || window._projectId;

    var backdrop = document.getElementById('version-history-backdrop');
    var titleEl  = document.getElementById('version-history-title');
    var list     = document.getElementById('version-history-list');
    if (!backdrop || !list) return;

    if (titleEl) titleEl.textContent = 'Version History — ' + fileName;
    list.innerHTML = '<div class="version-history-loading"><i class="fa-solid fa-spinner fa-spin"></i>  Loading…</div>';
    backdrop.style.display = 'flex';

    _vhVersions = await window.EDITOR_FB.listVersions(fileId, _vhPid);

    if (!_vhVersions.length) {
        list.innerHTML =
            '<div class="version-history-empty">No saved versions yet.<br>' +
            '<span>Click the 🖫 Save button in the editor to create a snapshot.</span></div>';
        return;
    }

    list.innerHTML = _vhVersions.map(function(v, i) {
        var date    = v.savedAt && v.savedAt.seconds
            ? new Date(v.savedAt.seconds * 1000).toLocaleString()
            : 'Just now';
        var name    = esc(v.versionName || 'Snapshot');
        var note    = _vhNoteHtml(v, i);
        var words   = v.wordCount || 0;
        var chars   = v.charCount || 0;
        var bytes   = v.size || 0;
        var sizeStr = bytes < 1024 ? bytes + ' B'
                    : bytes < 1048576 ? (bytes / 1024).toFixed(1) + ' KB'
                    : (bytes / 1048576).toFixed(2) + ' MB';

        return '<div class="vh-row">' +
            '<div class="vh-row-body">' +
                '<div class="vh-label">' + name +
                    (i === 0 ? ' <span class="vh-badge">LATEST</span>' : '') +
                '</div>' +
                note +
                '<div class="vh-date"><i class="fa-regular fa-clock"></i> ' + date + '</div>' +
                '<div class="vh-meta">' + words + ' words · ' + chars + ' chars · ' + sizeStr + '</div>' +
                '<div class="vh-actions">' +
                    '<button class="vh-btn" onclick="viewVersionOnly(' + i + ')" title="View read-only">' +
                        '<i class="fa-solid fa-eye"></i> View</button>' +
                    '<button class="vh-btn" onclick="exportVersionContent(' + i + ')" title="Download this version">' +
                        '<i class="fa-solid fa-file-export"></i> Export</button>' +
                    '<button class="vh-btn" onclick="importVersionAsCopy(' + i + ')" title="Save as a new file next to the original">' +
                        '<i class="fa-solid fa-file-import"></i> Import</button>' +
                    '<button class="vh-btn" onclick="restoreVersion(' + i + ')" title="Restore this version">' +
                        '<i class="fa-solid fa-rotate-left"></i> Restore</button>' +
                    '<button class="vh-btn danger" onclick="deleteVersionRow(' + i + ')" title="Delete this version">' +
                        '<i class="fa-solid fa-trash-can"></i></button>' +
                '</div>' +
            '</div>' +
        '</div>';
    }).join('');
}

function closeVersionHistory() {
    var backdrop = document.getElementById('version-history-backdrop');
    if (backdrop) backdrop.style.display = 'none';
}

/* ─── VERSION DESCRIPTION (editable after the fact) ───
   Older snapshots were saved before the label ever reached
   Firestore, so every row can be labelled retroactively. Only
   the `note` field is touched — content and savedAt never move. */

function _vhNoteHtml(v, i) {
    var note = v.note || '';
    return '<div class="vh-note-wrap" id="vh-note-wrap-' + i + '">' +
        (note
            ? '<div class="vh-note">' + esc(note) + '</div>'
            : '<div class="vh-note empty">No description</div>') +
        '<button class="vh-note-edit" onclick="editVersionNote(' + i + ')" title="' +
            (note ? 'Edit description' : 'Add a description') + '">' +
            '<i class="fa-solid fa-pen"></i>' +
        '</button>' +
    '</div>';
}

function editVersionNote(versionIdx) {
    var v    = _vhVersions[versionIdx];
    var wrap = document.getElementById('vh-note-wrap-' + versionIdx);
    if (!v || !wrap) return;

    wrap.innerHTML =
        '<input class="vh-note-input" id="vh-note-input-' + versionIdx + '" type="text" maxlength="120" ' +
            'placeholder="What changed in this version?" ' +
            'onkeydown="if(event.key===\'Enter\'){event.preventDefault();saveVersionNote(' + versionIdx + ');}' +
                       'if(event.key===\'Escape\'){event.preventDefault();cancelVersionNote(' + versionIdx + ');}">' +
        '<button class="vh-note-edit save" onclick="saveVersionNote(' + versionIdx + ')" title="Save">' +
            '<i class="fa-solid fa-check"></i></button>' +
        '<button class="vh-note-edit" onclick="cancelVersionNote(' + versionIdx + ')" title="Cancel">' +
            '<i class="fa-solid fa-xmark"></i></button>';

    // Value set in JS, not in the attribute — quotes in a note would
    // otherwise break the markup.
    var inp = document.getElementById('vh-note-input-' + versionIdx);
    if (inp) { inp.value = v.note || ''; inp.focus(); inp.select(); }
}

function cancelVersionNote(versionIdx) {
    var wrap = document.getElementById('vh-note-wrap-' + versionIdx);
    if (wrap && _vhVersions[versionIdx]) {
        wrap.outerHTML = _vhNoteHtml(_vhVersions[versionIdx], versionIdx);
    }
}

async function saveVersionNote(versionIdx) {
    var v   = _vhVersions[versionIdx];
    var inp = document.getElementById('vh-note-input-' + versionIdx);
    if (!v || !inp || !_vhFileId) return;
    if (!window.EDITOR_FB || !window.EDITOR_FB.updateVersionNote) return;

    var note = inp.value.trim();
    inp.disabled = true;

    var ok = await window.EDITOR_FB.updateVersionNote(_vhFileId, v.id, note, _vhPid);

    if (!ok) {
        inp.disabled = false;
        alert('Could not save the description. Check your connection and try again.');
        return;
    }

    v.note = note;                  // keep the local cache in sync
    cancelVersionNote(versionIdx);  // re-render as plain text
}

// VIEW ONLY ──────────────────────────────────────
function viewVersionOnly(versionIdx) {
    var v = _vhVersions[versionIdx];
    if (!v) return;
    var backdrop  = document.getElementById('version-view-backdrop');
    var titleEl   = document.getElementById('version-view-title');
    var contentEl = document.getElementById('version-view-content');
    if (!backdrop || !contentEl) return;
    if (titleEl) titleEl.textContent = (v.versionName || 'Version') + ' — View Only';
    contentEl.innerHTML = v.content || '';
    backdrop.style.display = 'flex';
}

function closeVersionView() {
    var backdrop = document.getElementById('version-view-backdrop');
    if (backdrop) backdrop.style.display = 'none';
}

function copyVersionViewContent() {
    var contentEl = document.getElementById('version-view-content');
    if (!contentEl) return;
    var text = contentEl.innerText || '';
    navigator.clipboard.writeText(text).then(function() {
        var btn = document.getElementById('version-view-copy-btn');
        if (!btn) return;
        var orig = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-check"></i>';
        btn.style.color = '#27AE60';
        setTimeout(function() { btn.innerHTML = orig; btn.style.color = ''; }, 1400);
    });
}

// EXPORT ─────────────────────────────────────────
function exportVersionContent(versionIdx) {
    var v = _vhVersions[versionIdx];
    if (!v || !_vhFileId) return;
    var original = findItem('file', _vhFileId);
    var versionFile = {
        id:      _vhFileId,
        name:    (original ? original.name : _vhFileName) + ' — ' + (v.versionName || 'Version'),
        type:    original ? original.type : 'txt',
        content: v.content
    };
    if (window.SCRIBBLE_EXPORT) window.SCRIBBLE_EXPORT.openExportModal(versionFile);
}

// IMPORT ─────────────────────────────────────────
// Creates a real new file, right next to the original, carrying the
// version's own name (e.g. "File A V1") and its saved content.
async function importVersionAsCopy(versionIdx) {
    var v = _vhVersions[versionIdx];
    if (!v || !_vhFileId || !window.PROJECT_FB) return;
    var original = findItem('file', _vhFileId);
    if (!original) return;

    var newName = v.versionName || (_vhFileName + ' Copy');

    var newId = await window.PROJECT_FB.createFile(
        _viewProjectId,
        original.parentId || null,
        newName,
        original.type || 'txt',
        original.colour || null,
        original.description || ''
    );

    if (newId && window.EDITOR_FB) {
        await window.EDITOR_FB.saveFileContent(newId, v.content);
    }

    if (newId && window.PROJECT_FB && window.PROJECT_FB.logItemAction) {
        await window.PROJECT_FB.logItemAction(
            _viewProjectId, newId,
            "Imported from '" + (original.name || 'Untitled') + "' (" + newName + ")."
        );
    }

    closeVersionHistory();
}

// RESTORE ────────────────────────────────────────
async function restoreVersion(versionIdx) {
    var v = _vhVersions[versionIdx];
    if (!v || !_vhFileId) return;
    if (!confirm('Restore "' + (v.versionName || 'this version') + '"?\nThe current content will be overwritten.')) return;
    await window.EDITOR_FB.saveFileContent(_vhFileId, v.content, _vhPid);
    if (window.EDITOR_APP && window.EDITOR_APP._refreshFile) {
        window.EDITOR_APP._refreshFile(_vhFileId, v.content);
    }
    closeVersionHistory();
}

// DELETE ─────────────────────────────────────────
async function deleteVersionRow(versionIdx) {
    var v = _vhVersions[versionIdx];
    if (!v || !_vhFileId) return;
    if (!confirm('Delete "' + (v.versionName || 'this version') + '"?\nThis cannot be undone.')) return;
    await window.EDITOR_FB.deleteVersion(_vhFileId, v.id, _vhPid);
    await openVersionHistoryModal(_vhFileId, _vhFileName); // refresh list
}

/* ═══════════════════════════════════════════════════
   GENERAL RECORD — project-wide storage-path sheet
   One modal, every file in the project, records editable
   in place. Built for paste-through: Tab walks the grid,
   only edited rows are written.
═══════════════════════════════════════════════════ */
var _grRows    = [];      // as loaded from Firebase
var _grEdits   = {};      // id → { onedrive, hdPath }  (dirty rows only)
var _grFilter  = '';

async function openGeneralRecord() {
    hideCtxMenu();
    showModal(
        '<div class="modal-title"><i class="fa-solid fa-hard-drive" style="font-size:16px;color:var(--sub)"></i>General Record</div>' +
        '<div class="gr-sub">External storage paths for every file in this project. ' +
        'Edits save back to each file\u2019s own record.</div>' +
        '<div class="gr-toolbar">' +
            '<input class="modal-input gr-search" type="text" id="gr-search" placeholder="Filter by name or path\u2026" ' +
                   'oninput="grFilter(this.value)">' +
            '<label class="gr-only-missing"><input type="checkbox" id="gr-missing" onchange="grRender()"> Only missing</label>' +
        '</div>' +
        '<div class="gr-table-wrap" id="gr-table-wrap">' +
            '<div class="gr-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading records\u2026</div>' +
        '</div>' +
        '<div class="modal-footer gr-footer">' +
            '<span class="gr-status" id="gr-status"></span>' +
            '<button class="modal-btn" onclick="closeGeneralRecord()">CLOSE</button>' +
            '<button class="modal-btn primary" id="gr-save-btn" disabled onclick="grSaveAll()">SAVE</button>' +
        '</div>',
        '900px'
    );

    _grRows = []; _grEdits = {}; _grFilter = '';

    try {
        _grRows = await window.PROJECT_FB.getAllFileRecords(_viewProjectId);
    } catch (e) {
        var wrap = document.getElementById('gr-table-wrap');
        if (wrap) wrap.innerHTML = '<div class="gr-loading">Could not load records: ' + esc(e.message || 'error') + '</div>';
        return;
    }
    grRender();
}

function closeGeneralRecord() {
    if (Object.keys(_grEdits).length &&
        !confirm('You have unsaved record edits. Close anyway?')) return;
    _grEdits = {};
    closeModal();
}

function grFilter(v) { _grFilter = (v || '').toLowerCase(); grRender(); }

/* Current value = pending edit if present, otherwise what's stored. */
function _grVal(row, field) {
    if (_grEdits[row.id] && _grEdits[row.id][field] !== undefined) return _grEdits[row.id][field];
    return row.records[field] || '';
}

function grRender() {
    var wrap = document.getElementById('gr-table-wrap');
    if (!wrap) return;

    var missingOnly = document.getElementById('gr-missing');
    var onlyMissing = missingOnly && missingOnly.checked;

    var rows = _grRows.filter(function(r) {
        if (_grFilter &&
            (r.name + ' ' + r.path).toLowerCase().indexOf(_grFilter) === -1) return false;
        if (onlyMissing && (_grVal(r, 'onedrive') || _grVal(r, 'hdPath'))) return false;
        return true;
    });

    if (!rows.length) {
        wrap.innerHTML = '<div class="gr-loading">' +
            (_grRows.length ? 'No files match that filter.' : 'No files in this project yet.') +
            '</div>';
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
            var dirty = _grEdits[r.id] ? ' gr-dirty' : '';
            var blank = (!_grVal(r, 'onedrive') && !_grVal(r, 'hdPath')) ? ' gr-blank' : '';
            return '<tr class="gr-row' + dirty + blank + '" id="gr-row-' + r.id + '">' +
                '<td class="gr-file">' +
                    '<div class="gr-file-name">' + esc(r.name) + '.' + esc(r.type) + '</div>' +
                    '<div class="gr-file-path">' + esc(r.path) + '</div>' +
                '</td>' +
                '<td><input class="gr-input" type="text" spellcheck="false" ' +
                    'placeholder="https://\u2026" ' +
                    'value="' + esc(_grVal(r, 'onedrive')) + '" ' +
                    'oninput="grEdit(\'' + r.id + '\',\'onedrive\',this.value)"></td>' +
                '<td><input class="gr-input" type="text" spellcheck="false" ' +
                    'placeholder="D:\\\\Backups\\\\\u2026" ' +
                    'value="' + esc(_grVal(r, 'hdPath')) + '" ' +
                    'oninput="grEdit(\'' + r.id + '\',\'hdPath\',this.value)"></td>' +
            '</tr>';
        }).join('') +
        '</tbody></table>';

    grSyncStatus();
}

function grEdit(id, field, value) {
    var row = _grRows.find(function(r) { return r.id === id; });
    if (!row) return;

    if (!_grEdits[id]) _grEdits[id] = {};
    _grEdits[id][field] = value;

    /* If every field is back to its stored value, it isn't an edit. */
    var e = _grEdits[id];
    var unchanged = Object.keys(e).every(function(k) {
        return (e[k] || '') === (row.records[k] || '');
    });
    if (unchanged) delete _grEdits[id];

    var tr = document.getElementById('gr-row-' + id);
    if (tr) tr.classList.toggle('gr-dirty', !!_grEdits[id]);
    grSyncStatus();
}

function grSyncStatus() {
    var n      = Object.keys(_grEdits).length;
    var btn    = document.getElementById('gr-save-btn');
    var status = document.getElementById('gr-status');
    if (btn)    btn.disabled = (n === 0);
    if (btn)    btn.textContent = n ? 'SAVE ' + n + ' CHANGE' + (n !== 1 ? 'S' : '') : 'SAVE';
    if (status) {
        var withRec = _grRows.filter(function(r) {
            return _grVal(r, 'onedrive') || _grVal(r, 'hdPath');
        }).length;
        status.textContent = withRec + ' of ' + _grRows.length + ' files recorded';
    }
}

async function grSaveAll() {
    var ids = Object.keys(_grEdits);
    if (!ids.length) return;

    var btn = document.getElementById('gr-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'SAVING\u2026'; }

    /* Merge each edit onto the row's existing record so customLinks —
       which this sheet doesn't show — is never clobbered. */
    var changes = ids.map(function(id) {
        var row = _grRows.find(function(r) { return r.id === id; });
        return {
            id: id,
            records: {
                onedrive:    _grEdits[id].onedrive !== undefined ? _grEdits[id].onedrive.trim() : (row.records.onedrive || ''),
                hdPath:      _grEdits[id].hdPath   !== undefined ? _grEdits[id].hdPath.trim()   : (row.records.hdPath   || ''),
                customLinks: row.records.customLinks || []
            }
        };
    });

    var result = await window.PROJECT_FB.saveRecordsBulk(_viewProjectId, changes);

    /* Keep failed rows dirty so nothing typed is silently dropped. */
    var failedIds = (result.failed || []).map(function(f) { return f.id; });
    changes.forEach(function(c) {
        if (failedIds.indexOf(c.id) !== -1) return;
        var row = _grRows.find(function(r) { return r.id === c.id; });
        if (row) row.records = c.records;
        delete _grEdits[c.id];
    });

    grRender();

    if (failedIds.length) {
        alert(result.saved + ' saved, ' + failedIds.length + ' failed.\n' +
              'The failed rows are still highlighted — try saving again.');
    }
}

/* ═══════════════════════════════════════════════════
   ACTIVITY — paged, sortable, filterable project log
═══════════════════════════════════════════════════ */
var _actState = { page: 1, kind: 'all', sort: 'newest', search: '', minWeight: 2 };

var LOG_KIND_META = {
    create:  { icon: 'fa-plus',            label: 'Created'  },
    rename:  { icon: 'fa-pen',             label: 'Renamed'  },
    move:    { icon: 'fa-arrow-right',     label: 'Moved'    },
    copy:    { icon: 'fa-copy',            label: 'Copied'   },
    link:    { icon: 'fa-link',            label: 'Links'    },
    version: { icon: 'fa-clock-rotate-left', label: 'Versions' },
    record:  { icon: 'fa-hard-drive',      label: 'Records'  },
    tag:     { icon: 'fa-tag',             label: 'Tags'     },
    merge:   { icon: 'fa-code-merge',      label: 'Merged'   },
    delete:  { icon: 'fa-trash-can',       label: 'Deleted'  },
    restore: { icon: 'fa-rotate-left',     label: 'Restored' },
    /* Added 2026-09-17 — see the same note in scribble-app.js. Archive
       events were written with kind:'archive' and no reader knew it. */
    archive: { icon: 'fa-box-archive',     label: 'Archived' },
    content: { icon: 'fa-pencil',          label: 'Content'  },
    meta:    { icon: 'fa-circle-info',     label: 'Other'    },
    legacy:  { icon: 'fa-clock',           label: 'Legacy'   },
};

function openActivityLog() {
    hideCtxMenu();
    _actState = { page: 1, kind: 'all', sort: 'newest', search: '', minWeight: 2 };

    var chips = ['all'].concat(Object.keys(LOG_KIND_META)).map(function(k) {
        var m = LOG_KIND_META[k];
        return '<button class="act-chip' + (k === 'all' ? ' on' : '') + '" data-kind="' + k + '" ' +
               'onclick="actSetKind(\'' + k + '\')">' +
               (m ? '<i class="fa-solid ' + m.icon + '"></i> ' + m.label : 'All') + '</button>';
    }).join('');

    showModal(
        '<div class="modal-title"><i class="fa-regular fa-clock" style="font-size:16px;color:var(--sub)"></i>Activity</div>' +
        '<div class="act-toolbar">' +
            '<input class="modal-input act-search" type="text" placeholder="Search activity\u2026" ' +
                   'oninput="actSetSearch(this.value)">' +
            '<select class="sort-select" onchange="actSetSort(this.value)">' +
                '<option value="newest">Newest First</option>' +
                '<option value="oldest">Oldest First</option>' +
            '</select>' +
            '<label class="act-minor"><input type="checkbox" id="act-minor" onchange="actToggleMinor(this.checked)"> ' +
                'Show minor</label>' +
        '</div>' +
        '<div class="act-chips">' + chips + '</div>' +
        '<div class="act-list" id="act-list">' +
            '<div class="act-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading\u2026</div>' +
        '</div>' +
        '<div class="modal-footer act-footer">' +
            '<span class="act-count" id="act-count"></span>' +
            '<button class="modal-btn" id="act-prev" onclick="actPage(-1)" disabled>PREV</button>' +
            '<span class="act-pageno" id="act-pageno">\u2014</span>' +
            '<button class="modal-btn" id="act-next" onclick="actPage(1)" disabled>NEXT</button>' +
            '<button class="modal-btn" onclick="closeModal()">CLOSE</button>' +
        '</div>',
        '820px'
    );
    actLoad();
}

function actSetKind(k)      { _actState.kind = k; _actState.page = 1;
    var chips = document.querySelectorAll('.act-chip');
    for (var i = 0; i < chips.length; i++) chips[i].classList.toggle('on', chips[i].dataset.kind === k);
    actLoad(); }
function actSetSort(v)      { _actState.sort = v; _actState.page = 1; actLoad(); }
function actToggleMinor(on) { _actState.minWeight = on ? 1 : 2; _actState.page = 1; actLoad(); }
function actPage(delta)     { _actState.page += delta; actLoad(); }

var _actSearchTimer = null;
function actSetSearch(v) {
    clearTimeout(_actSearchTimer);
    _actSearchTimer = setTimeout(function() {
        _actState.search = v; _actState.page = 1; actLoad();
    }, 180);
}

async function actLoad() {
    var list = document.getElementById('act-list');
    if (!list) return;

    var res = await window.PROJECT_FB.getProjectLogsPaged(_viewProjectId, {
        page:      _actState.page,
        pageSize:  50,
        kind:      _actState.kind,
        sort:      _actState.sort,
        search:    _actState.search,
        minWeight: _actState.minWeight,
    });

    if (!res.rows.length) {
        list.innerHTML = '<div class="act-loading">No activity matches these filters.</div>';
    } else {
        list.innerHTML = res.rows.map(function(r) {
            var m = LOG_KIND_META[r.kind] || LOG_KIND_META.meta;

            /* The whole point of the rewrite: say WHAT was touched and WHERE. */
            var target = '';
            if (r.itemName) {
                var n = r.itemName + (r.fileType ? '.' + r.fileType : '');
                target = '<div class="act-target">' + esc(n) +
                    (r.itemPath ? '<span class="act-path">' + esc(r.itemPath) + '</span>' : '') +
                    '</div>';
            } else if (r.legacy) {
                target = '<div class="act-target act-unknown">unattributed \u2014 logged before activity tracking</div>';
            }

            return '<div class="act-row w' + r.weight + '">' +
                '<div class="act-icon k-' + r.kind + '"><i class="fa-solid ' + m.icon + '"></i></div>' +
                '<div class="act-body">' +
                    '<div class="act-action">' + esc(r.action) + '</div>' +
                    target +
                '</div>' +
                '<div class="act-side">' +
                    '<div class="act-time">' + esc(_actTime(r.date)) + '</div>' +
                    (r.actorName ? '<div class="act-actor">' + esc(r.actorName) +
                        (r.actorSurface ? ' \u00b7 ' + esc(r.actorSurface) : '') + '</div>' : '') +
                '</div>' +
            '</div>';
        }).join('');
        list.scrollTop = 0;
    }

    var cnt  = document.getElementById('act-count');
    var pno  = document.getElementById('act-pageno');
    var prev = document.getElementById('act-prev');
    var next = document.getElementById('act-next');
    if (cnt)  cnt.textContent = res.total + ' entr' + (res.total === 1 ? 'y' : 'ies') +
                                (res.capped ? ' (most recent 600)' : '');
    if (pno)  pno.textContent = res.page + ' / ' + res.pages;
    if (prev) prev.disabled = res.page <= 1;
    if (next) next.disabled = res.page >= res.pages;
    _actState.page = res.page;
}

function _actTime(d) {
    if (!d) return '\u2014';
    var M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var h = d.getHours(), mm = d.getMinutes();
    return M[d.getMonth()] + ' ' + d.getDate() + ', ' +
           (h % 12 || 12) + ':' + (mm < 10 ? '0' + mm : mm) + ' ' + (h >= 12 ? 'PM' : 'AM');
}

/* ─── ARCHIVE (item level) ────────────────────────
   Archiving a module takes its whole subtree with it,
   under one group, so restoring brings the shape back. */
function ctxArchiveItem(itemType, id) {
    hideCtxMenu();
    var item = findItem(itemType, id);
    if (!item) return;

    var warn = (itemType !== 'file')
        ? '<p class="modal-body-text" style="color:var(--sub)">Everything inside it is archived too, ' +
          'and comes back together when you restore.</p>'
        : '';

    showModal(
        '<div class="modal-title"><i class="material-symbols-outlined" ' +
        'style="font-size:17px;color:var(--sub)">inventory_2</i>ARCHIVE</div>' +
        '<p class="modal-body-text">Move <strong>' + esc(item.name || 'Untitled') + '</strong> to the archive?</p>' +
        warn +
        '<p class="modal-body-text" style="color:var(--sub)">Nothing is deleted and nothing expires.</p>' +
        '<div class="modal-field-label">NOTE (OPTIONAL)</div>' +
        '<input class="modal-input" type="text" id="arc-why" maxlength="160" ' +
               'placeholder="Why are you shelving this?">' +
        '<div class="modal-footer">' +
        '<button class="modal-btn" onclick="closeModal()">CANCEL</button>' +
        '<button class="modal-btn primary" onclick="doArchiveItem(\'' + itemType + '\',\'' + id + '\')">ARCHIVE</button>' +
        '</div>', '440px'
    );
    var el = document.getElementById('arc-why');
    if (el) el.focus();
}

async function doArchiveItem(itemType, id) {
    var el   = document.getElementById('arc-why');
    var note = el ? el.value.trim() : '';
    closeModal();

    if (!window.ARCHIVE_FB) {
        alert('Archive is not loaded on this page yet.');
        return;
    }
    try {
        await window.ARCHIVE_FB.archiveItem(_viewProjectId, itemType, id, note);
    } catch (err) {
        alert('Could not archive: ' + (err && err.message ? err.message : 'unknown error'));
    }
}

/* ─── PROMOTE MODULE → PROJECT ────────────────────
   Modules only. The module leaves this project and
   becomes a top-level project; whatever was inside it
   lands at that project's root. The module shell is
   not kept — it IS the new project. */
function ctxPromoteModule(id) {
    hideCtxMenu();
    var m = findItem('module', id);
    if (!m) return;

    if (m.isSymlink) {
        showModal(
            '<div class="modal-title"><i class="fa-solid fa-code-branch" ' +
            'style="font-size:17px;color:var(--sub)"></i>PROMOTE TO PROJECT</div>' +
            '<p class="modal-body-text">This is a link to a module in another project, ' +
            'so there is nothing here to promote.</p>' +
            '<p class="modal-body-text" style="color:var(--sub)">Open the original and promote it there.</p>' +
            '<div class="modal-footer">' +
            '<button class="modal-btn" onclick="closeModal()">CLOSE</button>' +
            '</div>', '440px'
        );
        return;
    }

    var count = getDescendantCount(id, _contents);
    var name  = m.name || 'Untitled';

    showModal(
        '<div class="modal-title"><i class="fa-solid fa-arrow-up-from-bracket" ' +
        'style="font-size:16px;color:var(--sub)"></i>PROMOTE TO PROJECT</div>' +
        '<p class="modal-body-text">Turn <strong>' + esc(name) + '</strong> into a project of its own?</p>' +
        '<p class="modal-body-text" style="color:var(--sub)">' +
        'Everything inside it (' + count + (count === 1 ? ' item' : ' items') + ') moves across and sits at ' +
        'the new project\'s root. The module leaves <strong>' + esc(_projectName) + '</strong> — ' +
        'it becomes the project.</p>' +
        '<div class="modal-field-label">PROJECT NAME</div>' +
        '<input class="modal-input" type="text" id="promote-name" maxlength="80" ' +
               'value="' + esc(name) + '" ' +
               'onkeydown="if(event.key===\'Enter\')doPromoteModule(\'' + id + '\')">' +
        '<div class="modal-field-label">DESCRIPTION (OPTIONAL)</div>' +
        '<input class="modal-input" type="text" id="promote-desc" maxlength="160" ' +
               'value="' + esc(m.description || '') + '">' +
        '<div class="modal-error-msg" id="promote-error" style="display:none"></div>' +
        '<div class="modal-footer">' +
        '<button class="modal-btn" onclick="closeModal()">CANCEL</button>' +
        '<button class="modal-btn primary" id="promote-go" ' +
                'onclick="doPromoteModule(\'' + id + '\')">PROMOTE</button>' +
        '</div>', '460px'
    );

    var el = document.getElementById('promote-name');
    if (el) { el.focus(); el.select(); }
}

async function doPromoteModule(id) {
    var nameEl = document.getElementById('promote-name');
    var descEl = document.getElementById('promote-desc');
    var errEl  = document.getElementById('promote-error');
    var goBtn  = document.getElementById('promote-go');

    var name = nameEl ? nameEl.value.trim() : '';
    var desc = descEl ? descEl.value.trim() : '';

    function fail(msg) {
        if (nameEl) nameEl.classList.add('error');
        if (goBtn) { goBtn.disabled = false; goBtn.textContent = 'PROMOTE'; }
        if (!errEl) { alert(msg); return; }
        errEl.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i>' + esc(msg);
        errEl.style.display = 'flex';
    }

    if (!name) { fail('Give the new project a name.'); return; }

    /* The modal stays open until the write lands — a promote moves a
       whole subtree, and closing early would leave the grid mid-flight
       with nothing to say why. */
    if (goBtn) { goBtn.disabled = true; goBtn.textContent = 'PROMOTING…'; }
    if (errEl) errEl.style.display = 'none';
    if (nameEl) nameEl.classList.remove('error');

    var res;
    try {
        res = await window.PROJECT_FB.promoteModule(_viewProjectId, id, name, desc);
    } catch (err) {
        fail(err && err.message ? err.message : 'Could not promote this module.');
        return;
    }

    closeModal();
    window.location.href = 'Scribble-project.html?id=' + encodeURIComponent(res.projectId);
}

/* _findItem() lived here until 2026-09-17. It was findItem() written a
   second way — same lookup, same three pools — with one caller
   (ctxArchiveItem), while everything else in the file used findItem().
   Two names for one thing is how they drift apart. Now there is one. */


/* ─── SIDEBAR RECENT ──────────────────────────────
   Scoped to THIS project. _contents is already live in
   memory, so this costs no extra reads and refreshes
   itself whenever the grid does.
   To make it match the landing page's cross-project feed
   instead, swap the source for a global query — the
   render below doesn't care where the rows come from. */
var RECENT_MAX = 12;
var RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

/* Clear is keyed PER PROJECT — clearing Scribble's panel must not
   wipe See You Latte's. Display-only: nothing is written to Firebase
   and no file is touched, so an edit brings the row straight back. */
function recentClearKey() { return 'scribbleRecentClearedAt:' + (_viewProjectId || ''); }

function recentCutoff() {
    var cleared = parseInt(localStorage.getItem(recentClearKey()) || '0', 10) || 0;
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
        '<div class="ctx-item" onclick="refreshRecent()">' +
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
    localStorage.setItem(recentClearKey(), String(Date.now()));
    renderRecentPanel();
}

function refreshRecent() { hideCtxMenu(); renderRecentPanel(); }

/* Takes the FILE, not two timestamp fields — 2026-09-17. It used to be
   handed f.updatedAt and f.accessedAt and read .toDate() off each, so a
   file edited offline scored 0 and dropped out of Recent entirely: the
   one list you would most want it in. Mirrors laterOf() in
   js/scribble-recent.js, which was fixed for exactly this. */
function laterOfTs(f) {
    return Math.max(_ms(f, 'updatedAt'), _ms(f, 'accessedAt'));
}

function renderRecentPanel() {
    var el = document.getElementById('recent-list');
    if (!el) return;

    /* Bind once — the panel element persists across renders. */
    if (!el._ctxBound) {
        el.addEventListener('contextmenu', showRecentCtxMenu);
        el._ctxBound = true;
    }

    var cutoff = recentCutoff();

    var rows = (_contents.files || [])
        .map(function(f) {
            return {
                id: f.id,
                name: f.name || 'Untitled',
                type: f.type || '',
                isSymlink: f.isSymlink === true,
                ms: laterOfTs(f)
            };
        })
        .filter(function(r) { return r.ms > cutoff; })
        .sort(function(a, b) { return b.ms - a.ms; })
        .slice(0, RECENT_MAX);

    if (!rows.length) {
        el.innerHTML = '<div class="logs-empty">Nothing in the last 24 hours</div>';
        return;
    }

    el.innerHTML = rows.map(function(r) {
        var label = esc(r.name) + (r.type ? '.' + esc(r.type) : '');
        return '<div class="recent-row" title="Open ' + esc(r.name) + '" ' +
               'onclick="openFile(\'' + r.id + '\')">' +
               '<div class="recent-main">' +
                 '<div class="recent-name">' + label +
                   (r.isSymlink ? ' <i class="fa-solid fa-link recent-link"></i>' : '') +
                 '</div>' +
               '</div>' +
               '<div class="recent-time">' + recentAge(r.ms) + '</div>' +
               '</div>';
    }).join('');
}

setInterval(function() { renderRecentPanel(); }, 60 * 60 * 1000);

function recentAge(ms) {
    if (!ms) return '\u2014';
    var diff = Date.now() - ms;
    var mins = Math.floor(diff / 60000);
    var hrs  = Math.floor(diff / 3600000);
    var days = Math.floor(diff / 86400000);
    if (mins < 1)  return 'now';
    if (mins < 60) return mins + 'm';
    if (hrs  < 24) return hrs + 'h';
    if (days < 7)  return days + 'd';
    var d = new Date(ms);
    return (d.getMonth() + 1) + '/' + d.getDate();
}


function hideCtxMenu() {
    if (_activeCtxMenu) { _activeCtxMenu.remove(); _activeCtxMenu = null; }
}

/* ─── PIN ─── */
/* PORTAL FIX, 2026-09-17 — was _projectId. Inside a portal the item
   being pinned lives in _viewProjectId, so pinItem was calling
   updateDoc on a path that holds no such document. updateDoc REJECTS
   on a missing document, and scribble-db's queued() swallows that
   rejection into a console warning — so the pin silently did nothing
   and said nothing. Same story for rename, move, copy, merge and
   delete below; see viewProjectName() for the whole picture. */
function ctxPinItem(itemType, id) {
    hideCtxMenu();
    var item = findItem(itemType, id);
    if (!item) return;
    window.PROJECT_FB.pinItem(_viewProjectId, itemType, id, !item.pinned);
}

/* ─── DETAILS ─── */
function ctxViewContents(itemType, id) {
    hideCtxMenu();
    if (itemType !== 'file') {
        if (itemType === 'module')  openModule(id);
        if (itemType === 'section') openSection(id);
        return;
    }
    var item = findItem('file', id);
    // Symlink — show the original file's details instead of the empty pointer doc
    if (item && item.isSymlink && item.targetId) {
        var originalItem = findItem('file', item.targetId);
        if (originalItem) {
            openFileDetails(item.targetId);
            return;
        }
        // Original is in another project — fetch it directly
        if (item.targetProjectId && window.PROJECT_FB) {
            _openCrossProjectDetails(item);
            return;
        }
    }
    openFileDetails(id);
}

async function _openCrossProjectDetails(symlinkItem) {
    var targetPid = symlinkItem.targetProjectId;
    var targetId  = symlinkItem.targetId;

    // Show skeleton immediately
    var stub = {
        id: targetId, name: symlinkItem.name,
        type: symlinkItem.targetType || 'file',
        createdAt: null, updatedAt: null, content: '', size: 0
    };
    _showDetailsModal(stub, null, null, null, null, null);

    // Fetch the real file document + all supporting data in parallel
    var results = await Promise.all([
        window.SCRIBBLE_DB
            ? window.PROJECT_FB.getRawFileDoc(targetPid, targetId).catch(function() { return null; })
            : Promise.resolve(null),
        window.PROJECT_FB.getItemRecords(targetPid, 'file', targetId).catch(function() { return null; }),
        window.PROJECT_FB.getFileTags(targetPid, targetId).catch(function() { return []; }),
        window.PROJECT_FB.getFileSymlinks(targetPid, targetId).catch(function() { return []; }),
        window.EDITOR_FB ? window.EDITOR_FB.listVersions(targetId, targetPid).catch(function() { return []; }) : Promise.resolve([])
    ]);

    var fileDoc = results[0];
    var item = fileDoc
        ? Object.assign({ id: targetId }, fileDoc)
        : stub;

    _showDetailsModal(item, results[1], results[2], results[3], results[4], targetPid);
}

async function openFileDetails(fileId) {
    var item = findItem('file', fileId);
    if (!item) return;
    var pid = _viewProjectId;

    // Show modal immediately with skeleton
    _showDetailsModal(item, null, null, null, null, null);

    // Fetch all data in parallel
    var results = await Promise.all([
        window.PROJECT_FB.getItemRecords(pid, 'file', fileId).catch(function() { return null; }),
        window.PROJECT_FB.getFileTags(pid, fileId).catch(function() { return []; }),
        window.PROJECT_FB.getFileSymlinks(pid, fileId).catch(function() { return []; }),
        window.EDITOR_FB ? window.EDITOR_FB.listVersions(fileId, _viewProjectId).catch(function() { return []; }) : Promise.resolve([])
    ]);

    _showDetailsModal(item, results[0], results[1], results[2], results[3], pid);
}

function _showDetailsModal(item, records, tags, symlinks, versions, pid) {
    var M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    function fmtTs(ts) {
        if (!ts || !ts.toDate) return '—';
        var d = ts.toDate();
        return M[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear() +
               '  ' + d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
    }

    var loading = !records && !tags && !symlinks && !versions;

    // ── General ──
    var general =
        '<div class="det-section-label">GENERAL</div>' +
        '<div class="det-row"><span class="det-key">File Type</span><span class="det-val">' + esc((item.type || 'txt').toUpperCase()) + '</span></div>' +
        '<div class="det-row"><span class="det-key">Date Created</span><span class="det-val">' + fmtTs(item.createdAt) + '</span></div>' +
        '<div class="det-row"><span class="det-key">Date Updated</span><span class="det-val">' + fmtTs(item.updatedAt) + '</span></div>';

    // ── Statistics ──
    var content = item.content || '';
    var plainText = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g,' ').trim();
    var wordCount = plainText ? plainText.split(/\s+/).filter(Boolean).length : 0;
    var charCount = plainText.length;
    var lineCount = content ? content.split('\n').length : 0;
    var sizeBytes = item.size || new Blob([content]).size || 0;

    var stats =
        '<div class="det-section-label">STATISTICS</div>' +
        '<div class="det-row"><span class="det-key">Size</span><span class="det-val">' + (sizeBytes ? formatSize(sizeBytes) : '—') + '</span></div>' +
        '<div class="det-row"><span class="det-key">Word Count</span><span class="det-val">' + wordCount.toLocaleString() + '</span></div>' +
        '<div class="det-row"><span class="det-key">Character Count</span><span class="det-val">' + charCount.toLocaleString() + '</span></div>' +
        '<div class="det-row"><span class="det-key">Line Count</span><span class="det-val">' + lineCount.toLocaleString() + '</span></div>';

    // ── File Versions ──
    var versHtml;
    if (loading) {
        versHtml = '<div class="det-loading">Loading…</div>';
    } else {
        var vCount = versions ? versions.length : 0;
        var latest = versions && versions[0];
        versHtml =
            '<div class="det-row"><span class="det-key">Saved Versions</span><span class="det-val">' + vCount + '</span></div>' +
            (latest ? '<div class="det-row"><span class="det-key">Latest</span><span class="det-val">' + esc(latest.versionName || '—') + '</span></div>' +
                      '<div class="det-row"><span class="det-key">Latest Date</span><span class="det-val">' + fmtTs(latest.savedAt) + '</span></div>' : '');
    }
    var fileVersions = '<div class="det-section-label">FILE VERSIONS</div>' + versHtml;

    // ── Records ──
    var recHtml;
    if (loading) {
        recHtml = '<div class="det-loading">Loading…</div>';
    } else {
        var r = records || {};
        var cloudLink = r.onedrive || r.cloud || '';
        var hdPath    = r.hdPath || '';
        var custLinks = r.customLinks || [];
        recHtml =
            '<div class="det-row"><span class="det-key">Cloud Link</span><span class="det-val det-link">' +
                (cloudLink ? '<a href="' + esc(cloudLink) + '" target="_blank">' + esc(_truncUrl(cloudLink)) + '</a>' : '—') +
            '</span></div>' +
            '<div class="det-row"><span class="det-key">Hard Drive Path</span><span class="det-val">' + esc(hdPath || '—') + '</span></div>' +
            custLinks.map(function(l) {
                return '<div class="det-row"><span class="det-key">' + esc(l.label || 'Link') + '</span>' +
                    '<span class="det-val det-link"><a href="' + esc(l.url || '') + '" target="_blank">' + esc(_truncUrl(l.url || '')) + '</a></span></div>';
            }).join('');
    }
    var recordsHtml = '<div class="det-section-label">RECORDS</div>' + recHtml;

    // ── Symlinks ──
    var symHtml;
    if (loading) {
        symHtml = '<div class="det-loading">Loading…</div>';
    } else {
        var sl = symlinks || [];
        symHtml =
            '<div class="det-row"><span class="det-key">Number of Links</span><span class="det-val">' + sl.length + '</span></div>' +
            sl.map(function(s) {
                // _hostProjectName = the project where this symlink lives
                var proj = s._hostProjectName || s.targetProjectName || '—';
                // Resolve parent name from loaded contents if available
                var parentName = '';
                if (s.parentId) {
                    var parentMod = _contents.modules.find(function(m) { return m.id === s.parentId; });
                    var parentSec = _contents.sections.find(function(s2) { return s2.id === s.parentId; });
                    parentName = parentMod ? parentMod.name : (parentSec ? parentSec.name : '');
                }
                var parentLabel = parentName ? ' / ' + parentName : '';
                return '<div class="det-row det-sym-row">' +
                    '<span class="det-key">' + esc(s.name || 'Linked File') + '</span>' +
                    '<span class="det-val"><span class="det-sym-proj">' + esc(proj) + parentLabel + '</span></span>' +
                    '</div>';
            }).join('');
    }
    var symlinksHtml = '<div class="det-section-label">SYMLINKS</div>' + symHtml;

    // ── Tags ──
    var tagsArr = loading ? [] : (tags || []);
    var tagsHtml =
        '<div class="det-section-label">TAGS<span class="det-section-hint">Used for search &amp; categorization</span></div>' +
        '<div class="det-tags-wrap" id="det-tags-wrap">' +
            tagsArr.map(function(t) {
                return '<span class="det-tag">' + esc(t) +
                    (pid ? '<i class="fa-solid fa-xmark det-tag-del" onclick="detRemoveTag(\'' + esc(t).replace(/'/g,"\\'") + '\',\'' + item.id + '\',\'' + pid + '\')"></i>' : '') +
                '</span>';
            }).join('') +
            '<input class="det-tag-input" id="det-tag-input" type="text" placeholder="Add tag…" maxlength="40"' +
        ' onkeydown="if(event.key===\'Enter\'||event.key===\',\'){event.preventDefault();detAddTag(\'' + item.id + '\',\'' + pid + '\')}">' +
        '</div>';

    // Seed the live tags array for add/remove operations
    if (!loading) { _detTagsCurrent = tagsArr.slice(); }

    var html =
        '<div class="det-header">' +
            '<i class="fa-solid fa-circle-info"></i>' +
            '<span class="det-title">' + esc(item.name) + ' — Details</span>' +
            '<button class="version-history-close" onclick="closeDetailsModal()"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="det-body">' +
            general + stats + fileVersions + recordsHtml + symlinksHtml + tagsHtml +
        '</div>' +
        '<div class="det-footer">' +
            '<button class="modal-btn" onclick="closeDetailsModal()">CLOSE</button>' +
        '</div>';

    var backdrop = document.getElementById('details-backdrop');
    var box = document.getElementById('details-modal-box');
    if (backdrop && box) {
        box.innerHTML = html;
        backdrop.style.display = 'flex';
    }
}

var _detTagsFileId = null;
var _detTagsPid    = null;
var _detTagsCurrent = [];

function detAddTag(fileId, pid) {
    var inp = document.getElementById('det-tag-input');
    var val = inp ? inp.value.trim().replace(/,/g,'') : '';
    if (!val) return;
    _detTagsCurrent = _detTagsCurrent.filter(function(t) { return t !== val; });
    _detTagsCurrent.push(val);
    if (inp) inp.value = '';
    if (window.PROJECT_FB) window.PROJECT_FB.saveFileTags(pid, fileId, _detTagsCurrent);
    _refreshDetailsTags(fileId, pid);
}

function detRemoveTag(tag, fileId, pid) {
    _detTagsCurrent = _detTagsCurrent.filter(function(t) { return t !== tag; });
    if (window.PROJECT_FB) window.PROJECT_FB.saveFileTags(pid, fileId, _detTagsCurrent);
    _refreshDetailsTags(fileId, pid);
}

function _refreshDetailsTags(fileId, pid) {
    var wrap = document.getElementById('det-tags-wrap');
    if (!wrap) return;
    wrap.innerHTML =
        _detTagsCurrent.map(function(t) {
            return '<span class="det-tag">' + esc(t) +
                '<i class="fa-solid fa-xmark det-tag-del" onclick="detRemoveTag(\'' + esc(t).replace(/'/g,"\\'") + '\',\'' + fileId + '\',\'' + pid + '\')"></i>' +
            '</span>';
        }).join('') +
        '<input class="det-tag-input" id="det-tag-input" type="text" placeholder="Add tag…" maxlength="40"' +
        ' onkeydown="if(event.key===\'Enter\'||event.key===\',\'){event.preventDefault();detAddTag(\'' + fileId + '\',\'' + pid + '\')}">';
    setTimeout(function() {
        var inp = document.getElementById('det-tag-input');
        if (inp) inp.focus();
    }, 20);
}

function closeDetailsModal() {
    var backdrop = document.getElementById('details-backdrop');
    if (backdrop) backdrop.style.display = 'none';
}

function _truncUrl(url) {
    return url && url.length > 38 ? url.slice(0, 35) + '…' : (url || '');
}

/* ─── EXPORT ─── */
function ctxExportItem(itemType, id) {
    hideCtxMenu();
    if (itemType !== 'file') return;
    var item = findItem(itemType, id);
    if (!item) return;
    if (window.SCRIBBLE_EXPORT) window.SCRIBBLE_EXPORT.openExportModal(item);
}

/* ─── RENAME ─── */
function ctxRenameItem(itemType, id) {
    hideCtxMenu();
    var item = findItem(itemType, id);
    if (!item) return;
    var labels = { module: 'Module Name', section: 'Section Name', file: 'File Name' };
    showModal(
        '<div class="modal-title"><i class="fa-regular fa-pen-to-square" style="font-size:18px;color:var(--sub)"></i>Rename</div>' +
        '<div class="modal-field-label">' + (labels[itemType] || 'Name') + '</div>' +
        '<input class="modal-input" type="text" id="rename-input" maxlength="80" value="' + esc(item.name) + '"' +
        ' onkeydown="if(event.key===\'Enter\')submitRename(\'' + itemType + '\',\'' + id + '\')">' +
        '<div class="modal-footer">' +
        '<button class="modal-btn primary" onclick="submitRename(\'' + itemType + '\',\'' + id + '\')">SAVE</button>' +
        '<button class="modal-btn" onclick="closeModal()">CANCEL</button></div>',
        '400px'
    );
    setTimeout(function() { var el = document.getElementById('rename-input'); if (el) { el.focus(); el.select(); } }, 50);
}

async function submitRename(itemType, id) {
    var el      = document.getElementById('rename-input');
    var newName = el ? el.value.trim() : '';
    if (!newName) { if (el) { el.classList.add('error'); el.focus(); } return; }
    var item    = findItem(itemType, id);
    var oldName = item ? item.name : '';
    _clearModalError(el);

    if (newName !== oldName) {
        /* PORTAL FIX, 2026-09-17 — both this check and the rename below
           were _projectId. In a portal the clash check looked in the
           wrong project (so it never found a real clash) and the rename
           itself wrote nowhere. */
        var clash = await window.PROJECT_FB.findItemClash(
            _viewProjectId, itemType, item ? (item.parentId || null) : null,
            newName, item ? item.type : null, id);
        if (clash) {
            window.showNameClash({
                kind: itemType, typed: newName, clash: clash,
                onEdit: function () {
                    var again = document.getElementById('rename-input');
                    if (again) { again.classList.add('error'); again.focus(); again.select(); }
                }
            });
            return;
        }
    }

    closeModal();
    try {
        await window.PROJECT_FB.renameItem(_viewProjectId, itemType, id, oldName, newName);
    } catch (err) {
        if (err && err.code === 'duplicate-name' && err.clash) {
            window.showNameClash({ kind: itemType, typed: newName, clash: err.clash });
        } else {
            alert('Could not rename that item.');
        }
    }
}

/* ─── DUPLICATE ─── */
function ctxDuplicateItem(itemType, id) {
    hideCtxMenu();
    var item = findItem(itemType, id);
    if (!item) return;
    showModal(
        '<div style="text-align:center">' +
        '<span class="material-symbols-outlined" style="font-size:28px;color:#C8C6C3;display:block;margin:0 auto 10px">content_copy</span>' +
        '<p class="modal-body-text">Duplicate <strong>' + esc(item.name) + '</strong>?</p>' +
        '<p style="margin:4px 0 0;font-size:8.5px;color:#B0AEAB;letter-spacing:0.3px">A copy will be created in the same folder.</p>' +
        '<div class="modal-footer">' +
        '<button class="modal-btn primary" onclick="doDuplicateItem(\'' + itemType + '\',\'' + id + '\')">DUPLICATE</button>' +
        '<button class="modal-btn" onclick="closeModal()">CANCEL</button></div></div>',
        '360px'
    );
}

async function doDuplicateItem(itemType, id) {
    closeModal();
    var item = findItem(itemType, id);
    if (!item) return;
    try {
        await window.PROJECT_FB.duplicateItem(_viewProjectId, itemType, id, item, _currentParentId);
    } catch (err) {
        _showActionClash(err, itemType, 'Could not duplicate that item.');
    }
}

/*
 * Shared refusal handler for move / copy / duplicate / link.
 * Those have no input field to send you back to — you dragged
 * something, or finished a wizard — so the dialog just explains
 * where the clash is and closes.
 */
function _showActionClash(err, itemType, fallbackMsg) {
    if (err && err.code === 'duplicate-name' && err.clash) {
        window.showNameClash({
            kind:    itemType,
            typed:   err.clash.name,
            clash:   err.clash,
            okLabel: 'Got it',
            advice:  err.clash.status === 'live'
                ? 'Rename one of them, or pick a different destination.'
                : 'Rename this one, or clear that copy out of the way first.'
        });
        return;
    }
    /* "Already linked into this folder" is a duplicate refusal with no
       clash attached — it is about the POINTER, not a name. Its own
       sentence is the useful thing to show. */
    if (err && err.code === 'duplicate-name') { alert(err.message); return; }
    alert(fallbackMsg);
}

/* ─── MOVE WIZARD ─── */
var _moveCtx = {
    itemType: '', itemId: '', item: null,
    mode: 'move',
    step: 1, totalSteps: 1,
    targetProjectId: '', targetProjectName: '',
    targetModuleId: null, targetModuleName: '',
    targetSectionId: null
};

function ctxMoveItem(itemType, id) {
    hideCtxMenu();
    var item = findItem(itemType, id);
    if (!item) return;
    _moveCtx = {
        itemType:          itemType,
        itemId:            id,
        item:              item,
        mode:              'move',
        step:              1,
        totalSteps:        itemType === 'module' ? 1 : itemType === 'section' ? 2 : 3,
        /* PORTAL FIX, 2026-09-17 — the wizard opens on "the project you
           are in", which inside a portal is _viewProjectId, not the URL's. */
        targetProjectId:   _viewProjectId,
        targetProjectName: viewProjectName(),
        targetModuleId:    null,
        targetModuleName:  '',
        targetSectionId:   null
    };
    renderMoveModal();
    loadMoveStep1();
}

function ctxCopyItem(itemType, id) {
    hideCtxMenu();
    var item = findItem(itemType, id);
    if (!item) return;
    _moveCtx = {
        itemType:          itemType,
        itemId:            id,
        item:              item,
        mode:              'copy',
        step:              1,
        totalSteps:        itemType === 'module' ? 1 : itemType === 'section' ? 2 : 3,
        /* PORTAL FIX, 2026-09-17 — see ctxMoveItem. */
        targetProjectId:   _viewProjectId,
        targetProjectName: viewProjectName(),
        targetModuleId:    null,
        targetModuleName:  '',
        targetSectionId:   null
    };
    renderCopyModal();
    loadMoveStep1();
}

/* ─── LINK WIZARD ─── */
function ctxLinkItem(itemType, id) {
    hideCtxMenu();
    var item = findItem(itemType, id);
    if (!item) return;
    _moveCtx = {
        itemType:          itemType,
        itemId:            id,
        item:              item,
        mode:              'link',
        step:              1,
        totalSteps:        itemType === 'module' ? 1 : itemType === 'section' ? 2 : 3,
        /* PORTAL FIX, 2026-09-17 — see ctxMoveItem. */
        targetProjectId:   _viewProjectId,
        targetProjectName: viewProjectName(),
        targetModuleId:    null,
        targetModuleName:  '',
        targetSectionId:   null
    };
    renderLinkModal();
    loadMoveStep1();
}

function renderLinkModal() {
    var typeLabel  = { module: 'Module', section: 'Section', file: 'File' }[_moveCtx.itemType] || '';
    var totalSteps = _moveCtx.totalSteps;
    var dots = '';
    for (var i = 0; i < totalSteps; i++) {
        dots += '<div class="link-step-dot' + (i === 0 ? ' active' : '') + '" id="mvdot-' + i + '"></div>';
    }
    showModal(
        '<div class="link-modal-header">' +
        '<i class="fa-solid fa-code-branch link-modal-icon"></i>' +
        '<div class="link-modal-title">SYMLINK ' + typeLabel.toUpperCase() + '</div>' +
        '<div class="link-modal-item-name">' + esc(_moveCtx.item.name) + '</div>' +
        '</div>' +
        '<div class="link-info-strip">' +
        '<i class="fa-solid fa-circle-info"></i>' +
        '<span>A symlink will appear at your chosen destination. Opening it enters the original contents directly — any changes made inside affect the original.</span>' +
        '</div>' +
        '<div class="link-step-track">' +
        '<div class="move-step-dots">' + dots + '</div>' +
        '<div class="link-step-label" id="mv-step-label">Choose Project</div>' +
        '</div>' +
        '<div class="move-step-content" id="mv-content">' +
        '<div class="move-loading">Loading\u2026</div></div>' +
        '<div class="modal-footer">' +
        '<button class="modal-btn" id="mv-back" style="display:none" onclick="movePrevStep()">BACK</button>' +
        '<button class="modal-btn link-action" id="mv-next" onclick="moveNextStep()" disabled>' +
        (totalSteps === 1 ? 'LINK HERE' : 'NEXT') + '</button>' +
        '<button class="modal-btn" onclick="closeModal()">CANCEL</button>' +
        '</div>',
        '500px'
    );
}

/* ─── GO TO ORIGINAL ─── */
function ctxGoToOriginal(itemType, id) {
    hideCtxMenu();
    var item = findItem(itemType, id);
    if (!item || !item.isSymlink) return;
    if (item.targetProjectId === _projectId) {
        navigateTo(-1); // same project — go to root where original lives
    } else {
        window.location.href = 'Scribble-project.html?id=' + item.targetProjectId;
    }
}

/* ─── DELETE SYMLINK (hard delete) ─── */
function ctxDeleteSymlink(itemType, id) {
    hideCtxMenu();
    var item = findItem(itemType, id);
    if (!item) return;
    showModal(
        '<div style="text-align:center">' +
        '<i class="fa-solid fa-link" style="font-size:26px;color:#C8C6C3;display:block;margin:0 auto 12px"></i>' +
        '<p class="modal-body-text">Permanently delete the link to <strong>' + esc(item.name) + '</strong>?</p>' +
        '<p style="margin:8px 0 0;font-size:8.5px;color:#B0AEAB;letter-spacing:0.3px">' +
        'The original ' + itemType + ' will not be affected.</p>' +
        '<div class="modal-footer">' +
        '<button class="modal-btn danger" onclick="doDeleteSymlink(\'' + itemType + '\',\'' + id + '\')">DELETE PERMANENTLY</button>' +
        '<button class="modal-btn" onclick="closeModal()">CANCEL</button></div></div>',
        '400px'
    );
}

async function doDeleteSymlink(itemType, id) {
    closeModal();
    await window.PROJECT_FB.deleteSymlink(_viewProjectId, itemType, id);
}

/* ═══════════════════════════════════════════════════
   DRAG & DROP ENGINE
═══════════════════════════════════════════════════ */
function onItemDragStart(e, itemType, id) {
    /* Don't hijack clicks on buttons or interactive children */
    if (e.target.closest('button, a, input, select')) { e.preventDefault(); return; }
    var item = findItem(itemType, id);
    if (!item) { e.preventDefault(); return; }

    _dragCtx = { active: true, itemType: itemType, itemId: id, item: item, pendingParentId: null };
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData('text/plain', id); // required for Firefox

    /* Slight delay so browser captures card before we dim it */
    setTimeout(function() {
        var el = getDragCardEl(itemType, id);
        if (el) el.classList.add('drag-dragging');
        highlightDragTargets(itemType, id);
        showRootDropStrip();
    }, 0);
}

function onItemDragEnd(e) {
    document.querySelectorAll('.drag-dragging, .drag-valid, .drag-invalid, .drag-over')
        .forEach(function(el) {
            el.classList.remove('drag-dragging', 'drag-valid', 'drag-invalid', 'drag-over');
        });
    hideRootDropStrip();
    _dragCtx.active = false;
}

function onItemDragOver(e, targetType, targetId) {
    if (!_dragCtx.active) return;
    if (!isValidDrop(_dragCtx.itemType, targetType, _dragCtx.itemId, targetId)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    var el = getDragCardEl(targetType, targetId);
    if (el) el.classList.add('drag-over');
}

function onItemDragLeave(e, targetType, targetId) {
    var el = getDragCardEl(targetType, targetId);
    if (el) el.classList.remove('drag-over');
}

function onItemDrop(e, targetType, targetId) {
    e.preventDefault();
    if (!_dragCtx.active) return;
    if (!isValidDrop(_dragCtx.itemType, targetType, _dragCtx.itemId, targetId)) return;
    var el = getDragCardEl(targetType, targetId);
    if (el) el.classList.remove('drag-over');
    var target = targetType === 'module'
        ? _contents.modules.find(function(x) { return x.id === targetId; })
        : _contents.sections.find(function(x) { return x.id === targetId; });
    _dragCtx.pendingParentId = targetId;
    onItemDragEnd(e);
    showDragConfirmModal(target ? target.name : targetId);
}

/* ── Root drop strip ── */
function showRootDropStrip() {
    hideRootDropStrip();
    var grid = document.getElementById('project-grid');
    if (!grid) return;
    var levelLabel = _path.length > 0
        ? 'Drop into ' + esc(_path[_path.length - 1].name)
        : 'Drop at project root';
    var strip = document.createElement('div');
    strip.id        = 'root-drop-strip';
    strip.className = 'root-drop-strip';
    strip.innerHTML = '<i class="fa-solid fa-arrow-down-to-line"></i> ' + levelLabel;
    strip.addEventListener('dragover', function(e) {
        e.preventDefault();
        strip.classList.add('drag-over');
    });
    strip.addEventListener('dragleave', function() {
        strip.classList.remove('drag-over');
    });
    strip.addEventListener('drop', function(e) {
        e.preventDefault();
        _dragCtx.pendingParentId = _currentParentId;
        var label = _path.length > 0 ? _path[_path.length - 1].name : 'project root';
        onItemDragEnd(e);
        showDragConfirmModal(label);
    });
    grid.appendChild(strip);
}

function hideRootDropStrip() {
    var s = document.getElementById('root-drop-strip');
    if (s) s.remove();
}

/* ── Helpers ── */
function getDragCardEl(itemType, id) {
    if (itemType === 'module')  return document.getElementById('mc-' + id);
    if (itemType === 'section') return document.getElementById('sc-' + id);
    if (itemType === 'file')    return document.getElementById('fw-' + id);
    return null;
}

function isValidDrop(dragType, targetType, dragId, targetId) {
    if (dragId === targetId)      return false; // Can't drop on self
    if (targetType === 'file')    return false; // Files are never drop targets
    if (dragType === 'module')    return false; // Modules only go to root strip
    if (dragType === 'section' && targetType === 'section') return false;
    return true;
}

function highlightDragTargets(dragType, dragId) {
    _contents.modules.forEach(function(m) {
        var el = document.getElementById('mc-' + m.id);
        if (!el) return;
        el.classList.add(isValidDrop(dragType, 'module', dragId, m.id) ? 'drag-valid' : 'drag-invalid');
    });
    _contents.sections.forEach(function(s) {
        var el = document.getElementById('sc-' + s.id);
        if (!el) return;
        el.classList.add(isValidDrop(dragType, 'section', dragId, s.id) ? 'drag-valid' : 'drag-invalid');
    });
    if (dragType !== 'file') {
        _contents.files.forEach(function(f) {
            var el = document.getElementById('fw-' + f.id);
            if (el) el.classList.add('drag-invalid');
        });
    }
}

/* ── Confirm modal ── */
function showDragConfirmModal(targetLabel) {
    if (!_dragCtx.item) return;
    showModal(
        '<div style="text-align:center;padding:4px 0 0">' +
        '<i class="fa-solid fa-hand-pointer" style="font-size:22px;color:var(--sub);display:block;margin:0 auto 12px"></i>' +
        '<p class="modal-body-text">Drop <strong>' + esc(_dragCtx.item.name) + '</strong></p>' +
        '<p style="margin:5px 0 0;font-size:9.5px;color:var(--sub);letter-spacing:0.3px">' +
        'into <strong>' + esc(targetLabel) + '</strong></p>' +
        '<div class="drag-confirm-actions">' +
        '<button class="modal-btn primary" onclick="doDragAction(\'move\')">MOVE HERE</button>' +
        '<button class="modal-btn copy-action" onclick="doDragAction(\'copy\')">COPY HERE</button>' +
        '<button class="modal-btn" onclick="closeModal()">CANCEL</button>' +
        '</div></div>',
        '380px'
    );
}

async function doDragAction(mode) {
    closeModal();
    var ctx = _dragCtx;
    if (!ctx.item) return;
    try {
        if (mode === 'move') {
            await window.PROJECT_FB.moveItem(
                _viewProjectId, ctx.itemType, ctx.itemId,
                _viewProjectId, ctx.pendingParentId
            );
        } else {
            await window.PROJECT_FB.copyItem(
                _viewProjectId, ctx.itemType, ctx.itemId,
                _viewProjectId, ctx.pendingParentId
            );
        }
    } catch (err) {
        _showActionClash(err, ctx.itemType,
            mode === 'move' ? 'Could not move that item.' : 'Could not copy that item.');
    }
    _dragCtx = { active: false, itemType: '', itemId: '', item: null, pendingParentId: null };
}

function renderMoveModal() {
    var typeLabel  = { module: 'Module', section: 'Section', file: 'File' }[_moveCtx.itemType] || '';
    var modeLabel  = _moveCtx.mode === 'copy' ? 'COPY' : 'MOVE';
    var modeIcon   = _moveCtx.mode === 'copy'
        ? 'fa-regular fa-clone'
        : 'fa-solid fa-arrow-right-arrow-left';
    var totalSteps = _moveCtx.totalSteps;
    var dots = '';
    for (var i = 0; i < totalSteps; i++) {
        dots += '<div class="move-step-dot' + (i === 0 ? ' active' : '') + '" id="mvdot-' + i + '"></div>';
    }
    showModal(
        '<div class="move-modal-header">' +
        '<i class="' + modeIcon + ' move-modal-icon"></i>' +
        '<div>' +
        '<div class="move-modal-title">' + modeLabel + ' ' + typeLabel.toUpperCase() + '</div>' +
        '<div class="move-modal-item-name">' + esc(_moveCtx.item.name) + '</div>' +
        '</div></div>' +
        '<div class="move-step-track">' +
        '<div class="move-step-dots">' + dots + '</div>' +
        '<div class="move-step-label" id="mv-step-label">Choose Project</div>' +
        '</div>' +
        '<div class="move-step-content" id="mv-content">' +
        '<div class="move-loading">Loading\u2026</div></div>' +
        '<div class="modal-footer" id="mv-footer">' +
        '<button class="modal-btn" id="mv-back" style="display:none" onclick="movePrevStep()">BACK</button>' +
        '<button class="modal-btn primary" id="mv-next" onclick="moveNextStep()" disabled>' +
        (totalSteps === 1 ? modeLabel + ' HERE' : 'NEXT') + '</button>' +
        '<button class="modal-btn" onclick="closeModal()">CANCEL</button>' +
        '</div>',
        '500px'
    );
}

function renderCopyModal() {
    var typeLabel  = { module: 'Module', section: 'Section', file: 'File' }[_moveCtx.itemType] || '';
    var totalSteps = _moveCtx.totalSteps;
    var dots = '';
    for (var i = 0; i < totalSteps; i++) {
        dots += '<div class="copy-step-dot' + (i === 0 ? ' active' : '') + '" id="mvdot-' + i + '"></div>';
    }
    showModal(
        /* ── Header ── */
        '<div class="copy-modal-header">' +
        '<i class="fa-regular fa-clone copy-modal-icon"></i>' +
        '<div class="copy-modal-title">COPY ' + typeLabel.toUpperCase() + '</div>' +
        '<div class="copy-modal-item-name">' + esc(_moveCtx.item.name) + '</div>' +
        '</div>' +

        /* ── Info strip ── */
        '<div class="copy-info-strip">' +
        '<i class="fa-solid fa-circle-info"></i>' +
        '<span>The original stays exactly where it is. A full copy — including all nested contents — will be created at your chosen destination.</span>' +
        '</div>' +

        /* ── Step track ── */
        '<div class="copy-step-track">' +
        '<div class="move-step-dots">' + dots + '</div>' +
        '<div class="copy-step-label" id="mv-step-label">Choose Project</div>' +
        '</div>' +

        /* ── Content ── */
        '<div class="move-step-content" id="mv-content">' +
        '<div class="move-loading">Loading\u2026</div></div>' +

        /* ── Footer ── */
        '<div class="modal-footer">' +
        '<button class="modal-btn" id="mv-back" style="display:none" onclick="movePrevStep()">BACK</button>' +
        '<button class="modal-btn copy-action" id="mv-next" onclick="moveNextStep()" disabled>' +
        (totalSteps === 1 ? 'COPY HERE' : 'NEXT') + '</button>' +
        '<button class="modal-btn" onclick="closeModal()">CANCEL</button>' +
        '</div>',
        '500px'
    );
}

/* ── Step 1: Pick Project ── */
async function loadMoveStep1() {
    setMoveStepUI(1, 'Choose Project');
    var content = document.getElementById('mv-content');
    if (!content) return;
    content.innerHTML = '<div class="move-loading">Loading projects\u2026</div>';

    var projects = await window.PROJECT_FB.getAllProjects();

    /* PORTAL FIX, 2026-09-17 — "current" and the auto-selection below both
       compared against _projectId, so inside a portal the wizard tagged the
       URL's project as the one you were in and pre-selected it. Moving
       something then defaulted to a destination you were not looking at. */
    var html = '<div class="move-pick-label">Destination project</div><div class="move-list" id="mv-proj-list">';
    projects.forEach(function(p) {
        var isCurrent = p.id === _viewProjectId;
        html += '<div class="move-list-item' + (isCurrent ? ' is-current' : '') +
            '" id="mvli-' + p.id + '" onclick="selectMoveProject(\'' + p.id + '\',\'' + esc(p.name) + '\')">' +
            '<span class="material-symbols-outlined" style="font-size:14px;color:var(--sub);flex-shrink:0">deployed_code</span>' +
            '<span>' + esc(p.name) + '</span>' +
            (isCurrent ? '<span class="move-current-tag">current</span>' : '') +
            '</div>';
    });
    html += '</div>';
    content.innerHTML = html;

    /* Auto-select current project so MOVE HERE is always available */
    selectMoveProject(_viewProjectId, viewProjectName());
}

function selectMoveProject(pid, name) {
    _moveCtx.targetProjectId   = pid;
    _moveCtx.targetProjectName = name;
    _moveCtx.targetModuleId    = null;
    _moveCtx.targetSectionId   = null;
    highlightMoveItem('mv-proj-list', 'mvli-' + pid);
    enableMoveNext(_moveCtx.totalSteps === 1 ? moveFinalLabel() : 'NEXT');
}

/* ── Step 2: Pick Module ── */
async function loadMoveStep2() {
    setMoveStepUI(2, 'Choose Module');
    var content = document.getElementById('mv-content');
    if (!content) return;
    content.innerHTML = '<div class="move-loading">Loading modules\u2026</div>';

    var modules = await window.PROJECT_FB.getAllProjectModules(_moveCtx.targetProjectId);

    var html = '<div class="move-pick-label">Module <span class="move-pick-opt">or place at project root</span></div>' +
        '<div class="move-list" id="mv-mod-list">' +
        '<div class="move-list-item move-none-item selected" id="mvli-nomod" onclick="selectMoveModule(null,\'\')">' +
        '<i class="fa-regular fa-folder-open" style="font-size:12px;color:var(--sub);flex-shrink:0"></i>' +
        '<span>No module \u2014 project root</span></div>';

    modules.forEach(function(m) {
        /* Skip self if moving a module within same project */
        if (_moveCtx.itemType === 'module' && m.id === _moveCtx.itemId) return;
        html += '<div class="move-list-item" id="mvli-' + m.id +
            '" onclick="selectMoveModule(\'' + m.id + '\',\'' + esc(m.name) + '\')">' +
            '<i class="fa-solid fa-box" style="font-size:11px;color:var(--sub);flex-shrink:0"></i>' +
            '<span>' + esc(m.name) + '</span></div>';
    });
    html += '</div>';
    content.innerHTML = html;

    /* Default: no module (root) */
    selectMoveModule(null, '');
}

function selectMoveModule(mid, name) {
    _moveCtx.targetModuleId   = mid;
    _moveCtx.targetModuleName = name;
    _moveCtx.targetSectionId  = null;
    highlightMoveItem('mv-mod-list', mid ? ('mvli-' + mid) : 'mvli-nomod');
    enableMoveNext(_moveCtx.totalSteps === 2 ? moveFinalLabel() : 'NEXT');
}

/* ── Step 3: Pick Section ── */
async function loadMoveStep3() {
    setMoveStepUI(3, 'Choose Section');
    var content = document.getElementById('mv-content');
    if (!content) return;
    content.innerHTML = '<div class="move-loading">Loading sections\u2026</div>';

    var sections = await window.PROJECT_FB.getAllProjectSections(
        _moveCtx.targetProjectId,
        _moveCtx.targetModuleId
    );

    var rootLabel = _moveCtx.targetModuleId
        ? 'directly in ' + esc(_moveCtx.targetModuleName)
        : 'project root';

    var html = '<div class="move-pick-label">Section <span class="move-pick-opt">or place in ' + rootLabel + '</span></div>' +
        '<div class="move-list" id="mv-sec-list">' +
        '<div class="move-list-item move-none-item selected" id="mvli-nosec" onclick="selectMoveSection(null)">' +
        '<i class="fa-regular fa-folder-open" style="font-size:12px;color:var(--sub);flex-shrink:0"></i>' +
        '<span>No section \u2014 ' + rootLabel + '</span></div>';

    sections.forEach(function(s) {
        if (_moveCtx.itemType === 'section' && s.id === _moveCtx.itemId) return;
        html += '<div class="move-list-item" id="mvli-' + s.id +
            '" onclick="selectMoveSection(\'' + s.id + '\')">' +
            '<i class="fa-solid fa-folder" style="font-size:11px;color:var(--sub);flex-shrink:0"></i>' +
            '<span>' + esc(s.name) + '</span></div>';
    });
    html += '</div>';
    content.innerHTML = html;

    selectMoveSection(null);
}

function selectMoveSection(sid) {
    _moveCtx.targetSectionId = sid;
    highlightMoveItem('mv-sec-list', sid ? ('mvli-' + sid) : 'mvli-nosec');
    enableMoveNext(moveFinalLabel());
}

/* ── Wizard navigation ── */
function moveNextStep() {
    if (_moveCtx.step < _moveCtx.totalSteps) {
        _moveCtx.step++;
        if (_moveCtx.step === 2) loadMoveStep2();
        if (_moveCtx.step === 3) loadMoveStep3();
        var back = document.getElementById('mv-back');
        if (back) back.style.display = '';
    } else {
        doMoveItem();
    }
}

function movePrevStep() {
    if (_moveCtx.step > 1) {
        _moveCtx.step--;
        if (_moveCtx.step === 1) loadMoveStep1();
        if (_moveCtx.step === 2) loadMoveStep2();
        var back = document.getElementById('mv-back');
        if (back) back.style.display = _moveCtx.step === 1 ? 'none' : '';
    }
}

async function doMoveItem() {
    var targetParentId = null;
    if (_moveCtx.itemType === 'section') {
        targetParentId = _moveCtx.targetModuleId || null;
    } else if (_moveCtx.itemType === 'file') {
        targetParentId = _moveCtx.targetSectionId || _moveCtx.targetModuleId || null;
    }
    closeModal();
    try {
        /* PORTAL FIX, 2026-09-17 — copy and move passed _projectId as the
           SOURCE, so in a portal they looked for the item in a project
           that does not hold it and returned having done nothing. The
           link branch already had the right id but paired it with
           _projectName, which would have labelled the new symlink with
           the wrong project. */
        if (_moveCtx.mode === 'copy') {
            await window.PROJECT_FB.copyItem(
                _viewProjectId, _moveCtx.itemType, _moveCtx.itemId,
                _moveCtx.targetProjectId, targetParentId
            );
        } else if (_moveCtx.mode === 'link') {
            await window.PROJECT_FB.createSymlink(
                _moveCtx.targetProjectId, targetParentId,
                _viewProjectId, viewProjectName(),
                _moveCtx.itemId, _moveCtx.itemType, _moveCtx.item.name
            );
        } else {
            await window.PROJECT_FB.moveItem(
                _viewProjectId, _moveCtx.itemType, _moveCtx.itemId,
                _moveCtx.targetProjectId, targetParentId
            );
        }
    } catch (err) {
        _showActionClash(err, _moveCtx.itemType,
            _moveCtx.mode === 'copy' ? 'Could not copy that item.' :
            _moveCtx.mode === 'link' ? 'Could not create that link.' :
                                       'Could not move that item.');
    }
}

function moveFinalLabel() {
    var m = _moveCtx.mode;
    return m === 'copy' ? 'COPY HERE' : m === 'link' ? 'LINK HERE' : 'MOVE HERE';
}

/* ── Wizard UI helpers ── */
function setMoveStepUI(step, label) {
    _moveCtx.step  = step;
    var total      = _moveCtx.totalSteps;
    var mode       = _moveCtx.mode;
    var dotClass   = mode === 'copy' ? 'copy-step-dot' : mode === 'link' ? 'link-step-dot' : 'move-step-dot';
    var btnClass   = mode === 'copy' ? 'copy-action'   : mode === 'link' ? 'link-action'   : 'primary';
    for (var i = 0; i < total; i++) {
        var dot = document.getElementById('mvdot-' + i);
        if (dot) dot.className = dotClass + (i === step-1 ? ' active' : i < step-1 ? ' done' : '');
    }
    var lbl = document.getElementById('mv-step-label');
    if (lbl) lbl.textContent = label;
    var next = document.getElementById('mv-next');
    if (next) { next.disabled = true; next.textContent = step === total ? moveFinalLabel() : 'NEXT'; next.className = 'modal-btn ' + btnClass; }
    var back = document.getElementById('mv-back');
    if (back) back.style.display = step === 1 ? 'none' : '';
}

function enableMoveNext(label) {
    var btn = document.getElementById('mv-next');
    if (!btn) return;
    var mode = _moveCtx.mode;
    btn.disabled    = false;
    btn.textContent = label;
    btn.className   = 'modal-btn ' + (mode === 'copy' ? 'copy-action' : mode === 'link' ? 'link-action' : 'primary');
}

function highlightMoveItem(listId, itemId) {
    var list = document.getElementById(listId);
    if (!list) return;
    list.querySelectorAll('.move-list-item').forEach(function(el) { el.classList.remove('selected'); });
    var sel = document.getElementById(itemId);
    if (sel) sel.classList.add('selected');
}

/* ─── LOGS ─── */
function ctxLogsItem(itemType, id) {
    hideCtxMenu();
    var item = findItem(itemType, id);
    if (!item) return;
    showModal(
        '<div class="modal-title">' +
        '<i class="fa-regular fa-clock" style="font-size:18px;color:var(--sub)"></i>' +
        esc(item.name) + ' \u2014 Logs</div>' +
        '<div id="item-logs-list" style="min-height:80px;max-height:280px;overflow-y:auto;">' +
        '<div style="text-align:center;padding:30px;color:#C8C6C3;letter-spacing:1px;text-transform:uppercase;font-size:9px">Loading\u2026</div>' +
        '</div>' +
        '<div class="modal-footer"><button class="modal-btn" onclick="closeModal()">CLOSE</button></div>',
        '460px'
    );
    window.PROJECT_FB.getItemLogsRecursive(_viewProjectId, itemType, id).then(function(logs) {
        var el = document.getElementById('item-logs-list');
        if (!el) return;
        if (!logs.length) {
            el.innerHTML =
                '<div style="text-align:center;padding:30px;color:#C8C6C3;letter-spacing:1px;text-transform:uppercase;font-size:9px">' +
                'No logs yet \u2014 activity appears here after future edits</div>';
            return;
        }
        el.innerHTML = logs.map(function(l) {
            return '<div style="display:flex;justify-content:space-between;align-items:center;' +
                'padding:8px 2px;border-bottom:1px solid var(--border)">' +
                '<span style="font-size:10px;color:var(--text);letter-spacing:0.3px">' + esc(l.action) + '</span>' +
                '<span style="font-size:8px;color:#B2B0AC;white-space:nowrap;margin-left:12px">' + esc(l.timeStr) + '</span>' +
                '</div>';
        }).join('');
    });
}

/* ─── MERGE ───
   Was labelled "(Phase F stub)" until 2026-09-17. It is not a stub and
   has not been for a long time: it picks a same-type sibling at the
   same level, optionally renames the target, and calls
   PROJECT_FB.mergeItem, which re-parents the children and soft-deletes
   the source into the bin. Unlike a PROJECT merge, this one IS
   recoverable. */
function ctxMergeItem(itemType, id) {
    hideCtxMenu();
    var item = findItem(itemType, id);
    if (!item) return;

    // Same-type siblings at the same nesting level only
    var pool    = (itemType === 'module') ? _contents.modules : _contents.sections;
    var targets = pool.filter(function(x) {
        return x.id !== id && (x.parentId || null) === (item.parentId || null);
    });

    var typeLabel = (itemType === 'module') ? 'Module' : 'Section';
    var iconCls   = (itemType === 'module') ? 'fa-solid fa-box' : 'fa-solid fa-folder';

    if (!targets.length) {
        showModal(
            '<div style="text-align:center;padding:20px 0">' +
            '<i class="fa-solid fa-code-merge" style="font-size:28px;color:#C8C6C3;display:block;margin:0 auto 10px"></i>' +
            '<p class="modal-body-text" style="color:var(--sub)">No other ' + typeLabel.toLowerCase() + 's at this level to merge into.</p>' +
            '<div class="modal-footer"><button class="modal-btn" onclick="closeModal()">OK</button></div></div>',
            '360px'
        );
        return;
    }

    var listHTML = targets.map(function(t) {
        return '<div class="merge-target-item" id="mti-' + t.id + '" onclick="selectMergeTarget(\'' + t.id + '\',\'' + esc(t.name) + '\')">' +
            '<i class="' + iconCls + '" style="font-size:11px;color:var(--sub);flex-shrink:0"></i>' +
            '<span>' + esc(t.name) + '</span>' +
            '</div>';
    }).join('');

    showModal(
        '<div class="modal-title"><i class="fa-solid fa-code-merge" style="font-size:18px;color:var(--sub)"></i>Merge ' + typeLabel + '</div>' +
        '<p style="font-size:10px;color:var(--sub);margin:0 0 14px;letter-spacing:0.3px">' +
        'Contents of <strong>' + esc(item.name) + '</strong> will move into the selected ' +
        typeLabel.toLowerCase() + ', then it will be removed.</p>' +
        '<div class="modal-field-label">Merge into</div>' +
        '<div class="merge-target-list" id="merge-target-list">' + listHTML + '</div>' +
        '<div class="modal-field-label" style="margin-top:14px">' +
        'Rename merged ' + typeLabel + ' <span style="color:#C0BEBC;font-weight:400">(optional)</span></div>' +
        '<input class="modal-input" type="text" id="merge-rename-input" maxlength="80" placeholder="Leave blank to keep target name">' +
        '<div class="modal-footer">' +
        '<button class="modal-btn primary" id="merge-confirm-btn" onclick="doMergeItem(\'' + itemType + '\',\'' + id + '\')" disabled>MERGE</button>' +
        '<button class="modal-btn" onclick="closeModal()">CANCEL</button></div>',
        '440px'
    );
    _mergeTargetId = null;
}

async function doMergeItem(itemType, sourceId) {
    if (!_mergeTargetId) return;
    var renameEl = document.getElementById('merge-rename-input');
    var newName  = renameEl ? renameEl.value.trim() : '';
    closeModal();
    /* PORTAL FIX, 2026-09-17 — was _projectId. mergeItem re-parents the
       source's children and then soft-deletes the source, all inside the
       project it is given; in a portal that was the wrong one, so the
       whole merge was a no-op. */
    await window.PROJECT_FB.mergeItem(_viewProjectId, itemType, sourceId, _mergeTargetId, newName);
    _mergeTargetId   = null;
    _mergeTargetName = '';
}

function selectMergeTarget(targetId, targetName) {
    _mergeTargetId   = targetId;
    _mergeTargetName = targetName;

    document.querySelectorAll('.merge-target-item').forEach(function(el) {
        el.classList.remove('selected');
    });
    var sel = document.getElementById('mti-' + targetId);
    if (sel) sel.classList.add('selected');

    // Pre-fill rename only if field is still empty
    var renameEl = document.getElementById('merge-rename-input');
    if (renameEl && !renameEl.value.trim()) renameEl.value = targetName;

    var btn = document.getElementById('merge-confirm-btn');
    if (btn) btn.disabled = false;
}

function ctxDeleteItem(itemType, id) {
    hideCtxMenu();
    var item  = findItem(itemType, id);
    var label = item ? esc(item.name) : 'this item';

    /* Cascade count: how many nested items will also be moved to bin */
    var descendants  = getDescendantCount(id, _contents);
    var cascadeNote  = '';
    if (descendants > 0) {
        cascadeNote =
            '<p style="margin:6px 0 0;font-size:8.5px;color:#B0AEAB;letter-spacing:0.3px">' +
            descendants + ' nested item' + (descendants !== 1 ? 's' : '') +
            ' will also be moved to the bin.</p>';
    }

    showModal(
        '<div style="text-align:center">' +
        '<span class="material-symbols-outlined" style="font-size:30px;color:#C8C6C3;display:block;margin:0 auto 10px">recycling</span>' +
        '<p class="modal-body-text">Move <strong>' + label + '</strong> to the bin?</p>' +
        cascadeNote +
        '<div class="modal-footer">' +
        '<button class="modal-btn danger" onclick="doDeleteItem(\'' + itemType + '\',\'' + id + '\')">MOVE TO BIN</button>' +
        '<button class="modal-btn" onclick="closeModal()">CANCEL</button></div></div>',
        '390px'
    );
}

async function doDeleteItem(itemType, id) {
    closeModal();
    /* PORTAL FIX, 2026-09-17 — was _projectId. softDeleteItem reads the
       given project's contents and does allItems.find(x => x.id === id);
       in a portal that missed, so it logged "[softDeleteItem] not found"
       and returned. The modal had already closed, so the item simply sat
       there and nothing said why. */
    await window.PROJECT_FB.softDeleteItem(_viewProjectId, itemType, id);
}

/* ─── HELPERS ─── */
function findItem(itemType, id) {
    if (itemType === 'module')  return _contents.modules.find(function(x)  { return x.id === id; });
    if (itemType === 'section') return _contents.sections.find(function(x) { return x.id === id; });
    if (itemType === 'file')    return _contents.files.find(function(x)    { return x.id === id; });
    return null;
}

/*
 * BFS count of all descendants of `id` within the current _contents.
 * Used to warn the user about cascade scope in the delete modal.
 */
function getDescendantCount(id, contents) {
    var allItems = [].concat(contents.modules, contents.sections, contents.files);
    var count    = 0;
    var queue    = [id];
    var seen     = {};
    seen[id]     = true;
    while (queue.length > 0) {
        var current  = queue.shift();
        var children = allItems.filter(function(i) {
            return i.parentId === current && !seen[i.id];
        });
        children.forEach(function(c) {
            seen[c.id] = true;
            count++;
            queue.push(c.id);
        });
    }
    return count;
}

/* ─── MODAL SYSTEM ─── */
function showModal(content, width) {
    closeModal();
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.addEventListener('click', function(e) { if (e.target === overlay) closeModal(); });
    var box = document.createElement('div');
    box.className = 'modal-box';
    box.style.width = width || '520px';
    box.innerHTML = content;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    _activeModal = overlay;
}
function closeModal() { if (_activeModal) { _activeModal.remove(); _activeModal = null; } }

/* ─── GLOBAL LISTENERS ─── */
document.addEventListener('click', function() { closeCreateDropdown(); hideCtxMenu(); });
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { closeCreateDropdown(); hideCtxMenu(); closeModal(); }
});

/* ═══════════════════════════════════════════════════
   RECORDS
═══════════════════════════════════════════════════ */
async function ctxRecords(itemType, id) {
    hideCtxMenu();
    var item = findItem(itemType, id);
    if (!item) return;

    /* Build the Scribble path from breadcrumb + item name.
       PORTAL FIX, 2026-09-17 — rooted at _projectName, so a record saved
       inside a portal carried a path beginning with the wrong project.
       The path is what you paste into OneDrive or a drive folder, so a
       wrong root is worse than no root. */
    var pathParts = [viewProjectName()];
    _path.forEach(function(p) { pathParts.push(p.name); });
    pathParts.push(item.name);
    var scribblePath = pathParts.join(' / ');

    var saved = await window.PROJECT_FB.getItemRecords(_viewProjectId, itemType, id);
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
        '<div class="records-path-display" id="rec-path">' + esc(scribblePath) + '</div>' +
        '<button class="records-copy-btn" onclick="copyRecordsPath()" title="Copy path">' +
        '<i class="fa-regular fa-copy"></i></button>' +
        '</div>' +

        '<div class="modal-field-label">CLOUD LINK</div>' +
        '<input class="modal-input" type="text" id="rec-onedrive" placeholder="https://1drv.ms/\u2026" value="' + esc(rec.onedrive || '') + '">' +

        '<div class="modal-field-label">HARD DRIVE PATH</div>' +
        '<input class="modal-input" type="text" id="rec-hdpath" placeholder="D:\\Projects\\\u2026" value="' + esc(rec.hdPath || '') + '">' +

        '<div class="modal-field-label">CUSTOM LINKS</div>' +
        '<div id="records-custom-links"></div>' +
        '<button class="records-add-link-btn" onclick="addCustomLinkRow(\'\',\'\')">' +
        '<i class="fa-solid fa-plus"></i> ADD LINK</button>' +

        '<div class="modal-footer">' +
        '<button class="modal-btn primary" onclick="saveRecordsItem(\'' + itemType + '\',\'' + id + '\')">SAVE</button>' +
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

async function saveRecordsItem(itemType, id) {
    var records = {
        onedrive:    ((document.getElementById('rec-onedrive') || {}).value || '').trim(),
        hdPath:      ((document.getElementById('rec-hdpath')   || {}).value || '').trim(),
        customLinks: collectCustomLinks()
    };
    closeModal();
    await window.PROJECT_FB.saveItemRecords(_viewProjectId, itemType, id, records);
}

/* ─── HELPERS ─── */

/* ── READING A TIMESTAMP THAT MIGHT BE OFFLINE ────────────────
   Added 2026-09-17. Same helper and same reason as scribble-app.js:
   serverTimestamp() reads back null until the write lands, so every
   stamp is written with a *LocalMs companion (js/scribble-db.js) and
   whenMs is the only correct way to read one. Reading .toDate() or
   .seconds direct meant an item created offline showed a dash and
   sorted as though it were the oldest thing in the project. */
function _ms(obj, field) {
    if (window.SCRIBBLE_TIME && window.SCRIBBLE_TIME.whenMs) {
        return window.SCRIBBLE_TIME.whenMs(obj, field);
    }
    var v = obj && obj[field];
    return (v && v.toDate) ? v.toDate().getTime() : 0;
}

function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatDate(d) {
    var M = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    return M[d.getMonth()] + ', ' + d.getDate() + ', ' + d.getFullYear();
}
function relativeTime(d) {
    var diff = Date.now() - d.getTime(), mins = Math.floor(diff / 60000),
        hrs  = Math.floor(diff / 3600000), days = Math.floor(diff / 86400000),
        wks  = Math.floor(days / 7);
    if (mins < 1)  return 'Just now';
    if (mins < 60) return mins + 'm ago';
    if (hrs  < 24) return hrs  + 'h ago';
    if (days < 7)  return days + 'd ago';
    if (wks  < 5)  return wks  + (wks === 1 ? ' week ago' : ' weeks ago');
    return formatDate(d);
}

function toggleLogs() {
    /* Guarded 2026-09-17. initLogsState() below was explicitly fixed for
       this — "a null element here threw and killed everything defined
       after it in the file" — and this one was left unguarded. It is the
       milder case, because it only runs on a click rather than at load
       time, so a missing element breaks that one click instead of the
       whole page. Guarded anyway: the two controls are the same pair of
       elements and there is no reason for one to trust them and the
       other not to. */
    var list    = document.getElementById('recent-list');
    var chevron = document.getElementById('logs-chevron');
    if (!list) return;

    var isOpen = list.style.display !== 'none';
    list.style.display = isOpen ? 'none' : 'block';
    if (chevron) chevron.classList.toggle('open', !isOpen);
    try { localStorage.setItem('logsOpen', String(!isOpen)); } catch (e) {}
}

function initLogsState() {
    /* Ran unguarded before — a null element here threw and killed
       everything defined after it in the file. */
    var saved = localStorage.getItem('logsOpen');
    var isOpen = saved === null ? true : saved === 'true'; // default open
    var list = document.getElementById('recent-list');
    var chevron = document.getElementById('logs-chevron');
    if (!list || !chevron) return;
    list.style.display = isOpen ? 'block' : 'none';
    chevron.classList.toggle('open', isOpen);
}
initLogsState();