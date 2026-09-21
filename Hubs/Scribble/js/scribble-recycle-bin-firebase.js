/* ═══════════════════════════════════════════════════
   SCRIBBLE — RECYCLE BIN FIREBASE MODULE  v2.3
   scribble-recycle-bin-firebase.js  (type="module")
   Exposes → window.BIN_FB | Signals → window.BIN_READY()

   v2.3 — Single-item restore: three critical fixes
   ──────────────────────────────────────────────────
   BUG 1 (partial state / items appear "lost"):
     doRestoreItem caught errors internally and did
     `return` instead of `throw`. The caller's cleanup
     loop then ran and deleted ancestor bin entries
     (MODULE, SECTION) even though the target item was
     never actually restored. Items disappeared from the
     bin but never appeared in the project.
     FIX: catch block now re-throws so the cleanup loop
     only runs when the FULL restore succeeded.

   BUG 2 (silent failure — no feedback):
     doRestoreSingle (in scribble-recycle-bin.js) had
     no try/catch. Any exception meant the modal closed
     silently and nothing happened.
     FIX: doRestoreSingle now catches and shows an error
     modal so the user knows to retry.

   BUG 3 (hierarchy creation silently aborted):
     The "Create fresh" addDoc calls in
     findOrRestoreProject and findOrRestoreSubItem were
     outside any try/catch. A Firestore error there
     threw an uncaught exception that aborted the whole
     restore without any cleanup or feedback. This is
     exactly why "It DID NOT create a new hierarchy."
     FIX: both create-fresh paths are now wrapped in
     try/catch and re-throw with a descriptive message.

   v2.2 — Restoration safety fixes (Bug 1-3 from that
     version — see history below).
   v2.1 — Single-item restore with path reconstruction.
   v2.0 — Unified bin listener + group restore/delete.
═══════════════════════════════════════════════════ */

import './scribble-boot.js';
import {
    db, nowFields, whenMs, whenDate,
    save, merge, remove, add, newRef, commit
} from './scribble-db.js';
import {
    collection, collectionGroup, doc,
    query, where, orderBy, limit,
    onSnapshot,
    getDocs, getDoc, serverTimestamp, writeBatch
} from './vendor/firebase.js';

/* Firestore hard limit is 500 writes per batch; leave headroom. */
const BATCH_MAX = 450;

/*
 * Commit a queue of deletes in as few round trips as possible.
 *
 * Only ever used where the writes are genuinely independent and a
 * partial result would be meaningless — purging. Deleting a document
 * that has already gone is a no-op in Firestore, so a stale reference
 * cannot wedge the batch the way a failed update would.
 */
async function commitOps(ops) {
    for (let i = 0; i < ops.length; i += BATCH_MAX) {
        const batch = writeBatch(db);
        ops.slice(i, i + BATCH_MAX).forEach(op => op(batch));
        await commit(batch);
    }
}

/* ══════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════ */
// Restores previously only wrote to the global sidebar feed — items had
// no "Restored" line in their OWN log at all. This writes that.
async function logRestore(pid, itemId) {
    try {
        add(collection(db, 'projects', pid, 'logs'), {
            action: 'Restored from bin.', itemId, ...nowFields('timestamp')
        });
    } catch (e) { console.warn('[Bin] logRestore failed:', e.message); }
}

/* Takes the document, not the field, so an item deleted
   offline counts down from when you deleted it rather than
   showing "Expired" while its timestamp is still pending. */
const calcDaysLeft = (data) => {
    const ms = whenMs(data, 'deletedAt');
    if (!ms) return 0;
    return Math.max(0, 30 - Math.floor((Date.now() - ms) / 86400000));
};

const buildLegacyItem = (p) => {
    const legacyGroupId = 'legacy_' + p.id;
    return {
        id: legacyGroupId, type: 'PROJECT',
        itemId: p.id, projectId: p.id, projectName: p.name || '',
        parentId: null, groupId: legacyGroupId,
        name: p.name || 'Untitled', fileType: null, colour: null,
        deletedAt: p.deletedAt || null, daysLeft: calcDaysLeft(p),
        originalPath: p.name || 'Root', parentChain: [],
        groupSize: 1, isLegacy: true, data: p,
    };
};

