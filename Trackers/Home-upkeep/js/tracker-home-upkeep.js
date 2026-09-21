// --- LIFEHUB CORE: HOME UPKEEP TRACKER ---
// "The Clean Slate Version"

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
// We use a specific name "HomeApp" so it doesn't fight with other trackers
let app;
try {
    app = firebase.app("HomeApp");
} catch (e) {
    app = firebase.initializeApp(config, "HomeApp");
}
const db = app.database();

// RATES & SETTINGS
const ROOM_RATES = {
    'Bathroom': 40, 'My Bedroom': 20, 'Living Room': 25,
    'Dining Room': 30, 'Kitchen': 25, 'Balcony': 15,
    'Mama\'s Bedroom': 25, 'Denden\'s Bedroom': 15, 'Store': 45
};
const MINIMUM_SESSION_MINUTES = 10; // Change to 1 for testing if needed

// The longest a restored session is allowed to be worth.
//
// A running timer is remembered across reloads by its start stamp, so a
// tab closed mid-session keeps "running" in wall-clock time. Reopened
// three days later, that stamp said 4,320 minutes — which at the
// Bathroom rate would have paid 172,800 points for a session that
// finished days earlier. Anything longer than this is treated as a
// timer that was left on rather than work that was done.
const MAX_SESSION_HOURS = 3;

// ── MANILA TIME ────────────────────────────────────────────────
// activeDate used to come from toISOString(), which returns UTC — so
// cleaning done between midnight and 8am Manila was filed under the
// previous day.
const PH_TZ = "Asia/Manila";
const PH_DATE_FMT = new Intl.DateTimeFormat("en-CA", {
    timeZone: PH_TZ, year: "numeric", month: "2-digit", day: "2-digit"
});
function phToday() { return PH_DATE_FMT.format(new Date()); }

// 2. STATE MANAGEMENT
let activeDate = phToday();
let activeListener = null;

let activeView = 'timer'; 
let activeZone = 'My Bedroom'; 
let timerInterval = null;
let secondsElapsed = 0;
let isRunning = false;
let isPaused = false;
let dailySessions = []; // Stores the logs
let startTimeStamp = null; 
let holdingBalance = 0; // Stores the money

// Default Data Structures
const DEFAULT_ZONES = {
    'My Bedroom': 0.0, 'Bathroom': 0.0, 'Living Room': 0.0,
    'Dining Room': 0.0, 'Kitchen': 0.0, 'Balcony': 0.0,
    'Mama\'s Bedroom': 0.0, 'Denden\'s Bedroom': 0.0, 'Store': 0.0
};

let zoneData = { ...DEFAULT_ZONES };
let completedTasks = [];

// The play/pause glyph. Reached through eleven unguarded
// querySelector().innerText calls before this — each one a TypeError if
// the markup ever changes or the element hasn't rendered yet.
function setControlIcon(name) {
    const el = document.querySelector('.timer-controls button:first-child span');
    if (el) el.innerText = name;
}

