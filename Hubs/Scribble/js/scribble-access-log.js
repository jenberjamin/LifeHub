/* ═══════════════════════════════════════════════════
   SCRIBBLE — ACCESS LOG
   js/scribble-access-log.js

   Every gate event, written down. Unlocks, wrong
   passcodes, wrong answers, rerolled questions, lockouts
   and idle locks all land in one Firestore collection so
   that if any of it happens while you're not looking,
   there is something to look at afterwards.

   ── WRITING ───────────────────────────────────────
   record(event, detail) is fire-and-forget through the
   same queued-write helper as everything else, so it
   works offline and never blocks the gate. A log entry
   failing must never be what stops you signing in.

   Two ways in, because the callers differ:
     • import { record }        — modules (gate, setup)
     • window.SCRIBBLE_ACCESS_LOG.record(...)
                                — classic scripts (guard)

   ── READING ───────────────────────────────────────
   openAccessLog() paints the modal. The button lives in
   the workshop header (Scribble.html).

   ── WHAT IS NOT STORED ────────────────────────────
   Never the passcode, never an answer — not even a
   wrong one. A failed attempt records THAT it failed
   and which question was on screen, nothing typed.
   A log you'd have to keep secret is not much of a log.
═══════════════════════════════════════════════════ */

import { db, nowFields, whenDate, add } from './scribble-db.js';
import { collection, query, orderBy, limit, getDocs } from './vendor/firebase.js';

const LOG_COLL = 'scribble-access-log';
const READ_MAX = 200;

/* Event → how it reads in the modal. Anything unknown falls
   through to the raw string rather than being dropped. */
const LABELS = {
    'unlock':            { icon: '✓',  text: 'Signed in',                 tone: 'ok'   },
    'identity-failed':   { icon: '✕',  text: 'Wrong name or passcode',    tone: 'bad'  },
    'answer-failed':     { icon: '✕',  text: 'Wrong answer',              tone: 'bad'  },
    'question-rerolled': { icon: '↻',  text: 'Asked for another question',tone: 'warn' },
    'locked-out':        { icon: '⛔', text: 'Attempts used up',          tone: 'bad'  },
    'idle-lock':         { icon: '⏱',  text: 'Locked — 30 min idle',      tone: 'mute' },
    'manual-lock':       { icon: '🔒', text: 'Locked manually',           tone: 'mute' },
    'setup-complete':    { icon: '🔑', text: 'Credentials set up',        tone: 'warn' }
};

/* ══════════════════════════════════════════════════
   WRITING
══════════════════════════════════════════════════ */
export function record(event, detail) {
    try {
        add(collection(db, LOG_COLL), {
            event:   String(event),
            detail:  detail ? String(detail).slice(0, 300) : null,
            /* Coarse device hint — enough to tell "my tablet" from
               "something else entirely" without pretending to be
               forensics. */
            agent:   String(navigator.userAgent || '').slice(0, 200),
            surface: (window.LIFEHUB_SURFACE && window.LIFEHUB_SURFACE.current) || null,
            ...nowFields('timestamp')
        });
    } catch (e) {
        console.warn('[Scribble access log] could not record:', e.message);
    }
}

/* ══════════════════════════════════════════════════
   READING
══════════════════════════════════════════════════ */
export async function loadAccessLog(max) {
    try {
        const snap = await getDocs(query(
            collection(db, LOG_COLL),
            orderBy('timestamp', 'desc'),
            limit(max || READ_MAX)
        ));
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        console.warn('[Scribble access log] could not read:', e.message);
        return null;
    }
}

/* ══════════════════════════════════════════════════
   THE MODAL
   Styles injected here rather than added to
   scribble.css, so this drops into any page that loads
   the module without touching a stylesheet.
══════════════════════════════════════════════════ */
let modal = null;