/* ══════════════════════════════════════════════════
   REAL-TIME LISTENER
══════════════════════════════════════════════════ */
function listenBinItems(callback) {
    const state = { binItems: [], allProjects: [] };

    /*
     * Both listeners fire on first load, and each one used to paint
     * the whole table. Coalescing to one render per tick halves the
     * work on open and stops the row flash you get when the second
     * snapshot lands a few milliseconds after the first.
     */
    let queued = false;
    const notify = () => {
        if (queued) return;
        queued = true;
        Promise.resolve().then(() => {
            queued = false;
            const trackedProjectIds = new Set(
                state.binItems.filter(i => i.type === 'PROJECT').map(i => i.itemId)
            );
            const legacy = state.allProjects
                .filter(p => p.deleted && !trackedProjectIds.has(p.id))
                .map(buildLegacyItem);
            callback([...state.binItems, ...legacy]);
        });
    };

    const u1 = onSnapshot(
        query(collection(db, 'bin'), orderBy('deletedAt', 'desc')),
        snap => {
            state.binItems = snap.docs.map(d => {
                const data = d.data();
                return { id: d.id, ...data, daysLeft: calcDaysLeft(data) };
            });
            notify();
        },
        err => console.warn('[Bin] bin listener:', err.message)
    );

    /*
     * ── THE LATENCY FIX ───────────────────────────────
     * This used to listen to the ENTIRE projects collection and
     * throw away everything without deleted:true. On an archive of
     * any size that meant downloading every project document — and
     * holding a live listener on all of them — just to find the
     * handful of legacy rows that predate the bin collection.
     *
     * Filtering server-side turns "read everything you own" into
     * "read the deleted ones", which is normally none. Single-field
     * filter, so Firestore's automatic index covers it — nothing to
     * create by hand.
     *
     * Projects with no `deleted` field are excluded by the query,
     * which is correct: a missing flag means not deleted.
     */
    const u2 = onSnapshot(
        query(collection(db, 'projects'), where('deleted', '==', true)),
        snap => {
            state.allProjects = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            notify();
        },
        err => console.warn('[Bin] projects listener:', err.message)
    );

    return () => { u1(); u2(); };
}


/* ══════════════════════════════════════════════════
   SYMLINK POINTER RESTORE
   Pointers ride in the same group but sit OUTSIDE the
   parentId tree — often in another project entirely.
   They are restored flat, in their own host project,
   after the content they point at is back.
══════════════════════════════════════════════════ */
async function restoreSymlinkPointers(groupId, restoredTargetIds) {
    let snap;
    try {
        snap = await getDocs(query(collection(db, 'bin'), where('groupId', '==', groupId)));
    } catch(e) { return; }

    /* Pointers sit outside the parentId tree and never reference each
       other, so they are independent — but each keeps its own try/catch,
       because a pointer that fails must keep its bin entry rather than
       take the whole group down with it. Promise.all removes the queuing
       without changing a single one of those semantics. */
    const pointers = snap.docs.filter(d => {
        const ptr = d.data();
        if (!ptr.isSymlinkPointer) return false;
        /* Only revive links whose target actually came back. If the target
           is still binned, the link stays binned with it — a live link to
           a deleted file is exactly the dangling state we're fixing. */
        if (restoredTargetIds && !restoredTargetIds.has(ptr.linkTargetId)) return false;
        return true;
    });

    await Promise.all(pointers.map(async binDoc => {
        const ptr = binDoc.data();
        const subcol = ptr.type === 'MODULE'  ? 'modules'
                     : ptr.type === 'SECTION' ? 'sections'
                     : 'files';
        try {
            const ref  = doc(db, 'projects', ptr.projectId, subcol, ptr.itemId);
            const live = await getDoc(ref);
            if (live.exists()) {
                await merge(ref, { deleted: false, deletedAt: null, deletedAtLocalMs: null });
            } else {
                add(collection(db, 'projects', ptr.projectId, subcol), {
                    ...(ptr.data || {}),
                    projectId: ptr.projectId,
                    parentId:  ptr.parentId || null,
                    deleted: false, deletedAt: null, deletedAtLocalMs: null,
                    ...nowFields('createdAt'), ...nowFields('updatedAt'),
                });
            }
            await remove(doc(db, 'bin', binDoc.id));
        } catch(e) {
            console.warn('[Bin] pointer restore failed, entry kept:', ptr.itemId, e.message);
        }
    }));
}

