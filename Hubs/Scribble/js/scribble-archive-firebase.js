/* ═══════════════════════════════════════════════════
   SCRIBBLE — ARCHIVE FIREBASE
   scribble-archive-firebase.js

   Archive is a SHELF, not a bin:
     · nothing expires, nothing is ever auto-removed
     · the only action is Restore
     · items are soft-flagged (archived:true) on their own
       document, so content, records, tags, versions and
       logs are never touched

   Mirrors the recycle bin's group/cascade structure so
   restoring a module brings its whole subtree back — but
   the bin's own files are not touched by any of this.
═══════════════════════════════════════════════════ */
import './scribble-boot.js';
import { db, nowFields, whenDate, merge, remove, add, commit } from './scribble-db.js';
import {
    collection, doc, query, where, orderBy,
    onSnapshot,
    getDocs, getDoc, serverTimestamp, writeBatch
} from './vendor/firebase.js';

const COLL = { module: 'modules', section: 'sections', file: 'files' };
const TYPE = { module: 'MODULE',  section: 'SECTION',  file: 'FILE'  };

/* Firestore hard limit is 500 writes per batch; leave headroom. */
const BATCH_MAX = 450;

/*
 * Commit a queue of writes in as few round trips as possible.
 * Each op is a function that takes the batch and adds itself to it,
 * which keeps the call sites reading like the plain awaits they replaced.
 */
async function commitOps(ops) {
    for (let i = 0; i < ops.length; i += BATCH_MAX) {
        const batch = writeBatch(db);
        ops.slice(i, i + BATCH_MAX).forEach(op => op(batch));
        await commit(batch);
    }
}

/* ══════════════════════════════════════════════════
   LISTEN — everything currently on the shelf
══════════════════════════════════════════════════ */
function listenArchiveItems(callback) {
    return onSnapshot(
        query(collection(db, 'archive'), orderBy('archivedAt', 'desc')),
        snap => {
            const items = snap.docs.map(d => {
                const data = d.data();
                /* whenDate, so a project shelved offline shows its real
                   date instead of a blank until the queue flushes. */
                const at   = whenDate(data, 'archivedAt');
                return {
                    id: d.id,
                    ...data,
                    archivedDate: at,
                    archivedMs:   at ? at.getTime() : 0
                };
            });
            callback(items);
        },
        err => {
            console.warn('[Archive] listener:', err.message);
            callback([]);
        }
    );
}

/* ══════════════════════════════════════════════════
   PATH — readable "Project / Module / Section"
══════════════════════════════════════════════════ */
function buildPath(projectName, parentId, folders) {
    const parts = [];
    let cur = parentId;
    const seen = new Set();
    while (cur && !seen.has(cur)) {
        seen.add(cur);
        const anc = folders.get(cur);
        if (!anc) break;
        parts.unshift(anc.name || 'Untitled');
        cur = anc.parentId || null;
    }
    return [projectName, ...parts].join(' / ');
}

async function loadTree(pid) {
    const [projSnap, modSnap, secSnap, fileSnap] = await Promise.all([
        getDoc(doc(db, 'projects', pid)),
        getDocs(collection(db, 'projects', pid, 'modules')),
        getDocs(collection(db, 'projects', pid, 'sections')),
        getDocs(collection(db, 'projects', pid, 'files'))
    ]);

    const all = [
        ...modSnap.docs.map(d  => ({ id: d.id, _t: 'module',  ...d.data() })),
        ...secSnap.docs.map(d  => ({ id: d.id, _t: 'section', ...d.data() })),
        ...fileSnap.docs.map(d => ({ id: d.id, _t: 'file',    ...d.data() }))
    ];

    const folders = new Map();
    all.forEach(x => { if (x._t !== 'file') folders.set(x.id, x); });

    return {
        projectName: projSnap.exists() ? (projSnap.data().name || 'Project') : 'Project',
        all,
        folders
    };
}

