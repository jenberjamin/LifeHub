// js/food-tracker.js

// ==========================================
// 1. CONFIGURATION & WAGE RUBRIC
// ==========================================
// The targets, the wage rubric and the macro reader all come from
// JS/lifehub-food-rules.js, which this page loads first. They used to
// be written out here AND in food-history.js AND in food-statistics.js
// — three copies of the same numbers, and three different ways of
// reading a logged item, which is how sugar could total correctly on
// one page and read 0g on another.
if (!window.LIFEHUB_FOOD) {
    console.error("🍽️ JS/lifehub-food-rules.js must load before food-tracker.js.");
}

const DAILY_GOALS = window.LIFEHUB_FOOD.DAILY_GOALS;
const WAGE_RATES  = window.LIFEHUB_FOOD.WAGE_RATES;

// --- FIREBASE CONFIG ---
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

// ── MANILA TIME ────────────────────────────────────────────────
// Everything here used to go through toISOString(), which returns UTC —
// so between midnight and 8am Manila the tracker wrote to yesterday's
// node, the wage audit paid the wrong day, and the midnight watcher
// fired eight hours late.
const PH_TZ = "Asia/Manila";
const PH_DATE_FMT = new Intl.DateTimeFormat("en-CA", {
    timeZone: PH_TZ, year: "numeric", month: "2-digit", day: "2-digit"
});

function phToday() { return PH_DATE_FMT.format(new Date()); }

function phClock() {
    return new Date().toLocaleTimeString('en-GB', {
        timeZone: PH_TZ, hour: '2-digit', minute: '2-digit', hour12: false
    });
}

// Date-key arithmetic with no timezone in play — a key is a bare
// calendar date, so shifting it is pure counting.
function phShiftKey(key, days) {
    const [y, m, d] = String(key).split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d) + days * 86400000);
    return t.getUTCFullYear() + '-' +
           String(t.getUTCMonth() + 1).padStart(2, '0') + '-' +
           String(t.getUTCDate()).padStart(2, '0');
}

// --- STATE VARIABLES ---
let allFoodItems = []; 
let selectedFoodItem = null;
let currentTrackingDate = null; 
let logListener = null;         
let redoStack = [];             

// ==========================================
// 2. INITIALIZATION & MIDNIGHT WATCHER
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    loadFoodList();
    initializeDate();

    const searchInput = document.getElementById('foodSearchInput');
    if(searchInput) searchInput.addEventListener('input', handleSearch);

    checkPastWage();

    // --- THE MIDNIGHT WATCHER ---
    setInterval(() => {
        const timeStr = phClock();
        const dateStr = phToday();

        if (timeStr === "23:59") {
            console.log("🕒 11:59PM Detected. Attempting End-of-Day Audit...");
            processDailyWage(dateStr);
        }

        // This compared a UTC date against the tracking date, so the
        // "midnight crossover" actually fired at 8am Manila — the moment
        // the UTC date rolled over, eight hours after the real midnight.
        if (currentTrackingDate && dateStr !== currentTrackingDate) {
            console.log("🌙 Midnight crossover. Resetting dashboard.");
            initializeDate();
            checkPastWage();
        }
    }, 60000);
});

function initializeDate() {
    currentTrackingDate = phToday();

    // The heading was drawn from the device clock while the key came
    // from UTC, so between midnight and 8am the page said one date and
    // wrote to another. Both come from Manila now.
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: PH_TZ };
    document.getElementById('currentDateDisplay').innerText = new Date().toLocaleDateString('en-US', dateOptions);

    loadDailyLogs();
    redoStack = [];
}

function checkPastWage() {
    // Manila's yesterday. Built by shifting the date key rather than a
    // Date object, so no timezone can creep back in — the UTC version
    // audited the day BEFORE yesterday during Manila's early hours.
    processDailyWage(phShiftKey(phToday(), -1));
}

