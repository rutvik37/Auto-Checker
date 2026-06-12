// app.js
// Frontend Javascript Controller for Website Content QA Scanner (Phase 1)

let activeTab = 'dashboard';
let activeProjectId = null;
let activeProjectName = null;
let activeScanId = null;
let sseSource = null;
let selectedIssueId = null;
let dialogResolve = null;

// On Page Load
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    loadProjects().then(() => {
        checkForActiveScan();
    });
});

// Theme Management for Main Scanner Frontend
function initTheme() {
    const themeBtn = document.getElementById('theme-switch');
    if (!themeBtn) return;
    
    const body = document.body;
    
    // Restore preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        body.classList.remove('dark-mode');
        body.classList.add('light-mode');
        themeBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
    } else {
        body.classList.add('dark-mode');
        body.classList.remove('light-mode');
        themeBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
    }

    themeBtn.addEventListener('click', () => {
        if (body.classList.contains('light-mode')) {
            body.classList.remove('light-mode');
            body.classList.add('dark-mode');
            themeBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
            localStorage.setItem('theme', 'dark');
        } else {
            body.classList.remove('dark-mode');
            body.classList.add('light-mode');
            themeBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
            localStorage.setItem('theme', 'light');
        }
    });
}

// Custom Alert & Confirm Modals
function showCustomAlert(message, title = "Notification") {
    return new Promise((resolve) => {
        document.getElementById('dialog-title').textContent = title;
        document.getElementById('dialog-message').textContent = message;
        document.getElementById('btn-dialog-cancel').style.display = 'none';
        document.getElementById('btn-dialog-ok').textContent = 'OK';
        
        document.getElementById('custom-dialog-modal').classList.add('active');
        dialogResolve = resolve;
    });
}

function showCustomConfirm(message, title = "Confirmation Required") {
    return new Promise((resolve) => {
        document.getElementById('dialog-title').textContent = title;
        document.getElementById('dialog-message').textContent = message;
        document.getElementById('btn-dialog-cancel').style.display = 'inline-flex';
        document.getElementById('btn-dialog-ok').textContent = 'Yes, Proceed';
        
        document.getElementById('custom-dialog-modal').classList.add('active');
        dialogResolve = resolve;
    });
}

function closeCustomDialog(result) {
    document.getElementById('custom-dialog-modal').classList.remove('active');
    if (dialogResolve) {
        dialogResolve(result);
        dialogResolve = null;
    }
}

// Tab Switcher
function switchTab(tabId) {
    activeTab = tabId;
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(`tab-${tabId}`).classList.add('active');
    document.getElementById(`nav-btn-${tabId}`).classList.add('active');

    // Update main workspace header title
    const titles = {
        'dashboard': 'QA Dashboard',
        'projects': 'Projects & Reports'
    };
    document.getElementById('page-title').textContent = titles[tabId];

    if (tabId === 'projects') {
        loadScansHistory();
    }
}

// Project Modal
function openCreateProjectModal() {
    document.getElementById('create-project-modal').classList.add('active');
}

// Close Project Modal
function closeCreateProjectModal() {
    document.getElementById('create-project-modal').classList.remove('active');
    document.getElementById('new-project-name').value = '';
}