/* ══════════════════════════════════════════════════
   RESTORE GROUP  (all items sharing groupId)
══════════════════════════════════════════════════ */
async function restoreGroup(groupId) {
    if (groupId.startsWith('legacy_')) {
        try {
            const projectId = groupId.replace('legacy_', '');
            await merge(doc(db, 'projects', projectId),
                { deleted: false, deletedAt: null, deletedAtLocalMs: null });
            add(collection(db, 'projects', projectId, 'logs'), {
                action: 'Restored from bin.', ...nowFields('timestamp')
            });
            add(collection(db, 'logs'), { filename: 'Project (restored)', ...nowFields('timestamp') });
        } catch(e) { console.warn('[Bin] legacy restore failed:', e.message); }
        return;
    }

    const snap = await getDocs(query(collection(db, 'bin'), where('groupId', '==', groupId)));
    let restoredName = '';
    let rootPid = '', rootItemId = '';

    const restoredTargetIds = new Set();

    const rows = snap.docs.filter(d => !d.data().isSymlinkPointer);

    /* Read off the group's identity before restoring, so this no longer
       depends on the loop running in order. */
    rows.forEach(d => {
        const item = d.data();
        restoredName = restoredName || item.name;
        // The root of the group is the item whose itemId matches the groupId
        // (softDeleteItem sets groupId = the deleted root's own id).
        if (item.itemId === groupId) { rootPid = item.projectId; rootItemId = item.itemId; }
    });

    /*
     * Deliberately NOT a batch.
     *
     * Every item here flips its own `deleted` flag back and then drops its
     * own bin entry — independent of each other, but the try/catch is
     * load-bearing: an item that fails keeps its bin entry so it can be
     * retried alone, while the rest of the group still comes back. A batch
     * would trade that for all-or-nothing, and one stale reference would
     * make the whole group unrestorable.
     *
     * Promise.all removes the sequential wait and changes nothing else:
     * each item still succeeds or fails entirely on its own.
     */
    const SUBCOL = { MODULE: 'modules', SECTION: 'sections', FILE: 'files' };

    await Promise.all(rows.map(async binDoc => {
        const item = binDoc.data();
        try {
            /* An unrecognised type updates nothing but still clears its bin
               entry, exactly as the original if/else-if chain did — falling
               through it was a no-op, not a failure. */
            const ref = item.type === 'PROJECT'
                ? doc(db, 'projects', item.itemId)
                : (SUBCOL[item.type]
                    ? doc(db, 'projects', item.projectId, SUBCOL[item.type], item.itemId)
                    : null);

            if (ref) {
                /*
                 * ── WHY THIS READS FIRST ──────────────────────────
                 * merge() is updateDoc, which FAILS on a document
                 * that no longer exists — and since writes now
                 * resolve as soon as they are queued, that failure
                 * arrives long after this try/catch has finished.
                 * The bin entry below was then deleted anyway, so an
                 * item whose document had been hard-deleted vanished
                 * from the bin without ever coming back.
                 *
                 * Checking first, and rebuilding from the snapshot
                 * the bin already carries, makes group restore as
                 * robust as the single-item path. Rebuilt onto the
                 * SAME ref, so the id survives and every sibling's
                 * parentId still points at the right place.
                 */
                const live = await getDoc(ref);

                if (live.exists()) {
                    await merge(ref, {
                        deleted: false, deletedAt: null, deletedAtLocalMs: null
                    });
                } else {
                    await save(ref, {
                        ...(item.data || {}),
                        name:      item.name || (item.data && item.data.name) || 'Untitled',
                        parentId:  item.parentId || null,
                        ...(item.type === 'PROJECT'
                                ? { projectId: item.itemId }
                                : { projectId: item.projectId }),
                        deleted: false, deletedAt: null, deletedAtLocalMs: null,
                        ...nowFields('updatedAt')
                    });
                }
            }

            /* Bin entry removed once the restore is queued — both writes
               are in the same queue, in this order, so they land together. */
            await remove(doc(db, 'bin', binDoc.id));
            restoredTargetIds.add(item.itemId);
        } catch(e) {
            console.warn('[Bin] restoreGroup item failed, bin entry kept:', item.itemId, e.message);
        }
    }));

    await restoreSymlinkPointers(groupId, restoredTargetIds);

    /* Logs are not part of the restore and must never hold up the tree. */
    if (rootPid && rootItemId) {
        logRestore(rootPid, rootItemId)
            .catch(e => console.warn('[Bin] log:', e.message));
    }
    if (restoredName) {
        add(collection(db, 'logs'), { filename: restoredName, ...nowFields('timestamp') });
    }
}

/* ══════════════════════════════════════════════════
   RESTORE SINGLE ITEM  (item + its subtree only)
══════════════════════════════════════════════════ */
/*
 * restoreSingleItem
 * ─────────────────
 * Resolves the ancestor chain from parentChain, finds
 * or recreates each ancestor folder, then restores the
 * target item and its direct subtree within the group.
 *
 * Throws on any failure so the caller (doRestoreSingle)
 * can catch and show feedback. Because we throw instead
 * of returning early, the cleanup loop at the bottom
 * only runs when every write has already succeeded —
 * preventing partial state where bin entries are
 * deleted but the item was never actually restored.
 */
