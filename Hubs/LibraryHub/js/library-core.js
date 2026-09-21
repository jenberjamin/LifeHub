/* =========================================
   LIFEHUB | LIBRARY CORE ENGINE
   "The Digital Librarian + The Vault"
   ========================================= */

const DB_NAME = 'LifeHub_LibraryVault';
let libraryData = JSON.parse(localStorage.getItem(DB_NAME)) || [];

// Fallback art for books with no cover. This pointed at via.placeholder.com,
// which has shut down -- every coverless search result was a broken image.
// Inline SVG needs no network and cannot rot. The viewBox scales to any size.
const NO_COVER = "data:image/svg+xml;charset=UTF-8,"
    + "%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20300%20450'%3E"
    + "%3Crect%20width='300'%20height='450'%20fill='rgb(17,17,17)'/%3E"
    + "%3Ctext%20x='150'%20y='232'%20fill='rgb(110,105,85)'%20font-family='serif'"
    + "%20font-size='22'%20text-anchor='middle'%3ENo%20Cover%3C/text%3E%3C/svg%3E";
let tempBookData = null; 
let currentBookID = null; 
let currentFormatView = 'text';
let currentStatusFilter = 'all'; 

/* =========================================
   0. THE VAULT MANAGER (IndexedDB)
   Handles the heavy files so we don't crash LocalStorage
   ========================================= */
const CONTENT_DB_NAME = "LifeHub_BookContent";
let db;

const dbRequest = indexedDB.open(CONTENT_DB_NAME, 1);

dbRequest.onupgradeneeded = function(event) {
    const db = event.target.result;
    if (!db.objectStoreNames.contains('books')) {
        db.createObjectStore('books', { keyPath: 'id' });
    }
};

dbRequest.onsuccess = function(event) {
    db = event.target.result;
    console.log("Vault Storage: Online");
};

dbRequest.onerror = function(event) {
    console.error("Vault Error:", event.target.errorCode);
};

// Save Text to Vault
function saveBookContentToVault(id, text) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['books'], 'readwrite');
        const store = transaction.objectStore('books');
        const request = store.put({ id: id, content: text });

        request.onsuccess = () => resolve();
        request.onerror = () => reject("Storage failed");
    });
}

// Load Text from Vault
function getBookContentFromVault(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['books'], 'readonly');
        const store = transaction.objectStore('books');
        const request = store.get(id);

        request.onsuccess = () => {
            if (request.result) resolve(request.result.content);
            else reject("Book content not found.");
        };
        request.onerror = () => reject("Retrieval failed");
    });
}



