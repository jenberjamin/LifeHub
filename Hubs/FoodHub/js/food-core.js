// js/food-core.js

const foodCategories = [
    "BREAKFAST", "LUNCH", "DINNER", "BRUNCH", 
    "SNACKS", "DESSERT", "PRE-WORKOUT", "POST-WORKOUT", "STAPLE"
];

const drinkCategories = [
    "HOT DRINKS", "COLD DRINKS", "ICED DRINKS", 
    "PRE-WORKOUT", "POST-WORKOUT"
];

// --- UPDATED LIFEHUB CREDENTIALS ---
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
const dbRef = database.ref('foodList'); 

// --- DOM ELEMENTS ---
const addMenu = document.getElementById('addMenu');
const modal = document.getElementById('entryModal');
const categorySelect = document.getElementById('itemCategory');
const modalTitle = document.getElementById('modalTitle');
const optionalSection = document.getElementById('optionalMetrics');

// --- VARIABLES FOR SELECTION ---
let selectedRowKey = null;

// The row's data, kept alongside its key. renderRow() already has the
// whole item in hand, so EDIT can fill its form from memory instead of
// waiting on a round trip to asia-southeast1 before it paints.
let selectedRowItem = null;

// --- SMART FILTER VARIABLES ---
let activeSmartFilters = [];

const nutrientMap = [
    { label: "Saturated Fat", key: "Sat. Fat" },
    { label: "Trans Fat", key: "Trans Fat" },
    { label: "Cholesterol", key: "Cholesterol" },
    { label: "Sodium", key: "Sodium" },
    { label: "Potassium", key: "Potassium" },
    { label: "Magnesium", key: "Magnesium" },
    { label: "Fibers", key: "Fiber" },
    { label: "Sugars", key: "Sugars" },
    { label: "Calcium", key: "Calcium" },
    { label: "Iron", key: "Iron" },
    { label: "Zinc", key: "Zinc" },
    { label: "Alcohol", key: "Alcohol" },
    { label: "Vitamin C", key: "Vit C" },
    { label: "Vitamin A", key: "Vit A" },
    { label: "Vitamin E", key: "Vit E" },
    { label: "Vitamin B1", key: "Vit B1" },
    { label: "Vitamin B2", key: "Vit B2" },
    { label: "Vitamin D", key: "Vit D" }
];

// The shared macro reader and the daily targets. Said out loud rather
// than failing on an undefined further down, because the symptom would
// be an empty food list with one line in the console.
if (!window.LIFEHUB_FOOD) {
    console.error("🍽️ JS/lifehub-food-rules.js must load before food-core.js.");
}

// ── THE MICRONUTRIENT FIELDS ─────────────────────────────────────
// [input id, the key it is stored under]. ONE list, used by both the
// save and the load, because keeping two hand-written copies in step
// is what broke this modal: the load had an entry the form didn't.
//
// Sugar is deliberately absent — it is a macro box (sugarInput), not
// an optional micro, and lives in `macros` alongside calories.
const MICRO_FIELDS = [
    ['in_satFat',   'Sat. Fat'],
    ['in_transFat', 'Trans Fat'],
    ['in_chol',     'Cholesterol'],
    ['in_sod',      'Sodium'],
    ['in_pot',      'Potassium'],
    ['in_mag',      'Magnesium'],
    ['in_fib',      'Fiber'],
    ['in_calc',     'Calcium'],
    ['in_iron',     'Iron'],
    ['in_zinc',     'Zinc'],
    ['in_alc',      'Alcohol'],
    ['in_vitC',     'Vit C'],
    ['in_vitA',     'Vit A'],
    ['in_vitE',     'Vit E'],
    ['in_vitB1',    'Vit B1'],
    ['in_vitB2',    'Vit B2'],
    ['in_vitD',     'Vit D']
];

// Both skip an input that isn't on the page rather than throwing, so
// a stale id can only ever cost its own field.
function setFieldValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = (value === undefined || value === null) ? '' : value;
}

function getFieldValue(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
}

