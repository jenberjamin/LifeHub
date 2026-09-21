// js/food-history.js - COMPLETE REWRITE

// Shared with the tracker and the statistics page — see
// JS/lifehub-food-rules.js, which this page loads first.
if (!window.LIFEHUB_FOOD) {
    console.error("🍽️ JS/lifehub-food-rules.js must load before food-history.js.");
}
const DAILY_GOALS = window.LIFEHUB_FOOD.DAILY_GOALS;

// Renamed from firebaseConfig. lifehub-navigation-core.js declares a
// top-level `const firebaseConfig` too, and both are classic scripts
// sharing one global scope — so whichever loaded second died with
// "Identifier 'firebaseConfig' has already been declared". The nav core
// loads after this file on every FoodHub page, so voice navigation has
// never worked here.
const foodFirebaseConfig = {
    apiKey: "AIzaSyABhqON4h0GHjFbZaDT1ysSprmpdczyC6I",
    authDomain: "lifehub-cae1d.firebaseapp.com",
    databaseURL: "https://lifehub-cae1d-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "lifehub-cae1d",
    storageBucket: "lifehub-cae1d.firebasestorage.app",
    messagingSenderId: "471522181748",
    appId: "1:471522181748:web:6861392a45fbbbec8dc721",
    measurementId: "G-2R3WDZNXKG"
};

if (!firebase.apps.length) firebase.initializeApp(foodFirebaseConfig);
const database = firebase.database();

// STATE - Use object to avoid mutation issues
let viewState = {
    year: new Date().getFullYear(),
    month: new Date().getMonth()
};

let allLogs = {};

// INITIALIZATION
document.addEventListener('DOMContentLoaded', () => {
    console.log("🍽️ Food History Loaded");
    setupRealtimeListener();
    updateDisplay();
});

// REAL-TIME LISTENER - This makes it instant!
function setupRealtimeListener() {
    database.ref('dailyLogs').on('value', snapshot => {
        console.log("📡 Firebase Update Received");
        allLogs = snapshot.val() || {};
        renderMonth();
    });
}

// MONTH NAVIGATION - FIXED!
window.changeMonth = function(direction) {
    console.log(`📅 Changing month: ${direction > 0 ? 'Next' : 'Previous'}`);
    
    // Calculate new month/year
    let newMonth = viewState.month + direction;
    let newYear = viewState.year;
    
    if (newMonth > 11) {
        newMonth = 0;
        newYear++;
    } else if (newMonth < 0) {
        newMonth = 11;
        newYear--;
    }
    
    viewState.month = newMonth;
    viewState.year = newYear;
    
    updateDisplay();
    renderMonth();
}

function updateDisplay() {
    const monthNames = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", 
                        "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
    const displayText = `${monthNames[viewState.month]} ${viewState.year}`;
    document.getElementById('monthDisplay').innerText = displayText;
    console.log(`📆 Display: ${displayText}`);
}

