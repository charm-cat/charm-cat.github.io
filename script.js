let allApps = [];
let currentSort = { type: 'name', isAsc: true };
let isAllExpanded = false;

// --- Initialization ---
async function init() {
    setupThemeToggle(); 
    
    try {
        const response = await fetch('data.json');
        allApps = await response.json();
        
        setupSearchAndSort(); 
        updateDisplay();      
        
    } catch (error) {
        console.error('Error loading app data:', error);
        document.getElementById('app-list').innerHTML = '<p style="text-align:center; color: #FF5252;">Error: Failed to load data.json. Ensure you are running a local server.</p>';
    }
}

// --- Theme Toggle ---
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

// --- Search & Dropdown Sorting ---
function setupSearchAndSort() {
    const searchInput = document.getElementById('search-input');
    const sortDropdownBtn = document.getElementById('sort-dropdown-btn');
    const sortDropdownContent = document.getElementById('sort-dropdown-content');
    const sortNameBtn = document.getElementById('sort-name-btn');
    const sortPatchBtn = document.getElementById('sort-patch-btn');
    const toggleAllBtn = document.getElementById('toggle-all-btn');

    // Dropdown Toggle
    sortDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation(); 
        sortDropdownContent.classList.toggle('show');
    });

    window.addEventListener('click', () => {
        if (sortDropdownContent.classList.contains('show')) {
            sortDropdownContent.classList.remove('show');
        }
    });

    // A-Z Sort Logic
    sortNameBtn.addEventListener('click', () => {
        currentSort.type = 'name';
        currentSort.isAsc = sortNameBtn.textContent === 'A-Z';

        sortNameBtn.textContent = currentSort.isAsc ? 'Z-A' : 'A-Z';
        sortDropdownBtn.textContent = `Sort: ${currentSort.isAsc ? 'A-Z' : 'Z-A'} ▼`;
        sortPatchBtn.textContent = 'Patches Increasing';
        
        updateDisplay();
    });

    // Patches Sort Logic
    sortPatchBtn.addEventListener('click', () => {
        currentSort.type = 'patch';
        currentSort.isAsc = sortPatchBtn.textContent === 'Patches Increasing';

        sortPatchBtn.textContent = currentSort.isAsc ? 'Patches Decreasing' : 'Patches Increasing';
        sortDropdownBtn.textContent = `Sort: ${currentSort.isAsc ? 'Patches Increasing' : 'Patches Decreasing'} ▼`;
        sortNameBtn.textContent = 'Z-A'; // Reset default
        
        updateDisplay();
    });

    // Search and Expand All
    searchInput.addEventListener('input', () => updateDisplay());

    toggleAllBtn.addEventListener('click', () => {
        const isExpanding = toggleAllBtn.textContent === 'Expand All';
        document.querySelectorAll('.version-list').forEach(list => isExpanding ? list.classList.add('show') : list.classList.remove('show'));
        document.querySelectorAll('.expand-btn').forEach(btn => isExpanding ? btn.classList.add('open') : btn.classList.remove('open'));
        toggleAllBtn.textContent = isExpanding ? 'Collapse All' : 'Expand All';
        isAllExpanded = isExpanding;
    });
}

// --- Filtering & Sorting ---
function updateDisplay() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();

    let filteredApps = allApps.filter(app => {
        const nameMatch = app.name.toLowerCase().includes(searchTerm);
        const packageMatch = app.packageName && app.packageName.toLowerCase().includes(searchTerm);
        
        const secPackageMatch = app.secondaryPackageName && app.secondaryPackageName.toLowerCase().includes(searchTerm);
        
        const versionMatch = app.versions.some(ver => ver.version.toLowerCase().includes(searchTerm));
        
        return nameMatch || packageMatch || secPackageMatch || versionMatch;
    });

    filteredApps.sort((a, b) => {
        if (currentSort.type === 'name') {
            const nameA = a.name.toLowerCase();
            const nameB = b.name.toLowerCase();
            if (nameA < nameB) return currentSort.isAsc ? -1 : 1;
            if (nameA > nameB) return currentSort.isAsc ? 1 : -1;
            return 0;
        } else {
            const patchA = Number(a.patchCount) || 0;
            const patchB = Number(b.patchCount) || 0;
            return currentSort.isAsc ? (patchA - patchB) : (patchB - patchA);
        }
    });

    renderApps(filteredApps);
}

// --- Render Layout ---
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

        const pCount = Number(app.patchCount) || 0;
        let patchText;
        
        if (pCount === 0) {
            patchText = '<span style="color: #FF5252;">Error loading patches!</span>'; 
        } else if (pCount === 1) {
            patchText = '(1 patch available)';
        } else {
            patchText = `(${pCount} patches available)`;
        }

        const warningHTML = app.warning ? `
            <div class="app-warning">
                <strong>⚠️ Notice:</strong> ${app.warning}
            </div>
        ` : '';

        let packageHTML = `<div class="package-name">${app.packageName || 'Unknown Package'}</div>`;
        if (app.secondaryPackageName) {
            packageHTML += `<div class="package-name">${app.secondaryPackageName}</div>`;
        }

        card.innerHTML = `
            <div class="app-header" onclick="toggleVersions(this)">
                <div class="app-header-left">
                    <img src="${app.icon}" alt="${app.name} icon" class="app-icon" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2264%22 height=%2264%22><rect width=%2264%22 height=%2264%22 fill=%22%23263340%22/><text x=%2232%22 y=%2236%22 font-family=%22sans-serif%22 font-size=%2224%22 fill=%22%23C4C7C5%22 text-anchor=%22middle%22>?</text></svg>'">
                    <div class="app-title">
                        <h2>${app.name} <span class="version-count">${patchText}</span></h2>
                        ${packageHTML}
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

function toggleVersions(headerElement) {
    const versionList = headerElement.nextElementSibling;
    const expandBtn = headerElement.querySelector('.expand-btn');
    const toggleAllBtn = document.getElementById('toggle-all-btn');
    
    versionList.classList.toggle('show');
    expandBtn.classList.toggle('open');

    const anyOpen = document.querySelectorAll('.version-list.show').length > 0;
    toggleAllBtn.textContent = anyOpen ? 'Collapse All' : 'Expand All';
    isAllExpanded = anyOpen;
}

// Start the app
init();