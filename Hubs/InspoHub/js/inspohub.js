// ==========================================
// 1. FIREBASE CONFIG & INIT
// ==========================================
// Renamed from firebaseConfig, and moved onto its own named app. Two
// separate bugs were killing lifehub-navigation-core.js on this page:
//
//   1. The nav core declares a top-level `const firebaseConfig` too.
//      Both are classic scripts sharing one global scope, so the second
//      to load — the nav core — died at parse time with "Identifier
//      'firebaseConfig' has already been declared" and never ran.
//
//   2. Even renamed, this used to claim the DEFAULT app for the
//      hubs-database project, which carries no databaseURL. The nav
//      core would have found that default app and thrown on
//      .database(). A named app leaves [DEFAULT] free for LifeHub.
//
// Same shape as FitnessCentre's "FitnessVault". Inspo is a Firestore
// hub on its own project; the nav core is RTDB on lifehub-cae1d. They
// are two different databases and must stay two different apps.
const inspoFirebaseConfig = {
  apiKey: "AIzaSyDWbNjdj-pLIRV3i_2MEEWQio6IQ4Ri4tU",
  authDomain: "hubs-database.firebaseapp.com",
  projectId: "hubs-database",
  storageBucket: "hubs-database.firebasestorage.app",
  messagingSenderId: "677512604138",
  appId: "1:677512604138:web:00c5a8b62c5ff96812aa93",
  measurementId: "G-2R4SWBV1XR"
};

if (typeof firebase === 'undefined') {
    alert("Sam Error: Firebase script missing from HTML.");
}

const inspoApp = (function () {
    try { return firebase.app("InspoVault"); }
    catch (e) { return firebase.initializeApp(inspoFirebaseConfig, "InspoVault"); }
})();

const db = inspoApp.firestore();
const libraryCol = db.collection("library_items");
const categoriesCol = db.collection("categories");

// ==========================================
// 2. MORNING PROTOCOL
// ==========================================
const videoLibrary = {
    'CEO Energy': [
        'videos/jen/second_star.mp4'
    ],
    'Life': [
        'videos/life/life_34563.mp4'
    ],
    'Fitness': [
        'videos/fitness/fitness_98903.mp4'
    ],
    'Friendship': [
        'videos/friendship/friendship_45645.mp4'
    ],
    'Career': [
        'videos/theme_career.mp4'
    ],
    'Future': [
        'videos/theme_future.mp4'
    ],
    'Artist Zone': [
        'videos/theme_art.mp4'
    ]
};

let currentSequence = [];
let sequenceIndex = 0;

window.playTheme = function(themeName) {
    // 1. UI: Set active button state
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.innerText === themeName) btn.classList.add('active');
    });

    // 2. LOGIC: Get videos and shuffle them
    const allVideos = videoLibrary[themeName];
    
    // Safety check: if no videos exist
    if (!allVideos || allVideos.length === 0) {
        alert("Sam: No videos found for this category.");
        return;
    }

    // Shuffle the array (Fisher-Yates randomizer) and take the first 5
    const shuffled = [...allVideos].sort(() => 0.5 - Math.random());
    currentSequence = shuffled.slice(0, 5); 
    sequenceIndex = 0;

    // 3. START: Play the first one
    window.playNextInSequence(themeName);
    
    document.getElementById('playerControls').classList.remove('hidden');
};

