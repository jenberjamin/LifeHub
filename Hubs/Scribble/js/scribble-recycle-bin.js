/* ═══════════════════════════════════════════════════
   SCRIBBLE — RECYCLE BIN APP LOGIC  v2.2
   scribble-recycle-bin.js

   v2.2 — doRestoreSingle error handling (Bug 2 fix):
   ────────────────────────────────────────────────────
   • doRestoreSingle now wraps BIN_FB.restoreSingleItem
     in try/catch.
   • On failure: shows a "Restore Failed" modal telling
     the user their data is still safe in the bin and
     they can try again.
   • On success: shows a brief confirmation so the user
     knows the restore completed and which item to look
     for in their project.

   v2.1 — Single-item restore UI:
   ────────────────────────────────
   • confirmRestore() now opens a two-button modal when
     the row belongs to a multi-item group:
       [RESTORE THIS]  ← item + its subtree only
       [RESTORE GROUP] ← all items sharing groupId
       [CANCEL]
   • doRestoreSingle() calls BIN_FB.restoreSingleItem()
   • countSubtree() BFS helper for button label counts
   • Solo items (groupSize === 1) show single-button modal

   v2.0 — Group-based restore/delete, all item types.
═══════════════════════════════════════════════════ */

// ── State
var _binItems    = [];
var _filterQuery = '';
var _sortMode    = 'expires-soonest';
var _selectedIds = [];
var _activeModal = null;
var _unsubBin    = null;

window.BIN_READY = function() { initBin(); };

/* ─── INIT ───────────────────────────────────── */
function initBin() {
    if (_unsubBin) { _unsubBin(); _unsubBin = null; }
    _unsubBin = window.BIN_FB.listenBinItems(function(items) {
        _binItems = items;
        renderBinTable();
    });
}

/* ─── HEADER SEARCH ──────────────────────────── */
function headerSearch(value) {
    var bs = document.getElementById('bin-search');
    if (bs) bs.value = value;
    binSearch(value);
}
function binSearch(value) { _filterQuery = value; renderBinTable(); }

/* ─── SORT ───────────────────────────────────── */
function onSortChange(value) { _sortMode = value; renderBinTable(); }

/* ─── FILTER + SORT ──────────────────────────── */
function getFilteredSorted() {
    var list = _binItems.slice();
    if      (_sortMode === 'all-projects')  list = list.filter(function(i){ return i.type === 'PROJECT'; });
    else if (_sortMode === 'all-modules')   list = list.filter(function(i){ return i.type === 'MODULE';  });
    else if (_sortMode === 'all-sections')  list = list.filter(function(i){ return i.type === 'SECTION'; });
    else if (_sortMode === 'all-files')     list = list.filter(function(i){ return i.type === 'FILE';    });
    if (_filterQuery) {
        var q = _filterQuery.toLowerCase();
        list  = list.filter(function(i) {
            return (i.name || '').toLowerCase().indexOf(q) !== -1 ||
                   (i.originalPath || '').toLowerCase().indexOf(q) !== -1;
        });
    }
    switch (_sortMode) {
        case 'expires-soonest': list.sort(function(a,b){ return a.daysLeft - b.daysLeft; });      break;
        case 'expires-latest':  list.sort(function(a,b){ return b.daysLeft - a.daysLeft; });      break;
        case 'date-newest':     list.sort(function(a,b){ return itemTs(b) - itemTs(a); });         break;
        case 'date-oldest':     list.sort(function(a,b){ return itemTs(a) - itemTs(b); });         break;
        case 'name-az':         list.sort(function(a,b){ return a.name.localeCompare(b.name); });  break;
        default:                list.sort(function(a,b){ return a.daysLeft - b.daysLeft; });
    }
    return list;
}
/*
 * Sorting key for "Date deleted".
 *
 * This read item.deletedAt.toDate() directly, which is null for
 * anything deleted offline — the server timestamp does not resolve
 * until the write reaches Firestore. Those rows scored 0 and sank to
 * the bottom of "newest first", which is the exact opposite of where
 * something you deleted a minute ago belongs.
 *
 * whenMs falls back to the deletedAtLocalMs companion written
 * alongside it. SCRIBBLE_TIME is published by js/scribble-db.js —
 * reached through the global because this file is a classic script,
 * not a module.
 */