// REST: Create Project
async function createProject(event) {
    event.preventDefault();
    const nameInput = document.getElementById('new-project-name');
    const name = nameInput.value.trim();

    try {
        const response = await fetch('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        
        if (response.ok) {
            const project = await response.json();
            closeCreateProjectModal();
            await loadProjects();
            // Select newly created project
            document.getElementById('global-project-select').value = project.id;
            onProjectChanged();
        } else {
            const err = await response.text();
            showCustomAlert('Error: ' + err, 'Project Error');
        }
    } catch (e) {
        showCustomAlert('Network error: ' + e.message, 'Network Error');
    }
}

// REST: Load Projects List
async function loadProjects() {
    try {
        const response = await fetch('/api/projects');
        let projects = await response.json();
        
        // Auto-create a default project if none exists
        if (projects.length === 0) {
            const createResp = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Default' })
            });
            if (createResp.ok) {
                const newProj = await createResp.json();
                projects = [newProj];
            }
        }

        const select = document.getElementById('global-project-select');
        if (!select) return;
        
        // Save current selection
        const prevSelected = select.value;

        // Reset
        select.innerHTML = '<option value="">-- Select a Project --</option>';
        projects.forEach(proj => {
            const opt = document.createElement('option');
            opt.value = proj.id;
            opt.dataset.name = proj.name;
            opt.textContent = proj.name;
            select.appendChild(opt);
        });

        if (prevSelected && select.querySelector(`option[value="${prevSelected}"]`)) {
            select.value = prevSelected;
        } else if (projects.length > 0) {
            select.value = projects[0].id;
            activeProjectId = projects[0].id;
            activeProjectName = projects[0].name;
        }
    } catch (e) {
        console.error('Failed to load projects: ', e);
    }
}

function onProjectChanged() {
    const select = document.getElementById('global-project-select');
    if (!select) return;
    const selectedOpt = select.options[select.selectedIndex];
    if (selectedOpt && selectedOpt.value) {
        activeProjectId = selectedOpt.value;
        activeProjectName = selectedOpt.dataset.name;
    } else {
        activeProjectId = null;
        activeProjectName = null;
    }

    if (activeTab === 'projects') {
        loadScansHistory();
    }
}

// REST: Start Scan
async function startScan(event) {
    event.preventDefault();

    const projectNameInput = document.getElementById('scan-project-name');
    const projectName = projectNameInput ? projectNameInput.value.trim() : '';
    if (!projectName) {
        showCustomAlert('Project name is required', 'Form Validation');
        return;
    }

    const urlInput = document.getElementById('scan-url');
    const maxPagesInput = document.getElementById('max-pages');
    const crawlDepthInput = document.getElementById('crawl-depth');

    if (urlInput) urlInput.disabled = true;
    if (projectNameInput) projectNameInput.disabled = true;
    if (maxPagesInput) maxPagesInput.disabled = true;
    if (crawlDepthInput) crawlDepthInput.disabled = true;

    const btn = document.getElementById('btn-start-scan');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Initializing...';

    try {
        // Create or load the project
        const createResp = await fetch('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: projectName })
        });

        if (!createResp.ok) {
            const errText = await createResp.text();
            throw new Error('Could not create project ' + projectName + ': ' + errText);
        }

        const project = await createResp.json();
        activeProjectId = project.id;
        activeProjectName = project.name;

        // Trigger the scan on the project
        const url = document.getElementById('scan-url').value.trim();
        const scanName = document.getElementById('scan-name').value.trim();
        const maxPages = document.getElementById('max-pages').value.trim();
        const crawlDepth = document.getElementById('crawl-depth').value.trim();
        const respectRobots = document.getElementById('respect-robots').checked;

        const response = await fetch(`/api/projects/${activeProjectId}/scans`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: scanName,
                url: url,
                maxPages: maxPages ? parseInt(maxPages) : null,
                crawlDepth: crawlDepth ? parseInt(crawlDepth) : null,
                respectRobots: respectRobots
            })
        });

        if (response.ok) {
            const data = await response.json();
            activeScanId = data.scanId;
            
            // Show scanning container
            document.getElementById('scan-empty-state').style.display = 'none';
            document.getElementById('active-scan-container').style.display = 'block';
            
            // Make sure Stop Scan button is visible
            document.getElementById('btn-cancel-scan').style.display = 'inline-flex';

            // Clear Terminal & Stats
            resetDashboardStats(url);
            
            // Initialize SSE stream
            initSseStream(activeScanId);
        } else {
            const err = await response.text();
            showCustomAlert('Failed to launch scan: ' + err, 'Launch Error');
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-play"></i> Start Spelling Check';
            if (urlInput) urlInput.disabled = false;
            if (projectNameInput) projectNameInput.disabled = false;
            if (maxPagesInput) maxPagesInput.disabled = false;
            if (crawlDepthInput) crawlDepthInput.disabled = false;
        }
    } catch (e) {
        showCustomAlert('Error initiating scan: ' + e.message, 'Connection Error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-play"></i> Start Spelling Check';
        if (urlInput) urlInput.disabled = false;
        if (projectNameInput) projectNameInput.disabled = false;
        if (maxPagesInput) maxPagesInput.disabled = false;
        if (crawlDepthInput) crawlDepthInput.disabled = false;
    }
}

