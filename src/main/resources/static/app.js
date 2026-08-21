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
    initQuizGame();
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

// Toast Notification System
function showToast(message, type = 'info', title = '') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const icons = {
        success: 'fa-solid fa-circle-check',
        error: 'fa-solid fa-circle-xmark',
        warning: 'fa-solid fa-triangle-exclamation',
        info: 'fa-solid fa-circle-info'
    };

    const titles = {
        success: title || 'Success',
        error: title || 'Error',
        warning: title || 'Warning',
        info: title || 'Notification'
    };

    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;
    toast.innerHTML = `
        <i class="${icons[type] || icons.info} toast-icon"></i>
        <div class="toast-content">
            <div class="toast-title">${titles[type]}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        if (toast.parentElement) {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }
    }, 4000);
}

// Override native browser alert to guarantee no "localhost says" popups
window.nativeAlert = window.alert;
window.alert = function(msg) {
    showToast(msg, 'info');
};

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
    hideZeroIssuesCelebration();
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
        
        // Trigger celebratory state if 0 spelling issues were found (with delay for DB transaction finish)
        if (activeScanId) {
            setTimeout(() => {
                loadLiveIssues(activeScanId).then((issues) => {
                    if (issues && issues.length === 0) {
                        showZeroIssuesCelebration();
                        launchCelebrationConfetti();
                    } else {
                        hideZeroIssuesCelebration();
                    }
                });
            }, 400);
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
        if (!tbody) return issues;
        
        if (issues.length === 0) {
            const statusText = document.getElementById('scan-status-text');
            if (statusText && statusText.textContent === 'Scan Completed') {
                showZeroIssuesCelebration();
            } else {
                hideZeroIssuesCelebration();
                tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="color: var(--text-muted);">No typos detected yet...</td></tr>';
            }
            return issues;
        }

        hideZeroIssuesCelebration();
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
        return issues;
    } catch (e) {
        console.error('Failed to load live issues:', e);
        return [];
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
    hideZeroIssuesCelebration();
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

// --- Celebratory Zero-Issue Canvas Particle Confetti & UI Controllers ---
function launchCelebrationConfetti() {
    const canvas = document.getElementById('celebration-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = [];
    const colors = ['#10b981', '#34d399', '#6366f1', '#a855f7', '#fbbf24', '#3b82f6', '#ec4899'];

    for (let i = 0; i < 90; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * (canvas.height * 0.4),
            vx: (Math.random() - 0.5) * 6,
            vy: Math.random() * 4 + 2,
            size: Math.random() * 8 + 4,
            color: colors[Math.floor(Math.random() * colors.length)],
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 10,
            opacity: 1
        });
    }

    let animationFrame;
    const startTime = Date.now();

    function render() {
        const elapsed = Date.now() - startTime;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        let activeParticles = 0;
        particles.forEach(p => {
            if (p.opacity <= 0) return;
            activeParticles++;

            p.x += p.vx;
            p.y += p.vy;
            p.rotation += p.rotationSpeed;
            if (elapsed > 2000) {
                p.opacity -= 0.02;
            }

            ctx.save();
            ctx.globalAlpha = Math.max(0, p.opacity);
            ctx.translate(p.x, p.y);
            ctx.rotate((p.rotation * Math.PI) / 180);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            ctx.restore();
        });

        if (activeParticles > 0 && elapsed < 4000) {
            animationFrame = requestAnimationFrame(render);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            cancelAnimationFrame(animationFrame);
        }
    }

    render();
}

function showZeroIssuesCelebration(pagesScanned, wordsChecked) {
    const tableWrapper = document.getElementById('live-issues-table-wrapper');
    const exportContainer = document.getElementById('export-buttons-container');
    const container = document.getElementById('zero-issues-celebration-container');

    if (tableWrapper) tableWrapper.style.display = 'none';
    if (exportContainer) exportContainer.style.display = 'none';

    const pages = pagesScanned || (document.getElementById('stat-pages') ? document.getElementById('stat-pages').textContent : '0');
    const words = wordsChecked || (document.getElementById('stat-words') ? document.getElementById('stat-words').textContent : '0');

    if (container) {
        container.style.display = 'block';
        container.innerHTML = `
            <div class="zero-issues-card">
                <div class="celebration-badge-wrapper">
                    <span class="celebration-sparkle sparkle-left"><i class="fa-solid fa-sparkles"></i></span>
                    <div class="celebration-badge">
                        <i class="fa-solid fa-trophy"></i>
                    </div>
                    <span class="celebration-sparkle sparkle-right"><i class="fa-solid fa-star"></i></span>
                </div>
                
                <h3 class="zero-issues-title">
                    <i class="fa-solid fa-circle-check" style="color: #34d399;"></i>
                    Awesome News! 0 Spelling Typos Found!
                </h3>
                
                <p class="zero-issues-desc">
                    Your website content passed with <strong>100% spelling accuracy</strong>! Every word checked was verified cleanly with no spelling errors detected. Your site is polished, professional, and ready for visitors!
                </p>

                <div class="zero-issues-stats">
                    <div class="zero-stat-pill">
                        <i class="fa-solid fa-file-circle-check"></i>
                        <span><strong>${pages}</strong> Pages Crawled</span>
                    </div>
                    <div class="zero-stat-pill">
                        <i class="fa-solid fa-font"></i>
                        <span><strong>${words}</strong> Words Verified</span>
                    </div>
                    <div class="zero-stat-pill" style="border-color: rgba(16, 185, 129, 0.4); background: rgba(16, 185, 129, 0.15);">
                        <i class="fa-solid fa-shield-halved" style="color: #34d399;"></i>
                        <span style="color: #34d399;"><strong>100% Clean Quality</strong></span>
                    </div>
                </div>
            </div>
        `;
    }
}

function hideZeroIssuesCelebration() {
    const tableWrapper = document.getElementById('live-issues-table-wrapper');
    const exportContainer = document.getElementById('export-buttons-container');
    const container = document.getElementById('zero-issues-celebration-container');

    if (tableWrapper) tableWrapper.style.display = 'block';
    if (exportContainer) exportContainer.style.display = 'flex';
    if (container) {
        container.style.display = 'none';
        container.innerHTML = '';
    }
}

// --- Brain Break & Trivia Quiz Mini-Game Engine ---
// --- Brain Break & Trivia Quiz Mini-Game Engine (10 Modes) ---
let quizState = {
    mode: null,
    score: 0,
    // Per-mode question cache for all 10 modes
    modeData: {
        math: { q: null, answered: false, selectedIndex: -1 },
        india: { q: null, answered: false, selectedIndex: -1 },
        ai: { q: null, answered: false, selectedIndex: -1 },
        history: { q: null, answered: false, selectedIndex: -1 },
        science: { q: null, answered: false, selectedIndex: -1 },
        cinema: { q: null, answered: false, selectedIndex: -1 },
        sports: { q: null, answered: false, selectedIndex: -1 },
        geography: { q: null, answered: false, selectedIndex: -1 },
        coding: { q: null, answered: false, selectedIndex: -1 },
        riddles: { q: null, answered: false, selectedIndex: -1 }
    }
};

const quizBanks = {
    india: [
        { category: "India History & Leaders", question: "Who was the first Prime Minister of independent India?", options: ["Jawaharlal Nehru", "Mahatma Gandhi", "Sardar Vallabhbhai Patel", "Dr. B.R. Ambedkar"], answer: 0, explanation: "Pandit Jawaharlal Nehru served as India's first Prime Minister from 1947 to 1964." },
        { category: "India History & Leaders", question: "Who is known as the 'Missile Man of India'?", options: ["Dr. A.P.J. Abdul Kalam", "Dr. Homi Bhabha", "Vikram Sarabhai", "C.V. Raman"], answer: 0, explanation: "Dr. A.P.J. Abdul Kalam earned the title for his work on ISRO and missile technology." },
        { category: "India History & Leaders", question: "Who was the chief architect of the Indian Constitution?", options: ["Dr. B.R. Ambedkar", "Dr. Rajendra Prasad", "Subhas Chandra Bose", "Sarojini Naidu"], answer: 0, explanation: "Dr. B.R. Ambedkar served as Chairman of the Drafting Committee." },
        { category: "India Heritage & Civics", question: "Which river is the longest river originating and flowing within India?", options: ["Ganga", "Godavari", "Yamuna", "Narmada"], answer: 0, explanation: "The Ganga flows entirely within India (~2,525 km)." },
        { category: "India Heritage & Civics", question: "How many states and Union Territories are in India currently?", options: ["28 States, 8 UTs", "29 States, 7 UTs", "28 States, 9 UTs", "30 States, 8 UTs"], answer: 0, explanation: "India currently comprises 28 States and 8 Union Territories." }
    ],
    ai: [
        { category: "AI & Modern Tech", question: "What does LLM stand for in artificial intelligence?", options: ["Large Language Model", "Linear Logic Machine", "Linked Layer Memory", "Language Learning Module"], answer: 0, explanation: "Large Language Models power generative AI tools like Gemini, Groq, and ChatGPT." },
        { category: "AI & Modern Tech", question: "Which company developed the Transformer architecture (2017 paper 'Attention is All You Need')?", options: ["Google", "OpenAI", "Meta", "IBM"], answer: 0, explanation: "Google researchers invented the Transformer neural network architecture in 2017." },
        { category: "AI & Modern Tech", question: "What is the primary function of a GPU in deep learning AI model training?", options: ["Parallel Processing of Matrix Math", "Data Compression", "Display Rendering Only", "Sequential File I/O"], answer: 0, explanation: "GPUs excel at massive parallel matrix operations required for AI neural nets." },
        { category: "AI & Modern Tech", question: "Which Indian tech city is known as the 'Silicon Valley of India'?", options: ["Bengaluru", "Hyderabad", "Pune", "Gurugram"], answer: 0, explanation: "Bengaluru is India's leading AI and technology startup hub." },
        { category: "AI & Modern Tech", question: "Which field of AI enables computers to interpret and understand visual images?", options: ["Computer Vision", "Natural Language Processing", "Reinforcement Learning", "Quantum Computing"], answer: 0, explanation: "Computer Vision processes visual inputs like images and live video streams." }
    ],
    history: [
        { category: "World History", question: "Which ancient civilization built the Great Pyramids of Giza?", options: ["Ancient Egyptians", "Mesopotamians", "Mayans", "Romans"], answer: 0, explanation: "The Pyramids of Giza were built in Ancient Egypt during the 4th Dynasty." },
        { category: "World History", question: "In which year did World War II officially end?", options: ["1945", "1942", "1950", "1939"], answer: 0, explanation: "WWII ended in 1945 following the surrender of Axis forces." },
        { category: "World History", question: "Who was the first emperor of the Roman Empire?", options: ["Augustus Caesar", "Julius Caesar", "Nero", "Marcus Aurelius"], answer: 0, explanation: "Augustus Caesar became the first Roman Emperor in 27 BC." },
        { category: "World History", question: "Which historic document was signed in England in 1215 limiting royal power?", options: ["Magna Carta", "Declaration of Independence", "Treaty of Versailles", "Bill of Rights"], answer: 0, explanation: "King John signed the Magna Carta at Runnymede in 1215." },
        { category: "World History", question: "Who led the Salt March (Dandi March) in 1930 against British tax laws?", options: ["Mahatma Gandhi", "Jawaharlal Nehru", "Subhas Chandra Bose", "Bhagat Singh"], answer: 0, explanation: "Mahatma Gandhi led the 240-mile Salt March to Dandi in 1930." }
    ],
    science: [
        { category: "Science & Space", question: "Which planet in our solar system is known as the Red Planet?", options: ["Mars", "Venus", "Jupiter", "Saturn"], answer: 0, explanation: "Mars gets its red color from iron oxide (rust) on its surface." },
        { category: "Science & Space", question: "What is the speed of light in a vacuum?", options: ["~300,000 km/s", "~150,000 km/s", "~1,000,000 km/s", "~30,000 km/s"], answer: 0, explanation: "Light travels at approximately 299,792 kilometers per second." },
        { category: "Science & Space", question: "Which element is the most abundant element in the universe?", options: ["Hydrogen", "Helium", "Oxygen", "Carbon"], answer: 0, explanation: "Hydrogen accounts for roughly 75% of all elemental mass in the universe." },
        { category: "Science & Space", question: "What is the chemical symbol for Gold?", options: ["Au", "Ag", "Fe", "Cu"], answer: 0, explanation: "'Au' comes from the Latin word for gold, 'Aurum'." },
        { category: "Science & Space", question: "Which ISRO mission made India the 1st country to reach Martian orbit on its 1st attempt?", options: ["Mangalyaan (MOM)", "Chandrayaan-1", "Aditya-L1", "Astrosat"], answer: 0, explanation: "ISRO's Mars Orbiter Mission (Mangalyaan) entered Martian orbit in 2014." }
    ],
    cinema: [
        { category: "Cinema & Pop Culture", question: "Which film won 7 Oscars including Best Picture at the 96th Academy Awards (2024)?", options: ["Oppenheimer", "Barbie", "Avatar: The Way of Water", "Dune: Part Two"], answer: 0, explanation: "Christopher Nolan's 'Oppenheimer' swept the 2024 Oscars." },
        { category: "Cinema & Pop Culture", question: "Which song from the movie RRR won the Oscar for Best Original Song in 2023?", options: ["Naatu Naatu", "Jai Ho", "Kesariya", "Sami Sami"], answer: 0, explanation: "'Naatu Naatu' composed by M.M. Keeravani won the historic Oscar." },
        { category: "Cinema & Pop Culture", question: "Who directed the famous Sci-Fi blockbuster movie 'Interstellar'?", options: ["Christopher Nolan", "Steven Spielberg", "James Cameron", "Quentin Tarantino"], answer: 0, explanation: "Christopher Nolan directed Interstellar in 2014." },
        { category: "Cinema & Pop Culture", question: "Which movie holds the record as the highest-grossing film of all time worldwide?", options: ["Avatar", "Avengers: Endgame", "Titanic", "Star Wars: The Force Awakens"], answer: 0, explanation: "James Cameron's 'Avatar' (2009) remains the highest-grossing movie globally." },
        { category: "Cinema & Pop Culture", question: "What is the real name of the iconic Marvel superhero Iron Man?", options: ["Tony Stark", "Bruce Wayne", "Clark Kent", "Peter Parker"], answer: 0, explanation: "Tony Stark is played by Robert Downey Jr. in the Marvel Cinematic Universe." }
    ],
    sports: [
        { category: "Sports & Games", question: "Which country won the ICC Men's T20 World Cup in 2024?", options: ["India", "South Africa", "Australia", "England"], answer: 0, explanation: "India defeated South Africa in Barbados to win the T20 World Cup 2024!" },
        { category: "Sports & Games", question: "How many players are on the field for one team in a standard Cricket match?", options: ["11 Players", "10 Players", "12 Players", "9 Players"], answer: 0, explanation: "Each cricket team fields 11 players during a match." },
        { category: "Sports & Games", question: "Who holds the record for the most Grand Slam singles titles in men's tennis history?", options: ["Novak Djokovic", "Rafael Nadal", "Roger Federer", "Carlos Alcaraz"], answer: 0, explanation: "Novak Djokovic leads men's tennis with 24 Grand Slam titles." },
        { category: "Sports & Games", question: "In football (soccer), how long is a standard professional match excluding extra time?", options: ["90 Minutes", "80 Minutes", "100 Minutes", "60 Minutes"], answer: 0, explanation: "Matches consist of two halves of 45 minutes each." },
        { category: "Sports & Games", question: "Where were the 2024 Summer Olympic Games hosted?", options: ["Paris, France", "Tokyo, Japan", "Los Angeles, USA", "London, UK"], answer: 0, explanation: "The 2024 Olympic Games took place in Paris from July to August 2024." }
    ],
    geography: [
        { category: "Geography & Nature", question: "Which is the largest ocean on Planet Earth?", options: ["Pacific Ocean", "Atlantic Ocean", "Indian Ocean", "Arctic Ocean"], answer: 0, explanation: "The Pacific Ocean covers over 30% of the Earth's total surface area." },
        { category: "Geography & Nature", question: "What is the capital city of Japan?", options: ["Tokyo", "Kyoto", "Osaka", "Sapporo"], answer: 0, explanation: "Tokyo is the bustling capital city of Japan." },
        { category: "Geography & Nature", question: "Which is the highest mountain peak above sea level in the world?", options: ["Mount Everest", "K2", "Kangchenjunga", "Lhotse"], answer: 0, explanation: "Mount Everest in the Himalayas reaches 8,848.86 meters above sea level." },
        { category: "Geography & Nature", question: "Which continent is home to the Amazon Rainforest?", options: ["South America", "Africa", "Asia", "Australia"], answer: 0, explanation: "The Amazon Rainforest spans across South America, primarily in Brazil." },
        { category: "Geography & Nature", question: "Which is the largest hot desert in the world?", options: ["Sahara Desert", "Gobi Desert", "Thar Desert", "Kalahari Desert"], answer: 0, explanation: "The Sahara Desert in North Africa spans over 9 million square kilometers." }
    ],
    coding: [
        { category: "Web & Coding QA", question: "What does HTTP status code 404 signify?", options: ["Not Found", "OK / Success", "Internal Server Error", "Unauthorized"], answer: 0, explanation: "HTTP 404 indicates the requested server URL could not be found." },
        { category: "Web & Coding QA", question: "Which HTML5 tag is used to embed client-side JavaScript code?", options: ["<script>", "<js>", "<code>", "<javascript>"], answer: 0, explanation: "<script> tags execute embedded or external JS code." },
        { category: "Web & Coding QA", question: "In CSS layout, what does flexbox property 'justify-content: center' do?", options: ["Aligns items along main axis center", "Aligns items vertically only", "Sets font alignment", "Sets background color"], answer: 0, explanation: "justify-content aligns flex items horizontally along the primary axis." },
        { category: "Web & Coding QA", question: "What Git command is used to record staged code snapshot changes into local history?", options: ["git commit", "git push", "git pull", "git add"], answer: 0, explanation: "'git commit' saves your staged changes with a descriptive message." },
        { category: "Web & Coding QA", question: "What keyword in JavaScript declares a block-scoped variable that cannot be reassigned?", options: ["const", "let", "var", "static"], answer: 0, explanation: "'const' creates an immutable reference within block scope." }
    ],
    riddles: [
        { category: "Riddles & Logic", question: "What has keys but can't open a single lock?", options: ["A Piano / Keyboard", "A Map", "A Vault", "A Clock"], answer: 0, explanation: "Pianos and computer keyboards have musical/letter keys!" },
        { category: "Riddles & Logic", question: "What gets wetter and wetter the more it dries?", options: ["A Towel", "A Sponge", "Rain", "A River"], answer: 0, explanation: "A towel absorbs moisture while drying your hands!" },
        { category: "Riddles & Logic", question: "What has a neck but no head?", options: ["A Bottle", "A Shirt", "A Guitar", "A Snake"], answer: 0, explanation: "A glass bottle has a narrow neck leading to its opening." },
        { category: "Riddles & Logic", question: "I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?", options: ["An Echo", "A Cloud", "Shadow", "A Kite"], answer: 0, explanation: "An echo bounces sound back across mountains!" },
        { category: "Riddles & Logic", question: "What can travel all around the world while remaining stuck in one corner?", options: ["A Stamp", "A Compass", "A Postcard", "A Airplane"], answer: 0, explanation: "A postage stamp stays stuck in the corner of an envelope!" }
    ]
};

let quizAutoAdvanceTimer = null;

function initQuizGame() {
    const card = document.getElementById('scan-mini-game-card');
    if (!card) return;
    
    // Restore saved score
    const savedScore = localStorage.getItem('quiz_score');
    if (savedScore) {
        quizState.score = parseInt(savedScore, 10) || 0;
        const scoreElem = document.getElementById('quiz-score');
        if (scoreElem) scoreElem.textContent = quizState.score;
    }

    const allModes = ['math', 'india', 'ai', 'history', 'science', 'cinema', 'sports', 'geography', 'coding', 'riddles'];
    allModes.forEach(m => {
        if (!quizState.modeData[m]) {
            quizState.modeData[m] = { q: getRandomQuestionForMode(m), answered: false, selectedIndex: -1 };
        } else if (!quizState.modeData[m].q) {
            quizState.modeData[m].q = getRandomQuestionForMode(m);
        }
    });

    renderActiveModeQuestion();
}

function shuffleQuestionOptions(qObj) {
    if (!qObj || !qObj.options) return qObj;
    
    const correctAnswerText = qObj.options[qObj.answer];
    const shuffledOptions = [...qObj.options];
    
    // Fisher-Yates shuffle options array
    for (let i = shuffledOptions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledOptions[i], shuffledOptions[j]] = [shuffledOptions[j], shuffledOptions[i]];
    }
    
    const newAnswerIndex = shuffledOptions.indexOf(correctAnswerText);
    
    return {
        category: qObj.category,
        question: qObj.question,
        options: shuffledOptions,
        answer: newAnswerIndex,
        explanation: qObj.explanation
    };
}

function getRandomQuestionForMode(mode) {
    if (mode === 'math') {
        return generateMathQuestion();
    }
    const bank = quizBanks[mode] || quizBanks['india'];
    const rawQ = bank[Math.floor(Math.random() * bank.length)];
    return shuffleQuestionOptions(rawQ);
}

function setQuizMode(mode) {
    if (quizState.mode === mode) return;
    quizState.mode = mode;
    
    const allModes = ['math', 'india', 'ai', 'history', 'science', 'cinema', 'sports', 'geography', 'coding', 'riddles'];
    
    allModes.forEach(m => {
        const btn = document.getElementById(`btn-quiz-mode-${m}`);
        if (!btn) return;
        if (m === mode) {
            btn.style.border = '2px solid var(--color-primary)';
            btn.style.background = 'linear-gradient(135deg, rgba(99, 102, 241, 0.35), rgba(168, 85, 247, 0.35))';
            btn.style.color = '#ffffff';
            btn.style.boxShadow = '0 4px 14px rgba(99, 102, 241, 0.4)';
        } else {
            btn.style.border = '2px solid rgba(255, 255, 255, 0.12)';
            btn.style.background = 'rgba(255, 255, 255, 0.05)';
            btn.style.color = 'var(--text-secondary)';
            btn.style.boxShadow = 'none';
        }
    });

    // Smoothly switch to the active question preserved for the selected mode
    const container = document.getElementById('quiz-body-container');
    if (container) {
        container.style.opacity = '0.3';
        setTimeout(() => {
            renderActiveModeQuestion();
            container.style.opacity = '1';
        }, 150);
    } else {
        renderActiveModeQuestion();
    }
}

function generateMathQuestion() {
    const types = ['add', 'sub', 'mul', 'missing'];
    const type = types[Math.floor(Math.random() * types.length)];
    
    let qText = '';
    let correct = 0;
    
    if (type === 'add') {
        const a = Math.floor(Math.random() * 80) + 12;
        const b = Math.floor(Math.random() * 80) + 12;
        qText = `What is ${a} + ${b}?`;
        correct = a + b;
    } else if (type === 'sub') {
        const a = Math.floor(Math.random() * 90) + 30;
        const b = Math.floor(Math.random() * (a - 10)) + 5;
        qText = `What is ${a} - ${b}?`;
        correct = a - b;
    } else if (type === 'mul') {
        const a = Math.floor(Math.random() * 12) + 3;
        const b = Math.floor(Math.random() * 12) + 3;
        qText = `What is ${a} × ${b}?`;
        correct = a * b;
    } else {
        const target = Math.floor(Math.random() * 70) + 30;
        const part = Math.floor(Math.random() * (target - 10)) + 5;
        qText = `Solve: ${part} + ? = ${target}`;
        correct = target - part;
    }

    // Generate 3 unique wrong options
    const optionsSet = new Set([correct]);
    while (optionsSet.size < 4) {
        const delta = (Math.floor(Math.random() * 7) + 1) * (Math.random() > 0.5 ? 1 : -1);
        const wrong = correct + delta;
        if (wrong >= 0) optionsSet.add(wrong);
    }
    
    const options = Array.from(optionsSet);
    // Shuffle options
    for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [options[i], options[j]] = [options[j], options[i]];
    }

    return {
        category: "Speed Math Challenge",
        question: qText,
        options: options.map(String),
        answer: options.indexOf(correct),
        explanation: `Correct answer is ${correct}!`
    };
}

function renderActiveModeQuestion() {
    const container = document.getElementById('quiz-body-container');
    if (!container) return;

    if (quizState.mode === null) {
        container.innerHTML = `
            <div style="padding: 30px 20px; text-align: center;">
                <div style="width: 54px; height: 54px; border-radius: 50%; background: rgba(99, 102, 241, 0.2); border: 1px solid rgba(99, 102, 241, 0.4); display: inline-flex; align-items: center; justify-content: center; color: #818cf8; font-size: 24px; margin-bottom: 12px; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.3);">
                    <i class="fa-solid fa-gamepad"></i>
                </div>
                <h4 style="font-family: var(--font-header); font-size: 18px; font-weight: 600; color: #ffffff; margin-bottom: 6px;">
                    Brain Break Quiz Challenge 🎮
                </h4>
                <p style="font-size: 13.5px; color: var(--text-secondary); max-width: 480px; margin: 0 auto; line-height: 1.5;">
                    👆 Select any of the <strong>10 Game Categories</strong> above to start playing questions while your pages are scanning!
                </p>
            </div>
        `;
        return;
    }

    const currentModeData = quizState.modeData[quizState.mode];
    
    // Ensure question exists for mode
    if (!currentModeData || !currentModeData.q) {
        quizState.modeData[quizState.mode] = {
            q: getRandomQuestionForMode(quizState.mode),
            answered: false,
            selectedIndex: -1
        };
    }

    // Re-create internal layout if coming from null mode prompt
    if (!document.getElementById('quiz-category-tag')) {
        container.innerHTML = `
            <div id="quiz-category-tag" style="display: inline-block; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 12px; background: rgba(168, 85, 247, 0.2); color: #c084fc; margin-bottom: 10px;">
                Speed Math Challenge
            </div>
            <h4 id="quiz-question-text" style="font-family: var(--font-header); font-size: 18px; font-weight: 600; color: #ffffff; margin-bottom: 16px; min-height: 26px;">
            </h4>
            <div id="quiz-options-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; max-width: 650px; margin: 0 auto;">
            </div>
            <div style="display: flex; justify-content: center; align-items: center; gap: 12px; margin-top: 14px; flex-wrap: wrap;">
                <button type="button" id="btn-quiz-skip" onclick="skipQuizQuestion()" style="padding: 6px 18px; border-radius: 20px; font-size: 12px; font-weight: 500; border: 1px solid rgba(255, 255, 255, 0.15); background: rgba(255, 255, 255, 0.08); color: var(--text-secondary); cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(99, 102, 241, 0.2)'; this.style.borderColor='var(--color-primary)';" onmouseout="this.style.background='rgba(255, 255, 255, 0.08)'; this.style.borderColor='rgba(255, 255, 255, 0.15)';">
                    <i class="fa-solid fa-forward"></i> Skip Question ⏭️
                </button>
            </div>
            <div id="quiz-feedback-box" style="display: none; max-width: 580px; margin: 16px auto 0 auto; padding: 12px 18px; border-radius: 10px; font-size: 13px; font-weight: 500; box-shadow: 0 10px 25px rgba(0,0,0,0.5); backdrop-filter: blur(8px); transition: all 0.3s ease; text-align: left;">
            </div>
        `;
    }

    const modeObj = quizState.modeData[quizState.mode];
    const q = modeObj.q;
    const feedbackBox = document.getElementById('quiz-feedback-box');
    
    // Update Tag and Question text
    const tagElem = document.getElementById('quiz-category-tag');
    if (tagElem) tagElem.textContent = q.category;

    const qTextElem = document.getElementById('quiz-question-text');
    if (qTextElem) qTextElem.textContent = q.question;

    const optionsGrid = document.getElementById('quiz-options-grid');
    if (!optionsGrid) return;
    
    optionsGrid.innerHTML = '';
    q.options.forEach((optText, index) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'quiz-opt-btn';
        btn.style.cssText = `
            padding: 12px 16px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            color: #f3f4f6;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            text-align: left;
            transition: background 0.2s, border-color 0.2s;
            display: flex;
            align-items: center;
            gap: 10px;
        `;

        const letter = String.fromCharCode(65 + index);
        btn.innerHTML = `<span style="width: 24px; height: 24px; border-radius: 50%; background: rgba(99, 102, 241, 0.2); color: #818cf8; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center;">${letter}</span> ${optText}`;

        // If this question in this mode was already answered, restore its visual feedback
        if (modeObj.answered) {
            if (index === q.answer) {
                btn.style.background = 'rgba(16, 185, 129, 0.25)';
                btn.style.borderColor = '#10b981';
                btn.style.color = '#34d399';
            } else if (index === modeObj.selectedIndex) {
                btn.style.background = 'rgba(239, 68, 68, 0.25)';
                btn.style.borderColor = '#ef4444';
                btn.style.color = '#f87171';
            }
        } else {
            btn.onmouseover = () => {
                if (!modeObj.answered) {
                    btn.style.borderColor = 'var(--color-primary)';
                    btn.style.background = 'rgba(99, 102, 241, 0.15)';
                }
            };
            btn.onmouseout = () => {
                if (!modeObj.answered) {
                    btn.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    btn.style.background = 'rgba(255, 255, 255, 0.05)';
                }
            };
            btn.onclick = () => selectQuizAnswer(index, btn);
        }

        optionsGrid.appendChild(btn);
    });

    // Render feedback toast if already answered for this mode
    if (modeObj.answered && feedbackBox) {
        const isCorrect = modeObj.selectedIndex === q.answer;
        feedbackBox.style.display = 'flex';
        feedbackBox.style.alignItems = 'center';
        feedbackBox.style.justifyContent = 'space-between';

        if (isCorrect) {
            feedbackBox.style.background = 'rgba(16, 185, 129, 0.18)';
            feedbackBox.style.border = '1px solid rgba(16, 185, 129, 0.4)';
            feedbackBox.style.color = '#34d399';
            feedbackBox.innerHTML = `
                <div style="display: flex; align-items: flex-start; gap: 12px; flex: 1;">
                    <i class="fa-solid fa-circle-check" style="font-size: 16px; margin-top: 2px; color: #34d399; flex-shrink: 0;"></i>
                    <div style="line-height: 1.4;">
                        <strong style="color: #6ee7b7; display: block; margin-bottom: 2px;">Spot On! +10 Points!</strong>
                        <span style="font-size: 12.5px; opacity: 0.95;">${q.explanation}</span>
                    </div>
                </div>
                <button type="button" onclick="closeQuizFeedbackInstant()" style="background: rgba(255, 255, 255, 0.12); border: 1px solid rgba(255, 255, 255, 0.2); color: #f3f4f6; border-radius: 50%; width: 26px; height: 26px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; flex-shrink: 0; margin-left: 14px; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.25)'" onmouseout="this.style.background='rgba(255,255,255,0.12)'" title="Dismiss & Next Question">✕</button>
            `;
        } else {
            feedbackBox.style.background = 'rgba(239, 68, 68, 0.18)';
            feedbackBox.style.border = '1px solid rgba(239, 68, 68, 0.4)';
            feedbackBox.style.color = '#f87171';
            feedbackBox.innerHTML = `
                <div style="display: flex; align-items: flex-start; gap: 12px; flex: 1;">
                    <i class="fa-solid fa-circle-xmark" style="font-size: 16px; margin-top: 2px; color: #f87171; flex-shrink: 0;"></i>
                    <div style="line-height: 1.4;">
                        <strong style="color: #fca5a5; display: block; margin-bottom: 2px;">Incorrect!</strong>
                        <span style="font-size: 12.5px; opacity: 0.95;">${q.explanation}</span>
                    </div>
                </div>
                <button type="button" onclick="closeQuizFeedbackInstant()" style="background: rgba(255, 255, 255, 0.12); border: 1px solid rgba(255, 255, 255, 0.2); color: #f3f4f6; border-radius: 50%; width: 26px; height: 26px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; flex-shrink: 0; margin-left: 14px; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.25)'" onmouseout="this.style.background='rgba(255,255,255,0.12)'" title="Dismiss & Next Question">✕</button>
            `;
        }
    } else if (feedbackBox) {
        feedbackBox.style.display = 'none';
    }
}

function selectQuizAnswer(selectedIndex, clickedBtn) {
    const currentModeData = quizState.modeData[quizState.mode];
    if (currentModeData.answered) return;
    
    currentModeData.answered = true;
    currentModeData.selectedIndex = selectedIndex;

    if (quizAutoAdvanceTimer) {
        clearTimeout(quizAutoAdvanceTimer);
        quizAutoAdvanceTimer = null;
    }

    const q = currentModeData.q;
    const isCorrect = selectedIndex === q.answer;

    if (isCorrect) {
        quizState.score += 10;
    }

    // Update Score
    const scoreElem = document.getElementById('quiz-score');
    if (scoreElem) scoreElem.textContent = quizState.score;
    localStorage.setItem('quiz_score', quizState.score);

    // Re-render UI for current mode
    renderActiveModeQuestion();

    // Auto advance after 3 seconds (3000ms)
    quizAutoAdvanceTimer = setTimeout(() => {
        closeQuizFeedbackInstant();
    }, 3000);
}

function closeQuizFeedbackInstant() {
    if (quizAutoAdvanceTimer) {
        clearTimeout(quizAutoAdvanceTimer);
        quizAutoAdvanceTimer = null;
    }
    
    // Generate a NEW question for the current mode ONLY
    quizState.modeData[quizState.mode] = {
        q: getRandomQuestionForMode(quizState.mode),
        answered: false,
        selectedIndex: -1
    };

    const container = document.getElementById('quiz-body-container');
    if (container) {
        container.style.opacity = '0.3';
        setTimeout(() => {
            renderActiveModeQuestion();
            container.style.opacity = '1';
        }, 150);
    } else {
        renderActiveModeQuestion();
    }
}

function skipQuizQuestion() {
    closeQuizFeedbackInstant();
}

// --- Tech Mind-Booster & Fun Fact Oracle Engine ---
const techFactsBank = [
    {
        category: "🐛 Computing History & Bugs",
        icon: "fa-bug",
        fact: "The first computer bug was an actual real moth found trapped inside a Harvard Mark II computer relay in 1947 by Grace Hopper's team!"
    },
    {
        category: "🚀 Space & ISRO Achievements",
        icon: "fa-rocket",
        fact: "ISRO's Mangalyaan Mars mission cost just $74 million—less than the production budget of the Hollywood movie 'Gravity' ($100M)!"
    },
    {
        category: "☕ Programming Languages",
        icon: "fa-mug-hot",
        fact: "The original name of the Java programming language was 'Oak', named after an oak tree standing outside creator James Gosling's office!"
    },
    {
        category: "📱 Mobile & Web Evolution",
        icon: "fa-icons",
        fact: "In 1999, the first set of 176 emojis was created in Japan by Shigetaka Kurita using a tiny 12×12 pixel grid!"
    },
    {
        category: "🎮 Gaming Milestones",
        icon: "fa-gamepad",
        fact: "The world's first video game, 'Tennis for Two', was created in 1958 by nuclear physicist William Higinbotham on an oscilloscope!"
    },
    {
        category: "🌐 Internet Trivia",
        icon: "fa-globe",
        fact: "The very first website ever created is still online! Launched by Tim Berners-Lee at CERN on August 6, 1991."
    },
    {
        category: "💻 Computer Hardware",
        icon: "fa-hard-drive",
        fact: "In 1956, IBM shipped the first hard disk drive (IBM 305 RAMAC)—it weighed over 1 ton and stored just 5 MB of data!"
    },
    {
        category: "🔑 Password Secrets",
        icon: "fa-key",
        fact: "For 20 years (1962 to 1977), the launch code for US nuclear missiles was set to '00000000' for maximum speed!"
    },
    {
        category: "🇮🇳 Indian Innovation",
        icon: "fa-microchip",
        fact: "Supercomputer PARAM 8000, built by C-DAC in 1991 under Dr. Vijay Bhatkar, made India the 2nd country in the world to possess indigenous supercomputing capability!"
    },
    {
        category: "🤖 Artificial Intelligence",
        icon: "fa-brain",
        fact: "In 1997, IBM's Deep Blue defeated World Chess Champion Garry Kasparov in a 6-game match, marking a historic AI milestone."
    }
];

let lastTechFactIndex = 0;

function revealNextTechFact() {
    const box = document.getElementById('tech-fact-display-box');
    const categoryElem = document.getElementById('fact-category-badge');
    const textElem = document.getElementById('fact-text-elem');
    const iconElem = document.getElementById('fact-icon-elem');

    if (!box || !textElem) return;

    let nextIndex = Math.floor(Math.random() * techFactsBank.length);
    if (nextIndex === lastTechFactIndex) {
        nextIndex = (nextIndex + 1) % techFactsBank.length;
    }
    lastTechFactIndex = nextIndex;

    const factObj = techFactsBank[nextIndex];

    box.style.opacity = '0.3';
    setTimeout(() => {
        if (categoryElem) categoryElem.textContent = factObj.category;
        if (textElem) textElem.textContent = factObj.fact;
        if (iconElem) iconElem.className = `fa-solid ${factObj.icon}`;
        box.style.opacity = '1';
    }, 150);
}

// --- Section 3: World Wonders, Mysteries & Curiosities Engine ---
const worldWondersBank = [
    {
        category: "🏛️ Ancient Engineering & Wonders",
        icon: "fa-landmark-dome",
        wonder: "The Great Pyramid of Giza was constructed with over 2.3 million giant stone blocks fitting together so precisely that a single razor blade cannot pass between them!"
    },
    {
        category: "🌊 Deep Ocean Mysteries",
        icon: "fa-water",
        wonder: "The Mariana Trench is so deep (11,000 meters) that if you placed Mount Everest inside it, the peak would still be covered by over 2 kilometers of ocean water!"
    },
    {
        category: "🍯 Biological Marvels",
        icon: "fa-jar",
        wonder: "Honey never spoils! Archaeologists found 3,000-year-old pots of honey in ancient Egyptian tombs that are still perfectly edible today."
    },
    {
        category: "🐋 Wildlife Records",
        icon: "fa-fish",
        wonder: "A Blue Whale's heart is as large as a small car, weighing nearly 400 pounds, and its heartbeat can be detected underwater from 2 miles away!"
    },
    {
        category: "⚡ Natural Phenomena",
        icon: "fa-bolt-lightning",
        wonder: "Lightning strikes Planet Earth approximately 8.6 million times every single day—that's roughly 100 lightning strikes every second!"
    },
    {
        category: "🧠 Human Brain Secrets",
        icon: "fa-brain",
        wonder: "The human brain generates about 20 watts of electrical power when awake—enough to power a dim LED light bulb!"
    },
    {
        category: "🌲 Global Nature Facts",
        icon: "fa-tree",
        wonder: "There are more trees on Earth (~3 trillion trees) than there are stars in the entire Milky Way galaxy (~100 billion stars)!"
    },
    {
        category: "🌋 Geological Marvels",
        icon: "fa-mountain-sun",
        wonder: "Mount Everest grows about 4 millimeters (0.16 inches) taller every single year due to ongoing continental plate collision!"
    },
    {
        category: "🍌 Unexpected Science",
        icon: "fa-atom",
        wonder: "Bananas are naturally slightly radioactive because they contain high levels of Potassium-40 isotopes!"
    },
    {
        category: "🌌 Space Wonders",
        icon: "fa-meteor",
        wonder: "One day on Venus is longer than one year on Venus! It takes Venus 243 Earth days to rotate once on its axis, but only 225 Earth days to orbit the Sun."
    }
];

let lastWorldWonderIndex = 0;

function revealNextWorldWonder() {
    const box = document.getElementById('world-wonder-display-box');
    const categoryElem = document.getElementById('wonder-category-badge');
    const textElem = document.getElementById('wonder-text-elem');
    const iconElem = document.getElementById('wonder-icon-elem');

    if (!box || !textElem) return;

    let nextIndex = Math.floor(Math.random() * worldWondersBank.length);
    if (nextIndex === lastWorldWonderIndex) {
        nextIndex = (nextIndex + 1) % worldWondersBank.length;
    }
    lastWorldWonderIndex = nextIndex;

    const wonderObj = worldWondersBank[nextIndex];

    box.style.opacity = '0.3';
    setTimeout(() => {
        if (categoryElem) categoryElem.textContent = wonderObj.category;
        if (textElem) textElem.textContent = wonderObj.wonder;
        if (iconElem) iconElem.className = `fa-solid ${wonderObj.icon}`;
        box.style.opacity = '1';
    }, 150);
}

window.setQuizMode = setQuizMode;
window.skipQuizQuestion = skipQuizQuestion;
window.closeQuizFeedbackInstant = closeQuizFeedbackInstant;
window.revealNextTechFact = revealNextTechFact;
window.revealNextWorldWonder = revealNextWorldWonder;
