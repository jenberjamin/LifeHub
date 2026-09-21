// --- LIFEHUB CORE: SELF UPKEEP TRACKER ---


// 1. CONFIGURATION
const config = {
  apiKey: "AIzaSyABhqON4h0GHjFbZaDT1ysSprmpdczyC6I",
  authDomain: "lifehub-cae1d.firebaseapp.com",
  databaseURL: "https://lifehub-cae1d-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "lifehub-cae1d",
  storageBucket: "lifehub-cae1d.firebasestorage.app",
  messagingSenderId: "471522181748",
  appId: "1:471522181748:web:6861392a45fbbbec8dc721",
  measurementId: "G-2R3WDZNXKG"
};

// 2. ISOLATED INITIALIZATION (The Patch)
// We use "SelfApp" here to keep it safe.
let app;
try {
    app = firebase.app("SelfApp");
} catch (e) {
    app = firebase.initializeApp(config, "SelfApp");
}
const db = app.database();

// ── MANILA TIME ────────────────────────────────────────────────
// activeDate used to come from toISOString(), which returns UTC — so a
// night routine logged between midnight and 8am Manila was filed under
// the previous day.
const PH_TZ = "Asia/Manila";
const PH_DATE_FMT = new Intl.DateTimeFormat("en-CA", {
    timeZone: PH_TZ, year: "numeric", month: "2-digit", day: "2-digit"
});
function phToday() { return PH_DATE_FMT.format(new Date()); }

// 2. STATE MANAGEMENT
let activeDate = phToday();
let activeListener = null;
let activeZone = 'Facial Care'; 
let completedTasks = []; 
let dailyLogCache = {}; // Stores all history for the modal