export async function openAccessLog() {
    if (modal) return;

    modal = document.createElement('div');
    modal.id = 'scribble-access-log';
    modal.innerHTML =
        '<div class="sal-backdrop"></div>' +
        '<div class="sal-panel" role="dialog" aria-modal="true" aria-labelledby="sal-title">' +
          '<header class="sal-head">' +
            '<div>' +
              '<h2 id="sal-title">Access history</h2>' +
              '<p class="sal-sub">Every sign-in and every failed attempt.</p>' +
            '</div>' +
            '<button class="sal-x" id="sal-x" aria-label="Close">✕</button>' +
          '</header>' +
          '<div class="sal-filters" id="sal-filters">' +
            '<button class="sal-chip on"  data-f="all">All</button>' +
            '<button class="sal-chip"     data-f="bad">Failures only</button>' +
            '<button class="sal-chip"     data-f="ok">Sign-ins only</button>' +
          '</div>' +
          '<div class="sal-body" id="sal-body"><p class="sal-empty">Loading…</p></div>' +
          '<footer class="sal-foot">' +
            '<span class="sal-who" id="sal-who"></span>' +
            '<button class="sal-out" id="sal-out">Disconnect this device</button>' +
          '</footer>' +
        '</div>';

    const css = document.createElement('style');
    css.id = 'scribble-access-log-css';
    css.textContent = STYLES;
    document.head.appendChild(css);
    document.body.appendChild(modal);

    const close = () => closeAccessLog();
    modal.querySelector('#sal-x').addEventListener('click', close);
    modal.querySelector('.sal-backdrop').addEventListener('click', close);
    document.addEventListener('keydown', onEsc);

    /* Which account this browser is holding. Worth showing next to the
       log: "who is signed in here" is the same question the log answers
       about the past. */
    const who = modal.querySelector('#sal-who');
    const user = (window.SCRIBBLE_SESSION && window.SCRIBBLE_SESSION.currentUser());
    who.textContent = user ? user.email : 'No account session';

    modal.querySelector('#sal-out').addEventListener('click', function () {
        disconnectDevice();
    });

    const rows = await loadAccessLog();
    renderRows(rows);

    modal.querySelectorAll('.sal-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            modal.querySelectorAll('.sal-chip').forEach(c => c.classList.remove('on'));
            chip.classList.add('on');
            renderRows(rows, chip.dataset.f);
        });
    });
}

/* ══════════════════════════════════════════════════
   DISCONNECT THIS DEVICE
   Drops the Firebase session AND the gate unlock, then
   sends you to the gate. Not the same as the idle lock:
   that one only closes the screen, this one gives up
   access to the data and needs the account password
   to undo.

   Lives here rather than in the menu script because the
   sign-out belongs with the record of it — one function,
   one log line, whether it was started from the access
   log's footer or the header menu.
══════════════════════════════════════════════════ */
export async function disconnectDevice() {
    if (!window.SCRIBBLE_SESSION) {
        alert('The account session is not loaded on this page.');
        return;
    }

    const user = window.SCRIBBLE_SESSION.currentUser();
    const ok = confirm(
        'Sign out of this device?\n\n' +
        (user && user.email ? 'Account: ' + user.email + '\n\n' : '') +
        'You will need the account password to get back in, and anything ' +
        'still waiting to sync will stay queued until you do.'
    );
    if (!ok) return;

    record('manual-lock', 'Device disconnected from the account');
    closeAccessLog();               // no-op when it was never open

    /* Stamp the device register BEFORE signing out — afterwards the
       rules reject the write and the row would keep reading as a
       device with access. */
    if (window.SCRIBBLE_DEVICES) {
        try { await window.SCRIBBLE_DEVICES.markSignedOut(); } catch (e) {}
    }

    await window.SCRIBBLE_SESSION.signOutDevice();

    /* ── PASSAGE, added 2026-09-17 ──────────────────────
       The session copies handed to the homescreen die with
       the session, and scribble-passage.js already clears
       them when Firebase announces the sign-out. But that
       clearing is asynchronous and the redirect below is
       immediate, so on a fast machine this page can leave
       before the copies are gone — and a copy that outlives
       your sign-out is a door left open.

       Awaiting it here makes the order certain instead of
       likely. Wrapped, like markSignedOut() above, so a
       failure to tidy up can never strand you on a page you
       have already signed out of.

       No-op if js/scribble-passage.js isn't loaded.
    ─────────────────────────────────────────────────── */
    if (window.SCRIBBLE_PASSAGE) {
        try { await window.SCRIBBLE_PASSAGE.takeBack(); } catch (e) {}
    }

    location.replace('Scribble-gate.html');
}