function itemTs(item) {
    if (window.SCRIBBLE_TIME && window.SCRIBBLE_TIME.whenMs) {
        return window.SCRIBBLE_TIME.whenMs(item, 'deletedAt');
    }
    return item.deletedAt && item.deletedAt.toDate ? item.deletedAt.toDate().getTime() : 0;
}

/* ─── RENDER ──────────────────────────────────── */
function renderBinTable() {
    var tbody = document.getElementById('bin-tbody');
    if (!tbody) return;
    var list = getFilteredSorted();
    if (!list.length) {
        var msg = _filterQuery ? 'No items match your search.' : 'The recycle bin is empty.';
        tbody.innerHTML = '<tr><td colspan="8"><div class="bin-table-empty">' + esc(msg) + '</div></td></tr>';
        return;
    }
    tbody.innerHTML = list.map(function(item) {
        var rowCls    = rowColorClass(item.daysLeft);
        var isChecked = _selectedIds.indexOf(item.id) !== -1;
        var daysCls   = daysClass(item.daysLeft);
        var daysLabel = item.daysLeft === 0 ? 'Expired' : item.daysLeft + ' days';
        var typeLabel = item.type === 'FILE' && item.fileType
            ? item.fileType.toUpperCase()
            : (item.type || 'ITEM');
        var groupInfo = formatGroupInfo(item);

        /* ── THE GROUP DELETE BUTTON, added 2026-09-17 ─────────────
           confirmPermanentDeleteGroup() has existed since the single-row
           delete was split out of it, and nothing ever called it — the
           only way to reach it was the console.

           Shown ONLY when this row has siblings. For a solo item the two
           buttons would do exactly the same thing, and two identical
           danger buttons side by side is how the wrong one gets clicked.

           Mirrors how confirmRestore already works: solo gets one
           choice, a group gets "this one" and "all of it". */
        var groupMembers = _binItems.filter(function(i) {
            return i.groupId === item.groupId;
        }).length;
        var groupDeleteBtn = groupMembers > 1
            ? '<button class="bin-action-btn danger" ' +
              'title="Permanently delete this whole group — all ' + groupMembers +
              ' items deleted together, including the one this belongs to" ' +
              'onclick="confirmPermanentDeleteGroup(\'' + item.id + '\')">' +
              '<i class="fa-solid fa-dumpster"></i></button> '
            : '';

        return (
            '<tr class="' + rowCls + '" id="bin-row-' + item.id + '">' +
            '<td style="text-align:center">' +
            '<input type="checkbox" class="bin-cb"' + (isChecked ? ' checked' : '') +
            ' onchange="toggleSelect(\'' + item.id + '\')" onclick="event.stopPropagation()"></td>' +
            '<td><span class="bin-name">' + esc(item.name) + '</span></td>' +
            '<td><span class="bin-type">' + esc(typeLabel) + '</span></td>' +
            '<td class="center"><span class="bin-deleted-on">' + formatDeletedOn(item) + '</span></td>' +
            '<td class="center"><span class="bin-size">' + groupInfo + '</span></td>' +
            '<td class="center"><span class="bin-path">' + esc(item.originalPath || '\u2014') + '</span></td>' +
            '<td><span class="bin-days ' + daysCls + '">' + daysLabel + '</span></td>' +
            '<td class="bin-action-cell">' +
            '<button class="bin-action-btn danger" title="Permanently delete just this item"' +
            ' onclick="confirmPermanentDelete(\'' + item.id + '\')">' +
            '<i class="fa-regular fa-trash-can"></i></button> ' +
            groupDeleteBtn +
            '<button class="bin-action-btn" title="Restore"' +
            ' onclick="confirmRestore(\'' + item.id + '\')">' +
            '<i class="fa-regular fa-circle-up"></i></button> ' +
            /* Retitled 2026-09-17. It said "(Coming Soon)" — but the
               Archive shipped, so the label was telling you a built
               feature was missing. What is actually missing is a path
               from the BIN to the archive, and there is a perfectly
               good route already: restore it, then archive it. Still
               disabled, because nothing here can do it in one step. */
            '<button class="bin-action-btn" disabled ' +
            'title="To archive this, restore it first — then archive it from its own page">' +
            '<i class="fa-regular fa-folder-open"></i></button>' +
            '</td></tr>'
        );
    }).join('');
}

