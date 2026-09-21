/* =========================================
   LIFEHUB | READING ENGINE (HYBRID)
   ========================================= */

const DB_NAME = 'LifeHub_LibraryVault';
const CONTENT_DB_NAME = "LifeHub_BookContent";
const PREFS_DB = "LifeHub_ReaderPreferences";
const VOCAB_DB = "LifeHub_Vocabulary";
let currentBookID = null;
let saveTimer = null;
let isLowBrightness = false; 
let activeBookmarkPara = null;
let currentAnnotationFilter = 'all';


// --- AUDIO & SCROLL VARIABLES ---
let audioSynth = window.speechSynthesis;
let audioUtterance = null;
let isReadingAudio = false; // Master State (Audio + Scroll)
let availableVoices = [];
let selectedVoiceIndex = 0;
let currentRate = 1.0;
let isMuted = false;

// MEMORY (For pausing/resuming)
let currentTextPosition = 0; 
let fullTextContent = "";    
let autoScrollTimer = null; // The Scroll Engine

// 1. INITIALIZE ON LOAD
window.onload = function() {
    const params = new URLSearchParams(window.location.search);
    currentBookID = params.get('id');

    if (!currentBookID) {
        alert("No book selected. Returning to Vault.");
        window.location.href = 'LibraryHub-Collections.html';
        return;
    }

    loadReaderPreferences(); 
    loadBookMetadata();
    loadBookContent();
    populateVoiceList(); 
    
    // NEW: Turn on the Light Sensor
    initSmartDimmer();
};

// 1.5 PREFERENCES ENGINE (THE MEMORY + SANITY CHECK)
function loadReaderPreferences() {
    const saved = JSON.parse(localStorage.getItem(PREFS_DB)) || {};

    // 1. THEME LOGIC (Manual Control Only)
    // We removed the time-check. Now it strictly obeys what you last saved.
    if (saved.theme) {
        setTheme(saved.theme, false);
    } else {
        setTheme('light', false); // Default to light if it's the very first time
    }

    // 2. APPLY VISUALS
    if (saved.font) setFont(saved.font, false);
    if (saved.size) setSize(saved.size, false);
    if (saved.margin) setMargin(saved.margin, false);
    if (saved.lineHeight) setLineHeight(saved.lineHeight, false);
    if (saved.align) setAlign(saved.align, false);
    
    // Restore custom text color if it exists (and we aren't overriding it with a theme set above)
    if (saved.textColor && saved.theme === 'custom') setTextColor(saved.textColor, false);
    
    // 3. APPLY AUDIO RATE (With Safety Bounds)
    if (saved.rate !== undefined && saved.rate !== null) {
        let safeRate = parseFloat(saved.rate);
        if (isNaN(safeRate) || safeRate < 0.5 || safeRate > 1.5) safeRate = 1.0;
        currentRate = safeRate;

        const slider = document.querySelector('#tool-audio input[type="range"]');
        if (slider) slider.value = currentRate;
    } else {
        currentRate = 1.0;
    }
}

////

function saveReaderPreferences() {
    const root = document.documentElement;
    
    // Get slider value
    const slider = document.querySelector('#tool-audio input[type="range"]');
    let actualRate = slider ? parseFloat(slider.value) : currentRate;

    // SAFETY LOCK: Never save a value outside the bounds
    if (isNaN(actualRate) || actualRate < 0.5) actualRate = 0.5;
    if (actualRate > 1.5) actualRate = 1.5;

    const prefs = {
        font: window.currentFontName || 'lora',
        size: root.style.getPropertyValue('--font-size').replace('px','') || 20,
        margin: root.style.getPropertyValue('--reader-width').replace('px','') || 750,
        lineHeight: (parseFloat(root.style.getPropertyValue('--line-height')) * 10) || 18,
        align: document.getElementById('textContent').style.textAlign || 'justify',
        textColor: root.style.getPropertyValue('--text-main'),
        
        rate: actualRate, // Saving the safe number
        voiceName: availableVoices[selectedVoiceIndex]?.name || null,
        
        theme: window.currentThemeName || 'light' 
    };

    localStorage.setItem(PREFS_DB, JSON.stringify(prefs));
    // console.log("Preferences Saved. Speed:", actualRate); 
}


// 2. LOAD METADATA
function loadBookMetadata() {
    const libraryData = JSON.parse(localStorage.getItem(DB_NAME)) || [];
    const book = libraryData.find(b => b.id === currentBookID);

    if (book) {
        document.getElementById('displayTitle').innerText = book.title;
        document.getElementById('displayAuthor').innerText = book.authors[0];
        document.title = "Reading: " + book.title;
        const sidebarCover = document.getElementById('sidebarCover');
        if(sidebarCover) sidebarCover.style.backgroundImage = `url('${book.cover}')`;
    }
}

// 3. LOAD CONTENT
function loadBookContent() {
    const request = indexedDB.open(CONTENT_DB_NAME, 1);

    request.onsuccess = function(event) {
        const db = event.target.result;
        const transaction = db.transaction(['books'], 'readonly');
        const store = transaction.objectStore('books');
        const getRequest = store.get(currentBookID);

        getRequest.onsuccess = function() {
            if (getRequest.result) {
                renderContent(getRequest.result.content);
            } else {
                document.getElementById('loader').innerText = "ERROR: BOOK CONTENT MISSING";
            }
        };
    };
}

// 4. RENDERER (Robust PDF Patch)
async function renderContent(content) {
    document.getElementById('loader').style.display = 'none';
    const libraryData = JSON.parse(localStorage.getItem(DB_NAME)) || [];
    const book = libraryData.find(b => b.id === currentBookID);
    
    const textContainer = document.getElementById('textContent');
    const pdfContainer = document.getElementById('pdfContent');

    // --- BRANCH A: PDF MODE (Native Painting) ---
    if (book && book.fileType === 'pdf') {
        textContainer.style.display = 'none';
        pdfContainer.style.display = 'flex'; // Flex to stack pages
        pdfContainer.style.flexDirection = 'column';
        pdfContainer.style.alignItems = 'center';
        pdfContainer.style.gap = '20px';
        pdfContainer.innerHTML = ''; // Clear previous pages

        // Hide Text Tools
        const settingsBtn = document.querySelector('button[title="Reader Settings"]');
        if(settingsBtn) settingsBtn.style.display = 'none';
        
        try {
            document.getElementById('loader').style.display = 'flex';
            document.getElementById('loader').innerText = "RENDERING PAGES...";

            // 1. Convert Base64 to Binary
            const byteString = atob(content.split(',')[1]);
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
            
            // 2. Load the Document
            const loadingTask = pdfjsLib.getDocument({data: ia});
            const pdf = await loadingTask.promise;
            
            // 3. Loop through EVERY page and paint it
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                
                // Determine scale (Fit Width logic)
                // We base it on the reader width variable or a fixed width
                const viewport = page.getViewport({scale: 1.5}); 
                
                // Create Canvas
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                
                // Style it to fit neatly
                canvas.style.maxWidth = "100%";
                canvas.style.height = "auto";
                canvas.style.boxShadow = "0 4px 10px rgba(0,0,0,0.2)"; // Nice shadow
                
                // Render
                const renderContext = {
                    canvasContext: context,
                    viewport: viewport
                };
                await page.render(renderContext).promise;
                
                // Add to DOM
                pdfContainer.appendChild(canvas);
            }

            document.getElementById('loader').style.display = 'none';
            
            // Restore Progress!
            // Since we painted physical canvases, the scrollbar now recognizes the height!
            setTimeout(() => {
                restoreReadingPosition(book);
            }, 500);

        } catch(e) {
            console.error("PDF Paint Error:", e);
            pdfContainer.innerHTML = `<div style="padding:40px; color:#ff6666;">Error rendering PDF.</div>`;
            document.getElementById('loader').style.display = 'none';
        }
        return; 
    }

    // --- BRANCH B: TEXT/DOCX MODE ---
    pdfContainer.style.display = 'none';
    textContainer.style.display = 'block';
    
    // Show Text Tools
    const settingsBtn = document.querySelector('button[title="Reader Settings"]');
    if(settingsBtn) settingsBtn.style.display = 'flex';
    
    // Clean and Build
    textContainer.innerHTML = ""; 
    textContainer.style.whiteSpace = "normal"; 
    
    if (!content) return;

    const paragraphs = content.split(/\n+/); 
    
    paragraphs.forEach((text, index) => { 
        if (!text.trim()) return;
        const p = document.createElement('p');
        p.className = "smart-paragraph";
        p.id = "para-" + index; 
        p.innerText = text;
        p.onclick = function(e) {
            e.preventDefault(); e.stopPropagation(); showContextMenu(e, this);
        };
        textContainer.appendChild(p);
    });

    setTimeout(applySavedHighlights, 100);
    fullTextContent = textContainer.innerText; 
    restoreReadingPosition(book);
}

