====== SCRIPT MODULES & FIREBASE AUTH ======


<script type="module">
        // --- Firebase SDK Imports ---
        import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import { 
            getAuth, 
            signInAnonymously, 
            signInWithCustomToken, 
            onAuthStateChanged 
        } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
        import { 
            getFirestore, 
            doc, 
            getDoc,
            getDocs, 
            addDoc, 
            setDoc, 
            updateDoc, 
            deleteDoc, 
            onSnapshot, 
            collection, 
            query, 
            where, 
            writeBatch,
            arrayUnion,
            arrayRemove,
            setLogLevel
        } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

        // --- Firebase & App Initialization ---
        let app, db, auth;
        let userId = null;
        let appId = 'default-app-id';
        let basePath; 
        let settingsDoc; 

        // --- Collections ---
        let categoriesCol, subCategoriesCol, itemsCol;
        let modsCategoriesCol, modsItemsCol;
        let ccCategoriesCol, ccSubCategoriesCol, ccItemsCol; 
        let lotCategoriesCol, lotSubCategoriesCol, lotItemsCol; // [NEW] Lot Collections

        // --- Local data cache ---
        let localCategories = [], localSubCategories = [], localItems = [];
        let localModsCategories = [], localModsItems = [];
        let localCCCategories = [], localCCSubCategories = [], localCCItems = []; 
        let localLotCategories = [], localLotSubCategories = [], localLotItems = []; // [NEW] Lot Caches
        let localSettings = {}; 
        
        // --- Unsubscribe functions ---
        let unsubCategories = () => {}, unsubSubCategories = () => {}, unsubItems = () => {};
        let unsubModsCategories = () => {}, unsubModsItems = () => {};
        let unsubCCCategories = () => {}, unsubCCSubCategories = () => {}, unsubCCItems = () => {}; 
        let unsubLotCategories = () => {}, unsubLotSubCategories = () => {}, unsubLotItems = () => {}; // [NEW] Lot Unsubs
        let unsubSettings = () => {}; 

        // --- Application State ---
        let currentView = 'gallery-view';
        let confirmCallback = null;

        // CAS State
        let currentCategory = null, currentSubCategory = null, editingItemId = null;
        let currentPage = 1; 
        const itemsPerPage = 20; 

        // MODS State
        let currentModsCategory = null, editingModsItemId = null;
        let modsCurrentPage = 1;
        const modsItemsPerPage = 20;

        // CC State
        let currentCCCat = null, currentCCSubCat = null, editingCCItemId = null;
        let ccCurrentPage = 1;
        const ccItemsPerPage = 20;

        // [NEW] Lot State
        let currentLotCat = null, currentLotSubCat = null, editingLotItemId = null;
        let lotCurrentPage = 1;
        const lotItemsPerPage = 20;

        // --- Gameplay / Sims Collections ---
        let simsCol;
        let localSims = [];
        let unsubSims = () => {};
        let editingSimId = null;

        // Gameplay sim tag state (in-memory while modal is open)
        const simTagFields = [
            'sexualOrientation','traits','skills','aspiration','lifestyles',
            'likes','dislikes','turnons','turnoffs','relprefs',
            'degrees','career','business',
            'houseType','ownedBiz','resBizVenue','club'
        ];
        let simTagData = {};
 
        // Gameplay link-select fields (multi-sim selects)
        let simBestFriends = [];
        let simFriends = [];
 
        // Milestone / Life Event arrays
        let simMilestones = [];
        let simLifeEvents = [];

        // --- DOM Elements ---
        
        // Views
        const galleryView = document.getElementById('gallery-view');
        const casView = document.getElementById('cas-view');
        const subCategoryView = document.getElementById('sub-category-view');
        const itemView = document.getElementById('item-view');
        const modsCategoryView = document.getElementById('mods-category-view');
        const modsItemView = document.getElementById('mods-item-view');
        const ccView = document.getElementById('cc-view'); 
        const ccSubCategoryView = document.getElementById('cc-sub-category-view'); 
        const ccItemView = document.getElementById('cc-item-view'); 
        const lotView = document.getElementById('lot-view'); // [NEW]
        const lotSubCategoryView = document.getElementById('lot-sub-category-view'); // [NEW]
        const lotItemView = document.getElementById('lot-item-view'); // [NEW]
        
        // View 1 (Gallery)
        const gotoCasBtn = document.getElementById('goto-cas-btn');
        const gotoModsBtn = document.getElementById('goto-mods-btn');
        const gotoCCBtn = document.getElementById('goto-cc-btn'); 
        const gotoLotBtn = document.getElementById('goto-lot-btn'); // [NEW]
        const editGalleryBgBtn = document.getElementById('edit-gallery-bg-btn'); 

        // View 2 (CAS)
        const gotoGalleryBtn = document.getElementById('goto-gallery-btn');
        const categorySearch = document.getElementById('category-search');
        const categoryTagSearch = document.getElementById('category-tag-search'); // [NEW]
        const categoryButtonsContainer = document.getElementById('category-buttons');
        const addNewCategoryBtn = document.getElementById('add-new-category-btn');
        const newCategoryInputContainer = document.getElementById('new-category-input-container');
        const newCategoryNameInput = document.getElementById('new-category-name');
        const saveCategoryBtn = document.getElementById('save-category-btn');
        const cancelCategoryBtn = document.getElementById('cancel-category-btn');

        // View 3 (Sub-Category)
        const gotoCasViewBtn = document.getElementById('goto-cas-view-btn');
        const subCategoryTitle = document.getElementById('sub-category-title');
        const deleteCategoryBtn = document.getElementById('delete-category-btn');
        const subCategoryTagSearch = document.getElementById('sub-category-tag-search'); // [NEW]
        const subCategoryButtonsContainer = document.getElementById('sub-category-buttons');
        const addNewSubCategoryBtn = document.getElementById('add-new-sub-category-btn');
        const newSubCategoryInputContainer = document.getElementById('new-sub-category-input-container');
        const newSubCategoryNameInput = document.getElementById('new-sub-category-name');
        const saveSubCategoryBtn = document.getElementById('save-sub-category-btn');
        const cancelSubCategoryBtn = document.getElementById('cancel-sub-category-btn');
        const renameSubCategoryBtn = document.getElementById('rename-sub-category-btn');
        
        // View 4 (Item View)
        const gotoSubCategoryBtn = document.getElementById('goto-sub-category-btn');
        const itemViewTitle = document.getElementById('item-view-title');
        const deleteSubCategoryBtn = document.getElementById('delete-sub-category-btn');
        const creatorFilter = document.getElementById('creatorFilter');
        const ageGroupFilter = document.getElementById('ageGroupFilter');
        const genderFilter = document.getElementById('genderFilter');
        const tagsFilter = document.getElementById('tagsFilter');
        const nameSearchFilter = document.getElementById('nameSearchFilter');
        const itemsGrid = document.getElementById('itemsGrid');
        const addItemBtn = document.getElementById('addItemBtn');
        const itemCountDisplay = document.getElementById('itemCountDisplay');
        const prevPageBtn = document.getElementById('prevPageBtn');
        const nextPageBtn = document.getElementById('nextPageBtn');
        const pageIndicator = document.getElementById('pageIndicator');

        // View 5 (MODS Category)
        const gotoGalleryBtnFromMods = document.getElementById('goto-gallery-btn-from-mods');
        const modsCategorySearch = document.getElementById('mods-category-search');
        const modsCategoryTagSearch = document.getElementById('mods-category-tag-search'); // [NEW]
        const modsCategoryButtonsContainer = document.getElementById('mods-category-buttons');
        const addNewModsCategoryBtn = document.getElementById('add-new-mods-category-btn');
        const newModsCategoryInputContainer = document.getElementById('new-mods-category-input-container');
        const newModsCategoryNameInput = document.getElementById('new-mods-category-name');
        const saveModsCategoryBtn = document.getElementById('save-mods-category-btn');
        const cancelModsCategoryBtn = document.getElementById('cancel-mods-category-btn');

        // View 6 (MODS Item List)
        const gotoModsCategoryBtn = document.getElementById('goto-mods-category-btn');
        const modsItemViewTitle = document.getElementById('mods-item-view-title');
        const deleteModsCategoryBtn = document.getElementById('delete-mods-category-btn');
        const modsNameSearch = document.getElementById('modsNameSearch');
        const modsCreatorFilter = document.getElementById('modsCreatorFilter');
        const modsFunctionalityFilter = document.getElementById('modsFunctionalityFilter');
        const modsThemeFilter = document.getElementById('modsThemeFilter');
        const modsTagsFilter = document.getElementById('modsTagsFilter');
        const modsItemsList = document.getElementById('modsItemsList');
        const addModsItemBtn = document.getElementById('addModsItemBtn');
        const modsItemCountDisplay = document.getElementById('modsItemCountDisplay');
        const modsPrevPageBtn = document.getElementById('modsPrevPageBtn');
        const modsNextPageBtn = document.getElementById('modsNextPageBtn');
        const modsPageIndicator = document.getElementById('modsPageIndicator');

        // View 7 (CC Category)
        const gotoGalleryFromCCBtn = document.getElementById('goto-gallery-from-cc-btn');
        const ccCategorySearch = document.getElementById('cc-category-search');
        const ccCategoryTagSearch = document.getElementById('cc-category-tag-search'); // [NEW]
        const ccCategoryButtonsContainer = document.getElementById('cc-category-buttons');
        const addNewCCCatBtn = document.getElementById('add-new-cc-category-btn');
        const newCCCatInputContainer = document.getElementById('new-cc-category-input-container');
        const newCCCatNameInput = document.getElementById('new-cc-category-name');
        const saveCCCatBtn = document.getElementById('save-cc-category-btn');
        const cancelCCCatBtn = document.getElementById('cancel-cc-category-btn');

        // View 8 (CC Sub-Category)
        const gotoCCViewBtn = document.getElementById('goto-cc-view-btn');
        const ccSubCategoryTitle = document.getElementById('cc-sub-category-title');
        const deleteCCCatBtn = document.getElementById('delete-cc-category-btn');
        const ccSubCategoryTagSearch = document.getElementById('cc-sub-category-tag-search'); // [NEW]
        const ccSubCategoryButtonsContainer = document.getElementById('cc-sub-category-buttons');
        const addNewCCSubCatBtn = document.getElementById('add-new-cc-sub-category-btn');
        const newCCSubCatInputContainer = document.getElementById('new-cc-sub-category-input-container');
        const newCCSubCatNameInput = document.getElementById('new-cc-sub-category-name');
        const saveCCSubCatBtn = document.getElementById('save-cc-sub-category-btn');
        const cancelCCSubCatBtn = document.getElementById('cancel-cc-sub-category-btn');
        const renameCCSubCatBtn = document.getElementById('rename-cc-sub-category-btn');

        // View 9 (CC Item View)
        const gotoCCSubCatBtn = document.getElementById('goto-cc-sub-category-btn');
        const ccItemViewTitle = document.getElementById('cc-item-view-title');
        const deleteCCSubCatBtn = document.getElementById('delete-cc-sub-category-btn');
        const ccCreatorFilter = document.getElementById('ccCreatorFilter');
        const ccFunctionalityFilter = document.getElementById('ccFunctionalityFilter');
        const ccThemeFilter = document.getElementById('ccThemeFilter');
        const ccTagsFilter = document.getElementById('ccTagsFilter');
        const ccNameSearchFilter = document.getElementById('ccNameSearchFilter');
        const ccItemsGrid = document.getElementById('ccItemsGrid');
        const addCCItemBtn = document.getElementById('addCCItemBtn');
        const ccItemCountDisplay = document.getElementById('ccItemCountDisplay');
        const ccPrevPageBtn = document.getElementById('ccPrevPageBtn');
        const ccNextPageBtn = document.getElementById('ccNextPageBtn');
        const ccPageIndicator = document.getElementById('ccPageIndicator');

        // [NEW] View 10 (Lot Category)
        const gotoGalleryFromLotBtn = document.getElementById('goto-gallery-from-lot-btn');
        const lotCategorySearch = document.getElementById('lot-category-search');
        const lotCategoryTagSearch = document.getElementById('lot-category-tag-search');
        const lotCategoryButtonsContainer = document.getElementById('lot-category-buttons');
        const addNewLotCatBtn = document.getElementById('add-new-lot-category-btn');
        const newLotCatInputContainer = document.getElementById('new-lot-category-input-container');
        const newLotCatNameInput = document.getElementById('new-lot-category-name');
        const saveLotCatBtn = document.getElementById('save-lot-category-btn');
        const cancelLotCatBtn = document.getElementById('cancel-lot-category-btn');

        // [NEW] View 11 (Lot Sub-Category)
        const gotoLotViewBtn = document.getElementById('goto-lot-view-btn');
        const lotSubCategoryTitle = document.getElementById('lot-sub-category-title');
        const deleteLotCatBtn = document.getElementById('delete-lot-category-btn');
        const lotSubCategoryTagSearch = document.getElementById('lot-sub-category-tag-search');
        const lotSubCategoryButtonsContainer = document.getElementById('lot-sub-category-buttons');
        const addNewLotSubCatBtn = document.getElementById('add-new-lot-sub-category-btn');
        const newLotSubCatInputContainer = document.getElementById('new-lot-sub-category-input-container');
        const newLotSubCatNameInput = document.getElementById('new-lot-sub-category-name');
        const saveLotSubCatBtn = document.getElementById('save-lot-sub-category-btn');
        const cancelLotSubCatBtn = document.getElementById('cancel-lot-sub-category-btn');
        const renameLotSubCatBtn = document.getElementById('rename-lot-sub-category-btn');

        // [NEW] View 12 (Lot Item View)
        const gotoLotSubCatBtn = document.getElementById('goto-lot-sub-category-btn');
        const lotItemViewTitle = document.getElementById('lot-item-view-title');
        const deleteLotSubCatBtn = document.getElementById('delete-lot-sub-category-btn');
        const lotCreatorFilter = document.getElementById('lotCreatorFilter');
        const lotFunctionalityFilter = document.getElementById('lotFunctionalityFilter');
        const lotThemeFilter = document.getElementById('lotThemeFilter');
        const lotTagsFilter = document.getElementById('lotTagsFilter');
        const lotNameSearchFilter = document.getElementById('lotNameSearchFilter');
        const lotItemsGrid = document.getElementById('lotItemsGrid');
        const addLotItemBtn = document.getElementById('addLotItemBtn');
        const lotItemCountDisplay = document.getElementById('lotItemCountDisplay');
        const lotPrevPageBtn = document.getElementById('lotPrevPageBtn');
        const lotNextPageBtn = document.getElementById('lotNextPageBtn');
        const lotPageIndicator = document.getElementById('lotPageIndicator');


        // Item Modal (CAS)
        const itemModal = document.getElementById('itemModal');
        const modalTitle = document.getElementById('modalTitle');
        const closeModalBtn = document.getElementById('closeModalBtn');
        const itemName = document.getElementById('itemName');
        const itemCreatorInput = document.getElementById('itemCreatorInput'); 
        const itemCreatorList = document.getElementById('itemCreatorList'); 
        const deleteCreatorBtn = document.getElementById('deleteCreatorBtn');
        const itemAgeGroupInput = document.getElementById('itemAgeGroupInput'); 
        const itemAgeGroupList = document.getElementById('itemAgeGroupList'); 
        const deleteAgeGroupBtn = document.getElementById('deleteAgeGroupBtn'); 
        const itemGenderInput = document.getElementById('itemGenderInput'); 
        const itemGenderList = document.getElementById('itemGenderList'); 
        const deleteGenderBtn = document.getElementById('deleteGenderBtn'); 
        const itemTags = document.getElementById('itemTags');
        const itemImageUrl = document.getElementById('itemImageUrl');
        const itemDownloadLink = document.getElementById('itemDownloadLink');
        const itemPath = document.getElementById('itemPath');
        const deleteItemBtn = document.getElementById('deleteItemBtn');
        const cancelItemBtn = document.getElementById('cancelItemBtn');
        const saveItemBtn = document.getElementById('saveItemBtn');

        // Item Modal (MODS)
        const modsItemModal = document.getElementById('modsItemModal');
        const modsModalTitle = document.getElementById('modsModalTitle');
        const closeModsModalBtn = document.getElementById('closeModsModalBtn');
        const modsItemName = document.getElementById('modsItemName');
        const modsItemCreatorInput = document.getElementById('modsItemCreatorInput'); 
        const modsItemCreatorList = document.getElementById('modsItemCreatorList'); 
        const deleteModsCreatorBtn = document.getElementById('deleteModsCreatorBtn');
        const modsItemFunctionalityInput = document.getElementById('modsItemFunctionalityInput'); 
        const modsItemFunctionalityList = document.getElementById('modsItemFunctionalityList'); 
        const deleteModsFunctionalityBtn = document.getElementById('deleteModsFunctionalityBtn');
        const modsItemThemeInput = document.getElementById('modsItemThemeInput'); 
        const modsItemThemeList = document.getElementById('modsItemThemeList'); 
        const deleteModsThemeBtn = document.getElementById('deleteModsThemeBtn');
        const modsItemTags = document.getElementById('modsItemTags');
        const modsItemShortDesc = document.getElementById('modsItemShortDesc');
        const modsItemPageLink = document.getElementById('modsItemPageLink');
        const modsItemDownloadLink = document.getElementById('modsItemDownloadLink');
        const modsItemPath = document.getElementById('modsItemPath');
        const deleteModsItemBtn = document.getElementById('deleteModsItemBtn');
        const cancelModsItemBtn = document.getElementById('cancelModsItemBtn');
        const saveModsItemBtn = document.getElementById('saveModsItemBtn');
        
        // Item Modal (CC)
        const ccItemModal = document.getElementById('ccItemModal');
        const ccModalTitle = document.getElementById('ccModalTitle');
        const closeCCModalBtn = document.getElementById('closeCCModalBtn');
        const ccItemName = document.getElementById('ccItemName');
        const ccItemCreatorInput = document.getElementById('ccItemCreatorInput');
        const ccItemCreatorList = document.getElementById('ccItemCreatorList');
        const deleteCCCreatorBtn = document.getElementById('deleteCCCreatorBtn');
        const ccItemFunctionalityInput = document.getElementById('ccItemFunctionalityInput');
        const ccItemFunctionalityList = document.getElementById('ccItemFunctionalityList');
        const deleteCCFunctionalityBtn = document.getElementById('deleteCCFunctionalityBtn');
        const ccItemThemeInput = document.getElementById('ccItemThemeInput');
        const ccItemThemeList = document.getElementById('ccItemThemeList');
        const deleteCCThemeBtn = document.getElementById('deleteCCThemeBtn');
        const ccItemTags = document.getElementById('ccItemTags');
        const ccItemImageUrl = document.getElementById('ccItemImageUrl');
        const ccItemDownloadLink = document.getElementById('ccItemDownloadLink');
        const ccItemPath = document.getElementById('ccItemPath');
        const deleteCCItemBtn = document.getElementById('deleteCCItemBtn');
        const cancelCCItemBtn = document.getElementById('cancelCCItemBtn');
        const saveCCItemBtn = document.getElementById('saveCCItemBtn');
        
        // [NEW] Item Modal (Lot)
        const lotItemModal = document.getElementById('lotItemModal');
        const lotModalTitle = document.getElementById('lotModalTitle');
        const closeLotModalBtn = document.getElementById('closeLotModalBtn');
        const lotItemName = document.getElementById('lotItemName');
        const lotItemCreatorInput = document.getElementById('lotItemCreatorInput');
        const lotItemCreatorList = document.getElementById('lotItemCreatorList');
        const deleteLotCreatorBtn = document.getElementById('deleteLotCreatorBtn');
        const lotItemFunctionalityInput = document.getElementById('lotItemFunctionalityInput');
        const lotItemFunctionalityList = document.getElementById('lotItemFunctionalityList');
        const deleteLotFunctionalityBtn = document.getElementById('deleteLotFunctionalityBtn');
        const lotItemThemeInput = document.getElementById('lotItemThemeInput');
        const lotItemThemeList = document.getElementById('lotItemThemeList');
        const deleteLotThemeBtn = document.getElementById('deleteLotThemeBtn');
        const lotItemTags = document.getElementById('lotItemTags');
        const lotItemImageUrl = document.getElementById('lotItemImageUrl');
        const lotItemDownloadLink = document.getElementById('lotItemDownloadLink');
        const lotItemPath = document.getElementById('lotItemPath');
        const deleteLotItemBtn = document.getElementById('deleteLotItemBtn');
        const cancelLotItemBtn = document.getElementById('cancelLotItemBtn');
        const saveLotItemBtn = document.getElementById('saveLotItemBtn');

        // Confirmation Modal (Universal)
        const confirmModal = document.getElementById('confirmModal');
        const confirmText = document.getElementById('confirmText');
        const confirmYes = document.getElementById('confirmYes');
        const confirmNo = document.getElementById('confirmNo');

        // --- View Switching Logic ---
        function showView(viewId) {
            currentView = viewId;
            [galleryView, casView, subCategoryView, itemView, 
             modsCategoryView, modsItemView, 
             ccView, ccSubCategoryView, ccItemView,
             lotView, lotSubCategoryView, lotItemView // [NEW] Add lot views
            ].forEach(v => v.classList.add('hidden'));

            if (viewId === 'gallery-view') {
                applyGalleryBackground(); 
                galleryView.classList.remove('hidden');
            } else if (viewId === 'cas-view') {
                casView.classList.remove('hidden');
                currentCategory = null;
                renderCategoryButtons();
            } else if (viewId === 'sub-category-view') {
                if (!currentCategory) { showView('cas-view'); return; }
                subCategoryTitle.textContent = currentCategory.name.toUpperCase();
                subCategoryView.classList.remove('hidden');
                renderSubCategoryButtons();
            } else if (viewId === 'item-view') {
                 if (!currentSubCategory) { showView('sub-category-view'); return; }
                itemViewTitle.textContent = currentSubCategory.name.toUpperCase();
                itemView.classList.remove('hidden');
                currentPage = 1;
                populateFilters();
                renderItems();
            } else if (viewId === 'mods-category-view') { 
                modsCategoryView.classList.remove('hidden');
                currentModsCategory = null;
                renderModsCategoryButtons();
            } else if (viewId === 'mods-item-view') { 
                 if (!currentModsCategory) { showView('mods-category-view'); return; }
                
                if (currentModsCategory.bgUrl) {
                    modsItemView.style.backgroundImage = `url('${currentModsCategory.bgUrl}')`;
                } else {
                    modsItemView.style.backgroundImage = `url('https://i.imgur.com/TPpxQjA.jpeg')`;
                }
                
                modsItemViewTitle.textContent = currentModsCategory.name.toUpperCase();
                modsItemView.classList.remove('hidden');
                modsCurrentPage = 1; 
                populateModsFilters();
                renderModsItems();
            }
            else if (viewId === 'cc-view') {
                ccView.classList.remove('hidden');
                currentCCCat = null;
                renderCCCategories();
            } else if (viewId === 'cc-sub-category-view') {
                if (!currentCCCat) { showView('cc-view'); return; }
                ccSubCategoryTitle.textContent = currentCCCat.name.toUpperCase();
                ccSubCategoryView.classList.remove('hidden');
                renderCCSubCategories();
            } else if (viewId === 'cc-item-view') {
                if (!currentCCSubCat) { showView('cc-sub-category-view'); return; }
                ccItemViewTitle.textContent = currentCCSubCat.name.toUpperCase();
                ccItemView.classList.remove('hidden');
                ccCurrentPage = 1;
                populateCCFilters();
                renderCCItems();
            }
            // [NEW] Lot View Logic
            else if (viewId === 'lot-view') {
                lotView.classList.remove('hidden');
                currentLotCat = null;
                renderLotCategories();
            } else if (viewId === 'lot-sub-category-view') {
                if (!currentLotCat) { showView('lot-view'); return; }
                lotSubCategoryTitle.textContent = currentLotCat.name.toUpperCase();
                lotSubCategoryView.classList.remove('hidden');
                renderLotSubCategories();
            } else if (viewId === 'lot-item-view') {
                if (!currentLotSubCat) { showView('lot-sub-category-view'); return; }
                lotItemViewTitle.textContent = currentLotSubCat.name.toUpperCase();
                lotItemView.classList.remove('hidden');
                lotCurrentPage = 1;
                populateLotFilters();
                renderLotItems();
            }
        }

        // Apply gallery background
        function applyGalleryBackground() {
            if (localSettings.galleryBgUrl) {
                galleryView.style.backgroundImage = `url('${localSettings.galleryBgUrl}')`;
            } else {
                galleryView.style.backgroundImage = `url('https://i.imgur.com/SyuVLuZ.jpeg')`;
            }
        }
        
        // --- Confirmation Modal Logic (Generic) ---
        function showConfirm(text, onConfirm) {
            confirmText.textContent = text;
            confirmCallback = onConfirm;
            confirmModal.classList.remove('hidden');
        }
        confirmYes.addEventListener('click', () => {
            if (confirmCallback) { confirmCallback(); }
            confirmModal.classList.add('hidden');
            confirmCallback = null;
        });
        confirmNo.addEventListener('click', () => {
            confirmModal.classList.add('hidden');
            confirmCallback = null;
        });




