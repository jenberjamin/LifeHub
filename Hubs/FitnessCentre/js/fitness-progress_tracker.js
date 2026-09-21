/* js/fitness-progress_tracker.js */

// --- CONFIG ---
const DISPLAY_ORDER = [
    "Shoulders", "Chest", "Back", "Biceps", "Triceps", "Forearms",
    "Abs", "Obliques", "Hip Flexors", "Glutes", "Quads", "Hamstrings", 
    "Calf", "Full Body", "Cardio"
];

// --- STATE ---
let currentSlideIdx = 0;
let slideInterval = null;
let profileImages = [];

// --- INITIALIZATION ---
window.onload = function() {
    // Safety Check for Core
    if (typeof UserProfile === 'undefined') { 
        console.error("❖ Core Missing. Stats cannot load."); 
        return; 
    }
    
    // Load Saved Photos or Default
    profileImages = UserProfile.profileSlides || ["https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?q=80&w=2070&auto=format&fit=crop"];
    
    // Render Everything
    renderMainLevel();
    renderMuscleGrid();
    renderSystemLog();
    startSlideshow();
};

function toggleLog() { 
    document.getElementById('logDrawer').classList.toggle('open'); 
}

/* --- SLIDESHOW LOGIC --- */
function startSlideshow() {
    if (profileImages.length === 0) return;

    const layer1 = document.getElementById('slideLayer1');
    const layer2 = document.getElementById('slideLayer2');
    
    // Track which layer is currently visible
    let isLayer1Active = true;

    // 1. Set the initial random image immediately on Layer 1
    let currentIdx = Math.floor(Math.random() * profileImages.length);
    layer1.style.backgroundImage = `url('${profileImages[currentIdx]}')`;

    // Only start the timer if we have more than 1 photo
    if (profileImages.length > 1) {
        if (slideInterval) clearInterval(slideInterval);
        
        slideInterval = setInterval(() => {
            // 2. Pick a new random image
            let nextIdx = Math.floor(Math.random() * profileImages.length);
            
            // 3. Determine which layer is 'hidden' right now
            const hiddenLayer = isLayer1Active ? layer2 : layer1;
            const visibleLayer = isLayer1Active ? layer1 : layer2;

            // 4. Load the new image onto the hidden layer
            hiddenLayer.style.backgroundImage = `url('${profileImages[nextIdx]}')`;

            // 5. Cross-fade: Reveal the hidden layer, hide the visible one
            hiddenLayer.classList.add('active');
            visibleLayer.classList.remove('active');

            // 6. Flip the toggle for next time
            isLayer1Active = !isLayer1Active;

        }, 12000); // 12 Seconds Hold
    }
}

/* --- PHOTO MANAGER (20 SLOTS) --- */
function openPhotoModal() {
    const container = document.getElementById('photoInputsList');
    container.innerHTML = ''; 

    // Generate 20 Inputs Dynamically
    for(let i=0; i<20; i++) {
        const val = profileImages[i] || "";
        const input = document.createElement('input');
        input.type = "text";
        input.className = "url-input";
        input.id = `url${i+1}`;
        input.placeholder = `Image URL ${i+1}`;
        input.value = val;
        container.appendChild(input);
    }
    document.getElementById('photoModal').style.display = 'flex';
}

function closePhotoModal() { document.getElementById('photoModal').style.display = 'none'; }

function savePhotos() {
    const newUrls = [];
    for(let i=1; i<=20; i++) {
        const el = document.getElementById(`url${i}`);
        if(el && el.value.trim()) newUrls.push(el.value.trim());
    }

    if(newUrls.length === 0) {
        newUrls.push("https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?q=80&w=2070&auto=format&fit=crop");
    }

    UserProfile.profileSlides = newUrls;
    profileImages = newUrls;
    
    // Core function - saves to LocalStorage AND Cloud
    saveSystemData(); 
    
    closePhotoModal();
    currentSlideIdx = 0;
    startSlideshow();
}

