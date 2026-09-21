// --- LIFEHUB CORE: PRESTIGE SYSTEM ---
// The "Heart" of the banking system.
// Connects UI to Firebase Realtime Database.
// VERSION: 2.0 (Self-Auditing Ledger)

(function() {

// 0. DEPENDENCY
// The tier list and the what-counts-toward-rank rule live in
// JS/lifehub-prestige-ledger.js, which must load BEFORE this file.
// Said out loud rather than failing on an undefined a hundred lines
// down, because the symptom would be a card showing a blank rank.
if (!window.LIFEHUB_PRESTIGE) {
    console.error("[Prestige] JS/lifehub-prestige-ledger.js must load before this file.");
    return;
}

// 1. CONFIGURATION
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

// 2. INITIALIZATION
// A NAMED app, like the sleep tracker's "SleepApp" and hydration's
// "HydrationApp". The DEFAULT app belongs to lifehub-navigation-core.js,
// which is loaded on nearly every page in LifeHub and initialises it for
// voice navigation.
//
// This file used to take the default app too, via
// `if (!firebase.apps.length)`. Whichever script won the race owned it,
// and the loser silently used the other's. Naming it removes the race
// without touching navigation, which cannot be renamed — forty pages
// depend on it holding the default.
let app;
try { app = firebase.app("PrestigeApp"); }
catch (e) { app = firebase.initializeApp(firebaseConfig, "PrestigeApp"); }
const db = firebase.database(app);

// 3. LISTENERS

// A. Balance Listener (Your Spendable Cash)
const balanceRef = db.ref('prestige_system/balance');
balanceRef.on('value', (snapshot) => {
    const currentBalance = snapshot.val() || 0;
    updateDisplay('.balance-amount', currentBalance);
});

// B. Net Worth Listener (The "Smart" Audit)
const txLogRef = db.ref('prestige_system/transactions');

txLogRef.on('value', (snapshot) => {
    // The rules moved to JS/lifehub-prestige-ledger.js so Poppy, this
    // card and any future page all answer "what is my rank" the same
    // way. Same two rules as before — income always counts, a negative
    // only counts if it is a correction — with one addition: a row may
    // now say kind:"correction" outright instead of relying on the word
    // being in its description. Old rows keep working on the words.
    const calculatedLifetimePrestige =
        window.LIFEHUB_PRESTIGE.lifetimeFrom(snapshot.val());

    // 1. Update the Big Number
    updateDisplay('.networth-value', calculatedLifetimePrestige);
    
    // 2. Update the Rank Name
    updateTierLabel(calculatedLifetimePrestige);

    // 3. Highlight the Tier List
    highlightActiveTier(calculatedLifetimePrestige);

    // 4. How far the next tier is
    updateTierProgress(calculatedLifetimePrestige);
});


// 4. THE LOGIC ENGINE

// A. Update the Text on the Prestige Card
function updateTierLabel(netWorth) {
    const labelEl = document.querySelector('.club-label');
    if (!labelEl) return;

    labelEl.innerText = window.LIFEHUB_PRESTIGE.tierFor(netWorth).name;
}

// A2. Progress toward the next tier
// Only drawn on pages that have the markup for it — the net worth page
// does, the bank card does not, and neither should have to know about
// the other.
function updateTierProgress(netWorth) {
    const box = document.getElementById('tier-progress');
    if (!box) return;

    const t = window.LIFEHUB_PRESTIGE.tierFor(netWorth);

    // Nothing above Sovereign. A bar with no destination would sit at
    // 100% forever, which reads as a rank she is about to leave.
    if (!t.next) {
        box.style.display = 'none';
        return;
    }
    box.style.display = '';

    // Measured across the CURRENT band, not from zero — otherwise every
    // tier but the first would open almost full and creep imperceptibly.
    const span = t.nextAt - t.floor;
    const into = Math.max(0, netWorth - t.floor);
    const pct = span > 0 ? Math.min(100, (into / span) * 100) : 0;

    document.getElementById('tier-progress-fill').style.width = pct.toFixed(1) + '%';

    const toGo = Math.max(0, Math.ceil(t.toNext));
    document.getElementById('tier-progress-label').innerHTML =
        toGo.toLocaleString('en-US') + ' to <b>' + t.next + '</b>';
}

// B. Highlight the Tier List
function highlightActiveTier(netWorth) {
    const tiers = window.LIFEHUB_PRESTIGE.TIERS;
    const currentId = window.LIFEHUB_PRESTIGE.tierFor(netWorth).id;

    // Reset ALL tiers
    tiers.forEach(t => {
        const el = document.getElementById(t.id);
        if (el) el.classList.remove('active-tier');
    });

    // Highlight WINNER
    const activeEl = document.getElementById(currentId);
    if (activeEl) {
        activeEl.classList.add('active-tier');
    }
}


// 5. THE DEPOSIT FUNCTION
window.deposit = function(amount, description = "Manual Deposit", source = "ADMIN") {
    if (amount === 0) return; 

    // 1. Update Current Balance (Spendable)
    balanceRef.transaction((current) => {
        return (current || 0) + amount;
    });

    // 2. Log Transaction (This updates Net Worth automatically via the Listener above)
    const txRef = db.ref('prestige_system/transactions');
    txRef.push({
        amount: amount,
        description: description,
        source: source,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    });

    // 3. Feedback
    if(amount > 0) {
        console.log(`Prestige: +${amount} Points. Logged.`);
        alert(`Cha-ching! +${amount.toLocaleString()} Prestige Points.`);
    } else {
        console.log(`Prestige: ${amount} Points Deducted. Logged.`);
        alert(`Protocol Violation. ${amount.toLocaleString()} Prestige Points.`);
    }
}


// 6. HELPER FUNCTIONS
function updateDisplay(selector, amount) {
    const displayElement = document.querySelector(selector);
    
    if (displayElement) {
        const formatted = amount.toLocaleString('en-US', { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
        });
        
        displayElement.innerText = formatted;
        
        // Flash Effect
        displayElement.style.color = "#fff"; 
        displayElement.style.textShadow = "0 0 20px #fff";
        setTimeout(() => {
            displayElement.style.color = "";
            displayElement.style.textShadow = "";
        }, 300);
    }
}
})();