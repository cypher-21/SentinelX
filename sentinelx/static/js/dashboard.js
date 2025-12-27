/* SentinelX Dashboard JavaScript */

// State
let currentWorkspace = 'recon';
let currentSession = null;
let sessions = [];
let isStreaming = false;

// DOM Elements
const workspaceList = document.getElementById('workspace-list');
const sessionList = document.getElementById('session-list');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const modelSelect = document.getElementById('model-select');
const workspaceIndicator = document.getElementById('workspace-indicator');

// Panels
const targetsPanel = document.getElementById('targets-panel');
const payloadsPanel = document.getElementById('payloads-panel');
const quickModal = document.getElementById('quick-modal');

// Workspaces data (will be populated from server)
let workspacesData = {};

// ============ Initialization ============

document.addEventListener('DOMContentLoaded', async () => {
    await loadWorkspaces();
    await loadModels();
    await loadSessions();
    await loadTargets();
    attachEventListeners();
});

function attachEventListeners() {
    // Workspace switching
    document.querySelectorAll('.workspace-btn').forEach(btn => {
        btn.addEventListener('click', () => switchWorkspace(btn.dataset.workspace));
    });

    // New session
    document.getElementById('new-session-btn').addEventListener('click', createSession);

    // Send message
    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Auto-resize input
    chatInput.addEventListener('input', autoResizeInput);

    // Panel buttons
    document.getElementById('targets-btn').addEventListener('click', () => togglePanel(targetsPanel));
    document.getElementById('payloads-btn').addEventListener('click', () => {
        loadPayloads();
        togglePanel(payloadsPanel);
    });
    document.getElementById('quick-payload-btn').addEventListener('click', () => {
        loadQuickPayloads();
        quickModal.classList.add('open');
    });

    // Close panels
    document.querySelectorAll('.close-panel-btn').forEach(btn => {
        btn.addEventListener('click', () => btn.closest('.right-panel').classList.remove('open'));
    });

    // Close modals
    document.querySelectorAll('.close-modal-btn').forEach(btn => {
        btn.addEventListener('click', () => btn.closest('.modal').classList.remove('open'));
    });

    // Targets
    document.getElementById('add-target-btn').addEventListener('click', addTarget);
    document.getElementById('target-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') addTarget();
    });
}

function autoResizeInput() {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 150) + 'px';
}

// ============ Workspaces ============

async function loadWorkspaces() {
    try {
        const res = await fetch('/api/workspaces');
        const data = await res.json();
        workspacesData = data.workspaces;
    } catch (e) {
        console.error('Failed to load workspaces:', e);
    }
}

function switchWorkspace(workspace) {
    currentWorkspace = workspace;
    currentSession = null;

    // Update UI
    document.querySelectorAll('.workspace-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.workspace === workspace);
    });

    // Update indicator
    const ws = workspacesData[workspace];
    if (ws) {
        workspaceIndicator.innerHTML = `
            <i class="fas ${ws.icon}" style="color: ${ws.color}"></i>
            <span>${ws.name}</span>
        `;
    }

    // Load sessions for this workspace
    loadSessions();

    // Clear chat
    showWelcome();
}

// ============ Sessions ============

async function loadSessions() {
    try {
        const res = await fetch(`/api/sessions?workspace=${currentWorkspace}`);
        const data = await res.json();
        sessions = data.sessions;
        renderSessions();
    } catch (e) {
        console.error('Failed to load sessions:', e);
    }
}

function renderSessions() {
    sessionList.innerHTML = '';

    if (sessions.length === 0) {
        sessionList.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; padding: 8px;">No sessions yet</div>';
        return;
    }

    sessions.forEach(s => {
        const item = document.createElement('div');
        item.className = 'session-item' + (currentSession === s.id ? ' active' : '');
        item.innerHTML = `
            <span>${escapeHtml(s.name || 'Session ' + s.id)}</span>
            <button title="Delete"><i class="fas fa-trash"></i></button>
        `;

        item.querySelector('span').addEventListener('click', () => selectSession(s.id));
        item.querySelector('button').addEventListener('click', e => {
            e.stopPropagation();
            deleteSession(s.id);
        });

        sessionList.appendChild(item);
    });
}