function onEsc(e) { if (e.key === 'Escape') closeAccessLog(); }

export function closeAccessLog() {
    if (!modal) return;
    document.removeEventListener('keydown', onEsc);
    modal.remove();
    const css = document.getElementById('scribble-access-log-css');
    if (css) css.remove();
    modal = null;
}

function renderRows(rows, filter) {
    const body = modal && modal.querySelector('#sal-body');
    if (!body) return;

    if (rows === null) {
        body.innerHTML = '<p class="sal-empty">Could not read the log. ' +
                         'If you are offline and have never opened it online, ' +
                         'there is nothing cached to show.</p>';
        return;
    }
    if (!rows.length) {
        body.innerHTML = '<p class="sal-empty">Nothing recorded yet.</p>';
        return;
    }

    const shown = rows.filter(r => {
        const tone = (LABELS[r.event] || {}).tone;
        if (filter === 'bad') return tone === 'bad';
        if (filter === 'ok')  return tone === 'ok';
        return true;
    });

    if (!shown.length) {
        body.innerHTML = '<p class="sal-empty">Nothing matches that filter.</p>';
        return;
    }

    body.innerHTML = shown.map(r => {
        const meta = LABELS[r.event] || { icon: '•', text: r.event, tone: 'mute' };
        const when = whenDate(r, 'timestamp');
        return '<div class="sal-row sal-' + meta.tone + '">' +
                 '<span class="sal-icon">' + meta.icon + '</span>' +
                 '<div class="sal-main">' +
                   '<div class="sal-what">' + esc(meta.text) + '</div>' +
                   (r.detail ? '<div class="sal-detail">' + esc(r.detail) + '</div>' : '') +
                   '<div class="sal-agent">' + esc(shortAgent(r.agent)) + '</div>' +
                 '</div>' +
                 '<div class="sal-when" title="' + esc(when ? when.toLocaleString() : '') + '">' +
                   esc(relative(when)) +
                 '</div>' +
               '</div>';
    }).join('');
}

/* A full user-agent string is unreadable; this keeps the part
   that actually distinguishes one of your devices from another. */
function shortAgent(ua) {
    if (!ua) return 'unknown device';
    const os =
        /Windows NT/.test(ua)          ? 'Windows'  :
        /Android/.test(ua)             ? 'Android'  :
        /iPhone|iPad|iPod/.test(ua)    ? 'iOS'      :
        /Mac OS X/.test(ua)            ? 'macOS'    :
        /Linux/.test(ua)               ? 'Linux'    : 'unknown OS';
    const br =
        /Edg\//.test(ua)               ? 'Edge'     :
        /OPR\//.test(ua)               ? 'Opera'    :
        /Firefox\//.test(ua)           ? 'Firefox'  :
        /Chrome\//.test(ua)            ? 'Chrome'   :
        /Safari\//.test(ua)            ? 'Safari'   : 'browser';
    return br + ' on ' + os;
}

