import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, push, onValue, update, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// 1. Initialize Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBDsZywWSQ6kAkUnr90nB6POGF0CosQobU",
  authDomain: "lifehub---light.firebaseapp.com",
  databaseURL: "https://lifehub---light-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "lifehub---light",
  storageBucket: "lifehub---light.firebasestorage.app",
  messagingSenderId: "150442329718",
  appId: "1:150442329718:web:2cf7853eed9a1a2e2c4157",
  measurementId: "G-8JJ8C987WY"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// 2. DOM Elements
const modal = document.getElementById('addIconModal');
const fabBtn = document.querySelector('.fab');
const closeBtn = document.getElementById('closeModalBtn');
const cancelBtn = document.getElementById('cancelBtn');
const saveBtn = document.getElementById('saveIconBtn');
const pathInput = document.getElementById('iconPath');
const svgViewer = document.getElementById('svgViewer');
const svgDataTextarea = document.getElementById('iconSVGData');
const gridContainer = document.getElementById('iconGrid');

// 3. Modal Toggles
const closeModal = () => {
  modal.style.display = 'none';
};
fabBtn.addEventListener('click', () => modal.style.display = 'flex');
closeBtn.addEventListener('click', closeModal);
cancelBtn.addEventListener('click', closeModal);

// 4. Live SVG Preview
pathInput.addEventListener('input', async (e) => {
  const fileName = e.target.value.trim();
  
  if (fileName.toLowerCase().endsWith('.svg')) {
    try {
      const response = await fetch(`icons/${fileName}`);
      if (response.ok) {
        const svgCode = await response.text();
        svgViewer.innerHTML = svgCode;
        svgDataTextarea.value = svgCode;
      } else {
        svgViewer.innerHTML = 'NOT FOUND';
        svgDataTextarea.value = '';
      }
    } catch (error) {
      svgViewer.innerHTML = 'ERROR';
    }
  } else if (fileName === '') {
    svgViewer.innerHTML = 'VIEWER';
    svgDataTextarea.value = '';
  } else {
    svgViewer.innerHTML = '...';
  }
});

// 5. Save Data to Firebase
saveBtn.addEventListener('click', async () => {
  const newIcon = {
    title: document.getElementById('iconTitle').value.trim(),
    creator: document.getElementById('iconCreator').value.trim(),
    category: document.getElementById('iconCategory').value,
    link: document.getElementById('iconLink').value.trim(),
    svg: document.getElementById('iconSVGData').value.trim(),
    projects: document.getElementById('iconProjects').value.trim(),
    family: document.getElementById('iconFamily').value,
    weight: document.getElementById('iconWeight').value,
    path: document.getElementById('iconPath').value.trim(),
    tags: document.getElementById('iconTags').value.trim()
  };

  // Basic validation to ensure you don't push empty cards
  if (!newIcon.title || !newIcon.svg) {
    alert("Please provide at least a Title and load an SVG path.");
    return;
  }

  try {
    // Push the new icon object to a node called 'icons'
    await push(ref(database, 'icons'), newIcon);
    
    // Clear inputs and close modal
    document.querySelectorAll('.modal-content input, .modal-content textarea').forEach(input => input.value = '');
    svgViewer.innerHTML = 'VIEWER';
    closeModal();
  } catch (error) {
    console.error("Error saving to database: ", error);
  }
});

// 6. Fetch and Render Grid in Real-time
onValue(ref(database, 'icons'), (snapshot) => {
  gridContainer.innerHTML = ''; // Clear the grid
  const data = snapshot.val();
  
  if (data) {
    // Loop through each entry in the database
    Object.entries(data).forEach(([key, icon]) => {
      const card = document.createElement('div');
      card.className = 'icon-card';
      card.dataset.id = key;
      card.dataset.iconData = JSON.stringify(icon);
      
      const creatorText = icon.creator ? icon.creator : '';
      
      card.innerHTML = `
        <div class="icon-svg">${icon.svg}</div>
        <div class="icon-name">${icon.title}</div>
        <div class="icon-subtitle">${creatorText}</div>
      `;
      
      gridContainer.appendChild(card);
    });
  } else {
    gridContainer.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">No icons saved yet.</p>';
  }

  // Freshly drawn cards start visible, so re-apply whatever filters are active
  refreshFilterOptions();
  filterIcons();
});

// --- NEW WORK CARD & OPTIONS LOGIC ---

// 1. Grab the new modal elements
const viewIconModal = document.getElementById('viewIconModal');
const optionsTrigger = document.querySelector('.options-trigger');
const optionsDropdown = document.querySelector('.options-dropdown');

// Grab the action modals
const editModal = document.getElementById('editIconModal');
const deleteModal = document.getElementById('deleteModal');
const addProjectModal = document.getElementById('addProjectModal');
const addTagModal = document.getElementById('addTagModal');

// Grab all close buttons across all modals
const allCloseBtns = document.querySelectorAll('.close-modal, .btn-grey, .modal-actions .btn-dark:last-child, .action-buttons .btn-dark:last-child');

// 2. Function to close ALL open modals and dropdowns
const closeAllModals = () => {
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.style.display = 'none';
  });
  optionsDropdown.classList.remove('show'); // Hide dropdown if open
};

// Apply close function to every cancel/X button
allCloseBtns.forEach(btn => {
  btn.addEventListener('click', closeAllModals);
});

// 3. Open the View Modal when an icon card is clicked
// We use event delegation here because the grid items are created dynamically
let currentActiveIconId = null;
let currentActiveIconData = null;

gridContainer.addEventListener('click', (e) => {
  const clickedCard = e.target.closest('.icon-card');
  
  if (clickedCard) {
    // 1. Grab the hidden data from the card
    currentActiveIconId = clickedCard.dataset.id;
    currentActiveIconData = JSON.parse(clickedCard.dataset.iconData);

    // 2. Inject it into the Work Card HTML
    document.querySelector('.view-card-icon').innerHTML = currentActiveIconData.svg || '';
    document.querySelector('.view-title').innerText = currentActiveIconData.title || 'UNTITLED';
    document.querySelector('.view-creator').innerText = currentActiveIconData.creator || currentActiveIconData.family || 'CUSTOM';
    document.querySelector('.projects-list').innerText = currentActiveIconData.projects || 'NONE';

    // 3. Store the copyable text directly on the buttons
    document.querySelector('.copy-btn[data-copy="path"]').dataset.value = currentActiveIconData.path || '';
    document.querySelector('.copy-btn[data-copy="html"]').dataset.value = currentActiveIconData.link || '';
    document.querySelector('.copy-btn[data-copy="svg"]').dataset.value = currentActiveIconData.svg || '';

    viewIconModal.style.display = 'flex';
  }
});

// 4. Position and toggle the 3-dots dropdown menu
// Detach the dropdown from the card so it cannot be clipped by its container.
document.body.appendChild(optionsDropdown);

optionsTrigger.addEventListener('click', (e) => {
  e.stopPropagation(); // Prevents click from instantly bubbling up
  
  const rect = optionsTrigger.getBoundingClientRect();
  optionsDropdown.style.position = 'fixed';
  optionsDropdown.style.top = `${rect.bottom + 8}px`;
  optionsDropdown.style.left = `${rect.right - 140}px`;
  optionsDropdown.style.zIndex = '9999';
  optionsDropdown.classList.toggle('show');
});

// Close dropdown if clicking anywhere else on the screen
document.addEventListener('click', (e) => {
  if (!optionsTrigger.contains(e.target) && !optionsDropdown.contains(e.target)) {
    optionsDropdown.classList.remove('show');
  }
});

// 5. Wire up the Dropdown Menu buttons
const dropdownItems = document.querySelectorAll('.dropdown-item');

dropdownItems.forEach(item => {
  item.addEventListener('click', (e) => {
    const action = e.target.innerText.trim();
    
    // First, close the Work Card and the dropdown
    closeAllModals(); 
    
    // Then, open the specific action modal
    if (action === 'EDIT') {
      // --- ADD THESE LINES TO POPULATE THE FORM ---
      document.getElementById('editTitle').value = currentActiveIconData.title || '';
      document.getElementById('editCreator').value = currentActiveIconData.creator || '';
      document.getElementById('editCategory').value = currentActiveIconData.category || 'Categories';
      document.getElementById('editLink').value = currentActiveIconData.link || '';
      document.getElementById('editSVGData').value = currentActiveIconData.svg || '';
      document.getElementById('editProjects').value = currentActiveIconData.projects || '';
      document.getElementById('editFamily').value = currentActiveIconData.family || '';
      document.getElementById('editWeight').value = currentActiveIconData.weight || '';
      document.getElementById('editPath').value = currentActiveIconData.path || '';
      document.getElementById('editTags').value = currentActiveIconData.tags || '';
      
      // Also update the live viewer box in the edit modal
      document.getElementById('editViewer').innerHTML = currentActiveIconData.svg || 'VIEWER';
      // --------------------------------------------
      
      editModal.style.display = 'flex';
    }
    if (action === 'ADD PROJECT') addProjectModal.style.display = 'flex';
    if (action === 'ADD TAG') {
      quickAddTagInput.value = '';
      addTagModal.style.display = 'flex';
    }
    if (action === 'DELETE') deleteModal.style.display = 'flex';
  });
});

// 6. Copy to Clipboard Logic
const copyBtns = document.querySelectorAll('.copy-btn');

copyBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    const copyType = e.target.getAttribute('data-copy');
    
    let textToCopy = e.target.dataset.value;
    
    // Copy to clipboard
    navigator.clipboard.writeText(textToCopy).then(() => {
      // Visual feedback: change text temporarily
      const originalText = e.target.innerText;
      e.target.innerText = 'COPIED!';
      
      setTimeout(() => {
        e.target.innerText = originalText;
      }, 1500); // Reverts back after 1.5 seconds
    }).catch(err => {
      console.error('Failed to copy: ', err);
    });
  });
});

