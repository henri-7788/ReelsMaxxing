"""SQLite storage. Small and dependency-free on purpose (the mini-PC has little RAM)."""
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone

from .config import settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    ig_user_id TEXT NOT NULL DEFAULT '',
    access_token TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    posting_times TEXT NOT NULL DEFAULT '18:00',
    caption_template TEXT NOT NULL DEFAULT '{title}

🎥 Credit: u/{author} on r/{subreddit}
{hashtags}',
    hashtags TEXT NOT NULL DEFAULT '',
    hook_enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    subreddit TEXT NOT NULL,
    sort TEXT NOT NULL DEFAULT 'top',
    time_filter TEXT NOT NULL DEFAULT 'day',
    min_score INTEGER NOT NULL DEFAULT 500,
    min_duration INTEGER NOT NULL DEFAULT 5,
    max_duration INTEGER NOT NULL DEFAULT 90,
    allow_nsfw INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    reddit_id TEXT NOT NULL,
    subreddit TEXT NOT NULL,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    permalink TEXT NOT NULL,
    status TEXT NOT NULL,
    media_file TEXT,
    caption TEXT,
    ig_media_id TEXT,
    error TEXT,
    slot TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS posts_reddit_unique ON posts(reddit_id);
CREATE INDEX IF NOT EXISTS posts_account_slot ON posts(account_id, slot);
"""

_lock = threading.Lock()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect() -> sqlite3.Connection:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(settings.db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


@contextmanager
def tx():
    """Serialized transaction (single small process, so a global lock is fine)."""
    with _lock:
        conn = connect()
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def init_db() -> None:
    for d in (settings.data_dir, settings.media_dir, settings.work_dir):
        d.mkdir(parents=True, exist_ok=True)
    with tx() as c:
        c.executescript(SCHEMA)


def rows(sql: str, params=()) -> list[dict]:
    with tx() as c:
        return [dict(r) for r in c.execute(sql, params).fetchall()]


def row(sql: str, params=()) -> dict | None:
    r = rows(sql, params)
    return r[0] if r else None


def execute(sql: str, params=()) -> int:
    with tx() as c:
        cur = c.execute(sql, params)
        return cur.lastrowid


# --- accounts -------------------------------------------------------------
ACCOUNT_FIELDS = ("name", "ig_user_id", "access_token", "active", "posting_times",
                  "caption_template", "hashtags", "hook_enabled")


def get_account(account_id: int) -> dict | None:
    return row("SELECT * FROM accounts WHERE id = ?", (account_id,))


def list_accounts() -> list[dict]:
    return rows("SELECT * FROM accounts ORDER BY name")


def save_account(data: dict, account_id: int | None = None) -> int:
    values = {k: data[k] for k in ACCOUNT_FIELDS if k in data}
    if account_id is None:
        values.setdefault("name", "Neuer Account")
        cols = list(values) + ["created_at"]
        params = list(values.values()) + [now_iso()]
        return execute(f"INSERT INTO accounts ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})", params)
    sets = ", ".join(f"{k} = ?" for k in values)
    execute(f"UPDATE accounts SET {sets} WHERE id = ?", [*values.values(), account_id])
    return account_id


def delete_account(account_id: int) -> None:
    execute("DELETE FROM accounts WHERE id = ?", (account_id,))


# --- sources --------------------------------------------------------------
SOURCE_FIELDS = ("subreddit", "sort", "time_filter", "min_score", "min_duration", "max_duration", "allow_nsfw")


def list_sources(account_id: int) -> list[dict]:
    return rows("SELECT * FROM sources WHERE account_id = ? ORDER BY subreddit", (account_id,))


def add_source(account_id: int, data: dict) -> int:
    values = {k: data[k] for k in SOURCE_FIELDS if k in data}
    cols = ["account_id", *values]
    return execute(f"INSERT INTO sources ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})",
                   [account_id, *values.values()])


def delete_source(source_id: int) -> None:
    execute("DELETE FROM sources WHERE id = ?", (source_id,))


# --- posts ----------------------------------------------------------------
def reddit_id_known(reddit_id: str) -> bool:
    return row("SELECT 1 AS x FROM posts WHERE reddit_id = ?", (reddit_id,)) is not None


def create_post(account_id: int, item: dict, slot: str | None) -> int:
    ts = now_iso()
    return execute(
        "INSERT INTO posts (account_id, reddit_id, subreddit, title, author, permalink, status, slot, created_at, updated_at)"
        " VALUES (?, ?, ?, ?, ?, ?, 'rendering', ?, ?, ?)",
        (account_id, item["id"], item["subreddit"], item["title"], item["author"], item["permalink"], slot, ts, ts),
    )


def update_post(post_id: int, **fields) -> None:
    fields["updated_at"] = now_iso()
    sets = ", ".join(f"{k} = ?" for k in fields)
    execute(f"UPDATE posts SET {sets} WHERE id = ?", [*fields.values(), post_id])


def get_post(post_id: int) -> dict | None:
    return row("SELECT * FROM posts WHERE id = ?", (post_id,))


def list_posts(limit: int = 100, account_id: int | None = None) -> list[dict]:
    if account_id:
        return rows("SELECT p.*, a.name AS account_name FROM posts p JOIN accounts a ON a.id = p.account_id"
                    " WHERE p.account_id = ? ORDER BY p.id DESC LIMIT ?", (account_id, limit))
    return rows("SELECT p.*, a.name AS account_name FROM posts p JOIN accounts a ON a.id = p.account_id"
                " ORDER BY p.id DESC LIMIT ?", (limit,))


def slot_taken(account_id: int, slot: str) -> bool:
    """A slot counts as used unless every attempt for it was skipped/failed before rendering finished."""
    return row("SELECT 1 AS x FROM posts WHERE account_id = ? AND slot = ? AND status IN"
               " ('rendering', 'ready', 'publishing', 'published')", (account_id, slot)) is not None