/* =========================================
   A. LOAD VOICES (THE VIP LIST)
   ========================================= */

// The exact default you wanted
const DEFAULT_VOICE_NAME = "Microsoft Ryan Online (Natural) - English (United Kingdom)";

// The VIP List (Only these will show in the dropdown)
const PREFERRED_VOICES = [
    "Microsoft AvaMultilingual Online", // Default
    "Microsoft Andrew Online",
    "Microsoft Brian Online",
    "Microsoft Libby Online",
    "Microsoft Ryan Online",
    "Microsoft Maisie",
    "Microsoft Ana Online",
    "Microsoft Natasha Online",
    "Microsoft Clara Online",
    "Microsoft Yan Online",
    "Microsoft Mitchell Online",
    "Microsoft Ava Online",
    "Microsoft Brian Multilingual Online",
    "Microsoft Christopher Online",
    "Microsoft Emma Multilingual Online",
    "Microsoft Steffan Online"
];

function populateVoiceList() {
    setTimeout(() => {
        const allVoices = audioSynth.getVoices();
        const select = document.getElementById('voiceSelect');
        if (!select) return;
        
        // 1. CHECK MEMORY: Do we have a saved voice?
        const savedPrefs = JSON.parse(localStorage.getItem(PREFS_DB));
        const savedVoiceName = savedPrefs ? savedPrefs.voiceName : null;
        
        select.innerHTML = ''; 
        availableVoices = []; 

        allVoices.forEach((voice) => {
            const isVIP = PREFERRED_VOICES.some(vipName => voice.name.includes(vipName));

            if (isVIP) {
                availableVoices.push(voice);
                
                const option = document.createElement('option');
                option.textContent = voice.name.replace('Microsoft ', '').replace(' Online (Natural)', ''); 
                option.value = availableVoices.length - 1; 
                
                // PRIORITY 1: Match Saved Voice
                if (savedVoiceName && voice.name === savedVoiceName) {
                    option.selected = true;
                    selectedVoiceIndex = option.value;
                }
                // PRIORITY 2: Match Default (only if no save exists)
                else if (!savedVoiceName && voice.name.includes(DEFAULT_VOICE_NAME)) {
                    option.selected = true;
                    selectedVoiceIndex = option.value;
                }
                
                select.appendChild(option);
            }
        });
        
        // Fallback
        if (select.selectedIndex === -1 && select.options.length > 0) {
            select.selectedIndex = 0;
            selectedVoiceIndex = 0;
        }

    }, 500);
}

// Ensure we save the new voice when you change it manually
function updateVoiceSettings() {
    const select = document.getElementById('voiceSelect');
    const slider = document.querySelector('#tool-audio input[type="range"]'); // Finds the speed slider
    
    // 1. UPDATE VARIABLES
    if(select) selectedVoiceIndex = select.value;
    if(slider) currentRate = slider.value;

    // 2. FORCE SAVE (This was missing!)
    saveReaderPreferences(); 

    // 3. RESTART ENGINE (To apply new speed instantly)
    if (isReadingAudio) {
        audioSynth.cancel(); 
        // Don't stop the scroll completely, just reboot the voice
        // (We pause the scroll timer briefly to re-sync)
        clearInterval(autoScrollTimer); 
        
        startSpeaking(true);      // Resume voice
        startAutoScroll(true);    // Resume scroll at new speed
    }
}


// B. MASTER TOGGLE (Clicking the Play Button)
function toggleAudioReader() {
    const btn = document.getElementById('btnAudio');
    const icon = btn.querySelector('span');
    const muteBtn = document.getElementById('btnMute'); // <--- GRAB THE BUTTON

    if (isReadingAudio) {
        // --- STOP EVERYTHING ---
        stopEverything();
        btn.classList.remove('active');
        icon.innerText = "record_voice_over"; 
        
        // HIDE MUTE BUTTON
        if(muteBtn) muteBtn.style.display = 'none'; 
        
    } else {
        // --- START EVERYTHING ---
        fullTextContent = document.getElementById('textContent').innerText;
        isReadingAudio = true;
        btn.classList.add('active');
        icon.innerText = "pause_circle"; 
        
        // SHOW MUTE BUTTON
        if(muteBtn) muteBtn.style.display = 'inline-flex';
        
        startSpeaking(false);      
        startAutoScroll(true);     
    }
}

//Toggle Mute

function toggleMute() {
    isMuted = !isMuted;
    
    const btn = document.getElementById('btnMute');
    const icon = btn.querySelector('span');
    
    if (isMuted) {
        icon.innerText = "volume_off"; // Muted Icon
        btn.style.color = "#d4af37";   // Gold indicator
    } else {
        icon.innerText = "volume_up";  // Normal Icon
        btn.style.color = "";          // Reset color
    }

    // RESTART SPEECH to apply the volume change immediately
    // We keep the scroll running, just reboot the voice engine with vol=0
    if (isReadingAudio) {
        audioSynth.cancel();
        startSpeaking(true); // Resume from current spot
    }
}


// C. STOP HELPER
function stopEverything() {
    audioSynth.cancel();       
    clearInterval(autoScrollTimer); 
    autoScrollTimer = null;
    isReadingAudio = false;
    currentTextPosition = 0;   
    
    // UI Reset
    const btn = document.getElementById('btnAudio');
    if(btn) {
        btn.classList.remove('active');
        btn.querySelector('span').innerText = "record_voice_over";
    }

    // HIDE MUTE BUTTON
    const muteBtn = document.getElementById('btnMute');
    if(muteBtn) muteBtn.style.display = 'none';
}

// D. SPEAKING LOGIC
function startSpeaking(isResuming) {
    if (!fullTextContent || fullTextContent.length < 5) return;

    const textToSpeak = isResuming ? fullTextContent.substring(currentTextPosition) : fullTextContent;
    audioUtterance = new SpeechSynthesisUtterance(textToSpeak);
    
    if (availableVoices[selectedVoiceIndex]) {
        audioUtterance.voice = availableVoices[selectedVoiceIndex];
    }
    audioUtterance.rate = currentRate;

    // NEW: APPLY MUTE LOGIC
    // We set volume to 0 instead of pausing so the "progress" keeps tracking in the background
    audioUtterance.volume = isMuted ? 0 : 1; 

    // Tracker
    audioUtterance.onboundary = function(event) {
        if (event.name === 'word') {
            const offset = isResuming ? currentTextPosition : 0;
            currentTextPosition = offset + event.charIndex; 
        }
    };

    audioUtterance.onend = function() {
        if (isReadingAudio && (currentTextPosition >= fullTextContent.length - 100)) { 
             stopEverything();
        }
    };

    audioSynth.speak(audioUtterance);
}

// E. SCROLLING LOGIC (The Teleprompter)
function startAutoScroll(forceStart = false) {
    // Clear any existing timer first
    if (autoScrollTimer) clearInterval(autoScrollTimer);

    const el = document.getElementById('scrollArea');
    
    // Calculate Speed based on Voice Rate
    const scrollSpeed = 100 / currentRate; 

    autoScrollTimer = setInterval(() => {
        el.scrollTop += 1;
        
        // Stop if we hit bottom
        if (el.scrollTop + el.clientHeight >= el.scrollHeight) {
            stopEverything();
        }
    }, scrollSpeed);
}

// F. LIVE SETTINGS UPDATE
// (The real updateVoiceSettings lives further up, near the audio setup. An
//  older copy used to sit here; being defined later, it silently overrode the
//  newer one -- and it lacked the saveReaderPreferences() call, so voice and
//  speed changes were never persisted. Removed.)


// G. JUMP TO PARAGRAPH (Needle Drop)
function jumpToParagraph(clickedPara) {
    // 1. Calculate the offset of this paragraph
    // We loop through all paragraphs before this one and add up their lengths
    const allParas = document.querySelectorAll('.smart-paragraph');
    let newOffset = 0;
    
    for (let p of allParas) {
        if (p === clickedPara) break; // We found our target! Stop counting.
        
        // Add length of text + 1 (for the newline invisible character)
        newOffset += p.innerText.length + 1; 
    }
    
    // 2. Update the Memory
    currentTextPosition = newOffset;
    
    // 3. Visual Feedback (Optional: Flash the text)
    clickedPara.style.opacity = "0.5";
    setTimeout(() => clickedPara.style.opacity = "1", 300);

    // 4. If we are already playing, restart from here
    if (isReadingAudio) {
        audioSynth.cancel();
        clearInterval(autoScrollTimer);
        startSpeaking(true);   // Resume (true) will now use the new currentTextPosition
        startAutoScroll(true);
    } else {
        // If we are stopped, just update the "Play" button to be ready
        // But maybe you want to Auto-Play on click? If so, uncomment the next line:
        // toggleAudioReader(); 
    }
}

