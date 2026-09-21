// js/gatekeeper.js

// --- 1. CONFIGURATION: MAIN LIFEHUB (Firestore) ---
const firebaseConfigMain = {
  apiKey: "AIzaSyAOgtrNsZFu0LaKW7uzHc61kBCNcBc2XSE",
  authDomain: "fitness-centre-aabaa.firebaseapp.com",
  projectId: "fitness-centre-aabaa",
  storageBucket: "fitness-centre-aabaa.firebasestorage.app",
  messagingSenderId: "706584906698",
  appId: "1:706584906698:web:0469958c2564db64775d33",
  measurementId: "G-V0VYYB9GMP"
};

// --- 2. CONFIGURATION: PRESTIGE BANK (Realtime Database) ---
const firebaseConfigPrestige = {
  apiKey: "AIzaSyABhqON4h0GHjFbZaDT1ysSprmpdczyC6I",
  authDomain: "lifehub-cae1d.firebaseapp.com",
  databaseURL: "https://lifehub-cae1d-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "lifehub-cae1d",
  storageBucket: "lifehub-cae1d.firebasestorage.app",
  messagingSenderId: "471522181748",
  appId: "1:471522181748:web:6861392a45fbbbec8dc721",
  measurementId: "G-2R3WDZNXKG"
};

// --- 3. INITIALIZATION ---

// A. Initialize Main App (Fitness Centre - Firestore)
//
// A NAMED app, like the prestige system's "PrestigeApp" and the sleep and
// hydration trackers. The DEFAULT app belongs to
// JS/lifehub-navigation-core.js, which loads on nearly every page in LifeHub
// and initialises it for voice navigation.
//
// This file used to take the default via `if (!firebase.apps.length)`, and
// since gatekeeper.js loads FIRST on all nine Fitness Centre pages it always
// won. navigation-core then found a default app already present, adopted it,
// and called .database() on it — but firebaseConfigMain is a Firestore-only
// project with no databaseURL, so that threw before the listener could start.
// Voice navigation was dead across the whole Fitness Centre.
//
// The old form had a second fault: had navigation-core ever loaded first,
// `firebase.apps.length` would be non-zero, this block would skip entirely,
// and `firebase.firestore()` would have bound window.db to the WRONG
// project. Naming the app removes both failure modes.
let fitnessApp;
try {
    fitnessApp = firebase.app("FitnessVault");
    console.log("❖ Gatekeeper: Fitness App already detected.");
} catch (e) {
    fitnessApp = firebase.initializeApp(firebaseConfigMain, "FitnessVault");
    console.log("❖ Gatekeeper: Fresh Init for Fitness App.");
}

// 2. ALWAYS bind the Firestore to window.db — explicitly to OUR app, never
// to whatever happens to be the default.
window.db = firebase.firestore(fitnessApp);
console.log("✅ Gatekeeper: Fitness Vault (Firestore) Linked.");


// B. Initialize Prestige App (LifeHub - Realtime DB)
// 1. Check if the specific "LifeHubConnection" exists
let prestigeApp;
const existingApp = firebase.apps.find(a => a.name === "LifeHubConnection");

if (existingApp) {
    prestigeApp = existingApp;
    console.log("❖ Gatekeeper: Prestige App already detected.");
} else {
    prestigeApp = firebase.initializeApp(firebaseConfigPrestige, "LifeHubConnection");
    console.log("❖ Gatekeeper: Fresh Init for Prestige App.");
}

// 2. ALWAYS bind the Realtime DB to window.prestigeDB
window.prestigeDB = prestigeApp.database();
console.log("✅ Gatekeeper: Prestige Bank (Realtime DB) Linked.");