// LIBRARY
const TASKS = {
    'Sanitation': [
        { id: 's1', text: 'TECH: Phone', pts: 40 },
        { id: 's2', text: 'TECH: Phone Charger', pts: 30 },
        { id: 's3', text: 'TECH: Laptop', pts: 80 },
        { id: 's4', text: 'TECH: Laptop Charger', pts: 50 },
        { id: 's5', text: 'TECH: Harddrive', pts: 25 },
        { id: 's6', text: 'TECH: Earpods And Headphone', pts: 50 },
        { id: 's7', text: 'TECH: Alexa', pts: 30 },
        { id: 's8', text: 'TECH: PC', pts: 120 },
        { id: 's9', text: 'TECH: Mouse', pts: 50 },
        { id: 's10', text: 'TECH: Electrical Extension', pts: 80 },
        { id: 's11', text: 'TECH: Weight Scale', pts: 20 },
        { id: 's12', text: 'TECH: Piano', pts: 40 },
        { id: 's13', text: 'TECH: Electric Fan', pts: 100 },
        { id: 's14', text: 'TECH: Air Conditioner', pts: 200 },
        { id: 's15', text: 'My Stuff: Desk', pts: 50 },
        { id: 's16', text: 'My Stuff: Mini-Desk', pts: 100 },
        { id: 's17', text: 'My Stuff: Mirror', pts: 30 },
        { id: 's18', text: 'My Stuff: Workout Equipments', pts: 100 },
        { id: 's19', text: 'My Stuff: Easel', pts: 20 },
        { id: 's20', text: 'My Stuff: Pens And Pencils', pts: 20 },
        { id: 's21', text: 'My Stuff: Book Covers', pts: 50 },
        { id: 's22', text: 'My Stuff: Beauty Products', pts: 120 },
        { id: 's23', text: 'My Stuff: Shoes', pts: 20 },
        { id: 's24', text: 'My Stuff: Wallets', pts: 25 },
        { id: 's25', text: 'My Stuff: Ids And Cards', pts: 30 },
        { id: 's26', text: 'HOME: ALL Door Knobs', pts: 100 },
        { id: 's27', text: 'HOME: ALL Light Switches', pts: 100 },
        { id: 's28', text: 'HOME: ALL Faucets', pts: 50 },
        { id: 's29', text: 'HOME: ALL Drawer & Dispenser Handles', pts: 50 },
        { id: 's30', text: 'HOME: Toilet Flush Handles & Frame', pts: 50 },
        { id: 's31', text: 'HOME: Washing Machine Touchpad', pts: 50 },
        { id: 's32', text: 'HOME: Remote Controls', pts: 20 }
    ],
    'Upkeep': [
        { id: 'u1', text: 'Make Bed', pts: 50 },
        { id: 'u2', text: 'Replace Bedsheet', pts: 100 },
        { id: 'u3', text: 'Replace Pillow Cases', pts: 80 },
        { id: 'u4', text: 'Replace Blankets', pts: 50 },
        { id: 'u5', text: 'Replace Towels', pts: 50 },
        { id: 'u6', text: 'Clean My Bedroom Ceiling', pts: 150 },
        { id: 'u7', text: 'Clean My Floor', pts: 200 },
        { id: 'u8', text: 'Wash Dishes', pts: 50 },
        { id: 'u9', text: 'Do The Laundry', pts: 50 },
        { id: 'u10', text: 'Hang The Laundry', pts: 150 },
        { id: 'u11', text: 'Put Down The Laundry', pts: 70 },
        { id: 'u12', text: 'Fold The Fresh Laundry', pts: 250 },
        { id: 'u13', text: 'Wash My Yoga Mat', pts: 100 },
        { id: 'u14', text: 'Clean My Workout Equipment', pts: 250 },
        { id: 'u15', text: 'Take Out The Trash', pts: 50 }
    ]
};

