// ==========================================
// 🧭 LIFEHUB NAVIGATION CORE (DYNAMIC ROOT PATCH)
// ==========================================
// Every page loads THIS file from the root JS folder — there are no
// per-folder copies. Destination URLs from Alexa are always written
// relative to the project root, and LIFEHUB_ROOT below is what turns
// them into something the browser can actually follow.

// 0. WHERE IS THE PROJECT ROOT?
// This used to search the URL for the literal string "/lifehub/", which
// stopped matching the day the folder became "LifeHub 2.0" — every jump
// then resolved against the current page's folder instead of the root.
// The script's own src is the one thing that always points at /JS/, so
// the root is simply its parent. Rename the folder to anything you like
// and this keeps working.
const LIFEHUB_ROOT = (function () {
    const self = document.currentScript && document.currentScript.src;
    if (self) {
        // ".../LifeHub 2.0/JS/lifehub-navigation-core.js" → ".../LifeHub 2.0/"
        const cut = self.search(/\/js\/[^/]*$/i);
        if (cut !== -1) return self.slice(0, cut + 1);
    }
    // Fallback: current folder. Only reached if the script is inlined or
    // loaded async, in which case root-relative jumps may still be wrong.
    const href = window.location.href;
    return href.slice(0, href.lastIndexOf('/') + 1);
})();

// 1. CONFIGURATION (Jen's Safe Keys)
const firebaseConfig = {
  apiKey: "AIzaSyABhqON4h0GHjFbZaDT1ysSprmpdczyC6I",
  authDomain: "lifehub-cae1d.firebaseapp.com",
  databaseURL: "https://lifehub-cae1d-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "lifehub-cae1d",
  storageBucket: "lifehub-cae1d.firebasestorage.app",
  messagingSenderId: "471522181748",
  appId: "1:471522181748:web:6861392a45fbbbec8dc721",
  measurementId: "G-2R3WDZNXKG"
};

// 2. INITIALIZE FIREBASE SAFELY
let defaultApp;
if (typeof firebase !== 'undefined') {
    try {
        defaultApp = firebase.app(); 
    } catch (e) {
        defaultApp = firebase.initializeApp(firebaseConfig);
    }
} else {
    console.error("🔥 Firebase SDK missing! Cannot start Navigation.");
}

// 2½. WHICH SCREEN IS THIS?
// Added 2026-09-21 so Poppy can drive ONE screen ("put Sleep on the TV")
// instead of every LifeHub page on every device jumping at once.
//
// The id is the same localStorage key LifeHub-surface.js and
// scribble-devices.js use — one device is one device across LifeHub.
// It's per browser, so every page on the TV shares it.
//
// The name is what Poppy says and what Jen says back. The TV frame
// already knows when it's on the TV, so the TV names itself. Anything
// else can be named once from the address bar — no console needed,
// which matters on a TV that hasn't got one:
//     LifeHub-HomeScreen.html?screen=Phone
//     LifeHub-HomeScreen.html?screen=auto     (forget the name)
const LIFEHUB_SCREEN = (function () {
    const ID_KEY = 'lifehub.deviceId';
    const NAME_KEY = 'lifehub.deviceName';
    const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    const put = (k, v) => {
        try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {}
    };

    let id = get(ID_KEY);
    if (!id) {
        id = 'dev_' + Math.random().toString(36).slice(2, 10);
        put(ID_KEY, id);
    }

    const param = (location.search.match(/[?&]screen=([^&]*)/) || [])[1];
    if (param) {
        const n = decodeURIComponent(param.replace(/\+/g, ' ')).trim();
        put(NAME_KEY, n.toLowerCase() === 'auto' ? null : n);
    }

    // The TV frame's verdict first — it's what already fits the pages to
    // BrowseHere. Then the same signals it uses, in case the frame was
    // switched off with ?tv=0: a TV word in the user agent, or Android
    // with no touchscreen (tablets and phones always report touch).
    const ua = navigator.userAgent;
    const isTV = document.documentElement.classList.contains('lh-tv') ||
        /\bTV\b|GoogleTV|Android TV|SMART-TV|BRAVIA|AFT\w/i.test(ua) ||
        (/Android/i.test(ua) && !navigator.maxTouchPoints);

    function guess() {
        if (isTV) return 'TV';
        if (/Android|iPhone|iPad|iPod/i.test(ua) || navigator.maxTouchPoints > 1) {
            return Math.min(screen.width, screen.height) < 600 ? 'phone' : 'tablet';
        }
        return 'computer';
    }

    // "this device" is the surface's default name, not a real one.
    const stored = get(NAME_KEY);
    const name = (stored && stored !== 'this device') ? stored : guess();

    return { id: id, name: name, tv: isTV };
})();
window.LIFEHUB_SCREEN = LIFEHUB_SCREEN;

