/* js/fitness-exercise_index.js */

// --- CONFIG ---
const LIST_TARGETS = ["Abs", "Back", "Biceps", "Calf", "Cardio", "Chest", "Forearms", "Full Body", "Glutes", "Hamstrings", "Hip Flexors", "Obliques", "Quads", "Shoulders", "Triceps"].sort();
        const LIST_EQUIP = ["Band", "Barbell", "Bodyweight", "Cable", "Dumbbell", "EZ Bar", "Kettle Ball", "Machine/Other", "Plates", "Ropes"].sort();
        const LIST_POS = ["Assisted", "Back", "Bent Down", "Bilateral", "Decline", "Flat", "Front", "Half Kneeling", "Hanging", "Incline", "Jump", "Kneeling", "Lateral", "Lying Down", "Overhead", "Plank", "Seated", "Squat", "Standing", "Twist", "Upright"].sort();
        const LIST_TYPES = ["Weight & Reps", "Reps", "Time", "Distance", "Distance & Time"];

// --- STATE ---
// filter(Boolean) at the door. A null left in the library by a bad restore
// survived renderGrid's per-row guard but still crashed the frequency sort,
// whose comparator dereferences both sides before any guard can run.
let exercises = (JSON.parse(localStorage.getItem('lh_exercises')) || []).filter(Boolean);
let editId = null;
let currentOpenId = null;
let activeFilters = [];
let currentSort = 'name';

// --- INIT ---
window.onload = function() { 
    // Safety check for empty DB
    if(exercises.length === 0) {
        console.log("Database empty. Ready for input.");
    }
    populateDropdowns(); 
    applySort('name'); 
};

// --- UTILS ---
function getUsageCount(exId) {
    const currentTemplates = JSON.parse(localStorage.getItem('lh_templates')) || [];
    // Shared lookup from core: checks both dbId (new) and id (legacy), and
    // matches loosely because ids have been stored as numbers and strings.
    // This file used strict === throughout while the Deck and Session used
    // ==, so an id saved as "1737" counted as used there and unused here.
    return currentTemplates.filter(t => findLoggedExercise(t, exId)).length;
}

function populateDropdowns() {
    // Helper to build searchable lists
    const buildList = (id, list, onClickFunc) => {
        const container = document.getElementById(id);
        let html = `<input type="text" class="dropdown-search" placeholder="TYPE TO FILTER..." onclick="event.stopPropagation()" onkeyup="filterDropdown(this)">`;
        html += list.map(item => `<div class="dropdown-item" onclick="${onClickFunc}('${item}')">${item}</div>`).join('');
        container.innerHTML = html; 
    };

    buildList('ddTarget', LIST_TARGETS, 'addTagTarget'); 
    buildList('ddPos', LIST_POS, 'addTagPos');

    document.getElementById('inpEquip').innerHTML = LIST_EQUIP.map(i => `<option style="color:#000">${i}</option>`).join('');
    document.getElementById('inpType').innerHTML = LIST_TYPES.map(i => `<option style="color:#000">${i}</option>`).join('');

    // Fill Filter Clouds
    const fillCloud = (id, list) => { 
        document.getElementById(id).innerHTML = list.map(t => `<div class="tag" onclick="toggleFilterTag(this, '${t}')">${t}</div>`).join(''); 
    };
    fillCloud('filterTarget', LIST_TARGETS); 
    fillCloud('filterEquip', LIST_EQUIP); 
    fillCloud('filterPos', LIST_POS); 
    fillCloud('filterType', LIST_TYPES);
}

function filterDropdown(inputElement) {
    const filter = inputElement.value.toUpperCase();
    const items = inputElement.parentElement.getElementsByClassName('dropdown-item');
    for (let i = 0; i < items.length; i++) {
        const txt = items[i].textContent || items[i].innerText;
        items[i].classList.toggle('hidden', txt.toUpperCase().indexOf(filter) === -1);
    }
}

