// js/food-statistics.js - COMPLETE REWRITE

// Shared with the tracker and the history page — see
// JS/lifehub-food-rules.js, which this page loads first.
if (!window.LIFEHUB_FOOD) {
    console.error("🍽️ JS/lifehub-food-rules.js must load before food-statistics.js.");
}
const DAILY_GOALS = window.LIFEHUB_FOOD.DAILY_GOALS;

const COLORS = {
    gold: '#f8ae17',
    green: '#174532',
    sage: '#7da177',
    red: '#E57373',

    // Days with nothing logged. Deliberately colourless — an untracked
    // day is an absence of information, not a bad day, and it should
    // not read as one at a glance.
    silver: '#cfd2d4'
};

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

// STATE
let viewState = {
    year: new Date().getFullYear(),
    month: new Date().getMonth()
};

let allLogs = {};
let charts = {};

// INITIALIZATION
document.addEventListener('DOMContentLoaded', () => {
    console.log("📊 Food Statistics Loaded");
    initCharts();
    setupRealtimeListener();
    updateDisplay();
});

// REAL-TIME LISTENER
function setupRealtimeListener() {
    database.ref('dailyLogs').on('value', snapshot => {
        console.log("📡 Firebase Update Received");
        allLogs = snapshot.val() || {};
        calculateAndRender();
    });
}

// MONTH NAVIGATION - FIXED!
window.changeMonth = function(direction) {
    console.log(`📅 Changing month: ${direction > 0 ? 'Next' : 'Previous'}`);
    
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
    calculateAndRender();
}

function updateDisplay() {
    const monthNames = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", 
                        "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
    const displayText = `${monthNames[viewState.month]} ${viewState.year}`;
    document.getElementById('monthDisplay').innerText = displayText;
    console.log(`📆 Display: ${displayText}`);
}

// ── WHICH DAYS THE MONTH ACTUALLY HAS ───────────────────────────────
// Every day up to and including today, not just the ones with a node
// in Firebase.
//
// The charts used to be built from Object.keys(allLogs), so a day she
// never logged simply wasn't in the month — a month tracked twice, both
// times well, read 100%. That is a chart about the days she remembered,
// not about the month.
//
// Days in the FUTURE are excluded: a month she is three days into has
// twenty-seven days that are not untracked, they just haven't happened.
function daysToGrade() {
    const now = new Date();
    const isThisMonth = viewState.year === now.getFullYear() &&
                        viewState.month === now.getMonth();

    const lastDay = isThisMonth
        ? now.getDate()
        : new Date(viewState.year, viewState.month + 1, 0).getDate();

    // A month entirely in the future has nothing to say.
    const started = new Date(viewState.year, viewState.month, 1) <= now;
    if (!started) return [];

    const keys = [];
    for (let d = 1; d <= lastDay; d++) {
        keys.push(viewState.year + '-' +
                  String(viewState.month + 1).padStart(2, '0') + '-' +
                  String(d).padStart(2, '0'));
    }
    return keys;
}

// A day counts as tracked only if something was actually eaten on it.
// A node holding nothing but the wageProcessed flag is not a day she
// logged — and it used to grade as a day of zero calories, which is a
// failing day rather than an absent one.
function wasTracked(dayLogs) {
    if (!dayLogs) return false;
    return Object.keys(dayLogs).some(k =>
        k !== 'wageProcessed' && dayLogs[k] && dayLogs[k].foodName);
}

// CALCULATE AND RENDER
function calculateAndRender() {
    const monthlyDates = daysToGrade();

    console.log(`📊 Analyzing ${monthlyDates.length} days for ${viewState.month + 1}/${viewState.year}`);

    // Initialize stats
    const stats = {
        cal:  { gold: 0, green: 0, sage: 0, red: 0, stale: 0, totalDays: 0 },
        prot: { gold: 0, green: 0, sage: 0, red: 0, stale: 0, totalDays: 0 },
        carb: { gold: 0, green: 0, sage: 0, red: 0, stale: 0, totalDays: 0 },
        fat:  { gold: 0, green: 0, sage: 0, red: 0, stale: 0, totalDays: 0 },
        sugar: { safe: 0, warning: 0, danger: 0, stale: 0, totalDays: 0 }
    };

    // Process each day
    monthlyDates.forEach(dateStr => {
        const dayLogs = allLogs[dateStr];

        if (!wasTracked(dayLogs)) {
            ['cal', 'prot', 'carb', 'fat', 'sugar'].forEach(t => {
                stats[t].stale++;
                stats[t].totalDays++;
            });
            return;
        }

        const totals = calculateDailyTotals(dayLogs);

        categorizeDay('cal', totals.cal, stats.cal);
        categorizeDay('prot', totals.prot, stats.prot);
        categorizeDay('carb', totals.carb, stats.carb);
        categorizeDay('fat', totals.fat, stats.fat);
        categorizeSugar(totals.sugar, stats.sugar);
    });

    // Update all charts
    updateChart('cal', stats.cal);
    updateChart('prot', stats.prot);
    updateChart('carb', stats.carb);
    updateChart('fat', stats.fat);
    updateSugarChart(stats.sugar);
}