function rowColorClass(days) {
    if (days >= 21) return 'bin-row-green';
    if (days >= 10) return 'bin-row-yellow';
    return 'bin-row-red';
}
function daysClass(days) {
    if (days >= 21) return 'green';
    if (days >= 10) return 'yellow';
    return 'red';
}
/* Takes the ITEM, not the field \u2014 2026-09-17. It read ts.toDate()
   directly, so anything deleted offline showed a dash in the
   "Deleted On" column. Odd one to have missed, because itemTs() right
   above was explicitly fixed for exactly this and goes through
   SCRIBBLE_TIME.whenMs. Same route now. */
function formatDeletedOn(item) {
    var ms = itemTs(item);
    if (!ms) return '\u2014';
    var d = new Date(ms);
    return String(d.getMonth()+1).padStart(2,'0') + '/' + String(d.getDate()).padStart(2,'0') + '/' +
           d.getFullYear() + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}

/* "Group" column — icon breakdown or solo indicator */
function formatGroupInfo(item) {
    var siblings = _binItems.filter(function(i) { return i.groupId === item.groupId; });
    var mCount   = siblings.filter(function(i) { return i.type === 'MODULE';  }).length;
    var sCount   = siblings.filter(function(i) { return i.type === 'SECTION'; }).length;
    var fCount   = siblings.filter(function(i) { return i.type === 'FILE';    }).length;

    if (mCount + sCount + fCount === 0) {
        if (item.type === 'PROJECT') return '<i class="fa-solid fa-cube"       style="color:var(--sub)" title="Solo project"></i>';
        if (item.type === 'MODULE')  return '<i class="fa-solid fa-box"        style="color:var(--sub)" title="Solo module"></i>';
        if (item.type === 'SECTION') return '<i class="fa-solid fa-folder"     style="color:var(--sub)" title="Solo section"></i>';
        if (item.type === 'FILE')    return '<i class="fa-regular fa-file"     style="color:var(--sub)" title="Solo file"></i>';
        return '\u2014';
    }
    var parts = [];
    if (mCount > 0) parts.push('<i class="fa-solid fa-box"    style="color:var(--sub)" title="Modules"></i>&thinsp;'  + mCount);
    if (sCount > 0) parts.push('<i class="fa-solid fa-folder" style="color:var(--sub)" title="Sections"></i>&thinsp;' + sCount);
    if (fCount > 0) parts.push('<i class="fa-regular fa-file" style="color:var(--sub)" title="Files"></i>&thinsp;'    + fCount);
    return parts.join('&ensp;');
}

/* ─── SELECTION ──────────────────────────────── */
function toggleSelect(id) {
    var idx = _selectedIds.indexOf(id);
    if (idx === -1) { _selectedIds.push(id); } else { _selectedIds.splice(idx, 1); }
    syncBulkActions();
}
function syncBulkActions() {
    var panel = document.getElementById('bulk-actions');
    if (panel) panel.style.display = _selectedIds.length > 0 ? 'flex' : 'none';
}
function getUniqueGroupIds(docIds) {
    var groups = [];
    docIds.forEach(function(docId) {
        var item = _binItems.find(function(i) { return i.id === docId; });
        if (item && groups.indexOf(item.groupId) === -1) groups.push(item.groupId);
    });
    return groups;
}

