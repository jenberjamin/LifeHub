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

// 3. START LISTENER
if (typeof firebase !== 'undefined') {
    const navDb = defaultApp.database();
    const navRef = navDb.ref('alexa_updates');

    console.log("🧭 Navigation: Online & Standing By");

    navRef.on('value', (snapshot) => {
        const data = snapshot.val();
        
        // Standby if database is empty
        if (!data || data.action !== 'navigate' || !data.url) return;

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