// One shared reader — same as the tracker and the history page. Was a
// third hand-written copy that called JSON.parse() straight on
// log.macros and looked for sugar in one place only.
function calculateDailyTotals(dayLogs) {
    return window.LIFEHUB_FOOD.totalsFor(dayLogs);
}

function categorizeDay(type, value, statObj) {
    statObj.totalDays++;
    const goals = DAILY_GOALS[type];
    const percentage = (value / goals.ult) * 100;

    if (type === 'fat' && percentage > 100) {
        statObj.red++;
    } else if (percentage >= 90) {
        statObj.gold++;
    } else if (percentage >= 80) {
        statObj.green++;
    } else {
        statObj.sage++;
    }
}

// Sugar categorization (different - it's a LIMIT not a goal)
function categorizeSugar(value, statObj) {
    statObj.totalDays++;
    const limit = DAILY_GOALS.sugar.limit;
    
    if (value >= limit) {
        statObj.danger++; // Over 60g = RED ALERT
    } else if (value >= limit * 0.8) {
        statObj.warning++; // 48-60g = Warning
    } else {
        statObj.safe++; // Under 48g = Safe
    }
}

// CHART INITIALIZATION
function initCharts() {
    ['cal', 'prot', 'carb', 'fat'].forEach(type => {
        const canvasId = `chart${capitalize(type)}`;
        const canvas = document.getElementById(canvasId);
        
        if (!canvas) {
            console.error(`❌ Canvas not found: ${canvasId}`);
            return;
        }
        
        const ctx = canvas.getContext('2d');
        
        charts[type] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Gold', 'Green', 'Average', 'Over Limit', 'Not tracked'],
                datasets: [{
                    data: [0, 0, 0, 0, 1],
                    backgroundColor: [COLORS.gold, COLORS.green, COLORS.sage,
                                      COLORS.red, COLORS.silver],
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                cutout: '65%',
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: true }
                },
                animation: { animateScale: true }
            }
        });
        
        console.log(`✅ Chart initialized: ${type}`);
    });
    
    // Sugar chart - different labels/colors
    const sugarCanvas = document.getElementById('chartSugar');
    if (sugarCanvas) {
        charts['sugar'] = new Chart(sugarCanvas.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['Safe', 'Warning', 'Danger', 'Not tracked'],
                datasets: [{
                    data: [0, 0, 0, 1],
                    backgroundColor: [COLORS.green, COLORS.gold, COLORS.red,
                                      COLORS.silver],
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                cutout: '65%',
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: true }
                },
                animation: { animateScale: true }
            }
        });
        console.log(`✅ Sugar chart initialized`);
    }
}

function updateChart(type, dataObj) {
    const chart = charts[type];
    if (!chart) {
        console.error(`❌ Chart not found: ${type}`);
        return;
    }
    
    // Update data
    chart.data.datasets[0].data = [
        dataObj.gold,
        dataObj.green,
        dataObj.sage,
        dataObj.red,
        dataObj.stale || 0
    ];

    // Handle empty state — a month that hasn't started yet
    if (dataObj.totalDays === 0) {
        chart.data.datasets[0].data = [0, 0, 0, 0, 1];
        chart.data.datasets[0].backgroundColor = ['#eee', '#eee', '#eee', '#eee', '#eee'];
    } else {
        chart.data.datasets[0].backgroundColor = [COLORS.gold, COLORS.green,
                                                  COLORS.sage, COLORS.red, COLORS.silver];
    }

    chart.update();

    // Update center label
    //
    // Measured against the days she TRACKED, not against the month. The
    // ring shows how much of the month is silver; the number answers
    // "when I did log, how often did I hit gold" — two different
    // questions, and folding untracked days into the number would make
    // a good week look like a bad one.
    const labelId = `label${capitalize(type)}`;
    const centerNum = document.getElementById(labelId);
    const tracked = dataObj.totalDays - (dataObj.stale || 0);

    if (centerNum) {
        if (tracked > 0) {
            const goldPct = Math.round((dataObj.gold / tracked) * 100);
            centerNum.innerText = `${goldPct}%`;
        } else {
            centerNum.innerText = "0%";
        }
    }
}

function updateSugarChart(dataObj) {
    const chart = charts['sugar'];
    if (!chart) return;
    
    chart.data.datasets[0].data = [
        dataObj.safe,
        dataObj.warning,
        dataObj.danger,
        dataObj.stale || 0
    ];

    if (dataObj.totalDays === 0) {
        chart.data.datasets[0].data = [0, 0, 0, 1];
        chart.data.datasets[0].backgroundColor = ['#eee', '#eee', '#eee', '#eee'];
    } else {
        chart.data.datasets[0].backgroundColor = [COLORS.green, COLORS.gold,
                                                  COLORS.red, COLORS.silver];
    }

    chart.update();

    // Out of the days she tracked, as above.
    const centerNum = document.getElementById('labelSugar');
    const tracked = dataObj.totalDays - (dataObj.stale || 0);

    if (centerNum && tracked > 0) {
        const safePct = Math.round((dataObj.safe / tracked) * 100);
        centerNum.innerText = `${safePct}%`;
    } else if (centerNum) {
        centerNum.innerText = "0%";
    }
}

function capitalize(s) {
    const map = { cal: 'Cal', prot: 'Prot', carb: 'Carb', fat: 'Fat' };
    return map[s] || s;
}
