// Auto-Checker Admin Panel SPA Engine
document.addEventListener('DOMContentLoaded', () => {
    // Apply saved theme preference instantly
    const savedTheme = localStorage.getItem('admin_theme');
    if (savedTheme === 'light') {
        document.body.classList.remove('dark-mode');
        document.body.classList.add('light-mode');
    } else {
        document.body.classList.add('dark-mode');
        document.body.classList.remove('light-mode');
    }

    // State Variables
    const state = {
        activePane: 'dashboard',
        projects: { page: 0, size: 10, sort: 'id,desc', search: '' },
        scans: { page: 0, size: 10, sort: 'id,desc', search: '', status: '' },
        issues: { page: 0, size: 10, sort: 'id,desc', search: '', source: '', removed: 'false' },
        cache: { page: 0, size: 10, sort: 'id,desc', search: '', decision: '' },
        performance: { page: 0, size: 10, sort: 'id,desc', search: '' },
        currentScanDetailsId: null,
        detPages: { page: 0, size: 5 },
        detIssues: { page: 0, size: 5 },
        charts: {}
    };
    window.state = state;

    // Check Auth Status on startup
    checkAuthStatus(true);
    
    // Bind public Login screen controls
    initLoginControls();
});

let isInitialized = false;

function checkAuthStatus(isStartup = false) {
    fetch('/api/admin/status')
        .then(res => res.json())
        .then(data => {
            if (data.authenticated) {
                showAdminPanel();
                if (!isInitialized) {
                    initTheme();
                    initRouting();
                    initEventListeners();
                    isInitialized = true;
                } else if (isStartup) {
                    const hash = window.location.hash.substring(1) || 'dashboard';
                    showPane(hash);
                }
            } else {
                showLoginScreen();
            }
        })
        .catch(() => {
            showLoginScreen();
        });
}

function showAdminPanel() {
    document.getElementById('login-layout').style.display = 'none';
    document.getElementById('admin-layout').style.display = 'block';
}

function showLoginScreen() {
    document.getElementById('admin-layout').style.display = 'none';
    document.getElementById('login-layout').style.display = 'flex';
    document.getElementById('pin-input').value = '';
    document.getElementById('login-error').style.display = 'none';
}

function initLoginControls() {
    const toggleBtn = document.getElementById('toggle-pin-btn');
    const pinInput = document.getElementById('pin-input');
    
    // Allow only numeric digits
    pinInput.addEventListener('input', () => {
        pinInput.value = pinInput.value.replace(/\D/g, '');
    });

    toggleBtn.addEventListener('click', () => {
        if (pinInput.type === 'password') {
            pinInput.type = 'text';
            toggleBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
        } else {
            pinInput.type = 'password';
            toggleBtn.innerHTML = '<i class="fa-solid fa-eye"></i>';
        }
    });

    const loginForm = document.getElementById('login-form');
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const pin = pinInput.value;
        fetch('/api/admin/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ pin: pin })
        })
        .then(res => res.json())
        .then(data => {
            if (data.authenticated) {
                showAdminPanel();
                if (!isInitialized) {
                    initTheme();
                    initRouting();
                    initEventListeners();
                    isInitialized = true;
                } else {
                    const hash = window.location.hash.substring(1) || 'dashboard';
                    showPane(hash);
                }
            } else {
                document.getElementById('login-error').style.display = 'block';
                pinInput.value = '';
            }
        })
        .catch(() => {
            document.getElementById('login-error').style.display = 'block';
            pinInput.value = '';
        });
    });
}

// Theme Management
function initTheme() {
    const themeBtn = document.getElementById('theme-switch');
    if (!themeBtn) return;
    
    // Sync button icon first
    const body = document.body;
    if (body.classList.contains('light-mode')) {
        themeBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
    } else {
        themeBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
    }

    themeBtn.addEventListener('click', () => {
        if (body.classList.contains('dark-mode')) {
            body.classList.remove('dark-mode');
            body.classList.add('light-mode');
            themeBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
            localStorage.setItem('admin_theme', 'light');
        } else {
            body.classList.remove('light-mode');
            body.classList.add('dark-mode');
            themeBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
            localStorage.setItem('admin_theme', 'dark');
        }
    });
}

