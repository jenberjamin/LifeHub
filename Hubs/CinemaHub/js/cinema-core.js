/* =========================================
   LIFEHUB | CINEMA CORE ENGINE
   "The Digital Concierge"
   ========================================= */

// 1. CONFIGURATION
const API_KEY = 'ad1fa887';
const DB_NAME = 'LifeHub_CinemaVault';

// Fallback art for titles OMDb has no poster for. This used to point at
// via.placeholder.com, which has since shut down -- every missing poster
// rendered as a broken image. Inline SVG can't rot: no network, no domain.
// The viewBox scales, so the one constant covers every size we need.
const NO_POSTER = "data:image/svg+xml;charset=UTF-8,"
    + "%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20300%20450'%3E"
    + "%3Crect%20width='300'%20height='450'%20fill='rgb(18,18,20)'/%3E"
    + "%3Ctext%20x='150'%20y='232'%20fill='rgb(110,110,120)'%20font-family='sans-serif'"
    + "%20font-size='22'%20text-anchor='middle'%3ENo%20Image%3C/text%3E%3C/svg%3E";

// Global State
let cinemaData = JSON.parse(localStorage.getItem(DB_NAME)) || [];
let currentSearchData = null; 
let currentHeroID = null; 
let tempAddMovieData = null; // Holds the movie while user chooses status
let tempUsherStatus = 'watchlist'; // Default
let tempUsherRating = 0;
let tempUsherFav = false;
let currentStatusFilter = 'all'
let currentViewMode = localStorage.getItem('LifeHub_ViewMode') || 'grid';
let activeFilters = {
    special: [],
    genre: [],
    decade: [],
    imdb: [],
    user: [],
    runtime: [],
    language: [],
    country: []
};



// NEW: Global Filter State
let currentCategory = 'movie'; // Default to Movies
let currentSearchQuery = ''; // New Global State for Search
let currentGenreFilter = 'all';


/* =========================================
   SECTION 1: THE SEARCH (CONCIERGE)
   ========================================= */

function openSearchModal() {
    document.getElementById('searchModal').classList.add('active');
    document.getElementById('movieSearchInput').focus();
}

function closeSearchModal() {
    document.getElementById('searchModal').classList.remove('active');
    document.getElementById('movieSearchInput').value = '';
    
    // Hide both result views (List and Preview)
    const listBlock = document.getElementById('searchListBlock');
    const resBlock = document.getElementById('searchResultBlock');
    
    if (listBlock) listBlock.classList.remove('active');
    if (resBlock) resBlock.classList.remove('active');
    
    currentSearchData = null;
}

// 1. SEARCH FOR A LIST (The Menu)
async function searchMovieAPI() {
    const query = document.getElementById('movieSearchInput').value.trim();
    if (!query) return;

    try {
        // Change 't=' to 's=' to get a list
        const response = await fetch(`https://www.omdbapi.com/?apikey=${API_KEY}&s=${query}`);
        const data = await response.json();

        if (data.Response === "False") {
            alert("No results found.");
            return;
        }

        // Hide the single preview if it was open
        document.getElementById('searchResultBlock').classList.remove('active');
        
        // Show the list
        renderSearchList(data.Search);

    } catch (error) {
        console.error("API Error:", error);
    }
}

// 2. RENDER THE LIST (The Visuals)
function renderSearchList(results) {
    const listContainer = document.getElementById('searchListBlock');
    if (!listContainer) return; // Safety check

    listContainer.innerHTML = ''; // Clear old results
    listContainer.classList.add('active');

    results.forEach(item => {
        const poster = (item.Poster && item.Poster !== "N/A") ? item.Poster : "";
        
        const el = document.createElement('div');
        el.className = 'search-item';
        el.onclick = () => selectFromSearch(item.imdbID); // Click to fetch details

        el.innerHTML = `
            <div class="item-poster-mini" style="background-image: url('${poster}')"></div>
            <div class="item-info">
                <span class="item-title">${item.Title}</span>
                <span class="item-year">${item.Year} • ${item.Type}</span>
            </div>
        `;
        listContainer.appendChild(el);
    });
}

// 3. SELECT A SPECIFIC ITEM (The Fetch)
async function selectFromSearch(imdbID) {
    try {
        // Fetch full details using ID (i=)
        const response = await fetch(`https://www.omdbapi.com/?apikey=${API_KEY}&i=${imdbID}&plot=full`);
        const data = await response.json();

        currentSearchData = data; // Store for saving

        // Hide list, Show Preview
        document.getElementById('searchListBlock').classList.remove('active');
        document.getElementById('searchResultBlock').classList.add('active');

        // Populate Preview
        const posterUrl = (data.Poster && data.Poster !== "N/A") ? data.Poster : NO_POSTER;
        document.getElementById('resPoster').style.backgroundImage = `url('${posterUrl}')`;
        document.getElementById('resTitle').innerText = data.Title;
        document.getElementById('resMeta').innerText = `${data.Year} • ${data.Runtime} • ${data.Genre}`;
        document.getElementById('resPlot').innerText = data.Plot.substring(0, 150) + "..."; 

    } catch (error) {
        console.error("Details Error:", error);
    }
}