/* ══════════════════════════════════════════════════
   ARCHIVE AN ITEM  (module / section / file)
   Walks the subtree so a shelved module takes its
   contents with it, all under one groupId.
══════════════════════════════════════════════════ */
async function archiveItem(pid, itemType, id, note) {
    const coll = COLL[itemType];
    if (!coll) throw new Error('Unknown item type: ' + itemType);

    const targetSnap = await getDoc(doc(db, 'projects', pid, coll, id));
    if (!targetSnap.exists()) throw new Error('That item no longer exists.');
    const target = targetSnap.data();
    if (target.archived) throw new Error('That item is already archived.');

    const { projectName, all, folders } = await loadTree(pid);

    /* BFS the subtree — same traversal the bin uses. */
    const toArchive = [{ id, _t: itemType, ...target }];
    if (itemType !== 'file') {
        const queue = [id];
        const seen  = new Set([id]);
        while (queue.length) {
            const cur = queue.shift();
            all.filter(x => x.parentId === cur && !x.deleted && !x.archived && !seen.has(x.id))
               .forEach(child => {
                   seen.add(child.id);
                   toArchive.push(child);
                   if (child._t !== 'file') queue.push(child.id);
               });
        }
    }

    const groupId = id;
    const now     = nowFields('archivedAt');

    /* ══════════════════════════════════════════════════
       SYMLINK CASCADE — added 2026-09-17
       ══════════════════════════════════════════════════
       The bin has done this since it was written; the shelf
       never did. Archive a linked module and every pointer
       at it stayed live, opening into content that is no
       longer anywhere on the grid.

       Worse than the bin's version of the same bug, in one
       way: getRawFileDoc() refuses a `deleted` document but
       says nothing about an `archived` one, so a link to a
       shelved file would still OPEN it and let you edit it.
       You would be typing into something you had put away.

       Pointers live in the DESTINATION project, so no
       parentId walk can reach them — they have to be hunted.
       findSymlinksToAny does it in three collection-group
       queries, and for most items finds nothing at all.

       ── WHY THIS RUNS BEFORE THE BATCH ────────────────
       softDeleteItem hunts pointers AFTER its writes, in a
       non-awaited IIFE, because the bin's writes are not
       atomic anyway. This function's whole promise is that
       "either the group is shelved or none of it is", so the
       pointers go into the SAME batch as the content. That
       also makes groupSize honest — the count the archive
       page shows now includes the links.
    ══════════════════════════════════════════════════ */
    const archivedIds = toArchive.map(x => x.id);
    const inGroup     = new Set(archivedIds);
    let   pointers    = [];

    /* findSymlinksToAny belongs to scribble-project-firebase.js, which
       is loaded on the project page — the only page archiveItem is
       reachable from. Guarded rather than imported: these two modules
       share no code, and a missing cascade must not fail an archive. */
    if (window.PROJECT_FB && typeof window.PROJECT_FB.findSymlinksToAny === 'function') {
        try {
            const found = await window.PROJECT_FB.findSymlinksToAny(archivedIds);
            pointers = found.filter(p =>
                /* findSymlinksToAny skips `deleted` but not `archived`,
                   so an already-shelved pointer would be shelved twice. */
                !p.archived &&
                /* A link that lives INSIDE this subtree is already in
                   toArchive as ordinary content. Archiving it again
                   would write two rows for one document. */
                !inGroup.has(p.id));
        } catch (e) {
            console.warn('[Archive] symlink cascade skipped:', e.message);
        }
    } else {
        console.warn('[Archive] PROJECT_FB is not on this page — links ' +
                     'pointing at this item will not be shelved with it.');
    }

    const groupSize = toArchive.length + pointers.length;

    /*
     * Queued, not awaited one at a time.
     *
     * This loop used to cost two sequential round trips per item — the
     * shelf entry, then the flag on the item itself. Shelving a module
     * with thirty files meant sixty trips in single file, and the tree
     * did not visibly change until the last one landed.
     *
     * Nothing here depends on the outcome of an earlier write, so the
     * whole subtree goes up in one batch and lands atomically: either
     * the group is shelved or none of it is.
     */
    const ops = [];

    for (const item of toArchive) {
        const sub = COLL[item._t];
        ops.push(b => b.set(doc(collection(db, 'archive')), {
            type:         TYPE[item._t],
            itemId:       item.id,
            projectId:    pid,
            projectName,
            parentId:     item.parentId || null,
            groupId,
            groupSize,
            name:         item.name || 'Untitled',
            fileType:     item._t === 'file' ? (item.type || null) : null,
            colour:       item.colour || null,
            isSymlink:    item.isSymlink === true,
            originalPath: buildPath(projectName, item.parentId || null, folders),
            note:         (item.id === id ? (note || '') : ''),
            ...now,
            /* Everything needed to rebuild the doc if it ever vanishes. */
            data: {
                name:              item.name || '',
                description:       item.description || '',
                parentId:          item.parentId || null,
                type:              item.type || null,
                colour:            item.colour || null,
                isSymlink:         item.isSymlink === true,
                targetId:          item.targetId || null,
                targetType:        item.targetType || null,
                targetProjectId:   item.targetProjectId || null,
                targetProjectName: item.targetProjectName || null,
            }
        }));

        ops.push(b => b.update(doc(db, 'projects', pid, sub, item.id), {
            archived: true, ...now
        }));
    }

    /* ── The pointers, in the same batch ──────────────────────────
       Each one lives in its OWN project, which is the whole reason a
       parentId walk cannot find them. A Firestore batch is per
       database, not per project, so these ride along atomically with
       the content above.

       isSymlinkPointer is what restoreArchived reads to tell a link
       apart from real content: a pointer is NOT part of the parentId
       tree and must never be walked as though it were. linkTargetId
       is how restore decides whether the thing it points at actually
       came back. Both mirror the bin's bin-row fields exactly. */
    for (const ptr of pointers) {
        const sub  = ptr._subcol;
        const host = ptr._hostProjectName || 'Project';

        ops.push(b => b.set(doc(collection(db, 'archive')), {
            type:         sub === 'modules'  ? 'MODULE'
                        : sub === 'sections' ? 'SECTION' : 'FILE',
            itemId:       ptr.id,
            projectId:    ptr._hostProjectId,
            projectName:  host,
            parentId:     ptr.parentId || null,
            groupId,
            groupSize,
            name:         ptr.name || 'Untitled',
            fileType:     ptr.targetType || null,
            colour:       ptr.colour || null,
            isSymlink:    true,
            isSymlinkPointer: true,
            linkTargetId: ptr.targetId || null,
            /* No folder map for someone else's project, so the shallow
               two-part path the bin uses for pointers. */
            originalPath: host + ' / ' + (ptr.name || 'Untitled'),
            note:         '',
            ...now,
            data: {
                name:              ptr.name || '',
                description:       ptr.description || '',
                parentId:          ptr.parentId || null,
                type:              ptr.type || null,
                colour:            ptr.colour || null,
                /* The fields that make it a link at all. The bin once
                   dropped these and a rebuilt pointer came back as an
                   empty orphan file; not repeating that here. */
                isSymlink:         true,
                targetId:          ptr.targetId || null,
                targetType:        ptr.targetType || null,
                targetProjectId:   ptr.targetProjectId || null,
                targetProjectName: ptr.targetProjectName || null,
            }
        }));

        ops.push(b => b.update(doc(db, 'projects', ptr._hostProjectId, sub, ptr.id), {
            archived: true, ...now
        }));
    }

    await commitOps(ops);

    /* The log is not part of the archive — it must never hold up the tree. */
    writeLog(pid, "Archived '" + (target.name || 'Untitled') + "'.", id)
        .catch(e => console.warn('[Archive] log:', e.message));

    /* One line in each HOST project, so a link vanishing from a folder
       has a traceable cause there rather than only in the project that
       did the archiving. */
    for (const ptr of pointers) {
        writeLog(ptr._hostProjectId,
            "Link followed '" + (target.name || 'Untitled') + "' into the archive.",
            ptr.id).catch(e => console.warn('[Archive] pointer log:', e.message));
    }

    return groupSize;
}

