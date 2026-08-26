// Auto-Checker Admin Panel SPA Engine
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

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
        projects: { page: 0, size: 10, sort: 'id,desc', search: '', fromDate: '', toDate: '' },
        scans: { page: 0, size: 10, sort: 'id,desc', search: '', status: '' },
        issues: { page: 0, size: 10, sort: 'id,desc', search: '', source: '', removed: 'false' },
        cache: { page: 0, size: 10, sort: 'id,desc', search: '', decision: '' },
        performance: { page: 0, size: 10, sort: 'id,desc', search: '' },
        currentScanDetailsId: null,
        detPages: { page: 0, size: 5 },
        detIssues: { page: 0, size: 5 },
        charts: {},
        dictionaries: { global: [], user: [] },
        settings: {},
        logEventSource: null,
        metricsInterval: null,
        liveScanInterval: null,
        autoRefreshInterval: null
    };
    window.state = state;

    // Check Auth Status on startup
    checkAuthStatus(true);
    
    // Bind public Login screen controls
    initLoginControls();
});

let isInitialized = false;

// Toast Notification System for Admin Panel
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

// Override native window.alert globally to guarantee no "localhost says" popups anywhere
window.nativeAlert = window.alert;
window.alert = function(msg) {
    showToast(msg, 'info');
};

let adminDialogResolve = null;

function showAdminAlert(message, title = "Notification", iconClass = "fa-solid fa-circle-info") {
    return new Promise((resolve) => {
        const modal = document.getElementById('admin-custom-dialog-modal');
        if (!modal) {
            showToast(message, 'info', title);
            resolve(true);
            return;
        }
        document.getElementById('admin-dialog-title').textContent = title;
        document.getElementById('admin-dialog-message').textContent = message;
        document.getElementById('admin-dialog-icon').className = iconClass;
        
        const cancelBtn = document.getElementById('admin-dialog-cancel-btn');
        const okBtn = document.getElementById('admin-dialog-ok-btn');
        
        cancelBtn.style.display = 'none';
        okBtn.textContent = 'OK';
        okBtn.className = 'btn btn-primary btn-sm';
        
        modal.style.display = 'flex';
        modal.classList.add('active');
        
        adminDialogResolve = resolve;
    });
}

function showAdminConfirm(message, title = "Confirmation Required", iconClass = "fa-solid fa-triangle-exclamation") {
    return new Promise((resolve) => {
        const modal = document.getElementById('admin-custom-dialog-modal');
        if (!modal) {
            showToast(message, 'warning', title);
            resolve(true);
            return;
        }
        document.getElementById('admin-dialog-title').textContent = title;
        document.getElementById('admin-dialog-message').textContent = message;
        document.getElementById('admin-dialog-icon').className = iconClass;
        
        const cancelBtn = document.getElementById('admin-dialog-cancel-btn');
        const okBtn = document.getElementById('admin-dialog-ok-btn');
        
        cancelBtn.style.display = 'inline-flex';
        cancelBtn.textContent = 'Cancel';
        okBtn.textContent = 'Yes, Proceed';
        okBtn.className = 'btn btn-danger btn-sm';
        
        modal.style.display = 'flex';
        modal.classList.add('active');
        
        adminDialogResolve = resolve;
    });
}