async function restoreSingleItem(binDocId) {
    /* ── 1. Load the target bin entry ──────────────── */
    const binSnap = await getDoc(doc(db, 'bin', binDocId));
    if (!binSnap.exists()) throw new Error('Bin entry not found: ' + binDocId);
    const item = { binId: binDocId, ...binSnap.data() };

    /* ── 2. Load all siblings in the same group ────── */
    const groupSnap  = await getDocs(query(collection(db, 'bin'), where('groupId', '==', item.groupId)));
    const groupItems = groupSnap.docs.map(d => ({ binId: d.id, ...d.data() }));

    const parentChain      = item.parentChain || [];
    const idMap            = {};
    /*
     * binsToRemove starts EMPTY.
     * Entries are added only after a successful write.
     * The cleanup loop at the end is ONLY reached when
     * doRestoreItem completes without throwing —
     * guaranteeing all writes succeeded before we
     * remove anything from the bin.
     */
    const binsToRemove     = new Set();
    let   resolvedProjId   = item.projectId;
    let   resolvedParentId = null;

    /* ── 3. Walk parent chain ─────────────────────────
     *
     * STRICTLY SEQUENTIAL, and it must stay that way. Each step consumes
     * the previous one's result: findOrRestoreProject and
     * findOrRestoreSubItem can CREATE a document and return a brand-new
     * id, which the next iteration uses as its parentId. Writes whose
     * content depends on the outcome of earlier writes cannot be batched
     * or parallelised, so this loop is left exactly as it was.
     */
    for (let i = 0; i < parentChain.length; i++) {
        const ancestor = parentChain[i];

        if (ancestor.type === 'PROJECT') {
            const resolved = await findOrRestoreProject(ancestor, groupItems, binsToRemove);
            idMap[ancestor.id] = resolved;
            resolvedProjId     = resolved;
        } else {
            /*
             * prevResolved is null when the previous ancestor
             * is the PROJECT (root-level modules/sections have
             * parentId = null, not the project's document ID).
             */
            const prevAncestor = i > 0 ? parentChain[i - 1] : null;
            const prevResolved = (prevAncestor && prevAncestor.type !== 'PROJECT')
                ? (idMap[prevAncestor.id] || prevAncestor.id)
                : null;

            const resolved = await findOrRestoreSubItem(
                resolvedProjId, ancestor, prevResolved, groupItems, binsToRemove
            );
            idMap[ancestor.id] = resolved;
            if (i === parentChain.length - 1) resolvedParentId = resolved;
        }
    }

    /* ── 4. Restore the item (and its subtree) ──────── */
    /*
     * doRestoreItem now RE-THROWS on failure (Bug 1 fix).
     * If it throws here, we never reach the cleanup loop
     * below, so no bin entries are removed.
     */
    await doRestoreItem(item, resolvedProjId, resolvedParentId, groupItems, idMap, binsToRemove);

    /* ── 5. All writes succeeded — clean up bin ───────
     * Reached only when every write above went through, so these are
     * pure independent deletes and safe to send in one trip. Deleting a
     * document that has already gone is a no-op, so a stale id here
     * cannot fail the batch. */
    await commitOps([...binsToRemove].map(bid => b => b.delete(doc(db, 'bin', bid))))
        .catch(e => console.warn('[Bin] cleanup:', e.message));

    /* ── 5b. Bring back the links that pointed at what we just
       restored. idMap's keys are the original item ids, which is
       exactly what a pointer's linkTargetId holds. */
    await restoreSymlinkPointers(item.groupId, new Set(Object.keys(idMap)));

    await logRestore(resolvedProjId, item.itemId);
    add(collection(db, 'logs'), { filename: item.name, ...nowFields('timestamp') });
}

/* ══════════════════════════════════════════════════
   REBUILDING ANCESTORS
   Restoring one file out of a binned tree has to put a
   project and folders back around it. Three questions,
   in this order, and the order is the whole design:

     1. Does the ORIGINAL document still exist?
        Same id means it is literally the same project.
        Undelete it. Nothing is duplicated.

     2. Did an EARLIER restore already rebuild it?
        Matched on restoredFromId, the original id
        stamped onto the replacement when it was made.

     3. Otherwise build a fresh one, under a name that
        is provably free.

   Step 2 is what stops a restore from splitting. Pull
   index.html out of a dead project today and app.js out
   of it next week, and both land in the same rebuilt
   project rather than in two projects with confusingly
   similar names.

   Matching by NAME was deliberately dropped. It was
   case-sensitive, so a live "project a" did not match a
   binned "Project A" and a second one got built — two
   projects Scribble's own naming rules consider
   identical. And name is not identity: a project that
   merely shares a title is not the one your file came
   out of.
══════════════════════════════════════════════════ */

function normName(s) {
    return String(s == null ? '' : s).trim().toLowerCase();
}

/* First free name at or after `base`: "Project A", then
   "Project A (1)", "(2)"… Checked against live projects only —
   a binned one is not occupying its name on the grid. */
async function freeProjectName(base) {
    let taken = new Set();
    try {
        const snap = await getDocs(collection(db, 'projects'));
        taken = new Set(
            snap.docs.filter(d => !d.data().deleted)
                     .map(d => normName(d.data().name))
        );
    } catch (e) { return base; }

    if (!taken.has(normName(base))) return base;
    for (let i = 1; i < 200; i++) {
        const candidate = base + ' (' + i + ')';
        if (!taken.has(normName(candidate))) return candidate;
    }
    return base + ' (' + Date.now() + ')';
}