// Router
function initRouting() {
    const handleRoute = () => {
        const hash = window.location.hash.substring(1) || 'dashboard';
        
        // Handle nested scan details routing separately
        if (hash.startsWith('scan-details/')) {
            const scanId = hash.split('/')[1];
            showPane('scan-details');
            loadScanDetails(scanId);
            return;
        }

        showPane(hash);
    };

    window.addEventListener('hashchange', handleRoute);
    handleRoute(); // Run once on startup
}

function showPane(paneId) {
    // Toggle active classes on sidebar
    document.querySelectorAll('.nav-item').forEach(item => {
        if (item.getAttribute('data-pane') === paneId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // Toggle active pane on screen
    document.querySelectorAll('.pane').forEach(pane => {
        if (pane.id === `pane-${paneId}`) {
            pane.classList.add('active');
        } else {
            pane.classList.remove('active');
        }
    });

    // Update Title
    const titleMap = {
        'dashboard': 'System Dashboard',
        'projects': 'Projects Directory',
        'scans': 'Scan Runs History',
        'scan-details': 'Scan Execution Detail',
        'issues': 'QA Spelling Issues Log',
        'cache': 'QA Validation Cache',
        'analytics': 'Analytical Insights',
        'performance': 'Scans Performance Metrics',
        'exports': 'System Data Exports'
    };
    document.getElementById('current-page-title').textContent = titleMap[paneId] || 'Admin Panel';

    // Lazy load data for specific panes
    if (paneId === 'dashboard') loadDashboardStats();
    if (paneId === 'projects') loadProjects();
    if (paneId === 'scans') loadScans();
    if (paneId === 'issues') loadIssues();
    if (paneId === 'cache') { loadCacheStats(); loadCache(); }
    if (paneId === 'analytics') loadAnalytics();
    if (paneId === 'performance') loadPerformance();
}

// Global Event Listeners (Pagination, Searching, Sorting)
function initEventListeners() {
    // Global sorting bindings
    document.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const tablePane = th.closest('section').id.replace('pane-', '');
            const field = th.getAttribute('data-sort');
            const currentSort = window.state[tablePane].sort;
            let [prop, dir] = currentSort.split(',');
            
            if (prop === field) {
                dir = dir === 'asc' ? 'desc' : 'asc';
            } else {
                prop = field;
                dir = 'asc';
            }
            
            window.state[tablePane].sort = `${prop},${dir}`;
            window.state[tablePane].page = 0; // reset page

            // Update Sort Indicators Visuals
            th.closest('tr').querySelectorAll('i').forEach(icon => {
                icon.className = 'fa-solid fa-sort';
            });
            const icon = th.querySelector('i');
            icon.className = dir === 'asc' ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down';

            // Reload matching table
            if (tablePane === 'projects') loadProjects();
            if (tablePane === 'scans') loadScans();
            if (tablePane === 'issues') loadIssues();
            if (tablePane === 'cache') loadCache();
        });
    });

    // Global Search bindings
    const bindSearch = (inputId, stateKey, reloadFn) => {
        const input = document.getElementById(inputId);
        let timeout;
        input.addEventListener('input', () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                window.state[stateKey].search = input.value;
                window.state[stateKey].page = 0;
                reloadFn();
            }, 300);
        });
    };
    bindSearch('projects-search', 'projects', loadProjects);
    bindSearch('scans-search', 'scans', loadScans);
    bindSearch('issues-search', 'issues', loadIssues);
    bindSearch('cache-search', 'cache', loadCache);

    // Status Filter bindings
    document.getElementById('scans-status-filter').addEventListener('change', (e) => {
        window.state.scans.status = e.target.value;
        window.state.scans.page = 0;
        loadScans();
    });

    document.getElementById('issues-source-filter').addEventListener('change', (e) => {
        window.state.issues.source = e.target.value;
        window.state.issues.page = 0;
        loadIssues();
    });

    document.getElementById('issues-removed-filter').addEventListener('change', (e) => {
        window.state.issues.removed = e.target.value;
        window.state.issues.page = 0;
        loadIssues();
    });

    document.getElementById('cache-decision-filter').addEventListener('change', (e) => {
        window.state.cache.decision = e.target.value;
        window.state.cache.page = 0;
        loadCache();
    });

    // Cache actions
    document.getElementById('btn-refresh-cache').addEventListener('click', () => {
        loadCacheStats();
        loadCache();
    });

    document.getElementById('btn-clear-cache').addEventListener('click', () => {
        if (confirm('Are you absolutely sure you want to clear the entire spelling validation cache? This will force Groq to re-verify all future candidates.')) {
            fetch('/api/admin/cache/clear', { method: 'POST' })
                .then(res => {
                    if (res.ok) {
                        loadCacheStats();
                        loadCache();
                    } else {
                        alert('Failed to clear cache.');
                    }
                });
        }
    });

    // Back to scans
    document.getElementById('btn-back-to-scans').addEventListener('click', () => {
        window.location.hash = 'scans';
    });

    // Scan Details Tab bar switches
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            
            const tabId = btn.getAttribute('data-tab');
            document.getElementById(`scan-tab-${tabId}`).classList.add('active');
        });
    });

    // Logout Modal bindings
    const logoutModal = document.getElementById('logout-confirm-modal');
    const closeLogout = () => {
        if (logoutModal) logoutModal.classList.remove('active');
    };
    
    document.getElementById('btn-logout').addEventListener('click', () => {
        if (logoutModal) logoutModal.classList.add('active');
    });

    const logoutCloseBtn = document.getElementById('logout-close-btn');
    if (logoutCloseBtn) logoutCloseBtn.addEventListener('click', closeLogout);

    const logoutCancelBtn = document.getElementById('logout-cancel-btn');
    if (logoutCancelBtn) logoutCancelBtn.addEventListener('click', closeLogout);

    const logoutConfirmBtn = document.getElementById('logout-confirm-btn');
    if (logoutConfirmBtn) {
        logoutConfirmBtn.addEventListener('click', () => {
            closeLogout();
            fetch('/api/admin/logout', { method: 'POST' })
                .then(() => {
                    window.location.hash = ''; // clear hash
                    showLoginScreen();
                });
        });
    }

    // Set standard state object on window
    window.state = state;
}

