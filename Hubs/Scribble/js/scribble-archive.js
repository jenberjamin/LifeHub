/* ═══════════════════════════════════════════════════
   SCRIBBLE — ARCHIVE APP
   scribble-archive.js

   Loaded BEFORE the firebase module (sync), so
   ARCHIVE_READY exists when the module finishes.
═══════════════════════════════════════════════════ */

var _archiveItems = [];
var _selectedIds  = [];
var _search       = '';
var _sortMode     = 'date-newest';
var _activeModal  = null;

/* ─── BOOT ───────────────────────────────────── */
window.ARCHIVE_READY = function() {
    window.ARCHIVE_FB.listenArchiveItems(function(items) {
        _archiveItems = items;
        /* Drop selections whose rows no longer exist. */
        _selectedIds = _selectedIds.filter(function(id) {
            return items.some(function(i) { return i.id === id; });
        });
        renderTable();
        syncBulkActions();
    });
};

/* ─── NAV ────────────────────────────────────── */
function gotoAllProjects() { window.location.href = 'Scribble.html'; }
function gotoRecycleBin()  { window.location.href = 'Scribble-recycle-bin.html'; }
/* gotoLifeHub() removed 2026-09-17. It pointed at '../index.html' —
   Hubs/index.html, which does not exist. The header now carries two
   plain links to the real pages, like every other hub. */

/* ─── SEARCH / SORT ──────────────────────────── */
function archiveSearch(v) { _search = (v || '').toLowerCase(); renderTable(); }
function onSortChange(v)  { _sortMode = v; renderTable(); }

function visibleItems() {
    var rows = _archiveItems.slice();

    if (_search) {
        rows = rows.filter(function(i) {
            return ((i.name || '') + ' ' + (i.originalPath || '') + ' ' +
                    (i.projectName || '') + ' ' + (i.note || ''))
                   .toLowerCase().indexOf(_search) !== -1;
        });
    }

    switch (_sortMode) {
        case 'all-projects': rows = rows.filter(function(i){ return i.type === 'PROJECT'; }); break;
        case 'all-modules':  rows = rows.filter(function(i){ return i.type === 'MODULE';  }); break;
        case 'all-sections': rows = rows.filter(function(i){ return i.type === 'SECTION'; }); break;
        case 'all-files':    rows = rows.filter(function(i){ return i.type === 'FILE';    }); break;
    }

    switch (_sortMode) {
        case 'date-oldest': rows.sort(function(a,b){ return a.archivedMs - b.archivedMs; }); break;
        case 'name-az':     rows.sort(function(a,b){ return (a.name||'').localeCompare(b.name||''); }); break;
        case 'project-az':  rows.sort(function(a,b){
                                return (a.projectName||'').localeCompare(b.projectName||'') ||
                                       (a.name||'').localeCompare(b.name||''); }); break;
        default:            rows.sort(function(a,b){ return b.archivedMs - a.archivedMs; });
    }
    return rows;
}

/* ─── TABLE ──────────────────────────────────── */
function renderTable() {
    var tbody = document.getElementById('arc-tbody');
    if (!tbody) return;

    var rows = visibleItems();

    if (!rows.length) {
        tbody.innerHTML =
            '<tr><td colspan="7"><div class="arc-table-empty">' +
            (_archiveItems.length ? 'Nothing matches that filter.' : 'The archive is empty.') +
            '</div></td></tr>';
        return;
    }

    tbody.innerHTML = rows.map(function(i) {
        var checked = _selectedIds.indexOf(i.id) !== -1 ? ' checked' : '';
        var name    = esc(i.name || 'Untitled') +
                      (i.type === 'FILE' && i.fileType ? '.' + esc(i.fileType) : '');
        var link    = i.isSymlink
            ? ' <i class="fa-solid fa-link arc-link-badge" title="Symlink"></i>' : '';

        /* groupSize > 1 means restoring this brings its whole subtree. */
        var group = (i.groupSize && i.groupSize > 1)
            ? '<span class="arc-group" title="Restoring this brings back ' +
              i.groupSize + ' items">' + i.groupSize + '</span>'
            : '<span class="arc-group-single">1</span>';

        var note = i.note
            ? '<div class="arc-note">' + esc(i.note) + '</div>'
            : '<div class="arc-note arc-note-empty">\u2014</div>';

        return '<tr>' +
            '<td><input type="checkbox" class="arc-cb"' + checked +
                ' onchange="toggleSelect(\'' + i.id + '\',this.checked)"></td>' +
            '<td><div class="arc-name">' + name + link + '</div>' + note + '</td>' +
            '<td><span class="arc-type">' + esc(i.type || '') + '</span></td>' +
            '<td class="center"><span class="arc-date">' + esc(fmtDate(i.archivedDate)) + '</span></td>' +
            '<td class="center">' + group + '</td>' +
            '<td><div class="arc-path">' + esc(i.originalPath || '\u2014') + '</div></td>' +
            '<td class="arc-action-cell">' +
                '<button class="arc-action-btn" title="Edit note" ' +
                    'onclick="editArchiveNote(\'' + i.id + '\')">' +
                    '<i class="fa-solid fa-pen"></i></button>' +
                '<button class="arc-action-btn restore" title="Restore" ' +
                    'onclick="confirmRestore(\'' + i.id + '\')">' +
                    '<i class="fa-regular fa-circle-up"></i></button>' +
            '</td>' +
        '</tr>';
    }).join('');
}