/* =========================================
   SCROLL & SAVE LOGIC (CLEANED)
   ========================================= */

function debouncedSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveProgress, 1000); 
}

// THE MISSING LINK
function saveProgress() {
    if (!currentBookID) return;
    
    // 1. Calculate where we are
    const scrollContainer = document.getElementById('scrollArea');
    let progressRatio = 0;
    
    // Avoid dividing by zero if the book is empty
    const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
    
    if (maxScroll > 0) {
        progressRatio = scrollContainer.scrollTop / maxScroll;
    }

    // 2. Open the Vault (LocalStorage)
    const library = JSON.parse(localStorage.getItem(DB_NAME)) || [];
    const bookIndex = library.findIndex(b => b.id === currentBookID);

    // 3. Stamp the Record
    if (bookIndex !== -1) {
        const now = new Date().toISOString();
        library[bookIndex].progress = progressRatio;

        // 'lastRead' is written here and read by absolutely nothing. The rest
        // of the hub tracks recency as 'lastInteracted' (see touchBook in
        // library-core.js), so actually reading a book never counted as an
        // interaction. Write both: keep lastRead for anyone expecting it, and
        // lastInteracted so the library agrees that you just read this.
        library[bookIndex].lastRead = now;
        library[bookIndex].lastInteracted = now;

        // The reading engine never touched 'status', so a book read cover to
        // cover in here stayed "tbr" forever. Same rule the page-counter in
        // library-core uses, so both routes agree. 0.99 rather than 1.0
        // because a scroll ratio rarely lands exactly on the end.
        const st = library[bookIndex].status;
        if (progressRatio >= 0.99)            library[bookIndex].status = 'read';
        else if (progressRatio > 0 && st === 'tbr') library[bookIndex].status = 'reading';

        // touchBook also moves the book to the top of the stack -- that array
        // order IS the "recently opened" order the grid renders. Mirror it,
        // keeping the reference we just stamped.
        const book = library.splice(bookIndex, 1)[0];
        library.unshift(book);

        // Save back to storage
        localStorage.setItem(DB_NAME, JSON.stringify(library));
    }
}

function restoreReadingPosition(book) {
    if (!book.progress) return; 

    const scrollContainer = document.getElementById('scrollArea');
    // Give the DOM a split second to render the text before scrolling
    setTimeout(() => {
        const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
        scrollContainer.scrollTop = book.progress * maxScroll;
    }, 150);
}

function updateScrollProgress() {
    // 1. SAFETY CHECK: Am I actually reading?
    // If the book content is hidden, STOP. Do not update. Do not save.
    const textMode = document.getElementById('textContent').style.display !== 'none';
    const pdfMode = document.getElementById('pdfContent').style.display !== 'none';

    if (!textMode && !pdfMode) return; 

    // 2. The Logic (Only runs if we passed the check above)
    const el = document.getElementById('scrollArea');
    const scrollTop = el.scrollTop;
    const scrollHeight = el.scrollHeight - el.clientHeight;
    
    let pct = 0;
    if (scrollHeight > 0) {
        pct = (scrollTop / scrollHeight) * 100;
    }

    const bar = document.getElementById('progressBar');
    if (bar) bar.style.width = pct + "%";

    const text = document.getElementById('progressText');
    if (text) text.innerText = Math.round(pct) + "%";

    debouncedSave();
}

/* =========================================
   SETTINGS & TOOLS (WITH MEMORY)
   ========================================= */
function toggleSettings() {
    const bar = document.getElementById('settingsBar');
    
    // Close any open sub-menus first so it looks clean
    document.querySelectorAll('.tool-popup').forEach(el => el.classList.remove('active'));

    if (bar.classList.contains('active')) {
        // If it's open, just close it
        bar.classList.remove('active');
    } else {
        // OPENING: Force it visible
        bar.classList.add('active');

        // SAFETY CHECK: If it somehow got dragged off screen, reset it!
        const rect = bar.getBoundingClientRect();
        if (rect.top < 0 || rect.left < 0 || rect.right > window.innerWidth || rect.bottom > window.innerHeight) {
            // Reset to default position (Top Right area)
            bar.style.top = '100px';
            bar.style.right = '30px';
            bar.style.left = 'auto';
            bar.style.transform = 'none';
        }
    }
}

function closeSettingsBar() {
    const bar = document.getElementById('settingsBar');
    
    // 1. Close the main bar
    bar.classList.remove('active');
    
    // 2. Close any floating tool popups (like font size slider)
    document.querySelectorAll('.tool-popup').forEach(el => el.classList.remove('active'));
}

function toggleTool(toolName) {
    document.querySelectorAll('.tool-popup').forEach(el => {
        if(el.id !== `tool-${toolName}`) el.classList.remove('active');
    });
    const popup = document.getElementById(`tool-${toolName}`);
    if(popup) popup.classList.toggle('active');
}

// --- SETTERS (Now with 'save' flag) ---

function setTextColor(color, save = true) {
    document.documentElement.style.setProperty('--text-main', color);
    if (save) {
        window.currentThemeName = 'custom'; // Override theme if color changes
        saveReaderPreferences();
        closeAllPopups();
    }
}

function setAlign(type, save = true) {
    const el = document.getElementById('textContent');
    if(type === 'justify') el.style.textAlign = 'justify';
    if(type === 'left') el.style.textAlign = 'left';
    if (save) {
        saveReaderPreferences();
        closeAllPopups();
    }
}

function setLineHeight(val, save = true) {
    document.documentElement.style.setProperty('--line-height', val / 10);
    if (save) saveReaderPreferences();
}

function setFont(type, save = true) {
    const root = document.documentElement;
    window.currentFontName = type; // Remember for save
    
    let fontVal = "'Lora', serif"; 
    switch(type) {
        case 'lora': fontVal = "'Lora', serif"; break;
        case 'merriweather': fontVal = "'Merriweather', serif"; break;
        case 'crimson': fontVal = "'Crimson Text', serif"; break;
        case 'baskerville': fontVal = "'Libre Baskerville', serif"; break;
        case 'inter': fontVal = "'Inter', sans-serif"; break;
        case 'work': fontVal = "'Work Sans', sans-serif"; break;
        case 'nunito': fontVal = "'Nunito', sans-serif"; break;
        case 'mono': fontVal = "'Source Code Pro', monospace"; break;
    }
    root.style.setProperty('--font-body', fontVal);
    if (save) {
        saveReaderPreferences();
        closeAllPopups();
    }
}

function setSize(val, save = true) {
    document.documentElement.style.setProperty('--font-size', val + "px");
    if (save) saveReaderPreferences();
}

function setMargin(val, save = true) {
    document.documentElement.style.setProperty('--reader-width', val + "px");
    if (save) saveReaderPreferences();
}

function setTheme(theme, save = true) {
    window.currentThemeName = theme; // Remember for save
    const root = document.documentElement;
    const body = document.body;
    
    // Reset Classes
    body.classList.remove('night-mode');
    
    // UI ELEMENTS TO SYNC
    const nvIcon = document.getElementById('nvIcon');
    const nvText = document.getElementById('nvText');

    if (theme === 'dark') { 
        body.classList.add('night-mode'); 
        // Sync Button UI
        if(nvIcon) nvIcon.innerText = 'dark_mode';
        if(nvText) nvText.innerText = 'Night Vision: On';
    } 
    else {
        // Sync Button UI (Reset to Off)
        if(nvIcon) nvIcon.innerText = 'wb_sunny';
        if(nvText) nvText.innerText = 'Night Vision: Off';
        
        // Handle Light Themes
        if (theme === 'light') {
            root.style.setProperty('--bg-app', '#f4f1ea');
            root.style.setProperty('--text-main', '#2c2c2c');
            root.style.setProperty('--bg-sidebar', '#eae7df');
        } 
        else if (theme === 'sepia') {
            root.style.setProperty('--bg-app', '#e8dcb8');
            root.style.setProperty('--text-main', '#5d4037');
            root.style.setProperty('--bg-sidebar', '#dcc694');
        } 
        else if (theme === 'matrix') {
            root.style.setProperty('--bg-app', '#000000');
            root.style.setProperty('--text-main', '#00ff41');
            root.style.setProperty('--bg-sidebar', '#051a05');
        } 
        else if (theme === 'gold') {
            root.style.setProperty('--bg-app', '#fdf6e3');
            root.style.setProperty('--text-main', '#5c452d');
            root.style.setProperty('--bg-sidebar', '#eee8d5');
        } 
        else if (theme === 'glass') {
            root.style.setProperty('--bg-app', '#f0f8ff');
            root.style.setProperty('--text-main', '#2c3e50');
            root.style.setProperty('--bg-sidebar', '#e1eef7');
        }
    }
    
    if (save) {
        saveReaderPreferences();
        closeAllPopups();
    }
}

