/* js/fitness-calendar.js */

// --- STATE ---
let currentDt = new Date();

// --- INIT ---
window.onload = function() {
    // Safety Check
    if (typeof UserProfile === 'undefined') { 
        console.warn("❖ Core Missing. Calendar running in read-only mode.");
    }
    renderCalendar();
};

// --- CONTROLS ---
function changeMonth(dir) {
    currentDt.setMonth(currentDt.getMonth() + dir);
    renderCalendar();
}

// --- RENDER ENGINE ---
function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const year = currentDt.getFullYear();
    const month = currentDt.getMonth();
    
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    document.getElementById('monthDisplay').innerText = `${monthNames[month]} ${year}`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // LOAD DATA SOURCES (Safe Fallbacks)
    const templates = JSON.parse(localStorage.getItem('lh_templates')) || [];
    const gallery = JSON.parse(localStorage.getItem('LifeHub_Gallery')) || [];
    const measurements = JSON.parse(localStorage.getItem('LifeHub_Measurements')) || [];
    const logs = (typeof UserProfile !== 'undefined' && UserProfile.systemLogs) ? UserProfile.systemLogs : [];

    // 1. Padding (Ghost Cells)
    for (let i = 0; i < firstDay; i++) {
        const pad = document.createElement('div');
        pad.className = 'day-cell';
        pad.style.opacity = '0.1';
        grid.appendChild(pad);
    }

    // 2. Actual Days
    for (let i = 1; i <= daysInMonth; i++) {
        const cell = document.createElement('div');
        cell.className = 'day-cell';
        
        // Date String Construction (YYYY-MM-DD)
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;

        // Today Check (Local Time)
        const now = new Date();
        const isToday = (now.getFullYear() === year && now.getMonth() === month && now.getDate() === i);
        if(isToday) cell.classList.add('today');

        cell.innerHTML = `<div class="date-num">${i}</div>`;

        // --- LOGIC LAYER ---
        
        // A. WORKOUT STATUS
        const workout = templates.find(t => t.date === dateStr);
        let statusClass = '';
        
        if (workout) {
            if (workout.isCompleted) {
                statusClass = 'status-done';
                cell.innerHTML += `<div class="cell-content"><div class="workout-pill">${workout.name}</div></div>`;
            } else {
                const checkDate = new Date(dateStr);
                const todayDate = new Date();
                todayDate.setHours(0,0,0,0);
                
                if (checkDate < todayDate) {
                    statusClass = 'status-missed';
                    cell.innerHTML += `<div class="cell-content"><div class="workout-pill">MISSED</div></div>`;
                } else {
                    statusClass = 'status-planned';
                    cell.innerHTML += `<div class="cell-content"><div class="workout-pill">${workout.name}</div></div>`;
                }
            }
        }

        // B. GRACE CHECK (Overrides Missed/Planned)
        // localDay() converts the log's UTC timestamp to the local day it
        // happened on. A prefix match on the raw string filed anything
        // before 08:00 under the previous day.
        const graceLog = logs.find(l => l.type === 'grace' && localDay(l.date) === dateStr);
        if (graceLog) {
            statusClass = 'status-grace';
            
            // Remove previous pill if any (e.g. if a workout was planned there)
            const existingPill = cell.querySelector('.cell-content');
            if(existingPill) existingPill.remove();

            // Extract Reason Logic
            let reason = "GRACE"; 
            if (graceLog.text && graceLog.text.includes('[GRACE PROTOCOL]')) {
                reason = graceLog.text.replace('[GRACE PROTOCOL]', '').trim().toUpperCase();
            }
            if (reason === "") reason = "GRACE";

            cell.innerHTML += `<div class="cell-content"><div class="workout-pill">${reason}</div></div>`;
        }

        // C. ICON BADGES
        let badgesHTML = `<div class="badge-container">`;
        
        // Gallery (Photo)
        if (gallery.some(p => p.dateCaptured === dateStr)) {
            badgesHTML += `<span class="material-symbols-outlined badge badge-photo">photo_camera</span>`;
        }
        
        // Stats (Measurements)
        if (measurements.some(m => localDay(m.date) === dateStr)) {
            badgesHTML += `<span class="material-symbols-outlined badge badge-stats">straighten</span>`;
        }

        // Level Up (Trophy)
        if (logs.some(l => l.type === 'levelup' && localDay(l.date) === dateStr)) {
            badgesHTML += `<span class="material-symbols-outlined badge badge-levelup">emoji_events</span>`;
        }

        // Luteal Bonus (Female Symbol)
        if (logs.some(l => l.type === 'bonus' && localDay(l.date) === dateStr)) {
            badgesHTML += `<span class="material-symbols-outlined badge badge-luteal">female</span>`;
        }

        // Streak Break (Fire on Red)
        if (statusClass === 'status-missed') {
            badgesHTML += `<span class="material-symbols-outlined badge badge-break">local_fire_department</span>`;
        }

        badgesHTML += `</div>`;
        cell.innerHTML += badgesHTML;

        // Apply Border Color
        if(statusClass) cell.classList.add(statusClass);

        grid.appendChild(cell);
    }
}

/* --- LIVE VAULT ---
   Nothing here is editable, so a redraw can never interrupt anything. */
if (window.LIFEHUB_FITNESS) {
    window.LIFEHUB_FITNESS.onChange(function () { renderCalendar(); });
}