/* === THE SHARED SHELF (Books for Sister) === */
const SHARED_BOOKS = [
    {
        id: "shared_428",
        title: "The Hunger Games",
        authors: ["Suzanne Collins"],
        genre: "Dystopian, Science Fiction, Thriller",
        publishYear: "2008",
        awards: "Cybils Award for Young Adult Speculative Fiction (Winner), Golden Duck Award – Hal Clement Award (Winner)",
        isbn: "978-0439023481",
        characters: "Katniss Everdeen, Peeta Mellark, Gale Hawthorne, Haymitch Abernathy, President Coriolanus Snow, Effie Trinket",
        description: "The Hunger Games follows Katniss Everdeen, a teenage girl forced into a televised fight to the death where children are sacrificed to maintain a tyrannical government’s control. As she fights to survive, her defiance turns her into a symbol of resistance against an oppressive system.",
        cover: "./book-covers/the-hunger-games.webp",
        filePath: "./shared-library/the-hunger-games.txt",
        fileType: "text",
        status: "tbr",
        dateAdded: new Date().toISOString(),
        hasFile: true 
    },
    {
        id: "shared_02",
        title: "Catching Fire",
        authors: ["Suzanne Collins"],
        genre: "Dystopian, Science Fiction, Thriller",
        publishYear: "2009",
        awards: "Golden Duck Award – Hal Clement Award (Winner), Geffen Award for Young Adult Science Fiction (Winner)", 
        isbn: "9780545227247",
        characters: "Katniss Everdeen, Peeta Mellark, Haymitch Abernathy, Finnick Odair, Johanna Mason, Plutarch Heavensbee, President Coriolanus Snow", 
        description: "Katniss and Peeta’s survival sparks unrest across Panem, forcing the Capitol to retaliate by throwing past victors back into the arena. The Games become a battleground not just for survival, but for rebellion.", 
        cover: "./book-covers/catching-fire.webp",
        filePath: "./shared-library/Catching Fire.txt",
        fileType: "text",
        status: "tbr",
        dateAdded: new Date().toISOString(),
        hasFile: true 
    },
    {
        id: "shared_03",
        title: "Mockingjay",
        authors: ["Suzanne Collins"],
        genre: "Dystopian, Science Fiction, Thriller",
        publishYear: "2010",
        awards: "Geffen Award for Young Adult Science Fiction (Winner), Andre Norton Award (Finalist)", 
        isbn: "9780439023511",
        characters: "Katniss Everdeen, Peeta Mellark, Gale Hawthorne, President Coriolanus Snow, President Alma Coin, Primrose Everdeen, Finnick Odair", 
        description: "Katniss becomes the reluctant face of a full-scale revolution as Panem descends into war. Victory comes at a devastating personal cost, exposing how power corrupts on every side.", 
        cover: "./book-covers/mockingjay.webp",
        filePath: "./shared-library/Mockingjay.txt",
        fileType: "text",
        status: "tbr",
        dateAdded: new Date().toISOString(),
        hasFile: true 
    },
    {
        id: "shared_04",
        title: "The Ballad of Songbirds and Snakes",
        authors: ["Suzanne Collins"],
        genre: "Dystopian, Science Fiction, Thriller",
        publishYear: "2020",
        awards: "Geffen Award for Science Fiction (Winner)", 
        isbn: "9780702300172",
        characters: "Coriolanus Snow, Lucy Gray Baird, Sejanus Plinth, Dr. Volumnia Gaul, Tigris Snow, Dean Highbottom", 
        description: "Set decades earlier, the story follows young Coriolanus Snow as he mentors a tribute and begins his transformation into the tyrant he will become. It explores how ambition, fear, and control are cultivated—not born.", 
        cover: "./book-covers/the-ballad-of-songbirds-and-snakes.webp",
        filePath: "./shared-library/The Ballad of Songbirds and Snakes.txt",
        fileType: "text",
        status: "tbr",
        dateAdded: new Date().toISOString(),
        hasFile: true 
    },
    {
        id: "shared_05",
        title: "Sunrise on the Reaping",
        authors: ["Suzanne Collins"],
        genre: "Dystopian, Science Fiction, Thriller",
        publishYear: "2025",
        awards: "Goodreads Choice Award for Young Adult Fantasy (Winner), Dragon Award for Best Young Adult Novel (Winner)", 
        isbn: "9781546171461",
        characters: "Haymitch Abernathy, Maysilee Donner, President Coriolanus Snow, Capitol Gamemakers", 
        description: "This prequel centers on Haymitch Abernathy’s Hunger Games, revealing how trauma, manipulation, and loss shape a broken victor long before Katniss enters the arena. Bleak, strategic, and quietly tragic.", 
        cover: "./book-covers/sunrise-on-the-reaping.webp",
        filePath: "./shared-library/Sunrise on the Reaping.txt",
        fileType: "text",
        status: "tbr",
        dateAdded: new Date().toISOString(),
        hasFile: true 
    },

{
        id: "shared_28",
        title: "Miss Peregrine's Home For Peculiar Children",
        authors: ["Ransom Riggs"],
        genre: "Dark Fantasy, Gothic Fiction, Supernatural Adventure, Young Adult Fantasy, Mystery",
        publishYear: "2011",
        awards: "Amazon’s 100 Young Adult Books to Read in a Lifetime, New York Times #1 Bestseller", 
        isbn: "9781594744761",
        characters: "Jacob Portman, Emma Bloom, Alma LeFay Peregrine, Millard Nullings, Bronwyn Bruntley, Enoch O’Connor, Olive Abroholos Elephanta, Bronwyn’s brother Victor Bruntley, Horace Somnusson, Hugh Apiston, Fiona Frauenfeld, Claire Densmore", 
        description: "After his grandfather’s violent death, 16-year-old Jacob Portman follows clues to a mysterious Welsh island where he finds a time-looped orphanage filled with children who possess strange supernatural abilities and must help protect them from hidden dangers lurking beyond time.", 
        cover: "./book-covers/Miss-Peregrines-Home-For-Peculiar-Children.webp",
        filePath: "./shared-library/Miss Peregrine's Home For Peculiar Children.pdf",
        fileType: "pdf",
        status: "tbr",
        dateAdded: new Date().toISOString(),
        hasFile: true 
    },


{
        id: "shared_31",
        title: "The Desolations Of Devil's Acre",
        authors: ["Ransom Riggs"],
        genre: "Dark Fantasy, Gothic Fiction, Supernatural Adventure, Young Adult Fantasy, Mystery",
        publishYear: "2021",
        awards: "New York Times Bestseller", 
        isbn: "9780143124245",
        characters: "Jacob Portman, Emma Bloom, Alma LeFay Peregrine, Millard Nullings, Bronwyn Bruntley, Enoch O’Connor, Olive Abroholos Elephanta, Horace Somnusson, Hugh Apiston, Claire Densmore, Fiona Frauenfeld, Victor Bruntley, Caul, Jacob's father Abe Portman", 
        description: "Jacob Portman and his peculiar friends embark on a dangerous mission across the United States to unite peculiars and confront powerful enemies, while unraveling the full extent of the mysteries surrounding time loops and the peculiar legacy of Miss Peregrine.", 
        cover: "./book-covers/The-Desolations-Of-Devils-Acre.jpg",
        filePath: "./shared-library/The Desolations Of Devil's Acre.pdf",
        fileType: "pdf",
        status: "tbr",
        dateAdded: new Date().toISOString(),
        hasFile: true 
    },

{
        id: "shared_26",
        title: "Hollow City",
        authors: ["Ransom Riggs"],
        genre: "Dark Fantasy, Gothic Fiction, Supernatural Adventure, Young Adult Fantasy, Mystery",
        publishYear: "2012",
        awards: "New York Times Bestseller", 
        isbn: "0783324956597",
        characters: "Jacob Portman, Emma Bloom, Alma LeFay Peregrine, Millard Nullings, Bronwyn Bruntley, Enoch O’Connor, Olive Abroholos Elephanta, Horace Somnusson, Hugh Apiston, Claire Densmore, Fiona Frauenfeld", 
        description: "Jacob Portman and his peculiar friends embark on a perilous journey across war‑torn London to rescue other peculiar children trapped in the past, facing deadly hollowgasts and unraveling secrets about time loops and their mysterious guardian, Miss Peregrine.", 
        cover: "./book-covers/Hollow-City.webp",
        filePath: "./shared-library/Hollow City.pdf",
        fileType: "pdf",
        status: "tbr",
        dateAdded: new Date().toISOString(),
        hasFile: true 
    },
{
        id: "shared_251",
        title: "The Conference Of The Birds",
        authors: ["Ransom Riggs"],
        genre: "Dark Fantasy, Gothic Fiction, Supernatural Adventure, Young Adult Fantasy, Mystery",
        publishYear: "2020",
        awards: "New York Times Bestseller", 
        isbn: "9780593110157",
        characters: "Jacob Portman, Emma Bloom, Alma LeFay Peregrine, Millard Nullings, Bronwyn Bruntley, Enoch O’Connor, Olive Abroholos Elephanta, Horace Somnusson, Hugh Apiston, Claire Densmore, Fiona Frauenfeld, Victor Bruntley, Caul, Jacob's father Abe Portman", 
        description: "Jacob Portman and his peculiar friends embark on a dangerous mission across the United States to unite peculiars and confront powerful enemies, while unraveling the full extent of the mysteries surrounding time loops and the peculiar legacy of Miss Peregrine.", 
        cover: "./book-covers/The-Conference-Of-The-Birds.jpg",
        filePath: "./shared-library/The Conference Of The Birds.pdf",
        fileType: "pdf",
        status: "tbr",
        dateAdded: new Date().toISOString(),
        hasFile: true 
    },
{
        id: "shared_24",
        title: " Library Of Souls",
        authors: ["Ransom Riggs"],
        genre: "Dark Fantasy, Gothic Fiction, Supernatural Adventure, Young Adult Fantasy, Mystery",
        publishYear: "2015",
        awards: "New York Times Bestseller", 
        isbn: "9781594749315",
        characters: "Jacob Portman, Emma Bloom, Alma LeFay Peregrine, Millard Nullings, Bronwyn Bruntley, Enoch O’Connor, Olive Abroholos Elephanta, Horace Somnusson, Hugh Apiston, Claire Densmore, Fiona Frauenfeld, Victor Bruntley, Caul", 
        description: "Jacob Portman and his friends enter the legendary Library of Souls to rescue their kidnapped companions, confront the deadly wights, and uncover truths about their peculiar abilities while facing increasingly dangerous threats across time.", 
        cover: "./book-covers/Library-Of-Souls.webp",
        filePath: "./shared-library/Library Of Souls.pdf",
        fileType: "pdf",
        status: "tbr",
        dateAdded: new Date().toISOString(),
        hasFile: true 
    },
{
        id: "shared_23",
        title: "A Map Of Days",
        authors: ["Ransom Riggs"],
        genre: "Dark Fantasy, Gothic Fiction, Supernatural Adventure, Young Adult Fantasy, Mystery",
        publishYear: "2018",
        awards: "New York Times Bestseller", 
        isbn: "0735231486",
        characters: "Jacob Portman, Emma Bloom, Alma LeFay Peregrine, Millard Nullings, Bronwyn Bruntley, Enoch O’Connor, Olive Abroholos Elephanta, Horace Somnusson, Hugh Apiston, Claire Densmore, Fiona Frauenfeld, Victor Bruntley, Caul, Jacob's father Abe Portman", 
        description: "Jacob Portman discovers the modern peculiar world and the challenges it brings as he navigates new alliances, uncovers hidden secrets, and faces threats that extend beyond the time loops, all while protecting his peculiar friends and the legacy of Miss Peregrine.", 
        cover: "./book-covers/A-Map-Of-Days.webp",
        filePath: "./shared-library/A Map Of Days.pdf",
        fileType: "pdf",
        status: "tbr",
        dateAdded: new Date().toISOString(),
        hasFile: true 
    }

];




/* =========================================
   1. THE LIBRARIAN (Search & Add)
   ========================================= */

function openLibrarian() {
    document.getElementById('librarianModal').classList.add('active');
    document.getElementById('apiSearchInput').focus();
}

// Enter should search -- the box is focused the moment the modal opens, so
// reaching for the FETCH button was the only way to use it.
document.addEventListener('DOMContentLoaded', () => {
    const box = document.getElementById('apiSearchInput');
    if (!box) return;
    box.addEventListener('keypress', e => {
        if (e.key === 'Enter') { e.preventDefault(); searchGoogleBooks(); }
    });
});

function closeLibrarian() {
    document.getElementById('librarianModal').classList.remove('active');
    document.getElementById('apiResultsList').innerHTML = '';
    document.getElementById('apiSearchInput').value = '';
}

async function searchGoogleBooks() { 
    const query = document.getElementById('apiSearchInput').value.trim();
    if (!query) return;

    const list = document.getElementById('apiResultsList');
    list.innerHTML = '<div style="padding:20px; color:#666; font-size:12px;">Searching archives...</div>';

    try {
        // encodeURIComponent, not a space-for-plus swap: a title containing
        // & # + or ? would otherwise corrupt the query string.
        const safeQuery = encodeURIComponent(query);
        const response = await fetch(`https://openlibrary.org/search.json?q=${safeQuery}&limit=10`);
        if (!response.ok) throw new Error(`OpenLibrary returned ${response.status}`);
        const data = await response.json();

        if (!data.docs || data.docs.length === 0) {
            list.innerHTML = '<div style="padding:20px; color:#d4af37;">No books found.</div>';
            return;
        }
        renderApiResults(data.docs);
    } catch (error) {
        console.error("Librarian Error:", error);
        list.innerHTML = '<div style="padding:20px; color:red;">Connection Error.</div>';
    }
}