/* =========================================
   THE USHERETTE (ADD FLOW)
   ========================================= */

// STEP 1: Intercept the Add Request
function saveMovieToVault() {
    if (!currentSearchData) return;

    // Check for duplicates first
    const exists = cinemaData.some(m => m.id === currentSearchData.imdbID);
    if (exists) {
        alert("This title is already in your Vault.");
        return;
    }

    // Store data temporarily
    tempAddMovieData = currentSearchData;
    
    // Reset Usherette State
    tempUsherStatus = 'watchlist';
    tempUsherRating = 0;
    tempUsherFav = false;
    document.getElementById('usherReview').value = "";
    
    // Reset UI
    document.querySelectorAll('.s-option').forEach(el => el.classList.remove('selected'));
    document.getElementById('opt-watchlist').classList.add('selected'); // Default
    document.getElementById('usherExtras').classList.remove('active');
    
    // Reset Stars/Heart in modal
    updateUsherStarsUI();
    document.getElementById('usherHeart').classList.remove('active');
    document.getElementById('usherHeart').innerText = 'favorite_border';

    // Open Modal
    document.getElementById('addOptionsModal').classList.add('active');
}

function closeAddOptions() {
    document.getElementById('addOptionsModal').classList.remove('active');
    tempAddMovieData = null;
}
// STEP 2: Handle User Choices
function selectAddStatus(status) {
    tempUsherStatus = status;
    
    // UI Feedback
    document.querySelectorAll('.s-option').forEach(el => el.classList.remove('selected'));
    document.getElementById(`opt-${status}`).classList.add('selected');
    
    // Slide down extras ONLY if Finished
    const extras = document.getElementById('usherExtras');
    if (status === 'watched') {
        extras.classList.add('active');
    } else {
        extras.classList.remove('active');
    }
}

function setUsherRating(n) {
    tempUsherRating = n;
    updateUsherStarsUI();
}

function updateUsherStarsUI() {
    const stars = document.querySelectorAll('#usherStars .star-icon');
    stars.forEach((star, index) => {
        if (index < tempUsherRating) {
            star.innerText = 'star';
            star.classList.add('active');
        } else {
            star.innerText = 'star_border';
            star.classList.remove('active');
        }
    });
}

function toggleUsherFavorite() {
    tempUsherFav = !tempUsherFav;
    const btn = document.getElementById('usherHeart');
    if (tempUsherFav) {
        btn.classList.add('active');
        btn.innerText = 'favorite';
    } else {
        btn.classList.remove('active');
        btn.innerText = 'favorite_border';
    }
}

// STEP 3: Finalize and Save
function finalizeAdd() {
    if (!tempAddMovieData) return;
    
    // Construct the Final Object
    const newMovie = {
        id: tempAddMovieData.imdbID,
        title: tempAddMovieData.Title,
        poster: tempAddMovieData.Poster,
        year: tempAddMovieData.Year,
        runtime: tempAddMovieData.Runtime,
        genre: tempAddMovieData.Genre,
        plot: tempAddMovieData.Plot, 
        director: tempAddMovieData.Director,
        writer: tempAddMovieData.Writer,       
        actors: tempAddMovieData.Actors,
        awards: tempAddMovieData.Awards,       
        boxOffice: tempAddMovieData.BoxOffice, 
        production: tempAddMovieData.Production, 
        imdbRating: tempAddMovieData.imdbRating,
        language: tempAddMovieData.Language,
        country: normalizeCountry(tempAddMovieData.Country),
        type: tempAddMovieData.Type,
        dateAdded: new Date().toISOString(),
        
        // THE NEW DATA FROM USHERETTE
        status: tempUsherStatus, 
        userRating: (tempUsherStatus === 'watched') ? tempUsherRating : 0,
        favorite: (tempUsherStatus === 'watched') ? tempUsherFav : false,
        userReview: (tempUsherStatus === 'watched') ? document.getElementById('usherReview').value : ""
    };

    // Save
    cinemaData.unshift(newMovie); 
    localStorage.setItem(DB_NAME, JSON.stringify(cinemaData));

    // Cleanup
    renderVault(); 
    closeAddOptions();
    closeSearchModal(); // Close the search background too
    loadHero(newMovie); 
}
/* =========================================
   SECTION 2: THE VAULT (DISPLAY LOGIC)
   ========================================= */