window.playNextInSequence = function(themeName) {
    const stage = document.getElementById('videoStage');
    const label = document.getElementById('nowPlayingLabel');

    // Check if we reached the end of the 5 videos
    if (sequenceIndex >= currentSequence.length) {
        stage.innerHTML = `<div class="empty-stage"><span>${themeName} Session Complete.</span></div>`;
        label.innerText = "Session Complete";
        return;
    }

    // Get current video
    const filePath = currentSequence[sequenceIndex];
    const displayCount = sequenceIndex + 1;
    const totalCount = currentSequence.length;

    // Render Player with 'onended' trigger.
    // The onerror is not decoration: Career, Future and Artist Zone
    // point at theme_career/theme_future/theme_art.mp4, which have
    // never existed in videos/. The only guard here checked for an
    // EMPTY list, so those three buttons handed back a silent black
    // rectangle with no hint as to why. Now the stage says what is
    // missing.
    stage.innerHTML = `
        <video id="mainPlayer" width="100%" height="100%" autoplay controls style="object-fit:contain;" onended="window.playNextInSequence('${escJs(themeName)}')">
            <source src="${escAttr(filePath)}" type="video/mp4" onerror="window.reportMissingClip('${escJs(themeName)}', '${escJs(filePath)}')">
        </video>
    `;

    // Update Label
    label.innerText = `${themeName}: Playing ${displayCount} of ${totalCount}`;

    // Increment index for next round
    sequenceIndex++;
};

// A clip in the sequence could not be loaded. Rather than leaving a
// black stage, name the file — the fix is always "drop that mp4 into
// videos/" — then carry on to the next clip if the theme has one.
window.reportMissingClip = function(themeName, filePath) {
    const stage = document.getElementById('videoStage');
    const label = document.getElementById('nowPlayingLabel');
    if (!stage) return;

    if (sequenceIndex < currentSequence.length) {
        console.warn("Inspo: missing clip, skipping — " + filePath);
        window.playNextInSequence(themeName);
        return;
    }

    stage.innerHTML = `<div class="empty-stage"><span>${escAttr(themeName)} has no clip yet &mdash; add <code>${escAttr(filePath)}</code>.</span></div>`;
    if (label) label.innerText = themeName + ": clip missing";
};

window.toggleFullScreen = function() {
    const el = document.getElementById('mainPlayer');
    if (el) {
        if (el.requestFullscreen) el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    }
};

// ==========================================
// 3. MODAL LOGIC (CREATE & RENAME)
// ==========================================
let modalMode = 'create'; // 'create', 'rename', or 'move'
let targetItemId = null;  // Stores the ID of the post we are moving

window.openModal = function(mode, id = null) {
    const modal = document.getElementById('categoryModal');
    const input = document.getElementById('modalInput');
    const select = document.getElementById('modalSelect');
    const title = document.getElementById('modalTitle');
    const currentCat = document.getElementById('libCategory').value;

    modalMode = mode;
    targetItemId = id; // Save the ID if we are moving an item

    modal.classList.remove('hidden');

    // Reset visibility
    input.classList.remove('hidden');
    select.classList.add('hidden');

    if (mode === 'create') {
        title.innerText = "New Category";
        input.value = "";
        input.placeholder = "Name...";
        input.focus();
    } 
    else if (mode === 'rename') {
        if(!currentCat) return alert("Select a category to rename first.");
        title.innerText = "Rename Category";
        input.value = currentCat;
        input.focus();
    } 
    else if (mode === 'move') {
        // SWAP MODE: Hide input, Show Dropdown
        title.innerText = "Move to...";
        input.classList.add('hidden');
        select.classList.remove('hidden');
        
        // Populate dropdown with current categories, and start it on
        // the category the item is already in — moving used to always
        // open on the first name in the list.
        select.innerHTML = availableCategories.map(cat =>
            `<option value="${escAttr(cat)}">${escAttr(cat)}</option>`
        ).join('');
        const item = allItems.find(i => i.id === id);
        if (item && availableCategories.includes(item.category)) select.value = item.category;
    }
};

window.closeModal = function() {
    document.getElementById('categoryModal').classList.add('hidden');
};

window.confirmModal = function() {
    const inputVal = document.getElementById('modalInput').value.trim();
    const selectVal = document.getElementById('modalSelect').value;

    if (modalMode === 'create') {
        if(inputVal) createNewCategory(inputVal);
    } 
    else if (modalMode === 'rename') {
        if(inputVal) renameCurrentCategory(inputVal);
    } 
    else if (modalMode === 'move') {
        // EXECUTE THE MOVE
        if(targetItemId && selectVal) {
            libraryCol.doc(targetItemId).update({ category: selectVal })
                .then(() => console.log("Moved successfully"))
                .catch(e => alert("Sam Error: Move failed."));
        }
    }
    
    window.closeModal();
};

