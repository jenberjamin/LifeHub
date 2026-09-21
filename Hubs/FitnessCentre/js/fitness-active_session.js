/* js/fitness-active_session.js */

const slideShowImages = [
	// Local files (css/files/slideshow/). These were Imgur links;
	// hotlinks rot, so the slideshow no longer depends on them.
	"css/files/slideshow/BodyGoals/FG_(1).webp",
	"css/files/slideshow/BodyGoals/FG_(2).webp",
	"css/files/slideshow/BodyGoals/FG_(3).webp",
	"css/files/slideshow/BodyGoals/FG_(4).webp",
	"css/files/slideshow/BodyGoals/FG_(5).webp",
	"css/files/slideshow/BodyGoals/FG_(6).webp",
	"css/files/slideshow/BodyGoals/FG_(7).webp",
	"css/files/slideshow/BodyGoals/FG_(8).webp",
	"css/files/slideshow/BodyGoals/FG_(9).webp",
	"css/files/slideshow/BodyGoals/FG_(10).webp",
	"css/files/slideshow/BodyGoals/FG_(11).webp",
	"css/files/slideshow/BodyGoals/FG_(12).webp",
	"css/files/slideshow/BodyGoals/FG_(13).webp",
	"css/files/slideshow/BodyGoals/FG_(14).webp",
	"css/files/slideshow/BodyGoals/FG_(15).webp",
	"css/files/slideshow/BodyGoals/FG_(16).webp",
	"css/files/slideshow/BodyGoals/FG_(17).webp",
	"css/files/slideshow/BodyGoals/FG_(18).webp",
	"css/files/slideshow/BodyGoals/FG_(19).webp",
	"css/files/slideshow/BodyGoals/FG_(20).webp",
	"css/files/slideshow/BodyGoals/FG_(21).webp",
	"css/files/slideshow/BodyGoals/FG_(22).webp",
	"css/files/slideshow/BodyGoals/FG_(23).webp",
	"css/files/slideshow/BodyGoals/FG_(24).webp",
	"css/files/slideshow/BodyGoals/FG_(25).webp",
	"css/files/slideshow/BodyGoals/FG_(26).webp",
	"css/files/slideshow/BodyGoals/FG_(27).webp",
	"css/files/slideshow/BodyGoals/FG_(28).webp",
	"css/files/slideshow/BodyGoals/FG_(29).webp",
	"css/files/slideshow/BodyGoals/FG_(30).webp",
	"css/files/slideshow/BodyGoals/FG_(31).webp",
	"css/files/slideshow/BodyGoals/FG_(32).webp",
	"css/files/slideshow/BodyGoals/FG_(33).webp",
	"css/files/slideshow/BodyGoals/FG_(34).webp",
	"css/files/slideshow/BodyGoals/FG_(35).webp",
	"css/files/slideshow/BodyGoals/FG_(36).webp",
	"css/files/slideshow/BodyGoals/FG_(37).webp",
	"css/files/slideshow/BodyGoals/FG_(38).webp",
	"css/files/slideshow/BodyGoals/FG_(39).webp",
	"css/files/slideshow/BodyGoals/FG_(40).webp",
	"css/files/slideshow/BodyGoals/FG_(41).webp",
	"css/files/slideshow/BodyGoals/FG_(42).webp",
	"css/files/slideshow/BodyGoals/FG_(43).webp",
	"css/files/slideshow/BodyGoals/FG_(44).webp",
	"css/files/slideshow/BodyGoals/FG_(45).webp",
	"css/files/slideshow/BodyGoals/FG_(46).webp",
	"css/files/slideshow/BodyGoals/FG_(47).webp",
	"css/files/slideshow/BodyGoals/FG_(48).webp",
	"css/files/slideshow/BodyGoals/FG_(49).webp",
	"css/files/slideshow/BodyGoals/FG_(50).webp",
	"css/files/slideshow/BodyGoals/FG_(51).webp",
	"css/files/slideshow/BodyGoals/FG_(52).webp",
	"css/files/slideshow/BodyGoals/FG_(53).webp",
	"css/files/slideshow/BodyGoals/FG_(54).webp",
	"css/files/slideshow/Fitness/FIT_(1).webp",
	"css/files/slideshow/Fitness/FIT_(2).webp",
	"css/files/slideshow/Fitness/FIT_(3).webp",
	"css/files/slideshow/Fitness/FIT_(4).webp",
	"css/files/slideshow/Fitness/FIT_(5).webp",
	"css/files/slideshow/Fitness/FIT_(6).webp",
	"css/files/slideshow/Fitness/FIT_(7).webp",
	"css/files/slideshow/Fitness/FIT_(8).webp",
	"css/files/slideshow/Fitness/FIT_(9).webp",
	"css/files/slideshow/Fitness/FIT_(10).webp",
	"css/files/slideshow/Fitness/FIT_(11).webp",
	"css/files/slideshow/Fitness/FIT_(12).webp",
	"css/files/slideshow/Fitness/FIT_(13).webp",
	"css/files/slideshow/Fitness/FIT_(14).webp",
	"css/files/slideshow/Fitness/FIT_(15).webp",
	"css/files/slideshow/Fitness/FIT_(16).webp",
	"css/files/slideshow/Fitness/FIT_(17).webp",
	"css/files/slideshow/Fitness/FIT_(18).webp",
	"css/files/slideshow/Fitness/FIT_(19).webp",
	"css/files/slideshow/Fitness/FIT_(20).webp",
	"css/files/slideshow/Fitness/FIT_(21).webp",
	"css/files/slideshow/Fitness/FIT_(22).webp",
	"css/files/slideshow/Fitness/FIT_(23).webp",
	"css/files/slideshow/Fitness/FIT_(24).webp",
	"css/files/slideshow/Fitness/FIT_(25).webp",
	"css/files/slideshow/Fitness/FIT_(26).webp",
	"css/files/slideshow/Fitness/FIT_(27).webp",
	"css/files/slideshow/Fitness/FIT_(28).webp",
	"css/files/slideshow/Fitness/FIT_(29).webp",
	"css/files/slideshow/Fitness/FIT_(30).webp",
	"css/files/slideshow/Fitness/FIT_(31).webp",
	"css/files/slideshow/Fitness/FIT_(32).webp",
	"css/files/slideshow/Fitness/FIT_(33).webp",
	"css/files/slideshow/Fitness/FIT_(34).webp",
	"css/files/slideshow/Fitness/FIT_(35).webp",
	"css/files/slideshow/Fitness/FIT_(36).webp",
	"css/files/slideshow/Fitness/FIT_(37).webp",
	"css/files/slideshow/Fitness/FIT_(38).webp",
	"css/files/slideshow/Fitness/FIT_(39).webp",
	"css/files/slideshow/Fitness/FIT_(40).webp",
	"css/files/slideshow/Fitness/FIT_(41).webp",
	"css/files/slideshow/Fitness/FIT_(42).webp",
	"css/files/slideshow/Fitness/FIT_(43).webp",
	"css/files/slideshow/Fitness/FIT_(44).webp",
	"css/files/slideshow/Fitness/FIT_(45).webp",
	"css/files/slideshow/Fitness/FIT_(46).webp",
	"css/files/slideshow/Fitness/FIT_(47).webp",
	"css/files/slideshow/Thompson/TOM_(1).webp",
	"css/files/slideshow/Thompson/TOM_(2).webp",
	"css/files/slideshow/Thompson/TOM_(3).webp",
	"css/files/slideshow/Thompson/TOM_(4).webp",
	"css/files/slideshow/Thompson/TOM_(5).webp",
	"css/files/slideshow/Thompson/TOM_(6).webp",
	"css/files/slideshow/Thompson/TOM_(7).webp",
	"css/files/slideshow/Thompson/TOM_(8).webp",
	"css/files/slideshow/Thompson/TOM_(9).webp",
	"css/files/slideshow/Thompson/TOM_(10).webp",
	"css/files/slideshow/Us/US_(1).webp",
	"css/files/slideshow/Us/US_(2).webp",
	"css/files/slideshow/Us/US_(3).webp",
	"css/files/slideshow/Us/US_(4).webp"
	];
        const muscleOrder = ["Full Body", "Quads", "Hamstrings", "Glutes", "Hip Flexors", "Back", "Traps", "Lower Back", "Chest", "Shoulders", "Neck", "Triceps", "Biceps", "Forearms", "Abs", "Obliques", "Calf", "Cardio"];

        let currentWorkout = null;
        let currentSlide = Math.floor(Math.random() * slideShowImages.length);
        let activeNoteIndex = null;

        let sessionSeconds = 0;
        let sessionInterval = null;
        let workoutInterval = null;
        let workoutSeconds = 0; 
        let isPaused = false;
        let restInterval = null;
        let restSeconds = 0;
        let isResting = false;

        // Set the moment a workout is settled, so a second CONFIRM cannot
        // pay for the same session twice. updateProgress() auto-opens the
        // finish dialog at 100%, which put a second CONFIRM one stray tap
        // away from double MGP, double FP and a double bank transfer.
        let sessionSettled = false;

        window.onload = function() {
            initSlideshow();
            setDateDisplay();
            loadTodayWorkout();
            // Settle anything a dropped connection left behind last time.
            flushPrestigeOutbox();
            bindLutealToggle();
        };

        /* The luteal toggle used to be a checkbox and nothing else — it was
           read once at FINISH and never stored, so there was no way to set
           it from anywhere but this screen. UserProfile.luteal makes it a
           standing preference: Poppy can turn it on, and it survives until
           it is turned off. */
        function bindLutealToggle() {
            const box = document.getElementById('lutealToggle');
            if (!box || typeof UserProfile === 'undefined') return;

            box.checked = !!(UserProfile.luteal && UserProfile.luteal.active);

            // Ticking it here writes the same preference, so the screen and
            // Poppy can never disagree about which phase she is in.
            box.addEventListener('change', function () {
                if (typeof UserProfile === 'undefined') return;
                UserProfile.luteal = { active: box.checked, since: new Date().toISOString() };
                saveSystemData();
            });
        }