/* ── Find or restore: project ─────────────────── */
async function findOrRestoreProject(ancestor, groupItems, binsToRemove) {
    /* 1 — the original document */
    try {
        const snap = await getDoc(doc(db, 'projects', ancestor.id));
        if (snap.exists() && !snap.data().deleted) return ancestor.id;
        if (snap.exists() && snap.data().deleted) {
            await merge(doc(db, 'projects', ancestor.id),
                { deleted: false, deletedAt: null, deletedAtLocalMs: null });
            const projBin = groupItems.find(x => x.itemId === ancestor.id && x.type === 'PROJECT');
            if (projBin) binsToRemove.add(projBin.binId);
            return ancestor.id;
        }
    } catch(e) {}

    /* 2 — a replacement an earlier restore already built */
    try {
        const prior = await getDocs(query(
            collection(db, 'projects'),
            where('restoredFromId', '==', ancestor.id)
        ));
        const live = prior.docs.find(d => !d.data().deleted);
        if (live) return live.id;
    } catch(e) { /* no index / offline — fall through to a fresh build */ }

    /* 3 — build fresh, under a name that is provably free */
    try {
        const name = await freeProjectName(ancestor.name || 'Restored project');
        const ref  = newRef(collection(db, 'projects'));
        await save(ref, {
            name: name, description: '',
            projectId: ref.id,
            /* The thread back to what this replaces. Without it, the
               next restore out of the same dead project would build
               yet another one. */
            restoredFromId: ancestor.id,
            ...nowFields('createdAt'), ...nowFields('updatedAt'),
            pinned: false, pinnedAt: null,
        });
        return ref.id;
    } catch(e) {
        throw new Error(
            'Could not recreate project "' + ancestor.name + '": ' + e.message
        );
    }
}

/* ── Find or restore: module / section ───────── */
async function findOrRestoreSubItem(projectId, ancestor, resolvedParentId, groupItems, binsToRemove) {
    const subcol = ancestor.type === 'MODULE' ? 'modules' : 'sections';

    /* Try original ID first */
    try {
        const snap = await getDoc(doc(db, 'projects', projectId, subcol, ancestor.id));
        if (snap.exists() && !snap.data().deleted) return ancestor.id;
        if (snap.exists() && snap.data().deleted) {
            await merge(doc(db, 'projects', projectId, subcol, ancestor.id), {
                deleted: false, deletedAt: null, deletedAtLocalMs: null,
                parentId: resolvedParentId || null
            });
            const ancBin = groupItems.find(x => x.itemId === ancestor.id);
            if (ancBin) binsToRemove.add(ancBin.binId);
            return ancestor.id;
        }
    } catch(e) {}

    /* 2 — a replacement an earlier restore already built, in this
       same project and folder. Scanned client-side rather than
       queried: it is one small subcollection, and a composite index
       on restoredFromId + parentId would be one more thing to set up
       by hand before restores worked at all. */
    try {
        const snap  = await getDocs(collection(db, 'projects', projectId, subcol));
        const prior = snap.docs.find(d => {
            const data = d.data();
            return !data.deleted &&
                   data.restoredFromId === ancestor.id &&
                   (data.parentId || null) === (resolvedParentId || null);
        });
        if (prior) return prior.id;
    } catch(e) {}

    /* 3 — build fresh, under a free name within this folder.
       Same rule as everywhere else: a name is taken case-insensitively,
       and a binned sibling does not hold one. */
    try {
        const name = await resolveNameConflict(
            projectId, subcol, resolvedParentId || null,
            ancestor.name || 'Restored folder', null, null);

        const ref = add(collection(db, 'projects', projectId, subcol), {
            projectId, parentId: resolvedParentId || null,
            name: name, description: '',
            restoredFromId: ancestor.id,
            ...nowFields('createdAt'), ...nowFields('updatedAt'),
        });
        return ref.id;
    } catch(e) {
        throw new Error(
            'Could not recreate ' + (ancestor.type || 'folder') +
            ' "' + ancestor.name + '": ' + e.message
        );
    }
}