// ==========================================
// 4. DATABASE ACTIONS
// ==========================================

// --- CREATE ---
function createNewCategory(name) {
    if (availableCategories.includes(name)) {
        return alert(`Sam: '${name}' already exists.`);
    }
    categoriesCol.add({
        name: name,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => console.log("Category Added"))
      .catch(e => { console.error(e); alert("Sam Error: Could not add the category."); });
}

// --- RENAME (COMPLEX BATCH) ---
async function renameCurrentCategory(newName) {
    const oldName = document.getElementById('libCategory').value;
    if(oldName === newName) return;
    if(availableCategories.includes(newName)) {
        return alert(`Sam: '${newName}' already exists — pick another name.`);
    }

    // 1. Find the Category Document
    const catSnapshot = await categoriesCol.where("name", "==", oldName).get();
    if (catSnapshot.empty) {
        // The thirteen built-in names live in defaultCategories at the
        // bottom of this file, not in Firestore — so there is no doc to
        // rename and the old error ("Category not found") was both
        // wrong and unhelpful. Renaming one here would half-work: the
        // items would move, and the built-in name would reappear in the
        // tab bar on the next load, leaving two categories where she
        // meant to have one. Say so instead of half-doing it.
        if (defaultCategories.includes(oldName)) {
            return alert(`Sam: '${oldName}' is a built-in category, so it can't be renamed here — it would come straight back on the next load. Make a new category and move the items across instead.`);
        }
        return alert(`Sam: '${oldName}' isn't in the database, so there's nothing to rename.`);
    }

    const catDoc = catSnapshot.docs[0]; // Get the actual doc

    // 2. Find ALL items using this category
    const itemsSnapshot = await libraryCol.where("category", "==", oldName).get();
    
    // 3. Start a Batch Write
    const batch = db.batch();

    // Update Category Name
    batch.update(catDoc.ref, { name: newName });

    // Update Every Single Item
    itemsSnapshot.forEach(doc => {
        batch.update(doc.ref, { category: newName });
    });

    // Commit Changes
    try {
        await batch.commit();
        alert(`Sam: Renamed '${oldName}' to '${newName}' and updated ${itemsSnapshot.size} files.`);
    } catch (e) {
        console.error(e);
        alert("Sam Error: Rename failed.");
    }
}

// ==========================================
// 5. LIBRARY LOGIC
// ==========================================
let availableCategories = [];
const defaultCategories = ["Jen Jenner", "Posts", "LifeHub", "Arts", "Fitness", "Discipline", "Mindset", "Love", "Partnership", "Parenthood", "Wish List", "Thompson", "Tutorials" ];

categoriesCol.orderBy("name").onSnapshot((snapshot) => {
    const dbCats = snapshot.docs.map(doc => doc.data().name);
    availableCategories = [...new Set([...defaultCategories, ...dbCats])];
    renderCategoryControls();
});

// Category names are typed by hand, so they can contain the very
// characters that this file glues into HTML and into inline onclick
// handlers. "Jen's Stuff" used to end the attribute early and break
// the whole tab bar. escAttr() is for text landing inside a quoted
// attribute; escJs() is for text landing inside a '...' JS string
// that is itself inside an attribute, so it has to survive both.
function escAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');
}
function escJs(s) {
    return escAttr(String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
}

function renderCategoryControls() {
    const select = document.getElementById('libCategory');
    const tabs = document.getElementById('categoryTabs');
    const currentVal = select ? select.value : '';

    if(select) {
        select.innerHTML = availableCategories.map(cat => `<option value="${escAttr(cat)}">${escAttr(cat)}</option>`).join('');
        if(currentVal && availableCategories.includes(currentVal)) select.value = currentVal;
    }

    if(tabs) {
        const active = (c) => currentFilter === c ? ' active' : '';
        let tabHTML = `<button class="tab-btn${active('All')}" onclick="window.filterLibrary('All')">All</button>`;
        tabHTML += availableCategories.map(cat => `<button class="tab-btn${active(cat)}" onclick="window.filterLibrary('${escJs(cat)}')">${escAttr(cat)}</button>`).join('');
        tabs.innerHTML = tabHTML;
    }
}

// The old guard was `if (!finalUrl)`, which only ever caught an empty
// box — anything else, including a typo or a stray note, was archived
// as a tile pointing at nothing. A reference has to be a real http(s)
// address before it earns a slot in the grid.
function formatIgLink(url) {
    const raw = String(url || '').trim();
    if (!raw) return null;

    let parsed;
    try { parsed = new URL(raw); } catch (e) { return null; }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

    if (parsed.hostname.endsWith('instagram.com') && !raw.includes('/embed')) {
        const cleanBase = raw.split('?')[0];
        return cleanBase.replace(/\/$/, "") + "/embed";
    }
    return raw;
}

window.addToLibrary = function() {
    const urlInput = document.getElementById('libUrl');
    const catInput = document.getElementById('libCategory');
    const finalUrl = formatIgLink(urlInput.value);

    if (!finalUrl) return alert("Sam: That isn't a link — paste a full http:// or https:// address.");
    if (!catInput.value) return alert("Sam: Pick a category first.");

    libraryCol.add({
        url: finalUrl,
        category: catInput.value,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        urlInput.value = '';
    }).catch(e => {
        console.error(e);
        alert("Sam Error: Archive failed — the reference was not saved.");
    });
};

window.deleteLibItem = function(id) {
    if(confirm("Delete item?")) libraryCol.doc(id).delete();
};

// --- PAGINATION VARIABLES ---
let allItems = [];
let currentFilter = 'All';
let currentPage = 1;
const itemsPerPage = 10; // Only 10 items per slide

// Listen for Database Changes
libraryCol.orderBy("createdAt", "desc").onSnapshot((snapshot) => {
    allItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderGrid();
});

// Filter Function
window.filterLibrary = function(filter) {
    currentFilter = filter;
    currentPage = 1; // Always reset to Page 1 when filtering
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.innerText === filter || (filter === 'All' && btn.innerText === 'All')) btn.classList.add('active');
    });
    renderGrid();
};