// 3. INITIALIZATION
document.addEventListener('DOMContentLoaded', () => {
    // Setup Date Picker
    const dateInput = document.getElementById('logDate');
    dateInput.value = activeDate;
    
    // Listener for Date Change
    dateInput.addEventListener('change', (e) => {
        if(isRunning || isPaused) {
            alert("Please stop the timer before time traveling.");
            dateInput.value = activeDate; 
            return;
        }
        activeDate = e.target.value;
        switchDateListener(activeDate);
    });

    // Initial Firebase Load
    switchDateListener(activeDate);

    // Attach Controls (Play/Pause Toggle)
    document.querySelector('.timer-controls button:first-child').onclick = toggleTimer;
    document.querySelector('.timer-controls button:last-child').onclick = stopTimer;

    // --- WALLET RECOVERY (Independent of Timer) ---
    const savedWallet = localStorage.getItem('lifehub_wallet');
    if (savedWallet) {
        holdingBalance = parseFloat(savedWallet);
        if (holdingBalance !== 0) {
            document.getElementById('walletPanel').style.display = 'block';
            document.getElementById('holdingDisplay').innerText = holdingBalance.toFixed(2);
        }
    }

    // --- CRASH RECOVERY (Restores Timer State) ---
    const savedTimer = JSON.parse(localStorage.getItem('lifehub_timer'));
    
    if (savedTimer) {
        console.log("♻ Restoring system state...");
        
        // 1. Restore Variables
        activeZone = savedTimer.zone;
        // Note: Wallet is handled separately above
        
        // 2. Restore Active Zone Visuals
        const zones = document.querySelectorAll('.zone-card');
        zones.forEach(c => {
            c.classList.remove('active');
            if(c.querySelector('.zone-name').textContent.trim() === activeZone) {
                c.classList.add('active');
            }
        });

        // 3. Restore Timer State
        if (savedTimer.isPaused) {
            // Restore Paused State
            secondsElapsed = savedTimer.elapsed;
            isPaused = true;
            isRunning = false;
            updateDisplay(secondsElapsed);
            setControlIcon('play_arrow');
            updateTimerLabel(true);
        } else {
            // Restore Running State
            const elapsedSecs = Math.floor((Date.now() - savedTimer.start) / 1000);
            const capSecs = MAX_SESSION_HOURS * 3600;

            // ── THE RUNAWAY TIMER ─────────────────────────────────
            // A tab closed mid-session leaves the start stamp behind,
            // and wall-clock time keeps accruing against it. This used
            // to be restored at face value, so a timer left on
            // overnight would pay for every one of those hours.
            //
            // Over the cap, the session is no longer plausibly work —
            // it is a timer nobody switched off. Ask rather than
            // silently pay or silently bin it.
            if (elapsedSecs > capSecs) {
                const hrs = (elapsedSecs / 3600).toFixed(1);
                const keep = confirm(
                    `A ${activeZone} timer has been running for ${hrs} hours — ` +
                    `since ${new Date(savedTimer.start).toLocaleString()}.\n\n` +
                    `That is longer than a real session, so it looks like it was left on.\n\n` +
                    `OK  — keep it, capped at ${MAX_SESSION_HOURS} hours (paused, so you can stop it to bank that).\n` +
                    `Cancel — discard it entirely.`
                );

                localStorage.removeItem('lifehub_timer');

                if (keep) {
                    secondsElapsed = capSecs;
                    isPaused = true;
                    isRunning = false;
                    updateDisplay(secondsElapsed);
                    setControlIcon('play_arrow');
                    updateTimerLabel(true);
                } else {
                    secondsElapsed = 0;
                    isPaused = false;
                    isRunning = false;
                    updateDisplay(0);
                    setControlIcon('play_arrow');
                }
            } else {
                startTimeStamp = savedTimer.start;
                isRunning = true;
                isPaused = false;
                secondsElapsed = elapsedSecs;

                setControlIcon('pause');
                updateTimerLabel(false);

                // Restart the ticker
                timerInterval = setInterval(() => {
                    const currentNow = Date.now();
                    const diffInSeconds = Math.floor((currentNow - startTimeStamp) / 1000);

                    // The cap applies to a session running live too — a
                    // timer forgotten with the tab open is the same
                    // mistake, just slower.
                    if (diffInSeconds > capSecs) {
                        secondsElapsed = capSecs;
                        updateDisplay(secondsElapsed);
                        clearInterval(timerInterval);
                        pauseTimer();
                        console.warn(`Timer capped at ${MAX_SESSION_HOURS}h and paused.`);
                        return;
                    }

                    secondsElapsed = diffInSeconds;
                    updateDisplay(secondsElapsed);
                    // We don't render meters every second to save performance
                }, 1000);
            }
        }

        // Default to timer view if running
        switchView('timer');
    }

}); // <--- THIS WAS THE MISSING BRACKET THAT CAUSED THE ERRORS

// --- FIREBASE SYNC ENGINE ---

function switchDateListener(dateStr) {
    if (activeListener) db.ref('upkeep_logs/' + activeListener).off();
    
    activeListener = dateStr;
    const logRef = db.ref('upkeep_logs/' + dateStr);

    logRef.on('value', (snapshot) => {
        const data = snapshot.val();
        
        if (data) {
            zoneData = data.zones || { ...DEFAULT_ZONES };
            completedTasks = data.tasks || [];
            dailySessions = data.sessions || []; // LOAD THE LOGS
        } else {
            zoneData = { ...DEFAULT_ZONES };
            completedTasks = [];
            dailySessions = [];
        }

        if (!isRunning) renderMeters(secondsElapsed);
        renderLogs(); // DRAW THE LOGS
        
        if (activeView === 'checklist') {
    const activeBtn = document.querySelector('.mode-btn.active');
    if (activeBtn) {
        // SAM'S FIX: Convert to Uppercase before checking to prevent text-transform bugs
        const modeText = activeBtn.innerText.toUpperCase().includes('SANITATION') ? 'Sanitation' : 'Upkeep';
        loadChecklist(modeText);
    }
}
    });
}