// LIBRARY - MAPPED TO CARD NAMES
const TASKS = {
    'Facial Care': [
        { id: 'fc1', text: 'Cold Water Facial Dip', pts: 100, freq: 'daily' },
        { id: 'fc2', text: 'Facial Wash', pts: 25, freq: 'daily', mode: 'repeat' },
        { id: 'fc3', text: 'Toner', pts: 50, freq: 'daily', mode: 'repeat' },
        { id: 'fc4', text: 'Serums', pts: 75, freq: 'daily', mode: 'repeat' },
        { id: 'fc5', text: 'Moisturizer', pts: 40, freq: 'daily', mode: 'repeat' },
        { id: 'fc6', text: 'Sunscreen', pts: 50, freq: 'daily', mode: 'repeat' },
        { id: 'fc7', text: 'Retinol', pts: 75, freq: 'daily', mode: 'repeat' },
        { id: 'fc8', text: 'Face Mask', pts: 100, freq: 'daily', mode: 'repeat' },
        { id: 'fc9', text: 'Lip Balm', pts: 35, freq: 'daily', mode: 'repeat' },
        { id: 'fc10', text: 'Neck Cream', pts: 50, freq: 'daily', mode: 'repeat' },
        { id: 'fc11', text: 'Cleansing: Honey (antibacterial, gentle cleanser)', pts: 100, freq: 'daily', mode: 'repeat' },
        { id: 'fc12', text: 'Cleansing: Oatmeal (soothing, exfoliating)', pts: 80, freq: 'daily', mode: 'repeat' },
        { id: 'fc13', text: 'Cleansing: Milk (cleansing, brightening)', pts: 120, freq: 'daily', mode: 'repeat' },
        { id: 'fc14', text: 'Toners: Cucumber water (cooling, hydrating)', pts: 80, freq: 'daily', mode: 'repeat' },
        { id: 'fc15', text: 'Moisturizer: Aloe vera gel (hydrating, soothing, healing, acne, inflammation)', pts: 100, freq: 'daily', mode: 'repeat' },
        { id: 'fc16', text: 'Serum: Vitamin E oil (healing, anti-aging)', pts: 200, freq: 'daily', mode: 'repeat' },
        { id: 'fc17', text: 'Serum: Rosehip oil (anti-aging, scars)', pts: 150, freq: 'daily', mode: 'repeat' },

// WEEKLY
        { id: 'fc18', text: 'Face Masks: Turmeric + yogurt/honey  (brightening, anti-inflammatory)', pts: 300, freq: 'weekly' },
        { id: 'fc19', text: 'Face Masks: Avocado (moisturizing)', pts: 250, freq: 'weekly' },

//BI-WEEKLY
        { id: 'fc20', text: 'Face Masks: Egg white (pore tightening)', pts: 100, freq: 'biweekly' },
        { id: 'fc21', text: 'Face Masks: Banana (hydration)', pts: 100, freq: 'biweekly' },
        { id: 'fc22', text: 'Exfoliation: Papaya (enzymatic exfoliation, brightening)', pts: 250, freq: 'biweekly' }
    ],


    'Hair Care': [
        { id: 'hc1', text: 'Black coffee (strengthens, adds shine)', pts: 100 },
        { id: 'hc2', text: 'Rice water (strengthens, adds shine)', pts: 80 },
        { id: 'hc3', text: 'Onion Juice (boost collagen)', pts: 150 },
        { id: 'hc4', text: 'Coconut oil (deep conditioning, protein)', pts: 80 },
        { id: 'hc5', text: 'Olive oil (moisture, strength)', pts: 80 },
        { id: 'hc6', text: 'Castor oil (shine, smoothness)', pts: 80 },
        { id: 'hc7', text: 'Argan oil (shine, smoothness)', pts: 80 },
        { id: 'hc8', text: 'Rosemary oil (growth stimulation)', pts: 120 },
        { id: 'hc9', text: 'Jojoba oil (scalp health)', pts: 100 },
        { id: 'hc10', text: 'Egg masks (protein treatment)', pts: 100 },
        { id: 'hc11', text: 'Aloe Vera (soothing, growth)', pts: 150 },
        { id: 'hc12', text: 'Banana masks (moisture)', pts: 80 },
        { id: 'hc14', text: 'Avocado (deep conditioning)', pts: 120 },
        { id: 'hc15', text: 'Yogurt (conditioning, shine)', pts: 80 }
    ],

    'Skin Care': [
        { id: 'sc1', text: 'Full Body Shower', pts: 100, freq: 'daily' },
        { id: 'sc2', text: 'Half Bath', pts: 70, freq: 'daily' },
        { id: 'sc3', text: 'Body Lotion', pts: 80, freq: 'daily', mode: 'repeat' },
        { id: 'sc4', text: 'Moisturizer: Coconut oil', pts: 80, freq: 'daily' },
        { id: 'sc5', text: 'Moisturizer: Shea butter', pts: 100, freq: 'daily' },
        { id: 'sc6', text: 'Moisturizer: Cocoa butter', pts: 100, freq: 'daily' },
        { id: 'sc7', text: 'Moisturizer: Almond oil', pts: 100, freq: 'daily' },
        { id: 'sc8', text: 'Moisturizer: Olive oil', pts: 100, freq: 'daily' },
        { id: 'sc9', text: 'Moisturizer: Jojoba oil', pts: 100, freq: 'daily' },
        { id: 'sc10', text: 'Moisturizer: Vitamin E oil', pts: 120, freq: 'daily' },
//BI-WEEKLY
        { id: 'sc11', text: 'Exfoliate', pts: 150, freq: 'weekly' },

//WEEKLY
        /* These four had `pts` written TWICE — "pts: 200, pts: 50".
           JavaScript keeps the last one silently, so three of them
           have been paying 50 for a weekly treatment while the number
           on screen said 50 too and nothing looked wrong.

           Restored to the values that match the rest of the weekly
           work (exfoliate 150, turmeric face mask 300): the strays
           were 50, 50, 40, 50. */
        { id: 'sc13', text: 'Brightening: Lemon juice + honey', pts: 200, freq: 'weekly' },
        { id: 'sc14', text: 'Brightening: Turmeric + yogurt + honey', pts: 300, freq: 'weekly' },
        { id: 'sc15', text: 'Brightening: Turmeric + yogurt', pts: 200, freq: 'weekly' },
        { id: 'sc16', text: 'Body Butter: Shea butter + cocoa butter + coconut oil', pts: 350, freq: 'weekly' }
    ],


    'Dental Care': [
        { id: 'dc1', text: 'Tooth Brush', pts: 150, freq: 'daily', mode: 'repeat' },
        { id: 'dc2', text: 'Mouthwash', pts: 200, freq: 'daily', mode: 'repeat' },
        { id: 'dc3', text: 'Soak: Baking Soda', pts: 100, freq: 'daily' },
        { id: 'dc4', text: 'Soak: White Vinegar', pts: 100, freq: 'daily' },
        { id: 'dc5', text: 'Soak: Baking soda + Vinegar', pts: 150, freq: 'daily' },
        { id: 'dc6', text: 'Soak: Salt + Baking soda ', pts: 100, freq: 'daily' }

    ],
    'Eye Care': [
        { id: 'ec1', text: 'Eye Drops', pts: 80 },
        { id: 'ec2', text: 'Eye Cream', pts: 150 },
        { id: 'ec3', text: 'Warm Compress', pts: 150 },
        { id: 'ec4', text: 'Cold Compress', pts: 150 },
        { id: 'ec5', text: 'Cucumber slices', pts: 100 },
        { id: 'ec6', text: 'Potato slices', pts: 100 },
        { id: 'ec7', text: 'Almond oil', pts: 100 },
        { id: 'ec8', text: 'Cold tea bags', pts: 200 }
    ],

    'Miles Care': [
        { id: 'mc1', text: 'Full Bath', pts: 300 },
        { id: 'mc2', text: 'Walk', pts: 200 },
        { id: 'mc3', text: 'Wash Toys', pts: 150 },
        { id: 'mc4', text: 'Sanitized Toys', pts: 80 },
        { id: 'mc5', text: 'Brushing / Grooming', pts: 80 },
        { id: 'mc6', text: 'Teeth Brushing', pts: 150 },
        { id: 'mc8', text: 'Clean Ears', pts: 150 },
        { id: 'mc9', text: 'Nail Trim', pts: 200 },
        { id: 'mc10', text: 'Vitamins', pts: 100 },
        { id: 'mc11', text: 'Change Water', pts: 150 },
        { id: 'mc12', text: 'Wash Bowls', pts: 250 }
    ],

'Other Self Care': [
        { id: 'osc1', text: 'Trim Nails', pts: 100 },
        { id: 'osc2', text: 'Clean Ears', pts: 150 },
        { id: 'osc3', text: 'Moisturize Hand', pts: 80 },
        { id: 'osc4', text: 'Moisturize feet', pts: 80 },
        { id: 'osc5', text: 'Shave Underarms', pts: 100 },
        { id: 'osc6', text: 'Clean belly button', pts: 150 },
        { id: 'osc7', text: 'Trim split ends', pts: 80 }
    ]
};

