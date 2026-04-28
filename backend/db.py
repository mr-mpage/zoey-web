import sqlite3
from contextlib import contextmanager
from typing import Iterator

from .config import db_file

SCHEMA = """
CREATE TABLE IF NOT EXISTS weight_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recorded_at TEXT NOT NULL,
    weight_grams INTEGER NOT NULL,
    ml_per_kg_per_day INTEGER NOT NULL,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS feeds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fed_at TEXT NOT NULL,
    amount_ml REAL NOT NULL,
    notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_feeds_fed_at ON feeds(fed_at);

CREATE TABLE IF NOT EXISTS pumps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pumped_at TEXT NOT NULL,
    amount_ml REAL NOT NULL,
    notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_pumps_pumped_at ON pumps(pumped_at);
"""


def init_db() -> None:
    path = db_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as conn:
        conn.executescript(SCHEMA)


@contextmanager
def get_conn() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(db_file())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()