function closeAllPopups() {
    document.querySelectorAll('.tool-popup').forEach(el => el.classList.remove('active'));
}

function toggleSidebar() {
    document.querySelector('.sidebar').classList.toggle('collapsed');
}

// DRAGGABLE SETTINGS BAR
const settingsBar = document.getElementById('settingsBar');
let isDragging = false;
let startX, startY, initialLeft, initialTop;

if (settingsBar) settingsBar.addEventListener('mousedown', dragStart);

function dragStart(e) {
    // STRICT RULE: Only allow dragging if clicking the .drag-handle
    // We check if the clicked element (target) is inside our new handle
    if (!e.target.closest('.drag-handle')) {
        return; // Ignore everything else. Stay put.
    }

    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    
    const rect = settingsBar.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;
    
    // Snappiness: Remove transition while dragging
    settingsBar.style.transition = 'none';
    
    document.addEventListener('mousemove', dragMove);
    document.addEventListener('mouseup', dragEnd);
}

function dragMove(e) {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    settingsBar.style.left = (initialLeft + dx) + 'px';
    settingsBar.style.top = (initialTop + dy) + 'px';
}

function dragEnd() {
    isDragging = false;
    
    // Restore smooth movement for when you open/close it later
    settingsBar.style.transition = 'transform 0.1s';
    
    document.removeEventListener('mousemove', dragMove);
    document.removeEventListener('mouseup', dragEnd);
}

function deleteCurrentBook() {
    if(!confirm("Are you sure?")) return;
    let libraryData = JSON.parse(localStorage.getItem(DB_NAME)) || [];
    libraryData = libraryData.filter(b => b.id !== currentBookID);
    localStorage.setItem(DB_NAME, JSON.stringify(libraryData));
    window.location.href = 'LibraryHub-Collections.html';
}

function toggleNightVision() {
    document.body.classList.toggle('night-mode');
    const icon = document.getElementById('nvIcon');
    const text = document.getElementById('nvText');
    if (document.body.classList.contains('night-mode')) {
        icon.innerText = 'dark_mode';
        text.innerText = 'Night Vision: On';
    } else {
        icon.innerText = 'wb_sunny';
        text.innerText = 'Night Vision: Off';
    }
}

// G. CONTEXT MENU LOGIC
// G. CONTEXT MENU LOGIC
let pendingOffset = 0; // Where we WANT to start reading

function showContextMenu(e, clickedPara) {
    activeBookmarkPara = clickedPara; 

    // --- BUG FIX: CALCULATE OFFSET IMMEDIATELY ---
    // We loop through all previous paragraphs to find the exact character count
    pendingOffset = 0;
    const allParas = document.querySelectorAll('.smart-paragraph');
    for (let p of allParas) {
        if (p === clickedPara) break; 
        pendingOffset += p.innerText.length + 1; // +1 accounts for the invisible newline
    }
    // ---------------------------------------------

    const menu = document.getElementById('readerContextMenu');
    const colorMenu = document.getElementById('colorPickerMenu');
    
    // Hide Color Menu if it was open
    if(colorMenu) colorMenu.style.display = 'none';

    // 1. JAILBREAK
    if (menu && menu.parentNode !== document.body) {
        document.body.appendChild(menu);
    }

    // 2. DETECT SELECTION
    const selection = window.getSelection().toString().trim();
    const isSelection = selection.length > 0;
    const isOneWord = isSelection && !selection.includes(" ");

    // Get Buttons
    const btnText = document.getElementById('btnHighlightText');
    const btnPara = document.getElementById('btnHighlightPara');
    const btnDefine = document.getElementById('menuDefineBtn');
    const btnBank = document.getElementById('menuBankBtn');

    // A. Highlight Logic
    if (isSelection) {
        btnText.style.display = 'flex';
        btnPara.style.display = 'none'; 
    } else {
        btnText.style.display = 'none';
        btnPara.style.display = 'flex'; 
    }

    // B. Dictionary Logic
    if (isOneWord) {
        btnDefine.style.display = 'flex';
        btnBank.style.display = 'flex';
        window.lastSelectedWord = selection;
    } else {
        btnDefine.style.display = 'none';
        btnBank.style.display = 'none';
    }

    // 3. SHOW MENU
    if (menu) {
        menu.style.display = 'block';
        menu.style.left = e.clientX + 'px';
        
        const distBottom = window.innerHeight - e.clientY;
        menu.style.top = (distBottom < 200) ? (e.clientY - menu.offsetHeight) + 'px' : e.clientY + 'px';
        menu.style.zIndex = "2147483647";
    }

    // 4. SMART VISUAL FEEDBACK
    if (clickedPara.style.backgroundColor === '' || clickedPara.style.backgroundColor === 'transparent') {
        clickedPara.style.boxShadow = "inset 3px 0 0 var(--accent-color)";
        setTimeout(() => clickedPara.style.boxShadow = "none", 1000); 
    }
}


///////
function confirmReadStart() {
    // 1. Hide Menu & Clear Highlights
    document.getElementById('readerContextMenu').style.display = 'none';
    document.querySelectorAll('.smart-paragraph').forEach(p => p.style.background = 'transparent');
    
    // 2. Update the Official Engine Memory
    currentTextPosition = pendingOffset;

    // 3. KILL SWITCH (Silence everything first)
    if (audioSynth) {
        audioSynth.cancel(); // Stop talking immediately
    }
    if (autoScrollTimer) {
        clearInterval(autoScrollTimer); // Stop moving immediately
    }

    // 4. Update UI Button to "Pause" state (since we are about to play)
    const btn = document.getElementById('btnAudio');
    if (btn) {
        btn.classList.add('active');
        const icon = btn.querySelector('span');
        if(icon) icon.innerText = "pause_circle";
    }
    
    isReadingAudio = true;
    
    // 5. THE BREATH (Wait for the browser to clear its throat)
    // We increase this from 50ms to 300ms to prevent the "Start at 0" glitch
    setTimeout(() => {
        console.log("Starting speech at index:", currentTextPosition);
        startSpeaking(true);   // TRUE = Resume from currentTextPosition
        startAutoScroll(true); // TRUE = Force start scrolling
    }, 300);
}

// Close menu if clicking elsewhere
document.addEventListener('click', function(e) {
    const menu = document.getElementById('readerContextMenu');
    const colorMenu = document.getElementById('colorPickerMenu');
    
    // Check if we clicked OUTSIDE the menus
    if (menu && !menu.contains(e.target) && !e.target.closest('.smart-paragraph')) {
        menu.style.display = 'none';
    }
    
    if (colorMenu && !colorMenu.contains(e.target)) {
        colorMenu.style.display = 'none';
    }
});

/* =========================================
   FILE REPLACEMENT SYSTEM (The Brain Transplant)
   ========================================= */

function triggerFileReplace() {
    document.getElementById('replaceFileInput').click();
}

function processReplacementFile(input) {
    const file = input.files[0];
    if (!file) return;

    if(!confirm("This will overwrite the current book file. Continue?")) {
        input.value = ''; 
        return;
    }

    document.getElementById('loader').style.display = 'flex';
    document.getElementById('loader').innerText = "REPLACING CONTENT...";
    
    // Hide text temporarily
    const textEl = document.getElementById('textContent');
    if(textEl) textEl.style.opacity = '0.5';

    const fileType = file.name.split('.').pop().toLowerCase();

    // 1. HANDLE TEXT (.txt)
    if (fileType === 'txt') {
        const reader = new FileReader();
        reader.onload = function(e) { performReplacement(e.target.result, 'text'); };
        reader.readAsText(file);
    } 
    
    // 2. HANDLE WORD (.docx)
    else if (fileType === 'docx') {
        const reader = new FileReader();
        reader.onload = function(e) {
            mammoth.extractRawText({arrayBuffer: e.target.result})
                .then(function(result){ performReplacement(result.value, 'text'); }) 
                .catch(function(err){ alert("Word Doc Error: " + err.message); });
        };
        reader.readAsArrayBuffer(file);
    }

    // 3. HANDLE PDF (.pdf)
    else if (fileType === 'pdf') {
        const reader = new FileReader();
        reader.onload = function(e) { 
            // Send the Base64 Data URL to the saver
            performReplacement(e.target.result, 'pdf'); 
        };
        reader.readAsDataURL(file);
    }
    
    input.value = ''; 
}