// --- 0. DATE LOGIC ---
function setDateDisplay() {
    const today = new Date();
    document.getElementById('dateStr').innerText = today.toLocaleDateString(undefined, {year:'numeric', month:'long', day:'numeric'});
    document.getElementById('dayStr').innerText = today.toLocaleDateString(undefined, {weekday:'long'});
}

// --- 1. SLIDESHOW ---
function initSlideshow() {
    if(slideShowImages.length === 0) return;

    const layer1 = document.getElementById('slideLayer1');
    const layer2 = document.getElementById('slideLayer2');
    
    let isLayer1Active = true;

    // Set initial image
    let currentIdx = Math.floor(Math.random() * slideShowImages.length);
    layer1.style.backgroundImage = `url('${slideShowImages[currentIdx]}')`;

    setInterval(() => {
        // Pick next image
        let nextIdx = Math.floor(Math.random() * slideShowImages.length);
        const nextImgUrl = slideShowImages[nextIdx];

        // Create a 'ghost' image in memory to check if it's ready
        const imgPreloader = new Image();
        imgPreloader.src = nextImgUrl;

        // Only swap the layers once the image is ACTUALLY downloaded
        imgPreloader.onload = () => {
            const hiddenLayer = isLayer1Active ? layer2 : layer1;
            const visibleLayer = isLayer1Active ? layer1 : layer2;

            hiddenLayer.style.backgroundImage = `url('${nextImgUrl}')`;
            
            // Trigger the CSS fade
            hiddenLayer.classList.add('active');
            visibleLayer.classList.remove('active');

            isLayer1Active = !isLayer1Active;
        };

    }, 5000); 
}

