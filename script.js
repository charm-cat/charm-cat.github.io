let allApps = [];
let isSortAscending = true; 
let isAllExpanded = false;

// --- Theme Toggle Logic ---
function setupThemeToggle() {
    const themeToggleBtn = document.getElementById('theme-toggle');
    const body = document.body;

    const savedTheme = localStorage.getItem('charm-theme');
    
    if (savedTheme === 'light') {
        body.classList.add('light-mode');
        themeToggleBtn.textContent = '🌙';
    }

    themeToggleBtn.addEventListener('click', () => {
        body.classList.toggle('light-mode');
        
        if (body.classList.contains('light-mode')) {
            themeToggleBtn.textContent = '🌙';
            localStorage.setItem('charm-theme', 'light');
        } else {
            themeToggleBtn.textContent = '☀️';
            localStorage.setItem('charm-theme', 'dark');
        }
    });
}

// --- Initialization ---
async function init() {
    try {
        setupThemeToggle(); 
        
        const response = await fetch('data.json');
        allApps = await response.json();
        
        setupSearchAndSort(); 
        updateDisplay();      
        
    } catch (error) {
        console.error('Error loading app data:', error);
        document.getElementById('app-list').innerHTML = '<p style="text-align:center;">Sorry, failed to load apps.</p>';
    }
}

// --- Search, Sort, and Smart Toggle All Logic ---
let currentSort = { type: 'name', isAsc: true };

function setupSearchAndSort() {
    const searchInput = document.getElementById('search-input');
    const sortDropdownBtn = document.getElementById('sort-dropdown-btn');
    const sortDropdownContent = document.getElementById('sort-dropdown-content');
    const sortNameBtn = document.getElementById('sort-name-btn');
    const sortPatchBtn = document.getElementById('sort-patch-btn');
    const toggleAllBtn = document.getElementById('toggle-all-btn');

    sortDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation(); 
        sortDropdownContent.classList.toggle('show');
    });

    window.addEventListener('click', () => {
        if (sortDropdownContent.classList.contains('show')) {
            sortDropdownContent.classList.remove('show');
        }
    });

    sortNameBtn.addEventListener('click', () => {
        currentSort.type = 'name';
        
        currentSort.isAsc = sortNameBtn.textContent === 'A-Z';

        sortNameBtn.textContent = currentSort.isAsc ? 'Z-A' : 'A-Z';
        sortDropdownBtn.textContent = `Sort: ${currentSort.isAsc ? 'A-Z' : 'Z-A'} ▼`;

        sortPatchBtn.textContent = 'Patches Increasing';
        
        updateDisplay();
    });

    sortPatchBtn.addEventListener('click', () => {
        currentSort.type = 'patch';
        
        currentSort.isAsc = sortPatchBtn.textContent === 'Patches Increasing';

        sortPatchBtn.textContent = currentSort.isAsc ? 'Patches Decreasing' : 'Patches Increasing';
        sortDropdownBtn.textContent = `Sort: ${currentSort.isAsc ? 'Patches Increasing' : 'Patches Decreasing'} ▼`;

        sortNameBtn.textContent = 'A-Z';
        
        updateDisplay();
    });

    searchInput.addEventListener('input', () => updateDisplay());

    toggleAllBtn.addEventListener('click', () => {
        const isExpanding = toggleAllBtn.textContent === 'Expand All';
        document.querySelectorAll('.version-list').forEach(list => isExpanding ? list.classList.add('show') : list.classList.remove('show'));
        document.querySelectorAll('.expand-btn').forEach(btn => isExpanding ? btn.classList.add('open') : btn.classList.remove('open'));
        toggleAllBtn.textContent = isExpanding ? 'Collapse All' : 'Expand All';
        isAllExpanded = isExpanding;
    });
}