function saveToCloud() {
    db.ref('upkeep_logs/' + activeDate).update({
        zones: zoneData,
        tasks: completedTasks,
        sessions: dailySessions // SAVE THE LOGS
    });
}

// --- INTERFACE SWITCHING ---

window.selectZone = function(card, name) {
    // If we click the zone that is ALREADY running, just go to view.
    if ((isRunning || isPaused) && activeZone === name) {
        switchView('timer');
        return;
    }

    // If we try to click a DIFFERENT zone while running...
    if (isRunning || isPaused) { 
        alert("⚠ Finish your " + activeZone + " session first."); 
        return; 
    }
    
    switchView('timer');
    
    document.querySelectorAll('.zone-card').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    
    card.classList.add('active');
    activeZone = name;
    
    document.getElementById('activeZoneLabel').innerText = "Ready to Clean: " + activeZone;
}

window.selectTaskMode = function(btn, mode) {
    switchView('checklist');

    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    // We do NOT remove active class from zone-cards anymore
    
    btn.classList.add('active');
    loadChecklist(mode);
}

function switchView(viewName) {
    activeView = viewName;
    const timerPanel = document.getElementById('view-timer');
    const checkPanel = document.getElementById('view-checklist');
    const title = document.getElementById('rightPanelTitle');

    if (viewName === 'timer') {
        timerPanel.style.display = 'block';
        checkPanel.style.display = 'none';
        title.innerText = "Home Health";
    } else {
        timerPanel.style.display = 'none';
        checkPanel.style.display = 'block';
    }
}


// --- CHECKLIST ENGINE ---

function loadChecklist(mode) {
    const container = document.getElementById('checklistContainer');
    document.getElementById('rightPanelTitle').innerText = mode + " Protocol";
    
    container.innerHTML = ''; 
    const items = TASKS[mode] || [];

    items.forEach(task => {
        const el = document.createElement('div');
        el.className = 'check-item';
        
        const isDone = completedTasks.includes(task.id);
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
                if (!completedTasks.includes(task.id)) completedTasks.push(task.id);
                updateBank(task.pts, `Task: ${task.text}`); 
            } else {
                completedTasks = completedTasks.filter(id => id !== task.id);
                updateBank(-task.pts, `Correction: ${task.text}`); 
            }
            saveToCloud();
            updateProgress();
        };
        
        container.appendChild(el);
    });
    
    updateProgress();
}

function updateProgress() {
    const allItems = document.querySelectorAll('.check-item');
    const completedItems = document.querySelectorAll('.check-item.completed');
    const total = allItems.length;
    const done = completedItems.length;
    const pct = total === 0 ? 0 : (done / total) * 100;

    document.getElementById('cp-count').innerText = `${done}/${total}`;
    document.getElementById('checklistProgress').style.width = pct + "%";
}


// --- TIMER ENGINE (PAUSABLE) ---

function toggleTimer() {
    if (isRunning) {
        pauseTimer();
    } else {
        startTimer();
    }
}