function closeAdminDialog(result) {
    const modal = document.getElementById('admin-custom-dialog-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
    if (adminDialogResolve) {
        adminDialogResolve(result);
        adminDialogResolve = null;
    }
}
window.closeAdminDialog = closeAdminDialog;

let adminPromptResolve = null;

function showAdminPrompt(message, title = "Security Verification Required", placeholder = "••••", isPassword = true) {
    return new Promise((resolve) => {
        const modal = document.getElementById('admin-custom-prompt-modal');
        if (!modal) {
            const res = window.nativePrompt ? window.nativePrompt(message) : null;
            resolve(res);
            return;
        }
        document.getElementById('admin-prompt-title').textContent = title;
        document.getElementById('admin-prompt-message').textContent = message;
        
        const errElem = document.getElementById('admin-prompt-error');
        if (errElem) errElem.style.display = 'none';

        const input = document.getElementById('admin-prompt-input');
        input.type = isPassword ? 'password' : 'text';
        input.placeholder = placeholder;
        input.value = '';
        
        modal.style.display = 'flex';
        modal.classList.add('active');
        
        setTimeout(() => input.focus(), 100);
        
        adminPromptResolve = resolve;
    });
}

function closeAdminPrompt(value) {
    const modal = document.getElementById('admin-custom-prompt-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
    if (adminPromptResolve) {
        adminPromptResolve(value);
        adminPromptResolve = null;
    }
}
window.closeAdminPrompt = closeAdminPrompt;

// Global override of native window.prompt to prevent native browser popups
window.nativePrompt = window.prompt;
window.prompt = function(msg) {
    showAdminPrompt(msg);
    return null;
};

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
    startLiveScanTimer();
    startAutoRefreshPolling();
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
    
    // Sync button icon & text first
    const body = document.body;
    if (body.classList.contains('light-mode')) {
        themeBtn.innerHTML = '<i class="fa-solid fa-moon" style="color: #6366f1;"></i> Dark Theme';
        themeBtn.title = 'Switch to Dark Theme';
    } else {
        themeBtn.innerHTML = '<i class="fa-regular fa-sun" style="color: #f59e0b;"></i> Light Theme';
        themeBtn.title = 'Switch to Light Theme';
    }

    themeBtn.addEventListener('click', () => {
        if (body.classList.contains('dark-mode')) {
            body.classList.remove('dark-mode');
            body.classList.add('light-mode');
            themeBtn.innerHTML = '<i class="fa-solid fa-moon" style="color: #6366f1;"></i> Dark Theme';
            themeBtn.title = 'Switch to Dark Theme';
            localStorage.setItem('admin_theme', 'light');
        } else {
            body.classList.remove('light-mode');
            body.classList.add('dark-mode');
            themeBtn.innerHTML = '<i class="fa-regular fa-sun" style="color: #f59e0b;"></i> Light Theme';
            themeBtn.title = 'Switch to Light Theme';
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
        'dashboard': 'Dashboard',
        'projects': 'Projects Directory',
        'scans': 'Scan Runs History',
        'scan-details': 'Scan Execution Detail',
        'issues': 'QA Spelling Issues Log',
        'cache': 'QA Validation Cache',
        'analytics': 'Analytical Insights',
        'performance': 'Scans Performance Metrics',
        'exports': 'System Data Exports',
        'dictionaries': 'Custom Whitelist Dictionaries',
        'widgets': 'Widget & Game Controls',
        'footer': 'Footer System Management',
        'settings': 'System Configurations',
        'profile': 'Edit Profile'
    };
    document.getElementById('current-page-title').textContent = titleMap[paneId] || 'Admin Panel';

    if (paneId === 'widgets') {
        loadAdminWidgetSettings();
    } else if (paneId === 'footer') {
        loadAdminFooterSettings();
    }

    // Teardown log stream when leaving details
    if (paneId !== 'scan-details') {
        closeLiveLogStream();
    }

    // Teardown metrics polling when leaving settings
    if (paneId !== 'settings') {
        stopMetricsPolling();
    } else {
        // Force reset sub-tab view on enter
        const btnTabConfig = document.getElementById('btn-tab-config');
        if (btnTabConfig) {
            document.querySelectorAll('#pane-settings .tab-btn').forEach(b => b.classList.remove('active'));
            btnTabConfig.classList.add('active');
            document.getElementById('settings-tab-config').style.display = 'block';
            document.getElementById('settings-tab-metrics').style.display = 'none';
        }
    }

    // Lazy load data for specific panes
    if (paneId === 'dashboard') loadDashboardStats();
    if (paneId === 'projects') loadProjects();
    if (paneId === 'scans') loadScans();
    if (paneId === 'issues') loadIssues();
    if (paneId === 'cache') { loadCacheStats(); loadCache(); }
    if (paneId === 'analytics') loadAnalytics();
    if (paneId === 'performance') loadPerformance();
    if (paneId === 'dictionaries') loadDictionaries();
    if (paneId === 'settings') loadSettings();
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

    // Projects Filter Bindings
    document.getElementById('projects-from-date').addEventListener('change', (e) => {
        window.state.projects.fromDate = e.target.value;
        window.state.projects.page = 0;
        loadProjects();
    });

    document.getElementById('projects-to-date').addEventListener('change', (e) => {
        window.state.projects.toDate = e.target.value;
        window.state.projects.page = 0;
        loadProjects();
    });

    document.getElementById('btn-clear-projects-filter').addEventListener('click', () => {
        document.getElementById('projects-search').value = '';
        document.getElementById('projects-from-date').value = '';
        document.getElementById('projects-to-date').value = '';
        window.state.projects.search = '';
        window.state.projects.fromDate = '';
        window.state.projects.toDate = '';
        window.state.projects.page = 0;
        loadProjects();
    });

    // Cache actions
    document.getElementById('btn-refresh-cache').addEventListener('click', () => {
        loadCacheStats();
        loadCache();
    });

    document.getElementById('btn-clear-cache').addEventListener('click', async () => {
        const confirmed = await showAdminConfirm('Are you absolutely sure you want to clear the entire spelling validation cache? This will force Groq to re-verify all future candidates.', 'Clear Validation Cache?', 'fa-solid fa-database');
        if (confirmed) {
            fetch('/api/admin/cache/clear', { method: 'POST' })
                .then(res => {
                    if (res.ok) {
                        showToast('Validation cache cleared successfully.', 'success', 'Cache Cleared');
                        loadCacheStats();
                        loadCache();
                    } else {
                        showToast('Failed to clear cache.', 'error', 'Cache Error');
                    }
                })
                .catch(() => showToast('Error clearing cache.', 'error'));
        }
    });

    // Back to scans
    document.getElementById('btn-back-to-scans').addEventListener('click', () => {
        window.location.hash = 'scans';
    });

    // Scan Details Tab bar switches
    document.querySelectorAll('#pane-scan-details .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#pane-scan-details .tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('#pane-scan-details .tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            
            const tabId = btn.getAttribute('data-tab');
            document.getElementById(`scan-tab-${tabId}`).classList.add('active');
        });
    });

    // Settings Tab bar switches
    document.querySelectorAll('#pane-settings .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#pane-settings .tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const tabId = btn.getAttribute('data-tab');
            document.getElementById(`settings-tab-${tabId}`).style.display = 'block';
            
            const otherTab = tabId === 'config' ? 'metrics' : 'config';
            document.getElementById(`settings-tab-${otherTab}`).style.display = 'none';

            if (tabId === 'metrics') {
                loadGroqMetrics();
                startMetricsPolling();
            } else {
                stopMetricsPolling();
            }
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

    // Profile image upload handling
    const imgInput = document.getElementById('profile-image-input');
    if (imgInput) {
        imgInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (file.size > 5 * 1024 * 1024) {
                showToast('File size exceeds 5MB limit.', 'error', 'Upload Error');
                return;
            }

            // Local instant preview
            const reader = new FileReader();
            reader.onload = (event) => {
                const editImg = document.getElementById('edit-profile-img');
                const editDefaultIcon = document.getElementById('edit-profile-default-icon');
                if (editImg) {
                    editImg.src = event.target.result;
                    editImg.style.display = 'block';
                }
                if (editDefaultIcon) editDefaultIcon.style.display = 'none';
            };
            reader.readAsDataURL(file);

            // Upload via fetch
            const formData = new FormData();
            formData.append('file', file);

            fetch('/api/admin/profile/image', {
                method: 'POST',
                body: formData
            })
            .then(res => {
                if (res.ok) {
                    showToast('Profile image updated successfully.', 'success', 'Profile Updated');
                    // Force refresh all profile image instances on page with cache buster
                    const timestamp = new Date().getTime();
                    
                    const loginImg = document.getElementById('login-profile-img');
                    const loginDefaultIcon = document.getElementById('login-default-icon');
                    if (loginImg) {
                        loginImg.src = `/api/admin/profile/image?t=${timestamp}`;
                        loginImg.style.display = 'block';
                    }
                    if (loginDefaultIcon) loginDefaultIcon.style.display = 'none';
                    
                    const editImg = document.getElementById('edit-profile-img');
                    if (editImg) {
                        editImg.src = `/api/admin/profile/image?t=${timestamp}`;
                    }

                    const topbarImg = document.getElementById('topbar-profile-img');
                    const topbarDefaultIcon = document.getElementById('topbar-profile-default-icon');
                    if (topbarImg) {
                        topbarImg.src = `/api/admin/profile/image?t=${timestamp}`;
                        topbarImg.style.display = 'block';
                    }
                    if (topbarDefaultIcon) topbarDefaultIcon.style.display = 'none';
                } else {
                    showToast('Failed to upload profile image.', 'error', 'Upload Error');
                }
            })
            .catch(err => {
                console.error('Error uploading profile image:', err);
                showToast('Error uploading profile image.', 'error', 'Upload Error');
            });
        });
    }

    // Cancel Scan binding
    const btnCancelScan = document.getElementById('btn-cancel-scan');
    if (btnCancelScan) {
        btnCancelScan.addEventListener('click', async () => {
            const scanId = window.state.currentScanDetailsId;
            if (!scanId) return;
            const confirmed = await showAdminConfirm(`Are you sure you want to cancel the active scan #${scanId}?`, 'Cancel Scan?', 'fa-solid fa-stop');
            if (confirmed) {
                fetch(`/api/admin/scans/${scanId}/cancel`, { method: 'POST' })
                    .then(res => {
                        if (res.ok) {
                            showToast('Scan cancellation request sent.', 'info', 'Scan Cancelled');
                            loadScanDetails(scanId);
                        } else {
                            showToast('Failed to send cancellation request.', 'error', 'Cancellation Error');
                        }
                    })
                    .catch(err => {
                        console.error('Error canceling scan:', err);
                        showToast('Error cancelling scan.', 'error');
                    });
            }
        });
    }

    // Dictionaries Add buttons binding
    const btnGlobalAdd = document.getElementById('btn-global-dict-add');
    const inputGlobal = document.getElementById('global-dict-input');
    if (btnGlobalAdd && inputGlobal) {
        btnGlobalAdd.addEventListener('click', () => {
            const word = inputGlobal.value.trim();
            if (!word) return;
            addDictionaryWord('global', word, () => {
                inputGlobal.value = '';
                loadDictionaries();
            });
        });
        inputGlobal.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') btnGlobalAdd.click();
        });
    }

    const btnUserAdd = document.getElementById('btn-user-dict-add');
    const inputUser = document.getElementById('user-dict-input');
    if (btnUserAdd && inputUser) {
        btnUserAdd.addEventListener('click', () => {
            const word = inputUser.value.trim();
            if (!word) return;
            addDictionaryWord('user', word, () => {
                inputUser.value = '';
                loadDictionaries();
            });
        });
        inputUser.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') btnUserAdd.click();
        });
    }

    // Settings form controls
    const settingsForm = document.getElementById('settings-form');
    if (settingsForm) {
        settingsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const apiKeyInput = document.getElementById('settings-groq-key');
            const specialKeyInput = document.getElementById('settings-special-key');
            const initialVal = apiKeyInput.dataset.initial || '';
            const config = {
                groqApiKey: apiKeyInput.value === initialVal ? '••••••••••••••••' : apiKeyInput.value,
                specialKey: specialKeyInput ? specialKeyInput.value : '',
                groqModel: (() => {
                    const sel = document.getElementById('settings-groq-model-select').value;
                    return sel === 'custom' ? document.getElementById('settings-groq-model-custom').value.trim() : sel;
                })(),
                groqBatchSize: parseInt(document.getElementById('settings-groq-batch').value) || 50,
                crawlerParallelEnabled: document.getElementById('settings-crawler-parallel').checked,
                crawlerParallelWorkers: parseInt(document.getElementById('settings-crawler-workers').value) || 15
            };
            
            fetch('/api/admin/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            })
            .then(async res => {
                if (res.ok) {
                    showToast('Configurations saved successfully.', 'success', 'Settings Saved');
                    loadSettings();
                } else {
                    const errMsg = await res.text();
                    showToast(errMsg || 'Failed to save settings.', 'error', 'Settings Error');
                }
            })
            .catch(err => {
                console.error('Error saving configurations:', err);
                showToast('Error saving configurations.', 'error');
            });
        });
    }

    const btnSettingsReset = document.getElementById('btn-settings-reset');
    if (btnSettingsReset) {
        btnSettingsReset.addEventListener('click', () => {
            loadSettings();
        });
    }

    const btnMetricsReset = document.getElementById('btn-metrics-reset');
    if (btnMetricsReset) {
        btnMetricsReset.addEventListener('click', async () => {
            let validPin = null;

            while (true) {
                const pin = await showAdminPrompt(
                    'Enter System Security PIN (Special Key) to authorize statistics reset:',
                    'Security PIN Authorization',
                    '••••',
                    true
                );
                
                if (!pin) return; // User cancelled or closed

                // Validate PIN with backend before showing confirmation modal
                try {
                    const res = await fetch('/api/admin/verify-pin', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ pin: pin })
                    });

                    if (res.ok) {
                        validPin = pin;
                        break; // Correct PIN! Proceed to confirmation
                    } else {
                        // Invalid PIN! Show Toast & inline error and stay on PIN step
                        showToast('Invalid Security PIN. Please try again.', 'error', 'Invalid PIN');
                        const errElem = document.getElementById('admin-prompt-error');
                        if (errElem) errElem.style.display = 'block';
                    }
                } catch (err) {
                    showToast('Connection error verifying PIN.', 'error');
                    return;
                }
            }

            // Only show confirmation modal after PIN is successfully verified
            if (validPin) {
                const confirmed = await showAdminConfirm('Are you sure you want to reset all Groq API metrics and cost statistics back to zero?', 'Reset API Metrics?', 'fa-solid fa-rotate-left');
                if (confirmed) {
                    fetch('/api/admin/metrics/groq/reset', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ specialKey: validPin })
                    })
                    .then(async res => {
                        if (res.ok) {
                            showToast('Statistics reset successfully.', 'success', 'Metrics Reset');
                            loadGroqMetrics();
                        } else {
                            const errMsg = await res.text();
                            showToast(errMsg || 'Failed to reset statistics.', 'error', 'Reset Failed');
                        }
                    })
                    .catch(err => console.error('Error resetting metrics:', err));
                }
            }
        });
    }

    const checkboxParallel = document.getElementById('settings-crawler-parallel');
    if (checkboxParallel) {
        checkboxParallel.addEventListener('change', (e) => {
            const group = document.getElementById('crawler-workers-group');
            if (group) {
                group.style.display = e.target.checked ? 'flex' : 'none';
            }
        });
    }

    const modelSelect = document.getElementById('settings-groq-model-select');
    if (modelSelect) {
        modelSelect.addEventListener('change', (e) => {
            const customInput = document.getElementById('settings-groq-model-custom');
            if (customInput) {
                customInput.style.display = e.target.value === 'custom' ? 'block' : 'none';
                if (e.target.value === 'custom') {
                    customInput.focus();
                }
            }
        });
    }

    const groqKeyInput = document.getElementById('settings-groq-key');
    if (groqKeyInput) {
        groqKeyInput.addEventListener('input', (e) => {
            const specGroup = document.getElementById('settings-special-key-group');
            if (specGroup) {
                const val = e.target.value;
                const initialVal = e.target.dataset.initial || '';
                if (val !== initialVal) {
                    specGroup.style.display = 'flex';
                } else {
                    specGroup.style.display = 'none';
                }
            }
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

            // Format duration card with live ticking support
            const durationElem = document.getElementById('stat-latest-duration');
            if (durationElem) {
                durationElem.className = 'metric-value scan-duration-cell';
                durationElem.setAttribute('data-status', data.latestScanStatus);
                durationElem.setAttribute('data-initial-secs', data.latestScanDurationSeconds || 0);
                durationElem.setAttribute('data-render-time', Date.now());
                durationElem.textContent = formatDuration(data.latestScanDurationSeconds);
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
                tr.style.cursor = 'pointer';
                tr.addEventListener('click', () => {
                    window.location.hash = `scan-details/${s.id}`;
                });
                const scanUrl = s.url || '';
                const scanLink = scanUrl.startsWith('http') ? scanUrl : (scanUrl ? 'http://' + scanUrl : '#');
                const urlDisplay = scanUrl ? `<a href="${scanLink}" target="_blank" onclick="event.stopPropagation();" style="color: #38bdf8; font-weight: 600; text-decoration: underline; display: inline-flex; align-items: center; gap: 4px;">${escapeHtml(scanUrl)} <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 11px;"></i></a>` : 'N/A';

                tr.innerHTML = `
                    <td>${s.id}</td>
                    <td><strong>${escapeHtml(s.projectName || s.name || 'Unnamed Project')}</strong></td>
                    <td>${urlDisplay}</td>
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
    fetchApi(`/api/admin/projects?page=${p.page}&size=${p.size}&sort=${p.sort}&search=${encodeURIComponent(p.search)}&fromDate=${p.fromDate || ''}&toDate=${p.toDate || ''}`)
        .then(page => {
            const tbody = document.getElementById('projects-table-body');
            tbody.innerHTML = '';
            if (page.content.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center">No projects found.</td></tr>';
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
                    <td style="text-align: center;">
                        <button class="btn-danger btn-delete-project" data-id="${proj.id}" style="padding: 6px 10px; border-radius: var(--radius-sm); font-size: 0.75rem; border: none; cursor: pointer; background: var(--danger); color: white; transition: background 0.2s;"><i class="fa-solid fa-trash"></i> Delete</button>
                    </td>
                `;

                tr.querySelector('.btn-delete-project').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const confirmed = await showAdminConfirm(`Are you sure you want to delete project "${proj.name}"? This will permanently delete all scans and issues for this project.`, 'Delete Project?', 'fa-solid fa-trash-can');
                    if (confirmed) {
                        fetch(`/api/admin/projects/${proj.id}`, { method: 'DELETE' })
                            .then(res => {
                                if (res.ok) {
                                    showToast(`Project "${proj.name}" deleted successfully.`, 'success', 'Project Deleted');
                                    loadProjects();
                                } else {
                                    showToast('Failed to delete project.', 'error', 'Delete Error');
                                }
                            })
                            .catch(err => {
                                console.error('Error deleting project:', err);
                                showToast('Error deleting project.', 'error');
                            });
                    }
                });

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
                const scanUrl = scan.url || '';
                const scanLink = scanUrl.startsWith('http') ? scanUrl : (scanUrl ? 'http://' + scanUrl : '#');
                const urlDisplay = scanUrl ? `<a href="${scanLink}" target="_blank" onclick="event.stopPropagation();" style="color: #38bdf8; font-weight: 600; text-decoration: underline; display: inline-flex; align-items: center; gap: 4px;">${escapeHtml(scanUrl)} <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 11px;"></i></a>` : 'N/A';
                
                tr.innerHTML = `
                    <td>${scan.id}</td>
                    <td>${urlDisplay}</td>
                    <td><span class="status-badge ${scan.status.toLowerCase()}">${scan.status}</span></td>
                    <td>${scan.pagesScanned}</td>
                    <td>${scan.wordsChecked}</td>
                    <td><strong>${scan.totalIssues}</strong></td>
                    <td>${formatDate(scan.startedAt)}</td>
                    <td>${formatDate(scan.endedAt)}</td>
                    <td class="scan-duration-cell" data-status="${scan.status}" data-initial-secs="${scan.durationSeconds || 0}" data-render-time="${Date.now()}">${formatDuration(scan.durationSeconds)}</td>
                `;
                tbody.appendChild(tr);
            });
            renderPagination('scans-pagination', page, 'scans', loadScans);
        });
}