function updateDisplay() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();

    let filteredApps = allApps.filter(app => {
        const nameMatch = app.name.toLowerCase().includes(searchTerm);
        const packageMatch = app.packageName && app.packageName.toLowerCase().includes(searchTerm);
        const versionMatch = app.versions.some(ver => ver.version.toLowerCase().includes(searchTerm));
        return nameMatch || packageMatch || versionMatch;
    });

    filteredApps.sort((a, b) => {
        if (currentSort.type === 'name') {
            const nameA = a.name.toLowerCase();
            const nameB = b.name.toLowerCase();
            if (nameA < nameB) return currentSort.isAsc ? -1 : 1;
            if (nameA > nameB) return currentSort.isAsc ? 1 : -1;
            return 0;
        } else {
            const patchA = a.patchCount || 0;
            const patchB = b.patchCount || 0;
            return currentSort.isAsc ? (patchA - patchB) : (patchB - patchA);
        }
    });

    renderApps(filteredApps);
}

// --- Render Logic ---
function renderApps(appsToDisplay) {
    const appListContainer = document.getElementById('app-list');
    const toggleAllBtn = document.getElementById('toggle-all-btn');
    appListContainer.innerHTML = '';

    if (appsToDisplay.length === 0) {
        appListContainer.innerHTML = '<p style="text-align:center;">No apps or patches found.</p>';
        return;
    }

    appsToDisplay.forEach(app => {
        const card = document.createElement('div');
        card.className = 'app-card';

        let versionsHTML = '';
        app.versions.forEach(ver => {
            let buttonsHTML = '';
            
            if (ver.links && ver.links.length > 0) {
                if (ver.links.length === 1) {
                    buttonsHTML = `<a href="${ver.links[0]}" class="download-btn" target="_blank">Download</a>`;
                } else {
                    ver.links.forEach((linkUrl, index) => {
                        buttonsHTML += `<a href="${linkUrl}" class="download-btn" target="_blank">Mirror ${index + 1}</a>`;
                    });
                }
            }

            const sha256HTML = ver.sha256 ? `<span class="version-hash">SHA-256: <code>${ver.sha256}</code></span>` : '';

            versionsHTML += `
                <div class="version-item">
                    <div class="version-details">
                        <span class="version-number">Version: <strong>${ver.version}</strong></span>
                        ${sha256HTML}
                    </div>
                    <div class="button-group">
                        ${buttonsHTML}
                    </div>
                </div>
            `;
        });

        const expandClass = isAllExpanded ? 'open' : '';
        const showClass = isAllExpanded ? 'show' : '';

        const pCount = app.patchCount || 0;
        const patchText = pCount === 1 ? '(1 patch available)' : `(${pCount} patches available)`;

        // --- NEW LOGIC: Check for a warning message ---
        const warningHTML = app.warning ? `
            <div class="app-warning">
                <strong>⚠️ Important:<br><br></strong> ${app.warning}
            </div>
        ` : '';

        card.innerHTML = `
            <div class="app-header" onclick="toggleVersions(this)">
                <div class="app-header-left">
                    <img src="${app.icon}" alt="${app.name} icon" class="app-icon">
                    <div class="app-title">
                        <h2>${app.name} <span class="version-count">${patchText}</span></h2>
                        <div class="package-name">${app.packageName || 'Unknown Package'}</div>
                    </div>
                </div>
                <button class="expand-btn ${expandClass}">▼</button>
            </div>
            <div class="version-list ${showClass}">
                ${warningHTML}
                ${versionsHTML}
            </div>
        `;

        appListContainer.appendChild(card);
    });

    const anyOpen = document.querySelectorAll('.version-list.show').length > 0;
    toggleAllBtn.textContent = anyOpen ? 'Collapse All' : 'Expand All';
}

// --- Toggle Individual App Card ---
function toggleVersions(headerElement) {
    const versionList = headerElement.nextElementSibling;
    const expandBtn = headerElement.querySelector('.expand-btn');
    const toggleAllBtn = document.getElementById('toggle-all-btn');
    
    versionList.classList.toggle('show');
    expandBtn.classList.toggle('open');

    const anyOpen = document.querySelectorAll('.version-list.show').length > 0;
    
    if (anyOpen) {
        toggleAllBtn.textContent = 'Collapse All';
        isAllExpanded = true;
    } else {
        toggleAllBtn.textContent = 'Expand All';
        isAllExpanded = false;
    }
}

init();