// API Utilities
function fetchApi(url) {
    return fetch(url).then(res => {
        if (res.status === 401) {
            showLoginScreen();
            throw new Error("Unauthorized");
        }
        if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
        return res.json();
    });
}

// 1. Dashboard Loading
function loadDashboardStats() {
    fetchApi('/api/admin/dashboard')
        .then(data => {
            document.getElementById('stat-projects').textContent = data.totalProjects;
            document.getElementById('stat-scans').textContent = data.totalScans;
            document.getElementById('stat-pages').textContent = data.totalPagesCrawled;
            document.getElementById('stat-issues').textContent = data.totalIssues;
            document.getElementById('stat-cache-total').textContent = data.totalCachedWords;
            document.getElementById('stat-cache-unique').textContent = data.uniqueCachedWords;
            document.getElementById('stat-cache-active').textContent = data.totalActiveCacheEntries;
            
            const statusBadge = document.getElementById('stat-latest-status');
            statusBadge.className = `metric-value status-badge ${data.latestScanStatus.toLowerCase()}`;
            statusBadge.textContent = data.latestScanStatus;

            // Format duration
            const secs = data.latestScanDurationSeconds;
            if (secs >= 60) {
                document.getElementById('stat-latest-duration').textContent = `${Math.floor(secs / 60)}m ${secs % 60}s`;
            } else {
                document.getElementById('stat-latest-duration').textContent = `${secs}s`;
            }
        })
        .catch(err => console.error("Error loading dashboard metrics:", err));

    // Dashboard scans list (simple non-paginated preview of last 5)
    fetchApi('/api/admin/scans?size=5&sort=id,desc')
        .then(page => {
            const tbody = document.getElementById('dashboard-scans-table');
            tbody.innerHTML = '';
            page.content.forEach(s => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${s.id}</td>
                    <td><strong>${s.name || 'Unnamed Scan'}</strong></td>
                    <td><span class="text-secondary">${s.url}</span></td>
                    <td><span class="status-badge ${s.status.toLowerCase()}">${s.status}</span></td>
                    <td><strong>${s.totalIssues}</strong></td>
                `;
                tbody.appendChild(tr);
            });
        });
}

// 2. Projects Loading
function loadProjects() {
    const p = window.state.projects;
    fetchApi(`/api/admin/projects?page=${p.page}&size=${p.size}&sort=${p.sort}&search=${encodeURIComponent(p.search)}`)
        .then(page => {
            const tbody = document.getElementById('projects-table-body');
            tbody.innerHTML = '';
            if (page.content.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center">No projects found.</td></tr>';
            }
            page.content.forEach(proj => {
                const tr = document.createElement('tr');
                const websiteUrl = proj.scans && proj.scans.length > 0 ? proj.scans[0].url : 'N/A';
                const urlDisplay = websiteUrl !== 'N/A' ? `<a href="${websiteUrl}" target="_blank" class="table-link">${websiteUrl}</a>` : 'N/A';
                tr.innerHTML = `
                    <td>${proj.id}</td>
                    <td><strong>${proj.name}</strong></td>
                    <td>${urlDisplay}</td>
                    <td>${formatDate(proj.createdAt)}</td>
                `;
                tbody.appendChild(tr);
            });
            renderPagination('projects-pagination', page, 'projects', loadProjects);
        });
}

// 3. Scan History Loading
function loadScans() {
    const s = window.state.scans;
    let url = `/api/admin/scans?page=${s.page}&size=${s.size}&sort=${s.sort}&search=${encodeURIComponent(s.search)}`;
    if (s.status) url += `&status=${s.status}`;
    
    fetchApi(url)
        .then(page => {
            const tbody = document.getElementById('scans-table-body');
            tbody.innerHTML = '';
            if (page.content.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" class="text-center">No scan records found.</td></tr>';
            }
            page.content.forEach(scan => {
                const tr = document.createElement('tr');
                tr.style.cursor = 'pointer';
                tr.addEventListener('click', () => {
                    window.location.hash = `scan-details/${scan.id}`;
                });
                
                tr.innerHTML = `
                    <td>${scan.id}</td>
                    <td><span class="text-secondary">${scan.url}</span></td>
                    <td><span class="status-badge ${scan.status.toLowerCase()}">${scan.status}</span></td>
                    <td>${scan.pagesScanned}</td>
                    <td>${scan.wordsChecked}</td>
                    <td><strong>${scan.totalIssues}</strong></td>
                    <td>${formatDate(scan.startedAt)}</td>
                    <td>${formatDate(scan.endedAt)}</td>
                    <td>${formatDuration(scan.durationSeconds)}</td>
                `;
                tbody.appendChild(tr);
            });
            renderPagination('scans-pagination', page, 'scans', loadScans);
        });
}

// 4. Scan Details Loading
function loadScanDetails(scanId) {
    window.state.currentScanDetailsId = scanId;
    fetchApi(`/api/admin/scans/${scanId}`)
        .then(scan => {
            document.getElementById('det-scan-id').textContent = scan.id;
            document.getElementById('det-project-name').textContent = scan.projectName;
            document.getElementById('det-scan-name').textContent = scan.name || 'Unnamed Scan';
            document.getElementById('det-scan-url').textContent = scan.url;
            
            const badge = document.getElementById('det-scan-status');
            badge.className = `status-badge ${scan.status.toLowerCase()}`;
            badge.textContent = scan.status;

            document.getElementById('det-scan-max-pages').textContent = scan.maxPages || 'Unlimited';
            document.getElementById('det-scan-depth').textContent = scan.crawlDepth || 'Unlimited';
            document.getElementById('det-pages-scanned').textContent = scan.pagesScanned;
            document.getElementById('det-words-checked').textContent = scan.wordsChecked;
            document.getElementById('det-total-issues').textContent = scan.totalIssues;
            document.getElementById('det-duration').textContent = formatDuration(scan.durationSeconds);
            document.getElementById('det-started-at').textContent = formatDate(scan.startedAt);
            document.getElementById('det-ended-at').textContent = formatDate(scan.endedAt);

            // Render breakdown
            const breakdownContainer = document.getElementById('det-breakdown-list');
            breakdownContainer.innerHTML = '';
            const breakdown = scan.issueBreakdown || {};
            const keys = Object.keys(breakdown);
            if (keys.length === 0) {
                breakdownContainer.innerHTML = '<p class="text-secondary text-center">No issues detected.</p>';
            } else {
                const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
                keys.forEach(key => {
                    const count = breakdown[key];
                    const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
                    const item = document.createElement('div');
                    item.className = 'breakdown-bar-item';
                    item.innerHTML = `
                        <div class="breakdown-bar-label">
                            <span>${key}</span>
                            <strong>${count} (${percentage}%)</strong>
                        </div>
                        <div class="breakdown-bar-bg">
                            <div class="breakdown-bar-fill" style="width: ${percentage}%"></div>
                        </div>
                    `;
                    breakdownContainer.appendChild(item);
                });
            }

            // Load sub tabs
            window.state.detPages.page = 0;
            window.state.detIssues.page = 0;
            loadScanDetailsPages();
            loadScanDetailsIssues();
        });
}

function loadScanDetailsPages() {
    const scanId = window.state.currentScanDetailsId;
    const dp = window.state.detPages;
    fetchApi(`/api/admin/pages?scanId=${scanId}&page=${dp.page}&size=${dp.size}`)
        .then(page => {
            const tbody = document.getElementById('det-pages-table-body');
            tbody.innerHTML = '';
            if (page.content.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center">No pages crawled during this scan.</td></tr>';
            }
            page.content.forEach(p => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><span class="text-secondary">${p.url}</span></td>
                    <td><strong>${p.title || 'No Title'}</strong></td>
                    <td><span class="decision-badge valid">${p.statusCode}</span></td>
                    <td>${formatDate(p.timestamp)}</td>
                `;
                tbody.appendChild(tr);
            });
            renderPagination('det-pages-pagination', page, 'detPages', loadScanDetailsPages);
        });
}