// 4. Scan Details Loading
function loadScanDetails(scanId) {
    const isSameScan = window.state.currentScanDetailsId === scanId;
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
            
            const detDurationElem = document.getElementById('det-duration');
            if (detDurationElem) {
                detDurationElem.className = 'scan-duration-cell';
                detDurationElem.setAttribute('data-status', scan.status);
                detDurationElem.setAttribute('data-initial-secs', scan.durationSeconds || 0);
                detDurationElem.setAttribute('data-render-time', Date.now());
                detDurationElem.textContent = formatDuration(scan.durationSeconds);
            }

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

            // Control cancel button & logs stream visibility
            const isRunning = scan.status === 'RUNNING' || scan.status === 'PENDING';
            const btnCancel = document.getElementById('btn-cancel-scan');
            if (btnCancel) btnCancel.style.display = isRunning ? 'inline-block' : 'none';

            const tabLogs = document.getElementById('tab-btn-live-logs');
            if (tabLogs) tabLogs.style.display = isRunning ? 'inline-block' : 'none';

            if (isRunning) {
                startLiveLogStream(scanId);
            } else {
                closeLiveLogStream();
            }

            // Load sub tabs
            if (!isSameScan) {
                window.state.detPages.page = 0;
                window.state.detIssues.page = 0;
            }
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
                    <td><a href="${p.url}" target="_blank" class="table-link">${p.url}</a></td>
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
                    <td><a href="${i.pageUrl}" target="_blank" class="table-link">${i.pageUrl}</a></td>
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

window.removeIssueFromDetails = async function(issueId) {
    const confirmed = await showAdminConfirm("Remove this issue? This ignores it from reports.", "Remove Issue?", "fa-solid fa-eye-slash");
    if (confirmed) {
        fetch(`/api/admin/issues/${issueId}/remove`, { method: 'POST' })
            .then(res => {
                if (res.ok) {
                    showToast("Issue removed successfully.", "success", "Issue Ignored");
                    loadScanDetailsIssues();
                    // update counts
                    fetchApi(`/api/admin/scans/${window.state.currentScanDetailsId}`).then(scan => {
                        document.getElementById('det-total-issues').textContent = scan.totalIssues;
                    });
                } else {
                    showToast('Failed to remove issue.', 'error', 'Remove Error');
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

                // Format pageUrl HTML (single link or primary link + badge for multi-page occurrences)
                let pageUrlHtml = '';
                if (issue.pageUrl) {
                    const urls = issue.pageUrl.split(',').map(u => u.trim()).filter(Boolean);
                    if (urls.length === 1) {
                        pageUrlHtml = `<a href="${urls[0]}" target="_blank" class="table-link">${urls[0]}</a>`;
                    } else if (urls.length > 1) {
                        const firstUrl = urls[0];
                        const extraCount = urls.length - 1;
                        pageUrlHtml = `<a href="${firstUrl}" target="_blank" class="table-link">${firstUrl}</a> <span class="status-badge" style="background: rgba(99, 102, 241, 0.15); color: #a5b4fc; font-size: 11px; margin-left: 4px; cursor: help;" title="Also found on:\n${urls.join('\n')}">+${extraCount} page${extraCount > 1 ? 's' : ''}</span>`;
                    }
                } else {
                    pageUrlHtml = '<span class="text-secondary">N/A</span>';
                }

                tr.innerHTML = `
                    <td>${issue.id}</td>
                    <td><span class="status-badge failed">${issue.word}</span></td>
                    <td><strong>${issue.suggestedText || 'N/A'}</strong></td>
                    <td>${pageUrlHtml}</td>
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

window.deleteCacheEntry = async function(id) {
    const confirmed = await showAdminConfirm("Delete this validation cache entry?", "Delete Cache Entry?", "fa-solid fa-trash-can");
    if (confirmed) {
        fetch(`/api/admin/cache/${id}`, { method: 'DELETE' })
            .then(res => {
                if (res.ok) {
                    showToast("Cache entry deleted.", "success", "Deleted");
                    loadCacheStats();
                    loadCache();
                } else {
                    showToast('Failed to delete cache entry.', 'error', 'Delete Error');
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
    const labels = scans.map(s => s.projectName || s.name || `Scan #${s.id}`);
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
                    <td><strong>${scan.projectName || scan.name || 'Unnamed Project'}</strong></td>
                    <td>${formatDate(scan.startedAt)}</td>
                    <td>${formatDate(scan.endedAt)}</td>
                    <td class="scan-duration-cell" data-status="${scan.status}" data-initial-secs="${scan.durationSeconds || 0}" data-render-time="${Date.now()}"><span class="decision-badge valid">${formatDuration(scan.durationSeconds)}</span></td>
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

// 10. Live Logs Stream and Cancellation Controls
function startLiveLogStream(scanId) {
    closeLiveLogStream();

    const consoleBody = document.getElementById('console-log-stream');
    const consoleStatus = document.getElementById('console-stream-status');
    if (!consoleBody) return;

    // Show logs tab button
    const tabLogs = document.getElementById('tab-btn-live-logs');
    if (tabLogs) tabLogs.style.display = 'inline-block';

    consoleBody.innerHTML = '<div class="console-log-line info">Connecting to scan log stream...</div>';
    consoleStatus.textContent = 'Connecting';
    consoleStatus.style.background = 'var(--warning)';

    const source = new EventSource(`/api/admin/scans/${scanId}/stream`);
    window.state.logEventSource = source;

    source.addEventListener('log', (event) => {
        const msg = event.data;
        const line = document.createElement('div');
        line.className = 'console-log-line';
        if (msg.includes('[ERROR]')) {
            line.classList.add('error');
        } else {
            line.classList.add('info');
        }
        line.textContent = msg;
        consoleBody.appendChild(line);
        consoleBody.scrollTop = consoleBody.scrollHeight;
    });

    source.addEventListener('progress', (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.pagesScanned != null) {
                document.getElementById('det-pages-scanned').textContent = data.pagesScanned;
            }
            if (data.wordsChecked != null) {
                document.getElementById('det-words-checked').textContent = data.wordsChecked;
            }
            if (data.totalIssues != null) {
                document.getElementById('det-total-issues').textContent = data.totalIssues;
            }
            if (data.status != null) {
                const statusBadge = document.getElementById('det-scan-status');
                if (statusBadge) {
                    statusBadge.className = `status-badge ${data.status.toLowerCase()}`;
                    statusBadge.textContent = data.status;
                }
                
                if (data.status !== 'RUNNING' && data.status !== 'PENDING') {
                    // Completed, failed, or stopped
                    const line = document.createElement('div');
                    line.className = 'console-log-line info';
                    line.style.fontWeight = 'bold';
                    line.textContent = `Scan finished with status: ${data.status}`;
                    consoleBody.appendChild(line);
                    consoleBody.scrollTop = consoleBody.scrollHeight;
                    closeLiveLogStream();
                    
                    // Reload details view after delay to capture last updates
                    setTimeout(() => {
                        if (window.state.currentScanDetailsId == scanId) {
                            loadScanDetails(scanId);
                        }
                    }, 2000);
                }
            }
        } catch (e) {
            console.error('Error parsing progress SSE event:', e);
        }
    });

    source.onopen = () => {
        consoleStatus.textContent = 'Active';
        consoleStatus.style.background = 'var(--success)';
        const line = document.createElement('div');
        line.className = 'console-log-line info';
        line.textContent = 'Stream connected. Streaming logs...';
        consoleBody.appendChild(line);
    };

    source.onerror = (e) => {
        consoleStatus.textContent = 'Inactive';
        consoleStatus.style.background = 'var(--text-muted)';
        closeLiveLogStream();
    };
}

function closeLiveLogStream() {
    if (window.state.logEventSource) {
        window.state.logEventSource.close();
        window.state.logEventSource = null;
    }
    const consoleStatus = document.getElementById('console-stream-status');
    if (consoleStatus && consoleStatus.textContent === 'Active') {
        consoleStatus.textContent = 'Inactive';
        consoleStatus.style.background = 'var(--text-muted)';
    }
}

// 11. Custom Dictionaries
function loadDictionaries() {
    fetchApi('/api/admin/dictionaries')
        .then(data => {
            window.state.dictionaries = data;
            renderDictionaryList('global', data.global);
            renderDictionaryList('user', data.user);
        })
        .catch(err => {
            console.error('Error loading dictionaries:', err);
        });
}

function renderDictionaryList(type, list) {
    const ul = document.getElementById(`${type}-dict-list`);
    if (!ul) return;
    ul.innerHTML = '';
    
    if (!list || list.length === 0) {
        ul.innerHTML = `<li style="color: var(--text-secondary); text-align: center; margin-top: 40px; font-size: 0.85rem;">No words whitelisted.</li>`;
        return;
    }
    
    list.forEach(word => {
        const li = document.createElement('li');
        li.className = 'dict-word-item';
        li.innerHTML = `
            <span>${word}</span>
            <button onclick="removeDictionaryWord('${type}', '${word}')" title="Delete word"><i class="fa-solid fa-trash-can"></i></button>
        `;
        ul.appendChild(li);
    });
}

function addDictionaryWord(type, word, callback) {
    fetch('/api/admin/dictionaries/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dictionary: type, word: word })
    })
    .then(res => {
        if (res.ok) {
            showToast(`Word "${word}" added to ${type} dictionary.`, 'success', 'Word Added');
            if (callback) callback();
        } else {
            showToast('Failed to add word to dictionary.', 'error', 'Add Error');
        }
    })
    .catch(err => {
        console.error('Error adding dictionary word:', err);
        showToast('Error adding dictionary word.', 'error');
    });
}

window.removeDictionaryWord = async function(type, word) {
    const confirmed = await showAdminConfirm(`Remove word "${word}" from the ${type} dictionary?`, "Remove Word?", "fa-solid fa-trash-can");
    if (confirmed) {
        fetch('/api/admin/dictionaries/remove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dictionary: type, word: word })
        })
        .then(res => {
            if (res.ok) {
                showToast(`Word "${word}" removed from ${type} dictionary.`, 'success', 'Word Removed');
                loadDictionaries();
            } else {
                showToast('Failed to remove word.', 'error', 'Remove Error');
            }
        })
        .catch(err => {
            console.error('Error removing word:', err);
            showToast('Error removing word.', 'error');
        });
    }
};

// 12. Settings Configuration
function loadSettings() {
    fetchApi('/api/admin/settings')
        .then(settings => {
            window.state.settings = settings;
            
            const loadedKey = settings.groqApiKey || '';
            const keyInput = document.getElementById('settings-groq-key');
            if (keyInput) {
                keyInput.value = loadedKey;
                keyInput.dataset.initial = loadedKey;
            }
            const specialKeyInput = document.getElementById('settings-special-key');
            if (specialKeyInput) {
                specialKeyInput.value = '';
            }
            const specGroup = document.getElementById('settings-special-key-group');
            if (specGroup) {
                specGroup.style.display = 'none';
            }
            const model = settings.groqModel || '';
            const selectEl = document.getElementById('settings-groq-model-select');
            const customInput = document.getElementById('settings-groq-model-custom');
            
            let isPredefined = false;
            if (selectEl) {
                for (let i = 0; i < selectEl.options.length; i++) {
                    if (selectEl.options[i].value === model) {
                        selectEl.value = model;
                        isPredefined = true;
                        break;
                    }
                }
                
                if (!isPredefined) {
                    selectEl.value = 'custom';
                    if (customInput) {
                        customInput.value = model;
                        customInput.style.display = 'block';
                    }
                } else {
                    if (customInput) {
                        customInput.value = '';
                        customInput.style.display = 'none';
                    }
                }
            }
            document.getElementById('settings-groq-batch').value = settings.groqBatchSize || 50;
            
            const checkbox = document.getElementById('settings-crawler-parallel');
            checkbox.checked = settings.crawlerParallelEnabled;
            
            document.getElementById('settings-crawler-workers').value = settings.crawlerParallelWorkers || 15;
            
            const group = document.getElementById('crawler-workers-group');
            if (group) {
                group.style.display = settings.crawlerParallelEnabled ? 'flex' : 'none';
            }
        })
        .catch(err => {
            console.error('Error loading settings:', err);
        });
}

// 13. Groq Metrics Configuration & Polling
function loadGroqMetrics() {
    fetchApi('/api/admin/metrics/groq')
        .then(metrics => {
            document.getElementById('metrics-total-calls').textContent = metrics.totalApiCalls;
            document.getElementById('metrics-success-calls').textContent = metrics.successfulApiCalls;
            document.getElementById('metrics-failed-calls').textContent = metrics.failedApiCalls;
            document.getElementById('metrics-daily-calls').textContent = metrics.dailyApiCallsCount;
            
            const totalTokens = metrics.totalPromptTokens + metrics.totalCompletionTokens;
            document.getElementById('metrics-total-tokens').textContent = totalTokens.toLocaleString();
            document.getElementById('metrics-prompt-tokens').textContent = metrics.totalPromptTokens.toLocaleString();
            document.getElementById('metrics-completion-tokens').textContent = metrics.totalCompletionTokens.toLocaleString();
            
            document.getElementById('metrics-estimated-cost').textContent = '$' + metrics.estimatedCostUsd.toFixed(4);
            document.getElementById('metrics-avg-latency').textContent = Math.round(metrics.averageLatencyMs) + ' ms';
            
            const relVal = (100 - metrics.errorRatePercentage).toFixed(1) + '%';
            document.getElementById('metrics-reliability').textContent = relVal;
            document.getElementById('metrics-error-rate').textContent = metrics.errorRatePercentage.toFixed(1) + '%';
            
            document.getElementById('metrics-cache-hit-rate').textContent = metrics.cacheHitRatePercentage.toFixed(1) + '%';
            document.getElementById('metrics-cache-hits').textContent = metrics.cacheHits.toLocaleString();
            document.getElementById('metrics-cache-misses').textContent = metrics.cacheMisses.toLocaleString();
            
            const remReq = metrics.xRemainingRequests;
            document.getElementById('metrics-limit-requests').textContent = remReq >= 0 ? remReq.toLocaleString() : 'N/A';
            
            const remTok = metrics.xRemainingTokens;
            document.getElementById('metrics-limit-tokens').textContent = remTok >= 0 ? remTok.toLocaleString() : 'N/A';
        })
        .catch(err => {
            console.error('Error loading Groq metrics:', err);
        });
}

function startMetricsPolling() {
    stopMetricsPolling();
    window.state.metricsInterval = setInterval(() => {
        if (window.state.activePane === 'settings') {
            const metricsTab = document.getElementById('settings-tab-metrics');
            if (metricsTab && metricsTab.style.display !== 'none') {
                loadGroqMetrics();
            }
        }
    }, 3000);
}

function stopMetricsPolling() {
    if (window.state.metricsInterval) {
        clearInterval(window.state.metricsInterval);
        window.state.metricsInterval = null;
    }
}

function startLiveScanTimer() {
    if (window.state.liveScanInterval) return;
    window.state.liveScanInterval = setInterval(() => {
        document.querySelectorAll('.scan-duration-cell').forEach(cell => {
            const status = cell.getAttribute('data-status');
            if (status && status.toUpperCase() === 'RUNNING') {
                const initialSecs = parseInt(cell.getAttribute('data-initial-secs') || '0', 10);
                const renderTime = parseInt(cell.getAttribute('data-render-time') || '0', 10);
                if (renderTime > 0) {
                    const currentElapsed = initialSecs + Math.floor((Date.now() - renderTime) / 1000);
                    const badge = cell.querySelector('.decision-badge');
                    if (badge) {
                        badge.textContent = formatDuration(currentElapsed);
                    } else {
                        cell.textContent = formatDuration(currentElapsed);
                    }
                }
            }
        });
    }, 1000);
}

function startAutoRefreshPolling() {
    if (window.state.autoRefreshInterval) return;
    window.state.autoRefreshInterval = setInterval(() => {
        // Pause background polling if a modal dialog is open or an input/textarea is currently focused
        const activeModal = document.querySelector('.modal.active, .modal[style*="display: flex"], .modal[style*="display: block"]');
        if (activeModal) return;

        const activeTag = document.activeElement ? document.activeElement.tagName : '';
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;

        const pane = window.state.activePane;

        if (pane === 'dashboard') {
            loadDashboardStats();
        } else if (pane === 'projects') {
            loadProjects();
        } else if (pane === 'scans') {
            loadScans();
        } else if (pane === 'scan-details' && window.state.currentScanDetailsId) {
            loadScanDetails(window.state.currentScanDetailsId);
        } else if (pane === 'issues') {
            loadIssues();
        } else if (pane === 'cache') {
            loadCacheStats();
            loadCache();
        } else if (pane === 'analytics') {
            loadAnalytics();
        } else if (pane === 'performance') {
            loadPerformance();
        } else if (pane === 'dictionaries') {
            loadDictionaries();
        } else if (pane === 'settings') {
            const metricsTab = document.getElementById('settings-tab-metrics');
            if (metricsTab && metricsTab.style.display !== 'none') {
                loadGroqMetrics();
            }
        } else if (pane === 'widgets') {
            loadAdminWidgetSettings();
        }
    }, 5000);
}

// --- Entertainment & Interactive Widget Admin Manager ---
function loadAdminWidgetSettings() {
    fetchApi('/api/admin/settings')
        .then(data => {
            if (data && data.widgetSettings) {
                localStorage.setItem('admin_widget_settings', JSON.stringify(data.widgetSettings));
                renderAdminWidgetControls(data.widgetSettings);
            } else {
                renderAdminWidgetControlsFromLocal();
            }
        })
        .catch(() => {
            renderAdminWidgetControlsFromLocal();
        });
}

function isWidgetTruthy(val) {
    if (val === false || val === 'false' || val === 0 || val === '0' || val === null || val === undefined) {
        return false;
    }
    return true;
}

function renderAdminWidgetControls(settings) {
    if (!settings) return;
    const sec1 = document.getElementById('admin-toggle-sec1');
    if (sec1) sec1.checked = isWidgetTruthy(settings.sec1_visible);

    const sec2 = document.getElementById('admin-toggle-sec2');
    if (sec2) sec2.checked = isWidgetTruthy(settings.sec2_visible);

    const sec3 = document.getElementById('admin-toggle-sec3');
    if (sec3) sec3.checked = isWidgetTruthy(settings.sec3_visible);

    // Section 2 fields
    if (document.getElementById('admin-sec2-title')) document.getElementById('admin-sec2-title').value = settings.sec2_title || 'Daily Tech Mind-Booster & Fun Facts';
    if (document.getElementById('admin-sec2-badge')) document.getElementById('admin-sec2-badge').value = settings.sec2_badge || 'Did You Know?';
    if (document.getElementById('admin-sec2-subtitle')) document.getElementById('admin-sec2-subtitle').value = settings.sec2_subtitle || 'Discover fascinating computing history, tech secrets, and easter eggs while your scan runs!';
    if (document.getElementById('admin-sec2-data-mode')) document.getElementById('admin-sec2-data-mode').value = settings.sec2_data_mode || 'api';
    if (document.getElementById('admin-sec2-auto-rotate')) document.getElementById('admin-sec2-auto-rotate').value = settings.sec2_auto_rotate || 0;
    if (document.getElementById('admin-sec2-api-enabled')) document.getElementById('admin-sec2-api-enabled').checked = isWidgetTruthy(settings.sec2_api_enabled);
    if (document.getElementById('admin-sec2-api-count')) document.getElementById('admin-sec2-api-count').textContent = (settings.sec2_api_call_count || 0) + ' Calls';

    // Section 3 fields
    if (document.getElementById('admin-sec3-title')) document.getElementById('admin-sec3-title').value = settings.sec3_title || 'World Wonders, Mysteries & Curiosities';
    if (document.getElementById('admin-sec3-badge')) document.getElementById('admin-sec3-badge').value = settings.sec3_badge || 'Global Edition';
    if (document.getElementById('admin-sec3-subtitle')) document.getElementById('admin-sec3-subtitle').value = settings.sec3_subtitle || 'Explore mind-bending natural phenomena, ancient human achievements, space mysteries & world records!';
    if (document.getElementById('admin-sec3-data-mode')) document.getElementById('admin-sec3-data-mode').value = settings.sec3_data_mode || 'api';
    if (document.getElementById('admin-sec3-auto-rotate')) document.getElementById('admin-sec3-auto-rotate').value = settings.sec3_auto_rotate || 0;
    if (document.getElementById('admin-sec3-api-enabled')) document.getElementById('admin-sec3-api-enabled').checked = isWidgetTruthy(settings.sec3_api_enabled);
    if (document.getElementById('admin-sec3-api-count')) document.getElementById('admin-sec3-api-count').textContent = (settings.sec3_api_call_count || 0) + ' Calls';

    document.querySelectorAll('.admin-mode-toggle').forEach(chk => {
        const mode = chk.getAttribute('data-mode');
        if (mode && settings.modes) {
            chk.checked = isWidgetTruthy(settings.modes[mode]);
        }
    });
}

function renderAdminWidgetControlsFromLocal() {
    const raw = localStorage.getItem('admin_widget_settings');
    let settings = {
        sec1_visible: true,
        sec2_visible: true,
        sec3_visible: true,
        sec2_title: 'Daily Tech Mind-Booster & Fun Facts',
        sec2_badge: 'Did You Know?',
        sec2_subtitle: 'Discover fascinating computing history, tech secrets, and easter eggs while your scan runs!',
        sec2_data_mode: 'api',
        sec2_auto_rotate: 0,
        sec2_api_enabled: true,
        sec2_api_call_count: 0,
        sec3_title: 'World Wonders, Mysteries & Curiosities',
        sec3_badge: 'Global Edition',
        sec3_subtitle: 'Explore mind-bending natural phenomena, ancient human achievements, space mysteries & world records!',
        sec3_data_mode: 'api',
        sec3_auto_rotate: 0,
        sec3_api_enabled: true,
        sec3_api_call_count: 0,
        modes: {
            math: true, india: true, ai: true, history: true, science: true,
            cinema: true, sports: true, geography: true, coding: true, riddles: true
        }
    };
    if (raw) {
        try { settings = JSON.parse(raw); } catch (e) {}
    }
    renderAdminWidgetControls(settings);
}

function saveAdminWidgetSettings() {
    const sec1 = document.getElementById('admin-toggle-sec1');
    const sec2 = document.getElementById('admin-toggle-sec2');
    const sec3 = document.getElementById('admin-toggle-sec3');

    const settings = {
        sec1_visible: sec1 ? sec1.checked : true,
        sec2_visible: sec2 ? sec2.checked : true,
        sec3_visible: sec3 ? sec3.checked : true,
        sec2_title: document.getElementById('admin-sec2-title') ? document.getElementById('admin-sec2-title').value : 'Daily Tech Mind-Booster & Fun Facts',
        sec2_badge: document.getElementById('admin-sec2-badge') ? document.getElementById('admin-sec2-badge').value : 'Did You Know?',
        sec2_subtitle: document.getElementById('admin-sec2-subtitle') ? document.getElementById('admin-sec2-subtitle').value : 'Discover fascinating computing history, tech secrets, and easter eggs while your scan runs!',
        sec2_data_mode: document.getElementById('admin-sec2-data-mode') ? document.getElementById('admin-sec2-data-mode').value : 'api',
        sec2_auto_rotate: document.getElementById('admin-sec2-auto-rotate') ? parseInt(document.getElementById('admin-sec2-auto-rotate').value, 10) : 0,
        sec2_api_enabled: document.getElementById('admin-sec2-api-enabled') ? document.getElementById('admin-sec2-api-enabled').checked : true,
        sec3_title: document.getElementById('admin-sec3-title') ? document.getElementById('admin-sec3-title').value : 'World Wonders, Mysteries & Curiosities',
        sec3_badge: document.getElementById('admin-sec3-badge') ? document.getElementById('admin-sec3-badge').value : 'Global Edition',
        sec3_subtitle: document.getElementById('admin-sec3-subtitle') ? document.getElementById('admin-sec3-subtitle').value : 'Explore mind-bending natural phenomena, ancient human achievements, space mysteries & world records!',
        sec3_data_mode: document.getElementById('admin-sec3-data-mode') ? document.getElementById('admin-sec3-data-mode').value : 'api',
        sec3_auto_rotate: document.getElementById('admin-sec3-auto-rotate') ? parseInt(document.getElementById('admin-sec3-auto-rotate').value, 10) : 0,
        sec3_api_enabled: document.getElementById('admin-sec3-api-enabled') ? document.getElementById('admin-sec3-api-enabled').checked : true,
        modes: {}
    };

    document.querySelectorAll('.admin-mode-toggle').forEach(chk => {
        const mode = chk.getAttribute('data-mode');
        if (mode) {
            settings.modes[mode] = chk.checked;
        }
    });

    localStorage.setItem('admin_widget_settings', JSON.stringify(settings));

    fetch('/api/admin/widget-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
    }).then(res => {
        showToast('✨ Section 2 & Section 3 settings & API toggles saved successfully!', 'success', 'Widget Settings Saved');
    }).catch(() => {
        showToast('✨ Settings saved locally!', 'info', 'Saved Locally');
    });
}

async function resetAdminWidgetApiCounters() {
    const pin = await showAdminPrompt(
        'Enter System Security PIN (Special Key) to authorize resetting Section 2 & Section 3 API usage statistics:',
        'Security PIN Authorization',
        '••••',
        true
    );
    
    if (!pin) return; // User cancelled or closed modal

    try {
        const res = await fetch('/api/admin/verify-pin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin: pin })
        });

        const data = await res.json();
        if (res.ok && data.valid) {
            // Correct PIN! Execute reset and show alert pop-up
            const resetRes = await fetch('/api/admin/widget-settings/reset-counters', { method: 'POST' });
            if (resetRes.ok) {
                const resetData = await resetRes.json();
                if (resetData) renderAdminWidgetControls(resetData);
                showToast('✨ Section 2 & Section 3 API usage statistics reset to 0!', 'success', 'Counters Reset Successfully');
                alert('✨ Section 2 & Section 3 API usage statistics reset to 0!');
            }
        } else {
            // Incorrect PIN! Show notification and do nothing
            showToast('Invalid Security PIN. Reset aborted.', 'error', 'Invalid PIN');
        }
    } catch (e) {
        showToast('Error verifying PIN.', 'error');
    }
}

