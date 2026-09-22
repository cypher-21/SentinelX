/**
 * SentinelX Master Application Bootstrap & Global Event Coordinator
 */

const App = {
    toastContainer: null,

    async init() {
        this.toastContainer = document.getElementById('toast-container');

        // Apply saved theme immediately
        const savedTheme = localStorage.getItem('sentinelx_theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);

        // Apply saved sidebar state
        if (localStorage.getItem('sentinelx_sidebar_collapsed') === 'true') {
            document.getElementById('app-container')?.classList.add('sidebar-collapsed');
        }

        // Initialize sub-modules
        Panels.init();
        Chat.init();
        Models.init();

        this.bindGlobalEvents();
        await this.loadSessions();

        // If no sessions, automatically create first one
        if (AppState.sessions.length === 0) {
            await this.createNewSession('Initial Assessment');
        } else {
            // Select the most recent session
            await Chat.loadSession(AppState.sessions[0].id);
        }
    },

    bindGlobalEvents() {
        // Sidebar Toggle Handlers (Both navbar hamburger and sidebar panel button)
        const toggleSidebar = () => {
            const appContainer = document.getElementById('app-container');
            if (appContainer) {
                appContainer.classList.toggle('sidebar-collapsed');
                const isCollapsed = appContainer.classList.contains('sidebar-collapsed');
                localStorage.setItem('sentinelx_sidebar_collapsed', isCollapsed ? 'true' : 'false');
            }
        };

        const toggleSidebarBtn = document.getElementById('btn-toggle-sidebar');
        if (toggleSidebarBtn) {
            toggleSidebarBtn.addEventListener('click', (e) => {
                e.preventDefault();
                toggleSidebar();
            });
        }

        const collapseSidebarBtn = document.getElementById('btn-collapse-sidebar');
        if (collapseSidebarBtn) {
            collapseSidebarBtn.addEventListener('click', (e) => {
                e.preventDefault();
                toggleSidebar();
            });
        }

        // Light / Dark Theme Switch Toggle
        const toggleThemeBtn = document.getElementById('btn-toggle-theme');
        if (toggleThemeBtn) {
            toggleThemeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const current = document.documentElement.getAttribute('data-theme') || 'dark';
                const next = current === 'dark' ? 'light' : 'dark';
                document.documentElement.setAttribute('data-theme', next);
                localStorage.setItem('sentinelx_theme', next);
                this.showToast(`Theme switched to ${next} mode`, 'info');
            });
        }

        // New Chat Button
        const newChatBtn = document.getElementById('btn-new-chat');
        if (newChatBtn) {
            newChatBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.createNewSession();
            });
        }

        // Export Chat Button
        const exportBtn = document.getElementById('btn-export-chat');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                if (!AppState.currentSessionId) {
                    this.showToast('No active conversation to export.', 'info');
                    return;
                }
                window.location.href = `/api/sessions/${AppState.currentSessionId}/export`;
            });
        }

        // Global Keyboard Shortcuts
        document.addEventListener('keydown', (e) => {
            // Esc stops active generation or closes open drawers/modals
            if (e.key === 'Escape') {
                if (AppState.isStreaming) {
                    Chat.stopGeneration();
                } else {
                    Panels.closeAll();
                    Models.closePullModal();
                }
            }

            // Quick Hotkeys (Ctrl+Shift+P for Payloads)
            if (e.ctrlKey && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
                e.preventDefault();
                Panels.togglePayloads();
            }
        });
    },

    async loadSessions() {
        const listEl = document.getElementById('sessions-list');
        if (!listEl) return;

        const res = await API.getSessions();
        if (res.success) {
            AppState.sessions = res.sessions || [];

            if (AppState.sessions.length === 0) {
                listEl.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px 10px;">No conversations yet.</div>';
                return;
            }

            listEl.innerHTML = AppState.sessions.map(s => `
                <div class="session-item ${s.id === AppState.currentSessionId ? 'active' : ''}" 
                     data-id="${s.id}" 
                     onclick="Chat.loadSession('${s.id}')">
                    <span class="session-name" title="${s.name || 'Chat'}">${s.name || 'Chat'}</span>
                    <button class="session-delete-btn" type="button" onclick="event.stopPropagation(); App.deleteSession('${s.id}')" title="Delete Chat">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            `).join('');
        }
    },

    async createNewSession(customName = null) {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const name = customName || `Assessment ${timeStr}`;
        const res = await API.createSession(name, AppState.activeModel);
        if (res.success) {
            await this.loadSessions();
            await Chat.loadSession(res.session_id);
            this.showToast(`Started new session: ${name}`, 'info');
            const input = document.getElementById('prompt-input');
            if (input) input.focus();
        }
    },

    async deleteSession(sessionId) {
        if (!confirm('Are you sure you want to delete this conversation?')) return;

        const res = await API.deleteSession(sessionId);
        if (res.success) {
            this.showToast('Session deleted.', 'info');
            await this.loadSessions();
            if (AppState.currentSessionId === sessionId) {
                if (AppState.sessions.length > 0) {
                    await Chat.loadSession(AppState.sessions[0].id);
                } else {
                    await this.createNewSession('New Assessment');
                }
            }
        }
    },

    showToast(message, type = 'info') {
        if (!this.toastContainer) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        let iconSvg = '';
        if (type === 'success') {
            iconSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--status-green)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        } else if (type === 'error') {
            iconSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--crit-red)" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
        } else {
            iconSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
        }

        toast.innerHTML = `${iconSvg} <span>${message}</span>`;
        this.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            toast.style.transition = 'all 0.25s ease';
            setTimeout(() => toast.remove(), 250);
        }, 3200);
    }
};

window.App = App;

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