/* --- RENDERERS --- */
function renderMainLevel() {
    const currentFP = UserProfile.fitnessPoints;
    const stats = getLevelStatus(currentFP, FITNESS_LEVELS, true); 

    document.getElementById('mainLevelNum').innerText = stats.level;
    document.getElementById('mainLevelSub').innerText = `${stats.currentPoints} / ${stats.nextReq} FP`;
    
    const bar = document.getElementById('mainBar');
    bar.style.width = `${stats.pct}%`;

    if (stats.isCapped) {
        bar.style.backgroundColor = "var(--color-accent)";
        bar.style.boxShadow = "0 0 20px var(--color-accent-glow)";
        document.getElementById('mainLevelSub').innerHTML = `<span style="color:var(--color-accent)">⚠ GATEKEEPER LOCKED (XP BANKING ACTIVE)</span>`;
    }

    document.getElementById('prestigeDisplay').innerText = UserProfile.prestigeCurrency.toLocaleString();
}

function renderMuscleGrid() {
    const container = document.getElementById('muscleContainer');
    container.innerHTML = ''; 

    DISPLAY_ORDER.forEach(muscle => {
        const mData = UserProfile.muscles[muscle] || { xp: 0, level: 1 };
        const stats = getLevelStatus(mData.xp, MUSCLE_LEVELS);
        
        let isGatekeeper = false;
        const nextFitTier = FITNESS_LEVELS.find(t => t.lvl === UserProfile.fitnessLevel + 1);
        if (nextFitTier && nextFitTier.gate && nextFitTier.gate.muscle === muscle) {
            isGatekeeper = true;
        }

        const row = document.createElement('div');
        row.className = `muscle-row ${isGatekeeper ? 'locked' : ''}`;
        const crown = stats.level >= 10 ? '👑' : '';
        const activeClass = stats.pct > 0 ? 'active' : '';

        row.innerHTML = `
            <div class="m-label">
                ${muscle} <span style="font-size:10px; color:rgba(255,255,255,0.3); margin-left:5px">LVL ${stats.level}</span> ${crown}
            </div>
            <div class="m-track">
                <div class="m-fill ${activeClass}" style="width: ${stats.pct}%"></div>
            </div>
            <div class="m-pct">${stats.pct}%</div>
        `;
        container.appendChild(row);
    });
}

function renderSystemLog() {
    const container = document.getElementById('logFeed');
    container.innerHTML = '';
    let logs = UserProfile.systemLogs || [];
    logs = [...logs].sort((a, b) => new Date(b.date) - new Date(a.date));

    const searchVal = document.getElementById('logSearch').value.toLowerCase();
    const dateVal = document.getElementById('logDate').value;

    logs = logs.filter(log => {
        const matchesText = log.text.toLowerCase().includes(searchVal);
        let matchesDate = true;
        if (dateVal) {
            // The picker hands back a local day, so the log has to be read
            // as one too. Round-tripping through toISOString() put it back
            // in UTC and hid early-morning entries under the day before.
            matchesDate = (localDay(log.date) === dateVal);
        }
        return matchesText && matchesDate;
    });

    if(logs.length === 0) {
            container.innerHTML = `<div class="log-item">SYSTEM IDLE. NO RECORDS YET.</div>`;
            return;
    }

    logs.forEach(log => {
        const dateObj = new Date(log.date);
        const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
        const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        
        const div = document.createElement('div');
        let typeClass = '';
        if (log.type === 'prestige') typeClass = 'type-prestige'; 
        else if (log.type === 'levelup') typeClass = 'type-levelup'; 
        else if (log.type === 'milestone') typeClass = 'type-milestone'; 
        else if (log.type === 'bonus' || log.type === 'grace') typeClass = 'type-bonus'; 
        
        div.className = `log-item ${typeClass}`;
        div.innerHTML = `
            <strong>${log.text}</strong>
            <span class="log-date">${dateStr} • ${timeStr}</span>
        `;
        container.appendChild(div);
    });
}

function filterLogs() { renderSystemLog(); }

/* --- LIVE VAULT ---
   Held back while the photo editor is open — it is full of URLs she is
   part-way through pasting, and renderSystemLog() would also wipe whatever
   is typed in the log search box. */
if (window.LIFEHUB_FITNESS) {
    window.LIFEHUB_FITNESS.onChange(function () {
        const photo = document.getElementById('photoModal');
        if (photo && photo.style.display === 'flex') return;

        renderMainLevel();
        renderMuscleGrid();
        renderSystemLog();
    });
}