// ==========================================
// 3. THE PRESTIGE PAYROLL
// ==========================================
function processDailyWage(dateStr) {
    const dailyRef = database.ref(`dailyLogs/${dateStr}`);

    dailyRef.once('value', snapshot => {
        const data = snapshot.val();
        if (!data) return; 

        if (data.wageProcessed) {
            console.log(`✅ Wage for ${dateStr} already paid.`);
            return;
        }

        // The same totals the dashboard shows. This used to be its own
        // loop with its own sugar check — one that missed the `Sugars`
        // spelling the display version caught — so the Sugar Tax could
        // fail to apply on a day the bar had already turned red.
        const total = window.LIFEHUB_FOOD.totalsFor(data);

        let wage = 0;
        let ledger = []; 

        // 1. BASE WAGE
        if (total.cal >= DAILY_GOALS.cal.ult) {
            wage += WAGE_RATES.GOLD;
            ledger.push(`🏆 GOLD Standard Hit (${Math.round(total.cal)} kcal)`);
        } else if (total.cal >= DAILY_GOALS.cal.semi) {
            wage += WAGE_RATES.GREEN;
            ledger.push(`🟢 GREEN Standard Hit (${Math.round(total.cal)} kcal)`);
        } else {
            wage += WAGE_RATES.RED;
            ledger.push(`⚠️ SAGE/RED Zone Sanction (${Math.round(total.cal)} kcal)`);
        }

        // 2. SUGAR TAX
        //
        // The halving used to be gated on `wage > 0`, which meant that on
        // a day under 2,200 kcal — where the wage is already -1,000 —
        // going over the sugar limit cost nothing whatsoever. A day of
        // few calories and a lot of sugar is the worst-shaped day there
        // is, and it was the one day the rule couldn't reach.
        //
        // So there is now a floor: halve the wage when there is one to
        // halve, and charge a flat fine when there isn't.
        if (total.sugar > WAGE_RATES.SUGAR_LIMIT) {
            if (wage > 0) {
                const tax = wage * 0.5;
                wage -= tax;
                ledger.push(`🍭 Sugar Tax Applied (-50% for ${Math.round(total.sugar)}g Sugar)`);
            } else {
                wage += WAGE_RATES.SUGAR_FINE;
                ledger.push(`🍭 Sugar Tax Applied (${WAGE_RATES.SUGAR_FINE} for ${Math.round(total.sugar)}g Sugar on a low-calorie day)`);
            }
        }

        // 3. ANABOLIC BONUS
        if (total.prot >= DAILY_GOALS.prot.ult) {
            wage += WAGE_RATES.PROTEIN_BONUS;
            ledger.push(`💪 Anabolic Bonus (+${WAGE_RATES.PROTEIN_BONUS} for ${Math.round(total.prot)}g Prot)`);
        }

        if (ledger.length > 0) {
            awardPrestige(wage, ledger.join(" + "), dateStr);
            dailyRef.update({ wageProcessed: true });
        }
    });
}

function awardPrestige(amount, description, dateStr) {
    const balanceRef = database.ref('prestige_system/balance');
    const txRef = database.ref('prestige_system/transactions');

    balanceRef.transaction((current) => {
        return (current || 0) + amount;
    }, (error, committed) => {
        if (committed) {
            txRef.push({
                amount: amount,
                description: description,
                source: "FoodHub",
                dateRef: dateStr,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });
            console.log(`💰 PAYOUT: ${amount} Points.`);
        }
    });
}

// ==========================================
// 4. SEARCH & UI LOGIC
// ==========================================
function loadFoodList() {
    database.ref('foodList').once('value', snapshot => {
        const data = snapshot.val();
        if (data) {
            allFoodItems = Object.keys(data).map(key => ({ ...data[key], key }));
        }
    });
}

function handleSearch(e) {
    const term = e.target.value.toLowerCase();
    const resultsBox = document.getElementById('searchResults');
    
    if (term.length < 1) {
        resultsBox.classList.add('hidden');
        return;
    }

    const matches = allFoodItems.filter(item => item.name.toLowerCase().includes(term));
    
    resultsBox.innerHTML = '';
    if (matches.length > 0) {
        resultsBox.classList.remove('hidden');
        matches.forEach(item => {
            const div = document.createElement('div');
            div.style.padding = "10px 15px";
            div.style.cursor = "pointer";
            div.style.borderBottom = "1px solid #eee";
            div.style.color = "var(--primary-green)";
            div.style.fontSize = "0.9rem";
            
            // Through the shared resolver, so the badge appears on
            // items that keep their sugar in the old micros["Sugars"]
            // slot too. This was the last place still checking the
            // macro field alone.
            const macros = window.LIFEHUB_FOOD.parseBlob(item.macros);
            const micros = window.LIFEHUB_FOOD.parseBlob(item.micros);
            const sugarVal = window.LIFEHUB_FOOD.sugarOf(macros, micros);
            const sugarBadge = sugarVal > 0 ? ` <span title="${sugarVal}g Sugar">🍭</span>` : '';

            div.innerHTML = `<strong>${item.name}</strong>${sugarBadge} <span style="color:#999; font-size:0.8rem">(${item.serving})</span>`;
            
            div.onclick = () => openQuantityModal(item);
            div.onmouseover = () => div.style.background = "#F4F4F0";
            div.onmouseout = () => div.style.background = "transparent";
            resultsBox.appendChild(div);
        });
    } else {
        resultsBox.classList.add('hidden');
    }
}