// --- RENDER GRID ---
function renderGrid() {
    const container = document.getElementById('gridContainer');
    if(!container) return;
    const searchVal = document.querySelector('.search-input').value.toLowerCase();
    container.innerHTML = '';

    exercises.forEach(ex => {
        if (!ex) return;

        // A record restored from the cloud, or written by an older version,
        // may be missing target/pos/name entirely — spreading those threw
        // and took the whole grid down rather than skipping one row.
        const exName = String(ex.name || '');
        const targets = Array.isArray(ex.target) ? ex.target : [];
        const positions = Array.isArray(ex.pos) ? ex.pos : [];

        // 1. Search
        if (!exName.toLowerCase().includes(searchVal)) return;

        // 2. Filter (Strict: Must match ALL active filters)
        if (activeFilters.length > 0) {
            const allTags = [...targets, ex.equip, ...positions, ex.type];
            const matchesAll = activeFilters.every(filter => allTags.includes(filter));
            if (!matchesAll) return;
        }

        const realFreq = getUsageCount(ex.id);
        const displayFreq = realFreq < 10 ? '0' + realFreq : realFreq;

        let actionHTML = ex.isPermanent 
            ? `<span class="material-symbols-outlined action-locked">lock</span>` 
            : `<span class="material-symbols-outlined action-tiny" onclick="openEdit(${ex.id})">edit_square</span><span class="material-symbols-outlined action-tiny del" onclick="confirmAction('delete', ${ex.id})">delete</span>`;

        const row = document.createElement('div');
        row.className = 'list-row';
        row.innerHTML = `<div class="col-name" onclick="openHistory(${ex.id})">${exName}</div><div class="col-separator"></div><div class="col-freq">${displayFreq}</div><div class="col-data">${targets.join(', ') || '-'}</div><div class="col-data">${ex.equip || '-'}</div><div class="col-data">${positions.join(', ') || '-'}</div><div class="col-data">${ex.type || '-'}</div><div class="col-actions">${actionHTML}</div>`;
        container.appendChild(row);
    });
}

// --- SORT & FILTER ---
function toggleSort() { 
    document.getElementById('sortMenu').style.display = (document.getElementById('sortMenu').style.display === 'block') ? 'none' : 'block'; 
    document.getElementById('filterModal').classList.remove('active'); 
}

function applySort(type) {
    currentSort = type;
    document.querySelectorAll('.sort-option').forEach(el => el.classList.remove('active'));
    
    if(type === 'name') {
        exercises.sort((a, b) => String((a && a.name) || '').localeCompare(String((b && b.name) || '')));
        document.querySelectorAll('.sort-option')[0].classList.add('active'); 
    } else { 
        exercises.sort((a, b) => getUsageCount(b.id) - getUsageCount(a.id)); 
        document.querySelectorAll('.sort-option')[1].classList.add('active'); 
    }
    document.getElementById('sortMenu').style.display = 'none'; 
    renderGrid();
}

function toggleFilterModal() { 
    const modal = document.getElementById('filterModal');
    if(modal.style.display === 'flex') {
        modal.style.display = 'none';
        modal.classList.remove('active');
    } else {
        modal.style.display = 'flex'; 
        modal.classList.add('active');
    }
    document.getElementById('sortMenu').style.display = 'none'; 
}

function toggleFilterTag(el, tag) { 
    el.classList.toggle('active'); 
    if (activeFilters.includes(tag)) activeFilters = activeFilters.filter(t => t !== tag); 
    else activeFilters.push(tag); 
}

function applyFilter() { 
    renderGrid(); 
    toggleFilterModal(); 
    const icon = document.getElementById('btnFilterIcon');
    if(activeFilters.length > 0) icon.classList.add('active-filter');
    else icon.classList.remove('active-filter');
}

function clearFilters() {
    activeFilters = [];
    document.querySelectorAll('.tag').forEach(t => t.classList.remove('active'));
    applyFilter();
}

// --- CRUD ACTIONS ---
function openAddModal() { 
    editId = null; 
    document.getElementById('modalTitle').innerText = "NEW EXERCISE"; 
    document.getElementById('inpName').value = ''; 
    document.getElementById('tagsTarget').innerHTML = ''; 
    document.getElementById('tagsPos').innerHTML = ''; 
    document.getElementById('addModal').style.display = 'flex'; 
}

function openEdit(id) {
    const ex = exercises.find(e => e && e.id == id);
    if (!ex) return;
    editId = id;

    document.getElementById('modalTitle').innerText = "EDIT ENTRY";
    document.getElementById('inpName').value = ex.name || '';
    document.getElementById('inpEquip').value = ex.equip || '';
    document.getElementById('inpType').value = ex.type || '';

    const targetCont = document.getElementById('tagsTarget'); targetCont.innerHTML = '';
    (Array.isArray(ex.target) ? ex.target : []).forEach(t => createTagHTML(targetCont, t));

    const posCont = document.getElementById('tagsPos'); posCont.innerHTML = '';
    (Array.isArray(ex.pos) ? ex.pos : []).forEach(p => createTagHTML(posCont, p));
    
    document.getElementById('addModal').style.display = 'flex'; 
}

