/* ═══════════════════════════════════════════════════
   SCRIBBLE — BACKUP
   js/scribble-backup.js

   Reads everything you own out of Firestore and drops it
   on your hard drive as one JSON file.

     SCRIBBLE_BACKUP.download()      whole archive
     SCRIBBLE_BACKUP.preview()       counts only, no file

   or the download icon in the workshop header.

   Uses the session you are already signed into, so there
   is nothing to configure and no service-account key to
   keep safe. If you can see it in Scribble, this can
   export it.

   ── THE SHAPE, AND WHY IT MATTERS ─────────────────
   Documents come out as a flat list:

       { "path": "projects/AbC/files/XyZ", "data": { … } }

   Not nested. A flat list of full paths is the format a
   restore actually wants — every entry is one
   setDoc(doc(db, path), data) with its original ID
   intact, so links between documents (parentId,
   projectId, targetId) still point at the right things
   afterwards. A prettier nested tree would lose the IDs
   and quietly break every one of those references.

   ── TIMESTAMPS ────────────────────────────────────
   JSON.stringify turns a Firestore Timestamp into
   {seconds, nanoseconds}, which restores as a plain map
   rather than a real timestamp — dates would come back
   as unsortable objects. They are tagged here instead,
   so a restore can rebuild them properly.

   ── WHAT IT COSTS ─────────────────────────────────
   One Firestore read per document. A big archive might
   be a few thousand, against a free tier of 50,000 a
   day. Run it whenever you like; just don't put it on a
   one-minute loop.

   ── RESTORE ───────────────────────────────────────
   Deliberately not built. Writing thousands of documents
   back over a live archive is a different and much
   riskier job than reading them, and it should be
   written the day it is needed, with eyes open. This
   file preserves everything that job would require.
═══════════════════════════════════════════════════ */

import './scribble-boot.js';
import { db } from './scribble-db.js';
import { collection, getDocs } from './vendor/firebase.js';

const FORMAT_VERSION = 1;

/* Top-level collections that are just a flat list of documents.
   scribble-devices added 2026-09-17 — the device register was the one
   collection the backup did not cover, so a restore would have come
   back with no record of which machines had opened the archive. It is
   a handful of documents; there was no reason to leave it out. */
const FLAT = ['bin', 'archive', 'logs', 'scribble-auth',
              'scribble-access-log', 'scribble-devices'];

/* Subcollections hanging off every project. */
const PROJECT_SUBS = ['modules', 'sections', 'files', 'logs'];

/* ══════════════════════════════════════════════════
   SERIALISING
══════════════════════════════════════════════════ */
/*
 * Walks a document's fields and makes them JSON-safe without
 * losing type information. Firestore values that are not plain
 * JSON get tagged so a restore can reverse it.
 */
function encode(value) {
    if (value === null || value === undefined) return null;

    /* Timestamp: duck-typed rather than instanceof, because the
       value can come from the local cache as a lookalike. */
    if (typeof value.toDate === 'function' && typeof value.seconds === 'number') {
        return {
            __t: 'timestamp',
            seconds: value.seconds,
            nanoseconds: value.nanoseconds || 0,
            /* Human-readable copy so the file is worth opening in a
               text editor, and so a date survives even if the tag
               is ever mishandled. */
            iso: value.toDate().toISOString()
        };
    }

    /* DocumentReference — Scribble does not store these today, but
       one appearing later shouldn't silently become "{}". */
    if (value.path && value.id && value.parent) {
        return { __t: 'ref', path: value.path };
    }

    if (Array.isArray(value)) return value.map(encode);

    if (typeof value === 'object') {
        const out = {};
        for (const k of Object.keys(value)) out[k] = encode(value[k]);
        return out;
    }

    return value;   // string | number | boolean
}

/* ══════════════════════════════════════════════════
   COLLECTING
══════════════════════════════════════════════════ */
function note(onProgress, msg) {
    if (typeof onProgress === 'function') onProgress(msg);
    console.log('[Scribble backup] ' + msg);
}

