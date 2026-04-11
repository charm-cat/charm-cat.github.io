let existingAppData = [];

document.addEventListener('DOMContentLoaded', async () => {
    setupThemeToggle();

    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const loading = document.getElementById('loading-indicator');
    const resultsContainer = document.getElementById('results-container');

    let originalTitle = document.title;
    let isProcessing = false;

    document.addEventListener('visibilitychange', () => {
        if (isProcessing && document.hidden) {
            document.title = "KEEP THIS TAB OPEN";
        } else {
            document.title = originalTitle;
        }
    });

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

    function escapeHTML(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
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
        if (files.length === 0) return;

        isProcessing = true;
        
        resultsContainer.innerHTML = `
            <div id="batch-card-container"></div>
            <div id="error-cards-container" style="display: flex; flex-direction: column; gap: 24px;"></div>
            <div id="success-cards-container" style="display: flex; flex-direction: column; gap: 24px;"></div>
        `;
        
        loading.style.display = 'block';

        let timerInterval;
        const batchStartTime = performance.now();
        const rawFileCount = files.length;

        if (rawFileCount > 1) {
            document.getElementById('batch-card-container').innerHTML = getLoadingBatchJsonCardHTML();
            
            timerInterval = setInterval(() => {
                const elapsed = performance.now() - batchStartTime;
                const btn = document.getElementById('loading-timer-btn');
                if (btn) {
                    btn.textContent = `⏳ Generating... (${(elapsed / 1000).toFixed(1)}s)`;
                }
            }, 100);
        }

        let state = {
            validCount: 0,
            batchData: {},
            processedHashes: new Set()
        };

        const filePromises = [];
        for (let i = 0; i < rawFileCount; i++) {
            filePromises.push(processFile(files[i], state));
        }
        await Promise.all(filePromises);

        if (timerInterval) clearInterval(timerInterval);

        const batchEndTime = performance.now();
        const batchTimeMs = batchEndTime - batchStartTime;
        const batchTimeFormatted = batchTimeMs >= 1000 ? (batchTimeMs / 1000).toFixed(2) + 's' : Math.round(batchTimeMs) + 'ms';

        const sortedBatch = Object.values(state.batchData).sort((a, b) => a.id.localeCompare(b.id));
        
        const batchCardContainer = document.getElementById('batch-card-container');
        if (state.validCount > 1) {
            batchCardContainer.innerHTML = getBatchJsonCardHTML(sortedBatch, batchTimeFormatted, state.validCount);
            batchCardContainer.style.marginBottom = '24px';
        } else {
            batchCardContainer.innerHTML = ''; 
        }

        const errorContainer = document.getElementById('error-cards-container');
        const successContainer = document.getElementById('success-cards-container');
        
        if (errorContainer.children.length === 0) errorContainer.style.display = 'none';
        if (successContainer.children.length === 0) successContainer.style.display = 'none';
        if (errorContainer.children.length > 0 && successContainer.children.length > 0) {
            successContainer.style.marginTop = '24px';
        }

        isProcessing = false;
        if (!document.hidden) {
            document.title = originalTitle;
        }
        
        loading.style.display = 'none';
    }

    function sanitizeString(str) {
        if (!str) return undefined;
        if (Array.isArray(str)) str = str.join(' ');
        return String(str).replace(/[\r\n\t]+/g, ' ').replace(/\s\s+/g, ' ').trim();
    }

    async function processFile(file, state) {
        const appStartTime = performance.now();

        const ext = file.name.split('.').pop().toLowerCase();
        const validExts = ['apk', 'apkm', 'xapk'];
        
        if (!validExts.includes(ext)) {
            renderErrorCard(file.name, 'Unsupported file format. Please upload an APK, APKM, or XAPK.');
            return;
        }

        try {
            const arrayBufferPromise = file.arrayBuffer();
            const zipPromise = JSZip.loadAsync(file);

            const arrayBuffer = await arrayBufferPromise;
            const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

            if (state.processedHashes.has(hashHex)) {
                return; 
            }
            state.processedHashes.add(hashHex);

            const rawSizeMB = (file.size / (1024 * 1024)).toFixed(1);
            const fileSizeMB = rawSizeMB + 'MB';
            
            let fileFormat = ext.toUpperCase();
            if (ext === 'apkm') fileFormat = 'APK(M)';
            else if (ext === 'xapk') fileFormat = '(X)APK';
            
            const formatClass = `type-${ext === 'apkm' ? 'apkm' : (ext === 'xapk' ? 'xapk' : 'apk')}`;

            const zip = await zipPromise;
            
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
                let needsAppInfoParser = true;

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

                    const iconFile = zip.file('icon.png');
                    if (iconFile) {
                        iconSrc = URL.createObjectURL(await iconFile.async('blob'));
                    }

                    if (packageName !== 'Unknown Package') {
                        needsAppInfoParser = false;
                    }
                }

                if (needsAppInfoParser) {
                    if (ext === 'xapk') {
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

                        const strippedTarget = JSON.stringify({
                            manifest: result.manifest,
                            usesPermissions: result.usesPermissions
                        });

                        if (strippedTarget.includes('"anyDensity":false') || strippedTarget.includes('"anyDensity":"false"')) isAnyDensity = false;

                        const manifestArchMatch = strippedTarget.match(/(?:^|[^a-z0-9])(arm64[_-]v8a|armeabi[_-]v7a|x86_64|x86)(?:[^a-z0-9]|$)/ig);
                        if (manifestArchMatch) manifestArchMatch.forEach(m => archs.add(m.match(/(arm64[_-]v8a|armeabi[_-]v7a|x86_64|x86)/i)[0].toLowerCase()));

                        const manifestDpiMatch = strippedTarget.match(/(?:^|[^a-z])(xxxhdpi|xxhdpi|xhdpi|hdpi|mdpi|ldpi|tvdpi)(?:[^a-z]|$)/ig);
                        if (manifestDpiMatch) manifestDpiMatch.forEach(m => dpis.add(m.match(/(xxxhdpi|xxhdpi|xhdpi|hdpi|mdpi|ldpi|tvdpi)/i)[0].toLowerCase()));

                        const densityNumMatch = strippedTarget.match(/(?:screenDensity|density)["']?\s*:\s*["']?(\d+)/ig);
                        if (densityNumMatch) densityNumMatch.forEach(m => dpis.add(m.match(/\d+/)[0]));

                    } catch (err) {}
                }
            }

            Object.keys(zip.files).forEach(f => {
                const lowerF = f.toLowerCase();
                const archMatch = lowerF.match(archRegexZip);
                if (archMatch) archs.add(archMatch[1].toLowerCase());
                const dpiMatch = lowerF.match(dpiRegexZip);
                if (dpiMatch) dpis.add(dpiMatch[1]);
            });

            appName = appName || 'Unknown App';
            packageName = packageName || 'Unknown Package';
            versionName = versionName || 'Unknown Version';

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
                            <strong>❗ Important:</strong> x86 architecture is not supported by ReVanced Manager.
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

            state.validCount++;

            let jsonSnippet = '';
            let uiImportantMsgHTML = '';
            let uiWarningMsgHTML = '';

            if (!isX86) {
                const matchedApp = existingAppData.find(app => 
                    (app.packageName && app.packageName === packageName) || 
                    (app.secondaryPackageName && app.secondaryPackageName === packageName) ||
                    (app.thirdPackageName && app.thirdPackageName === packageName) ||
                    (app.name && app.name.toLowerCase() === appName.toLowerCase())
                );
                
                let jsonId = ""; 
                let jsonName = appName;
                let jsonIcon = `icons/unknown.png`;
                let jsonPackageName = packageName;
                let jsonSecondaryPackageName = undefined;
                let jsonThirdPackageName = undefined;
                let jsonImportant = undefined;

                let jsonAny = "no";
                let jsonWarning = undefined;
                let jsonNote = undefined;
                let jsonLinks = [];
                let preservedVersions = [];

                if (matchedApp) {
                    jsonId = matchedApp.id || "";
                    jsonName = matchedApp.name || appName;
                    
                    appName = jsonName; 
                    
                    jsonIcon = matchedApp.icon || jsonIcon;
                    jsonPackageName = matchedApp.packageName || packageName;
                    jsonSecondaryPackageName = matchedApp.secondaryPackageName;
                    jsonThirdPackageName = matchedApp.thirdPackageName;
                    
                    jsonImportant = sanitizeString(matchedApp.important);
                    
                    if (matchedApp.versions && matchedApp.versions.length > 0) {
                        const matchedVersion = matchedApp.versions.find(v => v.version === versionName);
                        const templateVersion = matchedVersion || matchedApp.versions[0];
                        
                        jsonAny = templateVersion.any || "no";
                        jsonWarning = sanitizeString(templateVersion.warning);
                        jsonNote = sanitizeString(templateVersion.note);

                        if (templateVersion.links && templateVersion.links.length > 0) {
                            let hasBuzzheavier = false;
                            
                            templateVersion.links.forEach(link => {
                                const lName = link["url-name"] || link.name || "";
                                const lUrl = link.url || "";
                                const lowerName = lName.toLowerCase();
                                
                                if (lowerName.includes('buzzheavier')) {
                                    hasBuzzheavier = true;
                                    jsonLinks.push({
                                        "url": (matchedVersion && (matchedVersion.sha256 === hashHex)) ? lUrl : "",
                                        "url-name": lName
                                    });
                                } else {
                                    jsonLinks.push({
                                        "url": lUrl,
                                        "url-name": lName
                                    });
                                }
                            });

                            if (!hasBuzzheavier) {
                                jsonLinks.unshift({ "url": "", "url-name": "Buzzheavier Link" });
                            }
                        } else {
                            jsonLinks = [{ "url": "", "url-name": "Buzzheavier Link" }];
                        }

                        matchedApp.versions.forEach(v => {
                            if (v.version !== versionName) {
                                preservedVersions.push(v);
                            }
                        });
                    }

                    if (jsonLinks.length === 0) {
                        jsonLinks = [{ "url": "", "url-name": "Buzzheavier Link" }];
                    }

                    if (jsonImportant) {
                        uiImportantMsgHTML = `
                            <div class="app-important" style="margin-bottom: 16px;">
                                <strong>‼️ Important:</strong> ${jsonImportant}
                            </div>
                        `;
                    }
                    if (jsonWarning) {
                        uiWarningMsgHTML = `
                            <div class="version-warning" style="margin-bottom: 16px;">
                                <strong>⚠️ Warning:</strong> ${jsonWarning}
                            </div>
                        `;
                    }

                } else {
                    if (packageName !== 'Unknown Package') {
                        jsonIcon = `icons/${packageName.replace(/\./g, '-')}.png`;
                    }
                    jsonLinks = [{ "url": "", "url-name": "Buzzheavier Link" }];
                }

                const versionObj = {
                    version: versionName,
                    any: jsonAny,
                };
                if (jsonWarning) versionObj.warning = jsonWarning;
                if (jsonNote) versionObj.note = jsonNote;
                
                versionObj.versioncode = versionCode ? versionCode.toString() : "";
                versionObj.size = fileSizeMB;
                versionObj.type = ext;
                versionObj.arch = finalArch;
                versionObj.dpi = finalDpiText; 
                versionObj.sha256 = hashHex;
                versionObj.links = jsonLinks; 

                const generatedJsonData = {
                    id: jsonId,
                    name: jsonName,
                    icon: jsonIcon,
                    packageName: jsonPackageName
                };
                
                if (jsonSecondaryPackageName) generatedJsonData.secondaryPackageName = jsonSecondaryPackageName;
                if (jsonThirdPackageName) generatedJsonData.thirdPackageName = jsonThirdPackageName;
                if (jsonImportant) generatedJsonData.important = jsonImportant;
                
                generatedJsonData.versions = [ versionObj, ...preservedVersions ];

                jsonSnippet = JSON.stringify(generatedJsonData, null, 2);

                let mapId = jsonId || packageName || appName;
                if (!state.batchData[mapId]) {
                    state.batchData[mapId] = {
                        id: jsonId,
                        name: jsonName,
                        icon: jsonIcon,
                        packageName: jsonPackageName,
                        secondaryPackageName: jsonSecondaryPackageName,
                        thirdPackageName: jsonThirdPackageName,
                        important: jsonImportant,
                        versions: []
                    };
                    state.batchData[mapId].versions.push(...preservedVersions);
                }
                
                state.batchData[mapId].versions.unshift(versionObj);
            }

            const appEndTime = performance.now();
            const appTimeMs = appEndTime - appStartTime;
            const appTimeFormatted = appTimeMs >= 1000 ? (appTimeMs / 1000).toFixed(2) + 's' : Math.round(appTimeMs) + 'ms';

            renderSuccessCard({
                appName, packageName, versionName, versionCode,
                fileSizeMB, fileFormat, formatClass, finalArch, archWarningHTML,
                finalDpiText, hashHex, iconSrc, jsonSnippet, isX86,
                uiImportantMsgHTML, uiWarningMsgHTML, appTimeFormatted
            });

        } catch (error) {
            renderErrorCard(file.name, 'Error processing file: ' + error.message);
        }
    }

    function getLoadingBatchJsonCardHTML() {
        return `
            <div class="app-card" style="border: 2px solid var(--md-sys-color-tertiary);">
                <div class="app-header">
                    <div class="app-title" style="width: 100%;">
                        <h2 style="color: var(--md-sys-color-tertiary);">Aggregated JSON Output</h2>
                        <div class="package-name">Generating aggregated data...</div>
                    </div>
                </div>
                <div class="version-list show">
                    <button id="loading-timer-btn" disabled style="margin-bottom: 12px; background-color: var(--md-sys-color-surface-variant); color: var(--md-sys-color-on-surface-variant); border: none; padding: 8px 16px; border-radius: 8px; cursor: not-allowed; font-weight: bold; font-family: inherit; transition: all 0.2s ease;">⏳ Generating... (0.0s)</button>
                    <div class="json-block-wrapper" style="border-radius: 12px; text-align: center; padding: 24px;">
                        <em>Processing files... Please wait.</em>
                    </div>
                </div>
            </div>
        `;
    }

    function getBatchJsonCardHTML(batchArray, batchTimeFormatted, totalFiles) {
        const cleanBatchArray = batchArray.map(app => {
            let cleanApp = { ...app };
            if (!cleanApp.secondaryPackageName) delete cleanApp.secondaryPackageName;
            if (!cleanApp.thirdPackageName) delete cleanApp.thirdPackageName;
            if (!cleanApp.important) delete cleanApp.important;
            return cleanApp;
        });

        const batchSnippet = JSON.stringify(cleanBatchArray, null, 2);
        return `
            <div class="app-card" style="border: 2px solid var(--md-sys-color-tertiary);">
                <div class="app-header">
                    <div class="app-title" style="width: 100%;">
                        <h2 style="color: var(--md-sys-color-tertiary);">Aggregated JSON Output</h2>
                        <div class="package-name">Contains all non-x86 files processed in this batch, grouped by app and sorted A-Z.</div>
                    </div>
                </div>
                <div class="version-list show">
                    <button class="download-json-btn" onclick="downloadJsonFile(this, 'data.json')" style="margin-bottom: 12px; background-color: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-weight: bold; font-family: inherit; transition: all 0.2s ease;">📥 Download JSON File</button>
                    <details class="json-details">
                        <summary>
                            <div class="json-summary-content">
                                <span class="summary-title">Show Aggregated JSON</span>
                                <span class="batch-stats">
                                    <span>📁 ${totalFiles} Files</span>
                                    <span>⏱️ Processed in ${batchTimeFormatted}</span>
                                </span>
                            </div>
                        </summary>
                        <div class="json-block-wrapper" style="border-radius: 12px; margin-top: 8px;">
                            <button class="copy-json-btn" onclick="copyJsonCode(this)">Copy All JSON</button>
                            <pre><code class="json-code">${escapeHTML(batchSnippet)}</code></pre>
                        </div>
                    </details>
                </div>
            </div>
        `;
    }

    function renderSuccessCard(data) {
        const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#263340"/><text x="32" y="36" font-family="sans-serif" font-size="24" fill="#C4C7C5" text-anchor="middle">?</text></svg>`;
        const defaultIcon = `data:image/svg+xml,${encodeURIComponent(svgString)}`;
        
        const jsonHTML = data.isX86 ? '' : `
            <details class="json-details">
                <summary>
                    <div class="json-summary-content">
                        <span class="summary-title">Show JSON Output</span>
                        <span class="batch-stats">
                            <span>⏱️ Processed in ${data.appTimeFormatted}</span>
                        </span>
                    </div>
                </summary>
                <div class="json-block-wrapper">
                    <button class="copy-json-btn" onclick="copyJsonCode(this)">Copy JSON</button>
                    <pre><code class="json-code">${escapeHTML(data.jsonSnippet)}</code></pre>
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
                    ${data.uiImportantMsgHTML || ''}
                    ${data.archWarningHTML || ''}
                    ${data.uiWarningMsgHTML || ''}
                    <div class="version-item">
                        <div class="version-details">
                            <span class="version-number"><strong>Version:</strong> ${data.versionName} <span style="font-size: 0.9em; opacity: 0.8;">${data.versionCode ? `(${data.versionCode})` : ''}</span></span>
                            <span class="version-size"><strong>Size:</strong> ${data.fileSizeMB}</span>
                            <span class="version-type"><strong>Format:</strong> <span class="${data.formatClass}">${data.fileFormat}</span></span>
                            <span class="version-architecture"><strong>Architecture:</strong> ${data.finalArch}</span>
                            <span class="version-dpi"><strong>Screen DPI:</strong> ${data.finalDpiText}</span>
                            <span class="version-hash" style="word-break: break-all;"><strong>SHA-256:</strong> <code>${data.hashHex}</code></span>
                        </div>
                    </div>
                    ${jsonHTML}
                </div>
            </div>
        `;
        document.getElementById('success-cards-container').insertAdjacentHTML('beforeend', cardHTML);
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
        document.getElementById('error-cards-container').insertAdjacentHTML('beforeend', errorHTML);
    }
});

window.downloadJsonFile = function(btn, filename) {
    try {
        const detailsContainer = btn.nextElementSibling;
        const codeBlockText = detailsContainer.querySelector('.json-code').textContent;
        
        const blob = new Blob([codeBlockText], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        const originalText = btn.innerHTML;
        btn.innerHTML = '✅ Downloaded!';
        btn.style.backgroundColor = 'var(--md-sys-color-secondary)';
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.backgroundColor = 'var(--md-sys-color-primary)';
        }, 2000);
    } catch (err) {
        alert('Failed to download JSON file.');
    }
};

window.copyJsonCode = function(btn) {
    const codeBlock = btn.nextElementSibling.textContent;
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