function relative(d) {
    if (!d) return '—';
    const diff = Date.now() - d.getTime();
    const m = Math.floor(diff / 60000);
    const h = Math.floor(diff / 3600000);
    const dy = Math.floor(diff / 86400000);
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

/* Exposed for the header button and for classic scripts. */
window.SCRIBBLE_ACCESS_LOG = { record, openAccessLog, closeAccessLog, loadAccessLog, disconnectDevice };
window.openAccessLog = openAccessLog;
/* Read by the header menu (a classic script) to decide whether to
   show the sign-out row at all. */
window.scribbleDisconnectDevice = disconnectDevice;

const STYLES = [
    '#scribble-access-log{position:fixed;inset:0;z-index:99999;display:flex;',
      'align-items:center;justify-content:center;',
      'font-family:"Roboto Condensed",system-ui,-apple-system,Segoe UI,sans-serif;}',
    '#scribble-access-log .sal-backdrop{position:absolute;inset:0;background:rgba(30,30,26,.42);}',
    '#scribble-access-log .sal-panel{position:relative;width:min(94vw,600px);',
      'max-height:82vh;display:flex;flex-direction:column;background:#FFFFFF;',
      'border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.11),0 20px 60px rgba(0,0,0,.18);',
      'overflow:hidden;animation:sal-in .16s ease-out;}',
    '@keyframes sal-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
    '#scribble-access-log .sal-head{display:flex;align-items:flex-start;justify-content:space-between;',
      'gap:12px;padding:18px 20px 14px;border-bottom:1px solid rgba(0,0,0,.06);}',
    '#scribble-access-log h2{margin:0;font-size:15px;font-weight:600;color:#4A4A4A;letter-spacing:.4px;}',
    '#scribble-access-log .sal-sub{margin:3px 0 0;font-size:10.5px;color:#9A9A9A;letter-spacing:.3px;}',
    '#scribble-access-log .sal-x{background:none;border:none;font-size:15px;color:#9A9A9A;',
      'cursor:pointer;padding:2px 6px;border-radius:5px;line-height:1;}',
    '#scribble-access-log .sal-x:hover{background:rgba(0,0,0,.05);color:#4A4A4A;}',
    '#scribble-access-log .sal-filters{display:flex;gap:6px;padding:12px 20px;',
      'border-bottom:1px solid rgba(0,0,0,.06);}',
    '#scribble-access-log .sal-chip{border:1px solid rgba(0,0,0,.1);background:#fff;',
      'border-radius:20px;padding:5px 12px;font-size:10px;text-transform:uppercase;',
      'letter-spacing:1px;color:#9A9A9A;cursor:pointer;font-family:inherit;}',
    '#scribble-access-log .sal-chip:hover{color:#4A4A4A;}',
    '#scribble-access-log .sal-chip.on{background:#5C5C52;border-color:#5C5C52;color:#fff;}',
    '#scribble-access-log .sal-body{overflow-y:auto;padding:6px 0;}',
    '#scribble-access-log .sal-empty{padding:34px 24px;text-align:center;font-size:12px;',
      'color:#9A9A9A;line-height:1.6;}',
    '#scribble-access-log .sal-row{display:flex;gap:12px;align-items:flex-start;',
      'padding:11px 20px;border-bottom:1px solid rgba(0,0,0,.04);}',
    '#scribble-access-log .sal-row:last-child{border-bottom:none;}',
    '#scribble-access-log .sal-row:hover{background:rgba(0,0,0,.025);}',
    '#scribble-access-log .sal-icon{width:18px;text-align:center;font-size:12px;padding-top:1px;}',
    '#scribble-access-log .sal-main{flex:1;min-width:0;}',
    '#scribble-access-log .sal-what{font-size:12.5px;color:#4A4A4A;font-weight:600;}',
    '#scribble-access-log .sal-detail{font-size:11px;color:#7A7A7A;margin-top:2px;',
      'overflow-wrap:anywhere;}',
    '#scribble-access-log .sal-agent{font-size:10px;color:#B0B0B0;margin-top:3px;letter-spacing:.2px;}',
    '#scribble-access-log .sal-when{font-size:10.5px;color:#9A9A9A;white-space:nowrap;padding-top:1px;}',
    '#scribble-access-log .sal-bad  .sal-icon{color:#B05C5C;}',
    '#scribble-access-log .sal-bad  .sal-what{color:#B05C5C;}',
    '#scribble-access-log .sal-ok   .sal-icon{color:#5F8A5F;}',
    '#scribble-access-log .sal-warn .sal-icon{color:#B08A5C;}',
    '#scribble-access-log .sal-mute .sal-icon{color:#9A9A9A;}',
    '#scribble-access-log .sal-foot{display:flex;align-items:center;justify-content:space-between;',
      'gap:12px;padding:11px 20px;border-top:1px solid rgba(0,0,0,.06);background:#FAFAF8;}',
    '#scribble-access-log .sal-who{font-size:11px;color:#9A9A9A;overflow-wrap:anywhere;}',
    '#scribble-access-log .sal-out{background:none;border:1px solid rgba(0,0,0,.12);',
      'border-radius:5px;padding:6px 11px;font-family:inherit;font-size:9.5px;',
      'letter-spacing:1.4px;text-transform:uppercase;color:#B05C5C;cursor:pointer;',
      'white-space:nowrap;}',
    '#scribble-access-log .sal-out:hover{background:rgba(176,92,92,.08);}'
].join('');