// 3. INITIALIZATION
document.addEventListener('DOMContentLoaded', () => {
    // Setup Date Picker
    const dateInput = document.getElementById('logDate');
    dateInput.value = activeDate;
    
    // Date Change Listener
    dateInput.addEventListener('change', (e) => {
        activeDate = e.target.value;
        switchDateListener(activeDate);
    });

    // Modal Listeners
    document.getElementById('historyBtn').onclick = openHistoryModal;
    document.getElementById('closeModal').onclick = closeHistoryModal;

    // Initial Load
    switchDateListener(activeDate);
    
    // Load default view
    loadChecklist(activeZone);
    calculateConsistency();
});

// --- FIREBASE SYNC ---

function switchDateListener(dateStr) {
    if (activeListener) db.ref('self_care_logs/' + activeListener).off();
    
    activeListener = dateStr;
    const logRef = db.ref('self_care_logs/' + dateStr);

    logRef.on('value', (snapshot) => {
        const data = snapshot.val();
        
        if (data) {
            completedTasks = data.tasks || [];
        } else {
            completedTasks = [];
        }

        // Refresh the current list to show checked items
        loadChecklist(activeZone);
        renderDailySummary(completedTasks);
    });
}

function saveToCloud() {
    db.ref('self_care_logs/' + activeDate).update({
        tasks: completedTasks,
        last_updated: firebase.database.ServerValue.TIMESTAMP
    }, (error) => {
        // This callback runs only after the data is successfully saved
        if (!error) {
            calculateConsistency();
        }
    });
}

// --- INTERFACE SWITCHING ---