function renderApiResults(books) {
    const list = document.getElementById('apiResultsList');
    list.innerHTML = '';

    books.forEach(book => {
        let coverUrl = NO_COVER;
        if (book.cover_i) coverUrl = `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg`;

        const el = document.createElement('div');
        el.className = 'search-item';
        el.onclick = function() { stageBookForAdd(book); };

        const authorName = book.author_name ? book.author_name[0] : 'Unknown';

        // Titles come straight from a public API and routinely contain quotes,
        // ampersands and angle brackets. Dropped into innerHTML raw, those
        // break the markup (and worse). Escape before interpolating.
        const esc = (s) => String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

        el.innerHTML = `
            <div style="width:40px; height:60px; background-image:url('${esc(coverUrl)}'); background-size:cover; background-position:center;"></div>
            <div>
                <div style="color:white; font-weight:700; font-size:14px;">${esc(book.title)}</div>
                <div style="color:#888; font-size:11px; text-transform:uppercase;">${esc(authorName)}</div>
            </div>
        `;
        list.appendChild(el);
    });
}

function stageBookForAdd(apiData) {
    let coverUrl = NO_COVER;
    if (apiData.cover_i) coverUrl = `https://covers.openlibrary.org/b/id/${apiData.cover_i}-L.jpg`;

    tempBookData = {
        id: apiData.key, 
        title: apiData.title,
        authors: apiData.author_name || ['Unknown'],
        lastInteracted: new Date().toISOString(),
        
        // Use subject as genre if available, else default
        genre: apiData.subject ? apiData.subject.slice(0, 3).join(', ') : "General Fiction", 
        
        publishYear: apiData.first_publish_year || 'Unknown',
        isbn: apiData.isbn ? apiData.isbn[0] : 'N/A',
        characters: apiData.person ? apiData.person.slice(0, 5).join(', ') : 'None listed',
        awards: "N/A",
        description: apiData.first_sentence ? apiData.first_sentence[0] : (apiData.description || "No summary available."),
        cover: coverUrl,
        // 'totalPages' is the name the rest of the hub uses (the progress panel
        // reads and writes it). This staged it as 'pageCount', so a book added
        // through the Librarian always showed a blank page total and could
        // never compute a percentage.
        totalPages: apiData.number_of_pages_median || 0,

        // Defaults
        format: 'text', 
        status: 'tbr',
        currentPage: 0, 
        rating: 0,
        notes: "",
        hasFile: false,
        dateAdded: new Date().toISOString()
    };

    const pPoster = document.getElementById('addPreviewPoster');
    const pTitle = document.getElementById('addPreviewTitle');
    const pAuthor = document.getElementById('addPreviewAuthor');

    if(pPoster) pPoster.style.backgroundImage = `url('${tempBookData.cover}')`;
    if(pTitle) pTitle.innerText = tempBookData.title;
    if(pAuthor) pAuthor.innerText = tempBookData.authors[0];

    document.getElementById('librarianModal').classList.remove('active');
    document.getElementById('addConfirmModal').classList.add('active');
}

function finalizeAddBook(status) {
    if (!tempBookData) return;
    
    // 1. Safety Check: Duplicates
    if (libraryData.some(b => b.id === tempBookData.id)) {
        alert("This book is already in your library.");
        return;
    }

    // 2. Set Status
    tempBookData.status = status;
    tempBookData.format = 'text'; // Default format

    // 3. SMART PROGRESS LOGIC
    // If you say it's finished, we mark it 100% done immediately.
    if (status === 'read') {
        tempBookData.progress = 1; // 100%
    } else {
        tempBookData.progress = 0; // 0%
    }

    // 4. Save to Vault
    libraryData.unshift(tempBookData);
    saveToStorage();
    
    // 5. Cleanup & Refresh UI
    document.getElementById('addConfirmModal').classList.remove('active');
    tempBookData = null;
    
    populateGenreDropdown(); // Refresh filters
    renderLibrary(); 
    loadHero(libraryData[0]); 
    updateVaultStats();
}

/* =========================================
   2. THE SHELVES 
   ========================================= */

// 1. LOAD PREFERENCE (Default to 'grid' if new)
let currentViewMode = localStorage.getItem('LifeHub_ViewMode') || 'grid';
let currentGenreFilter = 'all';

// 2. SWITCH VIEW FUNCTION
function switchView(mode) {
    currentViewMode = mode;
    localStorage.setItem('LifeHub_ViewMode', mode); // Remember this!
    
    // Update Buttons Visuals
    document.getElementById('viewGridBtn').classList.remove('active');
    document.getElementById('viewListBtn').classList.remove('active');
    
    if (mode === 'grid') document.getElementById('viewGridBtn').classList.add('active');
    else document.getElementById('viewListBtn').classList.add('active');

    // Re-draw the shelves
    renderLibrary();
}

// 3. THE RENDER ENGINE
function renderLibrary(filterText = '') {
    const grid = document.getElementById('bookGrid');
    if(!grid) return;
    grid.innerHTML = '';

    // A. UPDATE CONTAINER CLASS
    if (currentViewMode === 'list') {
        grid.classList.add('list-mode');
    } else {
        grid.classList.remove('list-mode');
    }

    // B. APPLY FILTERS
    let displaySet = libraryData; 

    // 1. First, apply the "Hub Filter" (The Tunnel Vision)
    if (currentStatusFilter !== 'all') {
        if (currentStatusFilter === 'favorites') {
            displaySet = displaySet.filter(b => b.isFavorite === true);
        } else {
            // This handles 'tbr', 'reading', and 'read'
            displaySet = displaySet.filter(b => b.status === currentStatusFilter);
        }
    }

    // 2. Then apply text search (if any)
    if(filterText) {
        displaySet = displaySet.filter(b => (b.title + b.authors.join(' ')).toLowerCase().includes(filterText.toLowerCase()));
    }

    // 3. Then apply Genre filter (if any)
    if (currentGenreFilter !== 'all') {
        displaySet = displaySet.filter(b => 
            b.genre && b.genre.toLowerCase().includes(currentGenreFilter.toLowerCase())
        );
    }

    // C. GENERATE HTML BASED ON MODE
    displaySet.forEach(book => {
        const el = document.createElement('div');
        el.onclick = () => loadHero(book);

        // --- OPTION 1: GRID MODE (Poster Only) ---
        if (currentViewMode === 'grid') {
            el.className = 'grid-item';
            
            let bgStyle = `background-image: url('${book.cover}');`;
            if(!book.cover || book.cover === 'none') {
                bgStyle = `background: linear-gradient(45deg, #1a1a1a, #2a2a2a);`;
            }

            el.innerHTML = `
                <div class="grid-poster" style="${bgStyle}"></div>
                <div class="grid-info">
                    <div class="grid-title">${book.title}</div>
                </div>
            `;
        } 
        
        // --- OPTION 2: LIST MODE (Clean Ledger) ---
        else {
            el.className = 'list-item';
            
            let coverUrl = book.cover && book.cover !== 'none' ? book.cover : '';
            let bgStyle = coverUrl ? `background-image: url('${coverUrl}');` : `background: #222;`;

            // 1. STAR LOGIC (Only if rated)
            let indicatorsHTML = '';
            const rating = book.rating || 0; 
            
            if (rating > 0) {
                for(let i=0; i < rating; i++) {
                    indicatorsHTML += '<span class="material-symbols-outlined" style="font-variation-settings:\'FILL\' 1">star</span>';
                }
            }

            // 2. HEART LOGIC (Only if Favorite)
            if (book.isFavorite) {
                // Add a small divider space if we also have stars
                const margin = rating > 0 ? 'margin-left: 10px;' : '';
                indicatorsHTML += `<span class="material-symbols-outlined" style="font-variation-settings:'FILL' 1; ${margin} font-size:14px;">favorite</span>`;
            }

            el.innerHTML = `
                <div class="list-poster" style="${bgStyle}"></div>
                <div class="list-info">
                    <div class="list-title">${book.title}</div>
                    <div class="list-author">${book.authors[0]}</div>
                </div>
                
                <div class="list-rating" style="margin-left:auto; display:flex; align-items:center;">
                    ${indicatorsHTML}
                </div>
            `;
        }

        grid.appendChild(el);
    });
    
    // Load first book if needed
    if(displaySet.length > 0 && !currentBookID) loadHero(displaySet[0]);
}

