<p align="center">
  <img src="https://img.shields.io/badge/version-5.0-red?style=for-the-badge" alt="Version"/>
  <img src="https://img.shields.io/badge/python-3.11+-blue?style=for-the-badge" alt="Python"/>
  <img src="https://img.shields.io/badge/ollama-required-purple?style=for-the-badge" alt="Ollama"/>
  <img src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge" alt="License"/>
</p>

<h1 align="center">🛡️ SentinelX</h1>

<p align="center">
  <strong>Offensive Security Intelligence & Penetration Testing AI Platform</strong><br>
  High-precision offensive security copilot for penetration testers, bug bounty hunters, and red teamers.
</p>

<p align="center">
  Created by <a href="https://github.com/cypher-21"><strong>Parosh-sec</strong></a>
</p>

---

## ⚡ Core Features

| Feature | Description |
|---|---|
| **Automated Launcher (`./run.sh`)** | One-command launcher: starts Ollama, verifies virtualenv, cleans port conflicts, launches server, and opens your browser |
| **Dynamic Multi-Model Engine** | Run **any** local Ollama model (Qwen 2.5, DeepSeek R1, Llama 3.3, Mistral) with real-time dynamic persona injection |
| **In-App Model Puller** | Search, download, and track download progress of Ollama models directly from the UI |
| **Dual Minimalist Theme** | Engineered **Technical Dark Mode** (Obsidian/Zinc) & **Technical Light Mode** (Paper/Slate) with 1-click toggle |
| **One-Click Collapsible Sidebar** | Streamlined `☰` button on the sidebar header (with auto-restoring navbar trigger when collapsed) |
| **Floating Glassmorphic Prompt Dock** | Frosted glassmorphism (`backdrop-filter: blur(16px)`) with transparent fading gradient and rounded corner ergonomics |
| **Terminal Code Blocks** | Authentic developer terminal cards with macOS dots, syntax labels (`$_ bash`), and 1-click **Copy Command** buttons |
| **Copy Full Response** | Built-in action toolbar anchored at the bottom of every AI response for instant clipboard copying |
| **Interactive Payloads Drawer** | Catalog of reverse shells, web shells, and file transfer one-liners with live LHOST/LPORT replacement |
| **Session Persistence** | Conversations saved locally in SQLite (`~/.sentinelx/data.db`) with full Markdown export |
| **Air-Gap & Offline Ready** | Self-contained frontend with embedded vector SVGs and offline Markdown parsing |

---

## 🚀 Quick Start (Recommended)

SentinelX includes an automated launcher script that handles Ollama verification, virtualenv setup, dependency installation, port conflict resolution, and browser opening:

```bash
# Clone the repository
git clone https://github.com/cypher-21/SentinelX.git
cd SentinelX

# Run the automated launcher
./run.sh
```

Your browser will automatically open at: **http://127.0.0.1:5000**

---

## 🔧 Manual Installation

If you prefer to configure and run SentinelX manually:

### 1. Prerequisites
- Python 3.11+
- [Ollama](https://ollama.ai) installed and running (`ollama serve`)

### 2. Virtual Environment Setup
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install flask requests httpx
```

### 3. Pull or Build Models
Pull any local model using Ollama:
```bash
ollama pull qwen2.5:7b
# or: ollama pull deepseek-r1:14b
# or: ollama pull llama3.3:latest

# Or build the custom SentinelX Pentest Mentor model:
ollama create sentinelx -f ./models/Modelfile
```

### 4. Launch the Server
```bash
source .venv/bin/activate
python -m sentinelx.main
```
Navigate to: **http://127.0.0.1:5000**

---

## 🎨 UI & Design Architecture

SentinelX v5.0 features a refined, developer-first technical console:
- **Rounded Ergonomics**: 12px–20px rounded corners across cards, pills, bubbles, and dialogs.
- **Solid 1px Panel Outlines**: Crisp dividing lines separating the sidebar, top navbar, chat viewport, and drawer panels.
- **Fluid Vertical Fit**: The chat window spans the full height of your display with 145px bottom padding so messages scroll cleanly underneath the floating glass dock.
- **Single-Button Collapse UX**: Exactly one collapse button is visible on screen at any time—docked in the sidebar header when open, and transitioning to the top-left navbar when collapsed.
- **Bespoke Cyber Reticle Logo**: Custom vector monogram reticle icon.

---

## 📁 Project Structure

```
SentinelX/
├── run.sh                      # Automated bootstrapper & environment manager
├── models/
│   └── Modelfile               # Qwen 2.5 7B Pentest Mentor model configuration
├── sentinelx/
│   ├── __init__.py             # Package version (5.0.0)
│   ├── main.py                 # Entry point CLI
│   ├── prompts.py              # SentinelX system prompts & persona builder
│   ├── server.py               # Flask backend & dynamic Ollama proxy APIs
│   ├── database.py             # SQLite persistence with auto-migrations
│   ├── templates/
│   │   └── dashboard.html      # Responsive semantic dashboard shell
│   └── static/
│       ├── css/
│       │   ├── theme.css       # Dual-theme design tokens & glassmorphism variables
│       │   ├── layout.css      # Sidebar collapse, fluid viewport, & prompt dock
│       │   └── components.css  # Terminal cards, copy buttons, & message bubbles
│       └── js/
│           ├── state.js        # Reactive state store
│           ├── api.js          # REST client & SSE stream reader
│           ├── chat.js         # Offline Markdown parser & terminal enhancer
│           ├── panels.js       # Payloads drawer & export controller
│           ├── models.js       # Dynamic Ollama model switcher & in-app puller
│           └── app.js          # Bootstrap, sidebar/theme toggles, & hotkeys
├── pyproject.toml              # Build config & package metadata
├── LICENSE                     # MIT License
└── README.md
```

---

## 🛠️ API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | GET | Ollama connection status & model count |
| `/api/models` | GET | List installed Ollama models with parameter sizes |
| `/api/models/pull` | POST | Stream download progress for any Ollama model |
| `/api/chat/stream` | POST | Stream chat response with dynamic persona injection |
| `/api/chat/abort` | POST | Abort active streaming generation |
| `/api/sessions` | GET/POST | Create & list assessment sessions |
| `/api/sessions/<id>` | DELETE | Delete an assessment conversation |
| `/api/sessions/<id>/messages` | GET | Fetch message history for a conversation |
| `/api/sessions/<id>/export` | GET | Export session as a clean Markdown report |
| `/api/quick-payloads` | GET | Catalog of pentesting & reverse shell payloads |

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Enter` | Send message / Execute prompt |
| `Shift + Enter` | Insert newline in prompt textarea |
| `Esc` | Stop active AI streaming / Close open modals & drawers |
| `Ctrl + Shift + P` | Open / Close Quick Payloads drawer |

---

## 👤 Author

**Parosh-sec**  
*Security Researcher & Developer*  
[GitHub Profile](https://github.com/cypher-21)

---

## 📜 License

Licensed under the MIT License - see [LICENSE](LICENSE) for details.
