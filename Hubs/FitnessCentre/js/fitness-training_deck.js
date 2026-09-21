
        // --- DATA & STATE ---
        let exerciseDB = JSON.parse(localStorage.getItem('lh_exercises')) || [];
        let templatesDB = JSON.parse(localStorage.getItem('lh_templates')) || [];
        let currentExercises = []; 
        let editTemplateId = null; 
        let isDirty = false; 
        let currentView = 'active'; // 'active', 'deferred', or 'archive'
        let searchQuery = "";

        window.onload = function() { 
            cleanupGhosts();
            switchView('active'); // Default to Active View
        }

        function cleanupGhosts() {
            const initial = templatesDB.length;
            templatesDB = templatesDB.filter(t => t.exercises && Array.isArray(t.exercises));
            if(templatesDB.length !== initial) localStorage.setItem('lh_templates', JSON.stringify(templatesDB));
        }

        function markDirty() { isDirty = true; }

        function applySearchFilter(query) {
            searchQuery = query.toLowerCase();
            renderFolders();
        }

        // --- UPDATED VIEW SWITCHER (NOW HANDLES DEFERRED) ---
        function switchView(view) {
            currentView = view;
            const titleEl = document.querySelector('.page-title');
            
            // Reset UI
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            // Ensure FAB is visible for Active/Deferred, hidden for Archive
            document.getElementById('fabBtn').style.display = (view === 'archive') ? 'none' : 'block';

            if(view === 'active') {
                document.getElementById('navActive').classList.add('active');
                titleEl.innerText = "ACTIVE MISSION DECK";
                titleEl.style.webkitTextStroke = "2px rgba(255,255,255,0.9)"; 
                titleEl.style.textShadow = "0 0 20px rgba(255, 255, 255, 0.4)"; 
                
            } else if (view === 'deferred') {
                document.getElementById('navDeferred').classList.add('active');
                titleEl.innerText = "DEFERRED TASKS";
                // Warning/Orange Hue for visual distinction
                titleEl.style.webkitTextStroke = "2px rgba(255, 158, 128, 0.9)"; 
                titleEl.style.textShadow = "0 0 20px rgba(255, 158, 128, 0.4)"; 

            } else {
                document.getElementById('navArchive').classList.add('active');
                titleEl.innerText = "LOG ARCHIVE";
                titleEl.style.webkitTextStroke = "2px rgba(255, 255, 255, 0.5)"; 
                titleEl.style.textShadow = "none"; 
            }
            
            renderFolders();
        }

        // --- UPDATED RENDER LOGIC (WITH DATE FILTER & PULSE) ---
        // --- SAM BENNETT PATCH: GRACE-AWARE SMART FOLDERS ---
        function renderFolders() {
            const grid = document.getElementById('folderGrid');
            grid.innerHTML = '';
            const grouped = {};
            
            // 1. GET TODAY'S DATE
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const todayStr = `${year}-${month}-${day}`;

            // 2. CHECK FOR GRACE (Did we use it today?)
            let isGraceActive = false;
            const rawUser = localStorage.getItem('LifeHub_RPG_User');
            if (rawUser) {
                const user = JSON.parse(rawUser);
                if (user.systemLogs) {
                    // Look for a log with type 'grace' that matches today's date
                    isGraceActive = user.systemLogs.some(log => {
                        if (log.type !== 'grace') return false;
                        // Log dates are ISO strings (2025-11-26T...) in UTC.
                        // Slicing at the T gives the UTC day, which is not
                        // today's date before 08:00 local — an early grace
                        // then failed to move today's work to Deferred.
                        return localDay(log.date) === todayStr;
                    });
                }
            }

            // 3. FILTER LOGIC (Now with Grace Logic)
            const relevantTemplates = templatesDB.filter(t => {
                const matchesSearch = t.name.toLowerCase().includes(searchQuery);
                if (!matchesSearch) return false;

                if (currentView === 'archive') {
                    // Archive: Always completed
                    return t.isCompleted;
                } 
                else if (currentView === 'deferred') {
                    // Deferred: Incomplete AND (Past Date OR (Today + Grace))
                    const isPast = t.date < todayStr;
                    const isTodayButSkipped = (t.date === todayStr && isGraceActive);
                    return !t.isCompleted && (isPast || isTodayButSkipped);
                } 
                else {
                    // Active: Incomplete AND (Future Date OR (Today + No Grace))
                    const isFuture = t.date > todayStr;
                    const isTodayAndActive = (t.date === todayStr && !isGraceActive);
                    return !t.isCompleted && (isFuture || isTodayAndActive);
                }
            });
            
            // 4. CHECK DEFERRED PULSE (Updated for Grace)
            // Pulse if we have past items OR if we graced today's items
            const hasDeferredItems = templatesDB.some(t => {
                if (t.isCompleted) return false;
                if (t.date < todayStr) return true;
                if (t.date === todayStr && isGraceActive) return true;
                return false;
            });

            const defLink = document.getElementById('navDeferred');
            if(hasDeferredItems) defLink.classList.add('alert-pulse');
            else defLink.classList.remove('alert-pulse');

            // 5. GROUPING
            relevantTemplates.forEach(t => {
                // If Active View + Today + No Grace -> Hijack to TODAY
                // (Note: The filter above already removes Today items if Grace IS active, so this is safe)
                if (currentView === 'active' && t.date === todayStr) {
                    if(!grouped['TODAY']) grouped['TODAY'] = [];
                    grouped['TODAY'].push(t);
                } else {
                    if(!grouped[t.folder]) grouped[t.folder] = [];
                    grouped[t.folder].push(t);
                }
            });

            // 6. EMPTY STATE
            if(Object.keys(grouped).length === 0) {
                let msg = "NO ACTIVE PLANS";
                let sub = "Create a new workout plan.";
                if(currentView === 'archive') { msg = "ARCHIVE EMPTY"; sub = "Complete a workout to log it."; }
                if(currentView === 'deferred') { 
                    if(isGraceActive) { msg = "GRACE PROTOCOL ACTIVE"; sub = "Rest well. Tasks deferred to tomorrow."; }
                    else { msg = "NO DEFERRED TASKS"; sub = "You are all caught up."; }
                }
                
                grid.innerHTML = `<div style="color:#444; margin:auto; text-align:center; font-family:var(--font-header); letter-spacing:2px;">${msg}<br><span style="font-family:var(--font-body); font-size:12px; color:#333;">${sub}</span></div>`; 
                return;
            }

            // 7. SORTING
            let folderKeys = Object.keys(grouped).sort();
            if (grouped['TODAY']) {
                folderKeys = folderKeys.filter(k => k !== 'TODAY');
                folderKeys.unshift('TODAY');
            }

            // 8. RENDER COLUMNS
            folderKeys.forEach(folder => {
                const col = document.createElement('div');
                col.className = 'day-column';
                
                let icon = "folder_open";
                let color = "var(--color-gold)";
                let titleClass = "";
                
                if (folder === 'TODAY') {
                    icon = "star"; 
                    color = "var(--color-accent)"; 
                    titleClass = "text-shadow: 0 0 10px var(--color-accent-dim);"; 
                }

                let cardsHTML = grouped[folder].map(t => {
                    let muscleSet = new Set();
                    if(t.exercises) {
                        t.exercises.forEach(tempEx => {
                            const fullEx = exerciseDB.find(e => e.id == tempEx.dbId);
                            if(fullEx && fullEx.target) fullEx.target.forEach(m => muscleSet.add(m));
                        });
                    }
                    let summary = "General Conditioning";
                    if(muscleSet.size > 0) {
                        const ary = Array.from(muscleSet);
                        summary = ary.length > 3 ? ary.slice(0,3).join(', ') + "..." : ary.join(', ');
                    }
                    
                    const displayDate = t.date ? new Date(t.date).toLocaleDateString(undefined, {month:'short', day:'numeric'}).toUpperCase() : 'NO DATE';
                    const count = t.exercises ? t.exercises.length : 0;
                    const cardClass = t.isCompleted ? 'workout-card archived' : 'workout-card';

                    return `
                    <div class="${cardClass}" onclick="openTemplateModal(${t.id})">
                        <div class="card-title">${t.name}</div>
                        <div class="card-sub">${displayDate} • ${count} EXERCISES</div>
                        <div class="card-details">${summary}</div>
                    </div>`;
                }).join('');

                col.innerHTML = `
                    <div class="folder-header" style="color:${color}; ${titleClass}">
                        <span class="material-symbols-outlined" style="font-size:14px; color:${color};">${icon}</span> 
                        ${folder}
                    </div>
                    ${cardsHTML}`;
                
                grid.appendChild(col);
            });
            updateFolderDatalist();
        }

        function updateFolderDatalist() {
            const folders = [...new Set(templatesDB.map(t => t.folder))];
            document.getElementById('folderOptions').innerHTML = folders.map(f => `<option value="${f}">`).join('');
        }

        // --- OPEN MODAL ---
        function openTemplateModal(id = null) {
            currentExercises = [];
            document.getElementById('addedList').innerHTML = '';
            document.getElementById('searchResults').style.display = 'none';
            document.querySelector('.ex-search-input').value = '';
            isDirty = false; 
            
            const setInputsDisabled = (disabled) => {
                document.querySelectorAll('.tm-input').forEach(i => i.disabled = disabled);
                document.getElementById('searchRow').style.display = disabled ? 'none' : 'block';
                document.getElementById('btnSave').style.display = disabled ? 'none' : 'block';
                document.getElementById('btnDelete').style.display = disabled ? 'none' : 'block';
                if(disabled) document.getElementById('modalTitle').innerText = "LOG RECORD";
            };

            if(id) {
                editTemplateId = id;
                const t = templatesDB.find(temp => temp.id === id);
                
                document.getElementById('tmName').value = t.name;
                document.getElementById('tmFolder').value = t.folder;
                document.getElementById('tmDate').value = t.date;
                
                if (t.isCompleted) {
                    setInputsDisabled(true);
                    document.getElementById('btnDuplicate').style.display = 'block'; 
                } else {
                    setInputsDisabled(false);
                    document.getElementById('modalTitle').innerText = "EDIT TEMPLATE";
                    document.getElementById('btnSave').innerText = "SAVE";
                    document.getElementById('btnDelete').style.display = 'block'; 
                    document.getElementById('btnDuplicate').style.display = 'block'; 
                }

                if(t.exercises && t.exercises.length > 0) {
                    t.exercises.forEach(ex => addExerciseToUI(ex.dbId, false, ex.sets, t.isCompleted)); 
                }

            } else {
                editTemplateId = null;
                setInputsDisabled(false);
                document.getElementById('modalTitle').innerText = "NEW TEMPLATE";
                document.getElementById('tmName').value = '';
                document.getElementById('tmFolder').value = '';
                document.getElementById('tmDate').value = '';
                document.getElementById('btnSave').innerText = "SAVE";
                document.getElementById('btnDelete').style.display = 'none';
                document.getElementById('btnDuplicate').style.display = 'none';
            }
            updateCount();
            document.getElementById('templateModal').style.display = 'flex';
        }
        
        function duplicateTemplate() {
    if(!confirm("Clone this template? Name and Date will be reset.")) return;
    
    // 1. Unlock the UI
    document.querySelectorAll('.tm-input').forEach(i => i.disabled = false);
    document.getElementById('searchRow').style.display = 'block';
    document.getElementById('btnSave').style.display = 'block';

    // 2. Reset Identity (The "Amnesia" Protocol)
    editTemplateId = null;
    document.getElementById('modalTitle').innerText = "CLONED TEMPLATE";
    
    // 3. Clear Fields
    document.getElementById('tmDate').value = ""; 
    const nameInput = document.getElementById('tmName');
    nameInput.value = ""; // <--- Wipes the name
    nameInput.focus();    // <--- Puts your cursor here automatically

    // 4. Reset Buttons
    document.getElementById('btnSave').innerText = "SAVE NEW";
    document.getElementById('btnDelete').style.display = 'none';
    document.getElementById('btnDuplicate').style.display = 'none';
    
    isDirty = true; 
}

        function closeTemplateModal() { 
            if(isDirty) {
                if(confirm("Abort changes? Data will be lost.")) document.getElementById('templateModal').style.display = 'none'; 
            } else {
                document.getElementById('templateModal').style.display = 'none';
            }
        }

        // --- EXERCISE LOGIC ---
        function searchExercises(query) {
            const resultsBox = document.getElementById('searchResults');
            if(query.length < 1) { resultsBox.style.display = 'none'; return; }
            const matches = exerciseDB.filter(ex => ex.name.toLowerCase().includes(query.toLowerCase()));
            resultsBox.innerHTML = matches.map(ex => `<div class="result-item" onclick="addExerciseToUI(${ex.id}, true)"><span>${ex.name} <span style="color:#666;">(${ex.equip})</span></span></div>`).join('');
            resultsBox.style.display = matches.length > 0 ? 'block' : 'none';
        }

        function addExerciseToUI(id, triggerDirty = true, loadedSets = null, isReadOnly = false) {
            let ex = exerciseDB.find(e => e.id == id);
            let isGhost = false;
            if (!ex) { ex = { id: id, name: "Unknown/Deleted", target: ["Unknown"], type: "Reps", equip: "Unknown" }; isGhost = true; }

            const tempId = Date.now() + Math.random(); 
            currentExercises.push({ dbId: ex.id, name: ex.name, tempId: tempId });
            if(triggerDirty) markDirty();

            const container = document.getElementById('addedList');
            const item = document.createElement('div');
            // Updated Classes for Dark UI
            item.className = `ex-item ${isGhost ? 'ghost-item' : ''} ${isReadOnly ? 'archived-item' : ''}`;
            item.id = `ex-${tempId}`;
            
            const delBtn = isReadOnly ? '' : `<span class="material-symbols-outlined delete-btn" onclick="removeEx('${tempId}')">close</span>`;
            
            item.innerHTML = `
                <div class="ex-header-row">
                    <div class="ex-title-group"><span class="ex-name">${ex.name}</span><span class="ex-muscle">${isGhost?'Deleted':ex.target.join(', ')+' • '+ex.equip}</span></div>
                    ${delBtn}
                </div>
                <div class="sets-container"></div>
            `;
            container.appendChild(item);

            const setsContainer = item.querySelector('.sets-container');
            if(loadedSets && loadedSets.length > 0) {
                loadedSets.forEach(vals => addSetRowToContainer(setsContainer, ex.type, vals, isReadOnly));
            } else {
                addSetRowToContainer(setsContainer, ex.type, [], isReadOnly);
            }
            document.getElementById('searchResults').style.display = 'none';
            document.querySelector('.ex-search-input').value = ''; 
            updateCount();
        }

        function getSetInputHTML(type, values = [], isReadOnly) {
            const dirtyAttr = 'oninput="markDirty()"';
            const dis = isReadOnly ? 'disabled' : '';
            // Built from core's SET_UNITS rather than a second copy of the
            // same list. That copy was missing "Distance & Time" entirely,
            // which fell through to a lone REPS box; now a new type only has
            // to be added in one place.
            const units = unitsFor(type);

            return units.map((unit, i) => {
                const v = values[i] || '';
                return `<input type="text" class="set-input" placeholder="${unit}" value="${v}" ${dirtyAttr} ${dis}><span class="unit-label">${unit}</span>`;
            }).join('');
        }

        function addSetRowToContainer(container, type, values = [], isReadOnly = false) {
            const newRow = document.createElement('div');
            newRow.className = 'set-row';
            const controls = isReadOnly ? '' : ` <span class="material-symbols-outlined add-set-btn" title="Add Set" onclick="addSetRowToContainer(this.parentElement.parentElement, '${type}')">add_circle</span> <span class="material-symbols-outlined delete-btn" style="font-size:16px; margin-left:10px; color:#444;" title="Remove Set" onclick="this.parentElement.remove(); markDirty();">remove</span>`;
            
            newRow.innerHTML = `${getSetInputHTML(type, values, isReadOnly)}${controls}`;
            container.appendChild(newRow);
        }

        function removeEx(tempId) {
            markDirty();
            currentExercises = currentExercises.filter(e => e.tempId != tempId);
            document.getElementById(`ex-${tempId}`).remove();
            updateCount();
        }

        function updateCount() { document.getElementById('exCount').innerText = currentExercises.length; }

        // --- SAVE / DELETE ---
        function saveTemplate() {
            const name = document.getElementById('tmName').value;
            const folder = document.getElementById('tmFolder').value;
            const date = document.getElementById('tmDate').value;

            if(!name || !folder || !date) return alert("System Protocol: Name, Folder, and Date required."); 
            if(currentExercises.length === 0) return alert("System Protocol: Template requires at least one exercise.");

            const exercisesWithData = currentExercises.map(e => {
                const domItem = document.getElementById(`ex-${e.tempId}`);
                if (!domItem) return null;
                const setRows = domItem.querySelectorAll('.set-row');
                const setsData = Array.from(setRows).map(row => {
                    const inputs = row.querySelectorAll('.set-input');
                    return Array.from(inputs).map(input => input.value);
                });
                // Stamp the type the sets were ENTERED under. Without it the
                // type was resolved live from the library every time, so
                // re-typing an exercise rewrote its whole history: a "Reps"
                // set of [12] later re-typed "Weight & Reps" became 12kg for
                // no reps, relabelled and rescored retrospectively.
                const libEx = exerciseDB.find(x => x.id == e.dbId);
                const entry = { dbId: e.dbId, name: e.name, sets: setsData };
                if (libEx && libEx.type) entry.type = libEx.type;
                return entry;
            }).filter(e => e !== null);

            const templateObj = {
                id: editTemplateId ? editTemplateId : Date.now(),
                name: name, folder: folder, date: date,
                exercises: exercisesWithData,
                // Maintain completion status if editing existing
                isCompleted: editTemplateId ? (templatesDB.find(t=>t.id===editTemplateId)?.isCompleted || false) : false
            };

            if(editTemplateId) {
                const idx = templatesDB.findIndex(t => t.id === editTemplateId);
                if(idx !== -1) templatesDB[idx] = templateObj;
            } else {
                templatesDB.push(templateObj);
            }

            localStorage.setItem('lh_templates', JSON.stringify(templatesDB));
            isDirty = false; 
            renderFolders(); updateFolderDatalist();
            document.getElementById('templateModal').style.display = 'none';
        }

        function deleteTemplate() {
            if(confirm("Purge this record from database?")) {
                templatesDB = templatesDB.filter(t => t.id !== editTemplateId);
                localStorage.setItem('lh_templates', JSON.stringify(templatesDB));
                renderFolders();
                isDirty = false; 
                document.getElementById('templateModal').style.display = 'none';
            }
        }