/* ══════════════════════════════════════════════════
   ARCHIVE A WHOLE PROJECT
   The project doc is flagged; its contents stay exactly
   as they are and come back untouched on restore.
══════════════════════════════════════════════════ */
async function archiveProject(pid, note) {
    const snap = await getDoc(doc(db, 'projects', pid));
    if (!snap.exists()) throw new Error('That project no longer exists.');
    const p = snap.data();
    if (p.archived) throw new Error('That project is already archived.');

    const now = nowFields('archivedAt');

    /* 2026-09-21 — ROOM. originalPath below was the hard-coded string
       'All Projects'; it is what the shelf shows under "came from", so a
       shelved Deployment project named the wrong room. Kept in step with
       the twin copy of this function in scribble-firebase.js, which the
       landing page uses — the two must agree or the shelf reads
       differently depending on which page did the archiving.
       Restore is unaffected: restoreArchived flips `archived` on the
       project document, which never left, so the room comes back with
       it. Missing field reads as 'all', same rule as everywhere. */
    const room = (p.room === 'deploy') ? 'deploy' : 'all';

    /* Both writes together, so a shelf entry can never exist for a
       project that is not actually shelved (or the other way round). */
    await commitOps([
        b => b.set(doc(collection(db, 'archive')), {
            type:         'PROJECT',
            itemId:       pid,
            projectId:    pid,
            projectName:  p.name || 'Project',
            parentId:     null,
            groupId:      pid,
            groupSize:    1,
            name:         p.name || 'Project',
            fileType:     null,
            colour:       p.colour || null,
            isSymlink:    false,
            originalPath: room === 'deploy' ? 'Deployment' : 'All Projects',
            note:         note || '',
            ...now,
            data: { name: p.name || '', description: p.description || '', room: room }
        }),
        b => b.update(doc(db, 'projects', pid), { archived: true, ...now })
    ]);

    writeLog(pid, 'Project archived.', null)
        .catch(e => console.warn('[Archive] log:', e.message));
    return 1;
}

