/* ═══════════════════════════════════════════════════
   SCRIBBLE — SIDEBAR "RECENT"
   js/scribble-recent.js

   The recently-touched files panel, shared by every page
   that has a sidebar.

   Replaces the old global log feed, which fed off a
   separate `logs` collection storing only a filename and
   a timestamp — no project, no id, so a row could never
   be clicked through to anything. This reads the files
   themselves, so every row knows where it lives and
   opens straight into the editor.

   Ranked by whichever is later: last modified, or last
   opened.

   ── WHY IT IS ITS OWN FILE ────────────────────────
   It used to live inside scribble-firebase.js, which
   only the workshop loads — so the archive, project and
   bin pages were stuck with the old Logs panel. Copying
   it into each of them would have meant four versions to
   keep in step. One module, imported wherever a
   #recent-list exists.

   ── COST ──────────────────────────────────────────
   A collection-group query reads the recent files across
   every project in ONE round trip. The old per-project
   loop cost 1 + N, which was tolerable on a single page
   and would not have been on four.

   That query needs its collection-group index enabled,
   the same one the delete path asks for. Until it is,
   this falls back to the per-project walk, so the panel
   works either way.
═══════════════════════════════════════════════════ */

import './scribble-boot.js';
import { db, whenMs } from './scribble-db.js';
import {
    collection, collectionGroup, query, where, orderBy, limit,
    getDocs, onSnapshot
} from './vendor/firebase.js';

const RECENT_MAX = 12;
const recentEl   = document.getElementById('recent-list');

/* init() runs at the BOTTOM of this file, not here. It calls
   loadRecent(), which reads window.recentCutoff — and that fallback is
   defined further down. Starting up here happened to work only because
   the first await handed control back long enough for the rest of the
   module to finish; that is a coincidence, not a guarantee. */

/* Takes the file doc, not two timestamps, so whenMs can fall back to
   the *LocalMs companions. Reading the raw fields meant anything saved
   offline scored 0 and dropped out of Recent entirely — the one list
   you would most want it in. */
function laterOf(f) {
    return Math.max(whenMs(f, 'updatedAt'), whenMs(f, 'accessedAt'));
}

/* Project names, so a row can say where it lives. Cached per load
   rather than re-read per file. */
async function projectIndex() {
    const map = new Map();
    const snap = await getDocs(collection(db, 'projects'));
    snap.docs.forEach(d => {
        const x = d.data();
        if (x.deleted || x.archived) return;
        map.set(d.id, x.name || 'Project');
    });
    return map;
}

function shape(f, id, projectId, projectName) {
    return {
        id, projectId, projectName,
        name:            f.name || 'Untitled',
        type:            f.type || '',
        isSymlink:       f.isSymlink === true,
        targetId:        f.targetId || null,
        targetProjectId: f.targetProjectId || null,
        ms:              laterOf(f)
    };
}

/* One query for every project at once. */
async function collectFast(projects) {
    const snap = await getDocs(query(
        collectionGroup(db, 'files'),
        orderBy('updatedAt', 'desc'),
        limit(RECENT_MAX * 8)          /* headroom: some will be filtered out */
    ));

    const rows = [];
    for (const d of snap.docs) {
        const f = d.data();
        if (f.deleted || f.archived) continue;

        const pid = f.projectId ||
            (d.ref.parent && d.ref.parent.parent ? d.ref.parent.parent.id : null);
        if (!pid || !projects.has(pid)) continue;   // deleted/archived project

        rows.push(shape(f, d.id, pid, projects.get(pid)));
    }
    return rows;
}

/* The original walk: one small query per project. */
async function collectSlow(projects) {
    const per = await Promise.all([...projects.keys()].map(async pid => {
        try {
            const fs = await getDocs(query(
                collection(db, 'projects', pid, 'files'),
                orderBy('updatedAt', 'desc'),
                limit(RECENT_MAX)
            ));
            return fs.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(f => !f.deleted && !f.archived)
                .map(f => shape(f, f.id, pid, projects.get(pid)));
        } catch (e) { return []; }
    }));
    return per.flat();
}

export async function loadRecent() {
    if (!recentEl) return;
    try {
        const projects = await projectIndex();

        let rows;
        try {
            rows = await collectFast(projects);
        } catch (e) {
            if (e && e.code === 'failed-precondition') {
                console.warn('[Scribble] Recent is using the slow path — create the ' +
                             'collection-group index from the link above to speed it up.');
            }
            rows = await collectSlow(projects);
        }

        /* The later of the rolling 24h edge and your last manual Clear.
           The workshop and project page each define their own
           recentCutoff; this module supplies one otherwise. */
        const cutoff = (typeof window.recentCutoff === 'function')
            ? window.recentCutoff()
            : Date.now() - 24 * 60 * 60 * 1000;

        render(rows.filter(f => f.ms > cutoff)
                   .sort((a, b) => b.ms - a.ms)
                   .slice(0, RECENT_MAX));
    } catch (e) {
        console.warn('[Scribble] Recent:', e.message);
        recentEl.innerHTML = '<div class="logs-empty">Offline</div>';
    }
}