/* ─── PERMANENT DELETE ───────────────────────── */
/*
 * Two distinct actions now:
 *   confirmPermanentDelete(binDocId) → THIS ROW ONLY
 *   confirmPermanentDeleteGroup(binDocId) → the whole group
 *
 * Previously the row trash button silently targeted the entire
 * groupId. Because softDeleteItem sets groupId = the deleted
 * ROOT's id, every file inside a binned module shares one id —
 * so deleting one row drained the whole module. The count in the
 * modal was the only warning.
 */
function confirmPermanentDelete(binDocId) {
    var item = _binItems.find(function(i) { return i.id === binDocId; });
    if (!item) return;
    _showDeleteModal([], [binDocId], [item]);
}

function confirmPermanentDeleteGroup(binDocId) {
    var item = _binItems.find(function(i) { return i.id === binDocId; });
    if (!item) return;
    var members = _binItems.filter(function(i) { return i.groupId === item.groupId; });
    _showDeleteModal([item.groupId], [], members);
}

function confirmBulkDelete() {
    if (!_selectedIds.length) return;
    var groupIds = getUniqueGroupIds(_selectedIds);
    var members  = _binItems.filter(function(i) { return groupIds.indexOf(i.groupId) !== -1; });
    _showDeleteModal(groupIds, [], members);
}

/* Holds what the confirmed button will act on — passing arrays through
   comma-joined strings in inline onclick attributes was how a stray id
   could widen the target. */
var _pendingDelete = { groupIds: [], binDocIds: [], members: [] };

/* ═══════════════════════════════════════════════════
   HOW HARD IT IS TO DELETE SOMETHING
   Permanent deletion here is final — no bin behind the
   bin. But an empty folder and a project holding a
   hundred files were being asked the same single
   question, which makes the question meaningless for
   the one that matters.

   Under the threshold : type DELETE.
   At or over it       : type the item's NAME first,
                         then type DELETE.

   The count comes from the group membership already on
   screen, so it is the true blast radius — every
   descendant, not just the row you clicked.

   Tune this one number to taste. */
var HEAVY_ITEM_COUNT = 5;

/* Name as the row displays it, extension included, so what you are
   asked to type matches what you are looking at. */
function _binDisplayName(item) {
    if (!item) return '';
    var n = item.name || 'Untitled';
    if (item.type === 'FILE' && item.fileType) n += '.' + item.fileType;
    return n;
}

/*
 * What step one asks you to type.
 *
 * One row or one group → its name. A bulk delete spanning several
 * groups has no single name, so it asks for the item COUNT instead:
 * still a deliberate act, and it forces you to read the number
 * you are about to destroy.
 */
function _deleteGateTarget(groupIds, binDocIds, members) {
    if (binDocIds.length === 1 && !groupIds.length) {
        var row = _binItems.find(function(i) { return i.id === binDocIds[0]; });
        return { kind: 'name', want: _binDisplayName(row) };
    }
    if (groupIds.length === 1 && !binDocIds.length) {
        var root = members.find(function(m) { return m.itemId === groupIds[0]; }) || members[0];
        return { kind: 'name', want: _binDisplayName(root) };
    }
    return { kind: 'count', want: String(members.length) };
}

function _showDeleteModal(groupIds, binDocIds, members) {
    groupIds  = groupIds  || [];
    binDocIds = binDocIds || [];
    members   = members   || [];
    _pendingDelete = { groupIds: groupIds, binDocIds: binDocIds, members: members };

    if (members.length >= HEAVY_ITEM_COUNT) {
        _showDeleteGate(_deleteGateTarget(groupIds, binDocIds, members), members);
    } else {
        _showDeleteFinal(members);
    }
}