// We also need to update the helper function to accept the 'type'
function performReplacement(newContent, type) {
    // 1. UPDATE VAULT (LocalStorage)
    const library = JSON.parse(localStorage.getItem(DB_NAME)) || [];
    const bookIndex = library.findIndex(b => b.id === currentBookID);
    
    if (bookIndex !== -1) {
        // UPDATE THE FILE TYPE (Critical for PDF switching)
        library[bookIndex].fileType = type;
        
        // RESET PROGRESS (Old bookmarks won't match new file)
        library[bookIndex].bookmarks = [];  
        library[bookIndex].progress = 0;    
        
        localStorage.setItem(DB_NAME, JSON.stringify(library));
    }

    // 2. UPDATE CONTENT DB (IndexedDB)
    const request = indexedDB.open(CONTENT_DB_NAME, 1);
    
    request.onsuccess = function(event) {
        const db = event.target.result;
        const transaction = db.transaction(['books'], 'readwrite');
        const store = transaction.objectStore('books');
        
        const putRequest = store.put({ id: currentBookID, content: newContent });
        
        putRequest.onsuccess = function() {
            alert("Book file replaced successfully!");
            location.reload(); // Reloads to show the new PDF/Text
        };
        
        putRequest.onerror = function() {
            alert("Database Error: Could not save new file.");
            document.getElementById('loader').style.display = 'none';
            if(textEl) textEl.style.opacity = '1';
        };
    };
}

/* =========================================
   DIMMER SWITCH LOGIC (SELF-HEALING)
   ========================================= */
function toggleLowBrightness() {
    isLowBrightness = !isLowBrightness;
    
    // 1. SELF-HEALING: Does the overlay exist? If not, build it.
    let overlay = document.getElementById('brightnessOverlay');
    
    if (!overlay) {
        console.log("Creating Dimmer Overlay..."); // Debug
        overlay = document.createElement('div');
        overlay.id = 'brightnessOverlay';
        
        // CSS properties injected directly to ensure they work
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.background = 'black'; // The "Tint"
        overlay.style.opacity = '0';        // Start invisible
        overlay.style.pointerEvents = 'none'; // CLICK-THROUGH MAGIC
        
        // Z-INDEX: High enough to cover text, low enough to be under the Context Menu
        overlay.style.zIndex = '2147483600'; 
        
        overlay.style.transition = 'opacity 0.5s ease'; // Smooth fade
        
        document.body.appendChild(overlay);
    }
    
    // 2. TOGGLE THE LIGHTS
    const icon = document.getElementById('dimIcon');
    const text = document.getElementById('dimText');
    
    if (isLowBrightness) {
        // DIM ACTIVE: Set opacity to 0.4 (40% Darker)
        // You can increase this to 0.5 or 0.6 if 0.4 isn't dark enough
        overlay.style.opacity = '0.4'; 
        
        if(icon) icon.innerText = "brightness_5"; 
        if(text) text.innerText = "Dim Lights: On";
    } else {
        // DIM OFF
        overlay.style.opacity = '0';
        
        if(icon) icon.innerText = "brightness_6";
        if(text) text.innerText = "Dim Lights: Off";
    }
}

/* =========================================
   SMART SENSOR (ENVIRONMENTAL TRACKING)
   ========================================= */
function initSmartDimmer() {
    // 1. Check if the browser supports "Generic Sensors"
    if (!('AmbientLightSensor' in window)) {
        console.log("LifeHub: Light Sensor not supported on this device.");
        return;
    }

    try {
        const sensor = new AmbientLightSensor();
        
        // 2. Listen for changes in room brightness
        sensor.onreading = () => {
            const lux = sensor.illuminance;
            // console.log("Room Brightness (Lux):", lux); // Uncomment to debug

            // DARK ROOM (< 10 lux) -> Turn Dimmer ON
            // We only trigger if it's currently OFF to avoid fighting you
            if (lux < 10 && !isLowBrightness) {
                console.log("LifeHub: Dark room detected. Dimming lights.");
                toggleLowBrightness(); 
            } 
            
            // BRIGHT ROOM (> 40 lux) -> Turn Dimmer OFF
            // We only trigger if it's currently ON
            else if (lux > 40 && isLowBrightness) {
                console.log("LifeHub: Bright room detected. Restoring lights.");
                toggleLowBrightness();
            }
        };

        sensor.onerror = (event) => {
            console.warn("Sensor Error:", event.error.name, event.error.message);
        };
        
        sensor.start();
        
    } catch (err) {
        console.log("LifeHub: Could not start Light Sensor.");
    }
}

/* =========================================
   BOOKMARK ENGINE
   ========================================= */

// A. SAVE THE BOOKMARK
function saveBookmarkFromMenu() {
    // 1. Hide Menu
    document.getElementById('readerContextMenu').style.display = 'none';
    document.querySelectorAll('.smart-paragraph').forEach(p => p.style.background = 'transparent');

    if (!currentBookID || !activeBookmarkPara) return;

    // 2. Prepare Data
    const previewText = activeBookmarkPara.innerText.substring(0, 150) + "..."; 
    
    // --- UPDATED: Date + Time Stamp ---
    const now = new Date();
    const datePart = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); // "Dec 17"
    const timePart = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); // "4:02 PM"
    const fullDateStr = `${datePart} • ${timePart}`; 
    // ----------------------------------

    const newBookmark = {
        id: Date.now(), 
        date: fullDateStr, // Saving the combo string
        text: previewText,
        offset: pendingOffset // Now this actually has a value!
    };

    // 3. Save to Vault
    const library = JSON.parse(localStorage.getItem(DB_NAME)) || [];
    const bookIndex = library.findIndex(b => b.id === currentBookID);

    if (bookIndex !== -1) {
        if (!library[bookIndex].bookmarks) library[bookIndex].bookmarks = [];
        
        library[bookIndex].bookmarks.unshift(newBookmark); 
        localStorage.setItem(DB_NAME, JSON.stringify(library));
        
        alert("Bookmark Saved!");
    }
}

// B. SHOW THE LIST (View Switcher)
function showBookmarksView() {
    // 1. CLEAN THE SLATE
    hideAllViews(); 
    
    // 2. Show Only Bookmarks
    document.getElementById('bookmarksView').style.display = 'block';
    
    // 3. Highlight Sidebar
    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
    // Optional: add logic here to highlight the button if you wish

    // 4. Fetch & Render Data
    const library = JSON.parse(localStorage.getItem(DB_NAME)) || [];
    const book = library.find(b => b.id === currentBookID);
    const listContainer = document.getElementById('bookmarksList');
    
    listContainer.innerHTML = ''; 

    if (!book || !book.bookmarks || book.bookmarks.length === 0) {
        listContainer.innerHTML = `
            <div style="text-align:center; padding:60px; color:var(--text-muted); opacity:0.6;">
                <span class="material-symbols-outlined" style="font-size:40px; margin-bottom:15px;">bookmark_border</span><br>
                <div style="font-family:var(--font-ui); letter-spacing:1px; font-size:12px; font-weight:700;">NO BOOKMARKS YET</div>
                <div style="font-size:11px; margin-top:5px;">Tap any paragraph to fold the corner.</div>
<div style="font-size: 11px; color: #ff2f2f; margin-top: 5px; text-align: center; opacity: 0.8;">
    (This feature is only available for Text Document or Word files. Not applicable for PDF.)
</div>
            </div>`;
        return;
    }

    book.bookmarks.forEach(bm => {
        const item = document.createElement('div');
        item.className = 'bookmark-item'; 
        
        // The main click jumps to the spot
        item.onclick = () => jumpToBookmark(bm.offset);

        item.innerHTML = `
            <div class="bookmark-header">
                <div class="bookmark-date">
                    <span class="material-symbols-outlined" style="font-size:14px; color:var(--accent-color);">bookmark</span>
                    ${bm.date}
                </div>
                
                <span class="material-symbols-outlined delete-bookmark-btn" 
                      title="Remove Bookmark"
                      onclick="event.stopPropagation(); deleteBookmark(${bm.id})">
                      close
                </span>
            </div>
            
            <div class="bookmark-text">
                "${bm.text}"
            </div>
        `;
        listContainer.appendChild(item);
    });
}


function deleteBookmark(id) {
    if(!confirm("Remove this bookmark?")) return;

    const library = JSON.parse(localStorage.getItem(DB_NAME)) || [];
    const bookIndex = library.findIndex(b => b.id === currentBookID);

    if (bookIndex !== -1) {
        // Filter out the one we clicked
        library[bookIndex].bookmarks = library[bookIndex].bookmarks.filter(bm => bm.id !== id);
        
        // Save
        localStorage.setItem(DB_NAME, JSON.stringify(library));
        
        // Re-render the list immediately to show it's gone
        showBookmarksView();
    }
}