function resetDashboardStats(url) {
    const statusIcon = document.getElementById('scan-status-icon');
    const statusText = document.getElementById('scan-status-text');
    if (statusIcon) {
        statusIcon.className = 'fa-solid fa-circle-notch fa-spin status-pulse';
        statusIcon.style.color = '';
    }
    if (statusText) {
        statusText.textContent = 'Scanning Progress';
    }

    document.getElementById('stat-pages').textContent = '0';
    document.getElementById('stat-words').textContent = '0';
    document.getElementById('stat-spelling').textContent = '0';
    document.getElementById('current-scan-url').textContent = url;
    document.getElementById('progress-percentage').textContent = '0%';
    document.getElementById('progress-bar-fill').style.width = '0%';
    
    const term = document.getElementById('live-logs-terminal');
    term.innerHTML = '<p class="log-info">[System] Hooking into live scan telemetry stream...</p>';
    
    const liveTbody = document.getElementById('live-issues-table-body');
    if (liveTbody) {
        liveTbody.innerHTML = '<tr><td colspan="6" class="text-center" style="color: var(--text-muted);">No typos detected yet...</td></tr>';
    }
}

// SSE Connection for Live Logs & Progress
function initSseStream(scanId) {
    if (sseSource) {
        sseSource.close();
    }

    sseSource = new EventSource(`/api/scans/${scanId}/stream`);

    sseSource.addEventListener('log', (event) => {
        const terminal = document.getElementById('live-logs-terminal');
        const p = document.createElement('p');
        const text = event.data;

        // Apply visual styling based on log contents
        if (text.includes('[ERROR]')) {
            p.className = 'log-error';
        } else if (text.includes('[WARN]')) {
            p.className = 'log-warning';
        } else if (text.includes('completed') || text.includes('success')) {
            p.className = 'log-success';
        } else {
            p.className = 'log-info';
        }

        p.textContent = text;
        terminal.appendChild(p);
        terminal.scrollTop = terminal.scrollHeight;
    });

    sseSource.addEventListener('progress', (event) => {
        const progress = JSON.parse(event.data);
        document.getElementById('stat-pages').textContent = progress.pagesScanned;
        document.getElementById('stat-words').textContent = progress.wordsChecked;
        document.getElementById('stat-spelling').textContent = progress.spellingIssues;
        document.getElementById('current-scan-url').textContent = progress.currentUrl;

        // Compute percentage if limit exists
        const limitInput = document.getElementById('max-pages').value;
        if (limitInput) {
            const max = parseInt(limitInput);
            const percentage = Math.min(100, Math.round((progress.pagesScanned / max) * 100));
            document.getElementById('progress-percentage').textContent = percentage + '%';
            document.getElementById('progress-bar-fill').style.width = percentage + '%';
        } else {
            document.getElementById('progress-percentage').textContent = 'Active';
            document.getElementById('progress-bar-fill').style.width = '50%';
        }
        
        // Fetch latest issues to populate live table
        loadLiveIssues(scanId);
    });

    sseSource.onerror = (err) => {
        console.log('SSE connection closed or completed.');
        sseSource.close();
        
        // Reset Launch Button
        const btn = document.getElementById('btn-start-scan');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Start Spelling Check';
        }
        
        const urlInput = document.getElementById('scan-url');
        if (urlInput) urlInput.disabled = false;
        
        // Hide the Stop Scan button when scan completes / errors out
        const cancelBtn = document.getElementById('btn-cancel-scan');
        if (cancelBtn) {
            cancelBtn.style.display = 'none';
        }

        // Set progress card UI to completed state
        const statusIcon = document.getElementById('scan-status-icon');
        const statusText = document.getElementById('scan-status-text');
        if (statusIcon) {
            statusIcon.className = 'fa-solid fa-circle-check';
            statusIcon.style.color = 'var(--color-success)';
        }
        if (statusText) {
            statusText.textContent = 'Scan Completed';
        }
        
        const progressPct = document.getElementById('progress-percentage');
        const progressFill = document.getElementById('progress-bar-fill');
        if (progressPct) {
            progressPct.textContent = '100% (Finished)';
        }
        if (progressFill) {
            progressFill.style.width = '100%';
        }
        
        // Refresh project list scans history in background
        if (activeProjectId) {
            loadScansHistory();
        }
    };
}

