let allApps = [];
let currentSort = { type: 'name', isAsc: true };
let isAllExpanded = false;
let expandedApps = new Set(); 

async function init() {
    setupThemeToggle(); 
    
    try {
        const response = await fetch('data.json');
        allApps = await response.json();
        
        try {
            const patchesResponse = await fetch('patches.json');
            if (patchesResponse.ok) {
                const patchesData = await patchesResponse.json();
                allApps.forEach(app => {
                    if (patchesData[app.id]) {
                        app.patches = patchesData[app.id];
                        app.patchCount = app.patches.length;
                    }
                });
            }
        } catch (e) {
        }

        setupSearchAndSort(); 
        updateDisplay();      
        
        setTimeout(() => {
            handleUrlHash();
        }, 100);

    } catch (error) {
        document.getElementById('app-list').innerHTML = '<p style="text-align:center; color: #FF5252;">Error: Failed to load data.json. Ensure you are running a local server.</p>';
    }
}

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

function setupSearchAndSort() {
    const searchInput = document.getElementById('search-input');
    const sortDropdownBtn = document.getElementById('sort-dropdown-btn');
    const sortDropdownContent = document.getElementById('sort-dropdown-content');
    const sortNameBtn = document.getElementById('sort-name-btn');
    const sortPatchBtn = document.getElementById('sort-patch-btn');
    const toggleAllBtn = document.getElementById('toggle-all-btn');
    const clearSearchBtn = document.getElementById('clear-search-btn');

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
        sortNameBtn.textContent = 'Z-A';
        
        updateDisplay();
    });

    searchInput.addEventListener('input', () => {
        if (clearSearchBtn) {
            if (searchInput.value.length > 0) {
                clearSearchBtn.classList.add('show');
            } else {
                clearSearchBtn.classList.remove('show');
            }
        }
        updateDisplay();
    });

    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
            searchInput.value = '';
            clearSearchBtn.classList.remove('show');
            updateDisplay();
            searchInput.focus();
        });

        if (searchInput.value.length > 0) {
            clearSearchBtn.classList.add('show');
        }
    }

    toggleAllBtn.addEventListener('click', () => {
        const isExpanding = toggleAllBtn.textContent === 'Expand All';
        isAllExpanded = isExpanding;

        if (isExpanding) {
            allApps.forEach(app => expandedApps.add(app.id));
        } else {
            expandedApps.clear();
        }

        document.querySelectorAll('#app-list .version-list').forEach(list => isExpanding ? list.classList.add('show') : list.classList.remove('show'));
        document.querySelectorAll('#app-list .expand-btn').forEach(btn => isExpanding ? btn.classList.add('open') : btn.classList.remove('open'));
        toggleAllBtn.textContent = isExpanding ? 'Collapse All' : 'Expand All';
    });
}

