/* ═══════════════════════════════════════════════════

   SCRIBBLE — EDITOR FIREBASE (PHASE 5 - PATCHED)

═══════════════════════════════════════════════════ */

import './scribble-boot.js';
import { doc, getDoc, getDocs, query, orderBy, collection }
from './vendor/firebase.js';
import { nowFields, merge, remove, add } from './scribble-db.js';

/* _activePid() lived here until 2026-09-17, and it was a trap.
 *
 * It was meant to resolve a symlink-opened file to its source project,
 * and it read right — but it was never called by anything, and it
 * reached for EDITOR_APP._getOpenFiles and ._getActiveFileId, NEITHER
 * of which the editor exports. Guarded with &&, so it would have
 * silently fallen through to window._projectId every single time: the
 * exact bug it looked like it was preventing.
 *
 * Every function below already takes an explicit overridePid from its
 * caller, which is the honest way round — the caller knows which file
 * it is acting on. See _fileProjectId() in scribble-editor-app.js.
 *
 * Removed rather than repaired, so nobody later "fixes" it into use. */

async function getFileContent(fileId, overridePid) {
    try {
        const db  = window.SCRIBBLE_DB;
        const pid = overridePid || window._projectId;

        const snap = await getDoc(doc(db, 'projects', pid, 'files', fileId));

        return snap.exists() ? (snap.data().content || '') : '';

    } catch (error) {

        console.error("Error fetching file content:", error);

        return "Error loading file.";

    }

}

async function saveFileContent(fileId, content, overridePid) {
    try {
        const db = window.SCRIBBLE_DB;
        const pid = overridePid || window._projectId;

        // SAFETY: never let an empty save overwrite a document that has
        // real content. This is what silently wiped a file earlier —
        // a failed read returned '' and autosave persisted it.
        if (!content || !content.trim()) {
            const existing = await getDoc(doc(db, 'projects', pid, 'files', fileId));
            if (existing.exists() && (existing.data().content || '').trim()) {
                console.warn('[saveFileContent] Blocked empty overwrite of non-empty file:', fileId);
                return false;
            }
        }

        const docRef = doc(db, 'projects', pid, 'files', fileId);

        // Resolves once the write is in the local queue. Offline that
        // is the honest answer — the text IS saved, on this device, and
        // will flush when there's a network. Waiting for the server
        // instead would leave autosave hanging and return false, which
        // is what made the editor look broken with no connection.
        await merge(docRef, {
            content: content,

            size: new Blob([content]).size,

            ...nowFields('updatedAt')

        });
        // One "Updated" line per calendar day — logDailyUpdate handles the

        // dedupe. Best-effort: a logging hiccup should never block a save.

        if (window.PROJECT_FB && typeof window.PROJECT_FB.logDailyUpdate === 'function') {

            window.PROJECT_FB.logDailyUpdate(pid, fileId).catch(function() {});

        }

        // Freshness propagation: without this a project card still reads
        // "1 week ago" while you're actively typing in one of its files.
        // Throttled internally to one write per chain per 60s.
        if (window.PROJECT_FB && typeof window.PROJECT_FB.touchAncestors === 'function') {

            const parentId = (await getDoc(doc(db, 'projects', pid, 'files', fileId))).data()?.parentId || null;

            window.PROJECT_FB.touchAncestors(pid, parentId).catch(function() {});

        }

        return true;

    } catch (error) {

        console.error("Error saving file content:", error);

        return false;

    }

}

/*
 * saveEditorStyle — font family / size are per-file DISPLAY settings,
 * stored as their own fields rather than inside `content`. They live on
 * the container element, which innerHTML never captures, so they had no
 * way of being saved before.
 * Deliberately does NOT touch updatedAt: changing your font is not
 * editing the file, and shouldn't reorder Recent or bump the card.
 */
async function saveEditorStyle(fileId, patch, overridePid) {
    try {
        const db  = window.SCRIBBLE_DB;
        const pid = overridePid || window._projectId;

        const clean = {};
        if (patch.fontFamily !== undefined) clean.fontFamily = patch.fontFamily || '';
        if (patch.fontSize   !== undefined) clean.fontSize   = patch.fontSize   || null;
        if (!Object.keys(clean).length) return false;

        await merge(doc(db, 'projects', pid, 'files', fileId), clean);
        return true;

    } catch (error) {

        console.error("Error saving editor style:", error);

        return false;

    }

}

// ── Version History ──────────────────────────────

async function saveVersion(fileId, content, note, overridePid) {
    try {
        const db  = window.SCRIBBLE_DB;
        const pid = overridePid || window._projectId;

        // Read current file name + version counter, then increment

        const fileRef  = doc(db, 'projects', pid, 'files', fileId);

        const fileSnap = await getDoc(fileRef);

        const fileData = fileSnap.exists() ? fileSnap.data() : {};

        const newCount    = (fileData.versionCount || 0) + 1;

        const currentName = fileData.name || 'File';

        const versionName = currentName + ' V' + newCount;

        // Persist the incremented counter (never decreases, even on delete)

        await merge(fileRef, { versionCount: newCount });

        // Build text stats

        const text = new DOMParser().parseFromString(content, 'text/html').body.innerText || '';

        add(collection(db, 'projects', pid, 'files', fileId, 'versions'), {

            content:     content,

            ...nowFields('savedAt'),

            versionName: versionName,

            note:        note || '',

            wordCount:   (text.trim().match(/\S+/g) || []).length,

            charCount:   text.length,

            size:        new Blob([content]).size

        });

        if (window.PROJECT_FB && typeof window.PROJECT_FB.logItemAction === 'function') {

            await window.PROJECT_FB.logItemAction(pid, fileId, "Saved version history: '" + versionName + "'.");

        }

    } catch (error) {

        console.error("Error saving version:", error);

    }

}

async function listVersions(fileId, overridePid) {
    try {
        const db  = window.SCRIBBLE_DB;
        const pid = overridePid || window._projectId;

        const versionsRef = collection(db, 'projects', pid, 'files', fileId, 'versions');

        const snap = await getDocs(query(versionsRef, orderBy('savedAt', 'desc')));

        return snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });

    } catch (error) {

        console.error("Error listing versions:", error);

        return [];

    }

}

/*
 * updateVersionNote — edits the description on an ALREADY SAVED version.
 * Only touches the `note` field: content, savedAt, versionName and all the
 * stats stay exactly as they were, so labelling an old snapshot never
 * rewrites its history. Returns true/false so the UI can react.
 */
async function updateVersionNote(fileId, versionId, note, overridePid) {
    try {
        const db  = window.SCRIBBLE_DB;
        const pid = overridePid || window._projectId;

        await merge(
            doc(db, 'projects', pid, 'files', fileId, 'versions', versionId),
            { note: (note || '').trim() }
        );

        return true;

    } catch (error) {

        console.error("Error updating version note:", error);

        return false;

    }

}

async function deleteVersion(fileId, versionId, overridePid) {
    try {
        const db  = window.SCRIBBLE_DB;
        const pid = overridePid || window._projectId;

        await remove(doc(db, 'projects', pid, 'files', fileId, 'versions', versionId));

    } catch (error) {

        console.error("Error deleting version:", error);

    }

}

window.EDITOR_FB = {

    getFileContent,

    saveFileContent,

    saveEditorStyle,

    saveVersion,

    listVersions,

    updateVersionNote,

    deleteVersion

};