/**
 * SentinelX Custom Dynamic Ollama Model Dropdown & Puller Controller
 */

const Models = {
    triggerBtn: null,
    modelLabel: null,
    menuEl: null,
    listEl: null,
    searchInput: null,
    countEl: null,
    statusDot: null,

    // Pull modal elements
    pullModal: null,
    pullInput: null,
    pullBtn: null,
    progressContainer: null,
    progressBar: null,
    progressText: null,

    init() {
        this.triggerBtn = document.getElementById('model-dropdown-trigger');
        this.modelLabel = document.getElementById('header-active-model-name');
        this.menuEl = document.getElementById('model-dropdown-menu');
        this.listEl = document.getElementById('model-dropdown-list');
        this.searchInput = document.getElementById('model-search-input');
        this.countEl = document.getElementById('dropdown-model-count');
        this.statusDot = document.getElementById('ollama-status-dot');

        this.pullModal = document.getElementById('modal-pull-model');
        this.pullInput = document.getElementById('pull-model-input');
        this.pullBtn = document.getElementById('btn-confirm-pull');
        this.progressContainer = document.getElementById('pull-progress-container');
        this.progressBar = document.getElementById('pull-progress-bar');
        this.progressText = document.getElementById('pull-status-text');

        this.bindEvents();
        this.refreshModels();
    },

    bindEvents() {
        // Toggle dropdown open/close
        if (this.triggerBtn) {
            this.triggerBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleDropdown();
            });
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (this.menuEl && !this.menuEl.contains(e.target) && !this.triggerBtn.contains(e.target)) {
                this.closeDropdown();
            }
        });

        // Search input filter
        if (this.searchInput) {
            this.searchInput.addEventListener('input', (e) => {
                this.filterModels(e.target.value.trim().toLowerCase());
            });
            this.searchInput.addEventListener('click', (e) => e.stopPropagation());
        }

        // Pull shortcut inside dropdown
        const pullShortcut = document.getElementById('btn-dropdown-pull-shortcut');
        if (pullShortcut) {
            pullShortcut.addEventListener('click', () => {
                this.closeDropdown();
                this.openPullModal();
            });
        }

        // Sidebar pull button
        const openPullBtn = document.getElementById('btn-open-pull-modal');
        if (openPullBtn) {
            openPullBtn.addEventListener('click', () => this.openPullModal());
        }

        // Close pull modal
        const closePullBtn = document.getElementById('btn-close-pull-modal');
        if (closePullBtn) {
            closePullBtn.addEventListener('click', () => this.closePullModal());
        }

        // Execute pull action
        if (this.pullBtn && this.pullInput) {
            this.pullBtn.addEventListener('click', () => this.executePull());
            this.pullInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.executePull();
            });
        }
    },

    toggleDropdown() {
        if (!this.menuEl) return;
        const isOpen = this.menuEl.classList.contains('open');
        if (isOpen) {
            this.closeDropdown();
        } else {
            this.openDropdown();
        }
    },

    openDropdown() {
        if (!this.menuEl || !this.triggerBtn) return;
        this.menuEl.classList.add('open');
        this.triggerBtn.setAttribute('aria-expanded', 'true');
        if (this.searchInput) {
            this.searchInput.value = '';
            this.filterModels('');
            setTimeout(() => this.searchInput.focus(), 50);
        }
    },

    closeDropdown() {
        if (!this.menuEl || !this.triggerBtn) return;
        this.menuEl.classList.remove('open');
        this.triggerBtn.setAttribute('aria-expanded', 'false');
    },

    openPullModal() {
        if (this.pullModal) {
            this.pullModal.classList.add('open');
            if (this.pullInput) this.pullInput.focus();
        }
    },

    closePullModal() {
        if (this.pullModal) {
            this.pullModal.classList.remove('open');
        }
    },

    async refreshModels() {
        try {
            const res = await API.getModels();
            if (res.success && res.ollama) {
                AppState.isOllamaConnected = true;
                AppState.models = res.models || [];

                if (this.statusDot) {
                    this.statusDot.className = 'status-dot online';
                    this.statusDot.title = `Ollama Online (${AppState.models.length} models installed)`;
                }

                if (this.countEl) {
                    this.countEl.textContent = `${AppState.models.length} available`;
                }

                this.renderDropdown();
            } else {
                this.handleOllamaOffline(res.error || 'Ollama unreachable');
            }
        } catch (e) {
            this.handleOllamaOffline(e.message);
        }
    },

    handleOllamaOffline(msg) {
        AppState.isOllamaConnected = false;
        if (this.statusDot) {
            this.statusDot.className = 'status-dot offline';
            this.statusDot.title = `Ollama Offline: ${msg}`;
        }
        if (this.modelLabel) {
            this.modelLabel.textContent = `${AppState.activeModel} (Offline)`;
        }
        if (this.listEl) {
            this.listEl.innerHTML = '<div style="padding:14px;color:var(--text-muted);font-size:12px;text-align:center;">Ollama is offline. Start `ollama serve`.</div>';
        }
    },

    renderDropdown() {
        if (!this.listEl) return;

        if (AppState.models.length === 0) {
            this.listEl.innerHTML = '<div style="padding:14px;color:var(--text-muted);font-size:12px;text-align:center;">No models installed in Ollama.</div>';
            return;
        }

        // Ensure active model is valid
        const exists = AppState.models.some(m => m.name === AppState.activeModel);
        if (!exists && AppState.models.length > 0) {
            AppState.activeModel = AppState.models[0].name;
        }

        this.updateActiveModelDisplay();
        this.filterModels('');
    },

    filterModels(filterText) {
        if (!this.listEl) return;

        const filtered = AppState.models.filter(m => 
            !filterText || m.name.toLowerCase().includes(filterText) || m.family.toLowerCase().includes(filterText)
        );

        if (filtered.length === 0) {
            this.listEl.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:12px;text-align:center;">No matching models.</div>';
            return;
        }

        this.listEl.innerHTML = filtered.map(m => {
            const isActive = m.name === AppState.activeModel;
            const param = m.parameter_size !== 'unknown' ? m.parameter_size : '';
            return `
                <div class="model-dropdown-item ${isActive ? 'active' : ''}" 
                     onclick="Models.selectModel('${m.name}')">
                    <div class="model-item-info">
                        <span class="model-item-name mono" title="${m.name}">${m.name}</span>
                        <div class="model-item-tags">
                            ${param ? `<span class="tag-pill tag-param">${param}</span>` : ''}
                            <span class="tag-pill tag-family">${m.family}</span>
                        </div>
                    </div>
                    <span class="model-check-icon">✓</span>
                </div>
            `;
        }).join('');
    },

    selectModel(modelName) {
        AppState.activeModel = modelName;
        this.updateActiveModelDisplay();
        this.closeDropdown();
        window.App.showToast(`Active model switched to: ${modelName}`, 'info');

        // Persist for active session if any
        if (AppState.currentSessionId) {
            const session = AppState.sessions.find(s => s.id === AppState.currentSessionId);
            if (session) session.model = modelName;
        }

        // Re-render items to update checkmark
        this.filterModels(this.searchInput ? this.searchInput.value.trim().toLowerCase() : '');
    },

    updateActiveModelDisplay() {
        if (this.modelLabel) {
            this.modelLabel.textContent = AppState.activeModel;
            this.modelLabel.title = AppState.activeModel;
        }
        const promptBadge = document.getElementById('active-model-name');
        if (promptBadge) {
            promptBadge.textContent = AppState.activeModel;
        }
    },

    async executePull() {
        const modelName = this.pullInput.value.trim();
        if (!modelName) {
            window.App.showToast('Please specify a model name (e.g. qwen2.5:7b, deepseek-r1:14b).', 'error');
            return;
        }

        this.pullBtn.disabled = true;
        this.progressContainer.classList.add('visible');
        this.progressBar.style.width = '0%';
        this.progressText.innerHTML = `<span>Starting download for <b>${modelName}</b>...</span><span>0%</span>`;

        await API.pullModel(
            modelName,
            (progress) => {
                const status = progress.status || 'Downloading...';
                if (progress.total && progress.completed) {
                    const pct = Math.round((progress.completed / progress.total) * 100);
                    this.progressBar.style.width = pct + '%';
                    this.progressText.innerHTML = `<span>${status}</span><span>${pct}%</span>`;
                } else {
                    this.progressText.innerHTML = `<span>${status}</span><span>...</span>`;
                }
            },
            async () => {
                this.progressBar.style.width = '100%';
                this.progressText.innerHTML = `<span style="color:var(--status-green);">Successfully installed ${modelName}!</span><span>100%</span>`;
                this.pullBtn.disabled = false;
                window.App.showToast(`Model ${modelName} installed and ready.`, 'success');

                // Refresh models and select newly pulled model
                AppState.activeModel = modelName;
                await this.refreshModels();
                setTimeout(() => this.closePullModal(), 1500);
            },
            (err) => {
                this.progressText.innerHTML = `<span style="color:var(--crit-red);">${err}</span><span>Failed</span>`;
                this.pullBtn.disabled = false;
                window.App.showToast(`Pull error: ${err}`, 'error');
            }
        );
    }
};

window.Models = Models;