// --- 10. SEARCH & FILTER LOGIC ---
const topSearchBar = document.querySelector('.search-bar input'); // The main top search
const generalSearchBar = document.querySelector('.left-filters .small-input'); // The second smaller bar
// We target the main dropdown specifically by excluding the modal dropdowns
const mainCategoryFilter = document.querySelector('.category-dropdown:not(.modal-dropdown)');

// The advanced panel behind the sliders icon
const filterTrigger = document.getElementById('filterTrigger');
const filterPanel = document.getElementById('filterPanel');
const filterDot = document.getElementById('filterDot');
const filterClearBtn = document.getElementById('filterClearBtn');
const filterCreator = document.getElementById('filterCreator');
const filterFamily = document.getElementById('filterFamily');
const filterWeight = document.getElementById('filterWeight');
const filterProject = document.getElementById('filterProject');

// Splits a stored "a, b, c" string into clean lowercase pieces
const splitList = (value) => (value || '').split(',').map(v => v.trim()).filter(Boolean);

const filterIcons = () => {
  // Grab the text the user is typing and make it lowercase for easy matching
  const topTerm = topSearchBar.value.toLowerCase().trim();
  const genTerm = generalSearchBar.value.toLowerCase().trim();
  const catTerm = mainCategoryFilter.value;

  // Advanced panel selections (empty string means "no filter")
  const creatorTerm = filterCreator.value.toLowerCase();
  const familyTerm = filterFamily.value.toLowerCase();
  const weightTerm = filterWeight.value.toLowerCase();
  const projectTerm = filterProject.value.toLowerCase();

  // Light up the dot whenever the panel is narrowing things down
  filterDot.classList.toggle('show', Boolean(creatorTerm || familyTerm || weightTerm || projectTerm));

  // Cards that survive every filter — these are what we then split into pages
  const matches = [];

  // Loop through every single icon card currently on the screen
  document.querySelectorAll('#iconGrid .icon-card').forEach(card => {
    // Parse the hidden Firebase data we attached to the card earlier
    const iconData = JSON.parse(card.dataset.iconData);
    
    // 1. Top Bar Match Logic (Checks Title & Tags)
    const title = (iconData.title || '').toLowerCase();
    const tags = (iconData.tags || '').toLowerCase();
    const topMatch = topTerm === '' || title.includes(topTerm) || tags.includes(topTerm);

    // 2. General Bar Match Logic (Checks Title, Tags, Creator, Family, Weight)
    const creator = (iconData.creator || '').toLowerCase();
    const family = (iconData.family || '').toLowerCase();
    const weight = (iconData.weight || '').toLowerCase();
    
    const genMatch = genTerm === '' || 
                     title.includes(genTerm) || 
                     tags.includes(genTerm) || 
                     creator.includes(genTerm) || 
                     family.includes(genTerm) || 
                     weight.includes(genTerm);

    // 3. Category Dropdown Match Logic
    const catMatch = catTerm === 'Categories' || iconData.category === catTerm;

    // 4. Advanced Panel Match Logic (exact matches, not partial)
    const creatorMatch = creatorTerm === '' || creator === creatorTerm;
    const familyMatch = familyTerm === '' || family === familyTerm;
    const weightMatch = weightTerm === '' || weight === weightTerm;
    // Projects are stored as one comma-separated string, so check each entry
    const projectMatch = projectTerm === '' ||
                         splitList(iconData.projects).some(p => p.toLowerCase() === projectTerm);

    // The grand finale: every card starts hidden, and only matches get collected
    card.style.display = 'none';

    if (topMatch && genMatch && catMatch && creatorMatch && familyMatch && weightMatch && projectMatch) {
      matches.push(card);
    }
  });

  // Hand the surviving cards to the pager, which reveals just the current page
  paginate(matches);
};

// --- 10B. PAGINATION ---
const paginationBar = document.getElementById('pagination');
const ICONS_PER_PAGE = 40;
let currentPage = 1;

// Builds the "1 2 ... 9" strip. Always shows first/last plus a window around the current page.
const buildPageNumbers = (totalPages) => {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);

  const pages = new Set([1, totalPages, currentPage]);
  if (currentPage - 1 > 1) pages.add(currentPage - 1);
  if (currentPage + 1 < totalPages) pages.add(currentPage + 1);
  // Keep the strip from collapsing when we sit at either end
  if (currentPage <= 3) [2, 3, 4].forEach(p => pages.add(p));
  if (currentPage >= totalPages - 2) [totalPages - 3, totalPages - 2, totalPages - 1].forEach(p => pages.add(p));

  return [...pages].filter(p => p >= 1 && p <= totalPages).sort((a, b) => a - b);
};