// NEW: Switch between Movie and Series
function switchCategory(type, btnElement) {
    // 1. Update State
    currentCategory = type;
    
    // We reset GENRE because genres often differ (Series vs Movies)
    currentGenreFilter = 'all'; 
    
    // CRITICAL FIX: We DO NOT reset currentStatusFilter. 
    // We stay in the "Room" (In Progress/Favorites) user selected.

    // 2. Update Visuals (Tabs)
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if(btnElement) btnElement.classList.add('active');
    
    // 3. Reset Dropdown UI
    const dropdown = document.querySelector('.genre-select');
    if(dropdown) dropdown.value = 'all';
    
    // 4. Update the Header Title (So you know what room you are in)
    updateRoomTitle();

    // 5. Re-Render
    renderVault();
}

function filterGenre(genre) {
    currentGenreFilter = genre;
    renderVault();
}

function filterBySearch(query) {
    currentSearchQuery = query.toLowerCase().trim();
    renderVault(); // Refresh the grid immediately
}

function updateRoomTitle() {
    const titleEl = document.querySelector('.main-title');
    if (!titleEl) return;

    if (activeFilters.special.includes('Favorites')) {
        titleEl.innerText = "HALL OF FAME";
        titleEl.style.color = "#00e5ff"; // Cyan text for VIP room
    } else if (currentStatusFilter === 'watching') {
        titleEl.innerText = "IN PROGRESS";
        titleEl.style.color = "#ffd700"; // Gold text
    } else if (currentStatusFilter === 'watched') {
        titleEl.innerText = "FINISHED";
        titleEl.style.color = "#00e5ff";
    } else if (currentStatusFilter === 'watchlist') {
        titleEl.innerText = "TO WATCH";
        titleEl.style.color = "white";
    } else {
        titleEl.innerText = "WATCH LIST"; // Default
        titleEl.style.color = "white";
    }
}

// MAIN RENDER ENGINE
// MAIN RENDER ENGINE (With List/Grid Toggle)
function renderVault() {
    const container = document.getElementById('movieListContainer');
    if (!container) return;
    
    container.innerHTML = ''; // Clear current list

    // STEP 1: Filter by Category (Movie vs Series)
    let displayList = cinemaData.filter(m => {
        const dbType = (m.type || 'movie').toLowerCase(); 
        return dbType === currentCategory;
    });

    // STEP 2: Filter by Room/Status (The Portal Logic)
    if (currentStatusFilter !== 'all') {
        displayList = displayList.filter(m => {
            const status = m.status || 'watchlist'; 
            return status === currentStatusFilter;
        });
    }

    // STEP 3: Filter by Header Genre Dropdown
    if (currentGenreFilter !== "all") {
        displayList = displayList.filter(m => 
            m.genre && m.genre.toLowerCase().includes(currentGenreFilter.toLowerCase())
        );
    }

    // STEP 4: Filter by Command Center (Advanced Filters)
    displayList = displayList.filter(movie => checkFilterMatch(movie));

    // STEP 5: Filter by Smart Search
    if (currentSearchQuery !== '') {
        displayList = displayList.filter(m => {
            return (
                (m.title && m.title.toLowerCase().includes(currentSearchQuery)) ||
                (m.director && m.director.toLowerCase().includes(currentSearchQuery)) ||
                (m.writer && m.writer.toLowerCase().includes(currentSearchQuery)) ||
                (m.actors && m.actors.toLowerCase().includes(currentSearchQuery)) ||
                (m.production && m.production.toLowerCase().includes(currentSearchQuery))
            );
        });
    }

    // 6. Update Count Label
    const countLabel = document.getElementById('movieCount');
    if(countLabel) countLabel.innerText = `${displayList.length} Items`;

    // 7. Paint the List (Grid or Rows)
    if (displayList.length === 0) {
        container.innerHTML = `<div style="color:rgba(255,255,255,0.3); font-size:12px; padding:20px; width:100%;">No matches found in this room.</div>`;
        return;
    }

    displayList.forEach(movie => {
        const posterUrl = (movie.poster && movie.poster !== "N/A") ? movie.poster : NO_POSTER;
        const status = movie.status || 'watchlist';
        
        // --- NEW: CHOOSE LAYOUT BASED ON MODE ---
        if (currentViewMode === 'list') {
            // --- LIST ROW LAYOUT ---
            const item = document.createElement('div');
            item.className = 'list-row-item';
            item.onclick = () => loadHero(movie.id);
            
            // Determine Status Icon Color
            let statusClass = '';
            let statusIcon = 'bookmark';
            if(status === 'watched') { statusClass = 'watched'; statusIcon = 'check_circle'; }
            if(status === 'watching') { statusClass = 'watching'; statusIcon = 'play_circle'; }

            item.innerHTML = `
                <div class="lr-poster" style="background-image: url('${posterUrl}')"></div>
                <div class="lr-info">
                    <div class="lr-title">${movie.title}</div>
                    <div class="lr-meta">${movie.year} • ${movie.genre}</div>
                </div>
                <div class="lr-stat">
                    <div class="lr-rating">
                        <span class="material-symbols-outlined" style="font-size:12px">star</span> 
                        ${movie.imdbRating}
                    </div>
                    <span class="material-symbols-outlined lr-status-icon ${statusClass}">${statusIcon}</span>
                </div>
            `;
            container.appendChild(item);

        } else {
            // --- GRID CARD LAYOUT (Original) ---
            const item = document.createElement('div');
            item.className = 'grid-item';
            item.onclick = () => loadHero(movie.id);

            item.innerHTML = `
                <div class="grid-poster" style="background-image: url('${posterUrl}')"></div>
                <div class="grid-overlay">
                    <div class="grid-title-mini">${movie.title}</div>
                </div>
            `;
            container.appendChild(item);
        }
    });
}

