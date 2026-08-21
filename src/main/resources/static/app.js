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
let quizState = {
    mode: 'math', // 'math' or 'spelling'
    score: 0,
    streak: 0,
    currentQuestion: null,
    answered: false
};

const indiaTriviaBank = [
    // --- India History & Leaders ---
    {
        category: "India History & Leaders",
        question: "Who was the first Prime Minister of independent India?",
        options: ["Jawaharlal Nehru", "Mahatma Gandhi", "Sardar Vallabhbhai Patel", "Dr. B.R. Ambedkar"],
        answer: 0,
        explanation: "Pandit Jawaharlal Nehru served as India's first Prime Minister from 1947 to 1964."
    },
    {
        category: "India History & Leaders",
        question: "Who is known as the 'Missile Man of India'?",
        options: ["Dr. A.P.J. Abdul Kalam", "Dr. Homi Bhabha", "Vikram Sarabhai", "C.V. Raman"],
        answer: 0,
        explanation: "Dr. A.P.J. Abdul Kalam earned the title for his seminal work on ISRO and defence missile technology."
    },
    {
        category: "India History & Leaders",
        question: "Who was the chief architect of the Indian Constitution?",
        options: ["Dr. B.R. Ambedkar", "Dr. Rajendra Prasad", "Subhas Chandra Bose", "Sarojini Naidu"],
        answer: 0,
        explanation: "Dr. B.R. Ambedkar served as the Chairman of the Drafting Committee of the Constitution."
    },
    {
        category: "India History & Leaders",
        question: "In which year did India gain Independence from British rule?",
        options: ["1947", "1950", "1942", "1945"],
        answer: 0,
        explanation: "India achieved independence on August 15, 1947."
    },
    {
        category: "India History & Leaders",
        question: "Who is popularly known as the 'Iron Man of India'?",
        options: ["Sardar Vallabhbhai Patel", "Bhagat Singh", "Lal Bahadur Shastri", "Bal Gangadhar Tilak"],
        answer: 0,
        explanation: "Sardar Vallabhbhai Patel united 565 princely states into the Indian Union."
    },
    {
        category: "India History & Leaders",
        question: "Which city served as the capital of British India before Delhi in 1911?",
        options: ["Calcutta (Kolkata)", "Bombay (Mumbai)", "Madras (Chennai)", "Agra"],
        answer: 0,
        explanation: "Calcutta was the capital of British India until King George V announced moving it to Delhi in 1911."
    },

    // --- AI & Modern Tech ---
    {
        category: "AI & Modern Tech",
        question: "Which ISRO lunar mission made India the first country to land near the Moon's South Pole?",
        options: ["Chandrayaan-3", "Chandrayaan-1", "Mangalyaan", "Aditya-L1"],
        answer: 0,
        explanation: "Chandrayaan-3's Vikram lander successfully touched down near the lunar South Pole on Aug 23, 2023."
    },
    {
        category: "AI & Modern Tech",
        question: "Which Indian city is globally recognized as the 'Silicon Valley of India'?",
        options: ["Bengaluru", "Hyderabad", "Pune", "Gurugram"],
        answer: 0,
        explanation: "Bengaluru is India's premier IT hub and start-up ecosystem capital."
    },
    {
        category: "AI & Modern Tech",
        question: "What does LLM stand for in modern AI technology?",
        options: ["Large Language Model", "Linear Logic Machine", "Linked Layer Memory", "Language Learning Module"],
        answer: 0,
        explanation: "Large Language Models (LLMs) power generative AI systems like Groq, ChatGPT, and Gemini."
    },
    {
        category: "AI & Modern Tech",
        question: "What is the name of C-DAC's premier supercomputer series in India?",
        options: ["PARAM", "SHAKTI", "AGNI", "ARYABHATA"],
        answer: 0,
        explanation: "C-DAC's PARAM supercomputers lead India's national high-performance computing capability."
    },
    {
        category: "AI & Modern Tech",
        question: "Which Indian space observatory mission was launched in 2023 to study the Sun?",
        options: ["Aditya-L1", "Gaganyaan", "Astrosat", "XPoSat"],
        answer: 0,
        explanation: "Aditya-L1 is India's first dedicated solar observatory mission placed at Lagrange Point 1."
    },

    // --- India Heritage & Civics ---
    {
        category: "India Heritage & Civics",
        question: "How many states and Union Territories are there in India currently?",
        options: ["28 States, 8 UTs", "29 States, 7 UTs", "28 States, 9 UTs", "30 States, 8 UTs"],
        answer: 0,
        explanation: "India currently comprises 28 States and 8 Union Territories."
    },
    {
        category: "India Heritage & Civics",
        question: "Which river is the longest river originating and flowing within India?",
        options: ["Ganga", "Godavari", "Yamuna", "Narmada"],
        answer: 0,
        explanation: "The Ganga is the longest river flowing entirely within India (~2,525 km)."
    },
    {
        category: "India Heritage & Civics",
        question: "Which Indian monument in Agra is listed among the Seven Wonders of the World?",
        options: ["Taj Mahal", "Qutub Minar", "Red Fort", "Fatehpur Sikri"],
        answer: 0,
        explanation: "The Taj Mahal, built by Mughal Emperor Shah Jahan, is a UNESCO World Heritage site."
    },
    {
        category: "India Heritage & Civics",
        question: "What is the official currency of India?",
        options: ["Indian Rupee (INR)", "Rupee (PKR)", "Taka", "Rupiah"],
        answer: 0,
        explanation: "The Indian Rupee (₹ / INR) is the official currency regulated by the Reserve Bank of India (RBI)."
    },
    {
        category: "India Heritage & Civics",
        question: "Where is the Supreme Court of India located?",
        options: ["New Delhi", "Mumbai", "Kolkata", "Bengaluru"],
        answer: 0,
        explanation: "The Supreme Court of India is the highest judicial authority located at Tilak Marg, New Delhi."
    }
];

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

    renderNextQuestion();
}