function render(rows) {
    if (!recentEl) return;
    if (!rows.length) {
        recentEl.innerHTML = '<div class="logs-empty">Nothing in the last 24 hours</div>';
        return;
    }

    recentEl.innerHTML = rows.map(r => {
        /* A symlink opens its target, not the pointer. */
        const openPid = r.isSymlink && r.targetProjectId ? r.targetProjectId : r.projectId;
        const openId  = r.isSymlink && r.targetId        ? r.targetId        : r.id;
        const label   = esc(r.name) + (r.type ? '.' + esc(r.type) : '');

        return '<div class="recent-row" title="' + esc(r.projectName) + ' — click to open" ' +
               'onclick="openRecent(\'' + openPid + '\',\'' + openId + '\')">' +
               '<div class="recent-main">' +
                 '<div class="recent-name">' + label +
                   (r.isSymlink ? ' <i class="fa-solid fa-link recent-link"></i>' : '') +
                 '</div>' +
                 '<div class="recent-project">' + esc(r.projectName) + '</div>' +
               '</div>' +
               '<div class="recent-time">' + relative(r.ms) + '</div>' +
               '</div>';
    }).join('');
}

/* Jump straight into the editor: the project page reads ?open= on load. */
window.openRecent = function (pid, fileId) {
    window.location.href = 'Scribble-project.html?id=' + encodeURIComponent(pid) +
                           '&open=' + encodeURIComponent(fileId);
};

/* ══════════════════════════════════════════════════
   PANEL BEHAVIOUR — COLLAPSE, AND THE RIGHT-CLICK MENU
   ══════════════════════════════════════════════════
   All of this is defined ONLY IF the page has not
   already provided its own.

   The workshop (scribble-app.js) and the project page
   (scribble-project-app.js) each carry their own copies,
   and theirs differ in ways that matter — the project
   page clears per-project, using its own localStorage
   key, because its panel lists one project rather than
   all of them. Overwriting those would quietly change
   what Clear means on that page.

   The archive and the bin had neither, which is why
   their panel could not be collapsed and had no menu at
   all. These are the fallbacks they get.
══════════════════════════════════════════════════ */

/*
 * Collapse, matching scribble-app.js and scribble-project-app.js
 * exactly — style.display on the list, an `open` class on the chevron,
 * and the state saved under 'logsOpen'.
 *
 * An earlier version of this fallback toggled a `.collapsed` class on
 * the section instead. Nothing styles that class, so on the archive
 * and the bin the chevron moved and the panel did not, and the state
 * was never remembered. Two panels that look identical have to behave
 * identically; inventing a second mechanism for the same control is
 * how they drift.
 */
if (typeof window.toggleLogs !== 'function') {
    window.toggleLogs = function () {
        const list    = document.getElementById('recent-list');
        const chevron = document.getElementById('logs-chevron');
        if (!list) return;
        const isOpen = list.style.display !== 'none';
        list.style.display = isOpen ? 'none' : 'block';
        if (chevron) chevron.classList.toggle('open', !isOpen);
        try { localStorage.setItem('logsOpen', String(!isOpen)); } catch (e) {}
    };
}

/* Restore the saved state on load. The other two pages each run their
   own initLogsState(); the archive and bin had none, so their panel
   always came back open however you left it. */
if (typeof window.initLogsState !== 'function') {
    window.initLogsState = function () {
        const list    = document.getElementById('recent-list');
        const chevron = document.getElementById('logs-chevron');
        if (!list || !chevron) return;
        let saved = null;
        try { saved = localStorage.getItem('logsOpen'); } catch (e) {}
        const isOpen = saved === null ? true : saved === 'true';   // default open
        list.style.display = isOpen ? 'block' : 'none';
        chevron.classList.toggle('open', isOpen);
    };
}

/*
 * Clearing writes a watermark and nothing else. No log entry is
 * touched and no file is written, so this hides rows rather than
 * destroying anything — edit a file and it comes straight back.
 *
 * Same key the workshop uses, deliberately: both show the same
 * all-projects list, so clearing in one should clear in the other.
 */
const RECENT_CLEAR_KEY = 'scribbleRecentClearedAt';

if (typeof window.recentCutoff !== 'function') {
    window.recentCutoff = function () {
        let cleared = 0;
        try {
            cleared = parseInt(localStorage.getItem(RECENT_CLEAR_KEY) || '0', 10) || 0;
        } catch (e) { /* storage blocked — fall back to the 24h edge */ }
        return Math.max(cleared, Date.now() - 24 * 60 * 60 * 1000);
    };
}

/* Self-contained: the archive and bin have no hideCtxMenu() of their
   own, so this owns its element rather than borrowing page state. */
let ctxMenu = null;