function loadScanDetailsIssues() {
    const scanId = window.state.currentScanDetailsId;
    const di = window.state.detIssues;
    fetchApi(`/api/admin/issues?scanId=${scanId}&removed=false&page=${di.page}&size=${di.size}`)
        .then(page => {
            const tbody = document.getElementById('det-issues-table-body');
            tbody.innerHTML = '';
            if (page.content.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="text-center">No spelling issues detected during this scan.</td></tr>';
            }
            page.content.forEach(i => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${i.id}</td>
                    <td><span class="status-badge failed">${i.word}</span></td>
                    <td><span class="text-secondary">${i.suggestedText || 'N/A'}</span></td>
                    <td><span class="text-secondary">${i.pageUrl}</span></td>
                    <td><strong>${i.pageTitle || 'No Title'}</strong></td>
                    <td><span class="decision-badge pending">${i.htmlTag}</span></td>
                    <td><span class="decision-badge valid">${i.detectionSource}</span></td>
                    <td>
                        <button class="btn btn-secondary btn-sm" onclick="removeIssueFromDetails(${i.id})"><i class="fa-solid fa-check"></i> Ignore</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
            renderPagination('det-issues-pagination', page, 'detIssues', loadScanDetailsIssues);
        });
}

window.removeIssueFromDetails = function(issueId) {
    if (confirm("Remove this issue? This ignores it from reports.")) {
        fetch(`/api/admin/issues/${issueId}/remove`, { method: 'POST' })
            .then(res => {
                if (res.ok) {
                    loadScanDetailsIssues();
                    // update counts
                    fetchApi(`/api/admin/scans/${window.state.currentScanDetailsId}`).then(scan => {
                        document.getElementById('det-total-issues').textContent = scan.totalIssues;
                    });
                } else {
                    alert('Failed to remove issue.');
                }
            });
    }
};


// 6. Issues Loading
function loadIssues() {
    const i = window.state.issues;
    let url = `/api/admin/issues?page=${i.page}&size=${i.size}&sort=${i.sort}&search=${encodeURIComponent(i.search)}`;
    if (i.source) url += `&detectionSource=${i.source}`;
    if (i.removed) url += `&removed=${i.removed}`;

    fetchApi(url)
        .then(page => {
            const tbody = document.getElementById('issues-table-body');
            tbody.innerHTML = '';
            if (page.content.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center">No spelling issues matching criteria.</td></tr>';
            }
            
            page.content.forEach(issue => {
                const tr = document.createElement('tr');
                tr.id = `issue-row-${issue.id}`;
                
                // Highlight flagged word in the full sentence
                let highlightedSentence = issue.fullSentence || '';
                if (highlightedSentence && issue.word) {
                    const escapedWord = issue.word.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                    highlightedSentence = highlightedSentence.replace(new RegExp(`(${escapedWord})`, 'gi'), '<strong style="color: var(--danger);">$1</strong>');
                }

                tr.innerHTML = `
                    <td>${issue.id}</td>
                    <td><span class="status-badge failed">${issue.word}</span></td>
                    <td><strong>${issue.suggestedText || 'N/A'}</strong></td>
                    <td><span class="text-secondary">${issue.pageUrl}</span></td>
                    <td><span class="text-secondary">${issue.pageTitle || 'No Title'}</span></td>
                    <td><span class="text-secondary" style="font-style: italic;">"${highlightedSentence}"</span></td>
                    <td>${formatDate(issue.timestamp)}</td>
                `;
                tbody.appendChild(tr);
            });

            renderPagination('issues-pagination', page, 'issues', loadIssues);
        });
}

// 7. Cache Loading
function loadCacheStats() {
    fetchApi('/api/admin/cache/stats')
        .then(stats => {
            document.getElementById('cache-stat-total').textContent = stats.totalEntries;
            document.getElementById('cache-stat-valid').textContent = stats.validDecisions;
            document.getElementById('cache-stat-typos').textContent = stats.typoDecisions;
        });
}

function loadCache() {
    const c = window.state.cache;
    let url = `/api/admin/cache?page=${c.page}&size=${c.size}&sort=${c.sort}&search=${encodeURIComponent(c.search)}`;
    if (c.decision) url += `&decision=${c.decision}`;

    fetchApi(url)
        .then(page => {
            const tbody = document.getElementById('cache-table-body');
            tbody.innerHTML = '';
            if (page.content.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center">No validation cache entries found.</td></tr>';
            }
            page.content.forEach(entry => {
                const decisionClass = entry.decision.toLowerCase();
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${entry.word}</strong></td>
                    <td><strong>${entry.suggestion}</strong></td>
                    <td><span class="decision-badge ${decisionClass}">${entry.decision}</span></td>
                    <td><span class="text-secondary">${entry.reason || 'N/A'}</span></td>
                    <td>${formatDate(entry.createdAt)}</td>
                    <td>
                        <button class="btn btn-danger btn-sm" onclick="deleteCacheEntry(${entry.id})"><i class="fa-solid fa-trash-can"></i> Delete</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
            renderPagination('cache-pagination', page, 'cache', loadCache);
        });
}

window.deleteCacheEntry = function(id) {
    if (confirm("Delete this validation cache entry?")) {
        fetch(`/api/admin/cache/${id}`, { method: 'DELETE' })
            .then(res => {
                if (res.ok) {
                    loadCacheStats();
                    loadCache();
                } else {
                    alert('Failed to delete cache entry.');
                }
            });
    }
};

// 8. Analytics Loading
function loadAnalytics() {
    fetchApi('/api/admin/analytics')
        .then(data => {
            renderScanMetricsCharts(data.scans);
            renderCacheGrowthChart(data.cacheGrowth);
            renderMisspellingsCharts(data.topMisspellings, data.topFlagged);
        })
        .catch(err => console.error("Error loading analytics data:", err));
}

function renderScanMetricsCharts(scans) {
    const labels = scans.map(s => s.name || `Scan #${s.id}`);
    const issuesData = scans.map(s => s.totalIssues);
    const pagesData = scans.map(s => s.pagesScanned);
    const wordsData = scans.map(s => s.wordsChecked);

    // Chart colors
    const primaryAccent = '#6366f1';
    const infoAccent = '#3b82f6';
    const successAccent = '#10b981';

    // 1. Issues per scan
    createChart('chart-issues-per-scan', {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Issues Found',
                data: issuesData,
                backgroundColor: 'rgba(239, 68, 68, 0.45)',
                borderColor: '#ef4444',
                borderWidth: 1.5,
                borderRadius: 4
            }]
        },
        options: getChartOptions('Total Issues')
    });

    // 2. Pages per scan
    createChart('chart-pages-per-scan', {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Pages Crawled',
                data: pagesData,
                backgroundColor: 'rgba(16, 185, 129, 0.45)',
                borderColor: successAccent,
                borderWidth: 1.5,
                borderRadius: 4
            }]
        },
        options: getChartOptions('Pages Crawled')
    });

    // 3. Words per scan
    createChart('chart-words-per-scan', {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Words Checked',
                data: wordsData,
                fill: true,
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderColor: infoAccent,
                tension: 0.3,
                borderWidth: 2,
                pointRadius: 4
            }]
        },
        options: getChartOptions('Words Checked')
    });
}