let quizAutoAdvanceTimer = null;

function setQuizMode(mode) {
    if (quizState.mode === mode) return; // Clicking the already active mode does not reset the question
    quizState.mode = mode;
    
    const btnMath = document.getElementById('btn-quiz-mode-math');
    const btnIndia = document.getElementById('btn-quiz-mode-india');
    
    const activeStyle = "padding: 10px 24px; border-radius: 30px; font-size: 13px; font-weight: 600; cursor: pointer; border: 2px solid var(--color-primary); background: linear-gradient(135deg, rgba(99, 102, 241, 0.35), rgba(168, 85, 247, 0.35)); color: #ffffff; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4); transition: all 0.25s ease;";
    const inactiveStyle = "padding: 10px 24px; border-radius: 30px; font-size: 13px; font-weight: 600; cursor: pointer; border: 2px solid rgba(255, 255, 255, 0.12); background: rgba(255, 255, 255, 0.05); color: var(--text-secondary); box-shadow: none; transition: all 0.25s ease;";

    if (mode === 'math') {
        if (btnMath) btnMath.style.cssText = activeStyle;
        if (btnIndia) btnIndia.style.cssText = inactiveStyle;
    } else {
        if (btnIndia) btnIndia.style.cssText = activeStyle;
        if (btnMath) btnMath.style.cssText = inactiveStyle;
    }

    // Immediately load question for the newly selected mode
    renderNextQuestion();
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

function renderNextQuestion() {
    quizState.answered = false;
    const feedbackBox = document.getElementById('quiz-feedback-box');
    if (feedbackBox) feedbackBox.style.display = 'none';

    let q;
    if (quizState.mode === 'math') {
        q = generateMathQuestion();
    } else {
        q = indiaTriviaBank[Math.floor(Math.random() * indiaTriviaBank.length)];
    }
    quizState.currentQuestion = q;

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

        btn.onmouseover = () => {
            if (!quizState.answered) {
                btn.style.borderColor = 'var(--color-primary)';
                btn.style.background = 'rgba(99, 102, 241, 0.15)';
            }
        };
        btn.onmouseout = () => {
            if (!quizState.answered) {
                btn.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                btn.style.background = 'rgba(255, 255, 255, 0.05)';
            }
        };

        btn.onclick = () => selectQuizAnswer(index, btn);
        optionsGrid.appendChild(btn);
    });
}

