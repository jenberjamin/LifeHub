// --- LIFEHUB CORE: PRESTIGE SYSTEM ---
// The "Heart" of the banking system.
// Connects UI to Firebase Realtime Database.
// VERSION: 2.0 (Self-Auditing Ledger)

(function() {
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
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

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
    const data = snapshot.val();
    let calculatedLifetimePrestige = 0;

    if (data) {
        Object.values(data).forEach(tx => {
            const amount = Number(tx.amount) || 0;
            const desc = (tx.description || "").toLowerCase();

            // RULE 1: All Income counts towards Net Worth
            if (amount > 0) {
                calculatedLifetimePrestige += amount;
            }
            
            // RULE 2: Handle Refunds vs. Spending
            // If it's negative, only subtract if it is explicitly a CORRECTION.
            // (We don't want normal spending to lower your Prestige Rank)
            else if (amount < 0) {
                if (desc.includes('refund') || desc.includes('undo') || desc.includes('correction') || desc.includes('void')) {
                    calculatedLifetimePrestige += amount; // Subtracts the refund
                }
            }
        });
    }

    // 1. Update the Big Number
    updateDisplay('.networth-value', calculatedLifetimePrestige);
    
    // 2. Update the Rank Name
    updateTierLabel(calculatedLifetimePrestige);

    // 3. Highlight the Tier List
    highlightActiveTier(calculatedLifetimePrestige);
});


// 4. THE LOGIC ENGINE

// A. Update the Text on the Prestige Card
function updateTierLabel(netWorth) {
    const labelEl = document.querySelector('.club-label');
    if (!labelEl) return; 

    let tierName = "The Foundation Class";
    if (netWorth >= 100000000) tierName = "The Sovereign Class";
    else if (netWorth >= 10000000) tierName = "The Tycoon's Circle";
    else if (netWorth >= 1000000) tierName = "The Executive Class";
    else if (netWorth >= 500000) tierName = "The Elite Class";
    else if (netWorth >= 100000) tierName = "The Sterling Class";

    labelEl.innerText = tierName;
}

// B. Highlight the Tier List
function highlightActiveTier(netWorth) {
    const tiers = [
        { id: 'tier-sovereign', threshold: 100000000 },
        { id: 'tier-tycoon',    threshold: 10000000 },
        { id: 'tier-executive', threshold: 1000000 },
        { id: 'tier-elite',     threshold: 500000 },
        { id: 'tier-sterling',  threshold: 100000 },
        { id: 'tier-foundation', threshold: 0 }
    ];

    const currentTier = tiers.find(t => netWorth >= t.threshold);
    if (!currentTier) return;

    // Reset ALL tiers
    tiers.forEach(t => {
        const el = document.getElementById(t.id);
        if (el) el.classList.remove('active-tier');
    });

    // Highlight WINNER
    const activeEl = document.getElementById(currentTier.id);
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