// Pagination Controls
window.changePage = function(direction) {
    currentPage += direction;
    renderGrid();
    // Scroll back to top of grid smoothly
    document.querySelector('.router-bar').scrollIntoView({ behavior: 'smooth' });
};

// THE RENDER ENGINE
function renderGrid() {
    const grid = document.getElementById('libraryGrid');
    const btnPrev = document.getElementById('btnPrev');
    const btnNext = document.getElementById('btnNext');
    const pageInd = document.getElementById('pageIndicator');
    
    if(!grid) return;
    grid.innerHTML = '';

    // 1. Filter
    let filteredItems = currentFilter === 'All' ? allItems : allItems.filter(i => i.category === currentFilter);

    if (filteredItems.length === 0) {
        grid.innerHTML = '<div style="color:#ccc; padding:20px;">No references found.</div>';
        pageInd.innerText = "Page 0";
        if(btnPrev) btnPrev.disabled = true;
        if(btnNext) btnNext.disabled = true;
        return;
    }

    // 2. Paginate
    const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const itemsToShow = filteredItems.slice(startIndex, endIndex);

    // 3. Render
    itemsToShow.forEach(item => {
        const div = document.createElement('div');
        div.className = 'grid-item';
        div.innerHTML = `
            <iframe src="${escAttr(item.url)}" scrolling="no" loading="lazy"></iframe>

            <div class="move-btn" onclick="window.openModal('move', '${escJs(item.id)}')" title="Change Category">⇄</div>

            <div class="delete-btn" onclick="window.deleteLibItem('${escJs(item.id)}')" title="Delete">✕</div>
        `;
        grid.appendChild(div);
    });

    // 4. Update Controls
    if(pageInd) pageInd.innerText = `Page ${currentPage} of ${totalPages}`;
    if(btnPrev) btnPrev.disabled = (currentPage === 1);
    if(btnNext) btnNext.disabled = (currentPage === totalPages);
}