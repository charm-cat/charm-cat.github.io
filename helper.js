let existingAppData = [];

document.addEventListener('DOMContentLoaded', async () => {
    setupThemeToggle();

    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const loading = document.getElementById('loading-indicator');
    const resultsContainer = document.getElementById('results-container');

    try {
        const response = await fetch('data.json');
        if (response.ok) {
            existingAppData = await response.json();
        }
    } catch (e) {
        console.warn("Could not load data.json for cross-referencing.");
    }

    function setupThemeToggle() {
        const themeToggleBtn = document.getElementById('theme-toggle');
        const body = document.body;
        if (localStorage.getItem('charm-theme') === 'light') {
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

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    
    dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            await handleFiles(e.dataTransfer.files);
        }
    });
    
    fileInput.addEventListener('change', async (e) => {
        if (e.target.files.length) {
            await handleFiles(e.target.files);
        }
        fileInput.value = ''; 
    });

    async function handleFiles(files) {
        resultsContainer.innerHTML = '';
        loading.style.display = 'block';

        if (files.length > 1) {
            renderLoadingBatchJsonCard(files.length);
        }

        let batchData = {}; 

        for (let i = 0; i < files.length; i++) {
            await processFile(files[i], batchData);
        }

        const sortedBatch = Object.values(batchData).sort((a, b) => a.id.localeCompare(b.id));
        const totalVersions = sortedBatch.reduce((sum, app) => sum + app.versions.length, 0);

        const batchCard = document.getElementById('batch-json-card');
        
        if (totalVersions > 1) {
            if (batchCard) {
                updateBatchJsonCard(batchCard, sortedBatch);
            } else {
                renderBatchJsonCard(sortedBatch);
            }
        } else if (batchCard) {
            batchCard.remove();
        }

        loading.style.display = 'none';
    }

    async function processFile(file, batchData) {
        const ext = file.name.split('.').pop().toLowerCase();
        const validExts = ['apk', 'apkm', 'xapk'];
        
        if (!validExts.includes(ext)) {
            renderErrorCard(file.name, 'Unsupported file format. Please upload an APK, APKM, or XAPK.');
            return;
        }

        try {
            const rawSizeMB = (file.size / (1024 * 1024)).toFixed(1);
            const fileSizeMB = rawSizeMB + 'MB';
            
            let fileFormat = ext.toUpperCase();
            if (ext === 'apkm') fileFormat = 'APK(M)';
            else if (ext === 'xapk') fileFormat = '(X)APK';
            
            const formatClass = `type-${ext === 'apkm' ? 'apkm' : (ext === 'xapk' ? 'xapk' : 'apk')}`;

            const zip = await JSZip.loadAsync(file);
            
            let appName = 'Unknown App';
            let packageName = 'Unknown Package';
            let versionName = 'Unknown Version';
            let versionCode = '';
            let iconSrc = '';
            const archs = new Set();
            const dpis = new Set();
            let isAnyDensity = true; 

            const archRegexZip = /(?:^|[^a-z0-9])(arm64[_-]v8a|armeabi[_-]v7a|x86_64|x86)(?:[^a-z0-9]|$)/i;
            const dpiRegexZip = /(?:^|[^a-z])(xxxhdpi|xxhdpi|xhdpi|hdpi|mdpi|ldpi|tvdpi)(?:[^a-z]|$)/i;

            if (ext === 'apkm') {
                const infoFile = zip.file('info.json');
                if (infoFile) {
                    try {
                        const infoText = await infoFile.async('string');
                        const info = JSON.parse(infoText);
                        
                        appName = info.app_name || appName;
                        packageName = info.pname || packageName;
                        versionName = info.release_version || versionName;
                        versionCode = info.versionCode || info.version_code || info.versioncode || '';
                        
                        if (Array.isArray(info.arches)) info.arches.forEach(a => archs.add(a));
                        if (Array.isArray(info.dpis)) info.dpis.forEach(d => dpis.add(d));
                    } catch (e) {}
                }
                const iconFile = zip.file('icon.png');
                if (iconFile) iconSrc = URL.createObjectURL(await iconFile.async('blob'));
            }

            if (ext === 'xapk' || ext === 'apk') {
                let targetApkBlob = file;
                let xapkManifest = null;

                if (ext === 'xapk') {
                    const manifestFile = zip.file('manifest.json');
                    if (manifestFile) {
                        try {
                            xapkManifest = JSON.parse(await manifestFile.async('string'));
                            appName = xapkManifest.name || appName;
                            packageName = xapkManifest.package_name || packageName;
                            versionName = xapkManifest.version_name || versionName;
                            versionCode = xapkManifest.version_code || versionCode;

                            if (Array.isArray(xapkManifest.split_apks)) {
                                xapkManifest.split_apks.forEach(split => {
                                    const identifier = (split.id || split.file || '').toLowerCase();
                                    const archMatch = identifier.match(archRegexZip);
                                    if (archMatch) archs.add(archMatch[1].toLowerCase()); 
                                    const dpiMatch = identifier.match(dpiRegexZip);
                                    if (dpiMatch) dpis.add(dpiMatch[1]);
                                });
                            }
                        } catch(e) {}
                    }

                    let baseApkFile = zip.file('base.apk'); 
                    if (!baseApkFile && xapkManifest && xapkManifest.package_name) {
                         baseApkFile = zip.file(`${xapkManifest.package_name}.apk`);
                    }
                    if (!baseApkFile) {
                        const apkFiles = Object.values(zip.files).filter(f => f.name.endsWith('.apk') && !f.dir);
                        baseApkFile = apkFiles.find(f => !f.name.toLowerCase().includes('config') && !f.name.toLowerCase().includes('split'));
                        if (!baseApkFile && apkFiles.length > 0) baseApkFile = apkFiles[0];
                    }
                    
                    if (baseApkFile) {
                        targetApkBlob = new File([await baseApkFile.async('arraybuffer')], 'base.apk', { type: 'application/vnd.android.package-archive' });
                    }
                }

                try {
                    const parser = new AppInfoParser(targetApkBlob);
                    const result = await parser.parse();

                    let pAppName = result.application?.label || result.application?.name || file.name;
                    if (Array.isArray(pAppName)) pAppName = [...new Set(pAppName)][0]; 
                    else if (typeof pAppName === 'string') {
                        const half = pAppName.length / 2;
                        if (pAppName.length % 2 === 0 && pAppName.substring(0, half) === pAppName.substring(half)) pAppName = pAppName.substring(0, half);
                    }
                    
                    appName = (ext === 'xapk' && xapkManifest && xapkManifest.name) ? xapkManifest.name : pAppName;
                    packageName = (ext === 'xapk' && xapkManifest && xapkManifest.package_name) ? xapkManifest.package_name : (result.package || packageName);
                    versionName = (ext === 'xapk' && xapkManifest && xapkManifest.version_name) ? xapkManifest.version_name : (result.versionName || versionName);
                    versionCode = (ext === 'xapk' && xapkManifest && xapkManifest.version_code) ? xapkManifest.version_code : (result.versionCode || versionCode);
                    iconSrc = result.icon || iconSrc;

                    const resultStr = JSON.stringify(result);
                    if (resultStr.includes('"anyDensity":false') || resultStr.includes('"anyDensity":"false"')) isAnyDensity = false;

                    const manifestArchMatch = resultStr.match(/(?:^|[^a-z0-9])(arm64[_-]v8a|armeabi[_-]v7a|x86_64|x86)(?:[^a-z0-9]|$)/ig);
                    if (manifestArchMatch) manifestArchMatch.forEach(m => archs.add(m.match(/(arm64[_-]v8a|armeabi[_-]v7a|x86_64|x86)/i)[0].toLowerCase()));

                    const manifestDpiMatch = resultStr.match(/(?:^|[^a-z])(xxxhdpi|xxhdpi|xhdpi|hdpi|mdpi|ldpi|tvdpi)(?:[^a-z]|$)/ig);
                    if (manifestDpiMatch) manifestDpiMatch.forEach(m => dpis.add(m.match(/(xxxhdpi|xxhdpi|xhdpi|hdpi|mdpi|ldpi|tvdpi)/i)[0].toLowerCase()));

                    const densityNumMatch = resultStr.match(/(?:screenDensity|density)["']?\s*:\s*["']?(\d+)/ig);
                    if (densityNumMatch) densityNumMatch.forEach(m => dpis.add(m.match(/\d+/)[0]));

                } catch (err) {}
            }

            Object.keys(zip.files).forEach(f => {
                const lowerF = f.toLowerCase();
                const archMatch = lowerF.match(archRegexZip);
                if (archMatch) archs.add(archMatch[1].toLowerCase());
                const dpiMatch = lowerF.match(dpiRegexZip);
                if (dpiMatch) dpis.add(dpiMatch[1]);
            });

            let hasArm64 = false;
            let hasArm32 = false;
            let hasX86 = false;
            let hasX86_64 = false;

            archs.forEach(a => {
                const norm = a.replace('-', '_');
                if (norm === 'arm64_v8a') hasArm64 = true;
                if (norm === 'armeabi_v7a') hasArm32 = true;
                if (norm === 'x86') hasX86 = true;
                if (norm === 'x86_64') hasX86_64 = true;
            });

            let displayArchs = [];
            let archWarningHTML = '';
            let isX86 = false; 

            if (hasArm64 || hasArm32) {
                if (hasArm64 && hasArm32) displayArchs.push('Universal');
                else {
                    if (hasArm64) displayArchs.push('arm64-v8a');
                    if (hasArm32) displayArchs.push('armeabi-v7a');
                }
            } else {
                if (hasX86) displayArchs.push('x86');
                if (hasX86_64) displayArchs.push('x86_64');
                if (hasX86 || hasX86_64) {
                    isX86 = true; 
                    archWarningHTML = `
                        <div class="app-important" style="margin-bottom: 16px;">
                            <strong>❗ Important:</strong><br><br> x86 architecture is not supported by ReVanced Manager.
                        </div>
                    `;
                }
            }

            let finalArch = displayArchs.join(', ');
            if (displayArchs.length === 0) finalArch = 'Universal';
            
            const dpiNumericalValues = { 'ldpi': 120, 'mdpi': 160, 'tvdpi': 213, 'hdpi': 240, 'xhdpi': 320, 'xxhdpi': 480, 'xxxhdpi': 640 };
            const collectedDpiNumbers = [];
            dpis.forEach(dpiVal => {
                let dpiString = dpiVal.toString().toLowerCase();
                if (!isNaN(parseInt(dpiString)) && parseInt(dpiString) > 0) collectedDpiNumbers.push(parseInt(dpiString));
                else if (dpiNumericalValues[dpiString]) collectedDpiNumbers.push(dpiNumericalValues[dpiString]);
            });

            let finalDpiText = 'nodpi';
            if (collectedDpiNumbers.length > 0) {
                const minDpi = Math.min(...collectedDpiNumbers);
                const maxDpi = Math.max(...collectedDpiNumbers);
                finalDpiText = (minDpi === maxDpi) ? `${minDpi}dpi` : `${minDpi}-${maxDpi}dpi`;
            } else {
                finalDpiText = isAnyDensity ? 'nodpi' : 'nodpi';
            }

            const arrayBuffer = await file.arrayBuffer();
            const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

            let jsonSnippet = '';

            if (!isX86) {
                const matchedApp = existingAppData.find(app => 
                    (app.packageName && app.packageName === packageName) || 
                    (app.secondaryPackageName && app.secondaryPackageName === packageName) ||
                    (app.name && app.name.toLowerCase() === appName.toLowerCase())
                );
                
                let jsonId = ""; 
                let jsonIcon = `icons/unknown.png`;
                let jsonAny = "no";
                let jsonLinks = [{ "url": "", "url-name": "" }];

                if (matchedApp) {
                    jsonId = matchedApp.id || "";
                    jsonIcon = matchedApp.icon || jsonIcon;
                    
                    if (matchedApp.versions && matchedApp.versions.length > 0) {
                        const matchedVersion = matchedApp.versions.find(v => v.version === versionName);
                        
                        if (matchedVersion) {
                            jsonAny = matchedVersion.any || "no";
                            if (matchedVersion.links && matchedVersion.links.length > 0) {
                                jsonLinks = matchedVersion.links.map(link => ({
                                    "url": link.url || "",
                                    "url-name": link["url-name"] || link.name || ""
                                }));
                            }
                        }
                    }
                } else if (packageName) {
                    jsonIcon = `icons/${packageName.replace(/\./g, '-')}.png`;
                }

                const versionObj = {
                    version: versionName,
                    any: jsonAny,
                    versionCode: versionCode ? versionCode.toString() : "",
                    size: fileSizeMB,
                    type: ext,
                    arch: finalArch,
                    dpi: finalDpiText.replace('dpi', ''), 
                    sha256: hashHex,
                    links: jsonLinks
                };

                const generatedJsonData = {
                    id: jsonId,
                    name: appName,
                    icon: jsonIcon,
                    packageName: packageName,
                    versions: [ versionObj ]
                };

                jsonSnippet = JSON.stringify(generatedJsonData, null, 2);

                let mapId = jsonId || packageName || appName;
                if (!batchData[mapId]) {
                    batchData[mapId] = {
                        id: jsonId,
                        name: appName,
                        icon: jsonIcon,
                        packageName: packageName,
                        versions: []
                    };
                }
                batchData[mapId].versions.push(versionObj);
            }

            renderSuccessCard({
                appName, packageName, versionName, versionCode,
                fileSizeMB, fileFormat, formatClass, finalArch, archWarningHTML,
                finalDpiText, hashHex, iconSrc, jsonSnippet, isX86
            });

        } catch (error) {
            renderErrorCard(file.name, 'Error processing file. It may be corrupted or encrypted: ' + error.message);
        }
    }

    function renderLoadingBatchJsonCard(fileCount) {
        const cardHTML = `
            <div id="batch-json-card" class="app-card" style="border: 2px solid var(--md-sys-color-tertiary); margin-bottom: 24px;">
                <div class="app-header">
                    <div class="app-title" style="width: 100%;">
                        <h2 style="color: var(--md-sys-color-tertiary);">Aggregated JSON Output</h2>
                        <div class="package-name">Generating data from ${fileCount} files...</div>
                    </div>
                </div>
                <div class="version-list show">
                    <div class="json-block-wrapper" style="border-radius: 12px; margin-top: 8px; text-align: center; padding: 24px;">
                        <em>Processing files... Please wait.</em>
                    </div>
                </div>
            </div>
        `;
        resultsContainer.insertAdjacentHTML('afterbegin', cardHTML);
    }

    function updateBatchJsonCard(cardElement, batchArray) {
        const batchSnippet = JSON.stringify(batchArray, null, 2);
        cardElement.innerHTML = `
            <div class="app-header">
                <div class="app-title" style="width: 100%;">
                    <h2 style="color: var(--md-sys-color-tertiary);">Aggregated JSON Output</h2>
                    <div class="package-name">Contains all non-x86 files processed in this batch, grouped by app and sorted A-Z.</div>
                </div>
            </div>
            <div class="version-list show">
                <details class="json-details">
                    <summary>Show Aggregated JSON</summary>
                    <div class="json-block-wrapper" style="border-radius: 12px; margin-top: 8px;">
                        <button class="copy-json-btn" onclick="copyJsonCode(this)">Copy All JSON</button>
                        <pre><code class="json-code">${batchSnippet}</code></pre>
                    </div>
                </details>
            </div>
        `;
    }

    function renderBatchJsonCard(batchArray) {
        const batchSnippet = JSON.stringify(batchArray, null, 2);
        const cardHTML = `
            <div id="batch-json-card" class="app-card" style="border: 2px solid var(--md-sys-color-tertiary); margin-bottom: 24px;">
                <div class="app-header">
                    <div class="app-title" style="width: 100%;">
                        <h2 style="color: var(--md-sys-color-tertiary);">Aggregated JSON Output</h2>
                        <div class="package-name">Contains all non-x86 files processed in this batch, grouped by app and sorted A-Z.</div>
                    </div>
                </div>
                <div class="version-list show">
                    <details class="json-details">
                        <summary>Show Aggregated JSON</summary>
                        <div class="json-block-wrapper" style="border-radius: 12px; margin-top: 8px;">
                            <button class="copy-json-btn" onclick="copyJsonCode(this)">Copy All JSON</button>
                            <pre><code class="json-code">${batchSnippet}</code></pre>
                        </div>
                    </details>
                </div>
            </div>
        `;
        resultsContainer.insertAdjacentHTML('afterbegin', cardHTML);
    }

    function renderSuccessCard(data) {
        const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#263340"/><text x="32" y="36" font-family="sans-serif" font-size="24" fill="#C4C7C5" text-anchor="middle">?</text></svg>`;
        const defaultIcon = `data:image/svg+xml,${encodeURIComponent(svgString)}`;
        
        const jsonHTML = data.isX86 ? '' : `
            <details class="json-details">
                <summary>Show JSON Output</summary>
                <div class="json-block-wrapper">
                    <button class="copy-json-btn" onclick="copyJsonCode(this)">Copy JSON</button>
                    <pre><code class="json-code">${data.jsonSnippet}</code></pre>
                </div>
            </details>
        `;

        const cardHTML = `
            <div class="app-card">
                <div class="app-header">
                    <div class="app-header-left">
                        <img class="app-icon" src="${data.iconSrc || defaultIcon}" onerror="this.src='${defaultIcon}'">
                        <div class="app-title">
                            <h2>${data.appName}</h2>
                            <div class="package-name">${data.packageName}</div>
                        </div>
                    </div>
                </div>
                <div class="version-list show">
                    ${data.archWarningHTML}
                    <div class="version-item">
                        <div class="version-details">
                            <span class="version-number"><strong>Version:</strong> ${data.versionName} <span style="font-size: 0.9em; opacity: 0.8;">${data.versionCode ? `(${data.versionCode})` : ''}</span></span>
                            <span class="version-size"><strong>Size:</strong> ${data.fileSizeMB}</span>
                            <span class="version-architecture"><strong>Architecture:</strong> ${data.finalArch}</span>
                            <span class="version-dpi"><strong>Screen DPI:</strong> ${data.finalDpiText}</span>
                            <span class="version-type"><strong>Type:</strong> <span class="${data.formatClass}">${data.fileFormat}</span></span>
                            <span class="version-hash" style="word-break: break-all;"><strong>SHA-256:</strong> <code>${data.hashHex}</code></span>
                        </div>
                    </div>
                    ${jsonHTML}
                </div>
            </div>
        `;
        resultsContainer.insertAdjacentHTML('beforeend', cardHTML);
    }

    function renderErrorCard(fileName, errorMessage) {
        const errorHTML = `
            <div class="app-card" style="border: 2px solid var(--md-sys-color-error);">
                <div class="app-header">
                    <div class="app-title">
                        <h2 style="color: var(--md-sys-color-error);">Failed to Parse: ${fileName}</h2>
                        <div class="package-name">${errorMessage}</div>
                    </div>
                </div>
            </div>
        `;
        resultsContainer.insertAdjacentHTML('beforeend', errorHTML);
    }
});

window.copyJsonCode = function(btn) {
    const codeBlock = btn.nextElementSibling.innerText;
    navigator.clipboard.writeText(codeBlock).then(() => {
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        btn.style.backgroundColor = 'var(--md-sys-color-primary)';
        btn.style.color = 'var(--md-sys-color-on-primary)';
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.backgroundColor = '';
            btn.style.color = '';
        }, 1500);
    }).catch(err => {
        alert('Failed to copy JSON.');
    });
};