/* ── Step one (heavy only): name or count ───────── */
var _deleteGate = null;

function _showDeleteGate(target, members) {
    _deleteGate = target;

    var total = members.length;

    showModal(
        '<div class="perm-del-modal">' +
        '<div class="perm-del-title">' +
          'This will permanently destroy ' + total + ' items.<br>' +
          (target.kind === 'name'
              ? 'Type its name to continue.'
              : 'Type the number of items to continue.') +
        '</div>' +
        '<div class="confirm-echo">' + esc(target.want) + '</div>' +
        '<input class="modal-input" type="text" id="del-gate-input" autocomplete="off" ' +
               'spellcheck="false" placeholder="Type it exactly" oninput="checkDeleteGate()" ' +
               'onkeydown="if(event.key===\'Enter\'){event.preventDefault();passDeleteGate();}">' +
        '<div class="confirm-hint" id="del-gate-hint">' +
          'This is the first of two confirmations.</div>' +
        '<div class="modal-footer">' +
        '<button class="modal-btn" onclick="closeModal()">CANCEL</button>' +
        '<button class="modal-btn danger" id="del-gate-btn" disabled ' +
                'onclick="passDeleteGate()">CONTINUE</button>' +
        '</div>' +
        '</div>', '440px'
    );
    setTimeout(function() {
        var el = document.getElementById('del-gate-input');
        if (el) el.focus();
    }, 50);
}

function _gateMatches() {
    var el = document.getElementById('del-gate-input');
    if (!el || !_deleteGate) return false;
    return el.value.trim().toLowerCase() === String(_deleteGate.want).trim().toLowerCase();
}

function checkDeleteGate() {
    var ok   = _gateMatches();
    var el   = document.getElementById('del-gate-input');
    var btn  = document.getElementById('del-gate-btn');
    var hint = document.getElementById('del-gate-hint');
    if (el)  el.classList.toggle('matched', ok);
    if (btn) btn.disabled = !ok;
    if (hint) {
        hint.textContent = ok ? 'Match. One more confirmation to go.'
                              : 'This is the first of two confirmations.';
        hint.classList.toggle('ok', ok);
    }
}

function passDeleteGate() {
    if (!_gateMatches()) return;
    _deleteGate = null;
    _showDeleteFinal(_pendingDelete.members);
}

/* ── Final step: type DELETE ────────────────────── */
function _showDeleteFinal(members) {
    var total = members ? members.length : 0;
    var label = total + ' item' + (total !== 1 ? 's' : '');

    /* Name every single thing about to be destroyed. A bare count is
       not informed consent when the action is irreversible. */
    var listHtml = '';
    if (members && members.length) {
        var shown = members.slice(0, 12).map(function(m) {
            var n = m.name || 'Untitled';
            if (m.type === 'FILE' && m.fileType) n += '.' + m.fileType;
            return '<li>' + esc(n) + '</li>';
        }).join('');
        var more = members.length > 12
            ? '<li class="perm-del-more">…and ' + (members.length - 12) + ' more</li>'
            : '';
        listHtml = '<ul class="perm-del-list">' + shown + more + '</ul>';
    }

    showModal(
        '<div class="perm-del-modal">' +
        '<div class="perm-del-title">Permanently delete ' + label + '?<br>' +
        'This cannot be undone. Type \u2018DELETE\u2019 to confirm.</div>' +
        listHtml +
        '<input class="perm-del-input" type="text" id="del-confirm-input" maxlength="6"' +
        ' placeholder="DELETE" autocomplete="off" autocapitalize="characters" spellcheck="false"' +
        ' oninput="checkDeleteInput()"' +
        ' onkeydown="if(event.key===\'Enter\'){event.preventDefault();runPendingDelete();}">' +
        '<div class="modal-footer">' +
        '<button class="modal-btn" onclick="closeModal()">CANCEL</button>' +
        '<button class="modal-btn danger" id="del-confirm-btn" disabled' +
        ' onclick="runPendingDelete()">DELETE PERMANENTLY</button>' +
        '</div>' +
        '</div>', '440px'
    );
    setTimeout(function() { var el = document.getElementById('del-confirm-input'); if (el) el.focus(); }, 50);
}

