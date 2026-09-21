/* ═══════════════════════════════════════════════════
   SCRIBBLE — FIREBASE
═══════════════════════════════════════════════════ */
/* First: holds this module until the Firebase session is restored,
   so no query goes out before the token is attached. */
import './scribble-boot.js';
import {
    db,
    nowFields, whenMs,
    save, merge, remove, add, newRef, commit
} from './scribble-db.js';
import {
    collection, doc, query, where, orderBy, limit,
    onSnapshot, getDocs, getDoc, serverTimestamp, writeBatch
} from './vendor/firebase.js';
/* ── Internal helpers ──────────────────────────
   whenMs falls back to the *LocalMs companion field, so a
   project edited offline still sorts by when you edited
   it rather than dropping to the bottom with a 0. */
function updatedAtMs(p) {
    return whenMs(p, 'updatedAt');
}
/* ══════════════════════════════════════════════════
   ROOMS — added 2026-09-21
   Before today there was one room and no field: every
   project document went into `projects` and the grid
   showed all of them.

   A room is a VIEW, not a tier and not a collection.
   Deployment projects live in the same `projects`
   collection, carry the same shape, and open the same
   workspace page — the only difference is which grid
   lists them. That is deliberate: the project page,
   the editor, symlinks, the bin, the archive and
   firestore.rules all address a project as
   `projects/{pid}`, and a second collection would have
   meant teaching every one of them about two.

   Anything written before today has NO room field, so
   a missing value reads as 'all'. Nothing moved.
══════════════════════════════════════════════════ */
const ROOMS = ['all', 'deploy'];

/* Normalises whatever a caller hands us — a project's
   data, a room string, or nothing at all — down to one
   of ROOMS. Unknown values fall back to 'all' rather
   than making a card that no room will ever show. */
function roomOf(v) {
    const r = (v && typeof v === 'object') ? v.room : v;
    return ROOMS.indexOf(r) !== -1 ? r : 'all';
}
/* Both still return a promise — callers `await` them and two
   chain .catch() — but it now resolves on queue, not on ack. */
function writeProjectLog(projectId, action) {
    add(collection(db, 'projects', projectId, 'logs'),
        { action, ...nowFields('timestamp') });
    return Promise.resolve();
}
function writeGlobalLog(filename) {
    add(collection(db, 'logs'), { filename, ...nowFields('timestamp') });
    return Promise.resolve();
}
/* ══════════════════════════════════════════════════
   PATH HELPERS (internal — mirrored in project-firebase.js)
══════════════════════════════════════════════════ */
/*
 * buildPathFb — full path string including the item's own name.
 * e.g.  "LIFEHUB/CSS/lifehub.css"
 */
function buildPathFb(projectName, parentId, allItems, selfName) {
    const parts = [];
    let   currentId = parentId;
    const seen      = new Set();
    while (currentId && !seen.has(currentId)) {
        seen.add(currentId);
        const anc = allItems.find(x => x.id === currentId);
        if (!anc) break;
        parts.unshift(anc.name || 'Untitled');
        currentId = anc.parentId || null;
    }
    const chain = [projectName, ...parts];
    if (selfName) chain.push(selfName);
    return chain.join('/');
}
/*
 * buildParentChainFb — typed ancestor array for the bin entry.
 * [{id, name, type}, …] from project root down to direct parent.
 */