window.resetAdminWidgetApiCounters = resetAdminWidgetApiCounters;

window.loadAdminWidgetSettings = loadAdminWidgetSettings;

// --- Footer System Admin Manager ---
let adminFooterState = null;

function ensureCompleteFooterState(data) {
    const fallback = getDefaultAdminFooterFallback();
    if (!data || typeof data !== 'object') return fallback;

    data.enabled = data.enabled !== false;

    if (!data.brand || typeof data.brand !== 'object') {
        data.brand = fallback.brand;
    }
    if (!data.contact || typeof data.contact !== 'object') {
        data.contact = fallback.contact;
    }
    if (!data.copyright || typeof data.copyright !== 'object') {
        data.copyright = fallback.copyright;
    }
    if (!data.socialLinks || !Array.isArray(data.socialLinks) || data.socialLinks.length === 0) {
        data.socialLinks = fallback.socialLinks;
    }
    if (!data.columns || !Array.isArray(data.columns) || data.columns.length === 0) {
        data.columns = fallback.columns;
    } else {
        data.columns.forEach((col, i) => {
            if (!col.links || !Array.isArray(col.links) || col.links.length === 0) {
                const fbCol = (fallback.columns || [])[i] || fallback.columns[0];
                if (fbCol && fbCol.links) {
                    col.links = fbCol.links;
                }
            }
        });
    }
    return data;
}

