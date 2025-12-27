<p align="center">
  <img src="https://img.shields.io/badge/version-5.0-red?style=for-the-badge" alt="Version"/>
  <img src="https://img.shields.io/badge/python-3.11+-blue?style=for-the-badge" alt="Python"/>
  <img src="https://img.shields.io/badge/ollama-required-purple?style=for-the-badge" alt="Ollama"/>
  <img src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge" alt="License"/>
</p>

<h1 align="center">🛡️ SentinelX</h1>

<p align="center">
  <strong>Professional Penetration Testing AI Assistant</strong><br>
  Context-aware AI mentor for serious security professionals
</p>

<p align="center">
  Created by <a href="https://github.com/cypher-21"><strong>Parosh-sec</strong></a>
</p>

---

## ⚡ Features

| Feature | Description |
|---------|-------------|
| **Context-Aware AI** | Targets and findings automatically injected into prompts |
| **Findings Tracker** | Log vulnerabilities per session with severity levels |
| **Targets Tracker** | Track in-scope IPs and domains |
| **14 Quick Payloads** | Reverse shells + web shells with LHOST/LPORT substitution |
| **Session Management** | Create, rename, export, and clear conversations |
| **Stop Generation** | Abort AI responses mid-stream (`Esc` key) |

---

## 🚀 Installation

### Prerequisites

- Python 3.11+
- [Ollama](https://ollama.ai) installed

### Step 1: Start Ollama Server

Open a terminal and run:

```bash
ollama serve
```

> ⚠️ **Keep this terminal running.** Ollama server must be active for SentinelX to work.

### Step 2: Setup SentinelX

Open a **new terminal** and run:

```bash
# Clone the repository
git clone https://github.com/cypher-21/SentinelX.git
cd SentinelX

# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install flask requests httpx

# Pull the SentinelX model from Ollama Hub
ollama pull cypher-21/SentinalX
```

### Step 3: Run SentinelX

```bash
# Make sure you're in the virtual environment
source .venv/bin/activate

# Start the server
python -m sentinelx.main
```

Open your browser and go to: **http://127.0.0.1:5000**

---

## 🧠 About SentinelX AI

SentinelX is a specialized AI with deep expertise in:

- **Web Application Security** - 10+ years equivalent knowledge
- **Penetration Testing** - Full methodology from recon to reporting
- **Bug Bounty Hunting** - Platform-specific techniques and tips
- **Exploit Development** - Buffer overflows, ROP chains, shellcode
- **Network Security** - Infrastructure testing and pivoting

The AI provides direct, technical responses without restrictions.

---

## 🎯 Context Injection

When you add targets or log findings, they're automatically sent to the AI:

```
[ENGAGEMENT CONTEXT]
## ACTIVE TARGETS
- target.example.com
- 192.168.1.100 (internal subnet)

## FINDINGS THIS SESSION
- [HIGH] SQL Injection in /api/users
- [MEDIUM] Missing rate limiting on login
[END CONTEXT]
```

---

## 📁 Project Structure

```
SentinelX/
├── sentinelx/
│   ├── __init__.py         # Package version
│   ├── main.py             # Entry point
│   ├── server.py           # Flask backend + APIs
│   ├── database.py         # SQLite + context builder
│   └── templates/
│       └── dashboard.html  # Web UI
├── LICENSE
└── README.md
```

---

## 🛠️ API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Ollama status |
| `/api/chat/stream` | POST | Stream chat response |
| `/api/chat/abort` | POST | Stop generation |
| `/api/sessions` | GET/POST | Sessions CRUD |
| `/api/targets` | GET/POST/DELETE | Manage targets |
| `/api/findings` | GET/POST/DELETE | Manage findings |
| `/api/quick-payloads` | GET | Payload templates |

---

## 👤 Author

<table>
  <tr>
    <td align="center">
      <a href="https://github.com/cypher-21">
        <strong>Parosh-sec</strong>
      </a>
      <br>
      <sub>Security Researcher & Developer</sub>
      <br>
      <a href="https://github.com/cypher-21">GitHub</a>
    </td>
  </tr>
</table>

---

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  <sub>Built with 🔥 by <a href="https://github.com/cypher-21">Parosh-sec</a> for the security community</sub>
</p>