const renderPagination = (totalPages, totalMatches) => {
  paginationBar.innerHTML = '';

  // Nothing to page through
  if (totalMatches === 0 || totalPages <= 1) return;

  const makeBtn = (label, page, { disabled = false, active = false } = {}) => {
    const btn = document.createElement('button');
    btn.className = 'page-btn' + (active ? ' active' : '');
    btn.innerHTML = label;
    btn.disabled = disabled;

    if (!disabled && !active) {
      btn.addEventListener('click', () => {
        currentPage = page;
        filterIcons();
        // Jump back up so you land at the top of the new page
        document.getElementById('iconGrid').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    return btn;
  };

  paginationBar.appendChild(
    makeBtn('<i class="fa-solid fa-chevron-left"></i>', currentPage - 1, { disabled: currentPage === 1 })
  );

  let previousPage = 0;
  buildPageNumbers(totalPages).forEach(page => {
    // Drop an ellipsis wherever we skipped a stretch of pages
    if (page - previousPage > 1) {
      const gap = document.createElement('span');
      gap.className = 'page-ellipsis';
      gap.innerText = '...';
      paginationBar.appendChild(gap);
    }

    paginationBar.appendChild(makeBtn(String(page), page, { active: page === currentPage }));
    previousPage = page;
  });

  paginationBar.appendChild(
    makeBtn('<i class="fa-solid fa-chevron-right"></i>', currentPage + 1, { disabled: currentPage === totalPages })
  );

  const info = document.createElement('span');
  info.className = 'page-info';
  info.innerText = `${totalMatches} ICONS`;
  paginationBar.appendChild(info);
};

// Reveals only the slice of matching cards belonging to the current page
const paginate = (matches) => {
  const totalPages = Math.max(1, Math.ceil(matches.length / ICONS_PER_PAGE));

  // Filtering can shrink the list out from under us, so clamp before slicing
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const start = (currentPage - 1) * ICONS_PER_PAGE;
  matches.slice(start, start + ICONS_PER_PAGE).forEach(card => card.style.display = 'flex');

  renderPagination(totalPages, matches.length);
};

// Any change to a filter sends you back to page 1 — page 5 of the old results is meaningless
const resetAndFilter = () => {
  currentPage = 1;
  filterIcons();
};

// Listen for typing in the inputs, and changes in the dropdown
topSearchBar.addEventListener('input', resetAndFilter);
generalSearchBar.addEventListener('input', resetAndFilter);
mainCategoryFilter.addEventListener('change', resetAndFilter);

// Rebuild the Creator and Project lists from whatever is actually in the grid,
// keeping the current selection if it still exists
const refreshFilterOptions = () => {
  const creators = new Set();
  const projects = new Set();

  document.querySelectorAll('.icon-card').forEach(card => {
    const iconData = JSON.parse(card.dataset.iconData);
    if (iconData.creator && iconData.creator.trim()) creators.add(iconData.creator.trim());
    splitList(iconData.projects).forEach(p => projects.add(p));
  });

  const fill = (select, values, allLabel) => {
    const previous = select.value;
    select.innerHTML = `<option value="">${allLabel}</option>`;

    [...values].sort((a, b) => a.localeCompare(b)).forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      option.innerText = value;
      select.appendChild(option);
    });

    // Restore the old choice, or drop the filter if that value is gone
    select.value = [...values].includes(previous) ? previous : '';
  };

  fill(filterCreator, creators, 'All creators');
  fill(filterProject, projects, 'All projects');
};

// Toggle the panel open/closed
filterTrigger.addEventListener('click', (e) => {
  e.stopPropagation();
  refreshFilterOptions();
  filterPanel.classList.toggle('show');
});

// Clicking outside closes it (but clicking inside the panel does not)
document.addEventListener('click', (e) => {
  if (!filterPanel.contains(e.target) && e.target !== filterTrigger) {
    filterPanel.classList.remove('show');
  }
});

// Every panel dropdown re-runs the filter live
[filterCreator, filterFamily, filterWeight, filterProject].forEach(select => {
  select.addEventListener('change', resetAndFilter);
});

filterClearBtn.addEventListener('click', () => {
  filterCreator.value = '';
  filterFamily.value = '';
  filterWeight.value = '';
  filterProject.value = '';
  resetAndFilter();
});

// --- 11. EDIT ICON LOGIC ---

// A. Live viewer for the Edit Modal
document.getElementById('editPath').addEventListener('input', async (e) => {
  const fileName = e.target.value.trim();
  const viewer = document.getElementById('editViewer');
  const textarea = document.getElementById('editSVGData');
  
  if (fileName.toLowerCase().endsWith('.svg')) {
    try {
      const response = await fetch(`icons/${fileName}`);
      if (response.ok) {
        const svgCode = await response.text();
        viewer.innerHTML = svgCode;
        textarea.value = svgCode;
      } else {
        viewer.innerHTML = 'NOT FOUND';
      }
    } catch (err) { viewer.innerHTML = 'ERROR'; }
  } else if (fileName === '') {
    viewer.innerHTML = 'VIEWER';
    textarea.value = '';
  } else {
    viewer.innerHTML = '...';
  }
});

// B. Save the updated data to Firebase
document.getElementById('saveEditBtn').addEventListener('click', async () => {
  // Safety check: Make sure we actually have an icon selected
  if (!currentActiveIconId) return; 

  // Gather all the updated data from the Edit form inputs
  const updatedIcon = {
    title: document.getElementById('editTitle').value.trim(),
    creator: document.getElementById('editCreator').value.trim(),
    category: document.getElementById('editCategory').value,
    link: document.getElementById('editLink').value.trim(),
    svg: document.getElementById('editSVGData').value.trim(),
    projects: document.getElementById('editProjects').value.trim(),
    family: document.getElementById('editFamily').value,
    weight: document.getElementById('editWeight').value,
    path: document.getElementById('editPath').value.trim(),
    tags: document.getElementById('editTags').value.trim()
  };

  // Basic validation
  if (!updatedIcon.title || !updatedIcon.svg) {
    alert("Title and SVG are required.");
    return;
  }

  try {
    // Overwrite the specific icon's data in the database
    await update(ref(database, `icons/${currentActiveIconId}`), updatedIcon);
    
    // Close the modal upon success!
    closeAllModals(); 
  } catch (error) {
    console.error("Error updating icon: ", error);
  }
});


// --- 12. SIDEBAR & VIEW SWITCHING LOGIC ---
const menuIcon = document.querySelector('.menu-icon'); // Main page hamburger
const sidebar = document.getElementById('sideNav');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const closeSidebarBtn = document.getElementById('closeSidebarBtn');

const iconsView = document.getElementById('iconsView');
const projectsView = document.getElementById('projectsView');
const navProjectsBtn = document.getElementById('navProjectsBtn');

const createNewProjectModal = document.getElementById('createNewProjectModal');
const openNewProjectBtn = document.getElementById('openNewProjectBtn');

// A. Sidebar Toggle Functions
const openSidebar = () => {
  sidebar.classList.add('open');
  sidebarOverlay.classList.add('show');
};

const closeSidebar = () => {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('show');
};

menuIcon.addEventListener('click', openSidebar);
closeSidebarBtn.addEventListener('click', closeSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);

// B. View Switching Router
const navIconsBtn = document.getElementById('navIconsBtn');
const navFontsBtn = document.getElementById('navFontsBtn');
const fontsView = document.getElementById('fontsView');
const mainSubtitle = document.querySelector('.logo h2'); // Grabs the "CSS HELPER" text

// Grab the new tab elements
const mainTabs = document.getElementById('mainTabs');
const tabIconsBtn = document.getElementById('tabIconsBtn');
const tabFontsBtn = document.getElementById('tabFontsBtn');

const switchView = (targetView) => {
  // 1. Hide all views by default
  iconsView.style.display = 'none';
  projectsView.style.display = 'none';
  fontsView.style.display = 'none';

  // 2. Show the requested view, update subtitle, and manage tab underlines
  if (targetView === 'ICONS') {
    iconsView.style.display = 'block';
    mainTabs.style.display = 'block'; // Ensure tabs are visible
    fabBtn.style.display = 'block';
    mainSubtitle.innerText = 'CSS HELPER';
    
    // Swap the underline
    tabIconsBtn.classList.add('active');
    tabFontsBtn.classList.remove('active');
    
  } else if (targetView === 'PROJECTS') {
    projectsView.style.display = 'block';
    mainTabs.style.display = 'none'; // Hide tabs on the projects page
    fabBtn.style.display = 'block';
    mainSubtitle.innerText = 'PROJECTS';
  } else if (targetView === 'FONTS') {
    fontsView.style.display = 'block';
    mainTabs.style.display = 'block'; // Ensure tabs are visible
    fabBtn.style.display = 'none';
    mainSubtitle.innerText = 'CSS HELPER';
    
    // Swap the underline
    tabFontsBtn.classList.add('active');
    tabIconsBtn.classList.remove('active');
  }
  
  // 3. Automatically slide the sidebar away
  closeSidebar();
};

// Wire up the buttons to the router
navProjectsBtn.addEventListener('click', () => switchView('PROJECTS'));
navIconsBtn.addEventListener('click', () => switchView('ICONS'));
navFontsBtn.addEventListener('click', () => switchView('FONTS'));

// Wire up the Main UI Tabs
tabIconsBtn.addEventListener('click', () => switchView('ICONS'));
tabFontsBtn.addEventListener('click', () => switchView('FONTS'));

// C. New Project Modal Toggle
openNewProjectBtn.addEventListener('click', () => {
  createNewProjectModal.style.display = 'flex';
});

// --- 13. PROJECTS DATABASE LOGIC ---
const saveNewProjectBtn = document.getElementById('saveNewProjectBtn');
const newProjectInput = document.getElementById('newProjectInput');
const dynamicProjectsList = document.getElementById('dynamicProjectsList');

// A. Save New Project to Firebase
saveNewProjectBtn.addEventListener('click', async () => {
  const projectName = newProjectInput.value.trim();
  
  if (!projectName) {
    alert("Please enter a project name.");
    return;
  }

  try {
    // Push the new project name to a separate 'projects' node in your database
    await push(ref(database, 'projects'), { name: projectName });
    
    // Clear the input and close the modal upon success
    newProjectInput.value = '';
    closeAllModals(); 
  } catch (error) {
    console.error("Error saving project: ", error);
  }
});

// B. Fetch and Render Projects in Real-Time
onValue(ref(database, 'projects'), (snapshot) => {
  dynamicProjectsList.innerHTML = ''; // Clear the current list
  const data = snapshot.val();
  
  if (data) {
    // Loop through the database and generate a sleek text button for each project
    Object.entries(data).forEach(([key, project]) => {
      const projectDiv = document.createElement('div');
      projectDiv.className = 'project-item-large';
      projectDiv.innerText = project.name;
      
      // Store the database ID secretly in the HTML in case you want to edit/delete projects later
      projectDiv.dataset.id = key; 
      
      dynamicProjectsList.appendChild(projectDiv);
    });
  } else {
    dynamicProjectsList.innerHTML = '<div style="font-family: \'Montserrat\', sans-serif; font-size: 0.8rem; color: var(--text-muted); letter-spacing: 1px;">No projects yet. Create one below!</div>';
  }
});

// --- 14. PROJECT DETAIL & ICON ATTACHMENT LOGIC ---
const projectDetailModal = document.getElementById('projectDetailModal');
const projectDetailTitle = document.getElementById('projectDetailTitle');
const projectIconsGrid = document.getElementById('projectIconsGrid');
const projectDetailFontsList = document.getElementById('projectDetailFontsList');
const saveQuickAddProjectBtn = document.getElementById('saveQuickAddProjectBtn');
const quickAddProjectInput = document.getElementById('quickAddProjectInput');
const fontsListContainer = document.querySelector('.fonts-list-container');
let currentActiveFont = null;

// A. Click a Project -> Open Modal & Display Associated Icons
dynamicProjectsList.addEventListener('click', (e) => {
  const clickedProject = e.target.closest('.project-item-large');
  if (!clickedProject) return;

  const targetProjectName = clickedProject.innerText.trim();
  projectDetailTitle.innerText = targetProjectName;
  
  // 1. Clear existing modal data
  projectIconsGrid.innerHTML = ''; 
  projectDetailFontsList.innerHTML = '';

  // Query Firebase icons node to find matching projects
  onValue(ref(database, 'icons'), (snapshot) => {
    projectIconsGrid.innerHTML = '';
    const iconsData = snapshot.val();
    let matchCount = 0;

    if (iconsData) {
      Object.entries(iconsData).forEach(([key, icon]) => {
        const assignedProjects = (icon.projects || '').toLowerCase();
        
        if (assignedProjects.includes(targetProjectName.toLowerCase())) {
          matchCount++;
          const card = document.createElement('div');
          card.className = 'icon-card';
          
          const libraryText = icon.family || icon.creator || 'Custom';
          card.innerHTML = `
            <div class="icon-svg">${icon.svg}</div>
            <div class="icon-name">${icon.title}</div>
            <div class="icon-library">${libraryText}</div>
          `;
          projectIconsGrid.appendChild(card);
        }
      });
    }

    if (matchCount === 0) {
      projectIconsGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; font-size: 0.75rem; color: var(--text-muted);">No icons linked to this project yet.</p>';
    }
  }, { onlyOnce: true });

  // 3. Fetch linked FONTS (New Code!)
  onValue(ref(database, 'project_fonts'), (snapshot) => {
    projectDetailFontsList.innerHTML = '';
    const fontsData = snapshot.val();
    let fontMatchCount = 0;

    // We use a Set to prevent duplicate fonts from showing up multiple times
    const uniqueFonts = new Set();

    if (fontsData) {
      Object.values(fontsData).forEach((entry) => {
        if (entry.project && entry.project.toLowerCase() === targetProjectName.toLowerCase()) {
          if (!uniqueFonts.has(entry.font)) {
            uniqueFonts.add(entry.font);
            fontMatchCount++;
            
            const fontDiv = document.createElement('div');
            fontDiv.innerText = entry.font;
            // Bonus: Render the name using its actual font family!
            fontDiv.style.fontFamily = `'${entry.font}', sans-serif`;
            
            projectDetailFontsList.appendChild(fontDiv);
          }
        }
      });
    }
    if (fontMatchCount === 0) {
      projectDetailFontsList.innerHTML = '<div style="font-size: 0.75rem; color: var(--text-muted);">No fonts linked yet.</div>';
    }
  }, { onlyOnce: true });

  projectDetailModal.style.display = 'flex';
});

// Listen for clicks on the dynamic font list
fontsListContainer.addEventListener('click', (e) => {
  const addBtn = e.target.closest('.font-item-add-btn');
  if (addBtn) {
    currentActiveFont = addBtn.dataset.font;
    currentActiveIconId = null; // Clear icon context so it knows we are saving a font
    
    // Open the existing Quick Add modal
    document.getElementById('quickAddProjectInput').value = '';
    document.getElementById('addProjectModal').style.display = 'flex';
  }
});

// B. "ADD PROJECT" Quick Action Modal Logic (Updated for both Icons and Fonts)
saveQuickAddProjectBtn.addEventListener('click', async () => {
  const newProjectTag = quickAddProjectInput.value.trim();

  if (!newProjectTag) return alert("Please enter a project name.");

  try {
    if (currentActiveIconId) {
      // --- ICON SAVING LOGIC (Your existing code) ---
      const existingProjects = currentActiveIconData.projects ? currentActiveIconData.projects.split(',').map(p => p.trim()).filter(Boolean) : [];
      if (!existingProjects.some(p => p.toLowerCase() === newProjectTag.toLowerCase())) {
        existingProjects.push(newProjectTag);
      }
      const updatedProjectsString = existingProjects.join(', ');

      await update(ref(database, `icons/${currentActiveIconId}`), { projects: updatedProjectsString });
      currentActiveIconData.projects = updatedProjectsString;
      document.querySelector('.projects-list').innerText = updatedProjectsString;

    } else if (currentActiveFont) {
      // --- FONT SAVING LOGIC (New) ---
      // Pushes a new record to a 'project_fonts' node in Firebase
      await push(ref(database, 'project_fonts'), {
        project: newProjectTag,
        font: currentActiveFont,
        styles: fontState // Bonus: We can save your active color/bold/italic states too!
      });
    }

    // Success! Clear and close.
    quickAddProjectInput.value = '';
    closeAllModals();

  } catch (error) {
    console.error("Error linking to project: ", error);
  }
});

// C. "ADD TAG" Quick Action Modal Logic
const quickAddTagInput = document.getElementById('quickAddTagInput');
const saveQuickAddTagBtn = document.getElementById('saveQuickAddTagBtn');

const saveQuickTag = async () => {
  const newTag = quickAddTagInput.value.trim();

  if (!newTag) return alert("Please enter a tag name.");
  if (!currentActiveIconId) return alert("No icon selected.");

  try {
    // Merge the new tag into the existing comma-separated list (no duplicates)
    const existingTags = currentActiveIconData.tags ? currentActiveIconData.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    if (!existingTags.some(t => t.toLowerCase() === newTag.toLowerCase())) {
      existingTags.push(newTag);
    }
    const updatedTagsString = existingTags.join(', ');

    await update(ref(database, `icons/${currentActiveIconId}`), { tags: updatedTagsString });
    currentActiveIconData.tags = updatedTagsString;

    // Success! Clear and close.
    quickAddTagInput.value = '';
    closeAllModals();

  } catch (error) {
    console.error("Error adding tag: ", error);
  }
};

saveQuickAddTagBtn.addEventListener('click', saveQuickTag);

quickAddTagInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    saveQuickTag();
  }
});