/* Case-insensitive on purpose. The input carries
   `text-transform: uppercase`, which restyles the glyphs but leaves
   el.value exactly as typed — so a lowercase "delete" LOOKED correct
   and silently never matched. */
function _deleteConfirmed() {
    var el = document.getElementById('del-confirm-input');
    return !!el && el.value.trim().toUpperCase() === 'DELETE';
}

function checkDeleteInput() {
    var el  = document.getElementById('del-confirm-input');
    var btn = document.getElementById('del-confirm-btn');
    if (!el) return;
    var ok = _deleteConfirmed();
    el.classList.toggle('ready', ok);
    /* No longer fires the delete on the last keystroke — it only arms
       the button. An irreversible action should need a deliberate
       second act, not a typo landing on the right character. */
    if (btn) btn.disabled = !ok;
}

async function runPendingDelete() {
    if (!_deleteConfirmed()) return;

    var groupIds  = _pendingDelete.groupIds  || [];
    var binDocIds = _pendingDelete.binDocIds || [];
    _pendingDelete = { groupIds: [], binDocIds: [], members: [] };
    _deleteGate    = null;
    closeModal();

    try {
        for (var i = 0; i < binDocIds.length; i++) {
            if (binDocIds[i]) await window.BIN_FB.permanentDeleteSingle(binDocIds[i]);
        }
        for (var j = 0; j < groupIds.length; j++) {
            if (groupIds[j]) await window.BIN_FB.permanentDeleteGroup(groupIds[j]);
        }
    } catch (err) {
        console.error('[Bin] permanent delete failed:', err);
        alert('Delete failed: ' + (err && err.message ? err.message : 'unknown error') +
              '\nNothing further was removed.');
        return;
    }

    _selectedIds = _selectedIds.filter(function(docId) {
        if (binDocIds.indexOf(docId) !== -1) return false;
        var item = _binItems.find(function(x) { return x.id === docId; });
        return item && groupIds.indexOf(item.groupId) === -1;
    });
    syncBulkActions();
}

/* ─── RESTORE ────────────────────────────────── */
/*
 * Single-row restore: opens a two-button modal for multi-item groups.
 *   [RESTORE THIS]  → doRestoreSingle(binDocId)
 *   [RESTORE GROUP] → doRestore(groupId)
 * Solo items get a single-button modal.
 */
function confirmRestore(binDocId) {
    var item = _binItems.find(function(i) { return i.id === binDocId; });
    if (!item) return;

    var groupItems   = _binItems.filter(function(i) { return i.groupId === item.groupId; });
    var isGroup      = groupItems.length > 1;
    var subtreeCount = countSubtree(item.itemId, groupItems);
    var typeLabel    = item.type || 'ITEM';

    if (!isGroup) {
        /* Solo — single button */
        openRestoreModal(
            item.groupId, null,
            typeLabel + ' RESTORATION',
            esc(item.name) + ' will be restored to:<br><span style="font-size:9px;opacity:0.7">' + esc(item.originalPath || 'its original location') + '</span>',
            false, 0
        );
    } else {
        /* Group — two buttons */
        var groupLabel = 'Group contains ' + groupItems.length + ' item' + (groupItems.length !== 1 ? 's' : '') + '.';
        openRestoreModal(
            item.groupId, binDocId,
            typeLabel + ' RESTORATION',
            'Restoring <strong>' + esc(item.name) + '</strong>.<br><span style="font-size:9px;opacity:0.6">' + groupLabel + '</span>',
            true, subtreeCount
        );
    }
}

