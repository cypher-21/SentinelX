/**
 * SentinelX Chat Viewport, Terminal Code Block Engine, & Streaming Controller
 */

const Chat = {
    container: null,
    scrollViewport: null,
    promptInput: null,
    sendBtn: null,
    stopBtn: null,

    init() {
        this.scrollViewport = document.getElementById('chat-container');
        this.container = document.getElementById('chat-inner') || this.scrollViewport;
        this.promptInput = document.getElementById('prompt-input');
        this.sendBtn = document.getElementById('btn-send');
        this.stopBtn = document.getElementById('btn-stop');

        this.bindEvents();
    },

    bindEvents() {
        if (this.sendBtn) {
            this.sendBtn.addEventListener('click', () => this.sendMessage());
        }

        if (this.stopBtn) {
            this.stopBtn.addEventListener('click', () => this.stopGeneration());
        }

        if (this.promptInput) {
            this.promptInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });

            // Auto-resize input with calibrated technical bounds
            this.promptInput.addEventListener('input', () => {
                this.promptInput.style.height = 'auto';
                this.promptInput.style.height = Math.min(Math.max(this.promptInput.scrollHeight, 40), 180) + 'px';
            });
        }
    },

    // Markdown Parser with Terminal Card Support
    renderMarkdown(text) {
        if (!text) return '';

        let html = '';

        // If marked and DOMPurify are loaded via window, use them
        if (window.marked && window.DOMPurify) {
            try {
                html = DOMPurify.sanitize(marked.parse(text));
                return html;
            } catch (e) {
                // fallback to internal parser
            }
        }

        // Robust Fallback Markdown Renderer
        let raw = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Fenced code blocks
        raw = raw.replace(/```([a-zA-Z0-9_\-+]*)\n([\s\S]*?)```/g, (match, lang, code) => {
            const displayLang = lang || 'command';
            const cleanCode = code.trim();
            return `
                <div class="terminal-card">
                    <div class="terminal-card-header">
                        <div class="terminal-header-left">
                            <div class="terminal-dots">
                                <span class="terminal-dot dot-red"></span>
                                <span class="terminal-dot dot-yellow"></span>
                                <span class="terminal-dot dot-green"></span>
                            </div>
                            <span class="terminal-title mono">$_ ${displayLang}</span>
                        </div>
                        <button class="btn-copy-command" type="button" onclick="Chat.copyCommand(this)">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            Copy
                        </button>
                    </div>
                    <div class="terminal-card-body">
                        <pre><code class="language-${displayLang}">${cleanCode}</code></pre>
                    </div>
                </div>
            `;
        });

        // Headers
        raw = raw.replace(/^### (.*$)/gim, '<h3>$1</h3>');
        raw = raw.replace(/^## (.*$)/gim, '<h2>$1</h2>');
        raw = raw.replace(/^# (.*$)/gim, '<h1>$1</h1>');

        // Bold & Italic
        raw = raw.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
        raw = raw.replace(/\*(.*?)\*/gim, '<em>$1</em>');

        // Inline code
        raw = raw.replace(/`([^`]+)`/gim, '<code>$1</code>');

        // Blockquotes
        raw = raw.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>');

        // Unordered lists
        raw = raw.replace(/^\s*[-*]\s+(.*$)/gim, '<li>$1</li>');
        raw = raw.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

        // Line breaks into paragraphs
        const paragraphs = raw.split(/\n{2,}/);
        html = paragraphs.map(p => {
            if (p.startsWith('<h') || p.startsWith('<div') || p.startsWith('<ul') || p.startsWith('<blockquote')) {
                return p;
            }
            return `<p>${p.replace(/\n/g, '<br>')}</p>`;
        }).join('');

        return html;
    },

    // Post-processes DOM inside bubble to turn all <pre> blocks into Terminal Cards
    enhanceMessageElements(bubble) {
        if (!bubble) return;

        // Upgrade every pre block into a terminal card if not already wrapped
        const preElements = bubble.querySelectorAll('pre');
        preElements.forEach(pre => {
            if (pre.closest('.terminal-card')) return;

            const codeEl = pre.querySelector('code');
            const codeText = codeEl ? codeEl.innerText : pre.innerText;
            
            // Extract language if class="language-xyz"
            let lang = 'command';
            if (codeEl && codeEl.className) {
                const match = codeEl.className.match(/language-([a-zA-Z0-9_\-+]+)/);
                if (match) lang = match[1];
            }

            const wrapper = document.createElement('div');
            wrapper.className = 'terminal-card';
            wrapper.innerHTML = `
                <div class="terminal-card-header">
                    <div class="terminal-header-left">
                        <div class="terminal-dots">
                            <span class="terminal-dot dot-red"></span>
                            <span class="terminal-dot dot-yellow"></span>
                            <span class="terminal-dot dot-green"></span>
                        </div>
                        <span class="terminal-title mono">$_ ${lang}</span>
                    </div>
                    <button class="btn-copy-command" type="button" onclick="Chat.copyCommand(this)">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        Copy
                    </button>
                </div>
                <div class="terminal-card-body"></div>
            `;

            pre.parentNode.insertBefore(wrapper, pre);
            wrapper.querySelector('.terminal-card-body').appendChild(pre);
        });

        // Click-to-copy on inline codes (e.g. `airodump-ng`)
        const inlineCodes = bubble.querySelectorAll('code:not(pre code)');
        inlineCodes.forEach(code => {
            code.setAttribute('title', 'Click to copy command');
            code.style.cursor = 'pointer';
            code.onclick = (e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(code.innerText).then(() => {
                    window.App.showToast(`Copied "${code.innerText}"`, 'success');
                });
            };
        });
    },

    copyCommand(btn) {
        const pre = btn.closest('.terminal-card').querySelector('pre');
        if (pre) {
            const textToCopy = pre.innerText.trim();
            navigator.clipboard.writeText(textToCopy).then(() => {
                const originalHtml = btn.innerHTML;
                btn.innerHTML = `
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    <span style="color:#10b981">Copied!</span>
                `;
                setTimeout(() => { btn.innerHTML = originalHtml; }, 1800);
                window.App.showToast('Command copied to clipboard!', 'success');
            });
        }
    },

    copyFullMessage(btn) {
        const row = btn.closest('.message-row');
        const bubble = row.querySelector('.message-bubble');
        if (bubble) {
            // Copy clean text
            const rawText = bubble.innerText.trim();
            navigator.clipboard.writeText(rawText).then(() => {
                const originalHtml = btn.innerHTML;
                btn.innerHTML = `
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    <span style="color:#10b981">Copied!</span>
                `;
                setTimeout(() => { btn.innerHTML = originalHtml; }, 1800);
                window.App.showToast('Full response copied to clipboard!', 'success');
            });
        }
    },

    scrollToBottom() {
        if (this.scrollViewport) {
            this.scrollViewport.scrollTop = this.scrollViewport.scrollHeight;
        }
    },

    renderEmptyState() {
        this.container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-shield">
                    <!-- Custom Tactical Reticle Icon -->
                    <svg width="34" height="34" viewBox="0 0 36 36" fill="none">
                        <polygon points="18,2 32,9 32,27 18,34 4,27 4,9" stroke="#ef4444" stroke-width="1.8" fill="rgba(239, 68, 68, 0.08)"/>
                        <circle cx="18" cy="18" r="5" stroke="#38bdf8" stroke-width="1.4"/>
                        <circle cx="18" cy="18" r="1.5" fill="#ef4444"/>
                    </svg>
                </div>
                <h2 class="empty-title">SentinelX Tactical Intelligence</h2>
                <p class="empty-desc">
                    High-precision offensive security copilot for penetration testing, bug bounty hunting, and CTFs. Select any local model and launch your scenario.
                </p>
                <div class="prompt-suggestions">
                    <div class="suggestion-card" onclick="Chat.usePrompt('How do I exploit an SSRF vulnerability on an AWS EC2 instance with IMDSv2?')">
                        <div class="suggestion-card-title">☁️ Cloud & SSRF</div>
                        <div class="suggestion-card-text">Bypassing metadata protections, token harvesting, and role pivoting.</div>
                    </div>
                    <div class="suggestion-card" onclick="Chat.usePrompt('Give me a systematic methodology to test for second-order SQL injection in an API.')">
                        <div class="suggestion-card-title">💉 Injection & Databases</div>
                        <div class="suggestion-card-text">Step-by-step verification, time-based blindness, and out-of-band exfil.</div>
                    </div>
                    <div class="suggestion-card" onclick="Chat.usePrompt('Explain how to build a basic ROP chain with mprotect to bypass NX/DEP.')">
                        <div class="suggestion-card-title">⚙️ Binary & Exploit Dev</div>
                        <div class="suggestion-card-text">Gadget discovery, stack alignment, and shellcode memory permissions.</div>
                    </div>
                    <div class="suggestion-card" onclick="Chat.usePrompt('What are the most promising avenues to escalate privileges in an Active Directory forest?')">
                        <div class="suggestion-card-title">🛡️ Active Directory Attacks</div>
                        <div class="suggestion-card-text">Kerberoasting, AD CS abuse, DCSync, and shadow credentials.</div>
                    </div>
                </div>
            </div>
        `;
    },

    usePrompt(text) {
        if (this.promptInput) {
            this.promptInput.value = text;
            this.promptInput.focus();
            this.promptInput.style.height = 'auto';
            this.promptInput.style.height = Math.min(this.promptInput.scrollHeight, 180) + 'px';
        }
    },

    async loadSession(sessionId) {
        AppState.currentSessionId = sessionId;
        const session = AppState.sessions.find(s => s.id === sessionId);
        const titleEl = document.getElementById('active-session-title');
        if (titleEl) {
            titleEl.textContent = session ? (session.name || 'Security Chat') : 'Security Chat';
        }

        // Highlight active session in sidebar
        document.querySelectorAll('.session-item').forEach(el => {
            el.classList.toggle('active', el.dataset.id === sessionId);
        });

        // Set session model if saved
        if (session && session.model) {
            AppState.activeModel = session.model;
            if (window.Models) window.Models.updateActiveModelDisplay();
        }

        const res = await API.getMessages(sessionId);
        if (!res.success || !res.messages || res.messages.length === 0) {
            this.renderEmptyState();
            return;
        }

        this.container.innerHTML = '';
        res.messages.forEach(m => {
            this.appendMessage(m.role, m.content, AppState.activeModel);
        });
        this.scrollToBottom();
    },

    appendMessage(role, content, modelUsed = '') {
        if (!content || !content.trim()) return null;

        const row = document.createElement('div');
        row.className = `message-row ${role}`;

        const header = document.createElement('div');
        header.className = 'message-header';

        if (role === 'user') {
            header.innerHTML = `<span>Operator</span>`;
        } else {
            const displayModel = modelUsed || AppState.activeModel || 'Ollama';
            header.innerHTML = `
                <div class="assistant-identity">
                    <span class="assistant-name">SentinelX</span>
                    <span class="model-chip mono">${displayModel}</span>
                </div>
            `;
        }

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        bubble.innerHTML = this.renderMarkdown(content);

        row.appendChild(header);
        row.appendChild(bubble);

        // If assistant, add the action footer bar with Copy Response button
        if (role === 'assistant') {
            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const footer = document.createElement('div');
            footer.className = 'message-footer-bar';
            footer.innerHTML = `
                <button class="btn-copy-response" type="button" onclick="Chat.copyFullMessage(this)" title="Copy full response to clipboard">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    <span>Copy Response</span>
                </button>
                <div class="message-footer-meta">
                    <span class="message-time">${timeStr}</span>
                </div>
            `;
            row.appendChild(footer);
        }

        this.container.appendChild(row);
        this.enhanceMessageElements(bubble);
        this.scrollToBottom();
        return bubble;
    },

    async sendMessage() {
        if (!this.promptInput) return;
        const message = this.promptInput.value.trim();
        if (!message || AppState.isStreaming) return;

        // Clear empty state if present
        if (this.container.querySelector('.empty-state')) {
            this.container.innerHTML = '';
        }

        // Ensure session exists
        if (!AppState.currentSessionId) {
            const timeTitle = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const newSess = await API.createSession(`Chat ${timeTitle}`, AppState.activeModel);
            if (newSess.success) {
                AppState.currentSessionId = newSess.session_id;
                await window.App.loadSessions();
            }
        }

        // Append user message
        this.appendMessage('user', message);
        this.promptInput.value = '';
        this.promptInput.style.height = 'auto';

        // Prepare streaming assistant message container
        const currentModel = AppState.activeModel || 'Ollama';
        const assistantRow = document.createElement('div');
        assistantRow.className = 'message-row assistant';

        const header = document.createElement('div');
        header.className = 'message-header';
        header.innerHTML = `
            <div class="assistant-identity">
                <span class="assistant-name">SentinelX</span>
                <span class="model-chip mono">${currentModel}</span>
            </div>
        `;

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        bubble.innerHTML = '<span class="streaming-cursor"></span>';

        assistantRow.appendChild(header);
        assistantRow.appendChild(bubble);
        this.container.appendChild(assistantRow);
        this.scrollToBottom();

        // UI state for streaming
        AppState.isStreaming = true;
        if (this.stopBtn) this.stopBtn.classList.add('visible');
        if (this.sendBtn) this.sendBtn.style.display = 'none';

        let accumulatedContent = '';

        await API.streamChat({
            sessionId: AppState.currentSessionId,
            message,
            model: currentModel,
            onChunk: (chunk) => {
                accumulatedContent += chunk;
                bubble.innerHTML = this.renderMarkdown(accumulatedContent) + '<span class="streaming-cursor"></span>';
                this.scrollToBottom();
            },
            onDone: () => {
                bubble.innerHTML = this.renderMarkdown(accumulatedContent);
                this.enhanceMessageElements(bubble);

                // Add footer toolbar
                const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const footer = document.createElement('div');
                footer.className = 'message-footer-bar';
                footer.innerHTML = `
                    <button class="btn-copy-response" type="button" onclick="Chat.copyFullMessage(this)" title="Copy full response to clipboard">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        <span>Copy Response</span>
                    </button>
                    <div class="message-footer-meta">
                        <span class="message-time">${timeStr}</span>
                    </div>
                `;
                assistantRow.appendChild(footer);

                this.finishStreaming();
            },
            onError: (err) => {
                bubble.innerHTML = this.renderMarkdown(accumulatedContent + `\n\n⚠️ **Error:** ${err}`);
                this.finishStreaming();
            }
        });
    },

    finishStreaming() {
        AppState.isStreaming = false;
        if (this.stopBtn) this.stopBtn.classList.remove('visible');
        if (this.sendBtn) this.sendBtn.style.display = 'flex';
        this.scrollToBottom();
    },

    async stopGeneration() {
        if (!AppState.isStreaming) return;
        if (AppState.abortController) {
            AppState.abortController.abort();
        }
        if (AppState.activeRequestId) {
            await API.abortChat(AppState.activeRequestId);
        }
        this.finishStreaming();
        window.App.showToast('Generation halted by operator.', 'info');
    }
};

window.Chat = Chat;