// 3. START LISTENER
if (typeof firebase !== 'undefined') {
    const navDb = defaultApp.database();
    const navRef = navDb.ref('alexa_updates');

    console.log("🧭 Navigation: Online & Standing By as \"" + LIFEHUB_SCREEN.name + "\"");

    // Server clock minus ours. Poppy stamps commands with the SERVER's
    // time, and the TV's own clock can't be trusted to agree with it.
    let serverOffset = 0;
    navDb.ref('.info/serverTimeOffset').on('value', s => { serverOffset = s.val() || 0; });

    // 📡 PRESENCE — "the TV is on and showing the Home Screen"
    // One row per device. onDisconnect is carried out by the SERVER when
    // the connection drops, so a TV switched off at the wall still goes
    // offline — the page never has to get the chance to say goodbye.
    //
    // Pages that don't load this file (Scribble, See You Latte) show as
    // offline. That's honest: a command sent there would never be heard.
    const here = window.location.href;
    const screenRef = navDb.ref('lifehub_screens/' + LIFEHUB_SCREEN.id);
    navDb.ref('.info/connected').on('value', s => {
        if (s.val() !== true) return;
        screenRef.onDisconnect()
            .update({ online: false, at: firebase.database.ServerValue.TIMESTAMP })
            .then(() => screenRef.set({
                name: LIFEHUB_SCREEN.name,
                tv: LIFEHUB_SCREEN.tv,
                page: decodeURIComponent(here.substring(here.lastIndexOf('/') + 1).split('?')[0].split('#')[0]),
                title: document.title || '',
                online: true,
                at: firebase.database.ServerValue.TIMESTAMP
            }))
            .catch(e => console.warn("🧭 Presence not written:", e.message));
    });

    navRef.on('value', (snapshot) => {
        const data = snapshot.val();

        // Standby if database is empty
        if (!data || data.action !== 'navigate' || !data.url) return;

        // 🎯 ADDRESSED TO SOMEONE ELSE?
        // A command with a device is for that screen only. Alexa's commands
        // carry no device and still go to everyone, exactly as before.
        if (data.device && data.device !== LIFEHUB_SCREEN.id) return;

        // ⏳ TOO OLD TO ACT ON
        // Sent to a screen that was off — it would otherwise fire the next
        // time the TV came on, hours later, which looks like a bug.
        // Only Poppy stamps `at`, so Alexa's commands never trip this.
        if (typeof data.at === 'number' && (Date.now() + serverOffset) - data.at > 60000) {
            console.log("⏳ Ignoring a stale jump from " + Math.round(((Date.now() + serverOffset) - data.at) / 1000) + "s ago.");
            navRef.set(null);
            return;
        }

        // Clean up file names to ensure perfect matching
        const targetFile = data.url.split('/').pop().split('?')[0].split('#')[0];
        const currentHref = window.location.href;
        const currentFile = decodeURIComponent(currentHref.substring(currentHref.lastIndexOf('/') + 1).split('?')[0].split('#')[0]);

        // 🛑 GHOST COMMAND CLEANER
        // If we arrive and the database matches our location, scrub it and stop.
        if (currentFile === targetFile) {
            console.log("✨ Arrived at destination (" + targetFile + "). Wiping command.");
            navRef.set(null); 
            return; 
        }

        console.log("🚀 Jumping to: " + targetFile);
        
        // 🔓 VIP Access Bypass
        if (data.url.indexOf("PassHub") !== -1) {
            sessionStorage.setItem('PH_ACCESS_TOKEN', 'authorized_user_jen');
        }

        // 🗺️ BULLETPROOF PATHING (resolved against the real project root)
        // Spaces and & in folder names have to survive the trip, so let the
        // URL parser do it rather than gluing strings together.
        const finalDestination = new URL(data.url, LIFEHUB_ROOT).href;

        // ⚡ THE JUMP ENGINE (With 300ms Failsafe)
        let hasJumped = false;
        const executeJump = () => {
            if (!hasJumped) {
                hasJumped = true;
                window.location.href = finalDestination;
            }
        };

        // Attempt to wipe the DB before leaving to protect the Back button.
        // If it takes longer than 300ms, we force the jump anyway so the screen NEVER freezes.
        navRef.set(null).then(executeJump).catch(executeJump);
        setTimeout(executeJump, 300);
    });

    // 🛡️ BROWSER BACK-BUTTON DEFENSE
    // If you physically press "Back", the browser cache can zombie the listener. 
    // This wakes navigation back up automatically.
    window.addEventListener("pageshow", function(event) {
        if (event.persisted) {
            console.log("🔄 Cache detected. Refreshing local state.");
            window.location.reload();
        }
    });
}