// POPULATES THE HERO SECTION + RATINGS + REVIEWS
function loadHero(movieOrID) {
    let movie;
    
    // Handle both ID string or Object input
    if (typeof movieOrID === 'string') {
        movie = cinemaData.find(m => m.id === movieOrID);
    } else {
        movie = movieOrID;
    }

    if (!movie) return;

    currentHeroID = movie.id;

// --- UPDATE BADGE ---
    const badge = document.getElementById('heroBadge');
    const status = movie.status || 'watchlist';
    
    // Reset classes first (keep base class 'tag-badge')
    badge.className = 'tag-badge'; 

    // Remove inline styles so CSS can do the work
    badge.style.background = '';
    badge.style.color = '';
    
    if (status === 'watching') {
        badge.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">play_circle</span> IN PROGRESS';
        badge.classList.add('status-watching');
    } else if (status === 'watched') {
        badge.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">check_circle</span> FINISHED';
        badge.classList.add('status-finished');
    } else {
        badge.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">bookmark</span> TO WATCH';
        badge.classList.add('status-towatch');
    }
    // ---------------------------------

    // 1. Text Data
    document.getElementById('heroTitle').innerText = movie.title;
    document.getElementById('heroYear').innerText = movie.year;
    document.getElementById('heroRuntime').innerText = movie.runtime;
    document.getElementById('heroRating').innerText = `IMDb ${movie.imdbRating}`;
    // Truncate plot to keep layout clean
    document.getElementById('heroPlot').innerText = movie.plot ? movie.plot.substring(0, 150) + "..." : "No plot available.";

    // 2. Poster Logic
    const posterEl = document.getElementById('heroPoster');
    document.getElementById('heroPlaceholder').style.display = 'none';
    
    if (movie.poster && movie.poster !== "N/A") {
        posterEl.style.backgroundImage = `url('${movie.poster}')`;
    } else {
        posterEl.style.backgroundImage = 'none';
        document.getElementById('heroPlaceholder').style.display = 'block';
    }

    // 3. Render Heart (Favorite)
    const heartBtn = document.getElementById('heroHeart');
    if (movie.favorite) {
        heartBtn.innerText = 'favorite'; 
        heartBtn.classList.add('active');
    } else {
        heartBtn.innerText = 'favorite_border'; 
        heartBtn.classList.remove('active');
    }

    // 4. Render Stars
    const userRating = movie.userRating || 0;
    const stars = document.querySelectorAll('.star-icon');
    stars.forEach((star, index) => {
        if (index < userRating) {
            star.innerText = 'star'; 
            star.classList.add('active');
        } else {
            star.innerText = 'star_border'; 
            star.classList.remove('active');
        }
    });

    // 5. Render Review Button State (This determines if it glows)
    const reviewBtn = document.getElementById('reviewTrigger');
    if (movie.userReview && movie.userReview.trim() !== "") {
        reviewBtn.classList.add('has-review');
        reviewBtn.innerHTML = '<span class="material-symbols-outlined">notes</span> READ';
    } else {
        reviewBtn.classList.remove('has-review');
        reviewBtn.innerHTML = '<span class="material-symbols-outlined">edit_note</span> WRITE';
    }
}


/* =========================================
   SECTION 3: FULL DETAILS MODAL
   ========================================= */