export async function collectAll(onProgress) {
    const docs   = [];
    const counts = {};

    function push(path, data, bucket) {
        docs.push({ path, data: encode(data) });
        counts[bucket] = (counts[bucket] || 0) + 1;
    }

    /* ── Projects and everything under them ── */
    note(onProgress, 'Reading projects…');
    const projSnap = await getDocs(collection(db, 'projects'));

    let n = 0;
    for (const p of projSnap.docs) {
        push('projects/' + p.id, p.data(), 'projects');
        n++;
        note(onProgress, 'Project ' + n + '/' + projSnap.size + ' — ' +
                         ((p.data() || {}).name || 'untitled'));

        for (const sub of PROJECT_SUBS) {
            const snap = await getDocs(collection(db, 'projects', p.id, sub));
            for (const d of snap.docs) {
                push('projects/' + p.id + '/' + sub + '/' + d.id, d.data(), sub);
            }

            /* Version history lives one level deeper, under each file.
               Skipping it would mean a backup that quietly loses every
               snapshot you ever took. */
            if (sub === 'files') {
                for (const f of snap.docs) {
                    const vSnap = await getDocs(
                        collection(db, 'projects', p.id, 'files', f.id, 'versions'));
                    for (const v of vSnap.docs) {
                        push('projects/' + p.id + '/files/' + f.id + '/versions/' + v.id,
                             v.data(), 'versions');
                    }
                }
            }
        }
    }

    /* ── Flat top-level collections ── */
    for (const name of FLAT) {
        note(onProgress, 'Reading ' + name + '…');
        try {
            const snap = await getDocs(collection(db, name));
            for (const d of snap.docs) push(name + '/' + d.id, d.data(), name);
        } catch (e) {
            console.warn('[Scribble backup] could not read ' + name + ':', e.message);
            counts[name] = 'FAILED: ' + e.message;
        }
    }

    return {
        format: FORMAT_VERSION,
        app: 'Scribble',
        exportedAt: new Date().toISOString(),
        projectId: (db && db.app && db.app.options && db.app.options.projectId) || null,
        account: (window.SCRIBBLE_SESSION &&
                  window.SCRIBBLE_SESSION.currentUser() &&
                  window.SCRIBBLE_SESSION.currentUser().email) || null,
        counts,
        total: docs.length,
        documents: docs
    };
}

/* ══════════════════════════════════════════════════
   DOWNLOADING
══════════════════════════════════════════════════ */
function stamp() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
           '_' + p(d.getHours()) + p(d.getMinutes());
}