function openQuantityModal(item) {
    selectedFoodItem = item;
    document.getElementById('searchResults').classList.add('hidden');
    document.getElementById('foodSearchInput').value = ''; 
    document.getElementById('q_foodName').innerText = item.name;
    document.getElementById('q_servingSize').innerText = `Standard Serving: ${item.serving}`;
    document.getElementById('q_multiplier').value = 1;

    const modal = document.getElementById('quantityModal');
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    document.getElementById('q_multiplier').focus();
}

window.closeQuantityModal = function() {
    document.getElementById('quantityModal').classList.add('hidden');
    document.getElementById('quantityModal').style.display = 'none';
    selectedFoodItem = null;
}

// ==========================================
// 5. LOGGING
// ==========================================
window.confirmLog = function() {
    if (!selectedFoodItem) return;

    const multiplier = parseFloat(document.getElementById('q_multiplier').value) || 1;

    const newLog = {
        foodName: selectedFoodItem.name,
        baseServing: selectedFoodItem.serving,
        multiplier: multiplier,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        macros: selectedFoodItem.macros || "{}",
        micros: selectedFoodItem.micros || "{}"
    };

    database.ref(`dailyLogs/${currentTrackingDate}`).push(newLog)
        .then(settleFoodProtocol);
    closeQuantityModal();
}

// The Food Protocol — the weekly trophies, on top of the daily wage.
// The rules and payouts live in JS/lifehub-food-protocol.js so this
// page, the homescreen toast and the bank all agree on what a trophy
// is; this only kicks it, AFTER the meal is written, because every
// rule is counted from the logs.
//
// Never allowed to break a log. The food is already saved by the time
// this runs, and a protocol that can't be reached must not turn a
// logged meal into an error.
function settleFoodProtocol() {
    const P = window.LIFEHUB_FOOD_PROTOCOL;
    if (!P || !window.LIFEHUB_PRESTIGE) return Promise.resolve([]);

    return P.settle(database, window.LIFEHUB_PRESTIGE,
                    firebase.database.ServerValue.TIMESTAMP)
            .then((paid) => {
                // Silent here on purpose: this runs on every single
                // item logged, and a modal alert on that path would
                // interrupt the one action FoodHub exists to make
                // frictionless. The homescreen toast is the
                // notification surface — it watches
                // prestige_system/food_protocol.
                if (paid && paid.length) console.log("[food] protocol settled:", paid);
                return paid;
            })
            .catch((e) => {
                console.warn("[food] protocol did not settle:", e.message);
                return [];
            });
}

// ==========================================
// 6. LOAD LOGS & UPDATE UI
// ==========================================
function loadDailyLogs() {
    const dbRef = database.ref(`dailyLogs/${currentTrackingDate}`);
    if (logListener) database.ref(`dailyLogs/${logListener}`).off(); 
    logListener = currentTrackingDate; 

    dbRef.on('value', snapshot => {
        const logs = snapshot.val();
        const logList = document.getElementById('dailyLogList');
        if (!logList) return;
        
        logList.innerHTML = '';
        let total = { cal: 0, prot: 0, carb: 0, fat: 0, sugar: 0 };

        if (logs) {
            // Newest first. Firebase push keys sort chronologically and
            // the snapshot hands them back in that order, so the list
            // arrived oldest-first — which meant the thing she just
            // logged appeared at the BOTTOM, below the fold, and the top
            // of the list was breakfast. Reversed for display only: the
            // totals below are a sum, so the order they accumulate in
            // makes no difference to them.
            const entries = Object.entries(logs)
                .filter(([key, val]) => key !== 'wageProcessed')
                .reverse();

            entries.forEach(([key, log]) => {
                const div = document.createElement('div');
                div.className = 'log-item';
                div.style.marginBottom = "0.8rem";
                
                // One reader, shared with the history and statistics
                // pages. It applies the multiplier and knows where
                // sugar can hide — including micros["Sugars"], which
                // is where every item added before sugar became a
                // macro still keeps it.
                const got = window.LIFEHUB_FOOD.macrosOf(log);
                const m = parseFloat(log.multiplier) || 1;

                total.cal   += got.cal;
                total.prot  += got.prot;
                total.carb  += got.carb;
                total.fat   += got.fat;
                total.sugar += got.sugar;

                div.innerHTML = `<span>${m}x ${log.foodName}</span> <span class="log-time">${log.time}</span>`;
                logList.appendChild(div);
            });
        } else {
            logList.innerHTML = '<div style="color:#999; font-size: 0.8rem; font-style:italic;">No food logged yet today.</div>';
        }

        updateStats(total);
    });
}