function buildParentChainFb(projectId, projectName, targetParentId, allItems) {
    const ancestorParts = [];
    let   currentId     = targetParentId;
    const seen          = new Set();
    while (currentId && !seen.has(currentId)) {
        seen.add(currentId);
        const anc = allItems.find(x => x.id === currentId);
        if (!anc) break;
        ancestorParts.unshift({ id: anc.id, name: anc.name || 'Untitled', type: anc._type });
        currentId = anc.parentId || null;
    }
    return [{ id: projectId, name: projectName, type: 'PROJECT' }, ...ancestorParts];
}
/* ══════════════════════════════════════════════════
   DUPLICATE PROJECT NAMES
   The project page has guarded its modules, sections
   and files since the beginning. Projects themselves
   never were — createProject wrote whatever it was
   handed, so two "LIFEHUB" cards could sit side by side
   and the only way to tell them apart was to open them.

   ── THE RULE ──────────────────────────────────────
   Case is ignored. Everything else counts.

       Notes / notes / nOtEs        same name
       "Life Hub" / "LifeHub"       different
       "Life-hub" / "LifeHub"       different
       "Life.hub" / "Life-hub"      different

   So the ONLY thing normName does is trim the ends and
   lowercase. Spaces, hyphens and dots inside the name
   are real characters and are compared as typed — an
   earlier version collapsed runs of whitespace, which
   would have wrongly merged "Life Hub" and "Life  Hub".

   What gets STORED is always exactly what you type;
   only the comparison is case-blind.

   ── THE SCOPE ─────────────────────────────────────
   Everything counts: live, archived, AND in the recycle
   bin. Restores really happen, and discovering the clash
   at restore time — when the fix is expensive — is worse
   than being told now, when you can just pick another
   name. The refusal says WHERE the clash is so a name
   never looks taken by nothing.
══════════════════════════════════════════════════ */
function normName(s) {
    return String(s == null ? '' : s).trim().toLowerCase();
}

/* Returns { id, name, status } or null.
   status: 'live' | 'archived' | 'bin' */
async function findProjectByName(name, excludeId) {
    const target = normName(name);
    if (!target) return null;

    const snap = await getDocs(collection(db, 'projects'));
    for (const d of snap.docs) {
        if (d.id === excludeId) continue;
        const data = d.data();
        if (normName(data.name) !== target) continue;
        return {
            id:     d.id,
            name:   data.name || '',
            status: data.deleted ? 'bin' : (data.archived ? 'archived' : 'live')
        };
    }
    return null;
}

/* Exposed so the modal can check BEFORE it closes, rather
   than only finding out from a thrown error afterwards. */
async function findProjectClash(name, excludeId) {
    return findProjectByName(name, excludeId);
}

async function projectNameExists(name, excludeId) {
    return !!(await findProjectByName(name, excludeId));
}

/* "X (copy)", then "X (copy 2)", "X (copy 3)"… Capped so a
   corrupt read can never spin this into an endless loop. */
async function freeCopyName(base) {
    let candidate = base + ' (copy)';
    for (let n = 2; n < 100; n++) {
        if (!(await findProjectByName(candidate))) return candidate;
        candidate = base + ' (copy ' + n + ')';
    }
    return base + ' (copy ' + Date.now() + ')';
}

function _dupError(hit, attempted) {
    const e = new Error("A project named '" + hit.name + "' already exists" +
        (hit.status === 'bin'      ? ' in the recycle bin.' :
         hit.status === 'archived' ? ' in the archive.' : '.'));
    e.code = 'duplicate-name';
    e.clash = hit;
    return e;
}

/* ══════════════════════════════════════════════════
   PROJECT CRUD
══════════════════════════════════════════════════ */
/* ── Create ──────────────────────────────────── */
/* The id is minted locally by newRef(), so it's real before
   the write leaves the device — which is what lets this
   return an id offline instead of hanging on the server. */
/* 2026-09-21 — gained a third argument, `room`. It was
   createProject(name, description) and always wrote to the one
   grid. Omitting it still does exactly that: roomOf(undefined)
   is 'all', which is why Poppy's own mirrored copy in
   PoppyEngine-scribble.js needs no change to keep working.

   The clash check is deliberately NOT room-scoped. Names are
   unique across both rooms, because the bin and the archive are
   shared: two projects called LIFEHUB would sit side by side in
   the bin with nothing to tell them apart. Settled 2026-09-21. */
async function createProject(name, description, room) {
    const clash = await findProjectByName(name);
    if (clash) throw _dupError(clash, name.trim());

    const ref = newRef(collection(db, 'projects'));
    await save(ref, {
        name: name.trim(), description: description.trim(),
        projectId: ref.id, room: roomOf(room),
        ...nowFields('createdAt'), ...nowFields('updatedAt'),
        pinned: false, pinnedAt: null
    });
    await writeProjectLog(ref.id, 'Created the project.');
    await writeGlobalLog(name.trim());
    return ref.id;
}
/* ── Real-time listener ──────────────────────── */
/* 2026-09-21 — gained a leading `room` argument; it was
   listenProjects(callback).
   Filtered here rather than with a Firestore `where`: the query
   would need an index, and — more to the point — a `where` on
   `room` returns NOTHING for every project written before today,
   because a document that lacks the field does not match any
   value for it. Reading all of them and sorting rooms out in
   memory is what makes the old projects still appear. The
   listener already reads every document to drop the deleted and
   the archived ones, so this costs no extra reads. */
