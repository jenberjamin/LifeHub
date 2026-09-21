/* ═══════════════════════════════════════════════════
   SCRIBBLE — DEVICE REGISTRY & VIEWER
   js/scribble-devices.js

   "Which devices can get into my Scribble?"

   ── WHAT THIS IS, HONESTLY ────────────────────────
   Firebase does not let a browser ask that question.
   The client SDK can see the session IT is holding and
   nothing else — there is no call that lists the other
   devices carrying a valid refresh token, and no way to
   revoke one from here. That needs the Admin SDK on a
   server, which Scribble does not have.

   So this keeps its own register instead: every device
   that opens Scribble while signed in writes one row
   about itself. That is not the same list as "sessions
   Firebase would accept", and the difference matters:

     • A device appears here only after it has OPENED
       Scribble at least once while online.
     • A row is a record of a visit, not a live key. It
       says this device WAS signed in, last seen then.
     • Signing out marks the row, so a device you have
       disconnected reads as disconnected rather than
       silently staying in the list.

   Which makes it exactly what it looks like: a register
   of what has been in, not a lock. Anything here you do
   not recognise is worth acting on — change the account
   password, which is the one thing that does invalidate
   every other device.

   ── ONE ID PER DEVICE ─────────────────────────────
   Reuses `lifehub.deviceId` from js/LifeHub-surface.js
   rather than minting a second one, so a device is the
   same device across the whole of LifeHub. A browser
   that cannot keep localStorage (private windows, some
   webviews) is not registered at all — a fresh id on
   every load would fill the list with rows for one
   machine and make it useless.
═══════════════════════════════════════════════════ */

import { db, nowFields, whenDate, save, merge } from './scribble-db.js';
import { collection, doc, getDoc, getDocs } from './vendor/firebase.js';
import { authReady, currentUser } from './scribble-session.js';

const DEVICES_COLL = 'scribble-devices';
const DEVICE_KEY   = 'lifehub.deviceId';    // shared with LifeHub-surface.js
const NAME_KEY     = 'lifehub.deviceName';
const SEEN_KEY     = 'scribble.deviceSeenAt';

/* A visit every few minutes is the same fact as a visit now.
   Re-registering on every page load would spend a read and a
   write to learn nothing. */
const TOUCH_EVERY_MS = 10 * 60 * 1000;

/* ══════════════════════════════════════════════════
   IDENTITY
══════════════════════════════════════════════════ */
/* Returns null when localStorage is unavailable — see the note
   above about why that means "do not register" rather than
   "invent an id". */
function deviceId() {
    try {
        let id = localStorage.getItem(DEVICE_KEY);
        if (!id) {
            id = 'dev_' + Math.random().toString(36).slice(2, 10);
            localStorage.setItem(DEVICE_KEY, id);
        }
        return id;
    } catch (e) {
        return null;
    }
}

function storedName() {
    try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; }
}

/* A full user-agent string is unreadable; this keeps the part
   that actually tells one of your devices from another. Same
   shape as the access log's, kept separate so neither module
   has to import the other. */
function shortAgent(ua) {
    if (!ua) return 'unknown device';
    const os =
        /Windows NT/.test(ua)       ? 'Windows' :
        /Android/.test(ua)          ? 'Android' :
        /iPhone|iPad|iPod/.test(ua) ? 'iOS'     :
        /Mac OS X/.test(ua)         ? 'macOS'   :
        /Linux/.test(ua)            ? 'Linux'   : 'unknown OS';
    const br =
        /Edg\//.test(ua)            ? 'Edge'    :
        /OPR\//.test(ua)            ? 'Opera'   :
        /Firefox\//.test(ua)        ? 'Firefox' :
        /Chrome\//.test(ua)         ? 'Chrome'  :
        /Safari\//.test(ua)         ? 'Safari'  : 'browser';
    return br + ' on ' + os;
}

function currentPage() {
    return location.pathname.split('/').pop() || 'Scribble.html';
}