// --- 2. WORKOUT LOADER (UPDATED PRIORITY LOGIC) ---
function loadTodayWorkout() {
    // 1. Get Today's Date
    const today = new Date();
    const dateString = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

    // 2. Check for Resume Data (Crash Protection)
    let manualOverride = JSON.parse(localStorage.getItem('lh_active_workout'));
    
    // Cleanup: If the resume data is from a different day, trash it.
    if (manualOverride && manualOverride.date !== dateString) {
        localStorage.removeItem('lh_active_workout');
        manualOverride = null;
    }

    if (manualOverride) { 
        currentWorkout = manualOverride; 
        renderWorkout(manualOverride); 
        return; 
    }

    // 3. Check the Main Database
    const templates = JSON.parse(localStorage.getItem('lh_templates')) || [];

    // --- PRIORITY 1: FIND ACTIVE WORK ---
    const activeFound = templates.find(t => t.date === dateString && !t.isCompleted);

    if (activeFound) { 
        currentWorkout = activeFound; 
        renderWorkout(activeFound);
        return;
    }

    // --- PRIORITY 2: CHECK FOR VICTORIES ---
    const finishedFound = templates.find(t => t.date === dateString && t.isCompleted);

    if (finishedFound) {
        const idleScreen = document.getElementById('idleScreen');
        idleScreen.style.display = 'flex';
        idleScreen.querySelector('.idle-msg').innerText = "MISSION COMPLETE";
        idleScreen.querySelector('.idle-msg').nextElementSibling.innerText = "PROTOCOL ARCHIVED. RECOVERY MODE ACTIVE.";
        return; 
    }

    // --- PRIORITY 3: SYSTEM IDLE ---
    document.getElementById('idleScreen').style.display = 'flex'; 
}