// C. JUMP TO BOOKMARK (Time Travel)
function jumpToBookmark(targetOffset) {
    // 1. Switch back to Reading Mode
    document.getElementById('bookmarksView').style.display = 'none';
    
    // --- THE FIX: BRING BACK THE BAR ---
    document.getElementById('progressBar').style.display = 'block';
    document.getElementById('progressText').style.display = 'block';
    // -----------------------------------

    document.getElementById('textContent').style.display = 'block';
    
    // Reset Sidebar Active State
    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
    document.querySelector('.menu-item:first-child').classList.add('active');

    // 2. Find the Paragraph
    const allParas = document.querySelectorAll('.smart-paragraph');
    let currentCount = 0;
    let targetPara = null;

    for (let p of allParas) {
        // Check if this paragraph starts at the target offset
        // We allow a tiny margin of error (5 chars) just in case
        if (Math.abs(currentCount - targetOffset) < 5) { 
            targetPara = p;
            break;
        }
        currentCount += p.innerText.length + 1; // +1 for newline
    }

    // 3. Scroll & Highlight
    if (targetPara) {
        targetPara.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Flash Gold
        targetPara.style.transition = "background 0.5s";
        targetPara.style.background = "rgba(212, 175, 55, 0.4)";
        setTimeout(() => targetPara.style.background = "transparent", 1500);
        
        // Sync Audio Engine
        currentTextPosition = targetOffset; 
    } else {
        console.log("Could not find exact paragraph match. Jumping to approximate location.");
    }
}

function returnToReading() {
    // 1. CLEAN THE SLATE
    hideAllViews();

    // 2. RE-ACTIVATE PROGRESS UI (Bring back the bar)
    document.getElementById('progressBar').style.display = 'block';
    document.getElementById('progressText').style.display = 'block';

    // 3. Show Book Content
    const library = JSON.parse(localStorage.getItem(DB_NAME)) || [];
    const book = library.find(b => b.id === currentBookID);

    if (book && book.fileType === 'pdf') {
        document.getElementById('pdfContent').style.display = 'block';
    } else {
        document.getElementById('textContent').style.display = 'block';
    }

    // 4. Highlight Sidebar
    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
    document.querySelector('.menu-item:first-child').classList.add('active');

    // 5. THE CURE: Snap back to where we left off!
    if (book) restoreReadingPosition(book);
}


/* =========================================
   DICTIONARY ENGINE (THE LEXICON)
   ========================================= */

async function defineSelectedWord() {
    console.log("Dictionary Triggered...");

    // 1. Get the word & Clean it (Remove punctuation like . , ! ?)
    let word = window.lastSelectedWord;
    if (!word) return;
    
    // Strip punctuation to ensure API finds it (e.g. "laptop," becomes "laptop")
    word = word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");

    const card = document.getElementById('definitionCard');
    const menu = document.getElementById('readerContextMenu');
    const defWord = document.getElementById('defWord');
    const defText = document.getElementById('defText');

    // 2. JAILBREAK: Move Card to Body (Fixes "Nothing shows up")
    if (card && card.parentNode !== document.body) {
        document.body.appendChild(card);
    }

    // 3. Position & Show
    if (card && menu) {
        // Steal the menu's coordinates
        card.style.left = menu.style.left;
        card.style.top = menu.style.top;
        
        card.style.display = 'block';
        card.style.zIndex = "2147483648"; // One layer above the menu
        
        menu.style.display = 'none'; // Hide the menu
    }

    // 4. Update Text
    if (defWord) defWord.innerText = word;
    if (defText) defText.innerText = "Searching archives...";

    // 5. Fetch Definition
    try {
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
        
        if (!response.ok) throw new Error("Word not found");
        
        const data = await response.json();

        if (data.title === "No Definitions Found") {
            defText.innerText = "No definition found for this word.";
        } else {
            // Get the first definition found
            const meaning = data[0].meanings[0].definitions[0].definition;
            const partOfSpeech = data[0].meanings[0].partOfSpeech;
            
            // Format: [noun] The definition...
            defText.innerHTML = `<span style="color:var(--accent-color); font-weight:bold; font-size:11px; text-transform:uppercase;">[${partOfSpeech}]</span> ${meaning}`;
        }
    } catch (err) {
        console.warn("Dictionary Error:", err);
        if (defText) defText.innerText = "Could not define this word.";
    }
}

/* =========================================
   WORD BANK ENGINE (VOCABULARY BUILDER)
   ========================================= */

// A. SAVE TO BANK
async function saveToWordBank() {
    // 1. Hide Menu
    document.getElementById('readerContextMenu').style.display = 'none';
    document.querySelectorAll('.smart-paragraph').forEach(p => p.style.background = 'transparent');

    let word = window.lastSelectedWord;
    if (!word) return;
    
    // Clean punctuation
    word = word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"").toLowerCase();

    // 2. Feedback (Toast or Alert)
    // We'll use a simple alert for now, or a custom toast if you prefer
    // alert(`Saving "${word}" to Word Bank...`);

    // 3. Fetch Definition (Background)
    let definition = "No definition available.";
    let type = "noun";

    try {
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
        const data = await response.json();
        if (data[0]) {
            definition = data[0].meanings[0].definitions[0].definition;
            type = data[0].meanings[0].partOfSpeech;
        }
    } catch (e) {
        console.log("Word Bank: Could not fetch definition automatically.");
    }

    // 4. Save to Global Memory
    const vocabList = JSON.parse(localStorage.getItem(VOCAB_DB)) || [];
    
    // Check duplicates
    if (vocabList.some(v => v.word === word)) {
        alert(`"${word}" is already in your Word Bank.`);
        return;
    }

    const newEntry = {
        id: Date.now(),
        word: word,
        definition: definition,
        type: type,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        sourceBook: document.title.replace("Reading: ", "") // Remember where you found it
    };

    vocabList.unshift(newEntry); // Add to top
    localStorage.setItem(VOCAB_DB, JSON.stringify(vocabList));
    
    alert(`Saved "${word}" to Word Bank!`);
}

// B. VIEW WORD BANK
function showWordBankView() {
    const view = document.getElementById('wordBankView');
    if (!view) return; // Safety check

    // 1. CLEAN THE SLATE
    hideAllViews();

    // 2. Show Only Word Bank
    view.style.display = 'block';
    
    // 3. Highlight Sidebar Button
    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
    const sidebarItems = document.querySelectorAll('.menu-item');
    for (let item of sidebarItems) {
        if (item.innerText.includes("Word Bank")) {
            item.classList.add('active');
            break;
        }
    }

    // 4. Render Content
    const list = JSON.parse(localStorage.getItem(VOCAB_DB)) || [];
    const container = document.getElementById('wordBankList');
    const countLabel = document.getElementById('vocabCount');
    
    container.innerHTML = '';
    if(countLabel) countLabel.innerText = list.length + " Words";

    if (list.length === 0) {
        container.innerHTML = `
        <div style="grid-column:1/-1; text-align:center; color:var(--text-muted); margin-top:50px;">
            <span class="material-symbols-outlined" style="font-size:40px; margin-bottom:10px; opacity:0.5;">school</span><br>
            Your Word Bank is empty.<br>
            <div style="font-size:11px; margin-top:5px;"> Highlight a word and click "Add to Word Bank" to save it.</span>
<div style="font-size: 11px; color: #ff2f2f; margin-top: 5px; text-align: center; opacity: 0.8;">
    (This feature is only available for Text Document or Word files. Not applicable for PDF.)
</div

        </div>`;
        return;
    }

    list.forEach(entry => {
        const card = document.createElement('div');
        card.className = 'vocab-card';
        card.innerHTML = `
            <span class="material-symbols-outlined delete-vocab" onclick="deleteWord(${entry.id})" title="Remove">close</span>
            <div class="vocab-word">${entry.word}</div>
            <div class="vocab-def">
                <span style="color:var(--accent-color); font-weight:bold; font-size:11px;">[${entry.type}]</span> 
                ${entry.definition}
            </div>
            <div class="vocab-meta">Found in: ${entry.sourceBook}</div>
        `;
        container.appendChild(card);
    });
}

// C. DELETE WORD
function deleteWord(id) {
    if(!confirm("Remove this word from your bank?")) return;
    
    let list = JSON.parse(localStorage.getItem(VOCAB_DB)) || [];
    list = list.filter(w => w.id !== id);
    localStorage.setItem(VOCAB_DB, JSON.stringify(list));
    
    showWordBankView(); // Re-render
}

// HELPER: The "Master Switch" to hide everything
function hideAllViews() {
    const text = document.getElementById('textContent');
    const pdf = document.getElementById('pdfContent');
    const bookmarks = document.getElementById('bookmarksView');
    const wordbank = document.getElementById('wordBankView');
    const loader = document.getElementById('loader');
    const annotations = document.getElementById('annotationsView');
    const about = document.getElementById('aboutView');


    // UI Elements to Hide
    const bar = document.getElementById('progressBar');
    const progText = document.getElementById('progressText');
    
    if(text) text.style.display = 'none';
    if(pdf) pdf.style.display = 'none';
    if(bookmarks) bookmarks.style.display = 'none';
    if(wordbank) wordbank.style.display = 'none';
    if(loader) loader.style.display = 'none';
    if(about) about.style.display = 'none';
    
    // Hide the Progress Bar too (It will be re-enabled in returnToReading)
    if(bar) bar.style.display = 'none';
    if(progText) progText.style.display = 'none';
    if(annotations) annotations.style.display = 'none';
}