/* ── Restore one item + its direct subtree ───── */
async function doRestoreItem(item, projectId, parentId, groupItems, idMap, binsToRemove) {
    const subcol = item.type === 'MODULE'  ? 'modules'
                 : item.type === 'SECTION' ? 'sections'
                 : 'files';

    const finalName   = await resolveNameConflict(
        projectId, subcol, parentId, item.name, item.itemId,
        item.type === 'FILE' ? (item.fileType || (item.data && item.data.type) || null) : null);
    const hasConflict = finalName !== item.name;
    let   resolvedId  = item.itemId;

    try {
        const snap = await getDoc(doc(db, 'projects', projectId, subcol, item.itemId));
        if (snap.exists()) {
            const updates = {
                deleted: false, deletedAt: null, deletedAtLocalMs: null,
                parentId: parentId || null
            };
            if (hasConflict) updates.name = finalName;
            await merge(doc(db, 'projects', projectId, subcol, item.itemId), updates);
        } else {
            /* item.data now carries isSymlink/targetId/targetProjectId for
               pointers — spreading it first keeps a rebuilt link a link
               instead of an empty orphan file. */
            const ref = add(collection(db, 'projects', projectId, subcol), {
                ...(item.data || {}),
                name: finalName, projectId,
                parentId: parentId || null,
                ...nowFields('createdAt'), ...nowFields('updatedAt'),
                deleted: false, deletedAt: null, deletedAtLocalMs: null,
            });
            resolvedId = ref.id;
        }
    } catch(e) {
        console.warn('[Bin] doRestoreItem failed:', item.itemId, e.message);
        /*
         * FIX v2.3 — Bug 1: was `return` here, which let the
         * function exit normally. The caller's cleanup loop
         * then ran and deleted ancestor bin entries (MODULE,
         * SECTION) even though the target item was never
         * actually restored — making items appear "lost".
         *
         * Now we re-throw so the cleanup loop is never reached
         * on failure. All bin entries stay intact; the user
         * can retry.
         */
        throw e;
    }

    /* ✓ Write succeeded — safe to mark for bin cleanup */
    idMap[item.itemId] = resolvedId;
    binsToRemove.add(item.binId);

    /* Recursively restore direct children from the same group */
    if (item.type === 'MODULE' || item.type === 'SECTION') {
        const children = groupItems.filter(x =>
            x.parentId === item.itemId && x.binId !== item.binId && !x.isSymlinkPointer);
        for (const child of children) {
            await doRestoreItem(child, projectId, resolvedId, groupItems, idMap, binsToRemove);
        }
    }
}

/* ── Name-conflict resolver ─────────────────────
 *
 * `fileType` matters: everywhere else in Scribble a file is
 * identified by name AND extension, so notes.txt and notes.md
 * coexist happily. Ignoring it here meant a restored notes.md
 * was renamed to "notes (1)" because an unrelated notes.txt
 * sat in the same folder — a rename nobody asked for, on the
 * one operation where you most want your names back intact.
 *
 * Pass fileType as null for modules and sections, where the
 * name alone is the identity.
 */
async function resolveNameConflict(projectId, subcol, parentId, name, excludeItemId, fileType) {
    let snap;
    try { snap = await getDocs(collection(db, 'projects', projectId, subcol)); }
    catch(e) { return name; }

    const sameSlot = snap.docs.filter(d => {
        const data = d.data();
        if (data.deleted) return false;                      // binned: name is free
        if ((data.parentId || null) !== (parentId || null)) return false;
        if (excludeItemId && d.id === excludeItemId) return false;
        if (subcol === 'files' && fileType) {
            return normName(data.type) === normName(fileType);
        }
        return true;
    });

    const usedNames = new Set(sameSlot.map(d => normName(d.data().name)));

    if (!usedNames.has(normName(name))) return name;
    let i = 1;
    while (usedNames.has(normName(name + ' (' + i + ')'))) { i++; }
    return name + ' (' + i + ')';
}

/* ══════════════════════════════════════════════════
   PERMANENT DELETE — SINGLE ROW
   The bin had restoreSingleItem but no delete equivalent,
   so the row trash button had to borrow the group version.
   This removes exactly one bin entry and its document.
══════════════════════════════════════════════════ */
async function permanentDeleteSingle(binDocId) {
    const binRef  = doc(db, 'bin', binDocId);
    const binSnap = await getDoc(binRef);
    if (!binSnap.exists()) throw new Error('Bin entry no longer exists.');
    const item = binSnap.data();

    if (item.type === 'PROJECT') {
        /* A project row still means the project and everything under it —
           there is no way to delete a project "by itself". */
        await hardDeleteProjectFull(item.itemId);
        await remove(binRef);
        return;
    }

    const subcol = item.type === 'MODULE'  ? 'modules'
                 : item.type === 'SECTION' ? 'sections'
                 : 'files';

    /* Version history, the document, and the bin row in one trip. The bin
       row goes even if the document has already vanished — a purge must
       always clear the row, or it becomes impossible to get rid of. */
    const ops = (subcol === 'files')
        ? await collectFileSubcollectionOps(item.projectId, item.itemId)
        : [];
    ops.push(b => b.delete(doc(db, 'projects', item.projectId, subcol, item.itemId)));
    ops.push(b => b.delete(binRef));

    await commitOps(ops);
}