function loadAdminFooterSettings() {
    fetchApi('/api/admin/footer-settings')
        .then(data => {
            if (data && typeof data === 'object') {
                adminFooterState = ensureCompleteFooterState(data);
                localStorage.setItem('admin_footer_settings', JSON.stringify(adminFooterState));
                renderAdminFooterControls();
            } else {
                loadAdminFooterFromLocal();
            }
        })
        .catch(() => {
            loadAdminFooterFromLocal();
        });
}

function loadAdminFooterFromLocal() {
    const raw = localStorage.getItem('admin_footer_settings');
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                adminFooterState = ensureCompleteFooterState(parsed);
            }
        } catch (e) {}
    }
    if (!adminFooterState) {
        adminFooterState = getDefaultAdminFooterFallback();
    }
    adminFooterState = ensureCompleteFooterState(adminFooterState);
    renderAdminFooterControls();
}

function getDefaultAdminFooterFallback() {
    return {
        enabled: true,
        brand: {
            appName: "Auto-Checker",
            tagline: "Automated Website Spelling Engine",
            description: "Verify spelling issues and QA defects on websites instantly with automated content analysis.",
            logoIcon: "fa-solid fa-wand-magic-sparkles",
            logoUrl: ""
        },
        contact: {
            supportEmail: "support@example.com",
            contactEmail: "info@example.com",
            phone: "+1 (800) 555-0199",
            address: "100 Tech Plaza, Suite 500, San Francisco, CA 94105",
            supportUrl: "https://example.com/support",
            businessHours: "Mon - Fri: 9:00 AM - 6:00 PM EST",
            enabled: true
        },
        socialLinks: [
            { id: "soc-1", platform: "GitHub", icon: "fa-brands fa-github", url: "https://github.com", enabled: true, order: 1 },
            { id: "soc-2", platform: "LinkedIn", icon: "fa-brands fa-linkedin", url: "https://linkedin.com", enabled: true, order: 2 },
            { id: "soc-3", platform: "X / Twitter", icon: "fa-brands fa-x-twitter", url: "https://x.com", enabled: true, order: 3 },
            { id: "soc-4", platform: "YouTube", icon: "fa-brands fa-youtube", url: "https://youtube.com", enabled: true, order: 4 },
            { id: "soc-5", platform: "Facebook", icon: "fa-brands fa-facebook", url: "https://facebook.com", enabled: false, order: 5 },
            { id: "soc-6", platform: "Instagram", icon: "fa-brands fa-instagram", url: "https://instagram.com", enabled: false, order: 6 }
        ],
        columns: [
            {
                id: "col-product", title: "Product", enabled: true, order: 1,
                links: [
                    { id: "lnk-1", title: "Website Spell Check", url: "/", targetBlank: false, enabled: true, order: 1 },
                    { id: "lnk-2", title: "Scan Website", url: "/#scan-form", targetBlank: false, enabled: true, order: 2 },
                    { id: "lnk-3", title: "Projects & Reports", url: "/#tab-projects", targetBlank: false, enabled: true, order: 3 },
                    { id: "lnk-4", title: "Spelling Mistakes Log", url: "/#live-issues-table", targetBlank: false, enabled: true, order: 4 }
                ]
            },
            {
                id: "col-resources", title: "Resources", enabled: true, order: 2,
                links: [
                    { id: "lnk-5", title: "Documentation", url: "/documentation", targetBlank: false, enabled: true, order: 1 },
                    { id: "lnk-6", title: "Help Center & FAQ", url: "/faq", targetBlank: false, enabled: true, order: 2 },
                    { id: "lnk-7", title: "API Reference", url: "/api-docs", targetBlank: false, enabled: true, order: 3 },
                    { id: "lnk-8", title: "Knowledge Base", url: "/kb", targetBlank: false, enabled: true, order: 4 }
                ]
            },
            {
                id: "col-company", title: "Company", enabled: true, order: 3,
                links: [
                    { id: "lnk-9", title: "About Us", url: "/about", targetBlank: false, enabled: true, order: 1 },
                    { id: "lnk-10", title: "Contact Support", url: "/contact", targetBlank: false, enabled: true, order: 2 },
                    { id: "lnk-11", title: "Latest Blog", url: "/blog", targetBlank: false, enabled: true, order: 3 },
                    { id: "lnk-12", title: "Careers", url: "/careers", targetBlank: false, enabled: true, order: 4 }
                ]
            },
            {
                id: "col-legal", title: "Legal", enabled: true, order: 4,
                links: [
                    { id: "lnk-13", title: "Privacy Policy", url: "/privacy", targetBlank: false, enabled: true, order: 1 },
                    { id: "lnk-14", title: "Terms & Conditions", url: "/terms", targetBlank: false, enabled: true, order: 2 },
                    { id: "lnk-15", title: "Cookie Policy", url: "/cookie-policy", targetBlank: false, enabled: true, order: 3 },
                    { id: "lnk-16", title: "Disclaimer", url: "/disclaimer", targetBlank: false, enabled: true, order: 4 }
                ]
            }
        ],
        copyright: {
            companyName: "QA Spelling Auto-Checker",
            year: "2026",
            autoYear: true,
            suffixText: "All rights reserved."
        }
    };
}