// --- 14B. BULK ADD ICONS ---
const bulkAddFab = document.getElementById('bulkAddFab');
const bulkAddModal = document.getElementById('bulkAddModal');
const closeBulkModalBtn = document.getElementById('closeBulkModalBtn');
const cancelBulkBtn = document.getElementById('cancelBulkBtn');
const bulkDropzone = document.getElementById('bulkDropzone');
const bulkFileInput = document.getElementById('bulkFileInput');
const bulkList = document.getElementById('bulkList');
const bulkCount = document.getElementById('bulkCount');
const saveBulkBtn = document.getElementById('saveBulkBtn');
const bulkCreator = document.getElementById('bulkCreator');
const bulkCategory = document.getElementById('bulkCategory');
const bulkFamily = document.getElementById('bulkFamily');
const bulkWeight = document.getElementById('bulkWeight');
const bulkTags = document.getElementById('bulkTags');
const bulkProjects = document.getElementById('bulkProjects');

// The staged files, each one row in the list
let bulkQueue = [];
let bulkRowSeq = 0;

// Turn "solar--logout-line-duotone.svg" into "logout line duotone"
const prettifyFileName = (fileName) => {
  return fileName
    .replace(/\.svg$/i, '')
    .replace(/--/g, ' ')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

// Best-guess the weight/family from words already in the filename
const guessFromName = (fileName, options) => {
  const name = fileName.toLowerCase();
  return options.find(opt => name.includes(opt.toLowerCase())) || '';
};

// Copy the <option> list out of one of the "ALL" dropdowns so rows always match
const optionsFrom = (selectEl) => selectEl.innerHTML;

const renderBulkList = () => {
  bulkList.innerHTML = '';

  bulkQueue.forEach(entry => {
    const row = document.createElement('div');
    row.className = 'bulk-row';
    row.dataset.rowId = entry.id;

    row.innerHTML = `
      <div class="bulk-preview">${entry.svg}</div>
      <div>
        <div class="bulk-filename"></div>
        <input type="text" class="bulk-title" placeholder="Title...">
      </div>
      <select class="modal-dropdown bulk-row-category">${optionsFrom(bulkCategory)}</select>
      <select class="modal-dropdown bulk-row-family">${optionsFrom(bulkFamily)}</select>
      <select class="modal-dropdown bulk-row-weight">${optionsFrom(bulkWeight)}</select>
      <button class="bulk-remove" title="Remove"><i class="fa-solid fa-xmark"></i></button>
    `;

    // Filename goes in as text so odd characters can't break the markup
    row.querySelector('.bulk-filename').textContent = entry.name;

    const titleInput = row.querySelector('.bulk-title');
    const categorySelect = row.querySelector('.bulk-row-category');
    const familySelect = row.querySelector('.bulk-row-family');
    const weightSelect = row.querySelector('.bulk-row-weight');

    titleInput.value = entry.title;
    categorySelect.value = entry.category;
    familySelect.value = entry.family;
    weightSelect.value = entry.weight;

    titleInput.addEventListener('input', (e) => entry.title = e.target.value);
    categorySelect.addEventListener('change', (e) => entry.category = e.target.value);
    familySelect.addEventListener('change', (e) => entry.family = e.target.value);
    weightSelect.addEventListener('change', (e) => entry.weight = e.target.value);

    row.querySelector('.bulk-remove').addEventListener('click', () => {
      bulkQueue = bulkQueue.filter(item => item.id !== entry.id);
      renderBulkList();
    });

    bulkList.appendChild(row);
  });

  bulkCount.innerText = bulkQueue.length
    ? `${bulkQueue.length} ICON${bulkQueue.length > 1 ? 'S' : ''} READY`
    : 'NO FILES LOADED';
};

// Read dropped/picked files and stage them
const addFilesToQueue = async (fileList) => {
  const svgFiles = Array.from(fileList).filter(file => file.name.toLowerCase().endsWith('.svg'));

  if (!svgFiles.length) return alert("Please drop .svg files only.");

  const familyOptions = ['ROUND', 'SHARP', 'COLORED', 'SYMBOL', 'EMOJIES', 'EMOTICONS'];
  const weightOptions = ['THIN', 'LIGHT', 'REGULAR', 'BOLD', 'FILL', 'DUOTONE'];

  for (const file of svgFiles) {
    const svgCode = await file.text();

    bulkQueue.push({
      id: ++bulkRowSeq,
      name: file.name,
      svg: svgCode.trim(),
      title: prettifyFileName(file.name),
      // Row defaults follow the "ALL" bar, but fall back to whatever the filename hints at
      category: bulkCategory.value,
      family: bulkFamily.value || guessFromName(file.name, familyOptions),
      weight: bulkWeight.value || guessFromName(file.name, weightOptions)
    });
  }

  renderBulkList();
};

// Open / close
bulkAddFab.addEventListener('click', () => bulkAddModal.style.display = 'flex');
closeBulkModalBtn.addEventListener('click', () => bulkAddModal.style.display = 'none');
cancelBulkBtn.addEventListener('click', () => bulkAddModal.style.display = 'none');

// Dropzone: click to browse
bulkDropzone.addEventListener('click', () => bulkFileInput.click());
bulkFileInput.addEventListener('change', (e) => {
  addFilesToQueue(e.target.files);
  e.target.value = ''; // Allows re-picking the same file later
});

// Dropzone: drag and drop
['dragenter', 'dragover'].forEach(evt => {
  bulkDropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    bulkDropzone.classList.add('drag-over');
  });
});

['dragleave', 'drop'].forEach(evt => {
  bulkDropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    bulkDropzone.classList.remove('drag-over');
  });
});

bulkDropzone.addEventListener('drop', (e) => {
  if (e.dataTransfer.files.length) addFilesToQueue(e.dataTransfer.files);
});

// Changing an "ALL" dropdown pushes that value onto every staged row
[[bulkCategory, 'category'], [bulkFamily, 'family'], [bulkWeight, 'weight']].forEach(([select, key]) => {
  select.addEventListener('change', () => {
    bulkQueue.forEach(entry => entry[key] = select.value);
    renderBulkList();
  });
});

// Save every staged row as its own icon
saveBulkBtn.addEventListener('click', async () => {
  if (!bulkQueue.length) return alert("Drop some SVG files first.");

  const untitled = bulkQueue.find(entry => !entry.title.trim());
  if (untitled) return alert(`Please give "${untitled.name}" a title.`);

  const sharedCreator = bulkCreator.value.trim();
  const sharedTags = bulkTags.value.trim();
  const sharedProjects = bulkProjects.value.trim();

  saveBulkBtn.disabled = true;
  bulkCount.innerText = 'SAVING...';

  try {
    // Sequential so a partial failure leaves a clear stopping point
    for (const entry of bulkQueue) {
      await push(ref(database, 'icons'), {
        title: entry.title.trim(),
        creator: sharedCreator,
        category: entry.category,
        link: '',
        svg: entry.svg,
        projects: sharedProjects,
        family: entry.family,
        weight: entry.weight,
        path: entry.name,
        tags: sharedTags
      });
    }

    // Reset the whole modal
    bulkQueue = [];
    bulkCreator.value = '';
    bulkTags.value = '';
    bulkProjects.value = '';
    renderBulkList();
    bulkAddModal.style.display = 'none';

  } catch (error) {
    console.error("Error saving icons in bulk: ", error);
    alert("Something went wrong while saving. Check the console.");
  } finally {
    saveBulkBtn.disabled = false;
  }
});