// RENDER TABLE
function renderMonth() {
    const tableBody = document.getElementById('historyTableBody');
    tableBody.innerHTML = "";

    // Filter dates for current month
    const dateKeys = Object.keys(allLogs);
    const monthlyDates = dateKeys.filter(dateStr => {
        const [year, month, day] = dateStr.split('-');
        return parseInt(year) === viewState.year && 
               parseInt(month) === (viewState.month + 1);
    });

    // Sort newest first
    monthlyDates.sort((a, b) => new Date(b) - new Date(a));

    console.log(`📊 Found ${monthlyDates.length} days for ${viewState.month + 1}/${viewState.year}`);

    if (monthlyDates.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center; padding: 2rem; color:#999; font-style:italic;">
                    No logs found for this month.
                </td>
            </tr>`;
        return;
    }

    monthlyDates.forEach(dateStr => {
        const dayLogs = allLogs[dateStr];
        const totals = calculateDailyTotals(dayLogs);
        
        const displayDate = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
            weekday: 'short', month: 'long', day: 'numeric', year: 'numeric'
        });

        const row = document.createElement('tr');
        row.style.cursor = "pointer";
        row.style.transition = "background 0.2s";
        
        row.onclick = () => openHistoryDetail(displayDate, dayLogs);
        row.onmouseover = () => row.style.background = "rgba(255,255,255,0.6)";
        row.onmouseout = () => row.style.background = "transparent";

        row.innerHTML = `
            <td>${displayDate}</td>
            <td class="${getColorClass('cal', totals.cal)}">${Math.round(totals.cal)} cal</td>
            <td class="${getColorClass('fat', totals.fat)}">${Math.round(totals.fat)}g</td>
            <td class="${getColorClass('carb', totals.carb)}">${Math.round(totals.carb)}g</td>
            <td class="${getColorClass('prot', totals.prot)}">${Math.round(totals.prot)}g</td>
            <td class="${getColorClass('sugar', totals.sugar)}">${Math.round(totals.sugar)}g</td>
            <td style="text-align: center;"><span class="material-symbols-rounded" style="font-size: 1.2rem; color: #999; cursor: pointer;">add_circle</span></td>
        `;
        tableBody.appendChild(row);
    });
}

// CALCULATE TOTALS
// One shared reader. This was a hand-written loop that called
// JSON.parse() straight on log.macros — which throws if the value is
// already an object, taking the whole day's row with it — and read
// sugar from macros.sugar alone, missing everything logged before
// sugar became a macro.
function calculateDailyTotals(dayLogs) {
    return window.LIFEHUB_FOOD.totalsFor(dayLogs);
}

// COLOR CLASSES
function getColorClass(type, value) {
    const goals = DAILY_GOALS[type];
    
    // Sugar is different - it's a LIMIT, not a goal
    if (type === 'sugar') {
        const limit = goals.limit;
        if (value >= limit) return 'text-red';
        if (value >= limit * 0.8) return 'text-gold'; // Warning at 80%
        return 'text-green';
    }
    
    const percentage = (value / goals.ult) * 100;

    if (type === 'fat' && percentage > 100) return 'text-red';
    if (percentage >= 90) return 'text-gold';
    if (percentage >= 80) return 'text-green';
    return '';
}

// DETAIL MODAL
function openHistoryDetail(dateTitle, dayLogs) {
    document.getElementById('historyDetailTitle').innerText = dateTitle;
    
    const tbody = document.getElementById('historyDetailBody');
    tbody.innerHTML = "";

    const logsArray = Object.entries(dayLogs)
        .filter(([key, log]) => key !== 'wageProcessed' && log.foodName)
        .map(([key, log]) => log);

    let index = 1;
    logsArray.forEach(log => {
        const multiplier = parseFloat(log.multiplier) || 1;

        // The shared reader — multiplier already applied, sugar found
        // wherever it lives. Was JSON.parse() direct, which threw on a
        // row whose macros were stored as an object.
        const got = window.LIFEHUB_FOOD.macrosOf(log);
        const cal   = Math.round(got.cal);
        const carb  = Math.round(got.carb);
        const fat   = Math.round(got.fat);
        const prot  = Math.round(got.prot);
        const sugar = Math.round(got.sugar);

        const servingText = `${multiplier}x <span style="color:#999; font-size:0.8rem">(${log.baseServing})</span>`;

        const tr = document.createElement('tr');
        tr.style.borderBottom = "1px solid #eee";
        
        tr.innerHTML = `
            <td style="padding: 1rem; color: #999;">#${index++}</td>
            <td style="padding: 1rem; font-weight: 500; color: var(--primary-green); text-transform: capitalize;">${log.foodName}</td>
            <td style="padding: 1rem;">${servingText}</td>
            <td style="padding: 1rem; color: #666;">${log.time}</td>
            <td style="text-align: center; padding: 1rem;">${cal}</td>
            <td style="text-align: center; padding: 1rem;">${carb}g</td>
            <td style="text-align: center; padding: 1rem;">${fat}g</td>
            <td style="text-align: center; padding: 1rem;">${prot}g</td>
            <td style="text-align: center; padding: 1rem;">${sugar}g</td>
            <td style="text-align: center;"><span class="material-symbols-rounded" style="font-size: 1rem; color: #999; cursor: pointer;">add_circle</span></td>
        `;
        tbody.appendChild(tr);
    });

    const modal = document.getElementById('historyDetailModal');
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}

window.closeHistoryModal = function() {
    const modal = document.getElementById('historyDetailModal');
    modal.classList.add('hidden');
    modal.style.display = 'none';
}