// REST: Cancel active scan
async function cancelActiveScan() {
    if (!activeScanId) return;
    
    // Use custom styled confirm dialog
    const confirmed = await showCustomConfirm('Are you sure you want to stop the active crawl scan session?');
    if (!confirmed) return;

    try {
        await fetch(`/api/scans/${activeScanId}/cancel`, { method: 'POST' });
        const terminal = document.getElementById('live-logs-terminal');
        terminal.innerHTML += '<p class="log-error">[System] Cancellation signal sent. Shutting down crawler pool...</p>';
        
        // Hide the stop button immediately upon sending cancel signal
        document.getElementById('btn-cancel-scan').style.display = 'none';
    } catch (e) {
        console.error('Cancellation failed: ', e);
    }
}

// REST: Load Scan History
async function loadScansHistory() {
    const tableBody = document.querySelector('#scans-history-table tbody');
    if (!activeProjectId) {
        tableBody.innerHTML = '<tr><td colspan="8" class="text-center">Select an active project above to view scanning history.</td></tr>';
        return;
    }

    try {
        const response = await fetch(`/api/projects/${activeProjectId}/scans`);
        const scans = await response.json();
        
        if (scans.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="8" class="text-center">No scan sessions recorded yet. Launch a scan on the Dashboard tab.</td></tr>';
            return;
        }

        tableBody.innerHTML = '';
        scans.forEach(scan => {
            const tr = document.createElement('tr');
            
            const dateStr = scan.startedAt ? scan.startedAt.replace('T', ' ').substring(0, 19) : 'N/A';
            
            // Status badge classes
            let badgeClass = 'badge-spelling';
            if (scan.status === 'COMPLETED') badgeClass = 'badge-quality';
            else if (scan.status === 'RUNNING') badgeClass = 'badge-grammar';
            else if (scan.status === 'STOPPED') badgeClass = 'badge-suggestion';

            tr.innerHTML = `
                <td>#${scan.id}</td>
                <td><strong>${scan.name}</strong></td>
                <td><a href="${scan.url}" target="_blank" class="table-link">${scan.url}</a></td>
                <td>${scan.pagesScanned} Pages</td>
                <td><span class="badge badge-critical">${scan.totalIssues} Issues</span></td>
                <td><span class="badge ${badgeClass}">${scan.status}</span></td>
                <td>${dateStr}</td>
                <td style="white-space: nowrap;">
                    <button class="btn btn-outline btn-sm" onclick="exploreIssues(${scan.id}, '${scan.name}')">
                        <i class="fa-solid fa-magnifying-glass"></i> Explore
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="deleteScan(${scan.id}, event)" style="margin-left: 5px;">
                        <i class="fa-solid fa-trash"></i> Delete
                    </button>
                </td>
            `;
            tableBody.appendChild(tr);
        });
    } catch (e) {
        console.error('Failed to load scan history: ', e);
    }
}

