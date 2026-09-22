#!/usr/bin/env bash
# ==============================================================================
# SentinelX Launcher & Environment Automator
# Starts Ollama (if needed), activates virtualenv, and boots SentinelX Dashboard
# Gracefully terminates all spawned processes (including Ollama) on exit / Ctrl+C
# ==============================================================================

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${CYAN}${BOLD}"
echo "  ================================================================"
echo "    🛡️  SENTINELX v5.0 - Offensive Security Intelligence Platform"
echo "  ================================================================"
echo -e "${NC}"

STARTED_OLLAMA=false
OLLAMA_PID=""
SERVER_PID=""
BROWSER_PID=""

# Define cleanup handler for Ctrl+C, SIGTERM, and shell exit
cleanup() {
    # Prevent repeated execution
    trap - INT TERM EXIT
    echo -e "\n${YELLOW}[*] Shutting down SentinelX...${NC}"

    # 1. Terminate Flask server
    if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
        echo -e "${BLUE}[*] Stopping SentinelX web server (PID: $SERVER_PID)...${NC}"
        kill -TERM "$SERVER_PID" 2>/dev/null || true
        wait "$SERVER_PID" 2>/dev/null || true
    fi
    fuser -k 5000/tcp >/dev/null 2>&1 || true

    # 2. Terminate Ollama if it was started by this launcher
    if [ "$STARTED_OLLAMA" = true ]; then
        echo -e "${BLUE}[*] Stopping Ollama service and runners...${NC}"
        if [ -n "$OLLAMA_PID" ] && kill -0 "$OLLAMA_PID" 2>/dev/null; then
            kill -TERM "$OLLAMA_PID" 2>/dev/null || true
            sleep 0.3
            kill -KILL "$OLLAMA_PID" 2>/dev/null || true
        fi
        pkill -f "ollama serve" 2>/dev/null || true
        pkill -9 -f "ollama_llama_server" 2>/dev/null || true
    fi

    # 3. Terminate background browser launch job if still running
    if [ -n "$BROWSER_PID" ] && kill -0 "$BROWSER_PID" 2>/dev/null; then
        kill "$BROWSER_PID" 2>/dev/null || true
    fi

    echo -e "${GREEN}[+] All processes cleanly stopped.${NC}"
}

trap cleanup INT TERM EXIT

# 1. Check Ollama Status
echo -e "${BLUE}[*] Checking Ollama service...${NC}"
if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
    echo -e "${GREEN}[+] Ollama is active and running on http://localhost:11434${NC}"
    STARTED_OLLAMA=false
else
    echo -e "${YELLOW}[!] Ollama is not running. Starting 'ollama serve' in background...${NC}"
    if command -v ollama >/dev/null 2>&1; then
        ollama serve >/dev/null 2>&1 &
        OLLAMA_PID=$!
        STARTED_OLLAMA=true
        
        # Wait up to 12 seconds for Ollama to become available
        ATTEMPTS=0
        while ! curl -s http://localhost:11434/api/tags >/dev/null 2>&1; do
            sleep 1
            ATTEMPTS=$((ATTEMPTS+1))
            if [ $ATTEMPTS -ge 12 ]; then
                echo -e "${RED}[-] Warning: Ollama did not respond within 12s. Continuing anyway...${NC}"
                break
            fi
        done
        if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
            echo -e "${GREEN}[+] Ollama started successfully (PID: $OLLAMA_PID)!${NC}"
        fi
    else
        echo -e "${RED}[-] Ollama binary not found in PATH. Please install Ollama from https://ollama.ai${NC}"
    fi
fi

# 2. Virtual Environment Setup
if [ ! -d ".venv" ]; then
    echo -e "${YELLOW}[*] Virtual environment not found. Creating .venv...${NC}"
    python3 -m venv --system-site-packages .venv
    source .venv/bin/activate
    pip install flask requests httpx
else
    source .venv/bin/activate
fi

# 3. Open Browser in background after server launches
(
    sleep 1.5
    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "http://127.0.0.1:5000" >/dev/null 2>&1 || true
    fi
) &
BROWSER_PID=$!

# 4. Boot SentinelX
if lsof -ti:5000 >/dev/null 2>&1; then
    echo -e "${YELLOW}[!] Port 5000 is currently occupied. Freeing port 5000...${NC}"
    fuser -k 5000/tcp >/dev/null 2>&1 || true
    sleep 0.5
fi

echo -e "${GREEN}${BOLD}[+] Launching SentinelX Dashboard on http://127.0.0.1:5000${NC}"
echo -e "${CYAN}[*] Press Ctrl+C at any time to stop.${NC}\n"

# Run in background and wait so the signal trap handles Ctrl+C cleanly
python -m sentinelx.main &
SERVER_PID=$!
wait "$SERVER_PID" || true