export async function download(onProgress) {
    const bundle = await collectAll(onProgress);

    /* Two-space indent: the file is meant to be openable and readable
       by a human in a pinch, which is most of the reassurance a backup
       actually provides. */
    const blob = new Blob([JSON.stringify(bundle, null, 2)],
                          { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'scribble-backup_' + stamp() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();

    /* Revoked late: some browsers abort the save if the blob URL is
       released the instant the click returns. */
    setTimeout(() => URL.revokeObjectURL(url), 30000);

    console.log('[Scribble backup] ' + bundle.total + ' documents saved.');
    console.table(bundle.counts);
    return bundle;
}

/* Counts without writing a file — for when you just want to know
   the archive is all still there. */
export async function preview() {
    const bundle = await collectAll();
    console.log('[Scribble backup] ' + bundle.total + ' documents found.');
    console.table(bundle.counts);
    return bundle.counts;
}

window.SCRIBBLE_BACKUP = { download, preview, collectAll, confirm: confirmBackup };

/* ══════════════════════════════════════════════════
   CONFIRMATION
   A backup reads every document you own, which on a
   large archive is thousands of reads and a noticeable
   wait. That is not something a stray click should be
   able to start, so the menu asks first.

   Doubles as the progress display: once you confirm,
   the same dialog stays up and reports what it is
   reading, then what it saved. A silent spinner would
   leave you unsure whether a long backup had stalled.
══════════════════════════════════════════════════ */
let dialog = null;

function closeDialog() {
    if (!dialog) return;
    dialog.host.remove();
    const css = document.getElementById('scribble-backup-css');
    if (css) css.remove();
    document.removeEventListener('keydown', dialog.onKey);
    dialog = null;
}

export function confirmBackup() {
    if (dialog) return;

    const host = document.createElement('div');
    host.id = 'scribble-backup-dialog';
    host.innerHTML =
        '<div class="sbk-backdrop"></div>' +
        '<div class="sbk-card" role="dialog" aria-modal="true" aria-labelledby="sbk-title">' +
          '<div class="sbk-top">' +
            '<i class="fa-solid fa-download sbk-icon"></i>' +
            '<h2 id="sbk-title">Download a backup?</h2>' +
          '</div>' +
          '<p class="sbk-body">' +
            'Reads every project, file, version, log, bin and archive entry ' +
            'you own and saves them to one JSON file on this device.' +
          '</p>' +
          '<ul class="sbk-points">' +
            '<li>Nothing is changed — this only reads.</li>' +
            '<li>A large archive can take a minute.</li>' +
            '<li>Costs one Firestore read per document.</li>' +
          '</ul>' +
          '<div class="sbk-status" id="sbk-status" hidden></div>' +
          '<div class="sbk-actions" id="sbk-actions">' +
            '<button type="button" class="sbk-primary" id="sbk-go">Download</button>' +
            '<button type="button" class="sbk-ghost" id="sbk-cancel">Cancel</button>' +
          '</div>' +
        '</div>';

    const css = document.createElement('style');
    css.id = 'scribble-backup-css';
    css.textContent = STYLES;
    document.head.appendChild(css);
    document.body.appendChild(host);

    /* Escape and the backdrop cancel — but only while it is still a
       question. Once a backup is running, dismissing the dialog would
       hide a job that is still going. */
    function onKey(e) { if (e.key === 'Escape' && !dialog.running) closeDialog(); }
    document.addEventListener('keydown', onKey);

    dialog = { host, onKey, running: false };

    host.querySelector('.sbk-backdrop').addEventListener('click', () => {
        if (!dialog.running) closeDialog();
    });
    host.querySelector('#sbk-cancel').addEventListener('click', closeDialog);
    host.querySelector('#sbk-go').addEventListener('click', runFromDialog);

    host.querySelector('#sbk-go').focus();
}

async function runFromDialog() {
    if (!dialog || dialog.running) return;
    dialog.running = true;

    const host    = dialog.host;
    const status  = host.querySelector('#sbk-status');
    const actions = host.querySelector('#sbk-actions');

    status.hidden = false;
    status.textContent = 'Starting…';
    actions.innerHTML = '<button type="button" class="sbk-ghost" disabled>Working…</button>';

    try {
        const bundle = await download(msg => { status.textContent = msg; });

        status.classList.add('done');
        status.textContent = bundle.total + ' documents saved to your Downloads folder.';
        actions.innerHTML = '<button type="button" class="sbk-primary" id="sbk-done">Done</button>';
        host.querySelector('#sbk-done').addEventListener('click', closeDialog);
        host.querySelector('#sbk-done').focus();
    } catch (e) {
        console.error('[Scribble backup]', e);
        status.classList.add('bad');
        status.textContent = 'Failed: ' + (e.message || e) + ' — nothing was changed.';
        actions.innerHTML = '<button type="button" class="sbk-ghost" id="sbk-close">Close</button>';
        host.querySelector('#sbk-close').addEventListener('click', closeDialog);
    } finally {
        dialog.running = false;
    }
}

/* The menu calls this. */
window.runScribbleBackup = confirmBackup;

const STYLES = [
    '#scribble-backup-dialog{position:fixed;inset:0;z-index:100001;display:flex;',
      'align-items:center;justify-content:center;',
      'font-family:"Roboto Condensed",system-ui,-apple-system,Segoe UI,sans-serif;}',
    '#scribble-backup-dialog .sbk-backdrop{position:absolute;inset:0;background:rgba(30,30,26,.45);}',
    '#scribble-backup-dialog .sbk-card{position:relative;width:min(92vw,420px);background:#fff;',
      'border-radius:var(--radius,12px);padding:22px 22px 18px;',
      'box-shadow:var(--shadow-lg,0 20px 60px rgba(0,0,0,.22));',
      'animation:sbk-in .16s cubic-bezier(0.16,1,0.3,1);}',
    '@keyframes sbk-in{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}',
    '#scribble-backup-dialog .sbk-top{display:flex;align-items:center;gap:9px;margin-bottom:12px;}',
    '#scribble-backup-dialog .sbk-icon{color:var(--accent,#5C5C52);font-size:15px;}',
    '#scribble-backup-dialog h2{margin:0;font-size:14.5px;font-weight:600;',
      'color:var(--text,#4A4A4A);letter-spacing:.3px;}',
    '#scribble-backup-dialog .sbk-body{margin:0 0 12px;font-size:12.5px;line-height:1.6;',
      'color:var(--text,#4A4A4A);}',
    '#scribble-backup-dialog .sbk-points{margin:0 0 16px;padding-left:16px;',
      'font-size:11.5px;line-height:1.75;color:var(--sub,#9A9A9A);}',
    '#scribble-backup-dialog .sbk-status{margin:0 0 14px;padding:9px 11px;',
      'background:var(--well,#FAFAF9);border:1px solid var(--well-border,rgba(0,0,0,.05));',
      'border-radius:var(--radius-sm,7px);font-size:11.5px;line-height:1.5;',
      'color:var(--sub,#9A9A9A);overflow-wrap:anywhere;}',
    '#scribble-backup-dialog .sbk-status.done{color:#5F8A5F;}',
    '#scribble-backup-dialog .sbk-status.bad{color:#E05A4E;}',
    '#scribble-backup-dialog .sbk-actions{display:flex;gap:8px;}',
    '#scribble-backup-dialog button{flex:1;padding:10px 12px;border-radius:var(--radius-sm,7px);',
      'cursor:pointer;font-family:inherit;font-size:10px;letter-spacing:2px;',
      'text-transform:uppercase;font-weight:600;transition:opacity .18s,background .18s;}',
    '#scribble-backup-dialog .sbk-primary{background:var(--accent,#5C5C52);color:#fff;border:none;}',
    '#scribble-backup-dialog .sbk-primary:hover{opacity:.88;}',
    '#scribble-backup-dialog .sbk-ghost{background:none;color:var(--sub,#9A9A9A);',
      'border:1px solid rgba(0,0,0,.12);}',
    '#scribble-backup-dialog .sbk-ghost:hover:not(:disabled){color:var(--text,#4A4A4A);background:rgba(0,0,0,.03);}',
    '#scribble-backup-dialog button:disabled{cursor:default;opacity:.6;}'
].join('');