function selectQuizAnswer(selectedIndex, clickedBtn) {
    if (quizState.answered) return;
    quizState.answered = true;

    if (quizAutoAdvanceTimer) {
        clearTimeout(quizAutoAdvanceTimer);
        quizAutoAdvanceTimer = null;
    }

    const q = quizState.currentQuestion;
    const isCorrect = selectedIndex === q.answer;

    const allBtns = document.querySelectorAll('.quiz-opt-btn');
    const feedbackBox = document.getElementById('quiz-feedback-box');

    if (isCorrect) {
        clickedBtn.style.background = 'rgba(16, 185, 129, 0.25)';
        clickedBtn.style.borderColor = '#10b981';
        clickedBtn.style.color = '#34d399';
        
        quizState.score += 10;

        if (feedbackBox) {
            feedbackBox.style.display = 'flex';
            feedbackBox.style.background = 'rgba(16, 185, 129, 0.15)';
            feedbackBox.style.border = '1px solid rgba(16, 185, 129, 0.3)';
            feedbackBox.style.color = '#34d399';
            feedbackBox.innerHTML = `
                <span><i class="fa-solid fa-circle-check"></i> <strong>Spot On! +10 Points!</strong> ${q.explanation}</span>
                <button type="button" onclick="closeQuizFeedbackInstant()" style="background: rgba(16, 185, 129, 0.3); border: none; color: #34d399; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; flex-shrink: 0;" title="Dismiss & Next Question">✕</button>
            `;
        }
    } else {
        clickedBtn.style.background = 'rgba(239, 68, 68, 0.25)';
        clickedBtn.style.borderColor = '#ef4444';
        clickedBtn.style.color = '#f87171';

        // Highlight correct button
        if (allBtns[q.answer]) {
            allBtns[q.answer].style.background = 'rgba(16, 185, 129, 0.25)';
            allBtns[q.answer].style.borderColor = '#10b981';
            allBtns[q.answer].style.color = '#34d399';
        }

        if (feedbackBox) {
            feedbackBox.style.display = 'flex';
            feedbackBox.style.background = 'rgba(239, 68, 68, 0.15)';
            feedbackBox.style.border = '1px solid rgba(239, 68, 68, 0.3)';
            feedbackBox.style.color = '#f87171';
            feedbackBox.innerHTML = `
                <span><i class="fa-solid fa-circle-xmark"></i> <strong>Incorrect!</strong> ${q.explanation}</span>
                <button type="button" onclick="closeQuizFeedbackInstant()" style="background: rgba(239, 68, 68, 0.3); border: none; color: #f87171; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; flex-shrink: 0;" title="Dismiss & Next Question">✕</button>
            `;
        }
    }

    // Update Score
    const scoreElem = document.getElementById('quiz-score');
    if (scoreElem) scoreElem.textContent = quizState.score;
    localStorage.setItem('quiz_score', quizState.score);

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
    const feedbackBox = document.getElementById('quiz-feedback-box');
    if (feedbackBox) feedbackBox.style.display = 'none';

    const container = document.getElementById('quiz-body-container');
    if (container) {
        container.style.opacity = '0.3';
        setTimeout(() => {
            renderNextQuestion();
            container.style.opacity = '1';
        }, 150);
    } else {
        renderNextQuestion();
    }
}

function skipQuizQuestion() {
    closeQuizFeedbackInstant();
}

window.setQuizMode = setQuizMode;
window.skipQuizQuestion = skipQuizQuestion;
window.closeQuizFeedbackInstant = closeQuizFeedbackInstant;