function openFullDetails() {
    if (!currentHeroID) {
        alert("Select a movie first.");
        return;
    }

    const movie = cinemaData.find(m => m.id === currentHeroID);
    if (!movie) return;

    const set = (id, val) => {
        const el = document.getElementById(id);
        if(el) el.innerText = val || "N/A";
    };

    // Handle Poster
    if(movie.poster !== "N/A") {
        document.getElementById('fdPoster').style.backgroundImage = `url('${movie.poster}')`;
    } else {
        document.getElementById('fdPoster').style.backgroundImage = 'none';
    }

    set('fdTitle', movie.title);
    set('fdGenre', movie.genre);
    set('fdDirector', movie.director);
    set('fdWriter', movie.writer);
    set('fdProduction', movie.production);
    set('fdBoxOffice', movie.boxOffice);
    set('fdLanguage', movie.language);
    set('fdCountry', movie.country);
    set('fdCast', movie.actors);
    set('fdAwards', movie.awards);
    set('fdPlot', movie.plot);
    updateStatusUI(movie.status || 'watchlist');

    document.getElementById('fullDetailsModal').classList.add('active');
}

function closeFullDetails() {
    document.getElementById('fullDetailsModal').classList.remove('active');
}

/* =========================================
   SECTION 4: INTERACTIONS (DELETE, RATE, STREAM)
   ========================================= */

function deleteCurrentMovie() {
    if (!currentHeroID) return;
    if(!confirm("Are you sure you want to remove this title from your collection?")) return;

    cinemaData = cinemaData.filter(m => m.id !== currentHeroID);
    localStorage.setItem(DB_NAME, JSON.stringify(cinemaData));

    closeFullDetails();
    renderVault(); // Will refresh based on currentCategory

    // Reset Hero
    const nextMovie = cinemaData.find(m => (m.type || 'movie').toLowerCase() === currentCategory);
    if (nextMovie) {
        loadHero(nextMovie);
    } else {
        document.getElementById('heroTitle').innerText = "--";
        document.getElementById('heroPoster').style.backgroundImage = 'none';
        document.getElementById('heroPlaceholder').style.display = 'block';
        document.getElementById('heroPlot').innerHTML = "Collection is empty.";
        currentHeroID = null;
    }
}

function toggleFavorite() {
    if (!currentHeroID) return;
    const movie = cinemaData.find(m => m.id === currentHeroID);
    if (!movie) return;

    movie.favorite = !movie.favorite;
    localStorage.setItem(DB_NAME, JSON.stringify(cinemaData));
    loadHero(movie);
}

function rateMovie(rating) {
    if (!currentHeroID) return;
    const movie = cinemaData.find(m => m.id === currentHeroID);
    if (!movie) return;

    movie.userRating = rating;
    localStorage.setItem(DB_NAME, JSON.stringify(cinemaData));
    loadHero(movie);
}

function openStream(platform) {
    if (!currentHeroID) return;
    const movie = cinemaData.find(m => m.id === currentHeroID);
    if (!movie) return;
    
    const title = encodeURIComponent(movie.title);
    let url = '';

    switch(platform) {
        case 'netflix': url = `https://www.netflix.com/search?q=${title}`; break;
        case 'disney': url = `https://www.disneyplus.com/search?q=${title}`; break;
        case 'prime': url = `https://www.amazon.com/s?k=${title}&i=instant-video`; break;
        case 'youtube': url = `https://www.youtube.com/results?search_query=${title}+trailer`; break;
    }
    if(url) window.open(url, '_blank');
}

/* =========================================
   SECTION 5: REVIEW SYSTEM
   ========================================= */

function openReviewModal() {
    if (!currentHeroID) {
        alert("Select a movie first.");
        return;
    }
    
    const movie = cinemaData.find(m => m.id === currentHeroID);
    if (!movie) return;

    document.getElementById('reviewText').value = movie.userReview || "";
    document.getElementById('reviewModal').classList.add('active');
    setTimeout(() => document.getElementById('reviewText').focus(), 100);
}

function closeReviewModal() {
    document.getElementById('reviewModal').classList.remove('active');
}

function saveReview() {
    if (!currentHeroID) return;
    const movie = cinemaData.find(m => m.id === currentHeroID);
    if (!movie) return;

    const text = document.getElementById('reviewText').value.trim();
    if (text === "") { deleteReview(); return; }

    movie.userReview = text;
    localStorage.setItem(DB_NAME, JSON.stringify(cinemaData));
    
    loadHero(movie);
    closeReviewModal();
}

function deleteReview() {
    if (!currentHeroID) return;
    const currentText = document.getElementById('reviewText').value;
    if (currentText.length > 0 && !confirm("Discard this review?")) return;

    const movie = cinemaData.find(m => m.id === currentHeroID);
    if (!movie) return;

    movie.userReview = null;
    localStorage.setItem(DB_NAME, JSON.stringify(cinemaData));
    
    loadHero(movie);
    closeReviewModal();
}