/* =========================================
   3. GENRE ENGINE (DYNAMIC + PRESET)
   ========================================= */

function populateGenreDropdown() {
    // 1. Target the Custom Glass Menu AND the Hidden Datalist
    const listContainer = document.getElementById('genreOptionsList'); // The Glass UI
    const inputDatalist = document.getElementById('genreOptions');     // The Typing Helper
    
    // Safety Check: If we can't find the glass menu, stop.
    if (!listContainer) return;

    listContainer.innerHTML = ''; // Clear Glass List
    if (inputDatalist) inputDatalist.innerHTML = ''; // Clear Typing Helper

    // 2. DEFINE THE CORE LIST (Your Presets)
    const allGenres = new Set([
        "General Fiction", "General Non-Fiction", "Literary Fiction", 
        "Science Fiction", "Historical Fiction", "Contemporary Fiction", 
        "Adventure", "Fantasy", "Horror", "Romance", "Dystopian", 
        "Magical Realism", "Thriller", "Mystery", "History", "Poetry", "Epic Fantasy",
        "Memoir", "Biography", "Self-Help" 
    ]);
    
    // 3. LEARN FROM YOUR LIBRARY (Dynamic Expansion)
    libraryData.forEach(book => {
        if (book.genre) {
            const parts = book.genre.split(',').map(g => g.trim());
            parts.forEach(p => {
                const cleanGenre = p.charAt(0).toUpperCase() + p.slice(1);
                if(cleanGenre.length > 0) allGenres.add(cleanGenre);
            });
        }
    });

    // 4. SORT ALPHABETICALLY
    const sortedGenres = Array.from(allGenres).sort();

    // 5. BUILD THE GLASS MENU (For Clicking)
    // Add "All Genres" first
    createDropdownItem("ALL GENRES", 'all');

    sortedGenres.forEach(genre => {
        // Add to Glass Menu
        createDropdownItem(genre.toUpperCase(), genre);
        
        // Add to Typing Helper (Datalist)
        if (inputDatalist) {
            const option = document.createElement('option');
            option.value = genre;
            inputDatalist.appendChild(option);
        }
    });
}


function createDropdownItem(label, value) {
    const listContainer = document.getElementById('genreOptionsList');
    const el = document.createElement('div');
    el.className = 'dropdown-item';
    el.innerText = label;
    el.onclick = () => {
        // Update the Label on the button
        const labelEl = document.getElementById('currentGenreLabel');
        if(labelEl) labelEl.innerText = label;
        
        // Close the menu
        toggleGenreMenu();
        
        // Trigger the filter
        filterByGenre(value);
    };
    listContainer.appendChild(el);
}

// TOGGLE MENU VISIBILITY
function toggleGenreMenu() {
    const menu = document.getElementById('genreOptionsList');
    if(menu) menu.classList.toggle('active');
}

// Close menu if clicking outside
window.onclick = function(event) {
    if (!event.target.closest('.custom-dropdown')) {
        const menu = document.getElementById('genreOptionsList');
        if (menu && menu.classList.contains('active')) {
            menu.classList.remove('active');
        }
    }
}

/* =========================================
   4. HERO & DETAILS
   ========================================= */
function loadHero(book) {
    if (!book) return;

    currentBookID = book.id;
    // --- NEW: SMART SORT TRIGGER ---
    // If this isn't the top book already, bump it up.
    if (libraryData[0].id !== book.id) {
        touchBook(book.id);
    }

    // --- 1. POPULATE TEXT FIELDS ---
    const elTitle = document.getElementById('heroTitle');
    const elAuthor = document.getElementById('heroAuthor');
    const elPublished = document.getElementById('heroPublished');
    const elGenre = document.getElementById('heroGenre'); 

    if (elTitle) elTitle.innerText = book.title;
    if (elAuthor) elAuthor.innerText = book.authors[0];
    if (elGenre) elGenre.innerText = book.genre || "General Collection";

    if (elPublished) {
        const year = book.publishYear || book.publishedDate || "Unknown";
        const cleanYear = year.toString().substring(0, 4);
        elPublished.innerText = `PUBLISHED: ${cleanYear}`;
    }
    
    // --- 2. HANDLE POSTER ART ---
    const elPoster = document.getElementById('heroPoster');
    const elPlaceholder = document.getElementById('heroPlaceholder');

    if (elPoster) {
        if (book.cover && book.cover !== 'none' && book.cover !== '') {
            elPoster.style.backgroundImage = `url('${book.cover}')`;
            if(elPlaceholder) elPlaceholder.style.display = 'none';
        } else {
            elPoster.style.backgroundImage = 'none';
            if(elPlaceholder) elPlaceholder.style.display = 'block';
        }
    }

    // --- 3. CALCULATE PROGRESS & DETERMINE REAL STATUS ---
    const percent = book.progress ? Math.round(book.progress * 100) : 0;
    
    // MATURE LOGIC: Data Integrity Check
    let realStatus = book.status; 

    if (book.hasFile) {
        // If file exists, Math rules
        if (percent === 100) realStatus = 'read';
        else if (percent > 0) realStatus = 'reading';
        else realStatus = 'tbr';
    }
    // If no file, we trust the manual label (reading/read/tbr)
    
    book.status = realStatus; // Sync memory

    // --- 4. STATUS BADGE & BUTTON LOGIC ---
    const badge = document.getElementById('heroBadge');
    const readBtn = document.getElementById('btnRead');
    
    if (badge && readBtn) {
        badge.className = 'tag-badge'; 
        readBtn.onclick = null; 

        // Define action
        const clickAction = () => {
            if (book.hasFile) launchReaderFromVault(book.id);
            else triggerFileUpload();
        };

        // BUTTON TEXT
        if (!book.hasFile) {
            // If finished, just say "READ AGAIN" (even without file, implies re-reading or uploading new copy)
            if (realStatus === 'read') readBtn.innerText = "READ AGAIN"; 
            else readBtn.innerText = "UPLOAD BOOK";
        } 
        else if (realStatus === 'read') readBtn.innerText = "READ AGAIN";
        else if (realStatus === 'reading') readBtn.innerText = "CONTINUE READING";
        else readBtn.innerText = "START READING";
        
        readBtn.onclick = clickAction;

        // BADGE VISUALS
        if (realStatus === 'reading') {
            badge.innerText = "READING";
            badge.classList.add('status-reading');
        } else if (realStatus === 'read') {
            badge.innerText = "FINISHED";
            badge.classList.add('status-read');
        } else {
            badge.innerText = "TO BE READ";
            badge.classList.add('status-tbr');
        }
    }

    // --- 5. PROGRESS BAR vs UPLOAD HINT ---
    const progContainer = document.getElementById('heroProgress');
    const progFill = document.getElementById('heroProgressFill');
    const progText = document.getElementById('heroProgressText');
    const uploadHint = document.getElementById('heroUploadHint');

    if (book.hasFile) {
        // A. HAS FILE: Show Bar, Hide Hint
        if (progContainer) {
            progContainer.style.display = 'block';
            setTimeout(() => { progFill.style.width = percent + "%"; }, 50);
            progText.innerText = percent + "% COMPLETED";
        }
        if (uploadHint) uploadHint.style.display = 'none';

    } else {
        // B. NO FILE: Hide Bar
        if (progContainer) progContainer.style.display = 'none';
        
        // LOGIC UPDATE: Show Hint ONLY if NOT Finished
        if (uploadHint) {
            if (realStatus === 'read') {
                uploadHint.style.display = 'none'; // No pressure for finished books
            } else {
                uploadHint.style.display = 'block'; // Gentle nudge for TBR
            }
        }
    }

    // --- 6. UPDATE VISUALS (Hearts & Stars) ---
    updateHeroVisuals(book);
}
// Helper (unused but prevents errors if referenced)
function triggerReadAction() {}