// --- 15. SMART AUTOCOMPLETE LOGIC ---
let globalProjectsList = [];

// A. Intercept the existing Projects Firebase listener to steal the names
onValue(ref(database, 'projects'), (snapshot) => {
  const data = snapshot.val();
  if (data) {
    // Map out just the project names into our global array
    globalProjectsList = Object.values(data).map(p => p.name);
  } else {
    globalProjectsList = [];
  }
});

// B. The Autocomplete Engine
const setupAutocomplete = (inputId, dropdownId) => {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);

  input.addEventListener('input', (e) => {
    const fullText = e.target.value;
    
    // Split by comma so we only search for the CURRENT word being typed
    const parts = fullText.split(',');
    const currentTerm = parts[parts.length - 1].toLowerCase().trim();
    
    dropdown.innerHTML = ''; // Clear previous suggestions

    if (!currentTerm) {
      dropdown.style.display = 'none';
      return;
    }

    // Filter projects that match what we are currently typing
    const matches = globalProjectsList.filter(p => p.toLowerCase().includes(currentTerm));

    if (matches.length > 0) {
      matches.forEach(match => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        item.innerText = match;
        
        // When clicked, intelligently replace just the active word, keeping prior comma-separated items
        item.addEventListener('click', () => {
          parts[parts.length - 1] = ' ' + match; // Replace the last part with the match
          input.value = parts.join(',').trim(); // Stitch it back together
          dropdown.style.display = 'none';
        });
        
        dropdown.appendChild(item);
      });
      dropdown.style.display = 'flex';
    } else {
      dropdown.style.display = 'none';
    }
  });

  // Hide the dropdown if you click anywhere else on the screen
  document.addEventListener('click', (e) => {
    if (e.target !== input && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
};

// C. Activate the Autocomplete on all 3 inputs
setupAutocomplete('iconProjects', 'addIconProjectList');
setupAutocomplete('editProjects', 'editIconProjectList');
setupAutocomplete('quickAddProjectInput', 'quickAddProjectList');
setupAutocomplete('bulkProjects', 'bulkProjectList');

// --- 17. FONTS CATEGORY SELECTOR LOGIC ---
const fontsCategoryTrigger = document.getElementById('fontsCategoryTrigger');
const fontsCategoryDropdown = document.getElementById('fontsCategoryDropdown');

// Toggle dropdown visibility
fontsCategoryTrigger.addEventListener('click', (e) => {
  e.stopPropagation();
  fontsCategoryDropdown.style.display = fontsCategoryDropdown.style.display === 'flex' ? 'none' : 'flex';
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!fontsCategoryTrigger.contains(e.target) && !fontsCategoryDropdown.contains(e.target)) {
    fontsCategoryDropdown.style.display = 'none';
  }
});

// Handle category selection
document.querySelectorAll('.font-cat-item').forEach(item => {
  item.addEventListener('click', (e) => {
    const selectedCategory = e.target.innerText.trim();
    
    // Change the main header
    fontsCategoryTrigger.innerText = selectedCategory;
    
    // Hide the dropdown
    fontsCategoryDropdown.style.display = 'none';
    
    // Trigger the dynamic filtering!
    renderFonts(selectedCategory);
  });
});

// --- 18. DYNAMIC FONTS DATABASE & RENDERING ---
// Your local font database
const fontsDatabase = [
  { name: 'Raleway', category: 'SANS SERIF' },
  { name: 'Open Sans', category: 'SANS SERIF' },
  { name: 'Rubik', category: 'SANS SERIF' },
  { name: 'Chivo', category: 'SANS SERIF' },
  { name: 'PT Sans', category: 'SANS SERIF' },
  { name: 'Lato', category: 'SANS SERIF' },
  { name: 'Montserrat', category: 'SANS SERIF' },
  { name: 'Manrope', category: 'SANS SERIF' },
  { name: 'IBM Plex Sans', category: 'SANS SERIF' },
  { name: 'Karla', category: 'SANS SERIF' },
  { name: 'Archivo Narrow', category: 'SANS SERIF' },
  { name: 'Poppins', category: 'SANS SERIF' },
  { name: 'Roboto', category: 'SANS SERIF' },
  { name: 'Source Sans 3', category: 'SANS SERIF' }, // Updated from Pro for API support
  { name: 'Alegreya Sans', category: 'SANS SERIF' },
  { name: 'Fira Sans', category: 'SANS SERIF' },
  { name: 'Libre Franklin', category: 'SANS SERIF' },
  { name: 'Syne', category: 'SANS SERIF' },
  { name: 'Work Sans', category: 'SANS SERIF' },
  { name: 'Inter', category: 'SANS SERIF' },
  { name: 'DM Sans', category: 'SANS SERIF' },
  { name: 'Proza Libre', category: 'SANS SERIF' },
  { name: 'Smooch Sans', category: 'SANS SERIF' },
  { name: 'Share Tech', category: 'SANS SERIF' },
  { name: 'Sora', category: 'SANS SERIF' },
  { name: 'Space Grotesk', category: 'SANS SERIF' },
  { name: 'Alumni Sans', category: 'SANS SERIF' },
  { name: 'Aclonica', category: 'SANS SERIF' },
  { name: 'Alumni Sans Collegiate One', category: 'SANS SERIF' },
  { name: 'Jost', category: 'SANS SERIF' },
  { name: 'Ojuju', category: 'SANS SERIF' },
  { name: 'Truculenta', category: 'SANS SERIF' },
  { name: 'Shantell Sans', category: 'SANS SERIF' },
  { name: 'Nixie One', category: 'SANS SERIF' },
  { name: 'Flamenco', category: 'SANS SERIF' },
  { name: 'Red Hat Display', category: 'SANS SERIF' },
  // --- SERIF BATCH ---
  { name: 'Eczar', category: 'SERIF' },
  { name: 'Merriweather', category: 'SERIF' },
  { name: 'Neuton', category: 'SERIF' },
  { name: 'Cardo', category: 'SERIF' },
  { name: 'PT Serif', category: 'SERIF' },
  { name: 'Spectral', category: 'SERIF' },
  { name: 'Lora', category: 'SERIF' },
  { name: 'Playfair Display', category: 'SERIF' },
  { name: 'Libre Baskerville', category: 'SERIF' },
  { name: 'BioRhyme', category: 'SERIF' },
  { name: 'Inknut Antiqua', category: 'SERIF' },
  { name: 'Fraunces', category: 'SERIF' },
  { name: 'Source Serif 4', category: 'SERIF' }, 
  { name: 'Alegreya', category: 'SERIF' },
  { name: 'Cormorant', category: 'SERIF' },
  { name: 'Cormorant Garamond', category: 'SERIF' },
  { name: 'Trirong', category: 'SERIF' },
  { name: 'Taviraj', category: 'SERIF' },
  { name: 'Gentium Book Plus', category: 'SERIF' }, 
  { name: 'Almendra', category: 'SERIF' },
  { name: 'Cinzel', category: 'SERIF' },
  { name: 'Josefin Slab', category: 'SERIF' },
  { name: 'Pompiere', category: 'SERIF' },
  { name: 'Cormorant Upright', category: 'SERIF' },
  { name: 'Fjord One', category: 'SERIF' },
  { name: 'Roboto Serif', category: 'SERIF' },
  { name: 'Roboto Slab', category: 'SERIF' },
  { name: 'Tienne', category: 'SERIF' },
  { name: 'Scope One', category: 'SERIF' },
  { name: 'Glegoo', category: 'SERIF' },
  { name: 'Corben', category: 'SERIF' },
  { name: 'Vast Shadow', category: 'SERIF' },
  { name: 'Mate', category: 'SERIF' },
  // --- MONO BATCH ---
  { name: 'Roboto Mono', category: 'MONO' },
  { name: 'JetBrains Mono', category: 'MONO' },
  { name: 'Source Code Pro', category: 'MONO' },
  { name: 'IBM Plex Mono', category: 'MONO' },
  { name: 'Inconsolata', category: 'MONO' },
  { name: 'Cutive Mono', category: 'MONO' },
  { name: 'VT323', category: 'MONO' },
  { name: 'Silkscreen', category: 'MONO' },
  { name: 'Space Mono', category: 'MONO' },
  { name: 'DM Mono', category: 'MONO' },
  { name: 'Geist Mono', category: 'MONO' },
  { name: 'Fira Code', category: 'MONO' },
  { name: 'Courier Prime', category: 'MONO' },
  { name: 'Google Sans Code', category: 'MONO' },
  { name: 'Share Tech Mono', category: 'MONO' },
  { name: 'PT Mono', category: 'MONO' },
  { name: 'Anonymous Pro', category: 'MONO' },
  { name: 'Ubuntu Mono', category: 'MONO' },
  { name: 'Cousine', category: 'MONO' },
  { name: 'Red Hat Mono', category: 'MONO' },
  { name: 'Overpass Mono', category: 'MONO' },
  { name: 'Fragment Mono', category: 'MONO' },
  { name: 'Azeret Mono', category: 'MONO' },
  { name: 'Chivo Mono', category: 'MONO' },
  { name: 'Sometype Mono', category: 'MONO' },
  { name: 'Spline Sans Mono', category: 'MONO' },
  { name: 'Leton', category: 'MONO' },
  { name: 'Syne Mono', category: 'MONO' },
  { name: 'Oxygen Mono', category: 'MONO' },
  { name: 'Reddit Mono', category: 'MONO' },
  { name: 'Kode Mono', category: 'MONO' },
  { name: 'Victor Mono', category: 'MONO' },
  { name: 'Lilex', category: 'MONO' },
  { name: 'Cascadia Code', category: 'MONO' },
  { name: 'Sono', category: 'MONO' },
  { name: 'Atkinson Hyperlegible Mono', category: 'MONO' },
  { name: 'Intel One Mono', category: 'MONO' },
  { name: 'Libertinus Mono', category: 'MONO' },
  // --- SCRIPTS BATCH ---
  { name: 'Courgette', category: 'SCRIPTS' },
  { name: 'Great Vibes', category: 'SCRIPTS' },
  { name: 'Monsieur La Doulaise', category: 'SCRIPTS' },
  { name: 'Rouge Script', category: 'SCRIPTS' },
  { name: 'Sacramento', category: 'SCRIPTS' },
  { name: 'Italianno', category: 'SCRIPTS' },
  { name: 'Norican', category: 'SCRIPTS' },
  { name: 'Imperial Script', category: 'SCRIPTS' },
  { name: 'Style Script', category: 'SCRIPTS' },
  { name: 'Clicker Script', category: 'SCRIPTS' },
  { name: 'Euphoria Script', category: 'SCRIPTS' },
  { name: 'Petit Formal Script', category: 'SCRIPTS' },
  { name: 'Cookie', category: 'SCRIPTS' },
  { name: 'Updock', category: 'SCRIPTS' },
  { name: 'WindSong', category: 'SCRIPTS' },
  { name: 'Meie Script', category: 'SCRIPTS' },
  { name: 'Engagement', category: 'SCRIPTS' },
  { name: 'Ms Madi', category: 'SCRIPTS' },
  { name: 'Parisienne', category: 'SCRIPTS' },
  { name: 'Rochester', category: 'SCRIPTS' },
  { name: 'Meddon', category: 'SCRIPTS' },
  { name: 'Qwigley', category: 'SCRIPTS' },
  { name: 'Caramel', category: 'SCRIPTS' },
  { name: 'Kings', category: 'SCRIPTS' },
  { name: 'Allura', category: 'SCRIPTS' },
  { name: 'Pinyon Script', category: 'SCRIPTS' },
  { name: 'My Soul', category: 'SCRIPTS' },
  { name: 'Herr Von Muellerhoff', category: 'SCRIPTS' },
  { name: 'Niconne', category: 'SCRIPTS' },
  { name: 'MonteCarlo', category: 'SCRIPTS' },
  { name: 'Beau Rivage', category: 'SCRIPTS' },
  { name: 'Carattere', category: 'SCRIPTS' },
  { name: 'Petemoss', category: 'SCRIPTS' },
  { name: 'Arizonia', category: 'SCRIPTS' },
  { name: 'Bilbo', category: 'SCRIPTS' },
  { name: 'Bilbo Swash Caps', category: 'SCRIPTS' },
  { name: 'Meow Script', category: 'SCRIPTS' },
  { name: 'Grand Hotel', category: 'SCRIPTS' },
  { name: 'Montez', category: 'SCRIPTS' },
  { name: 'Felipa', category: 'SCRIPTS' },
  { name: 'Sofia', category: 'SCRIPTS' },
  { name: 'Marck Script', category: 'SCRIPTS' },
  { name: 'Send Flowers', category: 'SCRIPTS' },
  { name: 'Bonheur Royale', category: 'SCRIPTS' },
  // --- SMALL CAPS BATCH ---
  { name: 'Alegreya Sans SC', category: 'SMALL CAPS' },
  { name: 'Alumni Sans SC', category: 'SMALL CAPS' },
  { name: 'Bebas Neue', category: 'SMALL CAPS' },
  { name: 'Amatic SC', category: 'SMALL CAPS' },
  { name: 'Mate SC', category: 'SMALL CAPS' },
  { name: 'Playfair Display SC', category: 'SMALL CAPS' },
  { name: 'Montenegrin Gothic One', category: 'SMALL CAPS' },
  { name: 'Staatliches', category: 'SMALL CAPS' },
  { name: 'Carrois Gothic SC', category: 'SMALL CAPS' },
  { name: 'Aboreto', category: 'SMALL CAPS' },
  { name: 'Cinzel', category: 'SMALL CAPS' },
  { name: 'Cinzel Decorative', category: 'SMALL CAPS' },
  { name: 'Spectral SC', category: 'SMALL CAPS' },
  { name: 'Cormorant SC', category: 'SMALL CAPS' },
  { name: 'Alegreya SC', category: 'SMALL CAPS' },
  { name: 'Baskervville SC', category: 'SMALL CAPS' },
  { name: 'Vollkorn SC', category: 'SMALL CAPS' },
  { name: 'Sedan SC', category: 'SMALL CAPS' },
  { name: 'Holtwood One SC', category: 'SMALL CAPS' },
  { name: 'Overlock SC', category: 'SMALL CAPS' },
  { name: 'Ysabeau SC', category: 'SMALL CAPS' },
  { name: 'Encode Sans SC', category: 'SMALL CAPS' },
  // --- HANDWRITING BATCH ---
  { name: 'Mea Culpa', category: 'HANDWRITING' },
  { name: 'Birthstone', category: 'HANDWRITING' },
  { name: 'Lavishly Yours', category: 'HANDWRITING' },
  { name: 'Tangerine', category: 'HANDWRITING' },
  { name: 'Mrs Saint Delafield', category: 'HANDWRITING' },
  { name: 'Alex Brush', category: 'HANDWRITING' },
  { name: 'Fleur De Leah', category: 'HANDWRITING' },
  { name: 'Architects Daughter', category: 'HANDWRITING' },
  { name: 'Bad Script', category: 'HANDWRITING' },
  { name: 'Caveat', category: 'HANDWRITING' },
  { name: 'Patrick Hand', category: 'HANDWRITING' },
  { name: 'Rock Salt', category: 'HANDWRITING' },
  { name: 'Pangolin', category: 'HANDWRITING' },
  { name: 'Schoolbell', category: 'HANDWRITING' },
  { name: 'Just Another Hand', category: 'HANDWRITING' },
  { name: 'Handlee', category: 'HANDWRITING' },
  { name: 'Sue Ellen Francisco', category: 'HANDWRITING' },
  { name: 'Meddon', category: 'HANDWRITING' },
  { name: 'Sarina', category: 'HANDWRITING' },
  { name: 'Seaweed Script', category: 'HANDWRITING' },
  { name: 'Niconne', category: 'HANDWRITING' },
  { name: 'Walter Turncoat', category: 'HANDWRITING' },
  { name: 'Gloria Hallelujah', category: 'HANDWRITING' },
  { name: 'Edu SA Beginner', category: 'HANDWRITING' },
  { name: 'Edu TAS Beginner', category: 'HANDWRITING' },
  { name: 'Edu Australia VIC WA NT Hand', category: 'HANDWRITING' },
  { name: 'Edu Australia VIC WA NT Hand Guides', category: 'HANDWRITING' },
  { name: 'Edu NSW ACT Foundation', category: 'HANDWRITING' },
  { name: 'Edu QLD Hand', category: 'HANDWRITING' },
  { name: 'Edu QLD Beginner', category: 'HANDWRITING' },
  { name: 'Edu SA Hand', category: 'HANDWRITING' },
  { name: 'Edu NSW ACT Hand Percusive', category: 'HANDWRITING' },
  { name: 'Indie Flower', category: 'HANDWRITING' },
  { name: 'Amatic SC', category: 'HANDWRITING' },
  { name: 'Yuyu Short', category: 'HANDWRITING' },
  { name: 'Yuyu', category: 'HANDWRITING' },
  { name: 'Nothing You Could Do', category: 'HANDWRITING' },
  { name: 'Reenie Beanie', category: 'HANDWRITING' },
  { name: 'Merienda', category: 'HANDWRITING' },
  { name: 'Mr Dafoe', category: 'HANDWRITING' },
  { name: 'Gochi Hand', category: 'HANDWRITING' },
  { name: 'Ms Madi', category: 'HANDWRITING' },
  { name: 'Shadows Into Light', category: 'HANDWRITING' },
  { name: 'Shadows Into Light Two', category: 'HANDWRITING' },
  { name: 'Oooh Baby', category: 'HANDWRITING' },
  { name: 'Fuzzy Bubbles', category: 'HANDWRITING' },
  { name: 'Grape Nuts', category: 'HANDWRITING' },
  { name: 'Give You Glory', category: 'HANDWRITING' },
  { name: 'Lacquer', category: 'HANDWRITING' },
  { name: 'Mr De Haviland', category: 'HANDWRITING' },
  { name: 'Patrick Hand SC', category: 'HANDWRITING' },
  { name: 'Oregano', category: 'HANDWRITING' },
  { name: 'Loved by the King', category: 'HANDWRITING' },
  { name: 'Just Me Again Down Here', category: 'HANDWRITING' },
  { name: 'Swanky and Moo Moo', category: 'HANDWRITING' },
  { name: 'Mynerve', category: 'HANDWRITING' },
  { name: 'Playwrite Deutschland Grundschrift', category: 'HANDWRITING' },
  { name: 'Autour One', category: 'HANDWRITING' },
  { name: 'Farsan', category: 'HANDWRITING' },
  { name: 'Calligraffitti', category: 'HANDWRITING' },
  // --- BOLD BATCH ---
  { name: 'Archivo Black', category: 'BOLD' },
  { name: 'Alfa Slab One', category: 'BOLD' },
  { name: 'Ultra', category: 'BOLD' },
  { name: 'Gravitas One', category: 'BOLD' },
  { name: 'Diplomata', category: 'BOLD' },
  { name: 'Bevan', category: 'BOLD' },
  { name: 'Goblin One', category: 'BOLD' },
  { name: 'Yeseva One', category: 'BOLD' },
  { name: 'Gloock', category: 'BOLD' },
  { name: 'Bigshot One', category: 'BOLD' },
  { name: 'Oi', category: 'BOLD' },
  { name: 'Fruktur', category: 'BOLD' },
  { name: 'Titan One', category: 'BOLD' },
  { name: 'Tilt Warp', category: 'BOLD' },
  { name: 'Zen Dots', category: 'BOLD' },
  { name: 'Marko One', category: 'BOLD' },
  { name: 'Berkshire Swash', category: 'BOLD' },
  { name: 'Righteous', category: 'BOLD' },
  { name: 'Diplomata SC', category: 'BOLD' },
  { name: 'Rubik Mono One', category: 'BOLD' },
  { name: 'Mogra', category: 'BOLD' },
  { name: 'Lemon', category: 'BOLD' },
  { name: 'Chela One', category: 'BOLD' },
  { name: 'Ranchers', category: 'BOLD' },
  { name: 'Molle', category: 'BOLD' },
  { name: 'Sonsie One', category: 'BOLD' },
  { name: 'Stalinist One', category: 'BOLD' },
  { name: 'Climate Crisis', category: 'BOLD' },
  { name: 'Boldonse', category: 'BOLD' },
  { name: 'Erica One', category: 'BOLD' },
  { name: 'BBH Bartle', category: 'BOLD' },
  // --- THIN BATCH ---
  { name: 'Bungee Hairline', category: 'THIN' },
  { name: 'Aboreto', category: 'THIN' },
  { name: 'Kumar One Outline', category: 'THIN' },
  { name: 'Major Mono Display', category: 'THIN' },
  { name: 'Raleway Dots', category: 'THIN' },
  { name: 'Codystar', category: 'THIN' },
  { name: 'Xanh Mono', category: 'THIN' },
  { name: 'Doto', category: 'THIN' },
  { name: 'Syncopate', category: 'THIN' },
  { name: 'Tulpen One', category: 'THIN' },
  { name: 'Megrim', category: 'THIN' },
  { name: 'Text Me One', category: 'THIN' },
  { name: 'Alumni Sans Pinstripe', category: 'THIN' },
  { name: 'Astloch', category: 'THIN' },
  { name: 'Almendra Display', category: 'THIN' },
  { name: 'Julius Sans One', category: 'THIN' },
  { name: 'League Script', category: 'THIN' },
  { name: 'Petit Formal Script', category: 'THIN' },
  { name: 'Zen Loop', category: 'THIN' },
  { name: 'Fuggles', category: 'THIN' },
  // --- ARTISTIC BATCH ---
  { name: 'Almendra Display', category: 'ARTISTIC' },
  { name: 'Big Shoulders Inline', category: 'ARTISTIC' },
  { name: 'Alumni Sans Inline One', category: 'ARTISTIC' },
  { name: 'Alumni Sans Pinstripe', category: 'ARTISTIC' },
  { name: 'Bitcount Grid Double', category: 'ARTISTIC' },
  { name: 'Arbutus', category: 'ARTISTIC' },
  { name: 'Snowburst One', category: 'ARTISTIC' },
  { name: 'Mountains of Christmas', category: 'ARTISTIC' },
  { name: 'Codystar', category: 'ARTISTIC' },
  { name: 'Monoton', category: 'ARTISTIC' },
  { name: 'Diplomata', category: 'ARTISTIC' },
  { name: 'Train One', category: 'ARTISTIC' },
  { name: 'Savate', category: 'ARTISTIC' },
  { name: 'Bonbon', category: 'ARTISTIC' },
  { name: 'Ewert', category: 'ARTISTIC' },
  { name: 'Coral Pixels', category: 'ARTISTIC' },
  { name: 'Vast Shadow', category: 'ARTISTIC' },
  { name: 'Stardos Stencil', category: 'ARTISTIC' },
  { name: 'Nixie One', category: 'ARTISTIC' },
  { name: 'Kumar One Outline', category: 'ARTISTIC' },
  { name: 'Flamenco', category: 'ARTISTIC' },
  { name: 'Kablammo', category: 'ARTISTIC' },
  { name: 'Astloch', category: 'ARTISTIC' },
  { name: 'Metamorphous', category: 'ARTISTIC' },
  { name: 'Agu Display', category: 'ARTISTIC' },
  { name: 'Berkshire Swash', category: 'ARTISTIC' },
  { name: 'Chelsea Market', category: 'ARTISTIC' },
  { name: 'Uncial Antiqua', category: 'ARTISTIC' },
  { name: 'Zilla Slab Highlight', category: 'ARTISTIC' },
  { name: 'Road Rage', category: 'ARTISTIC' },
  { name: 'Trade Winds', category: 'ARTISTIC' },
  { name: 'Spicy Rice', category: 'ARTISTIC' },
  { name: 'Rubik Doodle Shadow', category: 'ARTISTIC' },
  { name: 'Tapestry', category: 'ARTISTIC' },
  { name: 'Elsie Swash Caps', category: 'ARTISTIC' },
  // --- TRIPPY BATCH ---
  { name: 'Akronim', category: 'TRIPPY' },
  { name: 'Agu Display', category: 'TRIPPY' },
  { name: 'Kablammo', category: 'TRIPPY' },
  { name: 'DynaPuff', category: 'TRIPPY' },
  { name: 'Tilt Prism', category: 'TRIPPY' },
  { name: 'Rubik Moonrocks', category: 'TRIPPY' },
  { name: 'Rubik Gemstones', category: 'TRIPPY' },
  { name: 'Zen Tokyo Zoo', category: 'TRIPPY' },
  { name: 'Coral Pixels', category: 'TRIPPY' },
  { name: 'Danfo', category: 'TRIPPY' },
  { name: 'Silkscreen', category: 'TRIPPY' },
  { name: 'Frijole', category: 'TRIPPY' },
  { name: 'Caesar Dressing', category: 'TRIPPY' },
  { name: 'Sixtyfour', category: 'TRIPPY' },
  { name: 'Hanalei', category: 'TRIPPY' },
  { name: 'Hanalei Fill', category: 'TRIPPY' },
  { name: 'Nosifer', category: 'TRIPPY' },
  { name: 'Warnes', category: 'TRIPPY' },
  { name: 'Train One', category: 'TRIPPY' },
  { name: 'Monofett', category: 'TRIPPY' },
  { name: 'Alien Block', category: 'TRIPPY' },
  { name: 'Asimovian', category: 'TRIPPY' },
  { name: 'Libre Barcode 39 Text', category: 'TRIPPY' },
  { name: 'Libre Barcode 39 Extended Text', category: 'TRIPPY' },
  { name: 'Libre Barcode 128 Text', category: 'TRIPPY' },
  { name: 'Bungee Shade', category: 'TRIPPY' },
  { name: 'Bungee Inline', category: 'TRIPPY' }
];

// --- 19. FONTS FORMATTING & RENDERING LOGIC ---
const fontFormatToggleBtn = document.getElementById('fontFormatToggleBtn');
const formatToolbar = document.getElementById('formatToolbar');
const fontPreviewInput = document.getElementById('fontPreviewInput');

// Formatting State
let fontState = {
  uppercase: false,
  bold: false,
  italic: false,
  alignment: 'left', // Added state
  color: '#4A4036'
};

// Toggle the Toolbar
fontFormatToggleBtn.addEventListener('click', () => {
  fontFormatToggleBtn.classList.toggle('open');
  formatToolbar.classList.toggle('show');
});

// Update styles on all font samples
const applyFontFormatting = () => {
  const textToShow = fontPreviewInput.value || "Type here...";
  
  document.querySelectorAll('.font-sample').forEach(sample => {
    sample.innerText = textToShow;
    sample.style.textTransform = fontState.uppercase ? 'uppercase' : 'none';
    sample.style.fontWeight = fontState.bold ? '700' : '400';
    sample.style.fontStyle = fontState.italic ? 'italic' : 'normal';
    sample.style.color = fontState.color;
    sample.style.textAlign = fontState.alignment; // Added alignment
  });
};

// Listen to typing
fontPreviewInput.addEventListener('input', applyFontFormatting);

// Wire up formatting buttons
document.getElementById('formatCase').addEventListener('click', (e) => {
  fontState.uppercase = !fontState.uppercase;
  e.target.classList.toggle('active');
  applyFontFormatting();
});

document.getElementById('formatBold').addEventListener('click', (e) => {
  fontState.bold = !fontState.bold;
  e.target.classList.toggle('active');
  applyFontFormatting();
});

document.getElementById('formatItalic').addEventListener('click', (e) => {
  fontState.italic = !fontState.italic;
  e.target.classList.toggle('active');
  applyFontFormatting();
});

document.getElementById('formatColor').addEventListener('input', (e) => {
  fontState.color = e.target.value;
  applyFontFormatting();
});

// Updated renderFonts function (with the Home+ button layout)
const renderFonts = (categoryFilter = 'ALL') => {
  fontsListContainer.innerHTML = ''; 
  
  const filteredFonts = categoryFilter === 'ALL' 
    ? fontsDatabase 
    : fontsDatabase.filter(f => f.category === categoryFilter);

  filteredFonts.forEach(font => {
    const item = document.createElement('div');
    item.className = 'font-item';
    item.innerHTML = `
      <div class="font-item-inner">
        <div class="font-details">
          <div class="font-sample" style="font-family: '${font.name}', sans-serif;">Type here...</div>
          <div class="font-name">${font.name}</div>
        </div>
        <button class="font-item-add-btn" data-font="${font.name}" title="Add to Project">
          <i class="fa-solid fa-house"></i><span style="font-size: 0.7rem; margin-bottom: 5px;">+</span>
        </button>
      </div>
    `;
    fontsListContainer.appendChild(item);
  });

  // Re-apply current typed text and formatting to the new elements
  applyFontFormatting();
};

// Initial load
renderFonts('ALL');

// Alignment Cycling Logic
document.getElementById('formatAlign').addEventListener('click', (e) => {
  // Use closest() because FontAwesome replaces <i> with an <svg>, which intercepts clicks
  const btn = e.target.closest('button');
  const icon = btn.querySelector('.fa-solid');
  
  if (fontState.alignment === 'left') {
    fontState.alignment = 'center';
    icon.className = 'fa-solid fa-align-center';
  } else if (fontState.alignment === 'center') {
    fontState.alignment = 'right';
    icon.className = 'fa-solid fa-align-right';
  } else {
    fontState.alignment = 'left';
    icon.className = 'fa-solid fa-align-left';
  }
  
  applyFontFormatting();
});


// --- 20. PROJECT MODAL OPTIONS (CREDITS & DELETE) ---
const projectOptionsBtn = document.getElementById('projectOptionsBtn');
const projectOptionsDropdown = document.getElementById('projectOptionsDropdown');
const copyCreditsBtn = document.getElementById('copyCreditsBtn');
const deleteProjectBtn = document.getElementById('deleteProjectBtn');

let activeProjectDbId = null;
let activeProjectName = '';
let activeIconsForCredits = [];
let activeFontsForCredits = [];

// Mini-database of font creators
const fontCreatorsMap = {
  // SANS SERIF
  'Roboto': 'Christian Robertson', 'Inter': 'Rasmus Andersson', 'Montserrat': 'Julieta Ulanovsky',
  'Lato': 'Łukasz Dziedzic', 'Open Sans': 'Steve Matteson', 'Raleway': 'Matt McInerney',
  'Rubik': 'Hubert and Fischer', 'Poppins': 'Indian Type Foundry, Jonny Pinhorn', 
  'Work Sans': 'Wei Huang', 'Space Grotesk': 'Florian Karsten',
  // SERIF
  'Merriweather': 'Sorkin Type', 'PT Serif': 'ParaType', 'Lora': 'Cyreal', 
  'Playfair Display': 'Claus Eggers Sørensen', 'Libre Baskerville': 'Impallari Type', 
  'Fraunces': 'Undercase Type', 'Source Serif 4': 'Frank Grießhammer', 
  'Alegreya': 'Juan Pablo del Peral', 'Cormorant': 'Christian Thalmann', 
  'Cormorant Garamond': 'Christian Thalmann', 'Cinzel': 'Natanael Gama', 
  'Roboto Serif': 'Greg Gazdowicz', 'Roboto Slab': 'Christian Robertson',
  // MONO
  'Roboto Mono': 'Christian Robertson', 'JetBrains Mono': 'JetBrains', 
  'Source Code Pro': 'Paul D. Hunt', 'IBM Plex Mono': 'Bold Monday', 
  'Inconsolata': 'Raph Levien', 'Fira Code': 'Nikita Prokopov', 
  'Space Mono': 'Colophon Foundry', 'Ubuntu Mono': 'Dalton Maag',
  'Cascadia Code': 'Microsoft',
  // SCRIPTS
  'Great Vibes': 'TypeSETit', 'Courgette': 'Karolina Lach', 'Sacramento': 'Astigmatic',
  'Parisienne': 'Astigmatic', 'Cookie': 'Ania Kruk', 'Grand Hotel': 'Astigmatic',
  'Allura': 'TypeSETit', 'Imperial Script': 'Robert Leuschke', 'Ms Madi': 'Robert Leuschke',
  // SMALL CAPS
  'Bebas Neue': 'Ryoichi Tsunekawa', 'Amatic SC': 'Vernon Adams', 
  'Staatliches': 'Brian LaRossa, Erica Jung', 'Cinzel Decorative': 'Natanael Gama',
  'Vollkorn SC': 'Friedrich Althausen', 'Aboreto': 'Doménico Barreto',
  // HANDWRITING
  'Caveat': 'Impallari Type', 'Indie Flower': 'Kimberly Geswein', 
  'Shadows Into Light': 'Kimberly Geswein', 'Architects Daughter': 'Kimberly Geswein', 
  'Amatic SC': 'Vernon Adams', 'Patrick Hand': 'Patrick Wagesreiter',
  'Gloria Hallelujah': 'Kimberly Geswein', 'Rock Salt': 'Squid', 
  'Permanent Marker': 'Font Diner', 'Nothing You Could Do': 'Kimberly Geswein',
  // BOLD
  'Archivo Black': 'Omnibus-Type', 'Alfa Slab One': 'JM Solé', 
  'Righteous': 'Astigmatic', 'Yeseva One': 'Jovanny Lemonad', 
  'Titan One': 'Rodrigo Fuenzalida', 'Tilt Warp': 'Andy Clymer',
  'Rubik Mono One': 'Hubert and Fischer', 'Bevan': 'Vernon Adams',
  // THIN
  'Bungee Hairline': 'David Jonathan Ross', 'Major Mono Display': 'Emre Parlak',
  'Syncopate': 'Astigmatic', 'Megrim': 'Daniel Johnson',
  'Julius Sans One': 'LatinoType', 'Raleway Dots': 'Matt McInerney',
  'Aboreto': 'Doménico Barreto',
  // ARTISTIC
  'Monoton': 'Vernon Adams', 'Mountains of Christmas': 'Tart Workshop',
  'Zilla Slab Highlight': 'Typotheque', 'Kablammo': 'Vectro Type Foundry',
  'Trade Winds': 'Sideshow', 'Rubik Doodle Shadow': 'Hubert and Fischer',
  'Ewert': 'Johan Kallas', 'Stardos Stencil': 'Vernon Adams',
  // TRIPPY
  'Rubik Moonrocks': 'Hubert and Fischer', 'Rubik Gemstones': 'Hubert and Fischer',
  'Sixtyfour': 'Jérémy Landes', 'Bungee Shade': 'David Jonathan Ross',
  'Bungee Inline': 'David Jonathan Ross', 'Libre Barcode 128 Text': 'Lasse Fister',
  'Nosifer': 'Typomondo', 'Frijole': 'Sideshow', 'Silkscreen': 'Jason Kottke'
};

// Toggle the dropdown
projectOptionsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  projectOptionsDropdown.classList.toggle('show');
});

