// ==========================================
// 🧭 LIFEHUB NAVIGATION CORE (DYNAMIC ROOT PATCH)
// ==========================================

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

        // 🗺️ BULLETPROOF PATHING (Dynamic Root Calculation)
        // No more guessing with "../../". We find exactly where the LifeHub folder is.
        const rootMarker = "/lifehub/";
        const rootIndex = currentHref.toLowerCase().indexOf(rootMarker);
        
        let finalDestination = data.url;

        if (rootIndex !== -1) {
            // Slices the URL perfectly up to ".../LifeHub/"
            const basePath = currentHref.substring(0, rootIndex + rootMarker.length);
            finalDestination = basePath + data.url;
        }

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