async function createSession() {
    try {
        const res = await fetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workspace: currentWorkspace })
        });
        const data = await res.json();

        await loadSessions();
        selectSession(data.session_id);
    } catch (e) {
        console.error('Failed to create session:', e);
    }
}

async function selectSession(sessionId) {
    currentSession = sessionId;

    // Update UI
    document.querySelectorAll('.session-item').forEach(item => {
        item.classList.remove('active');
    });

    // Load messages
    try {
        const res = await fetch(`/api/sessions/${sessionId}/messages`);
        const data = await res.json();

        chatMessages.innerHTML = '';

        if (data.messages.length === 0) {
            showWelcome();
        } else {
            data.messages.forEach(m => appendMessage(m.role, m.content, false));
        }
    } catch (e) {
        console.error('Failed to load messages:', e);
    }

    renderSessions();
}

async function deleteSession(sessionId) {
    try {
        await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });

        if (currentSession === sessionId) {
            currentSession = null;
            showWelcome();
        }

        await loadSessions();
    } catch (e) {
        console.error('Failed to delete session:', e);
    }
}

// ============ Chat ============

function showWelcome() {
    chatMessages.innerHTML = `
        <div class="welcome-message">
            <div class="welcome-icon"><i class="fas fa-shield-virus"></i></div>
            <h1>SentinelX</h1>
            <p>Offensive Security Intelligence Platform</p>
            <div class="welcome-features">
                <div class="feature"><i class="fas fa-bug"></i><span>Exploit Development</span></div>
                <div class="feature"><i class="fas fa-virus"></i><span>Malware Engineering</span></div>
                <div class="feature"><i class="fas fa-file-code"></i><span>Payload Generation</span></div>
                <div class="feature"><i class="fas fa-unlock-alt"></i><span>Post-Exploitation</span></div>
            </div>
            <p class="welcome-hint">No restrictions. Full red team capabilities.</p>
        </div>
    `;
}

async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text || isStreaming) return;

    // Create session if needed
    if (!currentSession) {
        await createSession();
    }

    // Clear welcome
    const welcome = chatMessages.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    // Add user message
    appendMessage('user', text, false);

    // Clear input
    chatInput.value = '';
    chatInput.style.height = 'auto';

    // Add assistant placeholder
    const assistantRow = appendMessage('assistant', '', true);
    const contentEl = assistantRow.querySelector('.message-content');

    // Show typing indicator
    contentEl.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';

    // Stream response
    isStreaming = true;

    try {
        const res = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: text,
                session_id: currentSession,
                workspace: currentWorkspace,
                model: modelSelect.value
            })
        });

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        // Clear typing indicator
        contentEl.innerHTML = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            fullText += decoder.decode(value, { stream: true });
            contentEl.innerHTML = DOMPurify.sanitize(marked.parse(fullText));
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        // Add copy buttons to code blocks
        addCopyButtons(contentEl);

    } catch (e) {
        contentEl.innerHTML = `<span style="color: var(--accent-red)">Error: ${e.message}</span>`;
    }

    isStreaming = false;
}

function appendMessage(role, content, isPlaceholder = false) {
    const row = document.createElement('div');
    row.className = `message-row ${role}`;

    const icon = role === 'user' ? 'fa-user' : 'fa-shield-virus';
    const parsedContent = isPlaceholder ? '' : DOMPurify.sanitize(marked.parse(content));

    row.innerHTML = `
        <div class="message-avatar"><i class="fas ${icon}"></i></div>
        <div class="message-content">${parsedContent}</div>
    `;

    chatMessages.appendChild(row);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    if (!isPlaceholder) {
        addCopyButtons(row.querySelector('.message-content'));
    }

    return row;
}

function addCopyButtons(container) {
    container.querySelectorAll('pre').forEach(pre => {
        if (pre.querySelector('.code-copy-btn')) return;

        const btn = document.createElement('button');
        btn.className = 'code-copy-btn';
        btn.innerHTML = '<i class="fas fa-copy"></i> Copy';
        btn.addEventListener('click', () => {
            const code = pre.querySelector('code')?.textContent || pre.textContent;
            navigator.clipboard.writeText(code);
            btn.innerHTML = '<i class="fas fa-check"></i> Copied';
            setTimeout(() => btn.innerHTML = '<i class="fas fa-copy"></i> Copy', 2000);
        });

        pre.style.position = 'relative';
        pre.appendChild(btn);
    });
}

