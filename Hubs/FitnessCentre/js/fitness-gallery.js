/* js/fitness-gallery.js */

// --- STATE MANAGEMENT ---
let currentPost = null;
let editingId = null;
let slideIndex = 0;

// The form's contents as it was opened, for the unsaved-changes check.
// null means no form is open.
let formSnapshot = null;

// Comparison State
let compLeftPost = null;
let compRightPost = null;
let activeCompCat = 'FRONT'; // Default view for comparison

// --- INITIALIZATION ---
window.onload = function() {
    // Basic check to ensure core.js is loaded
    if (typeof galleryPosts === 'undefined') { 
        console.warn("❖ Core Missing. Gallery using fallback mode.");
        window.galleryPosts = []; 
    }
    renderGrid();
};

/* localMidnight() now lives in fitness-core.js — the history log needed the
   same local-day parse, and a second copy is how these drift. */

/* The window each option in #timeFilter means, as [from, to).

   The dropdown has been in the markup all along with seven options and an
   onchange that calls renderGrid() — but renderGrid never read it, so every
   choice did nothing. Weeks start Sunday, matching the lobby HUD's bubbles. */
function timeRangeFor(key, today) {
    const now = today || new Date();
    const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
    const weekStart = d - now.getDay();

    switch (key) {
        case 'THIS_WEEK':  return { from: new Date(y, m, weekStart),     to: new Date(y, m, weekStart + 7) };
        case 'LAST_WEEK':  return { from: new Date(y, m, weekStart - 7), to: new Date(y, m, weekStart) };
        case 'THIS_MONTH': return { from: new Date(y, m, 1),             to: new Date(y, m + 1, 1) };
        case 'LAST_MONTH': return { from: new Date(y, m - 1, 1),         to: new Date(y, m, 1) };
        case 'THIS_YEAR':  return { from: new Date(y, 0, 1),             to: new Date(y + 1, 0, 1) };
        case 'LAST_YEAR':  return { from: new Date(y - 1, 0, 1),         to: new Date(y, 0, 1) };
        default:           return null;    // ALL, or anything unrecognised
    }
}

// --- GRID RENDER ---
function renderGrid() {
    const grid = document.getElementById('photoGrid');
    if (!grid) return;
    grid.innerHTML = '';
    
    const catFilter = document.getElementById('catFilter').value;
    const tagFilter = document.getElementById('tagFilter').value.toLowerCase();
    const dateFilter = document.getElementById('dateFilter').value;
    const timeFilter = document.getElementById('timeFilter').value;

    const range = timeRangeFor(timeFilter);

    // Sort a COPY. Array.sort works in place, so this was quietly reordering
    // core's galleryPosts every time the grid drew — and the next save wrote
    // that order back. filter(Boolean) comes first because the comparator
    // dereferences both sides: a null left by a bad restore would throw there
    // before any per-post guard could catch it.
    const displayPosts = galleryPosts.filter(Boolean).sort(
        (a, b) => (localMidnight(b.dateCaptured) || 0) - (localMidnight(a.dateCaptured) || 0));

    displayPosts.forEach(post => {
        // Filters
        if(dateFilter && post.dateCaptured !== dateFilter) return;

        // String(...) because a record restored from the cloud or written by
        // an older version may have no tag at all, and .toLowerCase() on
        // undefined took down the whole grid mid-search.
        if(tagFilter && !String(post.tag || '').toLowerCase().includes(tagFilter)) return;

        if (range) {
            const captured = localMidnight(post.dateCaptured);
            if (!captured || captured < range.from || captured >= range.to) return;
        }

        // Thumbnail Logic
        const images = Array.isArray(post.images) ? post.images.filter(i => i && i.url) : [];
        if (images.length === 0) return;          // nothing to show; used to throw

        let thumbnail = images[0].url;
        if(catFilter !== "DEFAULT") {
            const specificImg = images.find(img => img.cat === catFilter);
            if(!specificImg) return;
            thumbnail = specificImg.url;
        }

        const history = getStatsForDate(post.dateCaptured);

        const card = document.createElement('div');
        card.className = 'photo-card';
        card.onclick = () => openViewPost(post.id);
        card.innerHTML = `
            <img src="${thumbnail}" class="photo-img" alt=""
                 onerror="this.closest('.photo-card').classList.add('photo-missing')">
            <div class="card-overlay">
                <div class="card-date">${formatDate(post.dateCaptured)}</div>
                <div class="card-stats">${history.Weight} • ${post.tag || 'Update'}</div>
            </div>
        `;
        grid.appendChild(card);
    });
}