function saveExercise() {
    const name = document.getElementById('inpName').value; 
    const equip = document.getElementById('inpEquip').value; 
    const type = document.getElementById('inpType').value;
    const targets = [...document.getElementById('tagsTarget').children].map(c => c.innerText.replace('×','').trim());
    const pos = [...document.getElementById('tagsPos').children].map(c => c.innerText.replace('×','').trim());
    
    if(!name) return alert("Designation required.");
    
    if (editId) { 
        const index = exercises.findIndex(e => e && e.id == editId);
        if (index === -1) return;
        exercises[index].name = name; 
        exercises[index].equip = equip; 
        exercises[index].type = type; 
        exercises[index].target = targets; 
        exercises[index].pos = pos; 
    } else { 
        const newEx = { 
            id: Date.now(), 
            name: name, 
            target: targets.length?targets:["-"], 
            equip: equip, 
            pos: pos.length?pos:["-"], 
            type: type, 
            isPermanent: false 
        }; 
        exercises.push(newEx); 
    }
    
    localStorage.setItem('lh_exercises', JSON.stringify(exercises)); 
    
    // 🔥 TRIGGER CLOUD SYNC (If available)
    if(window.syncToCloud) window.syncToCloud();

    applySort(currentSort); 
    closeAddModal();
}

function closeAddModal() { document.getElementById('addModal').style.display = 'none'; }
function toggleDropdown(id) { const el = document.getElementById(id); el.style.display = (el.style.display === 'block') ? 'none' : 'block'; }
function addTagTarget(txt) { createTagHTML(document.getElementById('tagsTarget'), txt); document.getElementById('ddTarget').style.display='none'; }
function addTagPos(txt) { createTagHTML(document.getElementById('tagsPos'), txt); document.getElementById('ddPos').style.display='none'; }
function createTagHTML(container, text) { if([...container.children].some(c => c.textContent.includes(text))) return; container.innerHTML += `<span class="selected-tag">${text} <span class="remove-tag" onclick="this.parentElement.remove()">×</span></span>`; }

function confirmAction(action, id) { 
    const box = document.getElementById('confirmBox'); 
    box.style.display = 'block'; 
    
    if (action === 'delete') {
        // Say what deleting actually costs. The FREQ column already knew
        // how many workouts use this exercise, but delete never asked —
        // and once it is gone, every one of those sessions scores its MGP
        // against "Full Body" instead of the muscles it really worked.
        const uses = getUsageCount(id);
        document.getElementById('confirmText').innerText = uses > 0
            ? `DELETE ENTRY?\nUSED IN ${uses} WORKOUT${uses === 1 ? '' : 'S'}.\nTHEIR MUSCLE CREDIT WILL FALL BACK TO "FULL BODY".`
            : "DELETE ENTRY?";

        document.getElementById('btnConfirmYes').onclick = function() {
            exercises = exercises.filter(e => e && e.id != id);
            localStorage.setItem('lh_exercises', JSON.stringify(exercises)); 
            if(window.syncToCloud) window.syncToCloud(); // Sync
            renderGrid(); 
            closeConfirm(); 
        } 
    } else if (action === 'permanent') { 
        document.getElementById('confirmText').innerText = "LOCK ENTRY?"; 
        document.getElementById('btnConfirmYes').onclick = function() { 
            const index = exercises.findIndex(e => e && e.id == currentOpenId);
            if(index !== -1) { 
                exercises[index].isPermanent = true; 
                localStorage.setItem('lh_exercises', JSON.stringify(exercises)); 
                if(window.syncToCloud) window.syncToCloud(); // Sync
                renderGrid(); 
                closeConfirm(); 
                closeHistory(); 
            } 
        } 
    } 
}
function closeConfirm() { document.getElementById('confirmBox').style.display = 'none'; }