/* ══════════════════════════════════════════════════
   NAME CONFLICTS ON RESTORE
   A restore can't be refused, so a clash auto-renames.

   ── FIXED 2026-09-17 ──────────────────────────────
   The comment here used to say matching was "exact
   (case-sensitive) to agree with the duplicate gate
   used everywhere else". It did not agree with it.
   Nothing else in Scribble compares names that way:

     findItemClash    (project-firebase.js) → normName
     resolveNameConflict (recycle-bin-fb)   → normName
     findProjectByName   (scribble-fb)      → normName

   All three lowercase before comparing. This one
   compared `(data.name || '').trim()` as typed, so a
   restore could put `notes` back beside a live `Notes`
   — two names Scribble's own create path calls the
   same and refuses. The archive was the only door that
   let that state in, and once in, the next rename or
   move of either one would be refused by the gate for
   a clash you could see but not explain.

   Now it lowercases like the rest. The file-type check
   does too, for the same reason: `.TXT` and `.txt` are
   one extension everywhere else.

   What gets STORED is still exactly what you typed —
   `chosen` is built from the untouched `base`. Only the
   comparison is loose, which is the rule in every other
   file.
══════════════════════════════════════════════════ */

/* Same three lines as project-firebase.js and the bin. Copied rather
   than imported: this module has its own Firestore imports and shares
   no code with either, and a name rule that lives in one place would
   still have to be duplicated to be reachable from here. */
function normName(s) {
    return String(s == null ? '' : s).trim().toLowerCase();
}

/*
 * @param claimed  optional Set shared across one restore.
 *
 * Names handed out earlier in the same restore have not been written yet,
 * so the query below cannot see them. Without this, two items rebuilt into
 * the same folder would both look up "Report", both find it taken once,
 * and both settle on "Report (2)".
 *
 * The claimed keys are normalised too — otherwise "Report" and "report"
 * handed out in the same restore would not see each other, which is the
 * very collision this whole function exists to prevent.
 */
async function resolveName(pid, sub, parentId, name, type, claimed) {
    const snap = await getDocs(query(
        collection(db, 'projects', pid, sub),
        where('parentId', '==', parentId || null)
    ));

    const taken = new Set();
    snap.docs.forEach(d => {
        const data = d.data();
        if (data.deleted || data.archived) return;
        /* A file's identity is name AND extension, so notes.txt does not
           block notes.md — matched case-blind, like the name. */
        if (sub === 'files' && type && normName(data.type) !== normName(type)) return;
        taken.add(normName(data.name));
    });

    /* Scoped per folder, so a name claimed in one place does not block
       the same name somewhere else in the tree. */
    const scope  = pid + '|' + sub + '|' + (parentId || '') + '|';
    const isFree = n => !taken.has(normName(n)) &&
                        !(claimed && claimed.has(scope + normName(n)));

    const base = (name || 'Untitled').trim();
    let chosen = base;
    if (!isFree(base)) {
        let i = 2;
        while (!isFree(base + ' (' + i + ')')) i++;
        chosen = base + ' (' + i + ')';
    }
    if (claimed) claimed.add(scope + normName(chosen));
    return chosen;
}