function closeRecentCtx() {
    if (!ctxMenu) return;
    ctxMenu.remove();
    ctxMenu = null;
    document.removeEventListener('click', closeRecentCtx, true);
    document.removeEventListener('keydown', onCtxKey);
}

function onCtxKey(e) { if (e.key === 'Escape') closeRecentCtx(); }

if (typeof window.showRecentCtxMenu !== 'function') {
    window.showRecentCtxMenu = function (e) {
        e.preventDefault();
        e.stopPropagation();
        closeRecentCtx();

        /* Any menu the page itself left open should go too. */
        if (typeof window.hideCtxMenu === 'function') window.hideCtxMenu();

        ctxMenu = document.createElement('div');
        ctxMenu.className = 'context-menu';
        ctxMenu.innerHTML =
            '<div class="ctx-item" onclick="clearRecent()">' +
            '<i class="fa-regular fa-circle-xmark"></i>CLEAR</div>' +
            '<div class="ctx-item" onclick="refreshRecent()">' +
            '<i class="fa-solid fa-rotate"></i>REFRESH</div>';
        document.body.appendChild(ctxMenu);

        const menuW = 174, menuH = 76;
        const left = Math.min(e.clientX, window.innerWidth  - menuW - 8);
        const top  = Math.min(e.clientY, window.innerHeight - menuH - 8);
        ctxMenu.style.left = Math.max(8, left) + 'px';
        ctxMenu.style.top  = Math.max(8, top)  + 'px';

        /* Capture phase, so the click that dismisses also lands on
           whatever is underneath without the menu swallowing it. */
        setTimeout(function () {
            document.addEventListener('click', closeRecentCtx, true);
            document.addEventListener('keydown', onCtxKey);
        }, 0);
    };
}

if (typeof window.clearRecent !== 'function') {
    window.clearRecent = function () {
        closeRecentCtx();
        try { localStorage.setItem(RECENT_CLEAR_KEY, String(Date.now())); } catch (e) {}
        loadRecent();
    };
}

if (typeof window.refreshRecent !== 'function') {
    window.refreshRecent = function () { closeRecentCtx(); loadRecent(); };
}

/* The workshop's menu calls loadRecentNow(); the project page's calls
   refreshRecent(). Both names resolve here so either markup works. */
if (typeof window.loadRecentNow !== 'function') {
    window.loadRecentNow = function () { closeRecentCtx(); loadRecent(); };
}

function relative(ms) {
    if (!ms) return '—';
    const diff = Date.now() - ms;
    const mins = Math.floor(diff / 60000);
    const hrs  = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1)  return 'now';
    if (mins < 60) return mins + 'm';
    if (hrs  < 24) return hrs + 'h';
    if (days < 7)  return days + 'd';
    const d = new Date(ms);
    return (d.getMonth() + 1) + '/' + d.getDate();
}

function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function init() {
    window.loadRecent = loadRecent;

    recentEl.addEventListener('contextmenu', function (e) {
        if (typeof window.showRecentCtxMenu === 'function') window.showRecentCtxMenu(e);
    });

    /* Rows age out on their own, but only when something redraws them —
       so nudge it hourly rather than leaving a stale panel open all day. */
    setInterval(loadRecent, 60 * 60 * 1000);

    loadRecent();

    /* Refresh when the project list changes — cheap, and keeps Recent
       honest without a live listener on every file in the account. */
    onSnapshot(collection(db, 'projects'), () => loadRecent(),
               err => console.warn('[Scribble] Recent refresh:', err.message));
}

/* ══════════════════════════════════════════════════
   START — BUT ONLY IF NOBODY ELSE OWNS THE PANEL
   ══════════════════════════════════════════════════
   FIXED 2026-09-17.

   The project page has its own renderRecentPanel(), and it is
   deliberately different from this one: it lists THIS project's
   files, from _contents which is already in memory, and clears
   under a per-project localStorage key. This module lists files
   from EVERY project with a project-name line under each.

   Both were writing #recent-list on the same page. The project
   page repainted on every contents snapshot; this module repainted
   on load, hourly, and on every `projects` snapshot. Whichever
   fired last won, so the panel silently flipped between "this
   project" and "everything" depending on timing.

   Same shape as the guards above: if the page brought its own,
   leave it alone. That also drops a standing onSnapshot listener
   on the whole projects collection from the page that needs it
   least — it already has a live listener of its own.

   The workshop, the archive and the bin have no renderer of their
   own, so this module still runs there exactly as before.
══════════════════════════════════════════════════ */
if (recentEl && typeof window.renderRecentPanel === 'function') {
    /* The page renders its own. Nothing to do — not even loadRecent,
       which would paint over it the moment anything called it. */
    console.info('[Scribble] Recent: this page renders its own panel — ' +
                 'the shared module is standing down.');
} else if (recentEl) {
    /* Only when this module owns the collapse — the workshop and
       project page call their own on load already. */
    if (typeof window.initLogsState === 'function') window.initLogsState();
    init();
}