// --- HISTORY TRACKING ---
let globalConsumptionHistory = {};

// Listen to the 'dailyLogs' folder in the background
database.ref('dailyLogs').on('value', snapshot => {
    globalConsumptionHistory = snapshot.val() || {};
});

// ==========================================
// 1. DATA LISTENERS (THE HEARTBEAT)
// ==========================================

dbRef.on('value', (snapshot) => {
    const tableBody = document.getElementById('foodTableBody');
    tableBody.innerHTML = "";

    const data = snapshot.val();
    
    if (!data) return;

    Object.keys(data).forEach(key => {
        const item = data[key];
        renderRow(key, item);
    });

    // This listener rebuilds the whole table on every change — adding an
    // item, editing one, deleting one — so the chosen sort has to be
    // re-applied or it would silently snap back to key order the next
    // time anything was saved.
    applySort();

    filterTable();
});

// Helper: Draw a single row - FIXED VERSION
function renderRow(key, item) {
    const tableBody = document.getElementById('foodTableBody');
    const row = document.createElement('tr');
    
    row.style.cursor = "pointer";
    row.onclick = function() { openDetailModal(key, item); };
    
    // Attach data for filters - CRITICAL FIX
    row.dataset.category = item.category;
    row.dataset.micros = item.micros || "{}"; // Store for smart filters
    row.dataset.key = key; // Store the firebase key
    // Sorted on rather than the rendered cell, so a change to the name
    // column's markup can't quietly break A-Z.
    row.dataset.name = item.name || "";
    
    // parseBlob rather than JSON.parse: a row whose macros were stored
    // as an object rather than a string used to throw here and take the
    // whole list with it.
    const micros = window.LIFEHUB_FOOD.parseBlob(item.micros);
    const macros = window.LIFEHUB_FOOD.parseBlob(item.macros);

    // Sugar via the shared resolver, so an item that keeps its sugar in
    // the old micros["Sugars"] slot shows a number instead of a dash.
    const sugar = window.LIFEHUB_FOOD.sugarOf(macros, micros);

    row.innerHTML = `
        <td style="font-weight: 500;">${item.name}</td>
        <td style="font-weight: 300;">${item.serving}</td>
        <td class="nutri-val">${macros.cal}</td>
        <td class="nutri-val">${macros.fat}g</td>
        <td class="nutri-val">${macros.carb}g</td>
        <td class="nutri-val">${macros.prot}g</td>
        <td class="nutri-val">${sugar || '-'}g</td>
        <td class="nutri-val">${micros.Calcium || '-'}%</td>
        <td class="nutri-val">${micros.Iron || '-'}%</td>
        <td class="nutri-val">${micros.Sodium || '-'}mg</td>
        <td class="nutri-val">${micros.Fiber || '-'}g</td>
        <td class="nutri-val">${micros.Potassium || '-'}mg</td>
    `;

    tableBody.appendChild(row);
}

// ==========================================
// 2. SAVING & DELETING (THE ACTIONS)
// ==========================================

function saveEntry() {
    const name = document.getElementById('itemName').value || "Untitled";
    const amount = document.getElementById('servingAmount').value || "1";
    const unit = document.getElementById('servingUnit').value;
    const category = document.getElementById('itemCategory').value || "Uncategorized";
    const displayCategory = category.toUpperCase(); 
    
    const cal = document.getElementById('calInput').value || "0";
    const prot = document.getElementById('protInput').value || "0";
    const carb = document.getElementById('carbInput').value || "0";
    const fat = document.getElementById('fatInput').value || "0";
    const sugar = document.getElementById('sugarInput').value || "0";

    // Same list the load uses, so the two can't fall out of step.
    const micros = {};
    MICRO_FIELDS.forEach(([id, key]) => { micros[key] = getFieldValue(id); });

    const entryData = {
        name: name,
        serving: `${amount} ${unit}`,
        category: displayCategory,
        macros: JSON.stringify({ cal, prot, carb, fat, sugar }),
        micros: JSON.stringify(micros)
    };

    if (selectedRowKey) {
        dbRef.child(selectedRowKey).update(entryData);
    } else {
        dbRef.push(entryData);
    }

    closeModal();
    clearInputs(); 
}