function startTimer(isResuming = false) {
    if (isRunning) return;
    
    isRunning = true;
    isPaused = false;

    // Switch Icon to PAUSE
    setControlIcon('pause');

    // 1. Calculate new Start Timestamp
    startTimeStamp = Date.now() - (secondsElapsed * 1000);

    // 2. Save Active State
    localStorage.setItem('lifehub_timer', JSON.stringify({
        zone: activeZone,
        start: startTimeStamp,
        isPaused: false,
        holdingBalance: holdingBalance
    }));
    
    updateTimerLabel(false);
    
    // 3. Start Interval
    timerInterval = setInterval(() => {
        const now = Date.now();
        const diffInSeconds = Math.floor((now - startTimeStamp) / 1000);

        // Same cap as the crash-recovery path: a timer left running is
        // not a session, however it got that way.
        if (diffInSeconds > MAX_SESSION_HOURS * 3600) {
            secondsElapsed = MAX_SESSION_HOURS * 3600;
            updateDisplay(secondsElapsed);
            renderMeters(secondsElapsed);
            clearInterval(timerInterval);
            pauseTimer();
            console.warn(`Timer capped at ${MAX_SESSION_HOURS}h and paused.`);
            return;
        }

        secondsElapsed = diffInSeconds;
        updateDisplay(secondsElapsed);
        renderMeters(secondsElapsed);
    }, 1000);
}

function pauseTimer() {
    if (!isRunning) return;
    
    clearInterval(timerInterval);
    isRunning = false;
    isPaused = true;
    
    // Switch Icon to PLAY
    setControlIcon('play_arrow');
    
    // Save Paused State
    localStorage.setItem('lifehub_timer', JSON.stringify({
        zone: activeZone,
        elapsed: secondsElapsed, 
        isPaused: true,
        holdingBalance: holdingBalance
    }));
    
    updateTimerLabel(true);
}

function stopTimer() {
    if (!isRunning && !isPaused) return; 
    
    clearInterval(timerInterval);
    isRunning = false;
    isPaused = false;
    
    // Reset Icon
    setControlIcon('play_arrow');
    
    // 1. Calculate Stats
    const earnedHrs = secondsElapsed / 3600; 
    const earnedMins = secondsElapsed / 60;
    
    // 2. Clear Timer Persistence (But NOT Wallet)
    localStorage.removeItem('lifehub_timer');
    
    // 3. Save Data
    zoneData[activeZone] += earnedHrs;
    
    // 4. Payroll & Logging
    if (earnedMins >= MINIMUM_SESSION_MINUTES) {
        const rate = ROOM_RATES[activeZone] || 20;
        const payout = Math.round(earnedMins * rate);
        
        updateBank(payout, `${activeZone} Session`);
        alert(`Session Complete: ${activeZone}\nTime: ${earnedMins.toFixed(0)} min\nRate: ${rate}/min\n\nPayout: +${payout} Pts`);
        
        // CREATE THE LOG ENTRY
        const newLog = {
            id: Date.now(), 
            zone: activeZone,
            minutes: earnedMins,
            payout: payout,
            timestamp: Date.now()
        };
        
        // Add to our list (newest first)
        if (!dailySessions) dailySessions = [];
        dailySessions.unshift(newLog);
        
    } else {
        console.log("Session too short for payroll.");
    }

    // Save everything to Cloud
    saveToCloud();

    // 5. Reset UI. Guarded: this ran after saveToCloud(), so a missing
    // active card threw here and left the timer visually stuck mid-run
    // even though the session had already been banked.
    const activeCard = document.querySelector('.zone-card.active');
    if (activeCard) activeCard.classList.remove('recording');
    document.getElementById('activeZoneLabel').innerText = "Ready to Clean: " + activeZone;
    document.getElementById('activeZoneLabel').style.color = "";
    
    secondsElapsed = 0;
    document.querySelector('.timer-digits').innerText = "00:00:00";
    renderMeters(0);
}

// --- DISPLAY HELPERS ---

function renderLogs() {
    const container = document.querySelector('.log-container');
    container.innerHTML = '<h3>Today\'s Upkeep</h3><br>'; 

    if (!dailySessions || dailySessions.length === 0) {
        container.innerHTML += '<div style="opacity:0.5; font-size:11px;">No sessions recorded today.</div>';
        return;
    }

    dailySessions.forEach(session => {
        const item = document.createElement('div');
        item.className = 'log-item';
        
        const dateObj = new Date(session.timestamp);
        const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        const isPositive = session.payout >= 0;
        const sign = isPositive ? "+" : "";
        const ptsDisplay = `${sign}${session.payout}`;

        item.innerHTML = `
            <div class="log-left">
                <div>${session.zone} Cleaning</div>
                <div class="log-meta">${timeStr} • ${session.minutes.toFixed(0)} mins</div>
            </div>
            <div class="log-right">
                <span style="font-weight:600; color:${isPositive ? 'var(--color-sage-dark)' : '#d9534f'}">${ptsDisplay}</span>
                ${isPositive ? `<button class="log-adjust-btn" onclick="adjustLogTime(${session.id})" title="Deduct Time">-</button>` : ''}
            </div>
        `;
        container.appendChild(item);
    });
}