window.selectZone = function(card, name) {
    // Update visuals
    document.querySelectorAll('.zone-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    
    activeZone = name;
    
    // Load the relevant checklist
    loadChecklist(name);
}

// --- CHECKLIST ENGINE ---

function loadChecklist(category) {
    const container = document.getElementById('checklistContainer');
    document.getElementById('rightPanelTitle').innerText = category + " Protocol";
    
    container.innerHTML = ''; 
    const items = TASKS[category] || [];

    // 1. SPLIT ITEMS
    const dailyItems = items.filter(i => i.freq === 'daily' || !i.freq); 
    const weeklyItems = items.filter(i => i.freq === 'weekly');
    const biItems = items.filter(i => i.freq === 'biweekly');

    // 2. HELPER TO RENDER GROUPS
    const renderGroup = (groupTitle, groupItems) => {
        if (groupItems.length === 0) return;

        const header = document.createElement('div');
        header.className = 'checklist-header';
        header.innerText = groupTitle;
        container.appendChild(header);

        groupItems.forEach(task => {
            const el = document.createElement('div');
            el.className = 'check-item';
            
            // COUNT how many times we've done this today
            // We search the completedTasks array for all matches of this ID
            const count = completedTasks.filter(id => id === task.id).length;
            const isDone = count > 0;

            // DIFFERENT STYLES FOR REPEATABLE VS NORMAL
            if (task.mode === 'repeat') {
                // --- REPEATABLE UI ---
                if (isDone) el.classList.add('active-repeat'); // Highlight slightly
                
                el.innerHTML = `
                    <div class="repeat-counter">${count > 0 ? 'x' + count : '+'}</div>
                    <div class="check-text">${task.text}</div>
                    <div class="check-reward">+${task.pts}</div>
                    ${count > 0 ? `<div class="repeat-undo" onclick="event.stopPropagation(); removeInstance('${task.id}', ${task.pts}, '${task.text}')">−</div>` : ''}
                `;
                
                // Click adds 1
                el.onclick = function() {
                    completedTasks.push(task.id);
                    processTransaction(task.pts, `Care: ${task.text} (${count + 1})`);
                    saveToCloud();
                    // We simply reload the list to update the UI count
                    loadChecklist(activeZone); 
                };

            } else {
                // --- STANDARD CHECKBOX UI ---
                if (isDone) el.classList.add('completed');

                el.innerHTML = `
                    <div class="custom-checkbox"></div>
                    <div class="check-text">${task.text}</div>
                    <div class="check-reward">+${task.pts}</div>
                `;
                
                el.onclick = function() {
                    this.classList.toggle('completed');
                    const nowChecked = this.classList.contains('completed');
                    
                    if (nowChecked) {
                        if (!completedTasks.includes(task.id)) {
                            completedTasks.push(task.id);
                            processTransaction(task.pts, `Care: ${task.text}`);
                        }
                    } else {
                        // Remove ONLY the first instance found
                        const index = completedTasks.indexOf(task.id);
                        if (index > -1) {
                            completedTasks.splice(index, 1);
                            processTransaction(-task.pts, `Correction: ${task.text}`);
                        }
                    }
                    saveToCloud();
                    updateProgress();
                };
            }
            
            container.appendChild(el);
        });
    };

    // 3. EXECUTE RENDER
    //
    // The group heading for a category with no frequencies on it —
    // Hair Care, Eye Care, Miles Care, Other Self Care — used to read
    // "DAILY RITUALS", which is not what a dog's nail trim is.
    const hasFreq = items.some(i => i.freq);
    renderGroup(hasFreq ? "DAILY RITUALS" : "ROUTINES", dailyItems);
    renderGroup("BI-WEEKLY MAINTENANCE", biItems);
    renderGroup("WEEKLY RESET", weeklyItems);

    updateProgress(items);
}

// Helper to remove one instance of a repeatable task
window.removeInstance = function(id, pts, text) {
    const index = completedTasks.indexOf(id);
    if (index > -1) {
        completedTasks.splice(index, 1);
        processTransaction(-pts, `Correction: ${text}`);
        saveToCloud();
        loadChecklist(activeZone);
    }
}



/* Counted from the DATA, not from CSS classes.

   It used to count `.check-item.completed` against every `.check-item`
   on screen — but a repeatable task never gets the `completed` class,
   it gets `active-repeat`. So repeatables were in the denominator and
   could never reach the numerator. Facial Care is sixteen repeatables
   out of twenty-two, which meant the bar could not pass 6/22 however
   thorough she had been, and on a day of nothing but repeatables it
   read a flat 0. */
function updateProgress(items) {
    const list = items || (TASKS[activeZone] || []);
    const total = list.length;
    const done = list.filter(t => completedTasks.indexOf(t.id) !== -1).length;
    const pct = total === 0 ? 0 : (done / total) * 100;

    const count = document.getElementById('cp-count');
    const bar = document.getElementById('checklistProgress');
    if (count) count.innerText = `${done}/${total}`;
    if (bar) bar.style.width = pct + "%";
}

function renderDailySummary(tasks) {
    // A small summary below the list showing total for the day
    const count = tasks.length;
    let points = 0;
    
    // Calculate points (inefficient but safe way)
    tasks.forEach(taskId => {
        for (const cat in TASKS) {
            const found = TASKS[cat].find(t => t.id === taskId);
            if (found) points += found.pts;
        }
    });

    const summaryEl = document.getElementById('dailySummary');
    if(summaryEl) {
        summaryEl.innerHTML = `
            <span style="opacity:0.6;">Today's Total:</span> 
            <span style="font-weight:600; color:var(--color-sage-dark); margin-left:10px;">${points} pts</span>
        `;
    }
}

// --- DIRECT TRANSACTION ENGINE ---

const SOURCE = "SELF UPKEEP";

/* Rows are built by JS/lifehub-prestige-ledger.js — the same builder
   the other trackers and Poppy use.

   This file used to assemble its own. It worked, but only by luck:
   un-checking a task wrote a negative row whose description happened
   to start with the word "Correction", and the ledger's rank rule
   reads that word to decide whether a negative row should lower her
   rank. Reword the description and the rank silently stops being
   corrected. reversal() sets an explicit kind:"correction" instead,
   so it does not depend on anyone's prose.

   `net_worth` is also gone. It was incremented here on every positive
   amount and decremented by nobody, so it drifted upward forever and
   nothing read it — lifetime prestige is the ledger replayed, which
   the module computes. */
function processTransaction(amount, desc) {
    const P = window.LIFEHUB_PRESTIGE;
    if (!P) {
        console.error("[self-upkeep] lifehub-prestige-ledger.js isn't loaded — not paying.");
        return;
    }

    const stamp = firebase.database.ServerValue.TIMESTAMP;

    /* Balance as a transaction, so two surfaces writing at once
       cannot lose one of them. */
    db.ref('prestige_system/balance').transaction((current) => (current || 0) + amount);

    /* A negative here is always a task being un-ticked — points
       coming back out because the thing did not happen. That is a
       correction, and it should move the rank as well as the wallet. */
    const tx = amount < 0
        ? P.reversal(Math.abs(amount), desc, SOURCE, stamp)
        : P.row(amount, desc, SOURCE, stamp);

    db.ref('prestige_system/transactions').push(tx);
}

// --- HISTORY ARCHIVE SYSTEM ---

function openHistoryModal() {
    document.getElementById('historyModal').classList.add('active');
    fetchHistory();
}

function closeHistoryModal() {
    document.getElementById('historyModal').classList.remove('active');
}

// Helper to find text by ID across all categories
function getTaskName(id) {
    for (const cat in TASKS) {
        const found = TASKS[cat].find(t => t.id === id);
        if (found) return found.text;
    }
    return id; // Fallback
}

function fetchHistory() {
    const container = document.getElementById('historyList');
    container.innerHTML = '<div style="padding:20px; text-align:center; opacity:0.5;">Loading Archives...</div>';

    db.ref('self_care_logs').limitToLast(30).once('value').then(snapshot => {
        const data = snapshot.val();
        container.innerHTML = '';

        if (!data) {
            container.innerHTML = '<div style="padding:20px; text-align:center;">No history found.</div>';
            return;
        }

        // Sort by date descending
        const logs = Object.entries(data).map(([date, val]) => ({
            date: date,
            tasks: val.tasks || []
        })).sort((a, b) => new Date(b.date) - new Date(a.date));

        logs.forEach(log => {
            // 1. Calculate Day Stats
            let dayPoints = 0;
            const taskNames = [];

            log.tasks.forEach(taskId => {
                // Find point value
                for (const cat in TASKS) {
                    const found = TASKS[cat].find(t => t.id === taskId);
                    if (found) {
                        dayPoints += found.pts;
                        // Add to our list of names
                        taskNames.push(found.text);
                    }
                }
            });

            // 2. Format Date
            const d = new Date(log.date);
            const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            
            // 3. Generate Itemized HTML
            // We create small "pills" or a list for the tasks
            let itemsHtml = '';
            if (taskNames.length > 0) {
                itemsHtml = `<div class="h-item-grid">` + 
                    taskNames.map(name => `<span class="h-task-pill">${name}</span>`).join('') + 
                `</div>`;
            } else {
                itemsHtml = `<div class="h-no-data">No routines recorded.</div>`;
            }

            // 4. Render Row
            const row = document.createElement('div');
            row.className = 'history-card'; // Changed from 'row' to 'card' for better layout
            row.innerHTML = `
                <div class="h-card-header">
                    <span class="h-main-date">${dateStr}</span>
                    <span class="h-badge">+${dayPoints} pts</span>
                </div>
                ${itemsHtml}
            `;
            container.appendChild(row);
        });
    });
}

/* The seven date keys ending today, in Manila. Built from the date
   parts so no timezone can shift one. */
function lastSevenKeys() {
    const [y, m, d] = phToday().split('-').map(Number);
    const keys = [];
    for (let i = 6; i >= 0; i--) {
        const t = new Date(Date.UTC(y, m - 1, d) - i * 86400000);
        keys.push(t.getUTCFullYear() + '-' +
                  String(t.getUTCMonth() + 1).padStart(2, '0') + '-' +
                  String(t.getUTCDate()).padStart(2, '0'));
    }
    return keys;
}

function calculateConsistency() {
    /* The card says "7-DAY FOCUS", so it has to mean the last seven
       CALENDAR days.

       This used to be limitToLast(7), which is the seven most recent
       RECORDED days — a different thing entirely the moment there is
       a gap. Three days logged this week plus four from August came
       back as seven days and were then divided by seven, so a month
       of barely touching a routine could read 100%. The meter was at
       its most flattering exactly when it should not have been. */
    const window7 = lastSevenKeys();

    db.ref('self_care_logs')
      .orderByKey()
      .startAt(window7[0])
      .endAt(window7[6])
      .once('value').then(snapshot => {
        const data = snapshot.val() || {};

        // 1. Initialise a counter per category, from the task table
        //    itself — the old hardcoded list carried a 'Special
        //    Treatment' zone that no longer exists and would have
        //    silently missed any new one.
        const stats = {};
        Object.keys(TASKS).forEach(cat => { stats[cat] = 0; });

        // 2. Only the seven days in the window, present or not. A day
        //    with no record is a day the routine did not happen, and
        //    it has to count against her or the meter means nothing.
        window7.forEach(key => {
            const dayLog = data[key];
            if (!dayLog || !dayLog.tasks) return;

            // Which categories were touched ON THIS DAY. A Set, so two
            // facial tasks is one active day rather than two.
            const activeCategoriesToday = new Set();

            dayLog.tasks.forEach(taskId => {
                // Reverse lookup: Find which category this task belongs to
                for (const [catName, catTasks] of Object.entries(TASKS)) {
                    if (catTasks.find(t => t.id === taskId)) {
                        activeCategoriesToday.add(catName);
                        break;
                    }
                }
            });

            activeCategoriesToday.forEach(cat => {
                if (stats[cat] !== undefined) stats[cat]++;
            });
        });

        // 3. Update the UI
        document.querySelectorAll('.zone-card').forEach(card => {
            const zoneName = card.getAttribute('data-zone'); // We rely on the data attribute now
            if (!zoneName || stats[zoneName] === undefined) return;

            const daysActive = stats[zoneName];
            // Always out of seven, whether or not those days have
            // records — which is now true rather than assumed.
            const pct = Math.round((daysActive / 7) * 100);

            // Update DOM
            const fill = card.querySelector('.consistency-fill');
            const text = card.querySelector('.consistency-text');
            
            if (fill) fill.style.width = pct + "%";
            if (text) text.innerText = pct + "%";
            
            // Reveal the meter
            card.classList.add('has-data');
        });
    });
}

// ==========================================
// 🚀 ALEXA REAL-TIME LISTENER
// ==========================================
const alexaRef = db.ref('alexa_updates');

// ── WHY THIS GUARD EXISTS ─────────────────────────────────────────
// This listener PAYS OUT, and it never cleared the mailbox afterwards.
// on('value') fires once on connect with whatever is already sitting
// there — so a check_tasks command stayed put and was re-processed on
// every single page load, pushing the task onto completedTasks and
// calling processTransaction() again each time. Points accumulated
// without limit for one thing said once to Alexa.
//
// It deliberately still does NOT clear the mailbox: check_tasks is
// shared with the Home Upkeep tracker, which has its own IDs to pick
// out of the same command. Clearing it here would delete that command
// before the other page saw it. The dedupe below makes leaving it
// there harmless.
const SELF_MAX_AGE_MS = 10 * 60 * 1000;   // 10 minutes
const SELF_SEEN_KEY = 'selfupkeep_last_alexa_ts';

function selfAlreadyHandled(ts) {
    try { return ts && Number(localStorage.getItem(SELF_SEEN_KEY)) >= ts; }
    catch (e) { return false; }
}
function selfMarkHandled(ts) {
    try { if (ts) localStorage.setItem(SELF_SEEN_KEY, String(ts)); }
    catch (e) { /* private mode — the age check still applies */ }
}

alexaRef.on('value', (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    // We only care about "check_tasks" actions
    if (data.action === 'check_tasks' && data.taskIds) {

        const selfTs = Number(data.timestamp) || 0;
        if (selfTs && Date.now() - selfTs > SELF_MAX_AGE_MS) {
            console.log("⌛ Ignoring stale task command from", new Date(selfTs).toLocaleString());
            return;
        }
        if (selfAlreadyHandled(selfTs)) return;

        // Marked BEFORE paying. If the write fails halfway, a missed
        // task is recoverable by tapping it; one that re-pays on every
        // reload is not.
        selfMarkHandled(selfTs);

        let selfCareUpdates = 0;
        const spokenIds = [];

        // Loop through the IDs Alexa sent (e.g., ['fc2', 'mc1'])
        data.taskIds.forEach(id => {
            
            // 1. SEARCH: Check if this ID belongs to Self Upkeep
            let taskFound = null;
            for (const cat in TASKS) {
                const match = TASKS[cat].find(t => t.id === id);
                if (match) {
                    taskFound = match;
                    break;
                }
            }

            // 2. ACTION: If found, mark it done
            if (taskFound) {
                console.log(`⚡ Alexa: Checked off ${taskFound.text}`);
                spokenIds.push(id);

                // Process the points (Money!)
                processTransaction(taskFound.pts, `Alexa: ${taskFound.text}`);

                selfCareUpdates++;
            }
        });

        // 3. SAVE — always onto TODAY, and never over the top of what
        //    is already there.
        //
        //    This used to push onto completedTasks and call
        //    saveToCloud(), which writes to `activeDate` — the date
        //    the PAGE is showing. Leave the tracker open on last
        //    Tuesday, say "Alexa, I brushed my teeth", and the task
        //    landed on last Tuesday. Alexa is always talking about
        //    now, so the write is pinned to today regardless of what
        //    is on screen.
        //
        //    A transaction rather than a set, because the array it is
        //    appending to may have been changed by the page a moment
        //    ago, and last-write-wins on a list loses entries.
        if (selfCareUpdates > 0) {
            const todayKey = phToday();
            db.ref('self_care_logs/' + todayKey + '/tasks').transaction((current) => {
                const list = Array.isArray(current) ? current.slice() : [];
                spokenIds.forEach(id => list.push(id));
                return list;
            }, (err) => {
                if (err) return;
                db.ref('self_care_logs/' + todayKey)
                  .update({ last_updated: firebase.database.ServerValue.TIMESTAMP });
                calculateConsistency();
            });

            /* The live listener redraws the list for us, but only if
               the page happens to be showing today. */
            console.log(`Saved ${selfCareUpdates} tasks from Alexa onto ${todayKey}.`);
        }
    }
});