function renderWorkout(workout) {
    document.getElementById('workoutName').innerText = workout.name;
    document.getElementById('sessionTitleDisplay').innerText = workout.name;
    const container = document.getElementById('workoutFeed');
    container.innerHTML = ''; 
    const exerciseDB = JSON.parse(localStorage.getItem('lh_exercises')) || [];
    
    let richExercises = workout.exercises.map((wEx, index) => {
        const dbEx = exerciseDB.find(e => e.id == wEx.dbId) || { target: ["Unknown"], equip: "Unknown" };
        return { ...wEx, details: dbEx, originalIndex: index };
    });
    
    richExercises.sort((a, b) => {
        const muscleA = a.details.target[0] || "Cardio"; const muscleB = b.details.target[0] || "Cardio";
        return (muscleOrder.indexOf(muscleA) === -1 ? 999 : muscleOrder.indexOf(muscleA)) - (muscleOrder.indexOf(muscleB) === -1 ? 999 : muscleOrder.indexOf(muscleB));
    });

    const countText = richExercises.length;
    document.getElementById('exCount').innerText = countText;
    document.getElementById('exCountLobby').innerText = countText;
    document.getElementById('targetList').innerText = [...new Set(richExercises.flatMap(ex => ex.details.target))].join(', ');

    let lastGroup = null;
    richExercises.forEach(ex => {
        const primaryMuscle = ex.details.target[0] || "General";
        if (primaryMuscle !== lastGroup) {
            const header = document.createElement('div'); header.className = 'group-header'; header.innerText = primaryMuscle; 
            container.appendChild(header); lastGroup = primaryMuscle;
        }
        let setsHTML = '<div class="sets-wrapper">';
        ex.sets.forEach((set, i) => {
            // Units come from the exercise's type. .ex-grid is a fixed
            // 60px 1fr 1fr 40px grid, so a single-value type spans both
            // middle columns rather than leaving a hole beside the tick.
            const units = unitsFor(ex.type || (ex.details && ex.details.type));
            const cells = units.map((unit, u) => {
                const span = units.length === 1 ? ' style="grid-column: span 2"' : '';
                return `<div class="set-data"${span}>${set[u] || "-"} <span class="set-unit">${unit}</span></div>`;
            }).join('');

            setsHTML += `<div class="ex-grid"><div class="set-idx">SET ${i+1}</div>${cells}<div class="check-box" onclick="this.classList.toggle('checked'); updateProgress()"><span class="material-symbols-outlined" style="font-size:16px">check</span></div></div>`;
        });
        setsHTML += '</div>';
        
        const hasNoteClass = (ex.note && ex.note.trim() !== "") ? 'has-note' : '';
        
        const card = document.createElement('div'); card.className = 'ex-card';
        // Cards render sorted by muscle group, so their order on screen is
        // not the order they sit in the template. Carrying the original
        // index lets the finish step map checkboxes back to the right
        // exercise instead of trusting position.
        card.dataset.exIndex = ex.originalIndex;
        card.innerHTML = `
            <div class="ex-header">
                <div>
                    <div class="ex-name">${ex.name}</div>
                    <div class="ex-meta">${ex.details.target.join(', ')} • ${ex.details.equip}</div>
                </div>
                <div class="card-actions">
                    <span id="noteBtn_${ex.originalIndex}" class="material-symbols-outlined action-icon ${hasNoteClass}" onclick="openNoteModal(${ex.originalIndex})" title="Tactical Note">chat</span>
                    <span class="material-symbols-outlined action-icon" onclick="openHistory(${ex.dbId}, '${ex.name.replace(/'/g, "\\'")}')" title="History Log">history</span>
                </div>
            </div>
            ${setsHTML}
        `;
        container.appendChild(card);
    });

    const finishBtnDiv = document.createElement('div');
    finishBtnDiv.className = 'btn-finish-wrapper';
    finishBtnDiv.innerHTML = `<button class="btn-finish" onclick="openFinishConfirm()">FINISH WORKOUT</button>`;
    container.appendChild(finishBtnDiv);
}

function updateProgress() {
    const total = document.querySelectorAll('.check-box').length;
    const checked = document.querySelectorAll('.check-box.checked').length;
    const pct = total === 0 ? 0 : Math.round((checked / total) * 100);
    // Only the active bar has a completion readout now — the lobby copy was
    // permanently hidden, so writing to it did nothing but cost a lookup.
    document.getElementById('completionRate').innerText = pct + "%";

    if (pct === 100) { setTimeout(() => { openFinishConfirm(); }, 500); }
}

// --- 3. TIMER LOGIC ---
function startWorkoutRoutine() {
    document.getElementById('workoutFeed').classList.remove('locked-mode');
    
    document.getElementById('ctrlLobby').style.display = 'none'; document.getElementById('ctrlFocus').style.display = 'flex';
    document.getElementById('topExitBtn').style.display = 'none'; document.getElementById('lobbyStats').style.display = 'none';
    document.getElementById('activeTimerArea').style.display = 'flex'; 
    
    startSessionTimer(); runMainTimer();
}
/* Wall-clock time in the stats bar — it keeps running through a pause on
   purpose, because that is what "how long have I been here" means.
   The handle is kept so the clock can actually be stopped; before, it was
   dropped on the floor and the interval ran on past the finish screen. */
function startSessionTimer() {
    const timerDisplay = document.getElementById('sessionTimer');
    if (sessionInterval) clearInterval(sessionInterval);
    sessionInterval = setInterval(() => { sessionSeconds++; const m = Math.floor(sessionSeconds/60); const s = sessionSeconds%60; timerDisplay.innerText = `${m<10?'0'+m:m}:${s<10?'0'+s:s}`; }, 1000);
}

/* Everything stops when the session ends. Three intervals were left
   ticking into the receipt screen, one of them still rewriting the REST
   button's label underneath it. */
function stopAllTimers() {
    if (sessionInterval) { clearInterval(sessionInterval); sessionInterval = null; }
    if (workoutInterval) { clearInterval(workoutInterval); workoutInterval = null; }
    if (restInterval)    { clearInterval(restInterval);    restInterval = null; }
    isResting = false;
}
function runMainTimer() {
    if(workoutInterval) clearInterval(workoutInterval);
    workoutInterval = setInterval(() => { if(!isPaused) { workoutSeconds++; document.getElementById('mainTimerDisplay').innerText = formatTime(workoutSeconds); } }, 1000);
}
function togglePause() { isPaused = !isPaused; const icon = document.getElementById('pauseIcon'); const btn = document.querySelector('.btn-pause'); if(isPaused) { icon.innerText = "play_arrow"; btn.classList.add('paused'); } else { icon.innerText = "pause"; btn.classList.remove('paused'); } }
function toggleRest() {
    const btn = document.getElementById('btnRest');
    if (!isResting) { isResting = true; restSeconds = 0; btn.classList.add('active'); if(restInterval) clearInterval(restInterval); restInterval = setInterval(() => { restSeconds++; const m = Math.floor(restSeconds/60); const s = restSeconds%60; btn.innerText = `${m<10?'0'+m:m}:${s<10?'0'+s:s}`; }, 1000); } 
    else { isResting = false; clearInterval(restInterval); btn.classList.remove('active'); btn.innerText = "REST"; }
}
function formatTime(totalSeconds) { const h = Math.floor(totalSeconds/3600); const m = Math.floor((totalSeconds%3600)/60); const s = totalSeconds%60; return `${h<10?'0'+h:h}:${m<10?'0'+m:m}:${s<10?'0'+s:s}`; }