// ==========================================
// 📱 4. THE PHONE REMOTE
// ==========================================
// Added 2026-09-21. LifeHub-remote.html on Jen's phone writes one press
// at a time to lifehub_remote/<this screen's id>; this turns it into
// something the page understands. Only the screen it's addressed to
// hears it, the same way Poppy's jumps work above.
//
// A press is { key, n, at }:
//   up / down / left / right   move the highlight to the nearest button
//                              that way; nothing there → scroll instead
//   ok                         click the highlighted thing
//   back                       browser back
//   escape                     "Esc" — closes most panels and pop-ups
//   home                       straight to the Home Screen
//   lifehub                    straight to the LifeHub dashboard
//   pageup / pagedown          scroll a screenful
//   reload                     reload the page
//   text (+ text)              type into the highlighted box
//   enter                      Enter in that box (sends a search, a chat)
//
// Every press is offered to the page first as a pretend key press. If
// the page has its own arrow keys and says "mine" (preventDefault), the
// remote stays out of the way.
(function () {
    if (typeof firebase === 'undefined' || !defaultApp) return;

    const remoteDb = defaultApp.database();
    const remoteRef = remoteDb.ref('lifehub_remote/' + LIFEHUB_SCREEN.id);

    let offset = 0;
    remoteDb.ref('.info/serverTimeOffset').on('value', s => { offset = s.val() || 0; });

    // The highlight. Programmatic focus doesn't always draw a ring, and
    // plenty of LifeHub buttons are divs with onclick that can't take
    // focus at all, so the remote keeps its own "current" and draws its
    // own ring.
    const RING = 'lh-remote-focus';
    let current = null;
    function addRingStyle() {
        if (document.getElementById('lh-remote-style')) return;
        const st = document.createElement('style');
        st.id = 'lh-remote-style';
        st.textContent = '.' + RING + '{outline:4px solid #7cc4ff !important;outline-offset:3px !important;' +
            'box-shadow:0 0 0 8px rgba(124,196,255,.35) !important;}';
        (document.head || document.documentElement).appendChild(st);
    }

    const PICK = 'a[href],button,input:not([type=hidden]),select,textarea,summary,' +
        '[tabindex]:not([tabindex="-1"]),[onclick],[role=button],[role=link],[role=tab],' +
        '[role=menuitem],[role=option],[contenteditable=""],[contenteditable=true]';

    function usable(el) {
        if (el.disabled || el.closest('[inert],[aria-hidden="true"]')) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) return false;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.pointerEvents === 'none' || +cs.opacity === 0) return false;
        // On screen: it must be the thing actually under its own centre,
        // so buttons hidden behind an open panel can't be picked.
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        if (cx >= 0 && cy >= 0 && cx < innerWidth && cy < innerHeight) {
            const hit = document.elementFromPoint(cx, cy);
            return !!hit && (hit === el || el.contains(hit) || hit.contains(el));
        }
        return true;
    }

    function candidates() {
        const all = Array.prototype.filter.call(document.querySelectorAll(PICK), usable);
        // A button inside another clickable thing: keep the outer one only.
        return all.filter(el => !all.some(o => o !== el && o.contains(el)));
    }

    function highlight(el) {
        addRingStyle();
        if (current) current.classList.remove(RING);
        current = el;
        el.classList.add(RING);
        try { el.focus({ preventScroll: true }); } catch (e) {}
        try { el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); }
        catch (e) { el.scrollIntoView(false); }
    }

    function stillThere(el) {
        return el && document.contains(el) && usable(el);
    }

    function centre(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

    function move(dir) {
        const list = candidates();
        if (!list.length) return scroll(dir);
        if (!stillThere(current)) {
            const a = document.activeElement;
            current = (a && a !== document.body && list.indexOf(a) !== -1) ? a : null;
        }
        // Nothing highlighted yet: the first press just shows where you are.
        if (!current) {
            const onScreen = list.filter(el => {
                const r = el.getBoundingClientRect();
                return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
            });
            const pool = onScreen.length ? onScreen : list;
            pool.sort((a, b) => {
                const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
                return (ra.top + ra.left / 4) - (rb.top + rb.left / 4);
            });
            return highlight(pool[0]);
        }

        const from = current.getBoundingClientRect();
        const c = centre(from);
        let best = null, bestScore = Infinity;
        list.forEach(el => {
            if (el === current) return;
            const r = el.getBoundingClientRect();
            const p = centre(r);
            let along, across;
            if (dir === 'right')     { along = r.left - from.right;  across = p.y - c.y; if (p.x <= c.x) return; }
            else if (dir === 'left') { along = from.left - r.right;  across = p.y - c.y; if (p.x >= c.x) return; }
            else if (dir === 'down') { along = r.top - from.bottom;  across = p.x - c.x; if (p.y <= c.y) return; }
            else                     { along = from.top - r.bottom;  across = p.x - c.x; if (p.y >= c.y) return; }
            const score = Math.max(along, 0) + Math.abs(across) * 2;
            if (score < bestScore) { bestScore = score; best = el; }
        });
        if (best) highlight(best);
        else scroll(dir);
    }

    // The innermost thing that can scroll that way, starting from the
    // highlight — a long list inside a panel, before the page itself.
    function scroller(vertical) {
        let el = current;
        while (el && el !== document.body && el !== document.documentElement) {
            const cs = getComputedStyle(el);
            const ov = vertical ? cs.overflowY : cs.overflowX;
            const room = vertical ? el.scrollHeight > el.clientHeight + 2 : el.scrollWidth > el.clientWidth + 2;
            if (room && /auto|scroll/.test(ov)) return el;
            el = el.parentElement;
        }
        return document.scrollingElement || document.documentElement;
    }

    function scroll(dir, amount) {
        const vertical = dir === 'up' || dir === 'down';
        const el = scroller(vertical);
        const size = vertical ? (el.clientHeight || innerHeight) : (el.clientWidth || innerWidth);
        const d = (dir === 'up' || dir === 'left' ? -1 : 1) * size * (amount || 0.4);
        el.scrollBy({ top: vertical ? d : 0, left: vertical ? 0 : d, behavior: 'smooth' });
    }

    // Offer a pretend key press to the page. true = the page took it.
    function offer(key) {
        const target = (stillThere(current) && current) || document.activeElement || document.body;
        const ev = new KeyboardEvent('keydown', { key: key, code: key, bubbles: true, cancelable: true });
        target.dispatchEvent(ev);
        target.dispatchEvent(new KeyboardEvent('keyup', { key: key, code: key, bubbles: true }));
        return ev.defaultPrevented;
    }

    function typing(el) {
        return el && (el.isContentEditable || el.tagName === 'TEXTAREA' ||
            (el.tagName === 'INPUT' && !/^(button|submit|reset|checkbox|radio|range|color|file|image)$/i.test(el.type)));
    }

    function typeText(text) {
        const el = typing(current) ? current : (typing(document.activeElement) ? document.activeElement : null);
        if (!el) return;
        el.focus();
        if (el.isContentEditable) {
            el.textContent = text;
        } else {
            // The native setter, so frameworks watching .value notice.
            const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, text);
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const ARROWS = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

    function press(cmd) {
        const key = cmd.key;
        if (ARROWS[key]) {
            if (!offer(ARROWS[key])) move(key);
        } else if (key === 'ok') {
            if (offer('Enter')) return;
            if (!stillThere(current)) return move('down');
            if (typing(current)) current.focus();
            else current.click();
        } else if (key === 'enter') {
            const el = typing(current) ? current : document.activeElement;
            if (offer('Enter')) return;
            if (el && el.form && el.form.requestSubmit) el.form.requestSubmit();
        } else if (key === 'escape') {
            offer('Escape');
        } else if (key === 'back') {
            history.back();
        } else if (key === 'home') {
            window.location.href = new URL('LifeHub-HomeScreen.html', LIFEHUB_ROOT).href;
        } else if (key === 'lifehub') {
            window.location.href = new URL('LifeHub.html', LIFEHUB_ROOT).href;
        } else if (key === 'pageup' || key === 'pagedown') {
            scroll(key === 'pageup' ? 'up' : 'down', 0.85);
        } else if (key === 'reload') {
            window.location.reload();
        } else if (key === 'text') {
            typeText(String(cmd.text || ''));
        }
    }

    // The first read is whatever was pressed last — probably the OK that
    // opened this very page. Acting on it would press it again here.
    let first = true, lastN = null;
    remoteRef.on('value', snap => {
        const cmd = snap.val();
        if (first) { first = false; lastN = cmd && cmd.n; return; }
        if (!cmd || !cmd.key || cmd.n === lastN) return;
        lastN = cmd.n;
        // A press from more than 10 seconds ago was meant for a screen
        // that was asleep. Don't replay it.
        if (typeof cmd.at === 'number' && (Date.now() + offset) - cmd.at > 10000) return;
        try { press(cmd); } catch (e) { console.warn('📱 Remote press failed:', e); }
    });

    console.log('📱 Remote: listening as "' + LIFEHUB_SCREEN.name + '"');
})();