// --- HISTORY LOGIC ---
function openHistory(id) {
    currentOpenId = id;
    const ex = exercises.find(e => e && e.id == id);
    if (!ex) return;

    document.getElementById('histTitle').innerText = ex.name || 'UNNAMED';

    const templates = JSON.parse(localStorage.getItem('lh_templates')) || [];
    // Filter for ANY template that used this exercise ID
    const logs = templates.filter(t => findLoggedExercise(t, id));
    
    // Sort by date (Newest first)
    logs.sort((a, b) => new Date(b.date) - new Date(a.date));

    document.getElementById('histCount').innerText = `LOGGED: ${logs.length}`;
    const container = document.getElementById('historyContainer');
    container.innerHTML = '';

    if(logs.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:#444; padding:20px; font-style:italic;">NO COMBAT DATA FOUND.</div>';
    } else {
        // Global Max Calculation
        let globalMax = 0;
        logs.forEach(log => {
            const specificEx = findLoggedExercise(log, id);
            if(specificEx && specificEx.sets) {
                specificEx.sets.forEach(s => {
                    const weight = parseFloat(s[0]) || 0;
                    if(weight > globalMax) globalMax = weight;
                });
            }
        });

        // Render Logs
        logs.forEach(log => {
            const specificEx = findLoggedExercise(log, id);
            // The filter guarantees one, but this loop writes innerHTML —
            // a throw here left the modal half-drawn. This is the crash the
            // Active Session already had fixed and this file did not.
            if (!specificEx) return;

            const dateStr = log.date ? new Date(log.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase() : 'UNKNOWN DATE';

            let sessionMax = 0;
            if(specificEx.sets) {
                specificEx.sets.forEach(s => {
                    const w = parseFloat(s[0]) || 0;
                    if(w > sessionMax) sessionMax = w;
                });
            }
            const isPB = (sessionMax >= globalMax) && (globalMax > 0);
            const crownIcon = isPB ? '<span class="pb-crown" title="PERSONAL BEST">♛</span>' : '';

            let setsHtml = '<div class="history-sets-list">';
            if(specificEx.sets) {
                // Units from the type the sets were LOGGED under, falling
                // back to the exercise's current type for older records —
                // so re-typing an exercise doesn't relabel its past entries.
                const units = unitsFor(specificEx.type || ex.type);

                specificEx.sets.forEach((set, index) => {
                    const vals = units.map((unit, u) =>
                        `<strong style="color:#fff">${set[u] || "-"}</strong> ${unit}`).join(' &nbsp;x&nbsp; ');

                    setsHtml += `
                        <div class="history-set-row">
                            <span class="faded">SET ${index + 1}</span>
                            <span>${vals}</span>
                        </div>`;
                });
            }
            setsHtml += '</div>';

            let noteHtml = '';
            if (specificEx.note && specificEx.note.trim() !== "") {
                noteHtml = `<div style="margin-top:10px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.1); color:var(--color-accent); font-size:11px; font-style:italic; line-height:1.4; opacity:0.8;">NOTE: "${specificEx.note}"</div>`;
            }

            const html = `
                <div class="history-entry">
                    <div class="history-header-row">
                        <div class="history-date">${dateStr}</div>
                        <div>${crownIcon}</div>
                    </div>
                    ${setsHtml}
                    ${noteHtml}
                </div>
            `;
            container.innerHTML += html;
        });
    }
    
    // Lock Button
    const lockBtnHTML = ex.isPermanent 
    ? `<button class="btn-text" style="color:#444; cursor:default; border:1px solid #333; padding:10px 20px; font-size:10px;"> <span class="material-symbols-outlined" style="font-size:12px; vertical-align:middle;">lock</span> PERMANENT</button>` 
    : `<button class="btn-text btn-confirm" style="background:transparent; color:var(--color-accent); border:1px solid var(--color-accent); padding:10px 20px; box-shadow:none;" onclick="confirmAction('permanent')">LOCK AS PERMANENT</button>`;

    document.querySelector('.modal-actions-row').innerHTML = `
        ${lockBtnHTML}
        <button class="btn-text btn-confirm" style="background:#333; color:#fff; box-shadow:none;" onclick="closeHistory()">CLOSE LOG</button>
    `;

    document.getElementById('historyModal').style.display = 'flex';
}

function closeHistory() { document.getElementById('historyModal').style.display = 'none'; currentOpenId = null; }

/* --- LIVE VAULT ---
   This page keeps its OWN copy of the library in `exercises`, and core only
   rehydrates its own four globals — so the list has to be re-read here or
   the grid would redraw from stale data and look like nothing happened.
   Held back while the editor or the history log is open. */
if (window.LIFEHUB_FITNESS) {
    window.LIFEHUB_FITNESS.onChange(function () {
        const add  = document.getElementById('addModal');
        const hist = document.getElementById('historyModal');
        if (add && add.style.display === 'flex') return;
        if (hist && hist.style.display === 'flex') return;

        exercises = (JSON.parse(localStorage.getItem('lh_exercises')) || []).filter(Boolean);
        applySort(currentSort);   // re-sorts and redraws
    });
}