// --- 4. NOTES & HISTORY ---
function openNoteModal(index) { activeNoteIndex = index; document.getElementById('noteInput').value = currentWorkout.exercises[index].note || ""; document.getElementById('noteModal').style.display = 'flex'; }
function saveNote() { 
    if (activeNoteIndex === null) return; 
    const noteContent = document.getElementById('noteInput').value;
    currentWorkout.exercises[activeNoteIndex].note = noteContent; 
    localStorage.setItem('lh_active_workout', JSON.stringify(currentWorkout)); 
    if(window.syncToCloud) window.syncToCloud();
    const btn = document.getElementById(`noteBtn_${activeNoteIndex}`);
    if(btn) {
        if(noteContent && noteContent.trim() !== "") { btn.classList.add('has-note'); } else { btn.classList.remove('has-note'); }
    }
    closeNoteModal(); 
}

function closeNoteModal() { document.getElementById('noteModal').style.display = 'none'; activeNoteIndex = null; }

/* findLoggedExercise() now lives in fitness-core.js — the Exercise Index
   needed the same lookup, and a second copy here is how the two screens
   drifted apart in the first place. */

function openHistory(dbId, exName) {
    document.getElementById('histTitle').innerText = exName; 
    const container = document.getElementById('historyListContainer'); 
    container.innerHTML = '';
    
    const templates = JSON.parse(localStorage.getItem('lh_templates')) || [];
    // Checks both new IDs and old Legacy IDs. Also survives a template with
    // no exercises array at all, which raw localStorage can still hold.
    const logs = templates.filter(t => findLoggedExercise(t, dbId));

    // Sets carry no units of their own. Prefer the type stamped on the log
    // itself, falling back to the library for records written before that
    // was stored — so an exercise that was re-typed still shows its old
    // entries in the units they were actually logged in.
    const histDb = JSON.parse(localStorage.getItem('lh_exercises')) || [];
    const histEx = histDb.find(e => e && e.id == dbId);
    
    if(logs.length === 0) { 
        container.innerHTML = '<div style="text-align:center; color:#444; margin-top:20px; font-style:italic; font-size:12px;">NO DATA LOGGED</div>'; 
    } else {
        let globalMax = 0; 
        logs.forEach(log => {
            const specificEx = findLoggedExercise(log, dbId);
            if(specificEx && specificEx.sets) {
                specificEx.sets.forEach(s => { const w = parseFloat(s[0])||0; if(w > globalMax) globalMax = w; }); 
            }
        });
        
        logs.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        logs.forEach(log => {
            let specificEx = findLoggedExercise(log, dbId);
            if (currentWorkout && log.id === currentWorkout.id) {
                    const liveEx = findLoggedExercise(currentWorkout, dbId);
                    if (liveEx) specificEx = liveEx;
            }
            // The filter guarantees a match, but a template mutated between
            // the two passes would not — and this loop writes to innerHTML,
            // so a throw here leaves the modal visibly half-built.
            if (!specificEx) return;

            let sessionMax = 0;
            if(specificEx.sets) {
                specificEx.sets.forEach(s => { const w = parseFloat(s[0])||0; if(w > sessionMax) sessionMax = w; });
            }
            const crownIcon = (sessionMax === globalMax && globalMax > 0) ? '<span class="pb-crown">♛</span>' : '';
            let setsHtml = '<div style="margin-top:10px; display:flex; flex-direction:column; gap:5px;">'; 
            if(specificEx.sets) {
                specificEx.sets.forEach((set, i) => {
                    const vals = unitsFor(specificEx.type || (histEx && histEx.type)).map((unit, u) =>
                        `<strong style="color:#fff">${set[u] || 0}</strong> ${unit}`).join(' &nbsp;x&nbsp; ');
                    setsHtml += `<div style="display:flex; justify-content:space-between; font-size:12px; color:#ccc;"><span style="color:#666">SET ${i+1}</span><span>${vals}</span></div>`;
                });
            }
            setsHtml += '</div>';
            let noteHtml = '';
            if (specificEx.note && specificEx.note.trim() !== "") {
                noteHtml = `<div style="margin-top:8px; padding-top:8px; border-top:1px dashed #333; color:var(--color-accent); font-size:11px; font-style:italic; line-height:1.4;">"${specificEx.note}"</div>`;
            }
            container.innerHTML += `<div class="history-entry"><div style="display:flex; justify-content:space-between; font-size:10px; color:#888; letter-spacing:1px;"><div>${new Date(log.date).toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'}).toUpperCase()}</div><div>${crownIcon}</div></div>${setsHtml}${noteHtml}</div>`;
        });
    }
    document.getElementById('historyModal').style.display = 'block'; 
    document.getElementById('modalOverlay').style.display = 'block';
}
function closeHistory() { document.getElementById('historyModal').style.display = 'none'; document.getElementById('modalOverlay').style.display = 'none'; }

