"""
Lightweight SQLite store for conversations, generated content, and knowledge sources.

Schema mirrors the production PostgreSQL tables from PLAN.md so the migration
to asyncpg + pgvector is a mechanical substitution: swap sqlite3 for asyncpg,
replace ? placeholders with $N, and add the vector columns.
"""

import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

_DB_PATH = Path("data/agent.db")


def init_db(db_path: Path = _DB_PATH) -> None:
    """Create tables if they do not exist. Idempotent."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS ai_conversations (
                id              TEXT PRIMARY KEY,
                session_id      TEXT NOT NULL,
                user_id         TEXT NOT NULL,
                organization_id TEXT,
                role            TEXT NOT NULL,
                message         TEXT NOT NULL,
                created_at      TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_conv_session
                ON ai_conversations (session_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_conv_user
                ON ai_conversations (user_id, created_at);

            CREATE TABLE IF NOT EXISTS ai_generated_content (
                id              TEXT PRIMARY KEY,
                user_id         TEXT NOT NULL,
                organization_id TEXT,
                session_id      TEXT,
                platform        TEXT,
                content         TEXT NOT NULL,
                created_at      TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_gen_org
                ON ai_generated_content (organization_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_gen_user
                ON ai_generated_content (user_id, created_at);

            CREATE TABLE IF NOT EXISTS ai_knowledge_sources (
                id              TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                source_type     TEXT NOT NULL,
                source_url      TEXT,
                title           TEXT,
                content         TEXT,
                content_hash    TEXT NOT NULL,
                created_at      TEXT NOT NULL,
                UNIQUE (organization_id, content_hash)
            );
            CREATE INDEX IF NOT EXISTS idx_ks_org
                ON ai_knowledge_sources (organization_id);
        """)


class DBStore:
    """
    Thin wrapper over SQLite for Phase-1 persistence.
    Every public method maps 1:1 to an asyncpg query in the production service.
    """

    def __init__(self, db_path: Path = _DB_PATH) -> None:
        self._path = db_path
        init_db(db_path)

    @contextmanager
    def _conn(self):
        conn = sqlite3.connect(self._path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    # ---- Conversations ----

    def save_conversation_turn(
        self,
        session_id: str,
        user_id: str,
        org_id: str | None,
        user_message: str,
        assistant_message: str,
    ) -> None:
        now = _now()
        with self._conn() as conn:
            conn.execute(
                "INSERT INTO ai_conversations VALUES (?,?,?,?,?,?,?)",
                (str(uuid.uuid4()), session_id, user_id, org_id, "user", user_message, now),
            )
            conn.execute(
                "INSERT INTO ai_conversations VALUES (?,?,?,?,?,?,?)",
                (str(uuid.uuid4()), session_id, user_id, org_id, "assistant", assistant_message, now),
            )

    def get_conversation_history(
        self, session_id: str, limit: int = 10
    ) -> list[dict]:
        with self._conn() as conn:
            rows = conn.execute(
                """SELECT role, message FROM ai_conversations
                   WHERE session_id = ?
                   ORDER BY created_at DESC LIMIT ?""",
                (session_id, limit),
            ).fetchall()
        return [{"role": r["role"], "content": r["message"]} for r in reversed(rows)]

    # ---- Generated content ----

    def save_generated_content(
        self,
        user_id: str,
        org_id: str | None,
        session_id: str | None,
        platform: str | None,
        content: str,
    ) -> str:
        content_id = str(uuid.uuid4())
        with self._conn() as conn:
            conn.execute(
                "INSERT INTO ai_generated_content VALUES (?,?,?,?,?,?,?)",
                (content_id, user_id, org_id, session_id, platform or "unknown", content, _now()),
            )
        return content_id

    def get_recent_generated_content(
        self, org_id: str, limit: int = 5
    ) -> list[dict]:
        with self._conn() as conn:
            rows = conn.execute(
                """SELECT platform, content, created_at
                   FROM ai_generated_content
                   WHERE organization_id = ?
                   ORDER BY created_at DESC LIMIT ?""",
                (org_id, limit),
            ).fetchall()
        return [{"platform": r["platform"], "content": r["content"]} for r in rows]

    # ---- Knowledge sources ----

    def upsert_knowledge_source(
        self,
        org_id: str,
        source_type: str,
        source_url: str | None,
        title: str,
        content: str,
        content_hash: str,
    ) -> None:
        with self._conn() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO ai_knowledge_sources VALUES (?,?,?,?,?,?,?,?)",
                (
                    str(uuid.uuid4()), org_id, source_type,
                    source_url, title, content[:2000], content_hash, _now(),
                ),
            )

    def knowledge_exists(self, org_id: str) -> bool:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT id FROM ai_knowledge_sources WHERE organization_id = ? LIMIT 1",
                (org_id,),
            ).fetchone()
        return row is not None

    def get_knowledge_source_count(self, org_id: str) -> int:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT COUNT(*) as c FROM ai_knowledge_sources WHERE organization_id = ?",
                (org_id,),
            ).fetchone()
        return row["c"] if row else 0

    def clear_knowledge_sources(self, org_id: str) -> None:
        with self._conn() as conn:
            conn.execute(
                "DELETE FROM ai_knowledge_sources WHERE organization_id = ?",
                (org_id,),
            )


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_store: DBStore | None = None


def get_db_store() -> DBStore:
    global _store
    if _store is None:
        _store = DBStore()
    return _store


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()