// REST: Delete Scan Session
async function deleteScan(scanId, event) {
    if (event) event.stopPropagation();

    const confirmed = await showCustomConfirm('Are you sure you want to permanently delete this scan session and its results?');
    if (!confirmed) return;

    try {
        const response = await fetch(`/api/scans/${scanId}`, { method: 'DELETE' });
        if (response.ok) {
            // Hide issues explorer if active explorer is the deleted scan
            if (selectedIssueId === scanId) {
                document.getElementById('issues-explorer-card').style.display = 'none';
                selectedIssueId = null;
            }
            showCustomAlert('Scan session deleted successfully.', 'Deleted');
            loadScansHistory();
        } else {
            const err = await response.text();
            showCustomAlert('Failed to delete scan: ' + err, 'Error');
        }
    } catch (e) {
        showCustomAlert('Network error: ' + e.message, 'Network Error');
    }
}

// Helper to get only the primary suggestion (first word of comma-separated list)
function getPrimarySuggestion(suggestedText) {
    if (!suggestedText || suggestedText.trim() === '') {
        return 'None';
    }
    const parts = suggestedText.split(',');
    if (parts.length > 0) {
        return parts[0].trim();
    }
    return suggestedText.trim();
}

// Issues Explorer: simple table rendering
async function exploreIssues(scanId, scanName) {
    selectedIssueId = scanId;
    document.getElementById('issues-explorer-scan-name').textContent = scanName;
    document.getElementById('issues-explorer-card').style.display = 'block';
    
    // Smooth scroll down to explorer
    document.getElementById('issues-explorer-card').scrollIntoView({ behavior: 'smooth' });

    try {
        const response = await fetch(`/api/scans/${scanId}/issues`);
        const issues = await response.json();
        
        const tbody = document.getElementById('issues-table-body');
        if (issues.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding: 20px; color: var(--text-secondary);">No typos found in this scan session. Zero defects!</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        issues.forEach(issue => {
            const tr = document.createElement('tr');
            
            const dateStr = issue.timestamp ? issue.timestamp.replace('T', ' ').substring(0, 19) : 'N/A';
            
            // Clean context highlighting for word
            let highlightedSentence = issue.fullSentence;
            if (highlightedSentence && issue.word) {
                // Escape word to be regex safe
                const escapedWord = issue.word.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                highlightedSentence = highlightedSentence.replace(new RegExp(`(${escapedWord})`, 'gi'), '**$1**');
            } else {
                highlightedSentence = highlightedSentence || '';
            }
            
            tr.innerHTML = `
                <td><strong style="color: var(--color-error);">${issue.word}</strong></td>
                <td><span class="highlight-suggestions">${getPrimarySuggestion(issue.suggestedText)}</span></td>
                <td>${issue.pageTitle ? issue.pageTitle : 'N/A'}</td>
                <td><a href="${issue.pageUrl}" target="_blank" class="table-link">${issue.pageUrl}</a></td>
                <td>"${highlightedSentence}"</td>
                <td style="font-size: 12px; white-space: nowrap;">${dateStr}</td>
            `;
            tbody.appendChild(tr);
        });

    } catch (e) {
        showCustomAlert('Failed to load issues: ' + e.message, 'Error');
    }
}

function exportData(format) {
    const scanId = activeScanId;
    if (!scanId) {
        showCustomAlert('No active scan session found to export data.', 'Export Error');
        return;
    }
    const downloadUrl = `/api/scans/${scanId}/export/${format}`;
    window.open(downloadUrl, '_blank');
}

// Global variable to hold issue ID currently selected for deletion
let issueToDeleteId = null;

function confirmDeleteIssue(id, word, expected, url, title, sentence) {
    issueToDeleteId = id;
    document.getElementById('confirm-issue-word').textContent = word;
    document.getElementById('confirm-issue-suggestion').textContent = expected;
    
    const urlLink = document.getElementById('confirm-issue-url');
    urlLink.href = url;
    urlLink.textContent = url;
    
    document.getElementById('confirm-issue-title').textContent = title;
    document.getElementById('confirm-issue-sentence').textContent = sentence;
    
    document.getElementById('delete-issue-confirm-modal').classList.add('active');
}

