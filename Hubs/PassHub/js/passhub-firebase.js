/* ═══════════════════════════════════════════════════
   PASSHUB — SHARED FIREBASE
   passhub-firebase.js

   This config used to be pasted into seven places: once
   in PassHub-core.js and once inline in each of the six
   vault pages. Rotating a key or moving the database
   meant seven edits, and missing one would break a page
   silently.

   The config below is BYTE-IDENTICAL to what every page
   was already using — same project, same databaseURL —
   so every existing node is reached exactly as before.
   Nothing is read, written or migrated by this file.

   Load it AFTER the two firebase-*-compat scripts and
   BEFORE the page's own script:

     <script src=".../firebase-app-compat.js"></script>
     <script src=".../firebase-database-compat.js"></script>
     <script src="js/passhub-firebase.js"></script>
     <script> ...page code, uses PH_DB... </script>
═══════════════════════════════════════════════════ */

(function () {
    var firebaseConfig = {
        apiKey:            "AIzaSyD4AwI1GwDvtx8y6yx6We-oSzV92GGCEvE",
        authDomain:        "access-vault-a3d09.firebaseapp.com",
        databaseURL:       "https://access-vault-a3d09-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId:         "access-vault-a3d09",
        storageBucket:     "access-vault-a3d09.firebasestorage.app",
        messagingSenderId: "43855013406",
        appId:             "1:43855013406:web:6a954853b8c14ec785b00f",
        measurementId:     "G-Q925D3PS6V"
    };

    if (typeof firebase === 'undefined') {
        console.error('[PassHub] Firebase SDK not loaded — check script order.');
        return;
    }

    /* initializeApp throws if called twice. Guarding here means a page
       can include this file more than once without breaking. */
    if (!firebase.apps || !firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }

    window.PH_DB = firebase.database();
})();