/* ══════════════════════════════════════════════════
   REGISTERING THIS DEVICE
══════════════════════════════════════════════════ */
export async function touchDevice(force) {
    const id = deviceId();
    if (!id) return null;

    if (!force) {
        try {
            const last = parseInt(localStorage.getItem(SEEN_KEY) || '0', 10) || 0;
            if (Date.now() - last < TOUCH_EVERY_MS) return id;
        } catch (e) { /* no storage — write every time rather than never */ }
    }

    /* Only a signed-in device belongs in a list of devices with
       access. The gate being locked doesn't matter here: that's the
       screen, not the account. */
    await authReady;
    const user = currentUser();
    if (!user) return null;

    const ref = doc(db, DEVICES_COLL, id);

    /* Read first so "first seen" survives — this is a full write,
       not a merge, because scribble-db's save() is the offline-safe
       helper and a merge would need setDoc's options. One read per
       ten minutes is a price worth paying for a date that doesn't
       reset itself every visit. */
    let existing = null;
    try {
        const snap = await getDoc(ref);
        if (snap.exists()) existing = snap.data();
    } catch (e) {
        console.warn('[Scribble devices] could not read this device:', e.message);
    }

    const first = existing
        ? { firstSeen: existing.firstSeen || null, firstSeenLocalMs: existing.firstSeenLocalMs || Date.now() }
        : nowFields('firstSeen');

    await save(ref, {
        deviceId: id,
        label:    storedName() || (existing && existing.label) || '',
        agent:    String(navigator.userAgent || '').slice(0, 260),
        platform: String((navigator.userAgentData && navigator.userAgentData.platform) ||
                         navigator.platform || '').slice(0, 60),
        account:  user.email || null,
        uid:      user.uid   || null,
        lastPage: currentPage(),
        /* Cleared on every visit: signing back in on this device
           means it has access again, and the row should say so. */
        signedOutAt:        null,
        signedOutAtLocalMs: null,
        ...first,
        ...nowFields('lastSeen')
    });

    try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch (e) {}
    return id;
}

/*
 * Called by the sign-out flow in js/scribble-access-log.js, so a
 * device you disconnect stops reading as one with access. Written
 * BEFORE signOut() — after it, the rules would reject the write.
 */
export async function markSignedOut() {
    const id = deviceId();
    if (!id) return;
    try {
        await merge(doc(db, DEVICES_COLL, id), nowFields('signedOutAt'));
        localStorage.removeItem(SEEN_KEY);
    } catch (e) {
        console.warn('[Scribble devices] could not mark sign-out:', e.message);
    }
}

export async function listDevices() {
    try {
        const snap = await getDocs(collection(db, DEVICES_COLL));
        return snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (b.lastSeenLocalMs || 0) - (a.lastSeenLocalMs || 0));
    } catch (e) {
        console.warn('[Scribble devices] could not read the register:', e.message);
        return null;
    }
}

/* ══════════════════════════════════════════════════
   THE VIEWER
   Styles injected here, like the access log's, so this
   drops into any page that loads the module without
   touching a stylesheet.
══════════════════════════════════════════════════ */
let modal = null;

export async function openDeviceViewer() {
    if (modal) return;

    modal = document.createElement('div');
    modal.id = 'scribble-devices';
    modal.innerHTML =
        '<div class="sdv-backdrop"></div>' +
        '<div class="sdv-panel" role="dialog" aria-modal="true" aria-label="Devices">' +
          '<header class="sdv-head">' +
            '<div>' +
              '<h2>Devices</h2>' +
              '<p class="sdv-sub">Everything that has opened Scribble on this account</p>' +
            '</div>' +
            '<button class="sdv-x" id="sdv-x" aria-label="Close">✕</button>' +
          '</header>' +
          '<div class="sdv-body" id="sdv-body"><p class="sdv-empty">Loading…</p></div>' +
          '<footer class="sdv-foot">' +
            '<span class="sdv-note">A register of visits, not live sessions. ' +
            'To cut off a device you do not recognise, change the account password.</span>' +
          '</footer>' +
        '</div>';

    const css = document.createElement('style');
    css.id = 'scribble-devices-css';
    css.textContent = STYLES;
    document.head.appendChild(css);
    document.body.appendChild(modal);

    modal.querySelector('#sdv-x').addEventListener('click', closeDeviceViewer);
    modal.querySelector('.sdv-backdrop').addEventListener('click', closeDeviceViewer);
    document.addEventListener('keydown', onEsc);

    /* Register before reading, so the device you are looking from is
       in the list you are looking at. */
    await touchDevice(true);
    renderDevices(await listDevices());
}

