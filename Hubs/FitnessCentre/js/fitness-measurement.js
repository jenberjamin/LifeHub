/* js/fitness-measurement.js */

// --- CONFIGURATION ---
const CHART_LIMIT = 7; // Keep chart clean (Last 7 entries)
const bodyParts = [
    "Weight", "Shoulders", "Chest", "Left Bicep", "Right Bicep", 
    "Left Forearm", "Right Forearm", "Upper Abs", "Waist", "Lower Abs", 
    "Hips", "Left Thigh", "Right Thigh", "Left Calf", "Right Calf"
];

// --- STATE MANAGEMENT ---
let activeCategory = 'Weight'; 
let myChart;

// --- INITIALIZATION ---
window.onload = function() {
    // 1. Safety Check: Core Data
    // Only fires if fitness-core.js genuinely failed to load. It used to
    // seed a fake { date: "Init" } row, which never helped: the real
    // problem was an EMPTY history, not a missing one, and core always
    // defines historyLogs. An empty list is handled properly now by
    // getCurrentLog(), so this just needs to keep the names resolvable.
    if (typeof historyLogs === 'undefined') {
        console.warn("❖ Core Missing. Running with empty local structures.");
        window.historyLogs = [];
        window.goals = {};
    }

    // 2. Launch Visuals
    initChart();
    renderGrid();
    updateHeaderStats();
};

// --- DATA HELPERS ---
/* A device with no measurements yet is a normal state, not a failure.
   These returned undefined for an empty history, and updateHeaderStats()
   and renderHistory() both read .data straight off the result — so the
   page threw during window.onload and rendered nothing at all. (renderGrid
   had already been patched for this; the other two never were.)
   Frozen so a caller cannot quietly write into the shared blank. */
const EMPTY_LOG = Object.freeze({ date: null, data: Object.freeze({}) });

function getCurrentLog() { return historyLogs[historyLogs.length - 1] || EMPTY_LOG; }
function getPreviousLog() { return historyLogs.length > 1 ? historyLogs[historyLogs.length - 2] : getCurrentLog(); }

function getTimeAgo(dateString) {
    if (!dateString || dateString === "Init") return "SYSTEM STATUS: READY";
    const date = new Date(dateString);
    const now = new Date();
    if (isNaN(date.getTime())) return "SYSTEM STATUS: STANDBY";

    const seconds = Math.round((now - date) / 1000);
    const minutes = Math.round(seconds / 60);
    const hours = Math.round(minutes / 60);
    const days = Math.round(hours / 24);

    if (seconds < 60) return `UPDATED: JUST NOW`;
    else if (minutes < 60) return `UPDATED: ${minutes} MIN AGO`;
    else if (hours < 24) return `UPDATED: ${hours} HR AGO`;
    else return `UPDATED: ${days} DAY${days > 1 ? 'S' : ''} AGO`;
}

/* Short label for when a measurement was taken. "TODAY" matters most —
   it is the difference between a number she just logged and one carried
   on screen from three weeks ago, which is exactly what the old
   carry-forward behaviour made impossible to tell apart. */
function measuredWhen(dateString) {
    if (!dateString) return '';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '';

    const today = new Date();
    const dayDiff = Math.round(
        (new Date(today.getFullYear(), today.getMonth(), today.getDate()) -
         new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);

    if (dayDiff <= 0) return 'TODAY';
    if (dayDiff === 1) return 'YESTERDAY';
    if (dayDiff < 7)   return `${dayDiff} DAYS AGO`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
}

// --- RENDER GRID ---
function renderGrid() {
    const container = document.getElementById('mGrid');
    if (!container) return;
    container.innerHTML = '';
    
    bodyParts.forEach(part => {
        if(part === "Weight") return;

        // Entries are sparse, so the newest row often will not mention this
        // part at all. Walk back to the last one that actually recorded it,
        // then back again for the measurement before that.
        const latest = getLatestMeasurement(part);
        const prev   = latest ? getLatestMeasurement(part, latest.index - 1) : null;
        const goal   = goals[part];

        let arrowHtml = '<span class="material-symbols-outlined arrow-icon neutral">horizontal_rule</span>';
        // Needs a real earlier measurement to compare against. The old test
        // used 0 when there was none, so the very first entry always showed
        // an improvement arrow against nothing.
        if (goal && latest && prev) {
            const distCurrent = Math.abs(goal - latest.value);
            const distPrev    = Math.abs(goal - prev.value);

            if (distCurrent < distPrev) arrowHtml = '<span class="material-symbols-outlined arrow-icon up-good">arrow_upward</span>';
            else if (distCurrent > distPrev) arrowHtml = '<span class="material-symbols-outlined arrow-icon down-bad">arrow_downward</span>';
        }

        const valText  = latest ? `${latest.value} <span style="font-size:12px; color:#666">cm</span>` : '--';
        const dateText = latest ? measuredWhen(latest.date) : 'NOT YET MEASURED';

        const activeClass = activeCategory === part ? 'active' : '';
        container.innerHTML += `
            <div class="m-card ${activeClass}" onclick="switchChart('${part}')">
                <div class="m-label-group">
                    <div class="m-name">${part}</div>
                    <div class="m-date">${dateText}</div>
                </div>
                <div class="m-data">
                    <span class="m-num">${valText}</span>
                    ${arrowHtml}
                </div>
            </div>`;
    });
}

// --- CHART SYSTEM ---
function initChart() {
    const ctx = document.getElementById('mainChart').getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(0, 229, 255, 0.2)'); 
    gradient.addColorStop(1, 'rgba(0, 229, 255, 0.0)');

    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [], 
            datasets: [
                {
                    label: 'Progress',
                    data: [],
                    borderColor: '#00e5ff', // Cyan
                    borderWidth: 2,
                    backgroundColor: gradient,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#000',
                    pointBorderColor: '#00e5ff'
                },
                {
                    label: 'Goal',
                    data: [], 
                    borderColor: '#FFD700', // Gold
                    borderWidth: 1,
                    borderDash: [5, 5], 
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { 
                y: { display: false }, 
                x: { 
                    grid: { color: 'rgba(255,255,255,0.05)' }, 
                    ticks: { color: '#666', font: {family: 'Red Hat Display'} } 
                } 
            }
        }
    });
    switchChart('Weight'); // Load initial data
}