/*
 * countSubtree — BFS count of all descendants of rootItemId
 * within the bin group. Used for button label.
 */
function countSubtree(rootItemId, groupItems) {
    var count = 0;
    var queue = [rootItemId];
    while (queue.length > 0) {
        var current  = queue.shift();
        var children = groupItems.filter(function(i) { return i.parentId === current; });
        count += children.length;
        children.forEach(function(c) { queue.push(c.itemId); });
    }
    return count;
}

function openRestoreModal(groupId, binDocId, title, bodyHtml, showBothButtons, subtreeCount) {
    var thisLabel = subtreeCount > 0
        ? 'RESTORE THIS + ' + subtreeCount + ' NESTED'
        : 'RESTORE THIS';
    var singleBtn = showBothButtons && binDocId
        ? '<button class="modal-btn" onclick="doRestoreSingle(\'' + binDocId + '\')">' + thisLabel + '</button>'
        : '';
    var groupBtnLabel = showBothButtons ? 'RESTORE GROUP' : 'RESTORE';
    showModal(
        '<div style="text-align:center">' +
        '<span class="material-symbols-outlined restore-modal-icon">upload_file</span>' +
        '<div class="modal-title" style="justify-content:center;margin-bottom:10px">' + esc(title) + '</div>' +
        '<p class="modal-body-text" style="color:var(--sub)">' + bodyHtml + '</p>' +
        '<div class="modal-footer">' +
        '<button class="modal-btn primary" onclick="doRestore(\'' + groupId + '\')">' + groupBtnLabel + '</button>' +
        singleBtn +
        '<button class="modal-btn" onclick="closeModal()">CANCEL</button>' +
        '</div></div>', '460px'
    );
}

function confirmBulkRestore() {
    if (!_selectedIds.length) return;
    var groupIds   = getUniqueGroupIds(_selectedIds);
    var totalItems = _binItems.filter(function(i) { return groupIds.indexOf(i.groupId) !== -1; }).length;
    openRestoreModal(
        groupIds.join(','), null,
        'RESTORE ' + totalItems + ' ITEM' + (totalItems !== 1 ? 'S' : ''),
        'All selected items and their group members will be restored.',
        false, 0
    );
}

async function doRestore(groupIdsStr) {
    closeModal();
    var groupIds = groupIdsStr.split(',').filter(Boolean);
    for (var i = 0; i < groupIds.length; i++) {
        if (!groupIds[i]) continue;
        await window.BIN_FB.restoreGroup(groupIds[i]);
    }
    _selectedIds = _selectedIds.filter(function(docId) {
        var item = _binItems.find(function(x) { return x.id === docId; });
        return item && groupIds.indexOf(item.groupId) === -1;
    });
    syncBulkActions();
}

/*
 * doRestoreSingle
 * ───────────────
 * FIX v2.2 — Bug 2: was missing try/catch entirely.
 * Any Firestore error caused the modal to close silently
 * with no feedback — the user had no idea if it worked.
 *
 * Now wraps restoreSingleItem in try/catch:
 *   • On success → brief confirmation modal.
 *   • On failure → error modal reassuring the user their
 *     data is still safe in the bin and they can retry.
 */
