/**
 * SentinelX Reactive Application State Store
 */

const AppState = {
    currentSessionId: null,
    sessions: [],
    activeModel: 'sentinelx',
    models: [],
    isOllamaConnected: false,
    
    // Engagement Context
    targets: [],
    findings: [],
    
    // Payloads
    payloadsCatalog: {},
    lhost: localStorage.getItem('sentinelx_lhost') || '10.10.14.X',
    lport: localStorage.getItem('sentinelx_lport') || '9001',
    
    // Active Streaming
    isStreaming: false,
    activeRequestId: null,
    abortController: null,

    // Persistence & Listeners
    listeners: {},

    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    },

    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data));
        }
    },

    setLhost(val) {
        this.lhost = val;
        localStorage.setItem('sentinelx_lhost', val);
        this.emit('payload_vars_changed');
    },

    setLport(val) {
        this.lport = val;
        localStorage.setItem('sentinelx_lport', val);
        this.emit('payload_vars_changed');
    }
};

window.AppState = AppState;
