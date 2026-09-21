/* LifeHub Core System (Firebase Edition)
   - LOBBY: Real-time listener for Folders
   - ROOM: Real-time listener for Items + Smart Metadata + Image Support
*/

// --- 1. FIREBASE CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyAOgtrNsZFu0LaKW7uzHc61kBCNcBc2XSE",
    authDomain: "fitness-centre-aabaa.firebaseapp.com",
    projectId: "fitness-centre-aabaa",
    storageBucket: "fitness-centre-aabaa.firebasestorage.app",
    messagingSenderId: "706584906698",
    appId: "1:706584906698:web:0469958c2564db64775d33",
    measurementId: "G-V0VYYB9GMP"
};

// --- 2. INITIALIZE ---
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// Collections
const COL_FOLDERS = 'lifehub_mods_folders';
const COL_ITEMS = 'lifehub_mods_items';


document.addEventListener('DOMContentLoaded', () => {

    // --- IDENTIFY PAGE ---
    const isLobby = document.getElementById('folder-grid'); 
    const isRoom = document.getElementById('vault-grid');   

    // =========================================================
    // SECTION 1: THE LOBBY (Sims4-Mods.html)
    // =========================================================
    if (isLobby) {
        let deleteTargetId = null;
        let foldersData = []; 

        const ui = {
            grid: document.getElementById('folder-grid'),
            countLabel: document.getElementById('total-count'),
            modalEditor: document.getElementById('modal-editor'),
            titleEditor: document.getElementById('modal-title'),
            inputs: {
                id: document.getElementById('edit-id'),
                name: document.getElementById('inp-name'),
                icon: document.getElementById('inp-icon'),
                preview: document.getElementById('icon-preview')
            },
            modalDelete: document.getElementById('modal-delete'),
            labelDeleteName: document.getElementById('del-name'),
            btnSave: document.getElementById('btn-save'),
            btnCancelEdit: document.getElementById('btn-cancel-edit'),
            btnConfirmDel: document.getElementById('btn-confirm-del'),
            btnCancelDel: document.getElementById('btn-cancel-del')
        };

        const renderLobby = (folders) => {
            ui.grid.innerHTML = '';
            if(ui.countLabel) ui.countLabel.innerText = folders.length;
            foldersData = folders; 

            folders.forEach((folder) => {
                const folderHTML = `
                    <div class="folder-card relative group">
                        <div class="folder-actions flex gap-2">
                            <button onclick="window.triggerEdit('${folder.id}')" class="action-icon material-icons">edit</button>
                            <button onclick="window.triggerDelete('${folder.id}')" class="action-icon material-icons text-red-500">delete</button>
                        </div>
                        <a href="Sims4-Mods-Collections.html?collection=${encodeURIComponent(folder.name)}" class="flex-1 flex flex-col justify-between decoration-0">
                            <span class="material-symbols-outlined folder-icon">${folder.icon || 'folder_open'}</span>
                            <div class="folder-info">
                                <h2>${folder.name}</h2>
                                <p class="text-[10px] text-gray-500">OPEN COLLECTION</p>
                            </div>
                        </a>
                    </div>
                `;
                ui.grid.insertAdjacentHTML('beforeend', folderHTML);
            });

            const addButtonHTML = `
                <button id="btn-create" class="folder-card add-new cursor-pointer">
                    <span class="material-symbols-outlined">add</span>
                    <span>Create Collection</span>
                </button>
            `;
            ui.grid.insertAdjacentHTML('beforeend', addButtonHTML);
            document.getElementById('btn-create').addEventListener('click', openCreateModal);
        };

        db.collection(COL_FOLDERS).orderBy('name').onSnapshot((snapshot) => {
            const folders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderLobby(folders);
        });

        const saveFolder = () => {
            const name = ui.inputs.name.value.trim();
            const icon = ui.inputs.icon.value.trim() || 'folder_open';
            const id = ui.inputs.id.value;
            if (!name) return alert("Name required");

            if (id) {
                db.collection(COL_FOLDERS).doc(id).update({ name, icon });
            } else {
                db.collection(COL_FOLDERS).add({
                    name, icon,
                    creators: [], functionalities: [], themes: [], generationals: [],
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            closeModals();
        };

        const deleteFolder = () => {
            if (deleteTargetId) {
                db.collection(COL_FOLDERS).doc(deleteTargetId).delete();
                closeModals();
            }
        };

        const openCreateModal = () => {
            ui.inputs.id.value = ''; ui.inputs.name.value = ''; ui.inputs.icon.value = 'folder_open';
            ui.inputs.preview.innerText = 'folder_open'; ui.titleEditor.innerText = 'New Collection';
            ui.modalEditor.classList.add('active'); ui.inputs.name.focus();
        };
        const closeModals = () => {
            ui.modalEditor.classList.remove('active'); ui.modalDelete.classList.remove('active');
            deleteTargetId = null;
        };

        window.triggerEdit = (id) => {
            const folder = foldersData.find(c => c.id == id);
            if (folder) {
                ui.inputs.id.value = folder.id; ui.inputs.name.value = folder.name;
                ui.inputs.icon.value = folder.icon || 'folder_open'; ui.inputs.preview.innerText = folder.icon;
                ui.titleEditor.innerText = 'Edit Collection'; ui.modalEditor.classList.add('active');
            }
        };
        window.triggerDelete = (id) => {
            const folder = foldersData.find(c => c.id == id);
            if(folder) { deleteTargetId = id; ui.labelDeleteName.innerText = folder.name; ui.modalDelete.classList.add('active'); }
        };

        ui.btnSave.addEventListener('click', saveFolder);
        ui.btnConfirmDel.addEventListener('click', deleteFolder);
        ui.btnCancelEdit.addEventListener('click', closeModals);
        ui.btnCancelDel.addEventListener('click', closeModals);
        ui.inputs.icon.addEventListener('input', (e) => ui.inputs.preview.innerText = e.target.value.trim() || 'folder_open');
    }


    // =========================================================
    // SECTION 2: THE ROOM (Sims4-Mods-Collections.html)
    // =========================================================
    if (isRoom) {
        
        const params = new URLSearchParams(window.location.search);
        const currentCollection = params.get('collection');
        let currentItems = [];
        let currentFolderDocId = null;
        let metadata = { creators: [], functionalities: [], themes: [], generationals: [] };

        const titleEl = document.getElementById('vault-title');
        if (titleEl) {
            titleEl.innerText = currentCollection || "ALL ITEMS";
            document.title = `LifeHub: ${currentCollection || "Mods"}`;
        }

        const grid = document.getElementById('vault-grid');
        const modal = document.getElementById('modal-item');
        
        // --- FETCH FOLDER METADATA ---
        if (currentCollection) {
            db.collection(COL_FOLDERS).where('name', '==', currentCollection).limit(1).onSnapshot(snapshot => {
                if (!snapshot.empty) {
                    const doc = snapshot.docs[0];
                    currentFolderDocId = doc.id;
                    metadata = doc.data();
                    metadata.creators = metadata.creators || [];
                    metadata.functionalities = metadata.functionalities || [];
                    metadata.themes = metadata.themes || [];
                    metadata.generationals = metadata.generationals || [];
                }
            });
        }

        // --- FETCH ITEMS ---
        if (currentCollection) {
            db.collection(COL_ITEMS)
              .where('collection', '==', currentCollection)
              .onSnapshot((snapshot) => {
                  const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                  renderItems(items);
              });
        }
        
        // --- RENDER GRID ---
        const renderItems = (items) => {
            grid.innerHTML = '';
            currentItems = items; 

            if (items.length === 0) {
                grid.innerHTML = `
                    <div class="col-span-full flex flex-col items-center justify-center opacity-40 py-20 text-gray-500">
                        <span class="material-icons text-6xl mb-4">move_to_inbox</span>
                        <p class="font-bold uppercase tracking-widest">This collection is empty</p>
                    </div>
                `;
                return;
            }

            items.forEach(item => {
                // If image exists, use it. If not, use placeholder.
                const imageHTML = item.imageUrl ? 
                    `<img src="${item.imageUrl}" class="absolute inset-0 w-full h-full object-cover">` :
                    `<div class="absolute inset-0 flex items-center justify-center text-gray-300">
                        <span class="material-icons text-4xl">extension</span>
                     </div>`;

                const card = `
                    <div class="grid-card bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-xl transition-all cursor-pointer group" onclick="viewItem('${item.id}')">
                        <div class="h-40 bg-gray-100 relative overflow-hidden">
                             ${imageHTML}
                             <div class="absolute top-2 right-2 w-3 h-3 bg-[#18e248] rounded-full shadow-[0_0_8px_#18e248]"></div>
                        </div>
                        <div class="p-4">
                            <h3 class="font-display font-bold text-gray-800 uppercase truncate">${item.name}</h3>
                            <p class="text-xs font-bold text-[#18e248] uppercase tracking-wide truncate">${item.creator}</p>
                        </div>
                    </div>
                `;
                grid.insertAdjacentHTML('beforeend', card);
            });
        };

        const populateDatalist = (listId, array) => {
            const list = document.getElementById(listId);
            list.innerHTML = '';
            (array || []).sort().forEach(item => {
                const opt = document.createElement('option');
                opt.value = item;
                list.appendChild(opt);
            });
        };

        const openModal = () => {
            populateDatalist('list-creators', metadata.creators);
            populateDatalist('list-funcs', metadata.functionalities);
            populateDatalist('list-themes', metadata.themes);
            populateDatalist('list-gens', metadata.generationals);

            document.querySelectorAll('#modal-item input, #modal-item textarea').forEach(i => {
                i.value = '';
            });
            modal.classList.remove('hidden');
        };
        const closeModal = () => modal.classList.add('hidden');

        const saveItem = () => {
            const nameInput = document.getElementById('inp-item-name');
            if(!nameInput.value) return alert("Mod Name is required!");

            const creator = document.getElementById('inp-item-creator').value.trim();
            const func = document.getElementById('inp-item-func').value.trim();
            const theme = document.getElementById('inp-item-theme').value.trim();
            const gen = document.getElementById('inp-item-gen').value.trim();

            db.collection(COL_ITEMS).add({
                collection: currentCollection, 
                name: nameInput.value,
                creator: creator,
                functionality: func,
                theme: theme,
                generational: gen,
                tags: document.getElementById('inp-item-tags').value,
                description: document.getElementById('inp-item-desc').value,
                imageUrl: document.getElementById('inp-item-img').value,
                pageLink: document.getElementById('inp-item-link').value,
                downloadLink: document.getElementById('inp-item-dl').value,
                path: document.getElementById('inp-item-path').value,
                dateAdded: firebase.firestore.FieldValue.serverTimestamp()
            });

            if (currentFolderDocId) {
                const updates = {};
                if (creator) updates.creators = firebase.firestore.FieldValue.arrayUnion(creator);
                if (func) updates.functionalities = firebase.firestore.FieldValue.arrayUnion(func);
                if (theme) updates.themes = firebase.firestore.FieldValue.arrayUnion(theme);
                if (gen) updates.generationals = firebase.firestore.FieldValue.arrayUnion(gen);
                
                if (Object.keys(updates).length > 0) {
                    db.collection(COL_FOLDERS).doc(currentFolderDocId).update(updates);
                }
            }
            closeModal();
        };

        const deleteMetadata = (type) => {
            let fieldName = '';
            let inputId = '';
            
            if (type === 'creator') { fieldName = 'creators'; inputId = 'inp-item-creator'; }
            if (type === 'func') { fieldName = 'functionalities'; inputId = 'inp-item-func'; }
            if (type === 'theme') { fieldName = 'themes'; inputId = 'inp-item-theme'; }
            if (type === 'gen') { fieldName = 'generationals'; inputId = 'inp-item-gen'; }

            const val = document.getElementById(inputId).value.trim();
            if (!val) return alert("Type or select an option to remove it.");

            if (confirm(`Remove "${val}" from your list?`)) {
                if (currentFolderDocId) {
                    db.collection(COL_FOLDERS).doc(currentFolderDocId).update({
                        [fieldName]: firebase.firestore.FieldValue.arrayRemove(val)
                    });
                    document.getElementById(inputId).value = ''; 
                }
            }
        };

        // --- VIEW ITEM (INSPECTOR) ---
        window.viewItem = (id) => {
            const item = currentItems.find(i => i.id === id);
            if (!item) return;

            document.getElementById('inspector-empty').classList.add('hidden');
            document.getElementById('inspector-content').classList.remove('hidden');

            // Handle Image in Inspector
            const imgEl = document.getElementById('insp-img');
            const placeholderEl = document.getElementById('insp-placeholder');
            
            if (item.imageUrl) {
                imgEl.src = item.imageUrl;
                imgEl.classList.remove('hidden');
                placeholderEl.classList.add('hidden');
            } else {
                imgEl.classList.add('hidden');
                placeholderEl.classList.remove('hidden');
            }

            document.getElementById('insp-title').innerText = item.name;
            document.getElementById('insp-creator').innerText = item.creator || 'Unknown';
            document.getElementById('insp-category').innerText = item.collection;
            document.getElementById('insp-desc').innerText = item.description || 'No description provided.';
            document.getElementById('insp-theme').innerText = item.theme || '--';
            document.getElementById('insp-gen').innerText = item.generational || '--';
            
            const pathEl = document.getElementById('insp-path');
            if(pathEl) pathEl.innerText = item.path || 'Path not set';
            
            const btn = document.getElementById('btn-download');
            btn.href = item.pageLink || item.downloadLink || '#';
            btn.innerHTML = (item.pageLink || item.downloadLink) ? 
                `<span class="material-symbols-outlined">public</span> VISIT PAGE` : 
                `<span class="material-symbols-outlined">link_off</span> NO LINK`;
        };

        // --- LISTENERS ---
        const btnAdd = document.getElementById('btn-add-mod');
        const btnClose = document.getElementById('btn-close-item');
        const btnCancel = document.getElementById('btn-cancel-item');
        const btnSave = document.getElementById('btn-save-item');

        const btnDelCreator = document.getElementById('btn-del-creator');
        const btnDelFunc = document.getElementById('btn-del-func');
        const btnDelTheme = document.getElementById('btn-del-theme');
        const btnDelGen = document.getElementById('btn-del-gen');


        if(btnAdd) btnAdd.addEventListener('click', openModal);
        if(btnClose) btnClose.addEventListener('click', closeModal);
        if(btnCancel) btnCancel.addEventListener('click', closeModal);
        if(btnSave) btnSave.addEventListener('click', saveItem);

        if(btnDelCreator) btnDelCreator.addEventListener('click', () => deleteMetadata('creator'));
        if(btnDelFunc) btnDelFunc.addEventListener('click', () => deleteMetadata('func'));
        if(btnDelTheme) btnDelTheme.addEventListener('click', () => deleteMetadata('theme'));
        if(btnDelGen) btnDelGen.addEventListener('click', () => deleteMetadata('gen'));
    }

});