function onEsc(e) { if (e.key === 'Escape') closeDeviceViewer(); }

export function closeDeviceViewer() {
    if (!modal) return;
    document.removeEventListener('keydown', onEsc);
    modal.remove();
    const css = document.getElementById('scribble-devices-css');
    if (css) css.remove();
    modal = null;
}

function renderDevices(rows) {
    const body = modal && modal.querySelector('#sdv-body');
    if (!body) return;

    if (rows === null) {
        body.innerHTML = '<p class="sdv-empty">Could not read the register. ' +
                         'If you are offline and have never opened this online, ' +
                         'there is nothing cached to show.</p>';
        return;
    }
    if (!rows.length) {
        body.innerHTML = '<p class="sdv-empty">No devices registered yet.<br>' +
                         'Open Scribble on another device and it will appear here.</p>';
        return;
    }

    const here = deviceId();

    body.innerHTML = rows.map(r => {
        const isHere  = r.id === here;
        const out     = !!(r.signedOutAtLocalMs || r.signedOutAt);
        const first   = whenDate(r, 'firstSeen');
        const last    = whenDate(r, 'lastSeen');
        const gone    = whenDate(r, 'signedOutAt');
        const name    = r.label || shortAgent(r.agent);

        const state = isHere ? '<span class="sdv-tag sdv-here">This device</span>'
                    : out    ? '<span class="sdv-tag sdv-out">Signed out</span>'
                             : '<span class="sdv-tag sdv-in">Signed in</span>';

        return '<div class="sdv-row' + (out && !isHere ? ' is-out' : '') + '">' +
                 '<span class="sdv-icon">' + (out && !isHere ? '🔓' : '🖥') + '</span>' +
                 '<div class="sdv-main">' +
                   '<div class="sdv-name">' + esc(name) + state + '</div>' +
                   '<div class="sdv-detail">' + esc(shortAgent(r.agent)) +
                     (r.platform ? ' · ' + esc(r.platform) : '') + '</div>' +
                   '<div class="sdv-meta">' +
                     (r.account ? esc(r.account) + ' · ' : '') +
                     'first seen ' + esc(first ? first.toLocaleDateString() : '—') +
                     (out && gone ? ' · signed out ' + esc(relative(gone)) : '') +
                   '</div>' +
                 '</div>' +
                 '<div class="sdv-when" title="' + esc(last ? last.toLocaleString() : '') + '">' +
                   esc(relative(last)) +
                 '</div>' +
               '</div>';
    }).join('');
}

