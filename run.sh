#!/usr/bin/env bash
# ==============================================================================
# SentinelX Launcher & Environment Automator
# Starts Ollama (if needed), activates virtualenv, and boots SentinelX Dashboard
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

# 1. Check Ollama Status
echo -e "${BLUE}[*] Checking Ollama service...${NC}"
if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
    echo -e "${GREEN}[+] Ollama is active and running on http://localhost:11434${NC}"
else
    echo -e "${YELLOW}[!] Ollama is not running. Starting 'ollama serve' in background...${NC}"
    if command -v ollama >/dev/null 2>&1; then
        ollama serve >/dev/null 2>&1 &
        OLLAMA_PID=$!
        
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
            echo -e "${GREEN}[+] Ollama started successfully!${NC}"
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

# 4. Boot SentinelX
if lsof -ti:5000 >/dev/null 2>&1; then
    echo -e "${YELLOW}[!] Port 5000 is currently occupied. Freeing port 5000...${NC}"
    fuser -k 5000/tcp >/dev/null 2>&1 || true
    sleep 0.5
fi

echo -e "${GREEN}${BOLD}[+] Launching SentinelX Dashboard on http://127.0.0.1:5000${NC}"
echo -e "${CYAN}[*] Press Ctrl+C at any time to stop.${NC}\n"

exec python -m sentinelx.main
