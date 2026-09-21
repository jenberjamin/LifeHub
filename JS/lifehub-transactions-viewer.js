// --- LIFEHUB TRANSACTION VIEWER ---
// Reads from 'prestige_system/transactions' and renders the ledger.
// VERSION 4.0: Design Restoration + Logic Upgrade

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
// The same NAMED app lifehub-core-prestige-system.js uses. Reusing the
// name rather than making a second one matters: both files can appear on
// the same page, and two apps against one database would open two socket
// connections to read the same ledger.
//
// The DEFAULT app is lifehub-navigation-core.js's, which is loaded on
// nearly every page. This file used to claim it with
// `if (!firebase.apps.length)` and race navigation for it.
let app;
try { app = firebase.app("PrestigeApp"); }
catch (e) { app = firebase.initializeApp(firebaseConfig, "PrestigeApp"); }
const db = firebase.database(app);

// STATE MANAGEMENT
let allTransactions = [];
let currentView = 'DETAILED'; // 'DETAILED' or 'SUMMARY'

// 3. LISTEN FOR TRANSACTIONS
const txRef = db.ref('prestige_system/transactions');

txRef.on('value', (snapshot) => {
    const listContainer = document.getElementById('transaction-list');
    listContainer.innerHTML = ''; // Clear

    const data = snapshot.val();
    if (!data) {
        listContainer.innerHTML = '<div style="padding:20px; text-align:center; color:#666;">No transactions found.</div>';
        return;
    }

    // Convert & Sort (Newest First)
    allTransactions = Object.values(data);
    allTransactions.sort((a, b) => b.timestamp - a.timestamp);

    // Initial Render
    renderInterface(allTransactions);
});

// 4. THE INTERFACE CONTROLLER
function renderInterface(txList) {
    const listContainer = document.getElementById('transaction-list');
    const totalDisplay = document.getElementById('daily-total');
    
    listContainer.innerHTML = ''; // Clear current list

    // Calculate Selection Total (For the Header Display)
    let selectionTotal = 0;
    txList.forEach(tx => selectionTotal += (Number(tx.amount) || 0));
    
    if (totalDisplay) {
        totalDisplay.innerText = selectionTotal.toLocaleString('en-US', { minimumFractionDigits: 2 });
        totalDisplay.style.color = selectionTotal >= 0 ? "#fff" : "#d9534f";
    }

    if (txList.length === 0) {
        listContainer.innerHTML = '<div style="padding:20px; text-align:center; color:#666;">No records found.</div>';
        return;
    }

    // Render based on View Mode
    if (currentView === 'DETAILED') {
        renderDetailedList(listContainer, txList);
    } else {
        renderSummaryList(listContainer, txList);
    }
}

// 5A. RENDER: DETAILED (Restored to YOUR Design)
function renderDetailedList(container, txList) {
    txList.forEach(tx => {
        const row = createTxRow(tx);
        container.appendChild(row);
    });
}

// --- WHAT COLOUR IS A ROW ---
// Three things a negative row can be, and they are not the same event:
//
//   spending     red    money out. Rank untouched.
//   penalty      red    a fine. Reads the same as spending on purpose —
//                       both are points leaving — but it DOES lower rank.
//   correction   amber  a number being taken back because it was wrong.
//
// Corrections get their own colour because they are the only rows that
// say the ledger itself was mistaken, and that is what you are looking
// for when a total looks off. Amber rather than another gold: #D4AF37 is
// the income colour and a near-gold would be indistinguishable beside it.
const COLOR_INCOME     = '#D4AF37';
const COLOR_OUT        = '#d9534f';
const COLOR_CORRECTION = '#FF9F1C';

function amountColor(tx) {
    if (Number(tx.amount) >= 0) {
        // An upward correction is still a correction — it is the ledger
        // being fixed, not something she earned.
        const P = window.LIFEHUB_PRESTIGE;
        return (P && P.isCorrection(tx)) ? COLOR_CORRECTION : COLOR_INCOME;
    }
    const P = window.LIFEHUB_PRESTIGE;
    return (P && P.isCorrection(tx)) ? COLOR_CORRECTION : COLOR_OUT;
}