/* =========================================
   ANNOTATIONS ENGINE
   ========================================= */

let pendingHighlightType = null; 
let pendingSelectionText = ""; 
let pendingRange = null;
let pendingParaIndex = null; // <--- NEW: Memory slot for location

function openColorPicker(type) {
    pendingHighlightType = type;
    pendingParaIndex = null; // Reset
    
    // 1. CAPTURE SELECTION & LOCATION
    if (type === 'text') {
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
            pendingRange = sel.getRangeAt(0).cloneRange(); 
            pendingSelectionText = sel.toString();         
            
            // SMART DETECT: Which paragraph is this inside?
            let container = pendingRange.startContainer;
            // If we clicked text, go up one level to find the <p> tag
            if (container.nodeType === 3) container = container.parentElement;
            
            if (container.id && container.id.startsWith('para-')) {
                pendingParaIndex = container.id; // Gotcha! e.g., "para-25"
            }
        }
    }
    
    // 2. UI Logic (Keep as is)
    const menu = document.getElementById('readerContextMenu');
    const colorMenu = document.getElementById('colorPickerMenu');
    
    if (colorMenu.parentNode !== document.body) document.body.appendChild(colorMenu);

    if (menu && colorMenu) {
        colorMenu.style.left = menu.style.left;
        colorMenu.style.top = menu.style.top;
        colorMenu.style.display = 'block';
        colorMenu.style.zIndex = "2147483648";
        menu.style.display = 'none'; 
    }
}

function applyHighlight(color) {
    document.getElementById('colorPickerMenu').style.display = 'none';

    if (!currentBookID) return;

    let textContent = "";
    let paraIndex = null;
    let type = pendingHighlightType;

    // A. HANDLE PARAGRAPH
    if (type === 'paragraph' && activeBookmarkPara) {
        activeBookmarkPara.style.backgroundColor = (color === 'transparent') ? '' : color;
        activeBookmarkPara.style.transition = "background 0.5s";
        textContent = activeBookmarkPara.innerText;
        paraIndex = activeBookmarkPara.id; 
    } 
    
    // B. HANDLE TEXT (Now with Location!)
    else if (type === 'text') {
        textContent = pendingSelectionText;
        paraIndex = pendingParaIndex; // <--- SAVING THE ID HERE

        // VISUAL PAINT
        if (pendingRange && color !== 'transparent') {
            try {
                const span = document.createElement('span');
                span.style.backgroundColor = color;
                span.style.borderRadius = "2px"; 
                span.style.boxShadow = `0 0 2px ${color}`;
                pendingRange.surroundContents(span); 
                window.getSelection().removeAllRanges();
            } catch (e) {
                console.log("LifeHub: Selection spans multiple nodes (visual skip).");
            }
        }
    }

    if (!textContent) return;

    // 2. SAVE TO VAULT
    const library = JSON.parse(localStorage.getItem(DB_NAME)) || [];
    const bookIndex = library.findIndex(b => b.id === currentBookID);

    if (bookIndex !== -1) {
        if (!library[bookIndex].annotations) library[bookIndex].annotations = [];

        // Avoid Duplicates for Paragraphs
        if (type === 'paragraph') {
            library[bookIndex].annotations = library[bookIndex].annotations.filter(a => a.paraIndex !== paraIndex);
        }

        if (color !== 'transparent') {
            library[bookIndex].annotations.unshift({
                id: Date.now(),
                type: type,
                text: textContent,
                color: color,
                paraIndex: paraIndex,
                date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            });
        }
        
        localStorage.setItem(DB_NAME, JSON.stringify(library));
        
        // REMOVED: showAnnotationsView(); 
        // Now you stay exactly where you are!
    }
}

// ... (Keep the rest of the functions like applySavedHighlights unchanged) ...
// RESTORE HIGHLIGHTS ON LOAD
function applySavedHighlights() {
    const library = JSON.parse(localStorage.getItem(DB_NAME)) || [];
    const book = library.find(b => b.id === currentBookID);
    if (!book || !book.annotations) return;

    // We reverse the array so we paint from bottom to top 
    // (helps prevent overlapping highlights from breaking the HTML)
    const notes = [...book.annotations].reverse();

    notes.forEach(note => {
        // 1. Restore Paragraph Fills
        if (note.type === 'paragraph' && note.paraIndex) {
            const el = document.getElementById(note.paraIndex);
            if (el) el.style.backgroundColor = note.color;
        }
        
        // 2. Restore Text Highlights (NEW LOGIC)
        if (note.type === 'text' && note.paraIndex && note.text) {
             const el = document.getElementById(note.paraIndex);
             
             // Safety Check: Make sure the paragraph exists and contains the text
             if (el && el.innerText.includes(note.text)) {
                 const highlightHTML = `<span style="background-color:${note.color}; border-radius:2px; box-shadow:0 0 2px ${note.color};">${note.text}</span>`;
                 
                 // We use a simple replace. Note: It highlights the first occurrence in the paragraph.
                 // For Bible verses, this is usually perfect as verses are unique.
                 el.innerHTML = el.innerHTML.replace(note.text, highlightHTML);
             }
        }
    });
}

// SHOW SIDEBAR VIEW
function showAnnotationsView() {
    const annotationsView = document.getElementById('annotationsView');
    
    hideAllViews(); 
    if (annotationsView) annotationsView.style.display = 'block';
    
    // Highlight sidebar button
    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
    const sidebarItems = document.querySelectorAll('.menu-item');
    for (let item of sidebarItems) {
        if (item.innerText.includes("Annotations")) {
            item.classList.add('active');
            break;
        }
    }

    // Render List
    const library = JSON.parse(localStorage.getItem(DB_NAME)) || [];
    const book = library.find(b => b.id === currentBookID);
    const container = document.getElementById('annotationsList');
    
    if (!container) return;
    container.innerHTML = '';

    if (!book || !book.annotations || book.annotations.length === 0) {
        container.innerHTML = `
<div style="text-align:center; padding:60px; color:var(--text-muted); opacity:0.6;">

<span class="material-symbols-outlined" style="font-size:40px; margin-bottom:15px;">format_ink_highlighter</span><br>
<div style="text-align:center; color:var(--text-muted); margin-top:40px;">No annotations yet.</div>

<div style="font-size:11px; margin-top:5px;">Click a Paragraph or Highlight a Text.</div>
<div style="font-size: 11px; color: #ff2f2f; margin-top: 5px; text-align: center; opacity: 0.8;">
    (This feature is only available for Text Document or Word files. Not applicable for PDF.)
</div
            </div>`;

        return;
    }









    // --- FILTER LOGIC STARTS HERE ---
    let notesToRender = book.annotations;

    // If we aren't looking at 'all', filter the list
    if (currentAnnotationFilter !== 'all') {
        notesToRender = notesToRender.filter(note => note.color === currentAnnotationFilter);
    }
    // --- FILTER LOGIC ENDS HERE ---

    if (notesToRender.length === 0) {
         container.innerHTML = `<div style="text-align:center; color:var(--text-muted); margin-top:40px;">No highlights found in this color.</div>`;
         return;
    }

    notesToRender.forEach(note => {
        const card = document.createElement('div');
        card.className = 'annotation-card';
        card.style.borderLeftColor = note.color; 
        
        const hasNote = note.userNote && note.userNote.trim().length > 0;
        const noteIconColor = hasNote ? note.color : '#ccc';

        card.innerHTML = `
            <div class="card-actions">
                <span class="material-symbols-outlined action-icon" 
                      style="color:${noteIconColor};"
                      onclick="updateNoteSimple(${note.id})" 
                      title="Edit Note">
                      chat_bubble
                </span>
                <span class="material-symbols-outlined action-icon delete-icon" 
                      onclick="deleteAnnotationSimple(${note.id})" 
                      title="Delete">
                      close
                </span>
            </div>

            <div class="annotation-date">
                <span>${note.date}</span>
            </div>
            
            <div class="annotation-quote">"${note.text}"</div> 
            
            ${hasNote ? `<div style="font-family:var(--font-ui); font-size:12px; background:rgba(0,0,0,0.03); padding:8px; border-radius:4px; color:var(--text-muted); margin-top:8px;">📝 ${note.userNote}</div>` : ''}
        `;
        container.appendChild(card);
    });
}