function switchFooterAdminTab(tabName) {
    const panes = ['brand', 'columns', 'social', 'contact', 'copyright', 'pages', 'preview'];
    panes.forEach(p => {
        const btn = document.getElementById(`btn-ftab-${p}`);
        const pane = document.getElementById(`footer-admin-pane-${p}`);
        if (btn) btn.classList.remove('active');
        if (pane) pane.style.display = 'none';
    });

    const activeBtn = document.getElementById(`btn-ftab-${tabName}`);
    const activePane = document.getElementById(`footer-admin-pane-${tabName}`);
    if (activeBtn) activeBtn.classList.add('active');
    if (activePane) activePane.style.display = 'block';

    if (tabName === 'preview') {
        renderAdminFooterPreview();
    } else if (tabName === 'pages') {
        renderAdminPagesList();
    }
}

function renderAdminFooterControls() {
    if (!adminFooterState) adminFooterState = getDefaultAdminFooterFallback();
    adminFooterState = ensureCompleteFooterState(adminFooterState);

    // Master Toggle
    const masterTgl = document.getElementById('admin-footer-master-toggle');
    if (masterTgl) masterTgl.checked = isWidgetTruthy(adminFooterState.enabled);

    // Brand
    const b = adminFooterState.brand || {};
    if (document.getElementById('admin-footer-app-name')) document.getElementById('admin-footer-app-name').value = b.appName || '';
    if (document.getElementById('admin-footer-logo-icon')) document.getElementById('admin-footer-logo-icon').value = b.logoIcon || '';
    if (document.getElementById('admin-footer-logo-url')) document.getElementById('admin-footer-logo-url').value = b.logoUrl || '';
    if (document.getElementById('admin-footer-tagline')) document.getElementById('admin-footer-tagline').value = b.tagline || '';
    if (document.getElementById('admin-footer-description')) document.getElementById('admin-footer-description').value = b.description || '';

    // Contact
    const c = adminFooterState.contact || {};
    if (document.getElementById('admin-footer-contact-enabled')) document.getElementById('admin-footer-contact-enabled').checked = isWidgetTruthy(c.enabled);
    if (document.getElementById('admin-footer-support-email')) document.getElementById('admin-footer-support-email').value = c.supportEmail || '';
    if (document.getElementById('admin-footer-contact-email')) document.getElementById('admin-footer-contact-email').value = c.contactEmail || '';
    if (document.getElementById('admin-footer-phone')) document.getElementById('admin-footer-phone').value = c.phone || '';
    if (document.getElementById('admin-footer-support-url')) document.getElementById('admin-footer-support-url').value = c.supportUrl || '';
    if (document.getElementById('admin-footer-address')) document.getElementById('admin-footer-address').value = c.address || '';
    if (document.getElementById('admin-footer-hours')) document.getElementById('admin-footer-hours').value = c.businessHours || '';

    // Copyright
    const cp = adminFooterState.copyright || {};
    if (document.getElementById('admin-footer-company-name')) document.getElementById('admin-footer-company-name').value = cp.companyName || '';
    if (document.getElementById('admin-footer-copyright-year')) document.getElementById('admin-footer-copyright-year').value = cp.year || '2026';
    if (document.getElementById('admin-footer-auto-year')) document.getElementById('admin-footer-auto-year').checked = isWidgetTruthy(cp.autoYear);
    if (document.getElementById('admin-footer-suffix')) document.getElementById('admin-footer-suffix').value = cp.suffixText || '';

    renderAdminFooterColumnsList();
    renderAdminFooterSocialList();
    renderAdminPagesList();
}

function collectAdminFooterFormValues() {
    if (!adminFooterState) adminFooterState = getDefaultAdminFooterFallback();
    adminFooterState = ensureCompleteFooterState(adminFooterState);

    const masterTgl = document.getElementById('admin-footer-master-toggle');
    adminFooterState.enabled = masterTgl ? masterTgl.checked : true;

    adminFooterState.brand = {
        appName: document.getElementById('admin-footer-app-name') ? document.getElementById('admin-footer-app-name').value : '',
        logoIcon: document.getElementById('admin-footer-logo-icon') ? document.getElementById('admin-footer-logo-icon').value : '',
        logoUrl: document.getElementById('admin-footer-logo-url') ? document.getElementById('admin-footer-logo-url').value : '',
        tagline: document.getElementById('admin-footer-tagline') ? document.getElementById('admin-footer-tagline').value : '',
        description: document.getElementById('admin-footer-description') ? document.getElementById('admin-footer-description').value : ''
    };

    adminFooterState.contact = {
        enabled: document.getElementById('admin-footer-contact-enabled') ? document.getElementById('admin-footer-contact-enabled').checked : true,
        supportEmail: document.getElementById('admin-footer-support-email') ? document.getElementById('admin-footer-support-email').value : '',
        contactEmail: document.getElementById('admin-footer-contact-email') ? document.getElementById('admin-footer-contact-email').value : '',
        phone: document.getElementById('admin-footer-phone') ? document.getElementById('admin-footer-phone').value : '',
        supportUrl: document.getElementById('admin-footer-support-url') ? document.getElementById('admin-footer-support-url').value : '',
        address: document.getElementById('admin-footer-address') ? document.getElementById('admin-footer-address').value : '',
        businessHours: document.getElementById('admin-footer-hours') ? document.getElementById('admin-footer-hours').value : ''
    };

    adminFooterState.copyright = {
        companyName: document.getElementById('admin-footer-company-name') ? document.getElementById('admin-footer-company-name').value : '',
        year: document.getElementById('admin-footer-copyright-year') ? document.getElementById('admin-footer-copyright-year').value : '2026',
        autoYear: document.getElementById('admin-footer-auto-year') ? document.getElementById('admin-footer-auto-year').checked : true,
        suffixText: document.getElementById('admin-footer-suffix') ? document.getElementById('admin-footer-suffix').value : ''
    };
}

function saveAdminFooterSettings() {
    collectAdminFooterFormValues();
    localStorage.setItem('admin_footer_settings', JSON.stringify(adminFooterState));

    fetch('/api/admin/footer-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(adminFooterState)
    }).then(res => {
        if (!res.ok) throw new Error('Save failed');
        showToast('✨ Footer configuration saved to server successfully!', 'success', 'Footer Saved');
    }).catch(err => {
        showToast('✨ Footer configuration saved locally!', 'info', 'Footer Saved');
    });
}

function renderAdminFooterColumnsList() {
    const listContainer = document.getElementById('admin-footer-columns-list');
    if (!listContainer) return;
    if (!adminFooterState) adminFooterState = getDefaultAdminFooterFallback();
    adminFooterState = ensureCompleteFooterState(adminFooterState);

    const columns = adminFooterState.columns || [];
    if (columns.length === 0) {
        listContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px; font-size: 13px;">No footer columns defined yet. Click "Add New Column" to create one.</div>`;
        return;
    }

    listContainer.innerHTML = columns.map((col, cIdx) => {
        const links = col.links || [];
        const linksHtml = links.map((l, lIdx) => `
            <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 8px 12px; font-size: 13px;">
                <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
                    <i class="${escapeHtml(l.icon || 'fa-solid fa-link')}" style="color: #a5b4fc; font-size: 12px;"></i>
                    <strong style="color: #fff;">${escapeHtml(l.title)}</strong>
                    <span style="color: var(--text-muted); font-size: 12px;">(${escapeHtml(l.url)})</span>
                    ${l.targetBlank ? '<span style="font-size: 10px; background: rgba(99,102,241,0.2); color: #a5b4fc; padding: 2px 6px; border-radius: 4px;">New Tab</span>' : ''}
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <button type="button" class="btn btn-secondary btn-sm" style="padding: 4px 8px;" onclick="toggleAdminFooterLink('${col.id}', '${l.id}')" title="${l.enabled !== false ? 'Disable Link' : 'Enable Link'}">
                        <i class="fa-solid ${l.enabled !== false ? 'fa-eye' : 'fa-eye-slash'}" style="color: ${l.enabled !== false ? '#34d399' : '#9ca3af'};"></i>
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm" style="padding: 4px 8px;" onclick="openAdminEditLinkModal('${col.id}', '${l.id}')">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button type="button" class="btn btn-danger btn-sm" style="padding: 4px 8px;" onclick="deleteAdminFooterLink('${col.id}', '${l.id}')">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </div>
        `).join('');

        return `
            <div class="glass-panel" style="padding: 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); background: rgba(15,23,42,0.6);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 10px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <h4 style="margin: 0; font-size: 15px; color: #fff;">${escapeHtml(col.title)}</h4>
                        <span style="font-size: 11px; background: rgba(255,255,255,0.1); padding: 2px 8px; border-radius: 10px; color: var(--text-secondary);">Order: ${col.order || cIdx + 1}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <button type="button" class="btn btn-secondary btn-sm" onclick="openAdminAddLinkModal('${col.id}')">
                            <i class="fa-solid fa-plus"></i> Add Link
                        </button>
                        <button type="button" class="btn btn-secondary btn-sm" onclick="openAdminEditColumnModal('${col.id}')">
                            <i class="fa-solid fa-pen-to-square"></i> Edit
                        </button>
                        <button type="button" class="btn btn-danger btn-sm" onclick="deleteAdminFooterColumn('${col.id}')">
                            <i class="fa-solid fa-trash-can"></i> Delete
                        </button>
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    ${linksHtml || '<div style="font-size: 12px; color: var(--text-muted); padding: 6px 0;">No links in this column yet.</div>'}
                </div>
            </div>
        `;
    }).join('');
}

