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

CREATE TABLE IF NOT EXISTS diapers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recorded_at TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('wet', 'dirty')),
    notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_diapers_recorded_at ON diapers(recorded_at);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""

DEFAULTS = {
    "day_start_hour": "2",
    "day_start_minute": "30",
    "feeds_per_day": "8",
    "target_concern_ml_per_kg": "130",
    "target_low_ml_per_kg": "150",
    "target_solid_ml_per_kg": "165",
    "target_high_ml_per_kg": "180",
}


def init_db() -> None:
    path = db_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as conn:
        conn.executescript(SCHEMA)
        for k, v in DEFAULTS.items():
            conn.execute("INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)", (k, v))


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
