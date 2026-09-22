/**
 * SentinelX HTTP Client & Streaming API Wrapper
 */

const API = {
    async getHealth() {
        const res = await fetch('/api/health');
        return res.json();
    },

    async getModels() {
        const res = await fetch('/api/models');
        return res.json();
    },

    async pullModel(modelName, onProgress, onComplete, onError) {
        try {
            const res = await fetch('/api/models/pull', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: modelName })
            });

            if (!res.ok) {
                const err = await res.json();
                onError(err.error || 'Failed to start pull');
                return;
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (data.error) {
                                onError(data.error);
                                return;
                            }
                            onProgress(data);
                        } catch (e) {
                            console.error('SSE parse error:', e);
                        }
                    }
                }
            }
            onComplete();
        } catch (e) {
            onError(e.message);
        }
    },

    async getSessions() {
        const res = await fetch('/api/sessions');
        return res.json();
    },

    async createSession(name = 'New Assessment', model = '') {
        const res = await fetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, model })
        });
        return res.json();
    },

    async renameSession(sessionId, name) {
        const res = await fetch(`/api/sessions/${sessionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        return res.json();
    },

    async deleteSession(sessionId) {
        const res = await fetch(`/api/sessions/${sessionId}`, {
            method: 'DELETE'
        });
        return res.json();
    },

    async getMessages(sessionId) {
        const res = await fetch(`/api/sessions/${sessionId}/messages`);
        return res.json();
    },

    async clearMessages(sessionId) {
        const res = await fetch(`/api/sessions/${sessionId}/messages`, {
            method: 'DELETE'
        });
        return res.json();
    },

    async clearAllHistory() {
        const res = await fetch('/api/history/clear', {
            method: 'POST'
        });
        return res.json();
    },

    async streamChat({ sessionId, message, model, onChunk, onDone, onError }) {
        try {
            const controller = new AbortController();
            AppState.abortController = controller;

            const res = await fetch('/api/chat/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: sessionId,
                    message,
                    model
                }),
                signal: controller.signal
            });

            const requestId = res.headers.get('X-Request-ID');
            AppState.activeRequestId = requestId;

            if (!res.ok) {
                const err = await res.json();
                onError(err.error || 'Server error');
                return;
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                onChunk(chunk);
            }
            onDone();
        } catch (e) {
            if (e.name === 'AbortError') {
                onDone();
            } else {
                onError(e.message);
            }
        } finally {
            AppState.abortController = null;
            AppState.activeRequestId = null;
            AppState.isStreaming = false;
        }
    },

    async abortChat(requestId) {
        if (!requestId) return;
        await fetch('/api/chat/abort', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ request_id: requestId })
        });
    },

    // Targets
    async getTargets() {
        const res = await fetch('/api/targets');
        return res.json();
    },

    async addTarget(value, notes = '') {
        const res = await fetch('/api/targets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value, notes })
        });
        return res.json();
    },

    async deleteTarget(targetId) {
        const res = await fetch(`/api/targets/${targetId}`, { method: 'DELETE' });
        return res.json();
    },

    // Findings
    async getFindings(sessionId = null) {
        const url = sessionId ? `/api/findings?session_id=${sessionId}` : '/api/findings';
        const res = await fetch(url);
        return res.json();
    },

    async addFinding(data) {
        const res = await fetch('/api/findings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },

    async deleteFinding(findingId) {
        const res = await fetch(`/api/findings/${findingId}`, { method: 'DELETE' });
        return res.json();
    },

    // Payloads
    async getQuickPayloads() {
        const res = await fetch('/api/quick-payloads');
        return res.json();
    }
};

window.API = API;