async function closeDeleteConfirmModal(confirmed) {
    document.getElementById('delete-issue-confirm-modal').classList.remove('active');
    
    if (confirmed && issueToDeleteId) {
        try {
            const response = await fetch(`/api/issues/${issueToDeleteId}/remove`, {
                method: 'POST'
            });
            if (response.ok) {
                // Reload live issues and update count
                if (activeScanId) {
                    await loadLiveIssues(activeScanId);
                }
            } else {
                const errMsg = await response.text();
                showCustomAlert('Failed to remove issue: ' + errMsg, 'Error');
            }
        } catch (e) {
            showCustomAlert('Network error: ' + e.message, 'Network Error');
        }
    }
    issueToDeleteId = null;
}

// REST: Load Live Typos during scan execution
async function loadLiveIssues(scanId) {
    try {
        const response = await fetch(`/api/scans/${scanId}/issues`);
        const issues = await response.json();
        
        // Update live issue count
        const statSpelling = document.getElementById('stat-spelling');
        if (statSpelling) {
            statSpelling.textContent = issues.length;
        }

        const tbody = document.getElementById('live-issues-table-body');
        if (!tbody) return;
        
        if (issues.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="color: var(--text-muted);">No typos detected yet...</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        issues.forEach(issue => {
            const tr = document.createElement('tr');
            
            // Clean context highlighting for word in sentence
            let highlightedSentence = issue.fullSentence || '';
            if (highlightedSentence && issue.word) {
                const escapedWord = issue.word.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                highlightedSentence = highlightedSentence.replace(new RegExp(`(${escapedWord})`, 'gi'), '**$1**');
            }

            const expectedWord = getPrimarySuggestion(issue.suggestedText);

            tr.innerHTML = `
                <td><strong style="color: var(--color-error);">${issue.word}</strong></td>
                <td><span class="highlight-suggestions">${expectedWord}</span></td>
                <td><a href="${issue.pageUrl}" target="_blank" class="table-link" style="font-size: 12px;">${issue.pageUrl}</a></td>
                <td>${issue.pageTitle ? issue.pageTitle : 'N/A'}</td>
                <td>"${highlightedSentence}"</td>
                <td>
                    <button class="btn btn-danger btn-sm delete-issue-btn">Delete</button>
                </td>
            `;

            // Add event listener directly to avoid string escaping issues in HTML
            const btn = tr.querySelector('.delete-issue-btn');
            btn.addEventListener('click', () => {
                confirmDeleteIssue(
                    issue.id,
                    issue.word,
                    expectedWord,
                    issue.pageUrl,
                    issue.pageTitle || 'N/A',
                    highlightedSentence
                );
            });

            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error('Failed to load live issues:', e);
    }
}

// UI Function: Reset all inputs and scan outputs
function resetFormAndOutput() {
    // 1. Clear input
    const urlInput = document.getElementById('scan-url');
    if (urlInput) {
        urlInput.value = '';
        urlInput.disabled = false;
    }
    const projectNameInput = document.getElementById('scan-project-name');
    if (projectNameInput) {
        projectNameInput.value = '';
        projectNameInput.disabled = false;
    }
    const maxPagesInput = document.getElementById('max-pages');
    if (maxPagesInput) {
        maxPagesInput.value = '100';
        maxPagesInput.disabled = false;
    }
    const crawlDepthInput = document.getElementById('crawl-depth');
    if (crawlDepthInput) {
        crawlDepthInput.value = '3';
        crawlDepthInput.disabled = false;
    }

    // 2. Stop active SSE stream if it exists
    if (sseSource) {
        sseSource.close();
        sseSource = null;
    }

    // 3. Reset stats elements
    const statPages = document.getElementById('stat-pages');
    if (statPages) statPages.textContent = '0';
    const statSpelling = document.getElementById('stat-spelling');
    if (statSpelling) statSpelling.textContent = '0';
    const statWords = document.getElementById('stat-words');
    if (statWords) statWords.textContent = '0';

    // 4. Reset progress bar
    const progressPct = document.getElementById('progress-percentage');
    if (progressPct) progressPct.textContent = '0%';
    const progressFill = document.getElementById('progress-bar-fill');
    if (progressFill) progressFill.style.width = '0%';

    // 5. Reset status card header
    const statusIcon = document.getElementById('scan-status-icon');
    const statusText = document.getElementById('scan-status-text');
    if (statusIcon) {
        statusIcon.className = 'fa-solid fa-circle-notch fa-spin status-pulse';
        statusIcon.style.color = '';
    }
    if (statusText) {
        statusText.textContent = 'Scanning Progress';
    }

    // 6. Reset tables and views
    const liveTbody = document.getElementById('live-issues-table-body');
    if (liveTbody) {
        liveTbody.innerHTML = '<tr><td colspan="6" class="text-center" style="color: var(--text-muted); padding: 20px;">No typos detected yet...</td></tr>';
    }

    // 7. Hide scan progress container and show empty state
    const activeScanContainer = document.getElementById('active-scan-container');
    if (activeScanContainer) activeScanContainer.style.display = 'none';
    
    const scanEmptyState = document.getElementById('scan-empty-state');
    if (scanEmptyState) scanEmptyState.style.display = 'flex';

    // 8. Re-enable start scan button
    const btn = document.getElementById('btn-start-scan');
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-play"></i> Start Spelling Check';
    }
}

// REST: Check for active scans upon page load / refresh
async function checkForActiveScan() {
    try {
        const response = await fetch('/api/scans/active');
        if (!response.ok) return;
        const data = await response.json();
        
        if (data.active) {
            activeScanId = data.scanId;
            activeProjectId = data.projectId;
            activeProjectName = data.projectName;
            
            // Disable URL input and start button
            const urlInput = document.getElementById('scan-url');
            if (urlInput) {
                urlInput.value = data.url;
                urlInput.disabled = true;
            }
            const projectNameInput = document.getElementById('scan-project-name');
            if (projectNameInput) {
                projectNameInput.value = data.projectName;
                projectNameInput.disabled = true;
            }
            const maxPagesInput = document.getElementById('max-pages');
            if (maxPagesInput) {
                maxPagesInput.value = data.maxPages || 100;
                maxPagesInput.disabled = true;
            }
            const crawlDepthInput = document.getElementById('crawl-depth');
            if (crawlDepthInput) {
                crawlDepthInput.value = data.crawlDepth || 3;
                crawlDepthInput.disabled = true;
            }
            const btn = document.getElementById('btn-start-scan');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Scanning...';
            }
            
            // Show scanning container and hide empty state
            document.getElementById('scan-empty-state').style.display = 'none';
            document.getElementById('active-scan-container').style.display = 'block';
            
            // Show Stop Scan button
            const cancelBtn = document.getElementById('btn-cancel-scan');
            if (cancelBtn) {
                cancelBtn.style.display = 'inline-flex';
            }
            
            // Update stats
            document.getElementById('stat-pages').textContent = data.pagesScanned;
            document.getElementById('stat-words').textContent = data.wordsChecked;
            document.getElementById('stat-spelling').textContent = data.totalIssues;
            document.getElementById('current-scan-url').textContent = data.url;
            
            // Calculate progress percentage
            const maxPages = data.maxPages || 100;
            const percentage = Math.min(100, Math.round((data.pagesScanned / maxPages) * 100));
            document.getElementById('progress-percentage').textContent = percentage + '%';
            document.getElementById('progress-bar-fill').style.width = percentage + '%';
            
            // Hook up terminal logs with a reconnecting message
            const term = document.getElementById('live-logs-terminal');
            if (term) {
                term.innerHTML = '<p class="log-info">[System] Reconnected to active scan session #' + activeScanId + '...</p>';
            }
            
            // Select project in global selector
            const select = document.getElementById('global-project-select');
            if (select) {
                select.value = activeProjectId;
            }
            
            // Load already found live issues and hook up SSE stream
            loadLiveIssues(activeScanId);
            initSseStream(activeScanId);
        }
    } catch (e) {
        console.error('Error checking for active scan:', e);
    }
}