/* =========================================
   INITIALIZATION
   ========================================= */
window.onload = () => {
    // 1. Check for External Portal Commands
    const params = new URLSearchParams(window.location.search);
    const filterParam = params.get('filter');

    if (filterParam) {
        if (filterParam === 'favorites') {
            activeFilters.special.push('Favorites');
            checkFilterState();
        } else {
            currentStatusFilter = filterParam;
        }
    }

    // 2. Set the Room Title
    updateRoomTitle();

    // 3. SMART CATEGORY DETECTION (The UX Fix)
    // Before we render, let's see what kind of content we actually have in this filter
    let relevantData = cinemaData;

    // Apply the active filter logic strictly for detection
    if (activeFilters.special.includes('Favorites')) {
        relevantData = relevantData.filter(m => m.favorite);
    } else if (currentStatusFilter !== 'all') {
        relevantData = relevantData.filter(m => (m.status || 'watchlist') === currentStatusFilter);
    }

    // Check counts
    const hasMovies = relevantData.some(m => (m.type || 'movie').toLowerCase() === 'movie');
    const hasSeries = relevantData.some(m => (m.type || 'movie').toLowerCase() === 'series');

    // DECISION: If we have NO movies, but we DO have series, switch the room automatically.
    if (!hasMovies && hasSeries) {
        currentCategory = 'series';
        
        // We also need to visually update the Tab Buttons to match
        document.querySelectorAll('.tab-btn').forEach(btn => {
            // We check the onclick attribute or text to find the Series button
            if (btn.innerText.toUpperCase().includes('SERIES')) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    // 4. Initial Render (Synced with Saved View)
    switchView(currentViewMode);
    
    // 5. Load the most recent item into Hero
    let firstItem = null;
    
    // Find a valid hero based on the (potentially switched) category
    firstItem = cinemaData.find(m => {
        // Must match category (Movie/Series)
        const typeMatch = (m.type || 'movie').toLowerCase() === currentCategory;
        
        // Must match Status/Filter
        let statusMatch = true;
        if (currentStatusFilter !== 'all') {
            statusMatch = (m.status || 'watchlist') === currentStatusFilter;
        } else if (activeFilters.special.includes('Favorites')) {
            statusMatch = m.favorite;
        }
        
        return typeMatch && statusMatch;
    });

    if (firstItem) loadHero(firstItem);
};


// Hit "Enter" to search
const searchInput = document.getElementById('movieSearchInput');
if(searchInput) {
    searchInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            searchMovieAPI();
        }
    });
}

/* =========================================
   MANUAL OVERRIDE (EDIT SYSTEM)
   ========================================= */
let isEditing = false;

function toggleEditMode() {
    if (!currentHeroID) return;
    const movie = cinemaData.find(m => m.id === currentHeroID);
    if (!movie) return;

    const fields = ['fdDirector', 'fdWriter', 'fdProduction', 'fdBoxOffice', 'fdLanguage', 'fdCountry', 'fdCast', 'fdPlot'];
    const editBtn = document.getElementById('editIcon');

    if (!isEditing) {
        // --- SWITCH TO EDIT MODE ---
        isEditing = true;
        editBtn.innerText = 'save'; // Change icon to Save
        editBtn.style.color = '#00e5ff';

        // Turn text into inputs
        fields.forEach(id => {
            const el = document.getElementById(id);
            const currentText = el.innerText;
            // Use textarea for Plot, input for others
            if (id === 'fdPlot') {
                el.innerHTML = `<textarea id="input_${id}" class="edit-input" rows="6">${currentText}</textarea>`;
            } else {
                el.innerHTML = `<input type="text" id="input_${id}" class="edit-input" value="${currentText}">`;
            }
        });

    } else {
        // --- SAVE CHANGES ---
        isEditing = false;
        editBtn.innerText = 'edit'; // Change icon back
        editBtn.style.color = '';

        // 1. Capture new values
        movie.director = document.getElementById('input_fdDirector').value;
        movie.writer = document.getElementById('input_fdWriter').value;
        movie.production = document.getElementById('input_fdProduction').value;
        movie.boxOffice = document.getElementById('input_fdBoxOffice').value;
        movie.language = document.getElementById('input_fdLanguage').value;
        movie.country = normalizeCountry(document.getElementById('input_fdCountry').value);
        movie.actors = document.getElementById('input_fdCast').value; // Here is where you add Millie!
        movie.plot = document.getElementById('input_fdPlot').value;

        // 2. Save to Database
        localStorage.setItem(DB_NAME, JSON.stringify(cinemaData));

        // 3. Refresh UI
        openFullDetails(); // Re-loads the text view with new data
        loadHero(movie);   // Updates the main card too
    }
}

