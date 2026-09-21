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