function openGraceModal() { document.getElementById('graceModal').style.display = 'flex'; }
function closeGraceModal() { document.getElementById('graceModal').style.display = 'none'; }
function confirmGrace() {
    const reason = document.getElementById('graceReason').value;
    stopAllTimers();   // she is leaving the page; nothing should still be ticking

    // 1. LOG THE GRACE (System Record)
    //
    // Hand this to core.js rather than doing it here. This block used to
    // write the log and spend the budget itself but never touched
    // lastWorkout — the only field the streak rule reads — so the streak
    // broke anyway while every visible signal said it was protected.
    let result = null;

    if (typeof activateGrace === 'function') {
        // Say so before spending the day, not after.
        if (graceRemaining() === 0) {
            const proceed = confirm(
                `GRACE BUDGET SPENT\n\n` +
                `You've used ${UserProfile.graceUsed} of ${SYSTEM_CONFIG.graceCap} protected rest days this week.\n\n` +
                `This day will still be logged, but your streak will NOT be protected — it breaks as normal.\n\n` +
                `Log it anyway?`
            );
            if (!proceed) return;   // leave the modal open, nothing spent
        }

        result = activateGrace(reason);
        if (window.syncToCloud) window.syncToCloud();
    }

    // 2. THE MIGRATION (Time Shift)
    if (currentWorkout) {
        const templates = JSON.parse(localStorage.getItem('lh_templates')) || [];
        const idx = templates.findIndex(t => t.id === currentWorkout.id);
        
        if (idx !== -1) {
            const d = new Date();
            d.setDate(d.getDate() - 1); // Subtract 1 day
            const yesterdayStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            
            templates[idx].date = yesterdayStr;
            localStorage.setItem('lh_templates', JSON.stringify(templates));
            if(window.syncToCloud) window.syncToCloud();
        }
    }

    // 3. CLEAN UP
    localStorage.removeItem('lh_active_workout');

    // Tell her which of the two things actually happened — the old message
    // said "Active" either way, which is how this went unnoticed for so long.
    if (result && result.protected) {
        alert(`GRACE PROTOCOL ACTIVE\n\n${result.reason}\n\n` +
              `Streak paused at ${UserProfile.streak || 0} days — protected.\n` +
              `${result.remaining} of ${result.cap} rest days left this week.`);
    } else if (result) {
        alert(`REST DAY LOGGED\n\n${result.reason}\n\n` +
              `Grace budget spent — the streak is not protected.`);
    } else {
        alert(`Rest day logged: ${reason}`);
    }

    closeGraceModal();
    window.location.href = 'FITNESS-CENTRE.html';
}

/* --- 5. FINISH (PATCHED V3) --- */
function openFinishConfirm() { document.getElementById('confirmFinishModal').style.display = 'flex'; }
function closeConfirmFinish() { document.getElementById('confirmFinishModal').style.display = 'none'; }