/* =========================================
   5. E-READER ENGINE
   ========================================= */
function triggerFileUpload() {
    document.getElementById('bookFileInput').click();
}

function processBookFile(input) {
    const file = input.files[0];
    if (!file) return;

    const fileType = file.name.split('.').pop().toLowerCase();

    // --- TEXT FILE (.txt) ---
    if (fileType === 'txt') {
        const reader = new FileReader();
        reader.onload = function(e) {
            saveAndLaunch(e.target.result, 'text');
        };
        reader.readAsText(file);
    } 
    
    // --- WORD DOCUMENT (.docx) ---
    else if (fileType === 'docx') {
        const reader = new FileReader();
        reader.onload = function(e) {
            const arrayBuffer = e.target.result;
            mammoth.extractRawText({arrayBuffer: arrayBuffer})
                .then(function(result){
                    saveAndLaunch(result.value, 'text');
                })
                .catch(function(err){
                    alert("Error reading Word doc: " + err.message);
                });
        };
        reader.readAsArrayBuffer(file);
    }
    
    // --- PDF DOCUMENT (.pdf) ---
    else if (fileType === 'pdf') {
        const reader = new FileReader();
        reader.onload = function(e) {
            // We save PDF as a Data URL (Base64 string)
            saveAndLaunch(e.target.result, 'pdf');
        };
        reader.readAsDataURL(file); // Important: Read as Data URL, not Text
    }
    
    input.value = '';
}

function saveAndLaunch(content, type) {
    saveBookContentToVault(currentBookID, content)
        .then(() => {
            const book = libraryData.find(b => b.id === currentBookID);
            if (!book) { alert("That book is no longer in your library."); return; }
            book.hasFile = true;
            book.fileType = type;
            touchBook(currentBookID); 
            saveToStorage();
            
            alert("Book uploaded successfully!");
            loadHero(book); 
            
            if (type === 'pdf') launchPDFReader(content);
            else launchReader(content);
        })
        .catch(err => {
            alert("Error saving book: " + err);
        });
}

function launchReaderFromVault(id) {
    const book = libraryData.find(b => b.id === id);
    if (!book) return alert("Book record not found.");

    // CHANGE: Check if this is a "Shared Book" with a file path on the server
    if (book.filePath) {
        
        // 1. Visual Feedback
        const btn = document.getElementById('btnRead');
        const originalText = btn ? btn.innerText : "READ";
        if(btn) btn.innerText = "OPENING...";

        // 2. FETCH the file from the folder
        fetch(book.filePath)
            .then(response => {
                if (!response.ok) {
                    // If fetch fails, maybe we already saved it before? Try local load.
                    throw new Error("File fetch failed");
                }
                // Return Blob for PDF, Text for others
                return book.fileType === 'pdf' ? response.blob() : response.text();
            })
            .then(data => {
                // 3. SUCCESS: We got the file data!
                
                // If PDF, convert Blob to Base64
                if (book.fileType === 'pdf') {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        const base64 = e.target.result;
                        // Save to Vault (Cache it) -> Then Launch
                        saveBookContentToVault(id, base64).then(() => {
                            launchPDFReader(base64);
                        });
                    };
                    reader.readAsDataURL(data);
                } 
                // If Text, save directly
                else {
                    saveBookContentToVault(id, data).then(() => {
                        launchReader(data);
                    });
                }
            })
            .catch(err => {
                console.warn("Fetch failed, attempting local vault lookup...", err);
                // Fallback: Check if we uploaded it manually before
                attemptDirectVaultLoad(id);
            })
            .finally(() => {
                 if(btn) btn.innerText = originalText;
            });

    } else {
        // Standard User-Uploaded Book (Direct DB Check)
        attemptDirectVaultLoad(id);
    }
}

// Helper to keep code clean
function attemptDirectVaultLoad(id) {
    getBookContentFromVault(id)
        .then(content => {
            const book = libraryData.find(b => b.id === id);
            if (book.fileType === 'pdf') launchPDFReader(content);
            else launchReader(content);
        })
        .catch(err => {
            alert("Could not load book content.\n\nSystem says: " + err);
        });
}

function launchReader(text) {
    const book = libraryData.find(b => b.id === currentBookID);
    document.getElementById('readerBookTitle').innerText = book ? book.title : "Reading Mode";
    document.getElementById('readerTextContainer').innerText = text;
    window.location.href = `Reading_Room.html?id=${currentBookID}`;
}

function closeReader() {
    document.getElementById('readerModal').classList.remove('active');
}