function renderAdminFooterSocialList() {
    const listContainer = document.getElementById('admin-footer-social-list');
    if (!listContainer) return;
    if (!adminFooterState) adminFooterState = getDefaultAdminFooterFallback();
    adminFooterState = ensureCompleteFooterState(adminFooterState);

    const socialLinks = adminFooterState.socialLinks || [];
    if (socialLinks.length === 0) {
        listContainer.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 20px; font-size: 13px;">No social media channels configured. Click "Add Social Link" above.</div>`;
        return;
    }

    listContainer.innerHTML = socialLinks.map(s => `
        <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 14px; display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="width: 36px; height: 36px; border-radius: 8px; background: rgba(99,102,241,0.2); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 16px;">
                    <i class="${escapeHtml(s.icon || 'fa-solid fa-share-nodes')}"></i>
                </div>
                <div>
                    <div style="font-weight: 600; color: #fff; font-size: 14px;">${escapeHtml(s.platform)}</div>
                    <div style="font-size: 11px; color: var(--text-muted); text-overflow: ellipsis; overflow: hidden; max-width: 160px; white-space: nowrap;">${escapeHtml(s.url)}</div>
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
                <button type="button" class="btn btn-secondary btn-sm" style="padding: 4px 8px;" onclick="toggleAdminFooterSocial('${s.id}')">
                    <i class="fa-solid ${s.enabled !== false ? 'fa-eye' : 'fa-eye-slash'}" style="color: ${s.enabled !== false ? '#34d399' : '#9ca3af'};"></i>
                </button>
                <button type="button" class="btn btn-secondary btn-sm" style="padding: 4px 8px;" onclick="openAdminEditSocialModal('${s.id}')">
                    <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button type="button" class="btn btn-danger btn-sm" style="padding: 4px 8px;" onclick="deleteAdminFooterSocial('${s.id}')">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        </div>
    `).join('');
}

const defaultAdminPublicPages = [
    { title: "About Us", slug: "/about", status: "Published", description: "Product overview, capabilities, and automated QA mission." },
    { title: "Contact Support", slug: "/contact", status: "Published", description: "Technical support, contact emails, phone, and office address." },
    { title: "Latest Blog", slug: "/blog", status: "Published", description: "Articles, technical tutorials, and product updates." },
    { title: "Careers", slug: "/careers", status: "Published", description: "Job listings and career opportunities." },
    { title: "Documentation", slug: "/documentation", status: "Published", description: "User guides, crawl parameters, and hybrid pipeline architecture." },
    { title: "Help Center & FAQ", slug: "/help", status: "Published", description: "Frequently Asked Questions and troubleshooting guide." },
    { title: "API Reference", slug: "/api-reference", status: "Published", description: "Developer REST API endpoints and integration reference." },
    { title: "Knowledge Base", slug: "/knowledge-base", status: "Published", description: "QA knowledge base, scanning patterns, and best practices." },
    { title: "Privacy Policy", slug: "/privacy-policy", status: "Published", description: "Data collection, text extraction retention, and privacy policy." },
    { title: "Terms & Conditions", slug: "/terms-and-conditions", status: "Published", description: "Service usage terms, scanning rights, and legal guidelines." },
    { title: "Cookie Policy", slug: "/cookie-policy", status: "Published", description: "Essential browser local storage and cookie usage declaration." },
    { title: "Disclaimer", slug: "/disclaimer", status: "Published", description: "Automated analysis limitations and verification notice." },
    { title: "Projects & Reports", slug: "/projects", status: "Published", description: "Overview of project organization and scan reporting." }
];

function renderAdminPagesList() {
    const listContainer = document.getElementById('admin-footer-pages-list');
    if (!listContainer) return;

    listContainer.innerHTML = defaultAdminPublicPages.map(p => `
        <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 14px; display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="width: 36px; height: 36px; border-radius: 8px; background: rgba(99,102,241,0.2); display: flex; align-items: center; justify-content: center; color: #a5b4fc; font-size: 16px;">
                    <i class="fa-solid fa-file-code"></i>
                </div>
                <div>
                    <div style="font-weight: 600; color: #fff; font-size: 14px;">${escapeHtml(p.title)}</div>
                    <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(p.slug)}</div>
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 10px; background: rgba(52, 211, 153, 0.2); color: #34d399; padding: 2px 8px; border-radius: 10px; font-weight: 600;">${escapeHtml(p.status)}</span>
                <a href="${p.slug}" target="_blank" class="btn btn-secondary btn-sm" style="padding: 4px 10px; font-size: 12px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
                    <i class="fa-solid fa-arrow-up-right-from-square"></i> Open
                </a>
            </div>
        </div>
    `).join('');
}

function openAdminAddColumnModal() {
    if (!adminFooterState) adminFooterState = getDefaultAdminFooterFallback();
    adminFooterState = ensureCompleteFooterState(adminFooterState);
    const modal = document.getElementById('admin-footer-column-modal');
    if (!modal) return;
    document.getElementById('admin-col-modal-title').textContent = "Add Footer Column";
    document.getElementById('admin-col-modal-id').value = "";
    document.getElementById('admin-col-modal-title-input').value = "";
    document.getElementById('admin-col-modal-order-input').value = (adminFooterState.columns || []).length + 1;
    document.getElementById('admin-col-modal-enabled-input').checked = true;
    modal.style.display = 'flex';
    modal.classList.add('active');
}

function openAdminEditColumnModal(colId) {
    const modal = document.getElementById('admin-footer-column-modal');
    if (!modal) return;
    const col = (adminFooterState && adminFooterState.columns || []).find(c => c.id === colId);
    if (!col) return;
    document.getElementById('admin-col-modal-title').textContent = "Edit Footer Column";
    document.getElementById('admin-col-modal-id').value = col.id;
    document.getElementById('admin-col-modal-title-input').value = col.title;
    document.getElementById('admin-col-modal-order-input').value = col.order || 1;
    document.getElementById('admin-col-modal-enabled-input').checked = col.enabled !== false;
    modal.style.display = 'flex';
    modal.classList.add('active');
}