function switchChart(part) {
    activeCategory = part;
    document.getElementById('chartTitle').innerText = part.toUpperCase() + " MONITOR";
    const g = goals[part];
    document.getElementById('chartGoalLabel').innerText = g ? `GOAL: ${g}` : "GOAL: --";

    // Only entries that actually recorded THIS part. Taking the last N
    // entries regardless and reading `log.data[part] || 0` turned every
    // unmeasured day into a zero, which collapsed the line to the floor
    // and made the axis meaningless.
    const partLogs = historyLogs.filter(log => {
        const raw = (log && log.data) ? log.data[part] : undefined;
        return raw !== undefined && raw !== null && raw !== '' && !isNaN(parseFloat(raw));
    });

    const slicedLogs = partLogs.slice(-CHART_LIMIT);

    // Clean Date Labels
    const labels = slicedLogs.map(log => {
        const d = new Date(log.date);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
    });

    const data = slicedLogs.map(log => parseFloat(log.data[part]));

    myChart.data.labels = labels;
    myChart.data.datasets[0].data = data;
    myChart.data.datasets[1].data = Array(labels.length).fill(g || null);
    myChart.update();

    renderGrid(); 
    updateHeaderStats();
}

function updateHeaderStats() {
    const currentLog = getCurrentLog();
    // Her latest weight, not "the weight on the newest row" — a record that
    // only logged a waist measurement no longer blanks the header.
    const latestWeight = getLatestMeasurement("Weight");
    const w = latestWeight ? latestWeight.value : 0;

    // "--" rather than a hard 0, which reads like a logged weight of zero.
    document.getElementById('weightDisplay').innerText = w > 0 ? w : "--";

    // Height and BMI both come from core now, so this page, the gallery and
    // the lobby HUD can no longer disagree about how tall she is.
    document.getElementById('heightDisplay').innerText = getHeightCm();
    document.getElementById('bmiDisplay').innerText = calculateBMI(w);

    document.getElementById('lastUpdateTxt').innerText = getTimeAgo(currentLog.date);
}

function updateHeight() {
    const newHeight = prompt("Enter your height in cm:", getHeightCm());
    if (newHeight === null) return;                 // cancelled, leave it alone

    // The old check was `newHeight && !isNaN(newHeight)`, which accepted 0
    // (BMI then read "--" forever with no clue why), negatives, and 5000.
    const h = parseFloat(String(newHeight).trim());
    if (!(h >= 80 && h <= 250)) {
        alert("Please enter a height in centimetres, between 80 and 250.");
        return;
    }

    if (typeof UserProfile === 'undefined') return;
    UserProfile.height = h;
    saveSystemData();
    updateHeaderStats();
}

// --- DYNAMIC MODALS ---
function openDynamicModal(type) {
    const modal = document.getElementById('dynamicModal');
    const title = document.getElementById('modalTitle');
    const container = document.getElementById('modalFormContainer');
    const btn = document.getElementById('modalActionBtn');
    
    container.innerHTML = ''; 

    if (type === 'goal') {
        title.innerText = "SET TARGETS";
        title.style.color = "#FFD700";
        btn.innerText = "SAVE TARGETS";
        btn.style.background = "#FFD700"; 
        btn.style.color = "#000";
        btn.onclick = function() { saveBatch('goal'); };
        
        bodyParts.forEach(part => {
            const currentGoal = goals[part] || '';
            container.innerHTML += `
                <div class="input-group">
                    <label>${part}</label>
                    <input type="number" id="input_${part}" class="input-field" value="${currentGoal}" placeholder="--">
                </div>`;
        });
    } else {
        title.innerText = "NEW RECORD";
        title.style.color = "#00e5ff";
        btn.innerText = "UPDATE SYSTEM";
        btn.style.background = "#00e5ff"; 
        btn.style.color = "#000";
        btn.onclick = function() { saveBatch('record'); };

        bodyParts.forEach(part => {
            container.innerHTML += `
                <div class="input-group">
                    <label>${part}</label>
                    <input type="number" id="input_${part}" class="input-field" placeholder="Optional">
                </div>`;
        });
    }
    modal.classList.add('open');
}