function confirmFinish() {
    closeConfirmFinish();
    if (sessionSettled) return;
    sessionSettled = true;
    isPaused = true;
    stopAllTimers();

    // --- A. DATA ENRICHMENT ---
    const exerciseDB = JSON.parse(localStorage.getItem('lh_exercises')) || [];
    let finishedWorkout = JSON.parse(JSON.stringify(currentWorkout));
    
    finishedWorkout.exercises = finishedWorkout.exercises.map(ex => {
        const dbEx = exerciseDB.find(e => e.id == ex.dbId);
        
        if (dbEx) {
            ex.type = dbEx.type;
            ex.details = { target: dbEx.target };
        } else {
            ex.type = "Reps"; 
            ex.details = { target: ["Full Body"] };
        }
        return ex;
    });

    // --- B. COUNTING LOGIC ---
    // Read the checkboxes once, per set, and hand that down to the engine.
    // The DOM is the only record of what she actually did — the template
    // just says what was planned.
    const totalExercisesCount = currentWorkout.exercises.length;
    let finalExerciseCount = 0;
    const uiCards = document.querySelectorAll('.ex-card');

    const ticks = {};   // template index -> [true/false per set]

    uiCards.forEach(card => {
        const boxes = Array.from(card.querySelectorAll('.check-box'));
        const done = boxes.map(b => b.classList.contains('checked'));

        const idx = Number(card.dataset.exIndex);
        if (!isNaN(idx)) ticks[idx] = done;

        if (boxes.length > 0 && done.every(Boolean)) finalExerciseCount++;
    });

    finishedWorkout.exercises.forEach((ex, i) => {
        // No card for this exercise means it never rendered; fall back to
        // "all done" rather than silently voiding a session over a UI slip.
        ex.completedSets = ticks[i] || null;
    });

    const isComplete = (finalExerciseCount === totalExercisesCount) && (totalExercisesCount > 0);
    const isLuteal = document.getElementById('lutealToggle').checked;

    // --- C. CALL THE ENGINE (Core.js) ---
    const report = processWorkoutSession(finishedWorkout, isLuteal, isComplete);

    // --- D. RENDER RECEIPT ---
    const titleEl = document.getElementById('receiptTitle');
    const subEl = document.getElementById('receiptSub');
    
    if (isComplete) {
        titleEl.innerText = "WORKOUT COMPLETE!";
        subEl.innerText = "🎉 FULL WORKOUT ACKNOWLEDGED 🎉";
        subEl.style.background = "rgba(0, 229, 255, 0.1)"; 
        subEl.style.color = "var(--color-accent)";
    } else {
        titleEl.innerText = "WORKOUT DONE 👍";
        subEl.innerText = "PARTIAL SESSION LOGGED";
        subEl.style.background = "rgba(255, 255, 255, 0.1)"; 
        subEl.style.color = "#ccc";
    }

    document.getElementById('rcptCount').innerText = `${finalExerciseCount} / ${totalExercisesCount}`;
    
    const timeStr = document.getElementById('mainTimerDisplay').innerText;
    const parts = timeStr.split(':').map(Number);
    let prettyTime = "";
    if (parts[0] > 0) prettyTime += `${parts[0]}hr `;
    if (parts[1] > 0) prettyTime += `${parts[1]}mins`;
    if (parts[0]===0 && parts[1]===0) prettyTime = `${parts[2]}sec`;
    document.getElementById('rcptTime').innerText = prettyTime;

    document.getElementById('rcptFP').innerText = report.totalFP;
    document.getElementById('rcptMGP').innerText = report.totalSessionMGP;
    document.getElementById('rcptPrestige').innerText = report.earnedPrestige;
    document.getElementById('rcptStreak').innerText = UserProfile.streak;

    // --- E. CLEANUP & SAVE ---
    localStorage.removeItem('lh_active_workout');
    
    const templates = JSON.parse(localStorage.getItem('lh_templates')) || [];
    const tIndex = templates.findIndex(t => t.id === currentWorkout.id);
    if(tIndex !== -1) {
        templates[tIndex].isCompleted = true;
        // The pause-aware clock, not the wall clock. This feeds "Productivity
        // Time" on the HUD and "Total Time" in the archive, and it used to be
        // sessionSeconds — which counted every minute spent paused, and so
        // disagreed with the duration printed on the receipt beside it.
        templates[tIndex].durationSeconds = workoutSeconds;

        /* Write down what actually happened.
           Only isCompleted and durationSeconds used to survive, so the
           archive had to reconstruct a session by scraping log text and
           matching calendar days. That guessed wrong in three ways at once:
           two workouts on one day each claimed the whole day, the FP figure
           came from a regex that never matched (so every card printed a
           hardcoded 20), and nothing recorded which sets were actually
           ticked. The numbers below are the ones the engine just used. */
        templates[tIndex].summary = {
            totalFP:            report.totalFP,
            baseFP:             report.baseFP,
            effortFP:           report.effortFP,
            streakFP:           report.streakFP,
            totalMGP:           report.totalSessionMGP,
            prestige:           report.earnedPrestige,
            muscles:            report.earnedMGP,
            setsCompleted:      report.setsCompleted,
            setsPlanned:        report.setsPlanned,
            exercisesCompleted: finalExerciseCount,
            exercisesPlanned:   totalExercisesCount,
            isComplete:         isComplete
        };

        /* The enriched copy carries completedSets and the resolved type and
           targets, so the archive keeps working even if the exercise is
           later renamed, re-typed or deleted from the library. */
        templates[tIndex].exercises = finishedWorkout.exercises;
        localStorage.setItem('lh_templates', JSON.stringify(templates));
        
        // 🔥 ADD THIS LINE HERE:
        if(window.syncToCloud) window.syncToCloud(); 
    }

    // --- PRESTIGE PAYDAY ---
    // The engine already did the arithmetic. report.earnedPrestige is
    // totalFP × prestigeRatio, computed in core.js and shown on the receipt
    // — so the bank and the receipt can never disagree about what was owed.
    payPrestige(report.earnedPrestige, currentWorkout.name);

    document.getElementById('successModal').style.display = 'flex';
    startConfetti();
}

/* --- 6. THE PRESTIGE BANK -------------------------------------------
   Where Fitness Centre earnings meet the rest of LifeHub.

   The bank is prestige_system in the lifehub-cae1d Realtime Database —
   the same ledger the sleep and hydration protocols pay into.
   gatekeeper.js hands us the handle as window.prestigeDB, and
   JS/lifehub-prestige-ledger.js owns the shape of a ledger row.

   This block used to read the payout off two elements, #scoreDisplay and
   #sessionTitle, that have never existed on this page. The scrubber
   dutifully stripped a zero out of nothing, so every workout ever logged
   ended at "⚠️ Transfer Skipped" and not one point reached the bank. The
   number it wanted was already sitting in the report core.js returns.

   Payouts go through an outbox rather than straight out. A dropped
   connection mid-workout used to mean the points were simply gone; now
   the row waits in localStorage and settles the next time this page
   opens. */

const PRESTIGE_SOURCE = "FITNESS CENTRE";
const PAYOUT_OUTBOX   = "lh_prestige_outbox";