function listenProjects(room, callback) {
    const want = roomOf(room);
    return onSnapshot(collection(db, 'projects'), snap => {
        const projects = [];
        snap.forEach(d => {
            const data = d.data();
            if (data.deleted) return;
            if (data.archived) return;   // shelved — lives on Scribble-archive.html
            if (roomOf(data) !== want) return;   // another room's grid
            projects.push({ id: d.id, ...data });
        });
        projects.sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return  1;
            return updatedAtMs(b) - updatedAtMs(a);
        });
        callback(projects);
    }, err => { console.warn('[Scribble] Projects listener:', err.message); callback([]); });
}
/* ── Toggle pin ──────────────────────────────── */
async function togglePin(id, pinned) {
    await merge(doc(db, 'projects', id), { pinned: !pinned });
}
// "Last opened" stamp — fire-and-forget, never blocks navigation.
async function touchAccessed(id) {
    try {
        await merge(doc(db, 'projects', id), { ...nowFields('accessedAt') });
    } catch (e) { console.warn('[touchAccessed]', e.message); }
}
// On-demand item count per project — used only when "Size" sort is picked,
// never on normal page load, since it costs 3 reads per project.
async function getProjectItemCount(id) {
    try {
        const [modSnap, secSnap, fileSnap] = await Promise.all([
            getDocs(collection(db, 'projects', id, 'modules')),
            getDocs(collection(db, 'projects', id, 'sections')),
            getDocs(collection(db, 'projects', id, 'files'))
        ]);
        return modSnap.size + secSnap.size + fileSnap.size;
    } catch (e) { console.warn('[getProjectItemCount]', e.message); return 0; }
}
/* ── Rename ──────────────────────────────────── */
async function renameProject(id, oldName, newName) {
    newName = newName.trim();

    /* excludeId, so renaming a project to a different capitalisation
       of its own name is allowed rather than colliding with itself. */
    const clash = await findProjectByName(newName, id);
    if (clash) throw _dupError(clash, newName);

    await merge(doc(db, 'projects', id), { name: newName, ...nowFields('updatedAt') });
    await writeProjectLog(id, "Rename: '" + oldName + "' to '" + newName + "'");
    await writeGlobalLog(newName);
}
/* ── Count modules + files (for View Contents) ── */
async function getProjectCounts(id) {
    try {
        const [modSnap, secSnap, fileSnap] = await Promise.all([
            getDocs(collection(db, 'projects', id, 'modules')),
            getDocs(collection(db, 'projects', id, 'sections')),
            getDocs(collection(db, 'projects', id, 'files'))
        ]);
        return { modules: modSnap.size, sections: secSnap.size, files: fileSnap.size };
    } catch(e) { return { modules: 0, sections: 0, files: 0 }; }
}
/* ── Update description ──────────────────────── */
async function updateDescription(id, description) {
    await merge(doc(db, 'projects', id), { description: description.trim(), ...nowFields('updatedAt') });
    await writeProjectLog(id, 'Updated project description.');
}
/* ── Duplicate ───────────────────────────────── */
async function duplicateProject(id) {
    const srcSnap = await getDoc(doc(db, 'projects', id));
    if (!srcSnap.exists()) return;
    const src    = srcSnap.data();

    /* Duplicating twice used to make a second "X (copy)" with the same
       name as the first. Refusing would be wrong here — you asked for a
       copy — so it walks up to the first free name instead. */
    const copyName = await freeCopyName(src.name || 'Project');

    const copyRef = newRef(collection(db, 'projects'));
    await save(copyRef, {
        name: copyName, description: src.description || '',
        projectId: copyRef.id,
        /* 2026-09-21 — the copy stays in the room the original is in.
           Without this it read roomOf(undefined) = 'all', so duplicating
           a Deployment project dropped the copy into All Projects and it
           looked like the duplicate had simply failed. */
        room: roomOf(src),
        ...nowFields('createdAt'), ...nowFields('updatedAt'), pinned: false, pinnedAt: null
    });
    for (const sub of ['modules', 'sections', 'files']) {
        const snap = await getDocs(collection(db, 'projects', id, sub));
        for (const d of snap.docs) {
            add(collection(db, 'projects', copyRef.id, sub), { ...d.data(), projectId: copyRef.id });
        }
    }
    const logsSnap = await getDocs(collection(db, 'projects', id, 'logs'));
    for (const logDoc of logsSnap.docs) {
        add(collection(db, 'projects', copyRef.id, 'logs'), logDoc.data());
    }
    await writeProjectLog(copyRef.id, "Duplicated from '" + src.name + "'.");
    await writeGlobalLog(copyName);
    return copyRef.id;
}
/* ── Per-project logs ────────────────────────── */
async function getProjectLogs(id) {
    const snap = await getDocs(query(collection(db, 'projects', id, 'logs'), orderBy('timestamp', 'desc')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
/* ── Merge ───────────────────────────────────── */
async function mergeProjects(sourceId, targetId, newName) {
    const srcSnap = await getDoc(doc(db, 'projects', sourceId));
    const srcName = srcSnap.exists() ? (srcSnap.data().name || 'Unknown') : 'Unknown';
    const tgtModSnap = await getDocs(collection(db, 'projects', targetId, 'modules'));
    const tgtNames   = new Set(tgtModSnap.docs.map(d => (d.data().name || '').toLowerCase()));
    function resolveConflict(name) {
        if (!tgtNames.has(name.toLowerCase())) { tgtNames.add(name.toLowerCase()); return name; }
        let n = name + ' (2)', i = 2;
        while (tgtNames.has(n.toLowerCase())) { i++; n = name + ' (' + i + ')'; }
        tgtNames.add(n.toLowerCase()); return n;
    }
    const modSnap = await getDocs(collection(db, 'projects', sourceId, 'modules'));
    const idMap   = {};
    for (const modDoc of modSnap.docs) {
        const modData   = modDoc.data();
        const newModRef = add(collection(db, 'projects', targetId, 'modules'),
            { ...modData, name: resolveConflict(modData.name || 'module'), projectId: targetId });
        idMap[modDoc.id] = newModRef.id;
    }
    const secSnap = await getDocs(collection(db, 'projects', sourceId, 'sections'));
    const secMap  = {};
    for (const secDoc of secSnap.docs) {
        const secData   = secDoc.data();
        const newParent = idMap[secData.parentId] || secData.parentId || null;
        const newSecRef = add(collection(db, 'projects', targetId, 'sections'),
            { ...secData, parentId: newParent, projectId: targetId });
        secMap[secDoc.id] = newSecRef.id;
    }
    const fileSnap = await getDocs(collection(db, 'projects', sourceId, 'files'));
    for (const fileDoc of fileSnap.docs) {
        const fileData  = fileDoc.data();
        const newParent = idMap[fileData.parentId] || secMap[fileData.parentId] || fileData.parentId || null;
        add(collection(db, 'projects', targetId, 'files'),
            { ...fileData, parentId: newParent, projectId: targetId });
    }
    const logsSnap = await getDocs(collection(db, 'projects', sourceId, 'logs'));
    for (const logDoc of logsSnap.docs) {
        add(collection(db, 'projects', targetId, 'logs'), logDoc.data());
    }
    var mergedName = (newName && newName.trim()) ? newName.trim() : null;
    if (mergedName) {
        await merge(doc(db, 'projects', targetId), { name: mergedName, ...nowFields('updatedAt') });
        await writeProjectLog(targetId, "Renamed to '" + mergedName + "' after merge from '" + srcName + "'.");
    }
    await writeProjectLog(targetId, "Merged from project '" + srcName + "'.");
    await merge(doc(db, 'projects', targetId), { ...nowFields('updatedAt') });
    await writeGlobalLog(mergedName || srcName);
    await remove(doc(db, 'projects', sourceId));
}
/* ── Soft delete with cascade ──────────────────
 *
 * Every write goes into a batch rather than being awaited one at a time.
 *
 * This used to loop over the project's contents and await TWO round trips
 * per item — the bin entry, then the deleted flag. A project with forty
 * files cost eighty sequential trips to Firestore, and because the
 * project's own `deleted` flag was written last, its card sat there on
 * screen for the whole run. That wait was the entire delay: the work was
 * not slow, it was just queued single file.
 *
 * The project flag is still written last, on purpose. If a batch fails
 * part-way the project stays visible and the delete can simply be
 * retried, which is the recoverable direction to fail in.
 */
const BATCH_MAX = 450;   // Firestore hard limit is 500 writes per batch

async function softDeleteProject(id) {
    const snap = await getDoc(doc(db, 'projects', id));
    if (!snap.exists()) return;
    const project = snap.data();
    const name    = project.name || 'Unknown';
    const groupId = id;
    /* Spread into each write rather than a bare serverTimestamp:
       the bin sorts and shows "Deleted On", and offline that
       field reads back null until the queue flushes. */
    const now     = nowFields('deletedAt');
    const [modSnap, secSnap, fileSnap] = await Promise.all([
        getDocs(collection(db, 'projects', id, 'modules')),
        getDocs(collection(db, 'projects', id, 'sections')),
        getDocs(collection(db, 'projects', id, 'files'))
    ]);
    const allItems = [
        ...modSnap.docs.map(d  => ({ id: d.id, _subcol: 'modules',  _type: 'MODULE',  ...d.data() })),
        ...secSnap.docs.map(d  => ({ id: d.id, _subcol: 'sections', _type: 'SECTION', ...d.data() })),
        ...fileSnap.docs.map(d => ({ id: d.id, _subcol: 'files',    _type: 'FILE',    ...d.data() })),
    ].filter(x => !x.deleted);
    const groupSize = 1 + allItems.length;

    /* Queue every write, then commit them in as few trips as possible. */
    const ops = [];

    /* Project bin entry — parentChain is empty (no ancestors above a project) */
    ops.push(b => b.set(doc(collection(db, 'bin')), {
        type: 'PROJECT', itemId: id, projectId: id, projectName: name,
        parentId: null, groupId, name,
        fileType: null, colour: null,
        ...now, originalPath: name,
        parentChain: [],
        groupSize,
        data: {
            name: project.name || '', description: project.description || '',
            pinned: project.pinned || false, projectId: project.projectId || id,
            /* 2026-09-21 — added. `data` is a WHITELIST, and the bin's
               restore rebuilds from it whenever the project document is
               gone (scribble-recycle-bin-firebase.js, the `save` branch
               of restoreGroup). Leaving room out meant a restored
               Deployment project came back into All Projects. */
            room: roomOf(project),
            createdAt: project.createdAt || null, updatedAt: project.updatedAt || null,
        }
    }));

    /* Content bin entries */
    for (const item of allItems) {
        const chain = buildParentChainFb(id, name, item.parentId, allItems);
        const path  = buildPathFb(name, item.parentId, allItems, item.name || 'Untitled');
        ops.push(b => b.set(doc(collection(db, 'bin')), {
            type: item._type, itemId: item.id, projectId: id, projectName: name,
            parentId: item.parentId || null, groupId,
            name: item.name || 'Untitled',
            fileType: item._type === 'FILE' ? (item.type || null) : null,
            colour:   item.colour || null,
            ...now, originalPath: path,
            parentChain: chain,
            groupSize,
            data: {
                name: item.name || '', description: item.description || '',
                parentId: item.parentId || null,
                createdAt: item.createdAt || null, updatedAt: item.updatedAt || null,
                type: item.type || null, colour: item.colour || null,
            }
        }));
        ops.push(b => b.update(doc(db, 'projects', id, item._subcol, item.id),
            { deleted: true, ...now }));
    }

    /* Last, so the card only leaves the grid once the bin has everything. */
    ops.push(b => b.update(doc(db, 'projects', id), { deleted: true, ...now }));

    /* commit() resolves once the batch is queued. The batch is
       still atomic when it reaches the server — offline that
       just happens later. */
    for (let i = 0; i < ops.length; i += BATCH_MAX) {
        const batch = writeBatch(db);
        ops.slice(i, i + BATCH_MAX).forEach(op => op(batch));
        await commit(batch);
    }

    /* The log is not part of the delete — it must never hold up the grid. */
    writeProjectLog(id, 'Moved to recycle bin' +
        (groupSize > 1 ? ' (' + groupSize + ' items total)' : '') + '.')
        .catch(e => console.warn('[softDeleteProject] log:', e.message));
    writeGlobalLog(name).catch(e => console.warn('[softDeleteProject] global log:', e.message));
}
/* ══════════════════════════════════════════════════
   RECORDS — project-level storage
══════════════════════════════════════════════════ */
async function getProjectRecords(id) {
    try {
        const snap = await getDoc(doc(db, 'projects', id));
        return snap.exists() ? (snap.data().records || null) : null;
    } catch(e) { return null; }
}
async function saveProjectRecords(id, records) {
    const snap = await getDoc(doc(db, 'projects', id));
    const old  = (snap.exists() && snap.data().records) ? snap.data().records : { onedrive: '', hdPath: '', customLinks: [] };
    await merge(doc(db, 'projects', id), {
        records: records,
        ...nowFields('updatedAt')
    });
    for (const line of diffRecordsFb(old, records)) {
        await writeProjectLog(id, line);
    }
}
/* Mirrors diffRecords() in project-firebase.js — kept local since this
   module has its own Firestore imports and doesn't share that file. */
function diffRecordsFb(oldRec, newRec) {
    const lines = [];
    const oldOnedrive = (oldRec.onedrive || '').trim();
    const newOnedrive = (newRec.onedrive || '').trim();
    if (oldOnedrive !== newOnedrive) {
        lines.push(newOnedrive ? 'Recorded a Cloud link.' : 'Removed Cloud link.');
    }
    const oldHd = (oldRec.hdPath || '').trim();
    const newHd = (newRec.hdPath || '').trim();
    if (oldHd !== newHd) {
        lines.push(newHd ? 'Recorded a hard drive path.' : 'Removed hard drive path.');
    }
    const oldLinks = oldRec.customLinks || [];
    const newLinks = newRec.customLinks || [];
    const key = (l) => (l.label || '') + '|' + (l.url || '');
    const oldKeys = new Set(oldLinks.map(key));
    const newKeys = new Set(newLinks.map(key));
    newLinks.forEach(function(l) {
        if (!oldKeys.has(key(l))) lines.push('Recorded a link from ' + (l.label || 'custom source') + '.');
    });
    oldLinks.forEach(function(l) {
        if (!newKeys.has(key(l))) lines.push("Removed link '" + (l.label || 'untitled') + "'.");
    });
    return lines;
}
/* ══════════════════════════════════════════════════
   EXPOSE
══════════════════════════════════════════════════ */
window.SCRIBBLE_DB = db;
/* `add` rather than addDoc, and nowFields rather than a bare
   serverTimestamp — so anything reaching for these from the
   console gets the offline-safe versions too. */
window.SCRIBBLE_FS = { collection, add, nowFields, serverTimestamp };

/* ══════════════════════════════════════════════════
   GENERAL RECORD — every file in a project, one sheet
   Reads the whole project once, resolves each file's
   folder path, and returns the rows the modal edits.
══════════════════════════════════════════════════ */
async function getAllFileRecords(pid) {
    const projectSnap = await getDoc(doc(db, 'projects', pid));
    const projectName = projectSnap.exists() ? (projectSnap.data().name || 'Project') : 'Project';

    const [modSnap, secSnap, fileSnap] = await Promise.all([
        getDocs(collection(db, 'projects', pid, 'modules')),
        getDocs(collection(db, 'projects', pid, 'sections')),
        getDocs(collection(db, 'projects', pid, 'files'))
    ]);

    /* Folders exist here only to resolve paths. */
    const folders = new Map();
    modSnap.docs.forEach(d => folders.set(d.id, d.data()));
    secSnap.docs.forEach(d => folders.set(d.id, d.data()));

    function pathOf(parentId) {
        const parts = [];
        let cur = parentId, seen = new Set();
        while (cur && !seen.has(cur)) {
            seen.add(cur);
            const anc = folders.get(cur);
            if (!anc) break;
            parts.unshift(anc.name || 'Untitled');
            cur = anc.parentId || null;
        }
        return [projectName, ...parts].join(' / ');
    }

    const rows = fileSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(f => !f.deleted && !f.isSymlink)   // a link has no storage of its own
        .map(f => {
            const rec = f.records || {};
            return {
                id:   f.id,
                name: f.name || 'Untitled',
                type: f.type || 'txt',
                path: pathOf(f.parentId || null),
                records: {
                    onedrive:    rec.onedrive    || '',
                    hdPath:      rec.hdPath      || '',
                    customLinks: rec.customLinks || []
                }
            };
        });

    rows.sort((a, b) => a.path.localeCompare(b.path) || a.name.localeCompare(b.name));
    return rows;
}

/*
 * saveRecordsBulk — writes ONLY edited rows, straight onto each
 * file's own document, so the value shows up in that file's normal
 * Records panel too. One failed row can't discard the others.
 */
async function saveRecordsBulk(pid, changes) {
    let saved = 0;
    const failed = [];
    for (const change of (changes || [])) {
        try {
            await merge(doc(db, 'projects', pid, 'files', change.id), {
                records:   change.records,
                ...nowFields('updatedAt')
            });
            add(collection(db, 'projects', pid, 'logs'), {
                action:    'Updated storage record.',
                itemId:    change.id,
                kind:      'record',
                weight:    2,
                itemName:  change.name || null,
                itemPath:  change.path || null,
                fileType:  change.type || null,
                itemType:  'file',
                actorId:   'local', actorName: 'You', actorSurface: 'general-record',
                schema:    2,
                ...nowFields('timestamp')
            });
            saved++;
        } catch (e) {
            failed.push({ id: change.id, message: e.message || 'write failed' });
        }
    }
    return { saved, failed };
}


/* ── Archive a project (see scribble-archive-firebase.js) ── */
async function archiveProject(pid, note) {
    const snap = await getDoc(doc(db, 'projects', pid));
    if (!snap.exists()) throw new Error('That project no longer exists.');
    const p = snap.data();
    if (p.archived) throw new Error('That project is already archived.');

    const now  = nowFields('archivedAt');
    /* 2026-09-21 — originalPath was the hard-coded string 'All Projects'.
       It is what the shelf shows under "came from", so a shelved
       Deployment project claimed to have come from the wrong room.
       Restore itself is unaffected either way: restoreArchived flips
       `archived` on the project document, which never left, so its room
       comes back with it. `data` carries the room for the display only. */
    const room = roomOf(p);
    add(collection(db, 'archive'), {
        type: 'PROJECT', itemId: pid, projectId: pid,
        projectName: p.name || 'Project', parentId: null,
        groupId: pid, groupSize: 1,
        name: p.name || 'Project', fileType: null, colour: p.colour || null,
        isSymlink: false, originalPath: room === 'deploy' ? 'Deployment' : 'All Projects',
        note: note || '', ...now,
        data: { name: p.name || '', description: p.description || '', room: room }
    });
    await merge(doc(db, 'projects', pid), { archived: true, ...now });

    try {
        add(collection(db, 'projects', pid, 'logs'), {
            action: 'Project archived.', kind: 'archive', weight: 3,
            actorId: 'local', actorName: 'You', actorSurface: 'landing-page',
            schema: 2, ...nowFields('timestamp')
        });
    } catch (e) {}
}

window.SCRIBBLE_FB = {
    touchAccessed, getProjectItemCount,
    createProject, listenProjects, togglePin, renameProject,
    getProjectCounts, updateDescription, duplicateProject,
    getProjectLogs, mergeProjects, softDeleteProject,
    projectNameExists, findProjectClash,
    getProjectRecords, saveProjectRecords,
    getAllFileRecords, saveRecordsBulk,
    archiveProject,
    /* 2026-09-21 — exported so scribble-app.js labels a card from the
       same rule that decided which grid it is on. Two copies of
       "is this a Deployment project?" would eventually disagree. */
    roomOf
};
/* ══════════════════════════════════════════════════
   SIDEBAR — RECENT
   Moved to js/scribble-recent.js.

   It used to live here, which meant only the workshop
   had it — the archive, project and bin pages were
   stuck with the old filename-only Logs panel. Copying
   it into each of them would have left four versions to
   keep in step, so it is one module now and every page
   with a #recent-list loads it.
══════════════════════════════════════════════════ */

if (typeof window.SCRIBBLE_READY === 'function') window.SCRIBBLE_READY();