function relative(d) {
    if (!d) return '—';
    const diff = Date.now() - d.getTime();
    const m  = Math.floor(diff / 60000);
    const h  = Math.floor(diff / 3600000);
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

/* ══════════════════════════════════════════════════
   BOOT
   Registering is fire-and-forget: a device that cannot
   write its row (offline, rules not published yet) must
   still get a working page.
══════════════════════════════════════════════════ */
touchDevice().catch(e => console.warn('[Scribble devices]', e && e.message));

window.SCRIBBLE_DEVICES = {
    touchDevice, markSignedOut, listDevices,
    openDeviceViewer, closeDeviceViewer, deviceId,
    /* Name this device so the list reads "Kitchen tablet" rather
       than "Chrome on Android". Takes effect on the next visit.
       From the console:  SCRIBBLE_DEVICES.nameThisDevice('Laptop') */
    nameThisDevice(name) {
        try { localStorage.setItem(NAME_KEY, String(name).slice(0, 60)); } catch (e) {}
        return touchDevice(true);
    }
};
/* Read by the header menu, which is a classic script. */
window.openScribbleDevices = openDeviceViewer;

const STYLES = [
    '#scribble-devices{position:fixed;inset:0;z-index:99999;display:flex;',
      'align-items:center;justify-content:center;',
      'font-family:"Roboto Condensed",system-ui,-apple-system,Segoe UI,sans-serif;}',
    '#scribble-devices .sdv-backdrop{position:absolute;inset:0;background:rgba(30,30,26,.42);}',
    '#scribble-devices .sdv-panel{position:relative;width:min(94vw,600px);',
      'max-height:82vh;display:flex;flex-direction:column;background:#FFFFFF;',
      'border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.11),0 20px 60px rgba(0,0,0,.18);',
      'overflow:hidden;animation:sdv-in .16s ease-out;}',
    '@keyframes sdv-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
    '#scribble-devices .sdv-head{display:flex;align-items:flex-start;justify-content:space-between;',
      'gap:12px;padding:18px 20px 14px;border-bottom:1px solid rgba(0,0,0,.06);}',
    '#scribble-devices h2{margin:0;font-size:15px;font-weight:600;color:#4A4A4A;letter-spacing:.4px;}',
    '#scribble-devices .sdv-sub{margin:3px 0 0;font-size:10.5px;color:#9A9A9A;letter-spacing:.3px;}',
    '#scribble-devices .sdv-x{background:none;border:none;font-size:15px;color:#9A9A9A;',
      'cursor:pointer;padding:2px 6px;border-radius:5px;line-height:1;}',
    '#scribble-devices .sdv-x:hover{background:rgba(0,0,0,.05);color:#4A4A4A;}',
    '#scribble-devices .sdv-body{overflow-y:auto;padding:6px 0;}',
    '#scribble-devices .sdv-empty{padding:34px 24px;text-align:center;font-size:12px;',
      'color:#9A9A9A;line-height:1.6;}',
    '#scribble-devices .sdv-row{display:flex;gap:12px;align-items:flex-start;',
      'padding:12px 20px;border-bottom:1px solid rgba(0,0,0,.04);}',
    '#scribble-devices .sdv-row:last-child{border-bottom:none;}',
    '#scribble-devices .sdv-row:hover{background:rgba(0,0,0,.025);}',
    '#scribble-devices .sdv-row.is-out{opacity:.62;}',
    '#scribble-devices .sdv-icon{width:18px;text-align:center;font-size:12px;padding-top:1px;}',
    '#scribble-devices .sdv-main{flex:1;min-width:0;}',
    '#scribble-devices .sdv-name{font-size:12.5px;color:#4A4A4A;font-weight:600;',
      'display:flex;align-items:center;gap:7px;flex-wrap:wrap;}',
    '#scribble-devices .sdv-detail{font-size:11px;color:#7A7A7A;margin-top:2px;',
      'overflow-wrap:anywhere;}',
    '#scribble-devices .sdv-meta{font-size:10px;color:#B0B0B0;margin-top:3px;letter-spacing:.2px;',
      'overflow-wrap:anywhere;}',
    '#scribble-devices .sdv-when{font-size:10.5px;color:#9A9A9A;white-space:nowrap;padding-top:1px;}',
    '#scribble-devices .sdv-tag{font-size:8.5px;letter-spacing:1.1px;text-transform:uppercase;',
      'padding:2px 6px;border-radius:20px;font-weight:600;}',
    '#scribble-devices .sdv-here{background:#5C5C52;color:#fff;}',
    '#scribble-devices .sdv-in{background:rgba(95,138,95,.14);color:#5F8A5F;}',
    '#scribble-devices .sdv-out{background:rgba(0,0,0,.05);color:#9A9A9A;}',
    '#scribble-devices .sdv-foot{padding:11px 20px;border-top:1px solid rgba(0,0,0,.06);',
      'background:#FAFAF8;}',
    '#scribble-devices .sdv-note{font-size:10px;color:#9A9A9A;line-height:1.5;}'
].join('');