function renderCacheGrowthChart(growth) {
    const labels = growth.map(g => g.date);
    const countData = growth.map(g => g.count);

    createChart('chart-cache-growth', {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Validation Entries Added',
                data: countData,
                fill: true,
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                borderColor: '#f59e0b',
                tension: 0.2,
                borderWidth: 2,
                pointRadius: 3
            }]
        },
        options: getChartOptions('Added Entries')
    });
}

function renderMisspellingsCharts(typos, flagged) {
    // Top Typos
    createChart('chart-top-misspellings', {
        type: 'bar',
        data: {
            labels: typos.map(t => t.word),
            datasets: [{
                label: 'Mistake Occurrences',
                data: typos.map(t => t.count),
                backgroundColor: 'rgba(239, 68, 68, 0.55)',
                borderColor: '#ef4444',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } },
                y: { grid: { display: false }, ticks: { color: '#9ca3af', font: { weight: 'bold' } } }
            }
        }
    });

    // Top Flagged Words
    createChart('chart-top-flagged', {
        type: 'bar',
        data: {
            labels: flagged.map(f => f.word),
            datasets: [{
                label: 'Flagged Times (All)',
                data: flagged.map(f => f.count),
                backgroundColor: 'rgba(99, 102, 241, 0.55)',
                borderColor: '#6366f1',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } },
                y: { grid: { display: false }, ticks: { color: '#9ca3af', font: { weight: 'bold' } } }
            }
        }
    });
}