// Close dropdown if clicking outside
document.addEventListener('click', (e) => {
  if (!projectOptionsBtn.contains(e.target) && !projectOptionsDropdown.contains(e.target)) {
    projectOptionsDropdown.classList.remove('show');
  }
});

// Capture active project details when a project is clicked
dynamicProjectsList.addEventListener('click', (e) => {
  const clickedProject = e.target.closest('.project-item-large');
  if (clickedProject) {
    activeProjectDbId = clickedProject.dataset.id; // From Patch 2 of the database logic
    activeProjectName = clickedProject.innerText.trim();
    
    // Clear previous credits data
    activeIconsForCredits = [];
    activeFontsForCredits = [];
    
    // Listen to Firebase and populate arrays for the copy function
    onValue(ref(database, 'icons'), (snapshot) => {
      const iconsData = snapshot.val();
      if (iconsData) {
        Object.values(iconsData).forEach(icon => {
          if ((icon.projects || '').toLowerCase().includes(activeProjectName.toLowerCase())) {
            activeIconsForCredits.push(icon);
          }
        });
      }
    }, { onlyOnce: true });

    onValue(ref(database, 'project_fonts'), (snapshot) => {
      const fontsData = snapshot.val();
      const uniqueFonts = new Set();
      if (fontsData) {
        Object.values(fontsData).forEach(entry => {
          if (entry.project.toLowerCase() === activeProjectName.toLowerCase() && !uniqueFonts.has(entry.font)) {
            uniqueFonts.add(entry.font);
            activeFontsForCredits.push(entry.font);
          }
        });
      }
    }, { onlyOnce: true });
  }
});