/* =========================================
   CUSTOM DROPDOWN LOGIC
   ========================================= */
function toggleGenreMenu() {
    const dd = document.querySelector('.custom-dropdown');
    dd.classList.toggle('active');
}

function closeGenreMenu() {
    // Small delay to allow click events to register before closing
    setTimeout(() => {
        document.querySelector('.custom-dropdown').classList.remove('active');
    }, 200);
}

function selectCustomGenre(value, label) {
    // 1. Update the Trigger Text
    document.getElementById('currentGenreLabel').innerText = label;
    
    // 2. Update the Visual Selection in the list
    document.querySelectorAll('.d-option').forEach(opt => opt.classList.remove('selected'));
    // (Optional: Find the clicked element to highlight it, 
    // but the filter update is usually enough feedback)
    
    // 3. Close the Menu
    document.querySelector('.custom-dropdown').classList.remove('active');

    // 4. Trigger the Actual Filter
    filterGenre(value);
}

/* =========================================
   THE DATA CORRECTOR (CUSTOMS OFFICER)
   ========================================= */
function normalizeCountry(countryString) {
    if (!countryString) return "Unknown";

    // Split multiple countries (e.g., "USA, UK")
    let countries = countryString.split(',').map(c => c.trim());

    // The Correction Dictionary
const map = {
        // North America
        "USA": "United States",
        "US": "United States",
        "Can": "Canada",
        "Mex": "Mexico",

        // Europe
        "UK": "United Kingdom",
        "GB": "United Kingdom",
        "Great Britain": "United Kingdom",
        "Ger": "Germany",
        "DE": "Germany",
        "Fr": "France",
        "FRA": "France",
        "It": "Italy",
        "ITA": "Italy",
        "Esp": "Spain",
        "ES": "Spain",
        "Rus": "Russia",
        "Swe": "Sweden",
        "Nor": "Norway",
        "Den": "Denmark",

        // Asia / Pacific
        "PH": "Philippines",
        "Phil": "Philippines",
        "JP": "Japan",
        "JPN": "Japan",
        "KR": "South Korea",
        "Korea": "South Korea",
        "Republic of Korea": "South Korea",
        "CN": "China",
        "CHN": "China",
        "HK": "Hong Kong",
        "TW": "Taiwan",
        "TH": "Thailand",
        "VN": "Vietnam",
        "IN": "India",
        "IND": "India",
        "ID": "Indonesia",
        "NZ": "New Zealand",
        "Aus": "Australia",

        // Middle East / Others
        "UAE": "United Arab Emirates",
        "SA": "South Africa",
        "BR": "Brazil",
        "BRA": "Brazil",
        "Arg": "Argentina"
    };

    // Apply corrections
    const corrected = countries.map(c => map[c] || c);

    // Rejoin them
    return corrected.join(', ');
}

/* =========================================
   COMMAND CENTER FILTER LOGIC
   ========================================= */

function openFilterModal() {
    document.getElementById('filterModal').classList.add('active');
}

function closeFilterModal() {
    document.getElementById('filterModal').classList.remove('active');
}

function toggleChip(el, category, value) {
    el.classList.toggle('active');
    
    // Manage the array
    if (activeFilters[category].includes(value)) {
        activeFilters[category] = activeFilters[category].filter(item => item !== value);
    } else {
        activeFilters[category].push(value);
    }
}

function clearAllFilters() {
    // 1. Reset State
    activeFilters = { special: [], genre: [], decade: [], imdb: [], user: [], runtime: [], language: [], country: [] };
    
    // 2. Reset UI (Chips & Inputs)
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    document.getElementById('filterLangInput').value = '';
    document.getElementById('filterCountryInput').value = '';
    
    // 3. Update the Engine Light & Grid
    checkFilterState(); 
    renderVault(); 
    
    // 4. Close the Modal (The magic touch)
    closeFilterModal();
}

function applyAdvancedFilters() {
    checkFilterState();
    closeFilterModal();
    renderVault();
}

