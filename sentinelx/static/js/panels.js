/**
 * SentinelX Tactical Payloads Drawer & Generator Controller
 */

const Panels = {
    backdrop: null,
    payloadDrawer: null,
    activePayloadCategory: 'Reverse Shells',

    init() {
        this.backdrop = document.getElementById('side-drawer-backdrop');
        this.payloadDrawer = document.getElementById('drawer-payloads');

        const toggleBtn = document.getElementById('btn-toggle-payloads');
        const closeBtn = document.getElementById('btn-close-payloads');

        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.togglePayloads());
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeAll());
        }

        if (this.backdrop) {
            this.backdrop.addEventListener('click', () => this.closeAll());
        }

        this.bindPayloadVars();
    },

    togglePayloads() {
        if (this.payloadDrawer && this.payloadDrawer.classList.contains('open')) {
            this.closeAll();
        } else {
            this.openPayloads();
        }
    },

    openPayloads() {
        if (this.payloadDrawer && this.backdrop) {
            this.payloadDrawer.classList.add('open');
            this.backdrop.classList.add('open');
            this.loadPayloads();
        }
    },

    closeAll() {
        if (this.payloadDrawer) {
            this.payloadDrawer.classList.remove('open');
        }
        if (this.backdrop) {
            this.backdrop.classList.remove('open');
        }
    },

    bindPayloadVars() {
        const lhostInput = document.getElementById('payload-lhost');
        const lportInput = document.getElementById('payload-lport');

        if (lhostInput) {
            lhostInput.value = AppState.lhost;
            lhostInput.addEventListener('input', (e) => {
                AppState.setLhost(e.target.value.trim() || '10.10.14.X');
                this.renderPayloadsList();
            });
        }

        if (lportInput) {
            lportInput.value = AppState.lport;
            lportInput.addEventListener('input', (e) => {
                AppState.setLport(e.target.value.trim() || '9001');
                this.renderPayloadsList();
            });
        }
    },

    async loadPayloads() {
        if (Object.keys(AppState.payloadsCatalog).length === 0) {
            const res = await API.getQuickPayloads();
            if (res.success) {
                AppState.payloadsCatalog = res.payloads || {};
            }
        }
        this.renderPayloadTabs();
        this.renderPayloadsList();
    },

    renderPayloadTabs() {
        const tabsEl = document.getElementById('payload-tabs');
        if (!tabsEl) return;

        const categories = [...new Set(Object.values(AppState.payloadsCatalog).map(p => p.category))];
        if (!categories.includes(this.activePayloadCategory) && categories.length > 0) {
            this.activePayloadCategory = categories[0];
        }

        tabsEl.innerHTML = categories.map(cat => `
            <button class="payload-tab-btn ${cat === this.activePayloadCategory ? 'active' : ''}" 
                    type="button"
                    onclick="Panels.switchPayloadCategory('${cat}')">
                ${cat}
            </button>
        `).join('');
    },

    switchPayloadCategory(cat) {
        this.activePayloadCategory = cat;
        this.renderPayloadTabs();
        this.renderPayloadsList();
    },

    renderPayloadsList() {
        const listEl = document.getElementById('payloads-list');
        if (!listEl) return;

        const filtered = Object.entries(AppState.payloadsCatalog).filter(([_, p]) => p.category === this.activePayloadCategory);
        
        if (filtered.length === 0) {
            listEl.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:16px;">No payloads in this category.</div>';
            return;
        }

        listEl.innerHTML = filtered.map(([key, p]) => {
            const substituted = p.code
                .replace(/{LHOST}/g, AppState.lhost)
                .replace(/{LPORT}/g, AppState.lport)
                .replace(/LHOST/g, AppState.lhost)
                .replace(/LPORT/g, AppState.lport);

            const encoded = encodeURIComponent(substituted);

            return `
                <div class="payload-card">
                    <div class="payload-card-header">
                        <span class="payload-name">${p.name}</span>
                        <button class="btn-copy-code" type="button" onclick="Panels.copyPayload(this, decodeURIComponent('${encoded}'))">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            Copy
                        </button>
                    </div>
                    <div class="payload-code-preview">${this.escapeHtml(substituted)}</div>
                </div>
            `;
        }).join('');
    },

    copyPayload(btn, text) {
        navigator.clipboard.writeText(text).then(() => {
            const original = btn.innerHTML;
            btn.innerHTML = `<span style="color:var(--status-green);">Copied!</span>`;
            setTimeout(() => { btn.innerHTML = original; }, 1800);
            window.App.showToast('Payload copied to clipboard with LHOST/LPORT substituted.', 'success');
        });
    },

    escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
};

window.Panels = Panels;