// 
        // --- ================================================= ---
        // --- SCRIPT SECTION 5: FIREBASE AUTH & INIT          ---
        // --- ================================================= ---
        // 

        function initApp(uid) {
            userId = uid;
            basePath = `/artifacts/${appId}/users/${userId}`;
            
            // Init CAS collections
            categoriesCol = collection(db, `${basePath}/casCategories`);
            subCategoriesCol = collection(db, `${basePath}/casSubCategories`);
            itemsCol = collection(db, `${basePath}/casItems`);
            
            // Init MODS collections
            modsCategoriesCol = collection(db, `${basePath}/modsCategories`);
            modsItemsCol = collection(db, `${basePath}/modsItems`);
            
            // Init CC collections
            ccCategoriesCol = collection(db, `${basePath}/ccCategories`);
            ccSubCategoriesCol = collection(db, `${basePath}/ccSubCategories`);
            ccItemsCol = collection(db, `${basePath}/ccItems`);

            // [NEW] Init Lot collections
            lotCategoriesCol = collection(db, `${basePath}/lotCategories`);
            lotSubCategoriesCol = collection(db, `${basePath}/lotSubCategories`);
            lotItemsCol = collection(db, `${basePath}/lotItems`);

            // Init Sims collection
            simsCol = collection(db, `${basePath}/sims`);

            // Init Settings doc
            settingsDoc = doc(db, `${basePath}/settings/main`);

            [unsubCategories, unsubSubCategories, unsubItems, 
             unsubModsCategories, unsubModsItems, unsubSettings,
             unsubCCCategories, unsubCCSubCategories, unsubCCItems,
             unsubLotCategories, unsubLotSubCategories, unsubLotItems, unsubSims
            ].forEach(unsub => unsub());

            // --- Attach CAS listeners ---
            unsubCategories = onSnapshot(query(categoriesCol), (snapshot) => {
                localCategories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a,b) => a.name.localeCompare(b.name));
                if (currentView === 'cas-view') renderCategoryButtons();
            });
            unsubSubCategories = onSnapshot(query(subCategoriesCol), (snapshot) => {
                localSubCategories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a,b) => a.name.localeCompare(b.name));
                if (currentView === 'sub-category-view') renderSubCategoryButtons();
                if (currentView === 'item-view' && currentSubCategory) {
                    currentSubCategory = localSubCategories.find(s => s.id === currentSubCategory.id);
                    if(currentSubCategory) populateFilters();
                }
            });
            unsubItems = onSnapshot(query(itemsCol), (snapshot) => {
                localItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                if (currentView === 'item-view') renderItems();
                if (currentView === 'cas-view') renderCategoryButtons(); // For tag search
                if (currentView === 'sub-category-view') renderSubCategoryButtons(); // For tag search
            });
            
            // --- Attach MODS listeners ---
            unsubModsCategories = onSnapshot(query(modsCategoriesCol), (snapshot) => {
                localModsCategories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a,b) => a.name.localeCompare(b.name));
                if (currentView === 'mods-category-view') renderModsCategoryButtons();
                if (currentView === 'mods-item-view' && currentModsCategory) {
                    currentModsCategory = localModsCategories.find(c => c.id === currentModsCategory.id);
                    if(currentModsCategory) populateModsFilters();
                }
            });
            unsubModsItems = onSnapshot(query(modsItemsCol), (snapshot) => {
                localModsItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                if (currentView === 'mods-item-view') renderModsItems();
                if (currentView === 'mods-category-view') renderModsCategoryButtons(); // For tag search
            });

            // --- Attach CC listeners ---
            unsubCCCategories = onSnapshot(query(ccCategoriesCol), (snapshot) => {
                localCCCategories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a,b) => a.name.localeCompare(b.name));
                if (currentView === 'cc-view') renderCCCategories();
            });
            unsubCCSubCategories = onSnapshot(query(ccSubCategoriesCol), (snapshot) => {
                localCCSubCategories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a,b) => a.name.localeCompare(b.name));
                if (currentView === 'cc-sub-category-view') renderCCSubCategories();
                if (currentView === 'cc-item-view' && currentCCSubCat) {
                    currentCCSubCat = localCCSubCategories.find(s => s.id === currentCCSubCat.id);
                    if(currentCCSubCat) populateCCFilters();
                }
            });
            unsubCCItems = onSnapshot(query(ccItemsCol), (snapshot) => {
                localCCItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                if (currentView === 'cc-item-view') renderCCItems();
                if (currentView === 'cc-view') renderCCCategories(); // For tag search
                if (currentView === 'cc-sub-category-view') renderCCSubCategories(); // For tag search
            });

            // --- [NEW] Attach Lot listeners ---
            unsubLotCategories = onSnapshot(query(lotCategoriesCol), (snapshot) => {
                localLotCategories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a,b) => a.name.localeCompare(b.name));
                if (currentView === 'lot-view') renderLotCategories();
            });
            unsubLotSubCategories = onSnapshot(query(lotSubCategoriesCol), (snapshot) => {
                localLotSubCategories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a,b) => a.name.localeCompare(b.name));
                if (currentView === 'lot-sub-category-view') renderLotSubCategories();
                if (currentView === 'lot-item-view' && currentLotSubCat) {
                    currentLotSubCat = localLotSubCategories.find(s => s.id === currentLotSubCat.id);
                    if(currentLotSubCat) populateLotFilters();
                }
            });
            unsubLotItems = onSnapshot(query(lotItemsCol), (snapshot) => {
                localLotItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                if (currentView === 'lot-item-view') renderLotItems();
                if (currentView === 'lot-view') renderLotCategories(); // For tag search
                if (currentView === 'lot-sub-category-view') renderLotSubCategories(); // For tag search
            });


            // --- Attach Settings listener ---
            unsubSettings = onSnapshot(settingsDoc, (doc) => {
                if (doc.exists()) {
                    localSettings = doc.data();
                } else {
                    localSettings = {}; 
                }
                if (currentView === 'gallery-view') {
                    applyGalleryBackground();
                }
            });

                        // --- Attach Sims listener ---
            unsubSims = onSnapshot(query(simsCol), (snapshot) => {
                localSims = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                const gv = currentView;
                if (gv === 'generation-view') renderGenerationView();
                else if (gv === 'genealogy-view') renderGenealogyView();
                else if (gv === 'sims-profile-view') renderSimsProfileView();
                else if (gv === 'sims-roles-view') renderSimsRolesView();
                else if (gv === 'employment-view') renderEmploymentView();
                else if (gv === 'lifestyle-view') renderLifestyleView();
                else if (gv === 'residency-view') renderResidencyView();
            });
            
            console.log("All Firebase listeners attached for user:", userId);
            showView('gallery-view');
        }

        window.onload = async () => {
            appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            const firebaseConfig = typeof __firebase_config !== 'undefined' 
                ? JSON.parse(__firebase_config) 
                : {
                    apiKey: "AIzaSyAlt9mATV_kD9CNPkj9pTRZ92oNhqKPYg8",
                    authDomain: "sims-4-gallery.firebaseapp.com",
                    projectId: "sims-4-gallery",
                    storageBucket: "sims-4-gallery.firebasestorage.app",
                    messagingSenderId: "881427654109",
                    appId: "1:881427654109:web:6aaffa062ca2d6ad2e0234",
                    measurementId: "G-41V198HVRV"
                  };
            try {
                app = initializeApp(firebaseConfig);
                db = getFirestore(app);
                auth = getAuth(app);
                setLogLevel('debug');
                onAuthStateChanged(auth, (user) => {
                    if (user) {
                        console.log("User is signed in:", user.uid);
                        initApp('90vGdLGLABQTEppFvvfFjjLfCgC2');
                    } else {
                        console.log("User is not signed in.");
                    }
                });
                if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                    await signInWithCustomToken(auth, __initial_auth_token);
                } else {
                    await signInAnonymously(auth);
                }
            } catch (e) {
                console.error("Firebase initialization failed:", e);
                document.body.innerHTML = "<h1 class='text-white p-10'>Error: Could not connect to database.</h1>";
            }
        };