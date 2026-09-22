"""SQLite database for persistence with modern schema and migration support."""
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List, Dict, Any
from contextlib import contextmanager


DB_PATH = Path.home() / ".sentinelx" / "data.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    workspace TEXT NOT NULL,
    name TEXT,
    model TEXT DEFAULT '',
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
    status TEXT DEFAULT 'open',
    cvss REAL DEFAULT 0.0,
    created_at TEXT NOT NULL,
    FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_payloads_category ON payloads(category);
CREATE INDEX IF NOT EXISTS idx_findings_session ON findings(session_id);
"""


def utc_now() -> str:
    """Return timezone-aware ISO 8601 UTC timestamp."""
    return datetime.now(timezone.utc).isoformat()


def init_db():
    """Initialize database and perform non-destructive schema migrations."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=15.0)
    conn.executescript(SCHEMA)
    
    # Check for column migrations on existing installations
    cursor = conn.cursor()
    
    # 1. sessions.model
    cursor.execute("PRAGMA table_info(sessions)")
    session_cols = [c[1] for c in cursor.fetchall()]
    if "model" not in session_cols:
        cursor.execute("ALTER TABLE sessions ADD COLUMN model TEXT DEFAULT ''")
        
    # 2. findings.status and findings.cvss
    cursor.execute("PRAGMA table_info(findings)")
    finding_cols = [c[1] for c in cursor.fetchall()]
    if "status" not in finding_cols:
        cursor.execute("ALTER TABLE findings ADD COLUMN status TEXT DEFAULT 'open'")
    if "cvss" not in finding_cols:
        cursor.execute("ALTER TABLE findings ADD COLUMN cvss REAL DEFAULT 0.0")
        
    conn.commit()
    conn.close()


@contextmanager
def get_db():
    """Get database connection with foreign key enforcement and timeout."""
    conn = sqlite3.connect(DB_PATH, timeout=15.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


# ============ Sessions ============

def create_session(name: Optional[str] = None, model: str = "") -> str:
    """Create a new chat session."""
    session_id = str(uuid.uuid4())[:8]
    with get_db() as conn:
        conn.execute(
            "INSERT INTO sessions (id, workspace, name, model, created_at) VALUES (?, ?, ?, ?, ?)",
            (session_id, 'general', name, model, utc_now())
        )
    return session_id


def get_sessions() -> List[Dict[str, Any]]:
    """Get all sessions sorted by recency."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM sessions ORDER BY created_at DESC"
        ).fetchall()
    return [dict(r) for r in rows]


def get_session(session_id: str) -> Optional[Dict[str, Any]]:
    """Get single session by ID."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM sessions WHERE id = ?", (session_id,)
        ).fetchone()
    return dict(row) if row else None


def update_session_model(session_id: str, model: str):
    """Update selected model for a session."""
    with get_db() as conn:
        conn.execute(
            "UPDATE sessions SET model = ? WHERE id = ?",
            (model, session_id)
        )


def rename_session(session_id: str, name: str):
    """Rename a session."""
    with get_db() as conn:
        conn.execute("UPDATE sessions SET name = ? WHERE id = ?", (name, session_id))


def delete_session(session_id: str):
    """Delete a session and cascade delete all its messages."""
    with get_db() as conn:
        conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))


# ============ Messages ============

def add_message(session_id: str, role: str, content: str) -> int:
    """Add a message to a session."""
    with get_db() as conn:
        cursor = conn.execute(
            "INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)",
            (session_id, role, content, utc_now())
        )
        return cursor.lastrowid


def get_messages(session_id: str) -> List[Dict[str, Any]]:
    """Get all messages for a session in chronological order."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, role, content, created_at FROM messages WHERE session_id = ? ORDER BY id ASC",
            (session_id,)
        ).fetchall()
    return [dict(r) for r in rows]


def clear_messages(session_id: str):
    """Clear all messages in a session."""
    with get_db() as conn:
        conn.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))


# ============ Targets ============

def add_target(value: str, notes: str = "") -> bool:
    """Add an in-scope target."""
    try:
        with get_db() as conn:
            conn.execute(
                "INSERT INTO targets (value, notes, created_at) VALUES (?, ?, ?)",
                (value.strip(), notes.strip(), utc_now())
            )
        return True
    except sqlite3.IntegrityError:
        return False


def get_targets() -> List[Dict[str, Any]]:
    """Get all targets."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, value, notes, created_at FROM targets ORDER BY created_at DESC"
        ).fetchall()
    return [dict(r) for r in rows]


def delete_target(target_id: int):
    """Delete a target."""
    with get_db() as conn:
        conn.execute("DELETE FROM targets WHERE id = ?", (target_id,))


# ============ Payloads ============

def save_payload(name: str, category: str, code: str, language: str = "") -> str:
    """Save a custom payload."""
    payload_id = str(uuid.uuid4())[:8]
    with get_db() as conn:
        conn.execute(
            "INSERT INTO payloads (id, name, category, code, language, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (payload_id, name, category, code, language, utc_now())
        )
    return payload_id


def get_payloads(category: Optional[str] = None) -> List[Dict[str, Any]]:
    """Get saved payloads."""
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
    """Delete a saved payload."""
    with get_db() as conn:
        conn.execute("DELETE FROM payloads WHERE id = ?", (payload_id,))


# ============ Findings ============

def add_finding(session_id: Optional[str], title: str, severity: str = 'info', 
                description: str = '', target: str = '', status: str = 'open',
                cvss: float = 0.0) -> int:
    """Add a logged security finding."""
    with get_db() as conn:
        cursor = conn.execute(
            """INSERT INTO findings (session_id, severity, title, description, target, status, cvss, created_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (session_id, severity.lower(), title.strip(), description.strip(), 
             target.strip(), status.lower(), float(cvss), utc_now())
        )
        return cursor.lastrowid


def get_findings(session_id: Optional[str] = None) -> List[Dict[str, Any]]:
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


def update_finding(finding_id: int, title: str, severity: str, description: str,
                   target: str, status: str = 'open', cvss: float = 0.0):
    """Update finding details."""
    with get_db() as conn:
        conn.execute(
            """UPDATE findings SET title = ?, severity = ?, description = ?, 
               target = ?, status = ?, cvss = ? WHERE id = ?""",
            (title.strip(), severity.lower(), description.strip(), 
             target.strip(), status.lower(), float(cvss), finding_id)
        )


def delete_finding(finding_id: int):
    """Delete a finding."""
    with get_db() as conn:
        conn.execute("DELETE FROM findings WHERE id = ?", (finding_id,))


# ============ Database Wipe / History Reset ============

def clear_all_history():
    """Clear all chat sessions, messages, and assessment records from the database."""
    with get_db() as conn:
        conn.execute("DELETE FROM messages")
        conn.execute("DELETE FROM sessions")
        conn.execute("DELETE FROM findings")
        conn.execute("DELETE FROM targets")

    # SQLite VACUUM cannot run within a managed transaction; run in autocommit mode
    try:
        vac_conn = sqlite3.connect(DB_PATH, timeout=15.0, isolation_level=None)
        vac_conn.execute("VACUUM")
        vac_conn.close()
    except Exception:
        pass


# Initialize schema on first import
init_db()