function updateDisplay() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();

    let filteredApps = allApps.filter(app => {
        const nameMatch = app.name.toLowerCase().includes(searchTerm);
        const packageMatch = app.packageName && app.packageName.toLowerCase().includes(searchTerm);
        const secPackageMatch = app.secondaryPackageName && app.secondaryPackageName.toLowerCase().includes(searchTerm);
        const versionMatch = app.versions && app.versions.some(ver => ver.version.toLowerCase().includes(searchTerm));
        
        const patchMatch = app.patches && app.patches.some(patch => {
            const pName = typeof patch === 'string' ? patch : patch.name;
            const pDesc = typeof patch === 'object' && patch.description ? patch.description : '';
            const pSupp = typeof patch === 'object' && patch.supported ? patch.supported : '';
            const pDef = typeof patch === 'object' && patch.default ? 'picked by default' : '';
            const pConf = typeof patch === 'object' && patch.configurable ? 'configurable' : '';
            
            return pName.toLowerCase().includes(searchTerm) || 
                   pDesc.toLowerCase().includes(searchTerm) || 
                   pSupp.toLowerCase().includes(searchTerm) ||
                   pDef.includes(searchTerm) ||
                   pConf.includes(searchTerm);
        });
        
        return nameMatch || packageMatch || secPackageMatch || versionMatch || patchMatch;
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

function renderApps(appsToDisplay) {
    const appListContainer = document.getElementById('app-list');
    const toggleAllBtn = document.getElementById('toggle-all-btn');
    appListContainer.innerHTML = '';

    const isPatchesPage = window.location.pathname.includes('patches');

    if (appsToDisplay.length === 0) {
        appListContainer.innerHTML = '<p style="text-align:center;">No apps or patches found.</p>';
        return;
    }

    appsToDisplay.forEach(app => {
        const card = document.createElement('div');
        card.className = 'app-card';
        card.id = `app-${app.id}`;

        let contentHTML = '';
        let subtitleHTML = '';

        if (!isPatchesPage) {
            if (app.versions && app.versions.length > 0) {
                app.versions.forEach(ver => {
                    let buttonsHTML = '';
                    if (ver.links && ver.links.length > 0) {
                        ver.links.forEach((linkItem, index) => {
                            let linkUrl = typeof linkItem === 'string' ? linkItem : linkItem.url;
                            let linkText = typeof linkItem === 'object' && linkItem.name ? linkItem.name : (ver.links.length === 1 ? 'Download' : `Mirror ${index + 1}`);
                            buttonsHTML += `<a href="${linkUrl}" class="download-btn" target="_blank">${linkText}</a>`;
                        });
                    }
                    
                    const sizeHTML = ver.size ? `<span class="version-size"><strong>Size:</strong> ${ver.size}</span>` : '';
                    const sha1HTML = ver.sha1 ? `<span class="version-hash"><strong>SHA-1:</strong> <code>${ver.sha1}</code></span>` : '';
                    
                    const sha256HTML = ver.sha256 ? `<span class="version-hash"><strong>SHA-256:</strong> <code>${ver.sha256}</code></span>` : '';
                    
                    const warningHTML = ver.warning ? `<div class="version-warning"><strong>⚠️ Warning:</strong><br><br>${ver.warning}</div>` : '';
                    const noteHTML = ver.note ? `<div class="version-note"><strong>ℹ️ Note:</strong><br><br>${ver.note}</div>` : '';
                    
                    contentHTML += `
                        <div class="version-item">
                            ${warningHTML}
                            ${noteHTML}
                            <div class="version-details">
                                <span class="version-number"><strong>Version:</strong> ${ver.version}</span>
                                ${sizeHTML}
                                ${sha1HTML}
                                ${sha256HTML}
                            </div>
                            <div class="button-group">
                                ${buttonsHTML}
                            </div>
                        </div>
                    `;
                });
            }

            const pCount = Number(app.patchCount) || 0;
            let patchText;
            if (pCount === 0) patchText = '<span style="color: #FF5252;">Error loading patches!</span>'; 
            else if (pCount === 1) patchText = '(1 patch available)';
            else patchText = `(${pCount} patches available)`;

            subtitleHTML = `<a href="patches.html#${app.id}" class="version-count-link" onclick="event.stopPropagation()">${patchText}</a>`;
            
        } else {
            if (app.patches && app.patches.length > 0) {
                app.patches.forEach(patch => {
                    const patchName = typeof patch === 'string' ? patch : patch.name;
                    const patchDesc = (typeof patch === 'object' && patch.description) ? `<div class="patch-desc">${patch.description}</div>` : '';
                    const patchSupported = (typeof patch === 'object' && patch.supported) ? `<div class="patch-supported"><strong>Supported on:</strong> ${patch.supported}</div>` : '';
                    
                    let tagsHTML = '';
                    if (typeof patch === 'object') {
                        if (patch.default) tagsHTML += ' <span class="patch-tag default-tag">(Picked by default)</span>';
                        if (patch.configurable) tagsHTML += ' <span class="patch-tag config-tag">(Configurable)</span>';
                    }

                    contentHTML += `
                        <div class="version-item">
                            <div class="version-details" style="max-width: 100%;">
                                <span class="version-number"><strong>${patchName}</strong>${tagsHTML}</span>
                                ${patchDesc}
                                ${patchSupported}
                            </div>
                        </div>
                    `;
                });
            } else {
                contentHTML = `
                    <div class="version-item">
                        <div class="version-details">
                            <span class="version-number"><em>No specific patches listed in database.</em></span>
                        </div>
                    </div>
                `;
            }

            let versionText;
            if (app.versions && app.versions.length > 0) {
                versionText = `(Version ${app.versions[0].version} available)`;
            } else {
                versionText = '<span style="color: #FF5252;">No versions available!</span>';
            }

            subtitleHTML = `<a href="index.html#${app.id}" class="version-count-link" onclick="event.stopPropagation()">${versionText}</a>`;
        }

        const isExpanded = isAllExpanded || expandedApps.has(app.id);
        const expandClass = isExpanded ? 'open' : '';
        const showClass = isExpanded ? 'show' : '';

        const importantHTML = app.important ? `
            <div class="app-important">
                <strong>‼️ Important:</strong><br><br>${app.important}
            </div>
        ` : '';

        const appWarningHTML = app.warning ? `
            <div class="app-warning">
                <strong>⚠️ Warning:<br><br></strong><br><br>${app.warning}
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
                        <h2>${app.name} ${subtitleHTML}</h2>
                        ${packageHTML}
                    </div>
                </div>
                <div class="app-header-right">
                    <button class="share-btn" onclick="copyAppLink(event, '${app.id}')" title="Copy Link" aria-label="Copy Link">🔗</button>
                    <button class="expand-btn ${expandClass}">▼</button>
                </div>
            </div>
            <div class="version-list ${showClass}">
                ${importantHTML}
                ${appWarningHTML} ${contentHTML}
            </div>
        `;

        appListContainer.appendChild(card);
    });

    const anyOpen = document.querySelectorAll('#app-list .version-list.show').length > 0;
    toggleAllBtn.textContent = anyOpen ? 'Collapse All' : 'Expand All';
}

function toggleVersions(headerElement) {
    const versionList = headerElement.nextElementSibling;
    const expandBtn = headerElement.querySelector('.expand-btn');
    const toggleAllBtn = document.getElementById('toggle-all-btn');
    const appId = headerElement.parentElement.id.replace('app-', '');
    
    versionList.classList.toggle('show');
    expandBtn.classList.toggle('open');

    if (versionList.classList.contains('show')) {
        expandedApps.add(appId);
    } else {
        expandedApps.delete(appId);
        isAllExpanded = false; 
    }

    const anyOpen = document.querySelectorAll('#app-list .version-list.show').length > 0;
    toggleAllBtn.textContent = anyOpen ? 'Collapse All' : 'Expand All';
}

function copyAppLink(event, appId) {
    event.stopPropagation();
    
    const url = window.location.origin + window.location.pathname + '#' + appId;
    
    navigator.clipboard.writeText(url).then(() => {
        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = '✅';
        setTimeout(() => btn.textContent = originalText, 1500);
    }).catch(err => {});
}

function handleUrlHash() {
    const hash = window.location.hash.substring(1);
    if (hash) {
        const targetCard = document.getElementById(`app-${hash}`);
        if (targetCard) {
            const header = targetCard.querySelector('.app-header');
            const versionList = targetCard.querySelector('.version-list');
            
            if (versionList && !versionList.classList.contains('show')) {
                toggleVersions(header);
            }
            
            targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetCard.style.transition = 'box-shadow 0.4s ease-in-out';
            targetCard.style.boxShadow = '0 0 20px var(--md-sys-color-primary)';
            setTimeout(() => targetCard.style.boxShadow = 'none', 2000);
        }
    }
}

init();