// The key is held here while the confirm modal is open, because
// closeDetailModal() nulls selectedRowKey on its way out.
let pendingDeleteKey = null;

window.deleteCurrentEntry = function() {
    if (!selectedRowKey) return;

    pendingDeleteKey = selectedRowKey;

    const nameEl = document.getElementById('viewName');
    document.getElementById('confirmDeleteName').innerText = nameEl ? nameEl.innerText : "";

    closeDetailModal();
    document.getElementById('confirmDeleteModal').classList.remove('hidden');
};

window.confirmDeleteEntry = function() {
    if (pendingDeleteKey) {
        dbRef.child(pendingDeleteKey).remove();
    }
    closeConfirmDelete();
};

window.closeConfirmDelete = function() {
    document.getElementById('confirmDeleteModal').classList.add('hidden');
    pendingDeleteKey = null;
};

// Escape, or a click on the dimmed backdrop, cancels the delete.
document.addEventListener('keydown', function(e) {
    const box = document.getElementById('confirmDeleteModal');
    if (e.key === 'Escape' && box && !box.classList.contains('hidden')) {
        closeConfirmDelete();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const box = document.getElementById('confirmDeleteModal');
    if (box) {
        box.addEventListener('click', function(e) {
            if (e.target === box) closeConfirmDelete();
        });
    }
});

// ==========================================
// 3. UI INTERACTION (MODALS & MENUS)
// ==========================================

window.toggleMenu = function() {
    const addMenu = document.getElementById('addMenu');
    const filterMenu = document.getElementById('filterMenu');
    if (addMenu) addMenu.classList.toggle('hidden');
    if (filterMenu && !filterMenu.classList.contains('hidden')) {
        filterMenu.classList.add('hidden');
    }
}

function openModal(type) {
    selectedRowKey = null;
    selectedRowItem = null;
    addMenu.classList.add('hidden');
    modal.classList.remove('hidden');
    categorySelect.innerHTML = "";

    let options = (type === 'food') ? foodCategories : drinkCategories;
    modalTitle.innerText = (type === 'food') ? "+ NEW FOOD" : "+ NEW DRINK";

    options.forEach(cat => {
        let opt = document.createElement('option');
        opt.value = cat.toLowerCase();
        opt.innerText = cat;
        categorySelect.appendChild(opt);
    });
}

window.closeModal = function() {
    modal.classList.add('hidden');
    clearInputs();
    selectedRowKey = null;
    selectedRowItem = null;
}

window.toggleMetrics = function() {
    const metrics = document.getElementById('optionalMetrics');
    const icon = document.getElementById('toggleIcon');
    
    if (metrics.classList.contains('hidden')) {
        metrics.classList.remove('hidden');
        icon.innerText = 'expand_less';
    } else {
        metrics.classList.add('hidden');
        icon.innerText = 'expand_more';
    }
}

// Detail Modal - FIXED with consumption count
function openDetailModal(key, item) {
    selectedRowKey = key;
    selectedRowItem = item;

    const modal = document.getElementById('detailModal');
    document.getElementById('viewName').innerText = item.name;
    document.getElementById('viewServing').innerText = item.serving;
    document.getElementById('viewCategory').innerText = item.category;

    // Calculate consumption count - FIXED
    let timesConsumed = 0;
    Object.values(globalConsumptionHistory).forEach(dayLogs => {
        Object.values(dayLogs).forEach(log => {
            if (log.foodName && log.foodName === item.name) {
                timesConsumed++;
            }
        });
    });
    document.getElementById('viewTimesConsumed').innerText = timesConsumed;

    const macros = JSON.parse(item.macros || "{}");
    document.getElementById('disp_cal').innerText = macros.cal;
    document.getElementById('disp_prot').innerText = `${macros.prot}g`;
    document.getElementById('disp_carb').innerText = `${macros.carb}g`;
    document.getElementById('disp_fat').innerText = `${macros.fat}g`;
    document.getElementById('disp_sugar').innerText = `${macros.sugar || '0'}g`;

    const micros = JSON.parse(item.micros || "{}");
    const microsGrid = document.getElementById('microsGrid');
    microsGrid.innerHTML = "";
    
    Object.entries(micros).forEach(([key, val]) => {
        if (val && val.toString().trim() !== "") {
            const div = document.createElement('div');
            div.innerHTML = `<strong>${key}:</strong> ${val}`;
            microsGrid.appendChild(div);
        }
    });

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}

window.editCurrentEntry = function() {
    if (!selectedRowKey) return;

    // HELD before the modal closes.
    //
    // closeDetailModal() sets selectedRowKey to null — so the read on
    // the next line was dbRef.child(null), which Firebase throws on.
    // The detail panel shut, the edit form never opened, and the only
    // trace was an exception in the console. That is the whole of "the
    // edit button doesn't work".
    //
    // It is also needed AFTER the read: saveEntry() looks at
    // selectedRowKey to decide between update() and push(), so a null
    // one would have saved the edit as a second, duplicate food.
    const key = selectedRowKey;
    const cached = selectedRowItem;

    closeDetailModal();
    selectedRowKey = key;

    // The list is live (dbRef.on('value')), so the item openDetailModal
    // was handed is the current one — no reason to re-fetch it and make
    // the form wait on the network. The read stays as the fallback for
    // any path that reaches EDIT without a cached row.
    if (cached) {
        fillEditForm(cached);
    } else {
        dbRef.child(key).once('value', snapshot => {
            const item = snapshot.val();
            if (item) fillEditForm(item);
        });
    }
}

function fillEditForm(item) {
        modal.classList.remove('hidden');

        document.getElementById('itemName').value = item.name;
        
        const serving = item.serving.split(' ');
        document.getElementById('servingAmount').value = serving[0];
        document.getElementById('servingUnit').value = serving.slice(1).join(' ');

        categorySelect.innerHTML = "";
        const isFoodCat = foodCategories.includes(item.category);
        const options = isFoodCat ? foodCategories : drinkCategories;
        modalTitle.innerText = isFoodCat ? "EDIT FOOD" : "EDIT DRINK";

        options.forEach(cat => {
            let opt = document.createElement('option');
            opt.value = cat.toLowerCase();
            opt.innerText = cat;
            if (cat === item.category) opt.selected = true;
            categorySelect.appendChild(opt);
        });

        const macros = JSON.parse(item.macros || "{}");
        document.getElementById('calInput').value = macros.cal || '';
        document.getElementById('protInput').value = macros.prot || '';
        document.getElementById('carbInput').value = macros.carb || '';
        document.getElementById('fatInput').value = macros.fat || '';
        document.getElementById('sugarInput').value = macros.sugar || '';

        // ── MICROS ──────────────────────────────────────────────────
        // Driven by MICRO_FIELDS so the load here and the save in
        // saveEntry() read the same list and cannot drift apart.
        //
        // This was eighteen hand-written lines, and one of them —
        // in_sug, for "Sugars" — pointed at an input that does not
        // exist. Sugar was promoted to a macro box at some point and
        // the micro field went with it; this line didn't. So it threw
        // a TypeError on null, and because it sat eighth in the list,
        // EVERY field after it silently stopped loading: Calcium,
        // Iron, Zinc, Alcohol and all six vitamins came up blank —
        // and saving then wrote those blanks back over real values.
        //
        // Going through a helper that skips a missing input means the
        // same mistake can now only lose the one field, not the ten
        // behind it.
        const micros = JSON.parse(item.micros || "{}");
        MICRO_FIELDS.forEach(([id, key]) => setFieldValue(id, micros[key]));
}

// ==========================================
// 4. UTILITIES (FILTERS & CLEANUP)
// ==========================================

window.toggleCustomDropdown = function(menuId) {
    const menu = document.getElementById(menuId);
    
    // Close other dropdowns
    document.querySelectorAll('.dropdown-options').forEach(el => {
        if (el.id !== menuId) el.classList.add('hidden');
    });

    if (menu) menu.classList.toggle('hidden');
}

window.selectFilterType = function(value, text) {
    document.getElementById('filterType').value = value;
    document.getElementById('typeSelectedText').innerText = text;
    document.getElementById('typeOptions').classList.add('hidden');
    updateCategoryFilter();
}

window.selectFilterCategory = function(value, text) {
    document.getElementById('filterCategory').value = value;
    document.getElementById('catSelectedText').innerText = text;
    document.getElementById('catOptions').classList.add('hidden');
    filterTable();
}

// ── SORTING ───────────────────────────────────────────────────────
// "oldest" is the order the table has always come out in, so it stays
// the default and a first visit looks exactly as it did.
//
// There is no date field on a food item, and none is added here: a
// Firebase push key already encodes the moment it was created and
// sorts lexicographically in that same order. So the key IS the
// timestamp, for every row including the ones saved years ago.
//
// The CHOICE is remembered in localStorage rather than Firebase. It
// describes how Jen wants to look at the list, not anything about the
// food, so writing it to the shared database would put a view setting
// in with the data and cost a network round trip on every toggle.
// localStorage is instant and survives a refresh, which was the
// complaint. The tradeoff is that it's per-browser: set it on the
// laptop and the phone still opens on oldest-first.
const SORT_KEY = 'foodlist_sort';
const SORT_DEFAULT = 'oldest';
const SORT_VALUES = ['oldest', 'newest', 'az', 'za'];

// Private mode and cleared site data both throw or return null here,
// and a sort order is never worth breaking the page over.
function readStoredSort() {
    try {
        const saved = localStorage.getItem(SORT_KEY);
        return SORT_VALUES.indexOf(saved) !== -1 ? saved : SORT_DEFAULT;
    } catch (e) {
        return SORT_DEFAULT;
    }
}

let currentSort = readStoredSort();

window.toggleSortMenu = function() {
    const sortMenu = document.getElementById('sortMenu');
    const addMenu = document.getElementById('addMenu');
    const filterMenu = document.getElementById('filterMenu');

    // Only one of the three is ever open, same as toggleMenu().
    if (addMenu) addMenu.classList.add('hidden');
    if (filterMenu) filterMenu.classList.add('hidden');

    if (sortMenu) sortMenu.classList.toggle('hidden');
};

window.selectSort = function(value) {
    currentSort = SORT_VALUES.indexOf(value) !== -1 ? value : SORT_DEFAULT;

    try {
        localStorage.setItem(SORT_KEY, currentSort);
    } catch (e) {
        // Nothing to do — it just won't survive the refresh this time.
    }

    const menu = document.getElementById('sortMenu');
    if (menu) menu.classList.add('hidden');

    paintSortUI();
    applySort();
};

// Ticks the active row in the menu. The icon itself stays plain — the
// red dot belongs to the smart filter, where it means rows are being
// hidden from you. Sorting hides nothing, so a warning badge for it was
// the wrong borrowed signal.
function paintSortUI() {
    document.querySelectorAll('#sortMenu .menu-item').forEach(el => {
        el.classList.toggle('is-active', el.dataset.sort === currentSort);
    });
}

// Reorders the rows already in the table. It does NOT re-read Firebase
// and does not touch which rows are hidden — filterTable() owns that,
// and the two stay independent: sorting a filtered list keeps the
// filter, and filtering a sorted list keeps the sort.
function applySort() {
    const tableBody = document.getElementById('foodTableBody');
    if (!tableBody) return;

    const rows = Array.from(tableBody.querySelectorAll('tr'));
    if (rows.length < 2) return;

    // localeCompare with sensitivity:"base" so "eden cheese" files
    // beside "Eden Cheese" rather than after every capitalised name —
    // a plain > comparison puts all lowercase entries at the end.
    const byName = (a, b) =>
        (a.dataset.name || '').localeCompare(b.dataset.name || '',
                                             undefined, { sensitivity: 'base' });

    const byAge = (a, b) => {
        const ka = a.dataset.key || '';
        const kb = b.dataset.key || '';
        return ka < kb ? -1 : ka > kb ? 1 : 0;
    };

    let compare;
    if (currentSort === 'az')          compare = byName;
    else if (currentSort === 'za')     compare = (a, b) => byName(b, a);
    else if (currentSort === 'newest') compare = (a, b) => byAge(b, a);
    else                               compare = byAge;

    rows.sort(compare);

    // Into a fragment first, then one append: moving rows straight back
    // into the live table would reflow it once per row.
    const frag = document.createDocumentFragment();
    rows.forEach(r => frag.appendChild(r));
    tableBody.appendChild(frag);
}

function updateCategoryFilter() {
    const typeSelect = document.getElementById('filterType');
    const catSelectNative = document.getElementById('filterCategory');
    const catOptionsContainer = document.getElementById('catOptions');
    const selectedType = typeSelect ? typeSelect.value : 'all';

    if(catSelectNative) catSelectNative.innerHTML = '<option value="all">ALL CATEGORIES</option>';
    if(catOptionsContainer) catOptionsContainer.innerHTML = '<div class="dropdown-option" onclick="selectFilterCategory(\'all\', \'ALL CATEGORIES\')">ALL CATEGORIES</div>';
    
    const catSelectedText = document.getElementById('catSelectedText');
    if(catSelectedText) catSelectedText.innerText = 'ALL CATEGORIES';

    let options = [];
    if (selectedType === 'food') options = foodCategories;
    else if (selectedType === 'drink') options = drinkCategories;
    else options = [...foodCategories, ...drinkCategories];

    options.forEach(cat => {
        const val = cat.toLowerCase();
        const text = cat.toUpperCase();
        
        // Native
        if(catSelectNative) {
            let opt = document.createElement('option');
            opt.value = val; 
            opt.innerText = text; 
            catSelectNative.appendChild(opt);
        }

        // Custom
        if(catOptionsContainer) {
            let customOpt = document.createElement('div');
            customOpt.className = 'dropdown-option';
            customOpt.innerText = text;
            customOpt.onclick = () => selectFilterCategory(val, text);
            catOptionsContainer.appendChild(customOpt);
        }
    });
    
    filterTable();
}

function filterTable() {
    const typeSelect = document.getElementById('filterType').value;
    const catSelect = document.getElementById('filterCategory').value;
    const searchText = document.querySelector('.search-box').value.toLowerCase();

    const rows = document.querySelectorAll('#foodTableBody tr');

    rows.forEach(row => {
        const rowCategory = (row.dataset.category || "").toLowerCase();
        
        const categoryMatch = (catSelect === 'all') || (rowCategory === catSelect);

        let typeMatch = true;
        if (typeSelect === 'food') {
            const isFood = foodCategories.some(c => c.toLowerCase() === rowCategory);
            if (!isFood) typeMatch = false;
        } else if (typeSelect === 'drink') {
            const isDrink = drinkCategories.some(c => c.toLowerCase() === rowCategory);
            if (!isDrink) typeMatch = false;
        }

        const nameCell = row.querySelector('td'); 
        const rowName = nameCell ? nameCell.innerText.toLowerCase() : "";
        const searchMatch = rowName.includes(searchText);

        let smartMatch = true;
        if (activeSmartFilters.length > 0) {
            const micros = row.dataset.micros ? JSON.parse(row.dataset.micros) : {};

            const hasAll = activeSmartFilters.every(key => {
                const val = micros[key];
                return val && val.toString().trim() !== ""; 
            });

            if (!hasAll) smartMatch = false;
        }

        if (categoryMatch && typeMatch && searchMatch && smartMatch) {
            row.style.display = "";
        } else {
            row.style.display = "none";
        }
    });
}

function clearInputs() {
    const inputs = document.querySelectorAll('input');
    inputs.forEach(input => input.value = '');
    document.getElementById('servingAmount').value = '';
    document.getElementById('optionalMetrics').classList.add('hidden');
}

document.addEventListener('click', function(event) {
    const filterMenu = document.getElementById('filterMenu');
    const isClickInsideAdd = addMenu && addMenu.contains(event.target);
    const isClickInsideFilter = filterMenu && filterMenu.contains(event.target);
    const isButton = event.target.closest('.tool-icon');

    if (!isClickInsideAdd && !isButton && addMenu && !addMenu.classList.contains('hidden')) {
        addMenu.classList.add('hidden');
    }

    if (!isClickInsideFilter && !isButton && filterMenu && !filterMenu.classList.contains('hidden')) {
        filterMenu.classList.add('hidden');
    }

    const sortMenu = document.getElementById('sortMenu');
    const isClickInsideSort = sortMenu && sortMenu.contains(event.target);

    if (!isClickInsideSort && !isButton && sortMenu && !sortMenu.classList.contains('hidden')) {
        sortMenu.classList.add('hidden');
    }

    // Close custom dropdowns if clicking outside
    if (!event.target.closest('.custom-dropdown')) {
        document.querySelectorAll('.dropdown-options').forEach(el => el.classList.add('hidden'));
    }
});

document.addEventListener('DOMContentLoaded', () => {
    updateCategoryFilter();

    // The saved order is already in currentSort by now, so the rows come
    // out right on their own — this is only the tick and the dot, which
    // have no markup to read it from.
    paintSortUI();

    const searchInput = document.querySelector('.search-box');
    if (searchInput) {
        searchInput.addEventListener('input', filterTable);
    }
});

// --- SMART FILTER UI LOGIC ---

window.toggleSmartFilterMenu = function() {
    const filterMenu = document.getElementById('filterMenu');
    const addMenu = document.getElementById('addMenu');
    
    // Toggle logic
    if (filterMenu && !filterMenu.classList.contains('hidden')) {
        closeSmartFilter();
        return;
    }

    if (addMenu && !addMenu.classList.contains('hidden')) {
        addMenu.classList.add('hidden');
    }

    const container = document.getElementById('filterChipsContainer');
    if(container) container.innerHTML = "";

    nutrientMap.forEach(item => {
        const div = document.createElement('div');
        div.className = 'filter-chip';
        div.innerText = item.label;
        
        if (activeSmartFilters.includes(item.key)) {
            div.classList.add('active');
        }

        div.onclick = function() {
            toggleSmartFilter(div, item.key);
        };

        if(container) container.appendChild(div);
    });

    if(filterMenu) filterMenu.classList.remove('hidden');
}

window.closeSmartFilter = function() {
    const filterMenu = document.getElementById('filterMenu');
    if (filterMenu) filterMenu.classList.add('hidden');
}

function toggleSmartFilter(element, key) {
    if (activeSmartFilters.includes(key)) {
        activeSmartFilters = activeSmartFilters.filter(k => k !== key);
        element.classList.remove('active');
    } else {
        activeSmartFilters.push(key);
        element.classList.add('active');
    }

    // Real-time filtering and indicator
    const icon = document.getElementById('smartFilterIcon');
    if (icon) {
        if (activeSmartFilters.length > 0) {
            icon.classList.add('filter-glow');
        } else {
            icon.classList.remove('filter-glow');
        }
    }
    filterTable();
}

function clearSmartFilters() {
    activeSmartFilters = [];
    
    const icon = document.getElementById('smartFilterIcon');
    if(icon) icon.classList.remove('filter-glow');

    // Remove active class from all chips
    const chips = document.querySelectorAll('.filter-chip');
    chips.forEach(chip => chip.classList.remove('active'));

    filterTable();
}

function applySmartFilters() {
    closeSmartFilter();
}

window.closeDetailModal = function() {
    const detailModal = document.getElementById('detailModal');
    detailModal.classList.add('hidden');
    detailModal.style.display = 'none';
    selectedRowKey = null;
    // editCurrentEntry() reads selectedRowItem into a local before it
    // calls this, so clearing it here is safe.
    selectedRowItem = null;
};