// --- CRUD: CREATE & EDIT ---
function openNewPost() {
    editingId = null;
    document.getElementById('npTitle').innerText = "NEW RECORD";
    document.getElementById('newPostOverlay').classList.add('active');

    // Clear FIRST, then seed the date. These two were the other way round,
    // and since inDate carries the .np-input class, clearForm() wiped the
    // date one line after it was set — so every new record opened blank and
    // refused to save with "Date Captured required".
    clearForm();
    document.getElementById('inDate').valueAsDate = new Date();

    // Baseline AFTER the date is seeded, so opening the form and closing it
    // again counts as no change rather than "you typed a date".
    formSnapshot = snapshotForm();
}

function triggerEdit() {
    if(!currentPost) return;
    editingId = currentPost.id;

    // Wipe before filling. This only ever wrote the slots the post actually
    // had, so a URL left in the form by the PREVIOUS edit survived into this
    // one and was saved onto it — editing a front-only post straight after a
    // front-and-back post quietly gave it the other post's back photo.
    clearForm();

    document.getElementById('viewPostOverlay').classList.remove('active');
    document.getElementById('newPostOverlay').classList.add('active');
    document.getElementById('npTitle').innerText = "EDIT RECORD";

    document.getElementById('inDate').value = currentPost.dateCaptured || '';
    document.getElementById('inTag').value = currentPost.tag || '';
    document.getElementById('inDiary').value = currentPost.diary || '';

    // Pre-fill links
    const slots = { FRONT: 'inFront', BACK: 'inBack', SIDE: 'inSide', UPPER: 'inUpper', LOWER: 'inLower' };
    (Array.isArray(currentPost.images) ? currentPost.images : []).forEach(img => {
        const field = img && slots[img.cat];
        if (field) document.getElementById(field).value = img.url || '';
    });

    // Baseline is the post as stored, so cancelling an edit you didn't
    // actually make closes without argument.
    formSnapshot = snapshotForm();
}

function savePost() {
    const frontUrl = document.getElementById('inFront').value;
    const capDate = document.getElementById('inDate').value;

    if(!frontUrl) { alert("System Alert: Front photo required for database."); return; }
    if(!capDate) { alert("System Alert: Date Captured required."); return; }

    let imgs = [{ cat: "FRONT", url: frontUrl }];
    if(document.getElementById('inBack').value) imgs.push({cat:"BACK", url:document.getElementById('inBack').value});
    if(document.getElementById('inSide').value) imgs.push({cat:"SIDE", url:document.getElementById('inSide').value});
    if(document.getElementById('inUpper').value) imgs.push({cat:"UPPER", url:document.getElementById('inUpper').value});
    if(document.getElementById('inLower').value) imgs.push({cat:"LOWER", url:document.getElementById('inLower').value});

    const postData = {
        id: editingId ? editingId : Date.now(),
        dateCaptured: capDate,
        // Local day, not the UTC one — an evening upload here is already
        // tomorrow in UTC and would have been stamped with the wrong date.
        datePosted: editingId ? currentPost.datePosted : localDay(new Date()),
        tag: document.getElementById('inTag').value || "Update",
        diary: document.getElementById('inDiary').value,
        images: imgs
    };

    if (editingId) {
        const idx = galleryPosts.findIndex(p => p.id === editingId);
        if(idx !== -1) galleryPosts[idx] = postData;
    } else {
        galleryPosts.push(postData);
    }

    saveSystemData(); // Call Core to save & Sync
    renderGrid();
    closeNewPost();   // same teardown as cancel/discard, snapshot included
}

function deletePost() {
    if(!currentPost) return;
    if(confirm("System Warning: Permanently delete this record?")) {
        galleryPosts = galleryPosts.filter(p => p.id !== currentPost.id);
        saveSystemData();
        renderGrid();
        closeViewPost();
    }
}