/* ══════════════════════════════════════════════════
   PERMANENT DELETE GROUP
══════════════════════════════════════════════════ */
async function permanentDeleteGroup(groupId) {
    if (groupId.startsWith('legacy_')) {
        await hardDeleteProjectFull(groupId.replace('legacy_', ''));
        return;
    }
    const snap  = await getDocs(query(collection(db, 'bin'), where('groupId', '==', groupId)));
    const items = snap.docs.map(d => ({ ...d.data(), _binId: d.id }));

    /*
     * Subcollection items first.
     *
     * This used to cost a sequential read for every file's version history
     * plus two deletes per item, all in single file — a bin group of fifty
     * files ran to well over a hundred round trips. The reads are
     * independent, so they go at once; the deletes are idempotent, so they
     * batch safely. Deleting an already-missing document is a no-op in
     * Firestore, which is why a stale reference cannot wedge the batch.
     */
    const subItems = items.filter(i => i.type !== 'PROJECT');
    const subcolOf = i => i.type === 'MODULE' ? 'modules' : i.type === 'SECTION' ? 'sections' : 'files';

    /* Firestore does NOT delete subcollections when the parent doc goes.
       Without this, every permanently-deleted file left its whole
       `versions` history behind — unreachable, invisible in the UI, and
       still counted against storage forever. */
    const nested = await Promise.all(subItems.map(i =>
        subcolOf(i) === 'files'
            ? collectFileSubcollectionOps(i.projectId, i.itemId)
            : Promise.resolve([])
    ));

    const ops = [];
    nested.forEach(list => ops.push(...list));
    subItems.forEach(i => {
        ops.push(b => b.delete(doc(db, 'projects', i.projectId, subcolOf(i), i.itemId)));
        /* The bin row goes regardless of whether the document was still
           there — a purge must always clear the row. */
        ops.push(b => b.delete(doc(db, 'bin', i._binId)));
    });

    await commitOps(ops);

    /* Projects last. hardDeleteProjectFull batches internally, and each
       project is kept as its own unit so one failing cannot strand the
       others' bin rows. */
    for (const item of items.filter(i => i.type === 'PROJECT')) {
        await hardDeleteProjectFull(item.itemId);
        await commitOps([b => b.delete(doc(db, 'bin', item._binId))]);
    }
}

/* Nested collections under a file doc. Deleting the file doc alone
   orphans these permanently — they survive with no parent and no way
   to reach them from the UI.

   Returns the delete ops rather than running them, so a caller purging
   many files can collect the whole lot and commit once. */
async function collectFileSubcollectionOps(projectId, fileId) {
    const ops = [];
    for (const sub of ['versions']) {
        try {
            const snap = await getDocs(collection(db, 'projects', projectId, 'files', fileId, sub));
            snap.docs.forEach(d => ops.push(b => b.delete(d.ref)));
        } catch(e) { /* nothing there, or unreadable */ }
    }
    return ops;
}

/*
 * A whole project, permanently.
 *
 * The reads are what made this slow — one sequential trip per file just
 * to see whether it had a version history, before a single delete went
 * out. They are independent, so they all go at once, and the deletes
 * that follow are batched.
 *
 * Version histories are still collected before the file docs that own
 * them are deleted, which is the ordering that matters: a file doc
 * removed first would leave its versions unreachable forever.
 */
/* ══════════════════════════════════════════════════
   LINKS POINTING INTO A PROJECT THAT IS ABOUT TO GO
   Added 2026-09-17
   ══════════════════════════════════════════════════
   Filtered client-side on targetProjectId rather than
   queried on it, deliberately: `isSymlink == true` is the
   collection-group index findSymlinksToAny already needs,
   so this adds no new Firestore setup. A direct
   targetProjectId query would want an index of its own.

   No slow fallback here, unlike findSymlinksToAny. This
   only produces a log line, and a purge must not be held
   up — or worse, refused — because an index is missing.
══════════════════════════════════════════════════ */
async function findSymlinksIntoProject(projectId) {
    const found = [];
    for (const sub of ['modules', 'sections', 'files']) {
        try {
            const snap = await getDocs(query(
                collectionGroup(db, sub),
                where('isSymlink', '==', true)
            ));
            snap.docs.forEach(d => {
                const data = d.data();
                if (data.deleted) return;
                if (data.targetProjectId !== projectId) return;

                const hostId = data.projectId ||
                    (d.ref.parent && d.ref.parent.parent ? d.ref.parent.parent.id : null);
                /* A link that lives INSIDE the project being purged is
                   going with it — nothing to tell anyone about. */
                if (!hostId || hostId === projectId) return;

                found.push({ id: d.id, _subcol: sub, _hostProjectId: hostId, ...data });
            });
        } catch (e) {
            console.warn('[Bin] could not scan ' + sub + ' for inbound links:', e.message);
        }
    }
    return found;
}