function saveBatch(type) {
    if (type === 'record') {
        // ONLY what she typed. This used to seed the new entry with
        // { ...previousData }, so logging a weight silently copied last
        // week's waist and hips in beside it — and they then showed in the
        // grid as today's numbers, flattened the trend arrow against
        // themselves, and drew a chart line implying a measurement that
        // never happened. A gap in the record is now a gap.
        const newEntry = {
            date: new Date().toISOString(),
            data: {}
        };

        let hasUpdate = false;

        bodyParts.forEach(part => {
            const el = document.getElementById(`input_${part}`);
            if (el && el.value) { 
                newEntry.data[part] = parseFloat(el.value);
                hasUpdate = true;
            }
        });

        if(hasUpdate) {
            historyLogs.push(newEntry);
            saveSystemData(); // Core function
            updateHeaderStats(); 
            
            // Clear inputs
            bodyParts.forEach(part => {
                const el = document.getElementById(`input_${part}`);
                if(el) el.value = "";
            });
        }
    } else {
        // Goal Saving Logic
        // A blank field now CLEARS the target. The old test was
        // `if (el && el.value)`, so an emptied box was simply skipped and
        // the previous goal survived — there was no way to drop a target
        // once set, short of editing localStorage.
        bodyParts.forEach(part => {
            const el = document.getElementById(`input_${part}`);
            if (!el) return;

            const raw = String(el.value).trim();
            if (raw === '') { delete goals[part]; return; }

            const n = parseFloat(raw);
            if (!isNaN(n) && n > 0) goals[part] = n;
        });
        saveSystemData(); // Core function
    }
    
    closeModal('dynamicModal');
    switchChart(activeCategory);
}

function closeModal(id) { 
    document.getElementById(id).classList.remove('open'); 
}

// --- COMPARE MODAL ---
function openCompareModal() {
    const select = document.getElementById('compareDateSelect');
    select.innerHTML = '';
    
    // Add all past dates
    historyLogs.slice(0, -1).forEach((log, index) => {
        const d = new Date(log.date);
        const niceDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year:'2-digit' });
        
        const option = document.createElement('option');
        option.value = index;
        option.text = niceDate;
        select.appendChild(option);
    });
    
    select.selectedIndex = select.options.length - 1;
    renderHistory();
    document.getElementById('historyModal').classList.add('open');
}

function renderHistory() {
    const container = document.getElementById('historyContent');
    container.innerHTML = '';
    
    const selectedIndex = document.getElementById('compareDateSelect').value;
    if(!historyLogs[selectedIndex]) {
        // Nothing to compare against yet — say so instead of leaving the
        // modal blank with whatever was drawn there last time.
        container.innerHTML = `<div style="text-align:center; color:#666; padding:30px 10px; font-size:12px; letter-spacing:1px;">
            NEEDS TWO RECORDS TO COMPARE.<br>LOG ANOTHER TO SEE YOUR PROGRESS.</div>`;
        return;
    }

    let rows = 0;

    bodyParts.forEach(part => {
        // Both sides are "the last reading at or before this point", because
        // no single entry holds every part any more. Reading the two rows
        // directly would compare blanks against blanks.
        const oldM  = getLatestMeasurement(part, Number(selectedIndex));
        const currM = getLatestMeasurement(part);

        // Never measured on one side or the other — nothing honest to show.
        if (!oldM || !currM) return;
        rows++;

        const diff = currM.value - oldM.value;
        const shown = diff.toFixed(1);

        let colorClass = "diff-val";
        if (diff < 0) colorClass += " diff-green"; // Loss is usually good (except muscle, but general rule)
        if (diff > 0) colorClass += " diff-red";

        container.innerHTML += `
            <div class="history-row">
                <span style="color:#888; font-size:12px; text-transform:uppercase">${part}</span>
                <span style="color:#ccc">${oldM.value} → ${currM.value}</span>
                <span class="${colorClass}">${diff > 0 ? '+' : ''}${shown}</span>
            </div>`;
    });

    if (rows === 0) {
        container.innerHTML = `<div style="text-align:center; color:#666; padding:30px 10px; font-size:12px; letter-spacing:1px;">
            NO OVERLAPPING MEASUREMENTS TO COMPARE.</div>`;
    }
}

/* --- LIVE VAULT ---
   Held back while either modal is open. The record form is a column of
   numbers she is part-way through typing, and switchChart() rebuilds the
   grid underneath it. */
if (window.LIFEHUB_FITNESS) {
    window.LIFEHUB_FITNESS.onChange(function () {
        const dyn  = document.getElementById('dynamicModal');
        const hist = document.getElementById('historyModal');
        if (dyn && dyn.classList.contains('open')) return;
        if (hist && hist.classList.contains('open')) return;

        switchChart(activeCategory);   // redraws the chart, grid and header
    });
}