// --- COMPARISON LOGIC ---
function openComparison() {
    const sorted = [...galleryPosts].sort((a, b) => new Date(b.dateCaptured) - new Date(a.dateCaptured));
    if (sorted.length === 0) { alert("Insufficient data for analysis."); return; }

    document.getElementById('compOverlay').classList.add('active');
    populateCompDropdowns(sorted);

    document.getElementById('compDateRight').value = sorted[0].id;
    document.getElementById('compDateLeft').value = sorted.length > 1 ? sorted[1].id : sorted[0].id;
    
    setCompCat('FRONT'); // Reset to Front view
}

function populateCompDropdowns(sortedPosts) {
    const leftSel = document.getElementById('compDateLeft');
    const rightSel = document.getElementById('compDateRight');
    leftSel.innerHTML = ''; rightSel.innerHTML = '';

    sortedPosts.forEach(post => {
        const opt = document.createElement('option');
        opt.value = post.id;
        opt.text = formatDate(post.dateCaptured);
        
        leftSel.appendChild(opt.cloneNode(true));
        rightSel.appendChild(opt.cloneNode(true));
    });
}

function setCompCat(cat) {
    activeCompCat = cat;
    
    // Update Button Styles
    const buttons = document.querySelectorAll('.comp-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById('btn' + cat.charAt(0) + cat.slice(1).toLowerCase());
    if(activeBtn) activeBtn.classList.add('active');

    renderCompPanel('left');
    renderCompPanel('right');
}

function renderCompPanel(side) {
    const id = document.getElementById(side === 'left' ? 'compDateLeft' : 'compDateRight').value;
    const post = galleryPosts.find(p => p.id == id);

    if(side === 'left') compLeftPost = post; else compRightPost = post;
    if (!post) return;                        // empty dropdown; every line below reads it

    // Stats Render
    const stats = getStatsForDate(post.dateCaptured);
    const displayEl = document.getElementById(`${side}StatDisplay`);
    const bmiVal = (stats.BMI && stats.BMI !== "--") ? stats.BMI : "--";
    
    displayEl.innerHTML = `<span class="panel-stat-val">${bmiVal}</span><span class="panel-stat-unit">BMI</span>`;

    // Image Render
    const imgObj = (Array.isArray(post.images) ? post.images : [])
        .find(img => img && img.cat === activeCompCat && img.url);
    const imgEl = document.getElementById(`${side}Img`);
    const txtEl = document.getElementById(`${side}NoImg`);

    if (imgObj) {
        imgEl.src = imgObj.url;
        imgEl.style.display = 'block';
        txtEl.style.display = 'none';
    } else {
        imgEl.style.display = 'none';
        txtEl.style.display = 'block';
    }
    
    calculateDelta();
}

function calculateDelta() {
    if(!compLeftPost || !compRightPost) return;

    const w1 = parseFloat(getStatsForDate(compLeftPost.dateCaptured).Weight);
    const w2 = parseFloat(getStatsForDate(compRightPost.dateCaptured).Weight);
    
    if(!isNaN(w1) && !isNaN(w2)) {
        const diff = w2 - w1;
        const el = document.getElementById('deltaWeight');

        // Loss green, gain red — matching the Measurements compare view.
        // This page had it the other way round, so the same change in weight
        // was coloured green on one screen and red on the other. A delta of
        // exactly zero gets neither, as it does there.
        let cls = 'diff-val';
        if (diff < 0) cls += ' diff-green';
        else if (diff > 0) cls += ' diff-red';
        el.className = cls;

        el.innerText = (diff > 0 ? "+" : "") + diff.toFixed(1) + " kg";
    } else {
        document.getElementById('deltaWeight').innerText = "--";
    }
}

function closeComparison() {
    document.getElementById('compOverlay').classList.remove('active');
}

// --- VIEW POST LOGIC ---
function openViewPost(id) {
    currentPost = galleryPosts.find(p => p.id === id);
    if (!currentPost) return;                 // updateSlider() below reads it

    if (!Array.isArray(currentPost.images)) currentPost.images = [];
    slideIndex = 0;
    updateSlider();

    const history = getStatsForDate(currentPost.dateCaptured);

    document.getElementById('vpDateCapTitle').innerText = formatDate(currentPost.dateCaptured);
    document.getElementById('vpTagDisplay').innerText = currentPost.tag;
    document.getElementById('vpDatePost').innerText = formatDate(currentPost.datePosted);
    document.getElementById('vpWeight').innerText = history.Weight;
    document.getElementById('vpBMI').innerText = history.BMI;
    document.getElementById('vpDiaryDisplay').innerText = currentPost.diary || '';

    document.getElementById('viewPostOverlay').classList.add('active');
}

function closeViewPost() { document.getElementById('viewPostOverlay').classList.remove('active'); }

function slide(dir) {
    slideIndex += dir;
    if(slideIndex < 0) slideIndex = currentPost.images.length - 1;
    if(slideIndex >= currentPost.images.length) slideIndex = 0;
    updateSlider();
}

function updateSlider() {
    const images = (currentPost && Array.isArray(currentPost.images)) ? currentPost.images : [];
    const imgObj = images[slideIndex];
    if (!imgObj) {
        document.getElementById('vpImg').removeAttribute('src');
        document.getElementById('vpCatLabel').innerText = 'NO IMAGE';
        document.getElementById('vpDots').innerHTML = '';
        return;
    }

    document.getElementById('vpImg').src = imgObj.url;
    document.getElementById('vpCatLabel').innerText = imgObj.cat;

    const dotsContainer = document.getElementById('vpDots');
    dotsContainer.innerHTML = '';
    currentPost.images.forEach((_, idx) => {
        const dot = document.createElement('div');
        dot.style.width = '8px'; dot.style.height = '8px';
        dot.style.borderRadius = '50%'; 
        dot.style.background = idx === slideIndex ? 'var(--color-accent)' : 'rgba(255,255,255,0.2)';
        dotsContainer.appendChild(dot);
    });
}

// --- UTILITIES ---

/* Every field in the record form, in one place, so the dirty check and the
   snapshot can never drift apart. */
const FORM_FIELDS = ['inFront', 'inBack', 'inSide', 'inUpper', 'inLower', 'inDate', 'inTag', 'inDiary'];

/* What the form looked like when it opened. The fields are joined on a NUL
   character, which cannot be typed into a URL, a date or a diary — with a
   printable separator such as a space, two different sets of values could
   flatten to the same string and read as unchanged. */
function snapshotForm() {
    return FORM_FIELDS.map(id => {
        const el = document.getElementById(id);
        return el ? el.value : '';
    }).join('\u0000');
}

function isFormDirty() {
    return formSnapshot !== null && snapshotForm() !== formSnapshot;
}

/* The single way out of the form, so closing always leaves the same state
   behind however it was reached — cancelled, discarded, or saved. */
function closeNewPost() {
    document.getElementById('newPostOverlay').classList.remove('active');
    clearForm();
    formSnapshot = null;
    editingId = null;
}

function tryClosePost() {
    // Only warn when there is genuinely something to lose. This fired
    // unconditionally, so opening the form and immediately changing your
    // mind still produced "UNSAVED DATA DETECTED" — which teaches you to
    // dismiss the warning without reading it, exactly when it starts
    // mattering.
    if (!isFormDirty()) { closeNewPost(); return; }

    document.getElementById('safetyDialog').style.display = 'flex';
}

function confirmDiscard() {
    document.getElementById('safetyDialog').style.display = 'none';
    closeNewPost();
}

function clearForm() {
    document.querySelectorAll('.np-input').forEach(i => i.value = '');
    document.getElementById('inDiary').value = '';
}

function formatDate(dateStr) {
    // Parsed as a local day, so a photo dated the 14th never displays as the
    // 13th. Legacy records with no date get a dash rather than "INVALID DATE".
    const d = localMidnight(dateStr);
    if (!d) return "--";

    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return d.toLocaleDateString('en-US', options).toUpperCase();
}

/* --- LIVE VAULT ---
   Held back while the record form is open — isFormDirty() is the same test
   the unsaved-changes dialog uses, so a vault update can never discard a
   half-written post. The comparison view is left alone too: it holds two
   selected dates that a rebuild would reset. */
if (window.LIFEHUB_FITNESS) {
    window.LIFEHUB_FITNESS.onChange(function () {
        const form = document.getElementById('newPostOverlay');
        const comp = document.getElementById('compOverlay');
        if (form && form.classList.contains('active')) return;
        if (comp && comp.classList.contains('active')) return;

        renderGrid();
    });
}