function fmtDate(d) {
    if (!d) return '\u2014';
    var M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return M[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}

/* ─── SELECTION ──────────────────────────────── */
function toggleSelect(id, on) {
    var i = _selectedIds.indexOf(id);
    if (on && i === -1) _selectedIds.push(id);
    if (!on && i !== -1) _selectedIds.splice(i, 1);
    syncBulkActions();
}

function syncBulkActions() {
    var bar = document.getElementById('bulk-actions');
    if (bar) bar.style.display = _selectedIds.length ? 'flex' : 'none';
    var cnt = document.getElementById('bulk-count');
    if (cnt) cnt.textContent = _selectedIds.length + ' selected';
}

/* ─── RESTORE ────────────────────────────────── */
function confirmRestore(archiveId) {
    var item = _archiveItems.find(function(i){ return i.id === archiveId; });
    if (!item) return;

    var extra = (item.groupSize && item.groupSize > 1)
        ? '<p class="modal-body-text">This will bring back all <strong>' + item.groupSize +
          '</strong> items archived with it.</p>'
        : '';

    showModal(
        '<div class="arc-restore-modal">' +
        '<i class="fa-regular fa-circle-up restore-modal-icon"></i>' +
        '<div class="perm-del-title">Restore \u2018' + esc(item.name || 'Untitled') + '\u2019?</div>' +
        extra +
        '<p class="modal-body-text arc-muted">It returns to ' + esc(item.originalPath || 'its original place') + '.</p>' +
        '<div class="modal-footer">' +
        '<button class="modal-btn" onclick="closeModal()">CANCEL</button>' +
        '<button class="modal-btn primary" onclick="doRestore(\'' + archiveId + '\')">RESTORE</button>' +
        '</div></div>', '400px'
    );
}

async function doRestore(archiveId) {
    closeModal();
    try {
        await window.ARCHIVE_FB.restoreArchived(archiveId);
    } catch (err) {
        if (err && err.partial) {
            alert(err.partial.restored + ' restored, ' + err.partial.failed.length +
                  ' failed.\nThe failed entries are still in the archive.');
        } else {
            alert('Restore failed: ' + (err && err.message ? err.message : 'unknown error'));
        }
    }
}

function confirmBulkRestore() {
    if (!_selectedIds.length) return;
    showModal(
        '<div class="arc-restore-modal">' +
        '<i class="fa-regular fa-circle-up restore-modal-icon"></i>' +
        '<div class="perm-del-title">Restore ' + _selectedIds.length + ' selected?</div>' +
        '<p class="modal-body-text arc-muted">Each returns to its original place. ' +
        'Anything archived alongside them comes back too.</p>' +
        '<div class="modal-footer">' +
        '<button class="modal-btn" onclick="closeModal()">CANCEL</button>' +
        '<button class="modal-btn primary" onclick="doBulkRestore()">RESTORE ALL</button>' +
        '</div></div>', '400px'
    );
}

async function doBulkRestore() {
    var ids = _selectedIds.slice();
    closeModal();

    var failed = 0;
    for (var i = 0; i < ids.length; i++) {
        /* An entry may already be gone if an earlier restore in this
           loop covered its group — that isn't a failure. */
        if (!_archiveItems.some(function(x){ return x.id === ids[i]; })) continue;
        try { await window.ARCHIVE_FB.restoreArchived(ids[i]); }
        catch (e) { failed++; }
    }

    _selectedIds = [];
    syncBulkActions();
    if (failed) alert(failed + ' item(s) could not be restored and are still in the archive.');
}

/* ─── SHELF NOTE ─────────────────────────────── */
function editArchiveNote(archiveId) {
    var item = _archiveItems.find(function(i){ return i.id === archiveId; });
    if (!item) return;

    showModal(
        '<div class="modal-title"><i class="fa-solid fa-pen" style="font-size:14px;color:var(--sub)"></i>' +
        'Note</div>' +
        '<div class="arc-note-sub">' + esc(item.name || 'Untitled') + '</div>' +
        '<div class="modal-field-label">WHY WAS THIS SHELVED?</div>' +
        '<input class="modal-input" type="text" id="arc-note-input" maxlength="160" ' +
               'placeholder="e.g. superseded by v2, kept for reference" ' +
               'onkeydown="if(event.key===\'Enter\')saveArchiveNote(\'' + archiveId + '\')">' +
        '<div class="modal-footer">' +
        '<button class="modal-btn" onclick="closeModal()">CANCEL</button>' +
        '<button class="modal-btn primary" onclick="saveArchiveNote(\'' + archiveId + '\')">SAVE</button>' +
        '</div>', '440px'
    );

    var el = document.getElementById('arc-note-input');
    if (el) { el.value = item.note || ''; el.focus(); el.select(); }
}

async function saveArchiveNote(archiveId) {
    var el = document.getElementById('arc-note-input');
    if (!el) return;
    var note = el.value;
    closeModal();
    try { await window.ARCHIVE_FB.updateArchiveNote(archiveId, note); }
    catch (e) { alert('Could not save that note.'); }
}

/* ─── HEADER SEARCH ──────────────────────────── */
function headerSearch(v) {
    var box = document.getElementById('arc-search');
    if (box) { box.value = v; archiveSearch(v); }
}

/* ─── MODAL ──────────────────────────────────── */
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

function closeModal() {
    if (_activeModal) { _activeModal.remove(); _activeModal = null; }
}

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeModal();
});

function esc(s) {
    return String(s === null || s === undefined ? '' : s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