// Copy Credits Logic (No longer closes the modal!)
copyCreditsBtn.addEventListener('click', (e) => {
  e.stopPropagation();

  let creditText = `CREDITS: ${activeProjectName.toUpperCase()}\n\nFONTS:\n`;
  if (activeFontsForCredits.length === 0) creditText += `None linked.\n`;
  activeFontsForCredits.forEach(font => {
    const creator = fontCreatorsMap[font] || 'Google Fonts';
    creditText += `- ${font} by ${creator}\n`;
  });

  creditText += `\nICONS:\n`;
  if (activeIconsForCredits.length === 0) creditText += `None linked.\n`;
  activeIconsForCredits.forEach(icon => {
    const creator = icon.creator || 'Custom';
    const link = icon.link ? ` (${icon.link})` : '';
    creditText += `- ${icon.title} by ${creator}${link}\n`;
  });

  navigator.clipboard.writeText(creditText).then(() => {
    const originalText = copyCreditsBtn.innerText;
    copyCreditsBtn.innerText = 'COPIED!';
    copyCreditsBtn.style.color = '#8A9A5B'; // Success color
    copyCreditsBtn.style.fontWeight = '600';
    
    setTimeout(() => {
      copyCreditsBtn.innerText = originalText;
      copyCreditsBtn.style.color = ''; 
      copyCreditsBtn.style.fontWeight = '';
      projectOptionsDropdown.classList.remove('show'); // Hide dropdown after visual feedback
    }, 1500);
  });
});