// HELPER: Check if a movie matches specific logic
function checkFilterMatch(movie) {
    
    // 0. SPECIAL FILTERS (Favorites / Reviewed)
    if (activeFilters.special.length > 0) {
        // If "Favorites" is selected, movie MUST be a favorite
        if (activeFilters.special.includes('Favorites')) {
            if (!movie.favorite) return false;
        }
        // If "Reviewed" is selected, movie MUST have a review
        if (activeFilters.special.includes('Reviewed')) {
            if (!movie.userReview || movie.userReview.trim() === "") return false;
        }
    }
    // 1. GENRE (Match ANY selected)
    if (activeFilters.genre.length > 0) {
        const movieGenre = (movie.genre || "").toLowerCase();
        const hasMatch = activeFilters.genre.some(g => movieGenre.includes(g.toLowerCase()));
        if (!hasMatch) return false;
    }

    // 2. DECADE
    if (activeFilters.decade.length > 0) {
        const year = parseInt(movie.year);
        const movieDecade = Math.floor(year / 10) * 10; // 1994 -> 1990
        if (!activeFilters.decade.includes(movieDecade.toString())) return false;
    }

    // 3. IMDb RATING (Floor value: 7.9 -> 7)
    if (activeFilters.imdb.length > 0) {
        const rating = Math.floor(parseFloat(movie.imdbRating) || 0);
        // Special case for "< 5" (which we stored as '4')
        const match = activeFilters.imdb.some(r => {
            if (r === '4') return rating <= 4;
            return rating === parseInt(r);
        });
        if (!match) return false;
    }

    // 4. USER RATING
    if (activeFilters.user.length > 0) {
        const uRating = movie.userRating || 0;
        if (!activeFilters.user.includes(uRating.toString())) return false;
    }

    // 5. RUNTIME
    if (activeFilters.runtime.length > 0) {
        const mins = parseInt(movie.runtime) || 0;
        const match = activeFilters.runtime.some(range => {
            if (range === '60') return mins <= 60;
            if (range === '240') return mins >= 240;
            const [min, max] = range.split('-').map(Number);
            return mins >= min && mins < max;
        });
        if (!match) return false;
    }

    // 6. LANGUAGE (Chips + Input)
    const langInput = document.getElementById('filterLangInput').value.trim().toLowerCase();
    const activeLangs = [...activeFilters.language];
    if (langInput) activeLangs.push(langInput);

    if (activeLangs.length > 0) {
        const movieLang = (movie.language || "").toLowerCase();
        // Match ANY from chips OR input
        const hasMatch = activeLangs.some(l => movieLang.includes(l.toLowerCase()));
        if (!hasMatch) return false;
    }

    // 7. COUNTRY (Chips + Input)
    const countryInput = document.getElementById('filterCountryInput').value.trim().toLowerCase();
    const activeCountries = [...activeFilters.country];
    if (countryInput) activeCountries.push(countryInput);

    if (activeCountries.length > 0) {
        const movieCountry = (movie.country || "").toLowerCase();
        const hasMatch = activeCountries.some(c => movieCountry.includes(c.toLowerCase()));
        if (!hasMatch) return false;
    }

    return true;
}

/* =========================================
   UI HELPERS
   ========================================= */
function checkFilterState() {
    const icon = document.querySelector('.filter-icon-btn');
    if (!icon) return;

    // 1. Check if any chips are selected in our arrays
    const hasChips = Object.values(activeFilters).some(arr => arr.length > 0);
    
    // 2. Check if the text inputs have text
    const langInput = document.getElementById('filterLangInput');
    const countryInput = document.getElementById('filterCountryInput');
    const hasText = (langInput && langInput.value.trim() !== "") || 
                    (countryInput && countryInput.value.trim() !== "");

    // 3. Toggle the class
    if (hasChips || hasText) {
        icon.classList.add('filter-active');
    } else {
        icon.classList.remove('filter-active');
    }
}

/* =========================================
   STATUS SYSTEM (TO WATCH / WATCHING / FINISHED)
   ========================================= */

function updateStatus(newStatus) {
    if (!currentHeroID) return;
    const movie = cinemaData.find(m => m.id === currentHeroID);
    if (!movie) return;

    // 1. Update Data
    movie.status = newStatus;
    
    // 2. Save
    localStorage.setItem(DB_NAME, JSON.stringify(cinemaData));

    // 3. Refresh UI
    updateStatusUI(newStatus); // Highlights the button
    loadHero(movie); // Updates the Hero Badge
}

function updateStatusUI(status) {
    // Reset all buttons
    document.querySelectorAll('.status-btn').forEach(btn => btn.classList.remove('active'));
    
    // Activate the correct one
    const activeBtn = document.getElementById(`btn-${status}`);
    if (activeBtn) activeBtn.classList.add('active');
}

function switchView(mode) {
    currentViewMode = mode;
    
    // --- SAVE TO MEMORY ---
    localStorage.setItem('LifeHub_ViewMode', mode);
    // ----------------------
    
    // Update Icons
    document.getElementById('btnGrid').classList.toggle('active', mode === 'grid');
    document.getElementById('btnList').classList.toggle('active', mode === 'list');
    
    // Update Container Class
    const container = document.getElementById('movieListContainer');
    if (mode === 'list') {
        container.classList.add('list-mode');
    } else {
        container.classList.remove('list-mode');
    }

    // Re-Render
    renderVault();
}