async function doRestoreSingle(binDocId) {
    /* Find the item before closing the modal so we can
       reference its name in the feedback messages. */
    var item = _binItems.find(function(i) { return i.id === binDocId; });
    var itemName = item ? (item.name || 'Item') : 'Item';
    var itemPath = item ? (item.originalPath || '') : '';

    closeModal();
    removeFromSelection(binDocId);

    try {
        await window.BIN_FB.restoreSingleItem(binDocId);

        /* ── Success feedback ─────────────────────── */
        showModal(
            '<div style="text-align:center">' +
            '<span class="material-symbols-outlined" style="font-size:30px;color:#a1f7da;display:block;margin:0 auto 10px">check_circle</span>' +
            '<div class="modal-title" style="justify-content:center;margin-bottom:10px">RESTORED</div>' +
            '<p class="modal-body-text" style="color:var(--sub)">' +
            '<strong>' + esc(itemName) + '</strong> has been restored.<br>' +
            (itemPath
                ? '<span style="font-size:9px;opacity:0.6">Navigate to: ' + esc(itemPath) + '</span>'
                : '') +
            '</p>' +
            '<div class="modal-footer">' +
            '<button class="modal-btn primary" onclick="closeModal()">OK</button>' +
            '</div></div>', '400px'
        );

    } catch(e) {
        console.error('[Bin] restoreSingleItem failed:', e);

        /* ── Error feedback ───────────────────────── */
        showModal(
            '<div style="text-align:center">' +
            '<span class="material-symbols-outlined" style="font-size:30px;color:#ff7d7d;display:block;margin:0 auto 10px">error_outline</span>' +
            '<div class="modal-title" style="justify-content:center;margin-bottom:10px">RESTORE FAILED</div>' +
            '<p class="modal-body-text" style="color:var(--sub)">' +
            '<strong>' + esc(itemName) + '</strong> could not be restored right now.<br>' +
            '<span style="font-size:9px;opacity:0.6">Your item is still safely in the bin — please try again.</span>' +
            '</p>' +
            '<div class="modal-footer">' +
            '<button class="modal-btn primary" onclick="closeModal()">CLOSE</button>' +
            '</div></div>', '420px'
        );
    }

    syncBulkActions();
}

/* ─── ARCHIVE, FROM THE BIN ──────────────────────
   Reworded 2026-09-17. This used to say "Archive is coming in a future
   phase", which stopped being true once Scribble-archive.html shipped.
   There is still no one-step route from the bin to the shelf — the two
   keep separate collections and separate group structures — but there
   is a route, and it is worth naming instead of implying the feature
   does not exist. */
function confirmBulkArchive() {
    showModal(
        '<div style="text-align:center">' +
        '<div class="modal-title" style="justify-content:center;margin-bottom:10px">' +
        '<i class="fa-regular fa-folder-open" style="font-size:18px;color:var(--sub)"></i>&nbsp;ARCHIVE</div>' +
        '<p class="modal-body-text" style="color:var(--sub)">' +
        'Nothing can go straight from the bin to the Archive.</p>' +
        '<p class="modal-body-text" style="color:var(--sub)">' +
        'Restore it first — it returns to the place it came from — then ' +
        'archive it from there. Archiving keeps everything and never expires, ' +
        'so it is worth the extra step for anything you want to keep.</p>' +
        '<div class="modal-footer"><button class="modal-btn" onclick="closeModal()">CLOSE</button></div>' +
        '</div>', '400px'
    );
}

/* ─── NAVIGATION ─────────────────────────────── */
function gotoAllProjects() { window.location.href = 'Scribble.html'; }
/* gotoLifeHub() removed 2026-09-17 — it was a console.log stub. The
   header now carries two plain links to the real LifeHub pages. */

/* ─── MODAL SYSTEM ───────────────────────────── */
function showModal(content, width) {
    closeModal();
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay'; overlay.id = 'modal-overlay';
    overlay.addEventListener('click', function(e) { if (e.target === overlay) closeModal(); });
    var box = document.createElement('div');
    box.className = 'modal-box'; box.style.width = width || '520px'; box.innerHTML = content;
    overlay.appendChild(box); document.body.appendChild(overlay);
    _activeModal = overlay;
}
function closeModal() { if (_activeModal) { _activeModal.remove(); _activeModal = null; } }
document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeModal(); });

/* ─── HELPERS ────────────────────────────────── */
function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function removeFromSelection(id) {
    var idx = _selectedIds.indexOf(id);
    if (idx !== -1) _selectedIds.splice(idx, 1);
}