async function hardDeleteProjectFull(projectId) {
    const ops = [];

    /* ── WHAT ELSE REFERS TO THIS PROJECT ─────────────────────────
       Added 2026-09-17. This function used to remove the project and
       its contents and stop there, which left three kinds of debris:

         · bin rows for items of this project, listed on a bin page
           that could never restore them — their project is gone
         · archive rows the same, sitting on the shelf forever with
           a Restore button that cannot work
         · symlinks in OTHER projects still aiming into it

       The first two are cleaned up here. Both are single-field
       queries, so Firestore's automatic index covers them and there
       is nothing to create by hand. */
    for (const coll of ['bin', 'archive']) {
        try {
            const snap = await getDocs(query(
                collection(db, coll),
                where('projectId', '==', projectId)
            ));
            snap.docs.forEach(d => ops.push(b => b.delete(d.ref)));
        } catch (e) {
            console.warn('[Bin] could not clear ' + coll + ' rows for the purged project:', e.message);
        }
    }

    try {
        const fileSnap = await getDocs(collection(db, 'projects', projectId, 'files'));
        const nested = await Promise.all(
            fileSnap.docs.map(d => collectFileSubcollectionOps(projectId, d.id))
        );
        nested.forEach(list => ops.push(...list));
    } catch(e) {}

    const subSnaps = await Promise.all(
        ['modules', 'sections', 'files', 'logs'].map(sub =>
            getDocs(collection(db, 'projects', projectId, sub)).catch(() => null))
    );
    subSnaps.forEach(snap => {
        if (!snap) return;
        snap.docs.forEach(d => ops.push(b => b.delete(d.ref)));
    });

    /* Inbound links are found BEFORE the delete, while their target
       ids still resolve to something nameable. */
    const inbound = await findSymlinksIntoProject(projectId);

    ops.push(b => b.delete(doc(db, 'projects', projectId)));

    try { await commitOps(ops); }
    catch (e) { console.warn('[Bin] hardDeleteProjectFull:', e.message); }

    /* ── THE LINKS ARE RECORDED, NOT REMOVED ──────────────────────
       They can never resolve again — the project is gone for good, so
       unlike a move there is nothing to repoint them at.

       Even so, they are left in place and written into their own
       project's log instead of being deleted. Removing a link you made,
       from a project this purge was never asked to touch, is a bigger
       liberty than leaving a broken one you can see and delete
       yourself. Same call as flagBrokenSymlinks() in
       scribble-project-firebase.js, for the same reason.

       Fire-and-forget: the purge is already committed and a log line
       must never be what fails it. */
    for (const ptr of inbound) {
        try {
            add(collection(db, 'projects', ptr._hostProjectId, 'logs'), {
                action: "Link to '" + (ptr.name || 'Untitled') + "' broke — the " +
                        'project it pointed into was permanently deleted.',
                itemId: ptr.id,
                kind:   'link',
                weight: 3,
                actorId: 'local', actorName: 'You', actorSurface: 'recycle-bin',
                schema: 2,
                ...nowFields('timestamp')
            });
        } catch (e) { /* never block a purge for a log line */ }
    }

    if (inbound.length) {
        console.info('[Scribble] ' + inbound.length + ' link(s) in other projects ' +
                     'pointed into the project just purged. They are logged in those ' +
                     "projects' activity and can be deleted from their own menus.");
    }
}

/* ══════════════════════════════════════════════════
   EXPOSE
══════════════════════════════════════════════════ */
window.BIN_FB = { listenBinItems, restoreGroup, restoreSingleItem, permanentDeleteSingle, permanentDeleteGroup };

/* ══════════════════════════════════════════════════
   SIDEBAR LOGS  (last 7 days)
══════════════════════════════════════════════════ */
const logsEl = document.getElementById('logs-list');

/*
 * Only subscribe if the panel is actually on this page.
 *
 * The callback already bailed on a missing element, but the
 * onSnapshot itself still ran — opening a live query on `logs` for
 * nothing. That was invisible while this module only loaded on the
 * bin page; now that the expiry sweep pulls it in elsewhere, an
 * unused listener per page would be a real cost.
 */
if (logsEl) {
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
const logsQuery    = query(
    collection(db, 'logs'),
    where('timestamp', '>=', sevenDaysAgo),
    orderBy('timestamp', 'desc'),
    limit(50)
);
onSnapshot(logsQuery, snap => {
    if (snap.empty) { logsEl.innerHTML = '<div class="logs-empty">No activity in the last 7 days</div>'; return; }
    logsEl.innerHTML = '';
    snap.forEach(d => {
        const data = d.data();
        const when = whenDate(data, 'timestamp');
        const time = when ? sidebarTime(when) : '\u2014';
        const row  = document.createElement('div'); row.className = 'log-row';
        row.innerHTML = '<div class="log-name">' + escHtml(data.filename || 'untitled') + '</div><div class="log-time">' + time + '</div>';
        logsEl.appendChild(row);
    });
}, err => { logsEl.innerHTML = '<div class="logs-empty">Offline</div>'; });
}   /* end: only when #logs-list is on the page */

function sidebarTime(d) {
    return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0') +
           ' ' + (d.getMonth()+1) + '-' + d.getDate() + '-' + d.getFullYear();
}
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

if (typeof window.BIN_READY === 'function') window.BIN_READY();