// ============ Targets ============

async function loadTargets() {
    try {
        const res = await fetch('/api/targets');
        const data = await res.json();
        renderTargets(data.targets);
    } catch (e) {
        console.error('Failed to load targets:', e);
    }
}

function renderTargets(targets) {
    const list = document.getElementById('target-list');
    list.innerHTML = '';

    targets.forEach(t => {
        const item = document.createElement('div');
        item.className = 'target-item';
        item.innerHTML = `
            <span>${escapeHtml(t.value)}</span>
            <button><i class="fas fa-times"></i></button>
        `;

        item.querySelector('button').addEventListener('click', () => deleteTarget(t.id));
        list.appendChild(item);
    });
}

async function addTarget() {
    const input = document.getElementById('target-input');
    const value = input.value.trim();
    if (!value) return;

    try {
        await fetch('/api/targets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value })
        });

        input.value = '';
        await loadTargets();
    } catch (e) {
        console.error('Failed to add target:', e);
    }
}

async function deleteTarget(id) {
    try {
        await fetch(`/api/targets/${id}`, { method: 'DELETE' });
        await loadTargets();
    } catch (e) {
        console.error('Failed to delete target:', e);
    }
}

// ============ Payloads ============

async function loadPayloads() {
    try {
        const res = await fetch('/api/payloads');
        const data = await res.json();
        renderPayloads(data.payloads);
    } catch (e) {
        console.error('Failed to load payloads:', e);
    }
}

function renderPayloads(payloads) {
    const list = document.getElementById('payload-list');
    list.innerHTML = '';

    if (payloads.length === 0) {
        list.innerHTML = '<div style="color: var(--text-muted); text-align: center;">No saved payloads</div>';
        return;
    }

    payloads.forEach(p => {
        const item = document.createElement('div');
        item.className = 'payload-item';
        item.innerHTML = `
            <div class="payload-item-header">
                <span class="payload-item-name">${escapeHtml(p.name)}</span>
                <span class="payload-item-lang">${p.language || 'text'}</span>
            </div>
            <pre>${escapeHtml(p.code.substring(0, 200))}${p.code.length > 200 ? '...' : ''}</pre>
        `;
        list.appendChild(item);
    });
}

async function loadQuickPayloads() {
    try {
        const res = await fetch('/api/quick-payloads');
        const data = await res.json();
        renderQuickPayloads(data.payloads);
    } catch (e) {
        console.error('Failed to load quick payloads:', e);
    }
}

function renderQuickPayloads(payloads) {
    const grid = document.getElementById('quick-payload-list');
    grid.innerHTML = '';

    Object.entries(payloads).forEach(([id, p]) => {
        const card = document.createElement('div');
        card.className = 'quick-payload-card';
        card.innerHTML = `
            <h4><i class="fas fa-terminal"></i> ${p.name}</h4>
            <code>${escapeHtml(p.code.substring(0, 50))}...</code>
        `;

        card.addEventListener('click', () => {
            const lhost = document.getElementById('lhost-input').value || 'LHOST';
            const lport = document.getElementById('lport-input').value || 'LPORT';

            let code = p.code.replace(/LHOST/g, lhost).replace(/LPORT/g, lport);

            navigator.clipboard.writeText(code);
            card.querySelector('h4').innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(() => {
                card.querySelector('h4').innerHTML = `<i class="fas fa-terminal"></i> ${p.name}`;
            }, 1500);
        });

        grid.appendChild(card);
    });
}

// ============ Models ============

async function loadModels() {
    try {
        const res = await fetch('/api/models');
        const data = await res.json();

        modelSelect.innerHTML = '';

        const models = data.models || ['sentinelx'];
        models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            if (m.includes('sentinelx')) opt.selected = true;
            modelSelect.appendChild(opt);
        });
    } catch (e) {
        modelSelect.innerHTML = '<option value="sentinelx">sentinelx</option>';
    }
}

// ============ Utilities ============

function togglePanel(panel) {
    document.querySelectorAll('.right-panel').forEach(p => {
        if (p !== panel) p.classList.remove('open');
    });
    panel.classList.toggle('open');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