// Delete Project Logic (Opens custom modal instead of browser popup)
const deleteProjectConfirmModal = document.getElementById('deleteProjectConfirmModal');
const confirmDeleteProjectBtn = document.getElementById('confirmDeleteProjectBtn');

deleteProjectBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  projectOptionsDropdown.classList.remove('show');
  deleteProjectConfirmModal.style.display = 'flex'; // Open custom modal
});

// Final Confirmation to Delete
confirmDeleteProjectBtn.addEventListener('click', async () => {
  try {
    await remove(ref(database, `projects/${activeProjectDbId}`));
    closeAllModals(); // Closes the project detail modal AND the confirm modal
  } catch (error) {
    console.error("Error deleting project:", error);
  }
});

// --- ICON DELETE LOGIC ---
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

confirmDeleteBtn.addEventListener('click', async () => {
  // Failsafe: Ensure an icon is actually selected
  if (!currentActiveIconId) return; 

  try {
    // 1. Remove the specific icon from the 'icons' node in Firebase
    await remove(ref(database, `icons/${currentActiveIconId}`));
    
    // 2. Close the modal
    closeAllModals(); 
    
    // Note: You don't need to manually remove the icon from the screen! 
    // Your existing onValue('icons') listener will detect the database change 
    // and automatically refresh the grid for you.
  } catch (error) {
    console.error("Error deleting icon:", error);
  }
});