function closeAdminColumnModal() {
    const modal = document.getElementById('admin-footer-column-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
}

function saveAdminColumnModal(e) {
    e.preventDefault();
    const id = document.getElementById('admin-col-modal-id').value;
    const title = document.getElementById('admin-col-modal-title-input').value.trim();
    const order = parseInt(document.getElementById('admin-col-modal-order-input').value, 10) || 1;
    const enabled = document.getElementById('admin-col-modal-enabled-input').checked;

    if (!adminFooterState.columns) adminFooterState.columns = [];

    if (id) {
        const col = adminFooterState.columns.find(c => c.id === id);
        if (col) {
            col.title = title;
            col.order = order;
            col.enabled = enabled;
        }
    } else {
        adminFooterState.columns.push({
            id: 'col-' + Date.now(),
            title: title,
            order: order,
            enabled: enabled,
            links: []
        });
    }

    closeAdminColumnModal();
    renderAdminFooterColumnsList();
    showToast('Column updated successfully', 'success');
}

function deleteAdminFooterColumn(colId) {
    showAdminConfirm("Are you sure you want to delete this footer column and all its links?", "Delete Column")
        .then(ok => {
            if (ok && adminFooterState.columns) {
                adminFooterState.columns = adminFooterState.columns.filter(c => c.id !== colId);
                renderAdminFooterColumnsList();
                showToast('Column deleted', 'info');
            }
        });
}

function openAdminAddLinkModal(colId) {
    if (!adminFooterState) adminFooterState = getDefaultAdminFooterFallback();
    adminFooterState = ensureCompleteFooterState(adminFooterState);
    const modal = document.getElementById('admin-footer-link-modal');
    if (!modal) return;
    document.getElementById('admin-lnk-modal-title').textContent = "Add Footer Link";
    document.getElementById('admin-lnk-modal-col-id').value = colId;
    document.getElementById('admin-lnk-modal-id').value = "";
    document.getElementById('admin-lnk-modal-title-input').value = "";
    document.getElementById('admin-lnk-modal-url-input').value = "";
    document.getElementById('admin-lnk-modal-icon-input').value = "";
    document.getElementById('admin-lnk-modal-target-input').checked = false;
    document.getElementById('admin-lnk-modal-enabled-input').checked = true;
    modal.style.display = 'flex';
    modal.classList.add('active');
}

function openAdminEditLinkModal(colId, linkId) {
    const modal = document.getElementById('admin-footer-link-modal');
    if (!modal) return;
    const col = (adminFooterState && adminFooterState.columns || []).find(c => c.id === colId);
    if (!col) return;
    const link = (col.links || []).find(l => l.id === linkId);
    if (!link) return;

    document.getElementById('admin-lnk-modal-title').textContent = "Edit Footer Link";
    document.getElementById('admin-lnk-modal-col-id').value = colId;
    document.getElementById('admin-lnk-modal-id').value = link.id;
    document.getElementById('admin-lnk-modal-title-input').value = link.title;
    document.getElementById('admin-lnk-modal-url-input').value = link.url;
    document.getElementById('admin-lnk-modal-icon-input').value = link.icon || "";
    document.getElementById('admin-lnk-modal-target-input').checked = !!link.targetBlank;
    document.getElementById('admin-lnk-modal-enabled-input').checked = link.enabled !== false;
    modal.style.display = 'flex';
    modal.classList.add('active');
}

function closeAdminLinkModal() {
    const modal = document.getElementById('admin-footer-link-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
}

function saveAdminLinkModal(e) {
    e.preventDefault();
    const colId = document.getElementById('admin-lnk-modal-col-id').value;
    const linkId = document.getElementById('admin-lnk-modal-id').value;
    const title = document.getElementById('admin-lnk-modal-title-input').value.trim();
    const url = document.getElementById('admin-lnk-modal-url-input').value.trim();
    const icon = document.getElementById('admin-lnk-modal-icon-input').value.trim();
    const targetBlank = document.getElementById('admin-lnk-modal-target-input').checked;
    const enabled = document.getElementById('admin-lnk-modal-enabled-input').checked;

    const col = (adminFooterState.columns || []).find(c => c.id === colId);
    if (!col) return;
    if (!col.links) col.links = [];

    if (linkId) {
        const link = col.links.find(l => l.id === linkId);
        if (link) {
            link.title = title;
            link.url = url;
            link.icon = icon;
            link.targetBlank = targetBlank;
            link.enabled = enabled;
        }
    } else {
        col.links.push({
            id: 'lnk-' + Date.now(),
            title: title,
            url: url,
            icon: icon,
            targetBlank: targetBlank,
            enabled: enabled,
            order: col.links.length + 1
        });
    }

    closeAdminLinkModal();
    renderAdminFooterColumnsList();
    showToast('Link saved successfully', 'success');
}

function toggleAdminFooterLink(colId, linkId) {
    const col = (adminFooterState.columns || []).find(c => c.id === colId);
    if (!col) return;
    const link = (col.links || []).find(l => l.id === linkId);
    if (!link) return;
    link.enabled = (link.enabled === false);
    renderAdminFooterColumnsList();
}

function deleteAdminFooterLink(colId, linkId) {
    showAdminConfirm("Are you sure you want to delete this footer link?", "Delete Link")
        .then(ok => {
            if (ok) {
                const col = (adminFooterState.columns || []).find(c => c.id === colId);
                if (col && col.links) {
                    col.links = col.links.filter(l => l.id !== linkId);
                    renderAdminFooterColumnsList();
                    showToast('Link deleted', 'info');
                }
            }
        });
}

function openAdminAddSocialModal() {
    if (!adminFooterState) adminFooterState = getDefaultAdminFooterFallback();
    adminFooterState = ensureCompleteFooterState(adminFooterState);
    const modal = document.getElementById('admin-footer-social-modal');
    if (!modal) return;
    document.getElementById('admin-soc-modal-title').textContent = "Add Social Channel";
    document.getElementById('admin-soc-modal-id').value = "";
    document.getElementById('admin-soc-modal-platform-input').value = "";
    document.getElementById('admin-soc-modal-icon-input').value = "";
    document.getElementById('admin-soc-modal-url-input').value = "";
    document.getElementById('admin-soc-modal-enabled-input').checked = true;
    modal.style.display = 'flex';
    modal.classList.add('active');
}

function openAdminEditSocialModal(socId) {
    const modal = document.getElementById('admin-footer-social-modal');
    if (!modal) return;
    const s = (adminFooterState && adminFooterState.socialLinks || []).find(item => item.id === socId);
    if (!s) return;
    document.getElementById('admin-soc-modal-title').textContent = "Edit Social Channel";
    document.getElementById('admin-soc-modal-id').value = s.id;
    document.getElementById('admin-soc-modal-platform-input').value = s.platform;
    document.getElementById('admin-soc-modal-icon-input').value = s.icon || "";
    document.getElementById('admin-soc-modal-url-input').value = s.url;
    document.getElementById('admin-soc-modal-enabled-input').checked = s.enabled !== false;
    modal.style.display = 'flex';
    modal.classList.add('active');
}

function closeAdminSocialModal() {
    const modal = document.getElementById('admin-footer-social-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
}

function saveAdminSocialModal(e) {
    e.preventDefault();
    const id = document.getElementById('admin-soc-modal-id').value;
    const platform = document.getElementById('admin-soc-modal-platform-input').value.trim();
    const icon = document.getElementById('admin-soc-modal-icon-input').value.trim();
    const url = document.getElementById('admin-soc-modal-url-input').value.trim();
    const enabled = document.getElementById('admin-soc-modal-enabled-input').checked;

    if (!adminFooterState.socialLinks) adminFooterState.socialLinks = [];

    if (id) {
        const s = adminFooterState.socialLinks.find(item => item.id === id);
        if (s) {
            s.platform = platform;
            s.icon = icon;
            s.url = url;
            s.enabled = enabled;
        }
    } else {
        adminFooterState.socialLinks.push({
            id: 'soc-' + Date.now(),
            platform: platform,
            icon: icon,
            url: url,
            enabled: enabled,
            order: adminFooterState.socialLinks.length + 1
        });
    }

    closeAdminSocialModal();
    renderAdminFooterSocialList();
    showToast('Social channel saved', 'success');
}

function toggleAdminFooterSocial(socId) {
    const s = (adminFooterState.socialLinks || []).find(item => item.id === socId);
    if (!s) return;
    s.enabled = (s.enabled === false);
    renderAdminFooterSocialList();
}

function deleteAdminFooterSocial(socId) {
    showAdminConfirm("Are you sure you want to delete this social link?", "Delete Social Link")
        .then(ok => {
            if (ok && adminFooterState.socialLinks) {
                adminFooterState.socialLinks = adminFooterState.socialLinks.filter(s => s.id !== socId);
                renderAdminFooterSocialList();
                showToast('Social channel deleted', 'info');
            }
        });
}

function renderAdminFooterPreview() {
    collectAdminFooterFormValues();
    const previewContainer = document.getElementById('admin-footer-live-preview-box');
    if (!previewContainer) return;
    
    // Construct preview footer HTML
    const f = adminFooterState;
    if (!f || f.enabled === false) {
        previewContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 30px; font-size: 14px;"><i class="fa-solid fa-eye-slash" style="font-size: 24px; margin-bottom: 8px; display: block;"></i> Footer is currently disabled in General Settings.</div>';
        return;
    }

    const brand = f.brand || {};
    const contact = f.contact || {};
    const socialLinks = (f.socialLinks || []).filter(s => s.enabled !== false);
    const columns = (f.columns || []).filter(c => c.enabled !== false);
    const copyright = f.copyright || {};

    let socialHtml = socialLinks.map(s => {
        let iconClass = s.icon || 'fa-solid fa-link';
        if (iconClass.includes('x-twitter') || iconClass.includes('twitter')) {
            iconClass = 'fa-brands fa-x-twitter';
        }
        return `<span class="footer-social-btn"><i class="${escapeHtml(iconClass)}"></i></span>`;
    }).join(' ');
    
    let columnsHtml = columns.map(c => {
        const links = (c.links || []).filter(l => l.enabled !== false);
        return `
            <div class="footer-nav-col">
                <div class="footer-col-title">${escapeHtml(c.title)}</div>
                <ul class="footer-link-list">
                    ${links.map(l => `<li class="footer-link-item"><a href="#">${escapeHtml(l.title)}</a></li>`).join('')}
                </ul>
            </div>
        `;
    }).join('');

    let contactHtml = '';
    if (contact.enabled !== false) {
        const items = [];
        if (contact.supportEmail) items.push(`<div class="footer-contact-item"><i class="fa-solid fa-envelope"></i> <div>Support: ${escapeHtml(contact.supportEmail)}</div></div>`);
        if (contact.phone) items.push(`<div class="footer-contact-item"><i class="fa-solid fa-phone"></i> <div>Phone: ${escapeHtml(contact.phone)}</div></div>`);
        if (contact.address) items.push(`<div class="footer-contact-item"><i class="fa-solid fa-location-dot"></i> <div>${escapeHtml(contact.address)}</div></div>`);
        if (items.length > 0) {
            contactHtml = `<div class="footer-nav-col footer-contact-col"><div class="footer-col-title">Contact & Support</div><div class="footer-contact-block">${items.join('')}</div></div>`;
        }
    }

    previewContainer.innerHTML = `
        <div class="site-footer" style="margin-top: 0; background: transparent; border: none; padding: 0;">
            <div class="footer-top-grid">
                <div class="footer-brand-col">
                    <div class="footer-brand-logo">
                        <div class="footer-logo-icon">
                            ${(brand.logoUrl && brand.logoUrl.trim()) || (brand.logoIcon && (brand.logoIcon.startsWith('http') || brand.logoIcon.startsWith('/') || brand.logoIcon.startsWith('data:'))) ?
                                `<img src="${escapeHtml(brand.logoUrl && brand.logoUrl.trim() ? brand.logoUrl.trim() : brand.logoIcon.trim())}" alt="${escapeHtml(brand.appName || 'Logo')}" class="footer-logo-img">` :
                                `<i class="${escapeHtml(brand.logoIcon || 'fa-solid fa-wand-magic-sparkles')}"></i>`}
                        </div>
                        <div>
                            <div class="footer-brand-title">${escapeHtml(brand.appName || 'Auto-Checker')}</div>
                            <div class="footer-brand-tagline">${escapeHtml(brand.tagline || 'Automated Website Spelling Engine')}</div>
                        </div>
                    </div>
                    <p class="footer-brand-desc">${escapeHtml(brand.description || '')}</p>
                    <div class="footer-social-links">${socialHtml}</div>
                </div>
                ${columnsHtml}
                ${contactHtml}
            </div>
            <div class="footer-bottom-bar" style="border-top: 1px solid rgba(255,255,255,0.08); margin-top: 20px; padding-top: 16px;">
                <div>© ${new Date().getFullYear()} ${escapeHtml(copyright.companyName || 'Auto-Checker')}. ${escapeHtml(copyright.suffixText || '')}</div>
            </div>
        </div>
    `;
}

window.loadAdminFooterSettings = loadAdminFooterSettings;
window.saveAdminFooterSettings = saveAdminFooterSettings;
window.switchFooterAdminTab = switchFooterAdminTab;
window.openAdminAddColumnModal = openAdminAddColumnModal;
window.openAdminEditColumnModal = openAdminEditColumnModal;
window.closeAdminColumnModal = closeAdminColumnModal;
window.saveAdminColumnModal = saveAdminColumnModal;
window.deleteAdminFooterColumn = deleteAdminFooterColumn;
window.openAdminAddLinkModal = openAdminAddLinkModal;
window.openAdminEditLinkModal = openAdminEditLinkModal;
window.closeAdminLinkModal = closeAdminLinkModal;
window.saveAdminLinkModal = saveAdminLinkModal;
window.toggleAdminFooterLink = toggleAdminFooterLink;
window.deleteAdminFooterLink = deleteAdminFooterLink;
window.openAdminAddSocialModal = openAdminAddSocialModal;
window.openAdminEditSocialModal = openAdminEditSocialModal;
window.closeAdminSocialModal = closeAdminSocialModal;
window.saveAdminSocialModal = saveAdminSocialModal;
window.toggleAdminFooterSocial = toggleAdminFooterSocial;
window.deleteAdminFooterSocial = deleteAdminFooterSocial;
window.renderAdminFooterPreview = renderAdminFooterPreview;
window.renderAdminPagesList = renderAdminPagesList;
window.deleteAdminFooterSocial = deleteAdminFooterSocial;
window.saveAdminWidgetSettings = saveAdminWidgetSettings;