function readOutbox() {
    try {
        const parsed = JSON.parse(localStorage.getItem(PAYOUT_OUTBOX));
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function writeOutbox(queue) {
    localStorage.setItem(PAYOUT_OUTBOX, JSON.stringify(queue));
}

/* Always re-read before writing. Two payouts settling at once would
   otherwise each save the list as they found it, and the slower one
   would resurrect the row the faster one had just cleared. */
function updateOutbox(id, change) {
    const queue = readOutbox();
    const idx = queue.findIndex(e => e.id === id);
    if (idx === -1) return;

    if (change === null) queue.splice(idx, 1);
    else Object.assign(queue[idx], change);

    writeOutbox(queue);
}

function payPrestige(amount, workoutName) {
    const payout = Math.max(0, Math.round(Number(amount) || 0));
    if (!payout) {
        console.log("💸 Prestige: nothing earned this session, nothing banked.");
        return;
    }

    const entry = {
        // Doubles as the ledger row's key, so a retry overwrites its own
        // row instead of pushing a second one.
        id: `fc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        amount: payout,
        description: `Fitness Log: ${workoutName || "Workout Session"}`,
        rowWritten: false
    };

    const queue = readOutbox();
    queue.push(entry);
    writeOutbox(queue);

    flushPrestigeOutbox();
}

function flushPrestigeOutbox() {
    const queue = readOutbox();
    if (!queue.length) return;

    if (!window.prestigeDB) {
        console.warn(`⚠️ Prestige: bank unreachable. ${queue.length} payout(s) held for next session.`);
        return;
    }

    const txRef = window.prestigeDB.ref('prestige_system/transactions');
    const balanceRef = window.prestigeDB.ref('prestige_system/balance');
    const stamp = firebase.database.ServerValue.TIMESTAMP;

    queue.forEach(entry => {
        // Two steps, and the order matters. The row is the record of
        // what was earned; the balance is spendable cash derived from it.
        // Writing the row first means a failure between the two leaves a
        // payout that is documented but unpaid — recoverable. The other
        // order leaves money with no story behind it.
        const row = window.LIFEHUB_PRESTIGE
            ? window.LIFEHUB_PRESTIGE.row(entry.amount, entry.description, PRESTIGE_SOURCE, stamp)
            : { amount: entry.amount, description: entry.description,
                source: PRESTIGE_SOURCE, timestamp: stamp };

        const writeRow = entry.rowWritten
            ? Promise.resolve()
            : txRef.child(entry.id).set(row).then(() => updateOutbox(entry.id, { rowWritten: true }));

        writeRow
            .then(() => balanceRef.transaction(c => (c || 0) + entry.amount))
            .then(() => {
                updateOutbox(entry.id, null);
                console.log(`💸 Prestige banked: +${entry.amount} — ${entry.description}`);
            })
            .catch(err => {
                console.warn(`⚠️ Prestige payout deferred (+${entry.amount}). Retrying next session.`, err);
            });
    });
}

/* --- LIVE VAULT ---------------------------------------------------------
   The most dangerous page to redraw, and the one with the least to gain.

   Ticked checkboxes live ONLY in the DOM until FINISH — nothing persists
   them — so rebuilding the feed mid-session would silently erase every set
   she has done. Any of these means hands off:

     · the session has been settled (receipt is up)
     · the workout clock is running
     · anything at all is ticked, started or not
     · a modal is open

   Otherwise the page is still sitting in the lobby, where a redraw is free
   and a workout Poppy scheduled should appear without a refresh. */
if (window.LIFEHUB_FITNESS) {
    window.LIFEHUB_FITNESS.onChange(function () {
        if (sessionSettled || workoutInterval) {
            console.log("☁️ VAULT: update held — workout in progress.");
            return;
        }
        if (document.querySelector('.check-box.checked')) {
            console.log("☁️ VAULT: update held — sets are ticked.");
            return;
        }
        const openModal = ['graceModal', 'noteModal', 'confirmFinishModal', 'successModal', 'historyModal']
            .map(id => document.getElementById(id))
            .some(el => el && el.style.display && el.style.display !== 'none');
        if (openModal) {
            console.log("☁️ VAULT: update held — a dialog is open.");
            return;
        }

        document.getElementById('idleScreen').style.display = 'none';
        currentWorkout = null;
        loadTodayWorkout();
    });
}

// --- 7. CONFETTI ---
function startConfetti() {
    const canvas = document.getElementById('confetti-canvas'); const ctx = canvas.getContext('2d'); canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    const particles = []; const colors = ['#00e5ff', '#ffffff', '#333333'];
    function createParticle() { return { x: Math.random() * canvas.width, y: -10, size: Math.random() * 5 + 2, color: colors[Math.floor(Math.random() * colors.length)], speedY: Math.random() * 3 + 2, speedX: Math.random() * 2 - 1, rotation: Math.random() * 360 }; }
    for(let i=0; i<150; i++) particles.push(createParticle());
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach((p, index) => {
            p.y += p.speedY; p.x += p.speedX; p.rotation += 2;
            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rotation * Math.PI / 180); ctx.fillStyle = p.color; ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size); ctx.restore();
            if (p.y > canvas.height) particles[index] = createParticle();
        });
        requestAnimationFrame(animate);
    }
    animate();
    setTimeout(() => { canvas.style.display = 'none'; }, 6000);
}