/* =========================================
   SIMPLE NOTE & DELETE LOGIC
   ========================================= */

// 1. DELETE (The Nuker)
function deleteAnnotationSimple(id) {
    if(!confirm("Are you sure you want to delete this highlight?")) return; 

    const library = JSON.parse(localStorage.getItem(DB_NAME)) || [];
    const bookIndex = library.findIndex(b => b.id === currentBookID);

    if (bookIndex !== -1) {
        // STEP 1: CAPTURE THE GHOST
        // We need to find the note *before* we delete it so we know what to erase visually
        const noteToDelete = library[bookIndex].annotations.find(a => a.id == id);

        // STEP 2: DELETE FROM DATABASE
        library[bookIndex].annotations = library[bookIndex].annotations.filter(a => a.id != id);
        localStorage.setItem(DB_NAME, JSON.stringify(library));
        
        // STEP 3: UPDATE SIDEBAR
        showAnnotationsView(); 
        
        // STEP 4: ERASE FROM PAGE (Instant Visual Fix)
        if (noteToDelete) {
            removeVisualHighlight(noteToDelete);
        }
    }
}

function removeVisualHighlight(note) {
    // Safety Check: Do we know where this note lived?
    if (!note.paraIndex) return;
    
    const para = document.getElementById(note.paraIndex);
    if (!para) return; // Paragraph not currently visible (maybe scrolled far away)

    // A. ERASE PARAGRAPH FILL
    if (note.type === 'paragraph') {
        para.style.transition = "background 0.3s ease"; // Smooth fade out
        para.style.backgroundColor = 'transparent';
        para.style.boxShadow = 'none';
    }

    // B. ERASE TEXT HIGHLIGHT
    else if (note.type === 'text') {
        // We look for <span> tags inside this specific paragraph
        const spans = para.querySelectorAll('span');
        
        for (let span of spans) {
            // We check if the text inside the span matches the deleted note
            if (span.innerText === note.text) {
                // "Unwrap" the text: Keep the words, delete the span tag
                const plainText = document.createTextNode(span.innerText);
                span.parentNode.replaceChild(plainText, span);
                
                // Clean up the HTML glue (merges the text back into one block)
                para.normalize(); 
                break; // Job done
            }
        }
    }
}

/* =========================================
   SELF-BUILDING MODAL ENGINE (The "Force Fix")
   ========================================= */

let activeModalNoteID = null; 

// 1. AUTO-BUILDER: Runs immediately to ensure the modal exists
(function injectModal() {
    // Check if it already exists to avoid duplicates
    if (document.getElementById('simpleNoteModal')) return;

    const modalHTML = `
        <div id="simpleNoteModal" style="display:none; position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.5); backdrop-filter:blur(4px); z-index:99999; justify-content:center; align-items:center;">
            <div style="background:var(--bg-app); width:350px; padding:25px; border-radius:12px; box-shadow:0 20px 50px rgba(0,0,0,0.4); border:1px solid var(--border-color); display:flex; flex-direction:column; gap:15px;">
                <div style="font-family:var(--font-ui); font-size:11px; font-weight:700; letter-spacing:2px; color:var(--accent-color); text-align:center;">MY THOUGHTS</div>
                <textarea id="simpleNoteInput" placeholder="Type your note here..." style="width:100%; height:120px; padding:12px; border:1px solid rgba(0,0,0,0.1); border-radius:8px; font-family:var(--font-body); font-size:14px; resize:none; outline:none; background:rgba(0,0,0,0.02); color:var(--text-main);"></textarea>
                <div style="display:flex; justify-content:space-between; gap:10px;">
                    <button onclick="closeSimpleModal()" style="flex:1; padding:12px; border:1px solid #ccc; background:transparent; border-radius:6px; cursor:pointer; font-weight:700; font-size:11px;">CANCEL</button>
                    <button onclick="saveSimpleModal()" style="flex:1; padding:12px; border:none; background:var(--accent-color); color:white; border-radius:6px; cursor:pointer; font-weight:700; font-size:11px;">SAVE</button>
                </div>
            </div>
        </div>
    `;

    // Inject into body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
})();

// 2. OPEN LOGIC
function updateNoteSimple(id) {
    activeModalNoteID = id;
    
    // Find the note
    const library = JSON.parse(localStorage.getItem(DB_NAME)) || [];
    const bookIndex = library.findIndex(b => b.id === currentBookID);
    
    // Safety Check
    if (bookIndex === -1) return;
    const note = library[bookIndex].annotations.find(a => a.id == id);
    
    if (note) {
        const input = document.getElementById('simpleNoteInput');
        const modal = document.getElementById('simpleNoteModal');
        
        // Fill and Show
        input.value = note.userNote || ""; 
        modal.style.display = 'flex'; 
        
        // Auto-focus the typing area
        setTimeout(() => input.focus(), 100);
    }
}

// 3. CLOSE LOGIC
function closeSimpleModal() {
    document.getElementById('simpleNoteModal').style.display = 'none';
    activeModalNoteID = null;
}

// 4. SAVE LOGIC
function saveSimpleModal() {
    if (!activeModalNoteID) return;

    const newText = document.getElementById('simpleNoteInput').value;
    const library = JSON.parse(localStorage.getItem(DB_NAME)) || [];
    const bookIndex = library.findIndex(b => b.id === currentBookID);
    
    if (bookIndex !== -1) {
        const note = library[bookIndex].annotations.find(a => a.id == activeModalNoteID);
        if (note) {
            note.userNote = newText;
            localStorage.setItem(DB_NAME, JSON.stringify(library));
            
            showAnnotationsView(); // Refresh list
            closeSimpleModal();    // Close box
        }
    }
}

/* =========================================
   FILTER LOGIC
   ========================================= */
function setAnnotationFilter(color) {
    currentAnnotationFilter = color;
    
    // Update the UI (Make the clicked dot look "Active")
    // We search based on the onclick attribute because colors can be tricky
    document.querySelectorAll('.filter-dot').forEach(dot => {
        dot.classList.remove('active');
        if (dot.getAttribute('onclick').includes(color)) {
            dot.classList.add('active');
        }
    });

    // Refresh the view with the new filter applied
    showAnnotationsView();
}

/* =========================================
   ABOUT VIEW ENGINE
   ========================================= */

/* =========================================
   ABOUT VIEW ENGINE (Complete Metadata)
   ========================================= */

function showAboutView() {
    // 1. CLEAN THE SLATE
    hideAllViews();
    const view = document.getElementById('aboutView');
    if(view) view.style.display = 'block';

    // 2. Highlight Sidebar
    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
    // (Optional: You can add logic here to highlight the 'About' button)

    // 3. GET DATA
    const library = JSON.parse(localStorage.getItem(DB_NAME)) || [];
    const book = library.find(b => b.id === currentBookID);
    
    if (!book) return;

    // 4. FILL FIELDS (The Basics)
    const setText = (id, text) => {
        const el = document.getElementById(id);
        if(el) el.innerText = text || "--";
    };

    setText('metaTitle', book.title);
    
    // PATCH: Join authors if there's more than one
    const authorText = (book.authors && book.authors.length > 0) 
        ? book.authors.join(', ') 
        : "Unknown Author";
    setText('metaAuthor', authorText);
    
    setText('metaFormat', (book.fileType === 'pdf') ? "PDF Document" : "Standard Text");

    // 5. FILL METADATA (Robust Checks)
    setText('metaGenre', book.genre);
    
    // PATCH: Check both Year AND Date fields
    const yearVal = book.publishYear || book.publishedDate || "--";
    setText('metaPublished', yearVal);
    
    setText('metaISBN', book.isbn);
    setText('metaCharacters', book.characters);
    setText('metaAwards', book.awards);
    
    // PATCH: Sanitize Description (Fix [object Object] bug)
    let cleanDesc = book.description;
    if (typeof cleanDesc === 'object' && cleanDesc !== null && cleanDesc.value) {
        cleanDesc = cleanDesc.value;
    }
    setText('metaSummary', cleanDesc || "No summary available for this book.");

    // 6. CALCULATE STATS
    const bmCount = book.bookmarks ? book.bookmarks.length : 0;
    setText('metaBookmarks', bmCount + " saved spots");

    const noteCount = book.annotations ? book.annotations.length : 0;
    setText('metaAnnotations', noteCount + " highlights");

    // 7. WORD COUNT (The Heavy Lifter)
    if (book.fileType !== 'pdf') {
        const textEl = document.getElementById('textContent');
        // Only count if text is actually loaded
        if (textEl && textEl.innerText.length > 0) {
            const count = textEl.innerText.trim().split(/\s+/).length;
            setText('metaWords', count.toLocaleString() + " words");
        } else {
            setText('metaWords', "Calculating...");
        }
    } else {
        setText('metaWords', "N/A (PDF)");
    }
}