function updateDisplay(secs) {
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    document.querySelector('.timer-digits').innerText = 
        `${hrs.toString().padStart(2,'0')}:${mins.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

function updateTimerLabel(paused) {
    const label = document.getElementById('activeZoneLabel');
    const card = document.querySelector('.zone-card.active');
    
    if (paused) {
        label.innerText = `PAUSED: ${activeZone.toUpperCase()}`;
        label.style.color = "#D4AF37"; 
        if(card) card.classList.remove('recording'); 
    } else {
        label.innerText = `CLEANING: ${activeZone.toUpperCase()}`;
        label.style.color = "#5A6B5D"; 
        if(card) card.classList.add('recording'); 
    }
}

function renderMeters(pendingSeconds = 0) {
    let highestValue = 0;
    
    // 1. Calculate totals first to find the max (for the bar width)
    for (const [zone, val] of Object.entries(zoneData)) {
        let total = val;
        if (zone === activeZone && pendingSeconds > 0) total += (pendingSeconds / 3600);
        if (total > highestValue) highestValue = total;
    }

    const denominator = highestValue > 0 ? highestValue : (1/60);

    // 2. Render each card
    document.querySelectorAll('.zone-card').forEach(card => {
        const name = card.querySelector('.zone-name').textContent.trim(); 
        let bankedHrs = zoneData[name] || 0;
        
        // Add current running time if this is the active zone
        if (name === activeZone && pendingSeconds > 0) bankedHrs += (pendingSeconds / 3600);
        
        // A. Calculate Bar Percentage
        const pct = (bankedHrs / denominator) * 100;
        
        // B. Calculate Human Time (Hrs & Mins)
        const totalMinutes = Math.floor(bankedHrs * 60);
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        
        let timeString = `${m} min`;
        if (h > 0) timeString = `${h} hr ${m} min`;
        if (totalMinutes === 0 && bankedHrs > 0) timeString = "< 1 min"; // For tiny amounts
        if (bankedHrs === 0) timeString = "--"; // Empty state

        // C. Update Text
        const statRow = card.querySelector('.stat-row');
        if(statRow) {
           statRow.innerHTML = `<span>Focus</span><span>${timeString}</span>`;
        }

        // D. Update Bar
        const fill = card.querySelector('.meter-fill');
        if(fill) {
            fill.style.width = pct + "%";
            if (highestValue > 0 && Math.abs(bankedHrs - highestValue) < 0.0001) fill.classList.add('capped'); 
            else fill.classList.remove('capped');
        }
    });
}

// --- MONEY & CORRECTION LOGIC ---

function updateBank(amount, description) {
    if (amount === 0) return;
    
    holdingBalance += amount;
    
    // Update UI
    const walletPanel = document.getElementById('walletPanel');
    const display = document.getElementById('holdingDisplay');
    
    if (walletPanel) walletPanel.style.display = 'block';
    if (display) display.innerText = holdingBalance.toFixed(2);
    
    console.log(`Wallet Staging: ${amount} pts added.`);

    // SAVE TO INDEPENDENT WALLET STORAGE
    localStorage.setItem('lifehub_wallet', holdingBalance);

    // Sync with timer if running (redundancy)
    const currentTimer = JSON.parse(localStorage.getItem('lifehub_timer'));
    if (currentTimer) {
         localStorage.setItem('lifehub_timer', JSON.stringify({
             ...currentTimer,
             holdingBalance: holdingBalance
         }));
    }
}


window.depositHolding = function() {
    if (holdingBalance === 0) return;

    // 1. Database References
    const balanceRef = db.ref('prestige_system/balance');
    const txRef = db.ref('prestige_system/transactions');

    // 2. Prepare Data (Force number type to prevent text errors)
    const amountToDeposit = Number(holdingBalance);

    /* The row is built by JS/lifehub-prestige-ledger.js — the same
       builder every other tracker and Poppy use.

       This assembled its own, which worked, but left a negative
       deposit unclassified: the ledger's rank rule only lets a
       negative row lower her rank if it is marked as a correction or
       a penalty, and a hand-written row is neither. Unticking more
       than you ticked in a session therefore took points out of the
       balance while leaving the rank untouched. reversal() marks it. */
    const P = window.LIFEHUB_PRESTIGE;
    if (!P) {
        console.error("[home-upkeep] lifehub-prestige-ledger.js isn't loaded — not banking.");
        return;
    }

    const stamp = firebase.database.ServerValue.TIMESTAMP;
    const newTx = amountToDeposit < 0
        ? P.reversal(Math.abs(amountToDeposit),
                     "Home Upkeep Session Correction", "HOME UPKEEP", stamp)
        : P.row(amountToDeposit,
                "Home Upkeep Session Deposit", "HOME UPKEEP", stamp);

    // 3. Execute Updates
    // Update Balance (Safe Transaction)
    balanceRef.transaction((current) => {
        return (Number(current) || 0) + amountToDeposit;
    }, (error, committed, snapshot) => {
        if (error) {
            console.error("Deposit failed:", error);
            alert("System Error: Could not connect to Bank.");
        }
    });

    // Log Transaction (This automatically updates your Net Worth in the Bank)
    txRef.push(newTx);

    alert(`Cha-ching! +${amountToDeposit.toFixed(0)} Points deposited to Bank.`);

    // 4. Reset Local Wallet
    resetWallet();
}
window.adjustLogTime = function(sessionId) {
    // 1. Find the session in our memory
    const sessionIndex = dailySessions.findIndex(s => s.id === sessionId);
    if (sessionIndex === -1) return;
    
    const session = dailySessions[sessionIndex];
    const rate = ROOM_RATES[session.zone] || 20;

    // 2. Ask user for input
    const input = prompt(`Adjusting: ${session.zone}\nRecorded: ${session.minutes.toFixed(0)} mins\n\nHow many MINUTES to REMOVE?`);
    const deductMins = parseFloat(input);

    if (!deductMins || deductMins <= 0) return;
    if (deductMins > session.minutes) {
        alert("You cannot deduct more time than the session has!");
        return;
    }

    // 3. Calculate Math
    const deductPts = Math.round(deductMins * rate);

    // 4. Update the Wallet (REAL MONEY)
    updateBank(-deductPts, `Correction: ${session.zone} -${deductMins}m`);

    // 5. Update the Log (VISUAL RECORD)
    session.minutes -= deductMins;
    session.payout -= deductPts;
    
    // 6. Save and Render
    saveToCloud(); 
    // renderLogs happens automatically via the listener
}

// Helper to clear the UI
function resetWallet() {
    holdingBalance = 0;
    
    // 1. Wipe the specific wallet storage
    localStorage.removeItem('lifehub_wallet');

    // 2. Update UI
    const walletPanel = document.getElementById('walletPanel');
    const display = document.getElementById('holdingDisplay');
    
    if (display) display.innerText = "0.00";
    if (walletPanel) walletPanel.style.display = 'none';
}

// ==========================================
// 🚀 ALEXA REAL-TIME LISTENER (APPENDED)
// ==========================================
const alexaRef = db.ref('alexa_updates');

// alexa_updates is ONE shared mailbox for every tracker, and commands sit
// there until something clears them.
const UPKEEP_ACTIONS = ['set_zone', 'start_timer', 'pause_timer', 'stop_timer', 'check_tasks'];
const UPKEEP_MAX_AGE_MS = 10 * 60 * 1000;   // 10 minutes
const UPKEEP_SEEN_KEY = 'upkeep_last_alexa_ts';

function upkeepAlreadyHandled(ts) {
    try { return ts && Number(localStorage.getItem(UPKEEP_SEEN_KEY)) >= ts; }
    catch (e) { return false; }
}
function upkeepMarkHandled(ts) {
    try { if (ts) localStorage.setItem(UPKEEP_SEEN_KEY, String(ts)); }
    catch (e) { /* private mode — the age check still applies */ }
}

alexaRef.on('value', (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    // ── ONLY THIS TRACKER'S POST ──────────────────────────────────
    // Everything below used to run for ANY command, and the cleanup at
    // the bottom then emptied the mailbox — so with this page open, a
    // water or sleep command was deleted 2.5 seconds after it arrived,
    // before the tracker it was addressed to ever saw it.
    if (UPKEEP_ACTIONS.indexOf(data.action) === -1) return;

    // Without this, opening the page replayed whatever was sitting in
    // the mailbox — including start_timer, which would quietly start a
    // session Jen never asked for.
    const upkeepTs = Number(data.timestamp) || 0;
    if (upkeepTs && Date.now() - upkeepTs > UPKEEP_MAX_AGE_MS) {
        console.log("⌛ Ignoring stale upkeep command from", new Date(upkeepTs).toLocaleString());
        return;
    }
    if (upkeepAlreadyHandled(upkeepTs)) return;
    upkeepMarkHandled(upkeepTs);

    console.log("⚡ Alexa Command:", data);

    // 1. SET ZONE
    if (data.action === 'set_zone' && data.zone) {
        const cards = document.querySelectorAll('.zone-card');
        cards.forEach(card => {
            if (card.querySelector('.zone-name').textContent.trim() === data.zone) {
                // Call your existing global function
                window.selectZone(card, data.zone);
            }
        });
    }

    // 2. TIMER CONTROLS
    if (data.action === 'start_timer' && !isRunning) startTimer();
    if (data.action === 'pause_timer' && isRunning) pauseTimer();
    if (data.action === 'stop_timer' && (isRunning || isPaused)) stopTimer();

    // 3. BULK TASK CHECKER
    if (data.action === 'check_tasks' && data.taskIds) {
        // Force view to checklist if not already there
        const activeBtn = document.querySelector('.mode-btn.active');
        if (!activeBtn) {
            const firstBtn = document.querySelectorAll('.mode-btn')[0]; 
            if(firstBtn) window.selectTaskMode(firstBtn, 'Sanitation');
        }

        setTimeout(() => {
            const spoken = [];

            data.taskIds.forEach(id => {
                // Check if already done to avoid duplicates
                if (!completedTasks.includes(id)) {
                    // Search both lists for the ID
                    const item = (TASKS['Sanitation'].concat(TASKS['Upkeep'])).find(t => t.id === id);
                    if (item) {
                        completedTasks.push(id);
                        spoken.push(id);
                        // Add money using your bank function
                        updateBank(item.pts, `Alexa: ${item.text}`);
                    }
                }
            });

            /* Write onto TODAY, not onto whatever date the page is
               showing. saveToCloud() writes upkeep_logs/activeDate —
               so leaving the tracker open on last Tuesday and saying
               "Alexa, I did the dishes" filed it under last Tuesday.
               Alexa is always talking about now.

               A transaction rather than a set, because the page may
               have changed the same list a moment ago and
               last-write-wins on an array loses entries. */
            if (spoken.length) {
                const todayKey = phToday();
                db.ref('upkeep_logs/' + todayKey + '/tasks').transaction((current) => {
                    const list = Array.isArray(current) ? current.slice() : [];
                    spoken.forEach(id => { if (list.indexOf(id) === -1) list.push(id); });
                    return list;
                });
            }

            // Anything else changed on the page still saves normally.
            saveToCloud();

            // Refresh UI. The guard above tries to select a mode when
            // none is active, but this line assumed it succeeded — a
            // TypeError here killed the whole task-check.
            const modeBtn = document.querySelector('.mode-btn.active');
            const currentMode = (modeBtn && modeBtn.innerText.includes('Sanitation'))
                ? 'Sanitation' : 'Upkeep';
            loadChecklist(currentMode);
        }, 500);
    }

    // CLEANUP. Safe now: only reached for this tracker's own actions,
    // so it can no longer throw away another tracker's post.
    setTimeout(() => {
        alexaRef.set(null).catch(err =>
            console.warn("Couldn't clear the Alexa command:", err));
    }, 2500);
});