function updateStats(total) {
    const getPct = (val, max) => Math.min((val / max) * 100, 100);

    // Generic Visual Setter
    function setVisuals(type, currentVal, goals) {
        const bar = document.getElementById(`bar_${type}`);
        const txt = document.getElementById(`txt_${type}`);
        if(!bar || !txt) return;

        const percentage = Math.round(getPct(currentVal, goals.ult));
        bar.style.width = `${percentage}%`;
        txt.innerText = `${percentage}%`;

        // Reset Styles
        txt.classList.remove('text-gold');
        bar.classList.remove('bar-alert');
        bar.style.backgroundColor = ''; 

        // GOLD Logic (Goals)
        if (currentVal >= goals.semi) txt.classList.add('text-gold');
        
        // RED Logic (Limits for Fat)
        if (type === 'fat' && currentVal > goals.ult) bar.classList.add('bar-alert');
    }

    // Run standard visuals
    setVisuals('cal',  total.cal,  DAILY_GOALS.cal);
    setVisuals('prot', total.prot, DAILY_GOALS.prot);
    setVisuals('carb', total.carb, DAILY_GOALS.carb);
    setVisuals('fat',  total.fat,  DAILY_GOALS.fat);

    // --- SUGAR SPECIAL LOGIC ---
    const sugarBar = document.getElementById('bar_sugar');
    const sugarTxt = document.getElementById('txt_sugar');
    
    if (sugarBar && sugarTxt) {
        const sugarLimit = DAILY_GOALS.sugar.limit;
        const sugarPct = Math.min((total.sugar / sugarLimit) * 100, 100);
        
        sugarBar.style.width = `${sugarPct}%`;
        sugarTxt.innerText = `${Math.round(total.sugar)}g`; // Show grams, not percentage

        // THE RED LINE LOGIC
        if (total.sugar >= sugarLimit) {
            sugarBar.style.backgroundColor = '#E57373'; // Alert Red
            sugarTxt.style.color = '#E57373';
        } else {
            sugarBar.style.backgroundColor = ''; // Inherit CSS default (Green)
            sugarTxt.style.color = '';
        }
    }
}

// ==========================================
// 7. UNDO / REDO
// ==========================================
document.addEventListener('keydown', function(event) {
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
    const isCtrl = event.ctrlKey || event.metaKey;
    if (isCtrl && event.key === 'z') { event.preventDefault(); undoLastLog(); }
    if (isCtrl && event.key === 'r') { event.preventDefault(); redoLastLog(); }
});

function undoLastLog() {
    const todayRef = database.ref(`dailyLogs/${currentTrackingDate}`);
    todayRef.limitToLast(1).once('value', snapshot => {
        const data = snapshot.val();
        if (data) {
            const lastKey = Object.keys(data)[0];
            if(lastKey === 'wageProcessed') return; 
            
            const lastItem = data[lastKey];
            redoStack.push(lastItem);
            todayRef.child(lastKey).remove();
        }
    });
}

function redoLastLog() {
    if (redoStack.length === 0) return;
    const itemToRevive = redoStack.pop();
    database.ref(`dailyLogs/${currentTrackingDate}`).push(itemToRevive);
}

// ==========================================
// 8. HELPER: The Universal Translator
// ==========================================
// Kept as a thin alias. It moved to JS/lifehub-food-rules.js as
// parseBlob(), so the history and statistics pages get it too — they
// were calling JSON.parse() directly and throwing on any row stored as
// an object. Nothing in this file calls this any more; it stays in case
// something outside it does.
function safeGetMacros(data) {
    return window.LIFEHUB_FOOD.parseBlob(data);
}