function createChart(canvasId, config) {
    // If chart already exists on this canvas, destroy it first
    if (window.state.charts[canvasId]) {
        window.state.charts[canvasId].destroy();
    }
    const ctx = document.getElementById(canvasId).getContext('2d');
    window.state.charts[canvasId] = new Chart(ctx, config);
}

function getChartOptions(yLabel) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false
            }
        },
        scales: {
            x: {
                grid: {
                    color: 'rgba(255, 255, 255, 0.04)'
                },
                ticks: {
                    color: '#9ca3af',
                    maxRotation: 45,
                    minRotation: 0
                }
            },
            y: {
                grid: {
                    color: 'rgba(255, 255, 255, 0.04)'
                },
                ticks: {
                    color: '#9ca3af'
                },
                title: {
                    display: true,
                    text: yLabel,
                    color: '#9ca3af'
                }
            }
        }
    };
}

// 9. Performance Page Loading
function loadPerformance() {
    const p = window.state.performance;
    fetchApi(`/api/admin/scans?page=${p.page}&size=${p.size}&sort=${p.sort}`)
        .then(page => {
            const tbody = document.getElementById('performance-table-body');
            tbody.innerHTML = '';
            if (page.content.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center">No scan history available.</td></tr>';
            }
            page.content.forEach(scan => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>#${scan.id}</strong></td>
                    <td><strong>${scan.name || 'Unnamed Scan'}</strong></td>
                    <td>${formatDate(scan.startedAt)}</td>
                    <td>${formatDate(scan.endedAt)}</td>
                    <td><span class="decision-badge valid">${formatDuration(scan.durationSeconds)}</span></td>
                    <td>${scan.pagesScanned}</td>
                    <td><span class="status-badge failed">${scan.totalIssues}</span></td>
                `;
                tbody.appendChild(tr);
            });
            renderPagination('performance-pagination', page, 'performance', loadPerformance);
        });
}

// Helper: Pagination Component
function renderPagination(containerId, pageData, stateKey, reloadFn) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    if (pageData.totalElements === 0) return;

    // Left info
    const info = document.createElement('div');
    info.className = 'page-info';
    const start = pageData.number * pageData.size + 1;
    const end = Math.min(start + pageData.size - 1, pageData.totalElements);
    info.textContent = `Showing ${start} to ${end} of ${pageData.totalElements} records`;
    container.appendChild(info);

    // Right buttons
    const controls = document.createElement('div');
    controls.className = 'page-controls';

    const createButton = (label, pageNum, disabled, active) => {
        const btn = document.createElement('button');
        btn.className = `page-btn ${disabled ? 'disabled' : ''} ${active ? 'active' : ''}`;
        btn.innerHTML = label;
        if (!disabled) {
            btn.addEventListener('click', () => {
                window.state[stateKey].page = pageNum;
                reloadFn();
            });
        }
        return btn;
    };

    // First & Prev
    controls.appendChild(createButton('<i class="fa-solid fa-angles-left"></i>', 0, pageData.first));
    controls.appendChild(createButton('<i class="fa-solid fa-angle-left"></i>', pageData.number - 1, pageData.first));

    // Page numbers (display max 5 pages around current)
    const totalPages = pageData.totalPages;
    const current = pageData.number;
    let startPage = Math.max(0, current - 2);
    let endPage = Math.min(totalPages - 1, startPage + 4);
    if (endPage - startPage < 4) {
        startPage = Math.max(0, endPage - 4);
    }

    for (let i = startPage; i <= endPage; i++) {
        controls.appendChild(createButton(i + 1, i, false, i === current));
    }

    // Next & Last
    controls.appendChild(createButton('<i class="fa-solid fa-angle-right"></i>', pageData.number + 1, pageData.last));
    controls.appendChild(createButton('<i class="fa-solid fa-angles-right"></i>', totalPages - 1, pageData.last));

    container.appendChild(controls);
}

// Formatting utilities
function formatDate(dateTimeStr) {
    if (!dateTimeStr) return 'N/A';
    try {
        const d = new Date(dateTimeStr);
        if (isNaN(d.getTime())) return dateTimeStr;
        return d.toLocaleString();
    } catch (e) {
        return dateTimeStr;
    }
}

function formatDuration(seconds) {
    if (seconds == null || isNaN(seconds)) return '0s';
    if (seconds >= 3600) {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return `${hrs}h ${mins}m`;
    }
    if (seconds >= 60) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}m ${secs}s`;
    }
    return `${seconds}s`;
}