function trackReaderProgress() {
    const el = document.getElementById('readerScrollArea');
    const scrolled = (el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100;
    document.getElementById('readerProgress').innerText = Math.round(scrolled) + "% READ";
}

function launchPDFReader(pdfDataUrl) {
    // Basic redirect for PDF (simplified)
    window.location.href = `Reading_Room.html?id=${currentBookID}`;
}

/* =========================================
   6. DETAILS & EDITING (MANUAL OVERRIDE)
   ========================================= */

function openFullDetails() {
    if (!currentBookID) return;

    const coverEditor = document.getElementById('coverEditor');
    if (coverEditor) coverEditor.classList.remove('active');
    let book = libraryData.find(b => b.id === currentBookID);
    if (!book && tempBookData && tempBookData.id === currentBookID) {
        book = tempBookData;
    }
    if (!book) return;

    // 1. Visuals
    document.getElementById('fdPoster').style.backgroundImage = `url('${book.cover}')`;
    document.getElementById('fdTitle').innerText = book.title;
    document.getElementById('fdGenre').innerText = book.genre;
    
    // (DELETED SECTION 2: STATUS DECK WAS HERE)

    // 3. Metadata
    const set = (id, val) => {
        const el = document.getElementById(id);
        if(el) el.innerText = val || "--";
    };
    
    // Hand-added books can carry a plain string here instead of an array.
    set('fdAuthor', Array.isArray(book.authors) ? book.authors.join(', ') : book.authors);
    set('fdAwards', book.awards);
    set('fdISBN', book.isbn);
    set('fdCharacters', book.characters);
    set('fdYear', book.publishYear);

    let cleanDesc = book.description;
    if(typeof cleanDesc === 'object' && cleanDesc.value) cleanDesc = cleanDesc.value;
    document.getElementById('fdSummary').innerText = cleanDesc || "No summary available.";

    // 4. Progress + Notes panel.
    // These four fields were never filled in, and the two handlers the panel
    // calls (updateProgress / saveBookDetails) did not exist at all -- so the
    // page box and the notes box silently discarded everything typed in them.
    const pageEl  = document.getElementById('fdCurrentPage');
    const totalEl = document.getElementById('fdTotalPages');
    const notesEl = document.getElementById('fdNotes');

    if (totalEl) totalEl.value = book.totalPages || '';
    if (pageEl)  pageEl.value  = book.currentPage || '';
    if (notesEl) notesEl.value = book.notes || '';
    renderProgressPercent(book);

    document.getElementById('fullDetailsModal').classList.add('active');
}

/* Progress is stored as a 0..1 ratio everywhere else in the hub (the reading
   engine writes a scroll ratio, and loadHero multiplies by 100), so the page
   counter converts into that same ratio rather than inventing a second unit. */
function renderProgressPercent(book) {
    const out = document.getElementById('fdPercent');
    if (!out) return;
    out.innerText = `${Math.round((book.progress || 0) * 100)}%`;
}

function updateProgress() {
    const book = libraryData.find(b => b.id === currentBookID);
    if (!book) return;

    const pageEl  = document.getElementById('fdCurrentPage');
    const totalEl = document.getElementById('fdTotalPages');

    const total = parseInt(totalEl && totalEl.value, 10);
    let page = parseInt(pageEl && pageEl.value, 10);
    if (isNaN(page) || page < 0) page = 0;

    // Can't derive a ratio without a page count -- keep the number, skip the maths.
    if (isNaN(total) || total <= 0) {
        book.currentPage = page;
        saveToStorage();
        return;
    }

    if (page > total) { page = total; if (pageEl) pageEl.value = total; }

    book.currentPage = page;
    book.totalPages  = total;
    book.progress    = page / total;

    // Reaching the last page finishes the book, matching the TBR/READING/READ
    // vocabulary the status buttons and the hub stats both use.
    if (book.progress >= 1)     book.status = 'read';
    else if (book.progress > 0 && book.status === 'tbr') book.status = 'reading';

    touchBook(book.id);
    saveToStorage();
    renderProgressPercent(book);
    renderLibrary();
    updateVaultStats();
}

function saveBookDetails() {
    const book = libraryData.find(b => b.id === currentBookID);
    if (!book) return;

    const notesEl = document.getElementById('fdNotes');
    if (!notesEl) return;

    book.notes = notesEl.value.trim();
    touchBook(book.id);
    saveToStorage();
}


function closeFullDetails() {
    document.getElementById('fullDetailsModal').classList.remove('active');
    
    // --- NEW: FORCE CLEANUP ---
    const coverEditor = document.getElementById('coverEditor');
    if (coverEditor) coverEditor.classList.remove('active');
    // --------------------------

    // Cleanup Ghost Books
    if (tempBookData && tempBookData.id === currentBookID) {
        const inLib = libraryData.some(b => b.id === tempBookData.id);
        if (!inLib) {
            tempBookData = null;
            currentBookID = null;
            if(libraryData.length > 0) loadHero(libraryData[0]);
        }
    }

    // Reset Edit Mode
    isEditing = false;
    const editBtn = document.getElementById('editIcon');
    if(editBtn) {
        editBtn.innerText = 'edit';
        editBtn.style.color = '';
    }
}

// EDIT SYSTEM
let isEditing = false;

function toggleEditMode() {
    if (!currentBookID) return;
    
    let book = libraryData.find(b => b.id === currentBookID);
    if (!book && tempBookData && tempBookData.id === currentBookID) {
        book = tempBookData;
    }
    if (!book) return;

    const fieldMap = {
        'fdTitle': 'title',
        'fdGenre': 'genre',
        'fdAuthor': 'authors',
        'fdAwards': 'awards',
        'fdISBN': 'isbn',
        'fdCharacters': 'characters',
        'fdSummary': 'description'
    };

    const placeholderMap = {
        'fdTitle': 'Enter Book Title...',
        'fdGenre': 'Enter Genre (e.g. Fantasy)...',
        'fdAuthor': 'Enter Author Name...',
        'fdAwards': 'List awards here...',
        'fdISBN': 'ISBN-13...',
        'fdCharacters': 'List main characters...',
        'fdSummary': 'Paste book summary or write your thoughts...'
    };

    const editBtn = document.getElementById('editIcon');
    const coverOverlay = document.getElementById('coverEditor');

    if (!isEditing) {
        // --- ENTER EDIT MODE ---
        isEditing = true;
        editBtn.innerText = 'save'; 
        editBtn.style.color = '#d4af37'; 
        
        if(coverOverlay) {
            coverOverlay.classList.add('active');
            document.getElementById('editCoverURL').value = book.cover || '';
        }

        for (const [htmlID, dataProp] of Object.entries(fieldMap)) {
            const el = document.getElementById(htmlID);
            let currentText = el.innerText;
            if(currentText === '--' || currentText === 'No summary available.') currentText = '';
            
            const ph = placeholderMap[htmlID] || "Type here...";

            // GENRE SPECIFIC: USE DATALIST
            if (htmlID === 'fdGenre') {
                el.innerHTML = `<input type="text" id="input_${htmlID}" class="edit-input" value="${currentText}" placeholder="${ph}" list="genreOptions">`;
            }
            // SUMMARY: TEXTAREA
            else if (htmlID === 'fdSummary') {
                el.innerHTML = `<textarea id="input_${htmlID}" class="edit-input" placeholder="${ph}">${currentText}</textarea>`;
            } 
            // DEFAULT: INPUT
            else {
                el.innerHTML = `<input type="text" id="input_${htmlID}" class="edit-input" value="${currentText}" placeholder="${ph}">`;
            }
        }

    } else {
        // --- SAVE CHANGES ---
        isEditing = false;
        editBtn.innerText = 'edit'; 
        editBtn.style.color = '';
        
        if(coverOverlay) coverOverlay.classList.remove('active');

        // 1. Capture Values
        book.title = document.getElementById('input_fdTitle').value || "Untitled Book";
        book.genre = document.getElementById('input_fdGenre').value;
        book.awards = document.getElementById('input_fdAwards').value;
        book.isbn = document.getElementById('input_fdISBN').value;
        book.characters = document.getElementById('input_fdCharacters').value;
        book.description = document.getElementById('input_fdSummary').value;
        
        const authVal = document.getElementById('input_fdAuthor').value;
        book.authors = authVal ? [authVal] : ["Unknown"];

        const currentBg = document.getElementById('fdPoster').style.backgroundImage;
        if(currentBg) {
            const cleanUrl = currentBg.slice(5, -2); 
            if(cleanUrl && cleanUrl !== 'none') book.cover = cleanUrl;
        }

        // 2. CHECK: Is this a Ghost Book?
        if (!libraryData.some(b => b.id === book.id)) {
            libraryData.unshift(book);
            tempBookData = null; 
            renderLibrary(); 
            updateVaultStats();
        }

        // 3. Save & Refresh
        saveToStorage();
        
        // Refresh filter dropdown in case we added a new genre
        populateGenreDropdown();
        
        openFullDetails(); 
        loadHero(book); 
    }
}

// Cover Art Helpers
function previewCoverURL(url) {
    if(!url) return;
    document.getElementById('fdPoster').style.backgroundImage = `url('${url}')`;
}

/* =========================================
   COVER IMAGE INTAKE
   Covers are stored as base64 INSIDE the vault, which lives in localStorage
   and now syncs to Firebase. An untouched phone photo is 3-5MB, and base64
   inflates it by a third -- two of those would blow the storage quota and
   bloat every sync. So nothing is stored as picked: every cover is validated,
   then redrawn through a canvas at cover size. A 5MB photo lands at ~60KB.
   ========================================= */
const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const COVER_MAX_INPUT_MB = 12;   // sanity limit on what we'll even decode
const COVER_MAX_W = 400;
const COVER_MAX_H = 600;
const COVER_QUALITY = 0.82;

function prepareCoverImage(file) {
    return new Promise((resolve, reject) => {
        // GIF is rejected by name because people do try it: an animated cover
        // is pointless here (it's painted as a static background) and the file
        // is usually enormous for what it gives you.
        if (file.type === 'image/gif') {
            return reject("GIFs aren't supported for covers — the cover is shown as a still image. Please use a JPG, PNG, or WebP.");
        }
        if (COVER_TYPES.indexOf(file.type) === -1) {
            return reject(`"${file.type || 'that file type'}" isn't a supported image. Please use a JPG, PNG, or WebP.`);
        }
        if (file.size > COVER_MAX_INPUT_MB * 1024 * 1024) {
            return reject(`That image is ${(file.size / 1048576).toFixed(1)}MB. Please pick one under ${COVER_MAX_INPUT_MB}MB.`);
        }

        const reader = new FileReader();
        reader.onerror = () => reject("Couldn't read that file.");
        reader.onload = (e) => {
            const img = new Image();
            img.onerror = () => reject("That file isn't a readable image.");
            img.onload = () => {
                // Fit inside the box, never stretch, never upscale.
                const scale = Math.min(COVER_MAX_W / img.width, COVER_MAX_H / img.height, 1);
                const w = Math.max(1, Math.round(img.width  * scale));
                const h = Math.max(1, Math.round(img.height * scale));

                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d');
                // PNGs and WebPs may be transparent; flatten onto the card colour
                // so JPEG doesn't turn those areas black.
                ctx.fillStyle = '#111';
                ctx.fillRect(0, 0, w, h);
                ctx.drawImage(img, 0, 0, w, h);

                resolve(canvas.toDataURL('image/jpeg', COVER_QUALITY));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function handleCoverUpload(input) {
    const file = input.files[0];
    if (!file) return;

    prepareCoverImage(file).then(dataUrl => {
        document.getElementById('fdPoster').style.backgroundImage = `url('${dataUrl}')`;
        document.getElementById('editCoverURL').value = dataUrl;
    }).catch(msg => alert(msg));

    input.value = '';   // let the same file be re-picked after a rejection
}

/* =========================================
   7. MANUAL ADDITION SYSTEM (The Minting Station)
   ========================================= */

function openAddChoice() {
    document.getElementById('addChoiceModal').classList.add('active');
}

function closeAddChoice() {
    document.getElementById('addChoiceModal').classList.remove('active');
}

function openLibrarianFromChoice() {
    closeAddChoice();
    openLibrarian(); 
}

// --- NEW DEDICATED MANUAL MODAL FUNCTIONS ---

function openManualAdd() {
    closeAddChoice();
    
    // Clear Inputs
    document.getElementById('manTitle').value = '';
    document.getElementById('manAuthor').value = '';
    document.getElementById('manGenre').value = '';
    document.getElementById('manYear').value = '';
    document.getElementById('manCharacters').value = ''; // <--- NEW
    document.getElementById('manDesc').value = '';
    document.getElementById('manualCoverURL').value = '';

    // Clear any file left over from a cancelled entry, so it can't be
    // silently attached to the next book you create.
    pendingManualBookFile = null;
    const fileLabel = document.getElementById('manFileLabel');
    if (fileLabel) {
        fileLabel.innerText = 'No file attached';
        fileLabel.classList.remove('has-file');
    }

    // Reset Status to Default
    setManualStatus('tbr');

    // Reset Preview
    document.getElementById('manualCoverPreview').style.backgroundImage = "url('')";

    document.getElementById('manualAddModal').classList.add('active');
}

function setManualStatus(val) {
    // 1. Update Hidden Input
    document.getElementById('manStatusValue').value = val;

    // 2. Update Visuals
    document.getElementById('ms-tbr').classList.remove('active');
    document.getElementById('ms-read').classList.remove('active');

    if (val === 'tbr') document.getElementById('ms-tbr').classList.add('active');
    if (val === 'read') document.getElementById('ms-read').classList.add('active');
}

function closeManualAdd() {
    document.getElementById('manualAddModal').classList.remove('active');
}

function previewManualCover(url) {
    document.getElementById('manualCoverPreview').style.backgroundImage = `url('${url}')`;
}

function handleManualCoverUpload(input) {
    const file = input.files[0];
    if (!file) return;

    prepareCoverImage(file).then(dataUrl => {
        document.getElementById('manualCoverPreview').style.backgroundImage = `url('${dataUrl}')`;
        // Store it in the URL input just as a holder for the saver to find
        document.getElementById('manualCoverURL').value = dataUrl;
    }).catch(msg => alert(msg));

    input.value = '';
}

/* --- Attaching the actual book file while creating a manual entry ---
   The existing upload path (triggerFileUpload) only works on a book that
   already exists, because it writes straight to IndexedDB under currentBookID.
   A brand-new entry has no id yet, so the picked file is held here and
   committed by saveManualBook() once the id is minted. */
let pendingManualBookFile = null;

function handleManualBookFile(input) {
    const file = input.files[0];
    const label = document.getElementById('manFileLabel');
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    if (['txt', 'docx', 'pdf'].indexOf(ext) === -1) {
        alert("Please choose a .txt, .docx, or .pdf file.");
        input.value = '';
        return;
    }

    const done = (content, type) => {
        pendingManualBookFile = { content: content, type: type };
        if (label) {
            label.innerText = file.name;
            label.classList.add('has-file');   // turns it gold: the pick registered
        }
    };

    const reader = new FileReader();
    reader.onerror = () => alert("Couldn't read that file.");

    if (ext === 'txt') {
        reader.onload = e => done(e.target.result, 'text');
        reader.readAsText(file);
    } else if (ext === 'docx') {
        reader.onload = e => {
            mammoth.extractRawText({ arrayBuffer: e.target.result })
                .then(r => done(r.value, 'text'))
                .catch(err => alert("Error reading Word doc: " + err.message));
        };
        reader.readAsArrayBuffer(file);
    } else {
        reader.onload = e => done(e.target.result, 'pdf');
        reader.readAsDataURL(file);
    }
}

function saveManualBook() {
    // 1. GATHER DATA
    const title = document.getElementById('manTitle').value.trim();
    if (!title) {
        alert("Please enter a book title.");
        return;
    }

    const author = document.getElementById('manAuthor').value.trim() || "Unknown Author";
    const genre = document.getElementById('manGenre').value.trim();
    const year = document.getElementById('manYear').value.trim() || "Unknown";
    const chars = document.getElementById('manCharacters').value.trim(); // <--- NEW
    const desc = document.getElementById('manDesc').value.trim();
    
    // Get Status from our new toggle
    const status = document.getElementById('manStatusValue').value;

    // Get Cover
    let cover = "";
    const bgImage = document.getElementById('manualCoverPreview').style.backgroundImage;
    if (bgImage && bgImage !== 'none' && bgImage !== 'url("")') {
        cover = bgImage.slice(5, -2); 
    }

    // 2. CONSTRUCT OBJECT
    const newBook = {
        id: "manual_" + Date.now(),
        title: title,
        authors: [author],
        genre: genre,
        publishYear: year,
        characters: chars, // <--- NEW
        description: desc,
        cover: cover,
        lastInteracted: new Date().toISOString(),
        
        status: status,
        format: 'text',
        dateAdded: new Date().toISOString(),
        // Set below if a file was attached in the modal.
        hasFile: !!pendingManualBookFile,
        fileType: pendingManualBookFile ? pendingManualBookFile.type : undefined,
        bookmarks: [],
        annotations: []
    };

    // 3. SMART PROGRESS LOGIC
    if (status === 'read') {
        newBook.progress = 1; // 100%
    } else {
        newBook.progress = 0;
    }

    // 4. SAVE
    libraryData.unshift(newBook);
    saveToStorage();

    // 4b. COMMIT THE ATTACHED FILE (now that the book has an id).
    // The text itself goes to IndexedDB, never localStorage -- a PDF as base64
    // would swamp the vault and every sync that follows.
    if (pendingManualBookFile) {
        const pending = pendingManualBookFile;
        pendingManualBookFile = null;
        saveBookContentToVault(newBook.id, pending.content)
            .catch(err => {
                alert("The book was added, but its file could not be stored: " + err);
                const b = libraryData.find(x => x.id === newBook.id);
                if (b) { b.hasFile = false; saveToStorage(); }
            });
    }
    const fileLabel = document.getElementById('manFileLabel');
    if (fileLabel) {
        fileLabel.innerText = 'No file attached';
        fileLabel.classList.remove('has-file');
    }

    // 5. REFRESH UI
    closeManualAdd();
    renderLibrary();
    populateGenreDropdown();
    updateVaultStats();
    
    // 6. Highlight the new book
    loadHero(newBook);
}

/* =========================================
   8. UTILS & INIT
   ========================================= */

function updateVaultStats() {
    const el = document.getElementById('vaultStats');
    if (!el) return;

    // When a filter is on, report the FILTERED count and name the filter.
    // This used to always print the total, and because init called it after
    // setting the "FILTER: TBR" label, it wiped that label every time -- so
    // arriving from a nav-dock link looked identical to viewing everything.
    if (currentStatusFilter !== 'all') {
        const shown = libraryData.filter(b =>
            currentStatusFilter === 'favorites' ? b.isFavorite === true
                                                : b.status === currentStatusFilter
        ).length;
        el.innerText = `${shown} / ${libraryData.length} — ${currentStatusFilter.toUpperCase()}`;
        return;
    }

    el.innerText = `${libraryData.length} BOOKS`;
}

function saveToStorage() { localStorage.setItem(DB_NAME, JSON.stringify(libraryData)); }

function deleteBook() {
    if(!confirm("Remove this book from your library?")) return;
    
    // --- NEW: ADD TO BLOCKLIST ---
    // We save this ID so the "Shared Shelf" logic knows not to add it back on refresh.
    // Only shared-shelf books can come back on refresh, so only those need
    // blocking. Listing hand-added ids here just grew the list forever.
    if (typeof currentBookID === 'string' && currentBookID.startsWith('shared_')) {
        const ignoredBooks = JSON.parse(localStorage.getItem('LifeHub_IgnoredShared')) || [];
        if (!ignoredBooks.includes(currentBookID)) {
            ignoredBooks.push(currentBookID);
            localStorage.setItem('LifeHub_IgnoredShared', JSON.stringify(ignoredBooks));
        }
    }
    // -----------------------------

    // Standard Delete Logic
    libraryData = libraryData.filter(b => b.id !== currentBookID);
    saveToStorage();
    
    closeFullDetails();
    renderLibrary();
    populateGenreDropdown(); 
    updateVaultStats();
    
    if(libraryData.length > 0) loadHero(libraryData[0]);
    else {
         document.getElementById('heroTitle').innerText = "--";
         document.getElementById('heroPoster').style.backgroundImage = "none";
    }
}

function updateBookStatus(st) {
    const book = libraryData.find(b => b.id === currentBookID);
    if (!book) return;
    book.status = st;
    saveToStorage();
    loadHero(book);
    openFullDetails();
}

function openRetail(store) {
    const book = libraryData.find(b => b.id === currentBookID);
    if (!book) return;
    // Books added by hand may have no authors array at all.
    const author = Array.isArray(book.authors) ? (book.authors[0] || '') : (book.authors || '');
    const title = encodeURIComponent((book.title + " " + author).trim());
    let url = "";
    switch(store) {
        case 'kindle': url = `https://www.amazon.com/s?k=${title}&i=stripbooks`; break;
        case 'apple': url = `https://books.apple.com/us/search?term=${title}`; break;
        case 'goodreads': url = `https://www.goodreads.com/search?q=${title}`; break;
        case 'amazon': url = `https://www.amazon.com/s?k=${title}&i=stripbooks`; break; 
    }
    window.open(url, '_blank');
}

// === INITIALIZATION ===
window.onload = () => {
    
    // 1. GET THE "DO NOT DISTURB" LIST
    const ignoredBooks = JSON.parse(localStorage.getItem('LifeHub_IgnoredShared')) || [];

    // 2. MERGE SHARED BOOKS (Smart Sync)
    if (typeof SHARED_BOOKS !== 'undefined') {
        SHARED_BOOKS.forEach(sharedBook => {
            
            // Find if this book is already in our vault
            const existingIndex = libraryData.findIndex(b => b.id === sharedBook.id);
            const isBlocked = ignoredBooks.includes(sharedBook.id);

            if (existingIndex !== -1) {
                // IT EXISTS: Update the "System Data" (Paths/Covers) but KEEP "User Data" (Progress)
                const existingBook = libraryData[existingIndex];
                
                libraryData[existingIndex] = {
                    ...existingBook,        // Keep existing progress, ratings, bookmarks
                    ...sharedBook,          // Overwrite with NEW paths, titles, covers
                    // FORCE RESTORE USER STATS (Just in case sharedBook overwrote them)
                    status: existingBook.status,
                    progress: existingBook.progress,
                    bookmarks: existingBook.bookmarks,
                    annotations: existingBook.annotations,
                    rating: existingBook.rating,
                    isFavorite: existingBook.isFavorite,
                    lastInteracted: existingBook.lastInteracted,
                    // dateAdded MUST be preserved too. The SHARED_BOOKS literals
                    // call new Date() at parse time, so without this line the
                    // spread above re-stamped every shared book as "added today"
                    // on every single page load -- making sort-by-date useless.
                    dateAdded: existingBook.dateAdded || sharedBook.dateAdded
                };
            }
            else if (!isBlocked) {
                // IT'S NEW: stamp the real moment it entered the library.
                libraryData.push({ ...sharedBook, dateAdded: new Date().toISOString() });
            }
        });
        
        // Save the fresh data
        localStorage.setItem(DB_NAME, JSON.stringify(libraryData));
    }

    switchView(currentViewMode);
    populateGenreDropdown();

    const params = new URLSearchParams(window.location.search);
    const filterParam = params.get('filter');

    if (filterParam) {
        // The label itself is now written by updateVaultStats() below, which
        // runs last and knows the filtered count as well as the filter name.
        currentStatusFilter = filterParam;
    }

    renderLibrary();

    // Load Hero
    if(libraryData.length > 0) {
        let heroBook = libraryData[0];
        if (currentStatusFilter !== 'all') {
            const filteredSet = libraryData.filter(b => {
                 if(currentStatusFilter === 'favorites') return b.isFavorite;
                 return b.status === currentStatusFilter;
            });
            if(filteredSet.length > 0) heroBook = filteredSet[0];
        }
        loadHero(heroBook);
    }

    updateVaultStats(); 
};

/* =========================================
   8. FAVORITES & RATINGS
   ========================================= */

function toggleFavorite() {
    if (!currentBookID) return;
    const book = libraryData.find(b => b.id === currentBookID);
    if (!book) return;

    book.isFavorite = !book.isFavorite;
    saveToStorage(); // Save to database
    updateHeroVisuals(book); // Paint the screen
}

function rateBook(stars) {
    if (!currentBookID) return;
    const book = libraryData.find(b => b.id === currentBookID);
    if (!book) return;

    book.rating = stars;
    saveToStorage(); // Save to database
    updateHeroVisuals(book); // Paint the screen
}

function updateHeroVisuals(book) {
    // 1. Update Heart Color
    const favBtn = document.getElementById('heroFavBtn');
    if(favBtn) {
        if (book.isFavorite) favBtn.classList.add('active');
        else favBtn.classList.remove('active');
    }

    // 2. Update Star Glow
    const starContainer = document.getElementById('starDock');
    if(starContainer) {
        const stars = starContainer.querySelectorAll('.star-icon');
        stars.forEach((star, index) => {
            // If the star index (0,1,2,3,4) is less than the rating (e.g. 5), light it up
            if (index < (book.rating || 0)) {
                star.classList.add('active');
                star.innerText = 'star'; // Filled star
            } else {
                star.classList.remove('active');
                star.innerText = 'star'; // Keep icon shape
            }
        });
    }
}

/* =========================================
   SMART SORTING ENGINE
   ========================================= */
function touchBook(id) {
    const index = libraryData.findIndex(b => b.id === id);
    if (index === -1) return;

    // 1. Grab the book
    const book = libraryData[index];
    
    // 2. Stamp it with "Now"
    book.lastInteracted = new Date().toISOString();

    // 3. Move it to the Top of the Stack
    // We remove it from its old spot and unshift it to 0
    libraryData.splice(index, 1);
    libraryData.unshift(book);

    // 4. Save the new order
    saveToStorage();
    
    // Note: We don't re-render immediately to prevent the grid 
    // from jumping around while you are clicking things. 
    // It will be sorted next time you refresh or filter.
}

/* =========================================
   9. SEARCH & FILTER CONNECTORS
   ========================================= */

// 1. Connects the Search Bar to the Renderer
function filterLocalBooks(searchText) {
    // This passes what you type straight to the render engine
    renderLibrary(searchText);
}

// 2. Connects the Genre Dropdown to the Renderer
function filterByGenre(genre) {
    // Update the global genre variable
    currentGenreFilter = genre;
    
    // Check if there is text in the search bar so we don't lose it
    const searchBar = document.getElementById('librarySearch');
    const currentSearchText = searchBar ? searchBar.value : '';

    // Re-draw the library with BOTH filters active (Genre + Search Text)
    renderLibrary(currentSearchText);
}