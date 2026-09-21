/* ═══════════════════════════════════════════════════
   PASSHUB — ACCESS LOG
   js/passhub-access-log.js

   Every gate event, written down. Unlocks, wrong
   passcodes, wrong answers, rerolled questions, lockouts
   and idle locks all land in one database node, so that
   if any of it happens while you're not looking, there is
   something to look at afterwards.

   On a vault this is the part that earns its keep: a gate
   tells you someone got in, a log tells you someone TRIED.

   ── WRITING ───────────────────────────────────────
   record(event, detail) is fire-and-forget. It never
   blocks the gate and it never throws — a log entry
   failing must not be what stops you signing in.

   ── READING ───────────────────────────────────────
   PH_ACCESS_LOG.open() paints the modal. The button lives
   in the lobby (PassHub-landing_page.html).

   ── WHAT IS NOT STORED ────────────────────────────
   Never the passcode, never an answer — not even a wrong
   one. A failed attempt records THAT it failed and which
   question was on screen, nothing typed. A log you'd have
   to keep secret is not much of a log.

   Load AFTER passhub-firebase.js.
═══════════════════════════════════════════════════ */

window.PH_ACCESS_LOG = (function () {
'use strict';

var LOG_PATH = 'passhub-access-log';
var READ_MAX = 200;

/* Trimmed on write, so the node can't grow without bound on a
   database that is also holding the vault itself. */
var KEEP_MAX = 400;

/* Event → how it reads in the modal. Anything unknown falls
   through to the raw string rather than being dropped. */
var LABELS = {
    'unlock':            { icon: '✓',  text: 'Signed in',                  tone: 'ok'   },
    'identity-failed':   { icon: '✕',  text: 'Wrong name or passcode',     tone: 'bad'  },
    'answer-failed':     { icon: '✕',  text: 'Wrong answer',               tone: 'bad'  },
    'question-rerolled': { icon: '↻',  text: 'Asked for another question', tone: 'warn' },
    'locked-out':        { icon: '⛔', text: 'Attempts used up',           tone: 'bad'  },
    'idle-lock':         { icon: '⏱',  text: 'Locked — idle',              tone: 'mute' },
    'manual-lock':       { icon: '🔒', text: 'Locked manually',            tone: 'mute' },
    'setup-complete':    { icon: '🔑', text: 'Credentials set up',         tone: 'warn' }
};

/* ══════════════════════════════════════════════════
   WRITING
══════════════════════════════════════════════════ */
function record(event, detail) {
    try {
        var db = window.PH_DB;
        if (!db || typeof db.ref !== 'function') return;

        db.ref(LOG_PATH).push({
            event:  String(event),
            detail: detail ? String(detail).slice(0, 300) : null,
            /* Coarse device hint — enough to tell "my tablet" from
               "something else entirely" without pretending to be
               forensics. */
            agent:  String(navigator.userAgent || '').slice(0, 200),
            at:     Date.now()
        });
    } catch (e) {
        console.warn('[PassHub access log] could not record:', e.message);
    }
}

/* ══════════════════════════════════════════════════
   READING
══════════════════════════════════════════════════ */
function load(max) {
    var db = window.PH_DB;
    if (!db || typeof db.ref !== 'function') return Promise.resolve(null);

    /* Ordered by key, not by the `at` field. Push keys are generated
       from the timestamp and sort chronologically by construction, so
       this gives the same answer as orderByChild('at') without needing
       an index declared on the node. */
    return db.ref(LOG_PATH)
        .limitToLast(max || READ_MAX)
        .once('value')
        .then(function (snap) {
            var rows = [];
            snap.forEach(function (child) {
                rows.push(Object.assign({ id: child.key }, child.val()));
            });
            /* limitToLast gives oldest-first; the modal wants newest-first. */
            return rows.reverse();
        })
        .catch(function (e) {
            console.warn('[PassHub access log] could not read:', e.message);
            return null;
        });
}

/* Drops everything past KEEP_MAX. Called after an unlock, when
   there is a live connection and nobody is waiting on it. */
function trim() {
    var db = window.PH_DB;
    if (!db || typeof db.ref !== 'function') return;

    db.ref(LOG_PATH).once('value').then(function (snap) {
        var keys = [];
        snap.forEach(function (c) { keys.push({ k: c.key, at: (c.val() || {}).at || 0 }); });
        if (keys.length <= KEEP_MAX) return;

        keys.sort(function (a, b) { return a.at - b.at; });
        var drop = {};
        keys.slice(0, keys.length - KEEP_MAX).forEach(function (r) { drop[r.k] = null; });
        db.ref(LOG_PATH).update(drop);
    }).catch(function () { /* trimming is housekeeping, never urgent */ });
}

/* ══════════════════════════════════════════════════
   THE MODAL
   Styles injected here rather than added to a stylesheet,
   so this drops into any PassHub page that loads the
   script without touching its CSS.
══════════════════════════════════════════════════ */
var modal = null;

function open() {
    if (modal) return;

    modal = document.createElement('div');
    modal.id = 'ph-access-log';
    modal.innerHTML =
        '<div class="pal-backdrop"></div>' +
        '<div class="pal-panel" role="dialog" aria-modal="true" aria-labelledby="pal-title">' +
          '<header class="pal-head">' +
            '<div>' +
              '<h2 id="pal-title">Access history</h2>' +
              '<p class="pal-sub">Every sign-in and every failed attempt.</p>' +
            '</div>' +
            '<button class="pal-x" id="pal-x" aria-label="Close">✕</button>' +
          '</header>' +
          '<div class="pal-filters">' +
            '<button class="pal-chip on" data-f="all">All</button>' +
            '<button class="pal-chip"    data-f="bad">Failures only</button>' +
            '<button class="pal-chip"    data-f="ok">Sign-ins only</button>' +
          '</div>' +
          '<div class="pal-body" id="pal-body"><p class="pal-empty">Loading…</p></div>' +
        '</div>';

    var css = document.createElement('style');
    css.id = 'ph-access-log-css';
    css.textContent = STYLES;
    document.head.appendChild(css);
    document.body.appendChild(modal);

    modal.querySelector('#pal-x').addEventListener('click', close);
    modal.querySelector('.pal-backdrop').addEventListener('click', close);
    document.addEventListener('keydown', onEsc);

    load().then(function (rows) {
        render(rows);
        modal && modal.querySelectorAll('.pal-chip').forEach(function (chip) {
            chip.addEventListener('click', function () {
                modal.querySelectorAll('.pal-chip').forEach(function (c) { c.classList.remove('on'); });
                chip.classList.add('on');
                render(rows, chip.dataset.f);
            });
        });
    });
}

function onEsc(e) { if (e.key === 'Escape') close(); }

function close() {
    if (!modal) return;
    document.removeEventListener('keydown', onEsc);
    modal.remove();
    var css = document.getElementById('ph-access-log-css');
    if (css) css.remove();
    modal = null;
}

function render(rows, filter) {
    var body = modal && modal.querySelector('#pal-body');
    if (!body) return;

    if (rows === null) {
        body.innerHTML = '<p class="pal-empty">Could not read the log. ' +
                         'It lives in the database, so this needs a connection.</p>';
        return;
    }
    if (!rows.length) {
        body.innerHTML = '<p class="pal-empty">Nothing recorded yet.</p>';
        return;
    }

    var shown = rows.filter(function (r) {
        var tone = (LABELS[r.event] || {}).tone;
        if (filter === 'bad') return tone === 'bad';
        if (filter === 'ok')  return tone === 'ok';
        return true;
    });

    if (!shown.length) {
        body.innerHTML = '<p class="pal-empty">Nothing matches that filter.</p>';
        return;
    }

    body.innerHTML = shown.map(function (r) {
        var meta = LABELS[r.event] || { icon: '•', text: r.event, tone: 'mute' };
        var when = r.at ? new Date(r.at) : null;
        return '<div class="pal-row pal-' + meta.tone + '">' +
                 '<span class="pal-icon">' + meta.icon + '</span>' +
                 '<div class="pal-main">' +
                   '<div class="pal-what">' + esc(meta.text) + '</div>' +
                   (r.detail ? '<div class="pal-detail">' + esc(r.detail) + '</div>' : '') +
                   '<div class="pal-agent">' + esc(shortAgent(r.agent)) + '</div>' +
                 '</div>' +
                 '<div class="pal-when" title="' + esc(when ? when.toLocaleString() : '') + '">' +
                   esc(relative(when)) +
                 '</div>' +
               '</div>';
    }).join('');
}

/* A full user-agent string is unreadable; this keeps the part
   that actually distinguishes one of your devices from another. */
function shortAgent(ua) {
    if (!ua) return 'unknown device';
    var os = /Windows NT/.test(ua)       ? 'Windows' :
             /Android/.test(ua)          ? 'Android' :
             /iPhone|iPad|iPod/.test(ua) ? 'iOS'     :
             /Mac OS X/.test(ua)         ? 'macOS'   :
             /Linux/.test(ua)            ? 'Linux'   : 'unknown OS';
    var br = /Edg\//.test(ua)            ? 'Edge'    :
             /OPR\//.test(ua)            ? 'Opera'   :
             /Firefox\//.test(ua)        ? 'Firefox' :
             /Chrome\//.test(ua)         ? 'Chrome'  :
             /Safari\//.test(ua)         ? 'Safari'  : 'browser';
    return br + ' on ' + os;
}

function relative(d) {
    if (!d) return '—';
    var diff = Date.now() - d.getTime();
    var m  = Math.floor(diff / 60000);
    var h  = Math.floor(diff / 3600000);
    var dy = Math.floor(diff / 86400000);
    if (m < 1)  return 'just now';
    if (m < 60) return m + 'm ago';
    if (h < 24) return h + 'h ago';
    if (dy < 7) return dy + 'd ago';
    return d.toLocaleDateString();
}

function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/* Palette lifted from css/passhub-verification.css so the modal
   belongs to the gate it reports on — warm neutral, hairline
   borders, small uppercase micro-labels. */
var STYLES = [
    '#ph-access-log{position:fixed;inset:0;z-index:99999;display:flex;',
      'align-items:center;justify-content:center;',
      'font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;}',
    '#ph-access-log .pal-backdrop{position:absolute;inset:0;background:rgba(30,30,26,.42);}',
    '#ph-access-log .pal-panel{position:relative;width:min(94vw,600px);max-height:82vh;',
      'display:flex;flex-direction:column;background:#FCFCFB;color:#4A4A4A;',
      'border:1px solid rgba(0,0,0,.06);border-radius:8px;',
      'box-shadow:0 4px 20px rgba(0,0,0,.11),0 20px 60px rgba(0,0,0,.18);',
      'overflow:hidden;animation:pal-in .16s ease-out;}',
    '@keyframes pal-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
    '#ph-access-log .pal-head{display:flex;align-items:flex-start;justify-content:space-between;',
      'gap:12px;padding:18px 20px 14px;border-bottom:1px solid rgba(0,0,0,.06);}',
    '#ph-access-log h2{margin:0;font-family:"Roboto Condensed",sans-serif;font-size:13px;',
      'font-weight:700;letter-spacing:2.4px;text-transform:uppercase;color:#4A4A4A;}',
    '#ph-access-log .pal-sub{margin:5px 0 0;font-size:10px;color:#9A9A9A;letter-spacing:.3px;}',
    '#ph-access-log .pal-x{background:none;border:none;font-size:14px;color:#9A9A9A;',
      'cursor:pointer;padding:2px 6px;border-radius:5px;line-height:1;}',
    '#ph-access-log .pal-x:hover{background:rgba(0,0,0,.05);color:#4A4A4A;}',
    '#ph-access-log .pal-filters{display:flex;gap:6px;padding:12px 20px;',
      'border-bottom:1px solid rgba(0,0,0,.06);}',
    '#ph-access-log .pal-chip{border:1px solid rgba(0,0,0,.1);background:#fff;border-radius:20px;',
      'padding:5px 12px;font-size:8.5px;font-weight:700;text-transform:uppercase;',
      'letter-spacing:1.2px;color:#9A9A9A;cursor:pointer;font-family:inherit;}',
    '#ph-access-log .pal-chip:hover{color:#4A4A4A;}',
    '#ph-access-log .pal-chip.on{background:#5C5C52;border-color:#5C5C52;color:#fff;}',
    '#ph-access-log .pal-body{overflow-y:auto;padding:6px 0;}',
    '#ph-access-log .pal-empty{padding:34px 24px;text-align:center;font-size:11.5px;',
      'color:#9A9A9A;line-height:1.7;}',
    '#ph-access-log .pal-row{display:flex;gap:12px;align-items:flex-start;padding:11px 20px;',
      'border-bottom:1px solid rgba(0,0,0,.04);}',
    '#ph-access-log .pal-row:last-child{border-bottom:none;}',
    '#ph-access-log .pal-row:hover{background:rgba(0,0,0,.025);}',
    '#ph-access-log .pal-icon{width:18px;text-align:center;font-size:12px;padding-top:1px;}',
    '#ph-access-log .pal-main{flex:1;min-width:0;}',
    '#ph-access-log .pal-what{font-size:12px;font-weight:600;color:#4A4A4A;}',
    '#ph-access-log .pal-detail{font-size:11px;color:#7A7A7A;margin-top:2px;overflow-wrap:anywhere;}',
    '#ph-access-log .pal-agent{font-size:9.5px;color:#B0B0B0;margin-top:3px;letter-spacing:.2px;}',
    '#ph-access-log .pal-when{font-size:10px;color:#9A9A9A;white-space:nowrap;padding-top:1px;}',
    '#ph-access-log .pal-bad  .pal-icon,#ph-access-log .pal-bad .pal-what{color:#C0392B;}',
    '#ph-access-log .pal-ok   .pal-icon{color:#5F8A5F;}',
    '#ph-access-log .pal-warn .pal-icon{color:#B08A5C;}',
    '#ph-access-log .pal-mute .pal-icon{color:#9A9A9A;}'
].join('');

return { record: record, load: load, trim: trim, open: open, close: close };

})();

/* Convenience for an onclick="" in the lobby. */
window.openAccessLog = function () { window.PH_ACCESS_LOG.open(); };