// Hover text, so the colour is not the only thing carrying the meaning.
function rowTitle(tx) {
    const P = window.LIFEHUB_PRESTIGE;
    if (!P) return '';
    if (P.isCorrection(tx)) return 'Correction — this adjusts your rank as well as your balance';
    if (P.isPenalty(tx))    return 'Penalty — this lowers your rank as well as your balance';
    if (Number(tx.amount) < 0) return 'Spending — your rank is unaffected';
    return 'Earned';
}

function createTxRow(tx) {
    const row = document.createElement('div');
    row.className = 't-row'; // YOUR original class

    // Format Date: "DEC 28 // 08:00"
    const dateObj = new Date(tx.timestamp);
    const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
    const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    const finalDate = `${dateStr} - ${timeStr}`;

    // Format Amount
    const isPositive = tx.amount >= 0;
    const sign = isPositive ? "+" : "";

    row.title = rowTitle(tx);

    // RESTORED: Exactly mirroring your original HTML structure
    row.innerHTML = `
        <div class="t-date">${finalDate}</div>
        <div class="t-desc">${tx.description}</div>
        <div class="t-source">${tx.source}</div>
        <div class="t-amount" style="color: ${amountColor(tx)}">
            ${sign} ${Number(tx.amount).toFixed(2)}
        </div>
    `;

    return row;
}

// 5B. RENDER: SUMMARY (Adapted to use YOUR classes)
function renderSummaryList(container, txList) {
    // 1. Group Data
    const dailyMap = {};
    txList.forEach(tx => {
        const d = new Date(tx.timestamp);
        const dateKey = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        
        if (!dailyMap[dateKey]) dailyMap[dateKey] = { total: 0, count: 0, dateObj: d };
        dailyMap[dateKey].total += (Number(tx.amount) || 0);
        dailyMap[dateKey].count += 1;
    });

    const summaryArray = Object.entries(dailyMap).map(([key, data]) => ({ dateLabel: key, ...data }));
    summaryArray.sort((a, b) => b.dateObj - a.dateObj);

    // 2. Render using YOUR classes
    summaryArray.forEach(day => {
        const row = document.createElement('div');
        row.className = 't-row'; // Re-use the row container for consistent spacing
        
        const isPositive = day.total >= 0;
        const sign = isPositive ? "+" : "";

        // We Map: 
        // Date -> t-date
        // Info -> t-desc
        // Total -> t-amount
        // Source -> Empty (to keep alignment)
        
        row.innerHTML = `
            <div class="t-date" style="color: #E0D5C1;">${day.dateLabel.toUpperCase()}</div>
            <div class="t-desc" style="font-style: italic; color: #888;">Daily Summary (${day.count} items)</div>
            <div class="t-source"></div> 
            <div class="t-amount" style="color: ${isPositive ? '#D4AF37' : '#d9534f'}">
                ${sign} ${day.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
        `;
        
        container.appendChild(row);
    });
}

// 6. CONTROLS
const dateInput = document.getElementById('date-filter');
const clearBtn = document.getElementById('clear-filter');
const viewBtn = document.getElementById('view-mode-btn');
const viewText = document.getElementById('view-mode-text');

if (dateInput) {
    dateInput.addEventListener('change', (e) => {
        const selectedDate = e.target.value; 
        if (!selectedDate) return;
        
        // Filter Logic
        const filtered = allTransactions.filter(tx => {
            const d = new Date(tx.timestamp);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}` === selectedDate;
        });
        renderInterface(filtered);
    });
}

if (clearBtn) {
    clearBtn.addEventListener('click', () => {
        if (dateInput) dateInput.value = '';
        renderInterface(allTransactions);
    });
}

if (viewBtn) {
    viewBtn.addEventListener('click', () => {
        if (currentView === 'DETAILED') {
            currentView = 'SUMMARY';
            if(viewText) viewText.innerText = "Show Detailed List"; 
            viewBtn.classList.add('active'); // You can style .active in CSS if you want
        } else {
            currentView = 'DETAILED';
            if(viewText) viewText.innerText = "Show Daily Summary";
            viewBtn.classList.remove('active');
        }
        
        // Re-render current filter
        const currentDate = dateInput ? dateInput.value : '';
        if (currentDate) dateInput.dispatchEvent(new Event('change'));
        else renderInterface(allTransactions);
    });
}
})();