// --- PATCH: FAIL-SAFE FOLDER DELETION ---
        function deleteFolderSafe() {
            const folderInput = document.getElementById('tmFolder');
            const targetFolder = folderInput.value.trim();

            // 1. Validation
            if (!targetFolder) return alert("System: No folder selected.");
            if (targetFolder.toLowerCase() === "unsorted") return alert("System Alert: 'Unsorted' is a protected root directory. Cannot delete.");

            // 2. Check if folder actually exists in DB
            const itemsInFolder = templatesDB.filter(t => t.folder === targetFolder);
            if (itemsInFolder.length === 0) {
                folderInput.value = ""; // Just clear the text if it's not a real folder yet
                return; 
            }

            // 3. The Confirmation
            const count = itemsInFolder.length;
            const confirmMsg = `WARNING: You are about to dissolve the folder "${targetFolder}".\n\n${count} template(s) will be moved to "Unsorted".\n\nProceed?`;

            if (confirm(confirmMsg)) {
                // 4. execute Migration
                templatesDB.forEach(t => {
                    if (t.folder === targetFolder) {
                        t.folder = "Unsorted";
                    }
                });

                // 5. Save & Refresh
                localStorage.setItem('lh_templates', JSON.stringify(templatesDB));
                
                // Update UI immediately
                renderFolders();
                updateFolderDatalist();
                
                // Set the current input to the new home
                folderInput.value = "Unsorted";
                markDirty(); // Mark form as dirty so we know to save the specific template we are editing
                
                alert(`Migration Complete. ${count} items moved to Unsorted.`);
            }
        }

/* --- LIVE VAULT ---
   Like the Exercise Index, this page holds its own copies of the library and
   the templates, so both are re-read before redrawing.

   isDirty is the decisive guard: a half-built template exists only in the
   DOM until Save, so rebuilding the deck under it would throw the work away
   with no warning at all. */
if (window.LIFEHUB_FITNESS) {
    window.LIFEHUB_FITNESS.onChange(function () {
        const modal = document.getElementById('templateModal');
        if (isDirty) return;
        if (modal && modal.style.display === 'flex') return;

        exerciseDB  = JSON.parse(localStorage.getItem('lh_exercises')) || [];
        templatesDB = JSON.parse(localStorage.getItem('lh_templates')) || [];
        cleanupGhosts();
        renderFolders();
    });
}
