"""SQLite database for persistence."""
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional
from contextlib import contextmanager


DB_PATH = Path.home() / ".sentinelx" / "data.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    workspace TEXT NOT NULL,
    name TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    value TEXT NOT NULL UNIQUE,
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payloads (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    code TEXT NOT NULL,
    language TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS findings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    severity TEXT NOT NULL DEFAULT 'info',
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    target TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_payloads_category ON payloads(category);
CREATE INDEX IF NOT EXISTS idx_findings_session ON findings(session_id);
"""


def init_db():
    """Initialize database."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()


@contextmanager
def get_db():
    """Get database connection."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def now() -> str:
    return datetime.utcnow().isoformat()


# Sessions

def create_session(name: Optional[str] = None) -> str:
    """Create new session."""
    session_id = str(uuid.uuid4())[:8]
    with get_db() as conn:
        conn.execute(
            "INSERT INTO sessions (id, workspace, name, created_at) VALUES (?, ?, ?, ?)",
            (session_id, 'general', name, now())
        )
    return session_id


def get_sessions() -> list[dict]:
    """Get all sessions."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM sessions ORDER BY created_at DESC"
        ).fetchall()
    return [dict(r) for r in rows]


def delete_session(session_id: str):
    """Delete session."""
    with get_db() as conn:
        conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))


def rename_session(session_id: str, name: str):
    """Rename session."""
    with get_db() as conn:
        conn.execute("UPDATE sessions SET name = ? WHERE id = ?", (name, session_id))


# Messages

def add_message(session_id: str, role: str, content: str) -> int:
    """Add message to session."""
    with get_db() as conn:
        cursor = conn.execute(
            "INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)",
            (session_id, role, content, now())
        )
        return cursor.lastrowid


def get_messages(session_id: str) -> list[dict]:
    """Get messages for session."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT role, content FROM messages WHERE session_id = ? ORDER BY id ASC",
            (session_id,)
        ).fetchall()
    return [dict(r) for r in rows]


def clear_messages(session_id: str):
    """Clear all messages in a session."""
    with get_db() as conn:
        conn.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))


# Targets

def add_target(value: str, notes: str = "") -> bool:
    """Add target."""
    try:
        with get_db() as conn:
            conn.execute(
                "INSERT INTO targets (value, notes, created_at) VALUES (?, ?, ?)",
                (value, notes, now())
            )
        return True
    except sqlite3.IntegrityError:
        return False


def get_targets() -> list[dict]:
    """Get all targets."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, value, notes FROM targets ORDER BY created_at DESC"
        ).fetchall()
    return [dict(r) for r in rows]


def delete_target(target_id: int):
    """Delete target."""
    with get_db() as conn:
        conn.execute("DELETE FROM targets WHERE id = ?", (target_id,))


# Payloads

def save_payload(name: str, category: str, code: str, language: str = "") -> str:
    """Save payload."""
    payload_id = str(uuid.uuid4())[:8]
    with get_db() as conn:
        conn.execute(
            "INSERT INTO payloads (id, name, category, code, language, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (payload_id, name, category, code, language, now())
        )
    return payload_id


def get_payloads(category: Optional[str] = None) -> list[dict]:
    """Get payloads."""
    with get_db() as conn:
        if category:
            rows = conn.execute(
                "SELECT * FROM payloads WHERE category = ? ORDER BY created_at DESC",
                (category,)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM payloads ORDER BY created_at DESC"
            ).fetchall()
    return [dict(r) for r in rows]


def delete_payload(payload_id: str):
    """Delete payload."""
    with get_db() as conn:
        conn.execute("DELETE FROM payloads WHERE id = ?", (payload_id,))


# Findings

def add_finding(session_id: str, title: str, severity: str = 'info', 
                description: str = '', target: str = '') -> int:
    """Add a finding."""
    with get_db() as conn:
        cursor = conn.execute(
            "INSERT INTO findings (session_id, severity, title, description, target, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (session_id, severity, title, description, target, now())
        )
        return cursor.lastrowid


def get_findings(session_id: str = None) -> list[dict]:
    """Get findings, optionally filtered by session."""
    with get_db() as conn:
        if session_id:
            rows = conn.execute(
                "SELECT * FROM findings WHERE session_id = ? ORDER BY created_at DESC",
                (session_id,)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM findings ORDER BY created_at DESC"
            ).fetchall()
    return [dict(r) for r in rows]


def delete_finding(finding_id: int):
    """Delete a finding."""
    with get_db() as conn:
        conn.execute("DELETE FROM findings WHERE id = ?", (finding_id,))


def build_context(session_id: str = None) -> str:
    """Build context string for AI prompt injection."""
    context_parts = []
    
    # Add targets
    targets = get_targets()
    if targets:
        context_parts.append("## ACTIVE TARGETS")
        for t in targets[:10]:  # Limit to 10
            context_parts.append(f"- {t['value']}" + (f" ({t['notes']})" if t.get('notes') else ""))
    
    # Add session findings if session provided
    if session_id:
        findings = get_findings(session_id)
        if findings:
            context_parts.append("\n## FINDINGS THIS SESSION")
            for f in findings[:10]:  # Limit to 10
                context_parts.append(f"- [{f['severity'].upper()}] {f['title']}")
                if f.get('description'):
                    context_parts.append(f"  {f['description'][:100]}")
    
    if context_parts:
        return "[ENGAGEMENT CONTEXT]\n" + "\n".join(context_parts) + "\n[END CONTEXT]\n\n"
    return ""


# Initialize on import
init_db()