/* ══════════════════════════════════════════════════
   RESTORE
   Flips the flag back on the item's OWN document, so the
   id never changes and every subcollection — versions
   above all — stays attached.
══════════════════════════════════════════════════ */
async function restoreArchived(archiveDocId) {
    const ref  = doc(db, 'archive', archiveDocId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('That archive entry no longer exists.');
    const item = snap.data();

    if (item.type === 'PROJECT') {
        /* Together, so the shelf entry can never be cleared without the
           project actually coming back. */
        await commitOps([
            b => b.update(doc(db, 'projects', item.itemId), {
                archived: false,
                archivedAt: null, archivedAtLocalMs: null,
                ...nowFields('updatedAt')
            }),
            b => b.delete(ref)
        ]);
        writeLog(item.projectId, 'Project restored from archive.', null)
            .catch(e => console.warn('[Archive] log:', e.message));
        return 1;
    }

    /* Restore the whole group the item belongs to. */
    const groupSnap = await getDocs(query(
        collection(db, 'archive'),
        where('groupId', '==', item.groupId)
    ));

    const inGroup = groupSnap.docs
        .map(d => ({ _archiveId: d.id, ...d.data() }))
        .filter(r => r.type !== 'PROJECT');

    /* Pointers are split out and handled last — added 2026-09-17.
       A link sits OUTSIDE the parentId tree, usually in another
       project entirely, so it must never be walked as content: the
       parents-before-children sort below would place it by a parentId
       that means nothing here. Same split the bin makes. */
    const rows     = inGroup.filter(r => !r.isSymlinkPointer);
    const pointers = inGroup.filter(r =>  r.isSymlinkPointer);

    /* Parents first, so a restored child never lands in a
       folder that hasn't come back yet. */
    rows.sort((a, b) => (a.type === 'FILE' ? 1 : 0) - (b.type === 'FILE' ? 1 : 0));

    const subOf = r => r.type === 'MODULE'  ? 'modules'
                     : r.type === 'SECTION' ? 'sections'
                     : 'files';

    /*
     * The existence checks are pure reads with no side effects, so they all
     * go at once rather than one per item. This was half the wait: a group
     * of forty needed forty sequential reads before a single write happened.
     */
    const snaps = await Promise.all(rows.map(r =>
        getDoc(doc(db, 'projects', r.projectId, subOf(r), r.itemId)).catch(() => null)
    ));

    let restored = 0;
    const failed = [];
    /* Shared across this restore so parallel rebuilds cannot pick the
       same auto-renamed name. See resolveName. */
    const claimed = new Set();
    /* Which items actually came back. A link is only revived if the thing
       it points at is in here — see restoreArchivedPointers. */
    const revived = new Set();

    /*
     * Deliberately NOT a batch. The try/catch is load-bearing: a row that
     * fails keeps its archive entry so it can be retried on its own, and
     * the rest of the group still comes back. A batch would replace that
     * with all-or-nothing. Promise.all removes the queuing without
     * touching the per-item semantics.
     */
    async function restoreRow(row, idx) {
        const sub = subOf(row);
        try {
            const itemRef  = doc(db, 'projects', row.projectId, sub, row.itemId);
            const itemSnap = snaps[idx];
            if (!itemSnap) throw new Error('Could not read that item.');

            if (itemSnap.exists()) {
                /* Only the ROOT of the group can clash with a live sibling;
                   its descendants land back inside it. */
                const patch = {
                    archived: false,
                    archivedAt: null, archivedAtLocalMs: null,
                    ...nowFields('updatedAt')
                };
                if (row.itemId === row.groupId) {
                    patch.name = await resolveName(
                        row.projectId, sub, row.parentId, row.name, row.fileType, claimed);
                }
                await merge(itemRef, patch);
            } else {
                /* Document is gone — rebuild from the snapshot we kept. */
                const name = await resolveName(
                    row.projectId, sub, row.parentId, row.name, row.fileType, claimed);
                add(collection(db, 'projects', row.projectId, sub), {
                    ...(row.data || {}),
                    name,
                    projectId: row.projectId,
                    parentId:  row.parentId || null,
                    archived:  false, archivedAt: null, archivedAtLocalMs: null,
                    deleted:   false, deletedAt:  null, deletedAtLocalMs:  null,
                    ...nowFields('createdAt'),
                    ...nowFields('updatedAt')
                });
            }

            /* Entry removed once the restore write is queued — the two
               travel together, so they arrive together. */
            await remove(doc(db, 'archive', row._archiveId));
            restored++;
            revived.add(row.itemId);
        } catch (e) {
            console.warn('[Archive] restore failed, entry kept:', row.itemId, e.message);
            failed.push({ name: row.name, message: e.message });
        }
    }

    /* Folders before files, exactly as the sort above intended — but
       everything inside one tier is independent, so a tier runs at once. */
    const indexed = rows.map((r, i) => ({ r, i }));
    await Promise.all(indexed.filter(x => x.r.type !== 'FILE').map(x => restoreRow(x.r, x.i)));
    await Promise.all(indexed.filter(x => x.r.type === 'FILE').map(x => restoreRow(x.r, x.i)));

    /* Links LAST, and only the ones whose target actually made it back —
       added 2026-09-17. Deliberately after both content passes: a link
       revived before its target would be live and pointing at something
       still on the shelf, which is the dangling state this whole cascade
       exists to prevent. */
    await restoreArchivedPointers(pointers, revived);

    writeLog(item.projectId, "Restored '" + (item.name || 'Untitled') + "' from archive.", item.itemId)
        .catch(e => console.warn('[Archive] log:', e.message));
    if (failed.length) {
        const err = new Error(failed.length + ' item(s) could not be restored.');
        err.partial = { restored, failed };
        throw err;
    }
    return restored;
}

/* ══════════════════════════════════════════════════
   BRINGING THE LINKS BACK
   Added 2026-09-17. The other half of the cascade in
   archiveItem — mirrors restoreSymlinkPointers() in
   js/scribble-recycle-bin-firebase.js.

   Pointers are restored FLAT, in their own host project,
   and never through the parentId walk: a link's parentId
   describes a folder in a project this restore may not
   have touched at all.

   The id never changes on an archive restore — the flag
   is flipped on the document itself — so unlike the bin
   there is nothing to repoint. linkTargetId still matches.
══════════════════════════════════════════════════ */
async function restoreArchivedPointers(pointers, revived) {
    if (!pointers || !pointers.length) return 0;

    const subOf = r => r.type === 'MODULE'  ? 'modules'
                     : r.type === 'SECTION' ? 'sections'
                     : 'files';

    let n = 0;

    /* Independent of each other, so they go at once — but each keeps its
       own try/catch, because a pointer that fails must keep its archive
       entry rather than take the rest of the group down with it. */
    await Promise.all(pointers.map(async row => {
        /* A link whose target is still shelved stays shelved with it.
           Reviving it would put a live link in front of something you
           deliberately put away — exactly the state being fixed. */
        if (!revived.has(row.linkTargetId)) return;

        const sub = subOf(row);
        try {
            const ref  = doc(db, 'projects', row.projectId, sub, row.itemId);
            const live = await getDoc(ref);

            if (live.exists()) {
                await merge(ref, {
                    archived: false,
                    archivedAt: null, archivedAtLocalMs: null,
                    ...nowFields('updatedAt')
                });
            } else {
                /* Gone entirely — rebuilt from the snapshot. `data` carries
                   isSymlink/targetId/targetProjectId, so what comes back is
                   a link and not an empty orphan file.

                   No resolveName here, on purpose: a pointer's name IS its
                   target's name, and renaming it to "X (2)" would make the
                   link lie about what it points at. createSymlink refuses a
                   clash for the same reason. */
                add(collection(db, 'projects', row.projectId, sub), {
                    ...(row.data || {}),
                    name:      row.name || 'Untitled',
                    projectId: row.projectId,
                    parentId:  row.parentId || null,
                    archived: false, archivedAt: null, archivedAtLocalMs: null,
                    deleted:  false, deletedAt:  null, deletedAtLocalMs:  null,
                    ...nowFields('createdAt'),
                    ...nowFields('updatedAt')
                });
            }

            await remove(doc(db, 'archive', row._archiveId));
            n++;

            writeLog(row.projectId,
                "Link followed '" + (row.name || 'Untitled') + "' back out of the archive.",
                row.itemId).catch(() => {});
        } catch (e) {
            console.warn('[Archive] pointer restore failed, entry kept:',
                         row.itemId, e.message);
        }
    }));

    return n;
}

/* Editable shelf note — why this was put away. */
async function updateArchiveNote(archiveDocId, note) {
    await merge(doc(db, 'archive', archiveDocId), { note: (note || '').trim() });
    return true;
}

async function writeLog(pid, action, itemId) {
    if (!pid) return;
    try {
        const entry = {
            action,
            kind:   'archive',
            weight: 3,
            actorId: 'local', actorName: 'You', actorSurface: 'archive',
            schema: 2,
            ...nowFields('timestamp')
        };
        if (itemId) entry.itemId = itemId;
        add(collection(db, 'projects', pid, 'logs'), entry);
    } catch (e) { /* logging must never block the action */ }
}

window.ARCHIVE_FB = {
    listenArchiveItems,
    archiveItem,
    archiveProject,
    restoreArchived,
    updateArchiveNote
};

if (typeof window.ARCHIVE_READY === 'function') window.ARCHIVE_READY();
