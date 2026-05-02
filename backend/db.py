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
    notes TEXT,
    is_auto INTEGER NOT NULL DEFAULT 0
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

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    label TEXT,
    created_at TEXT NOT NULL,
    last_notified_for TEXT
);

CREATE TABLE IF NOT EXISTS viewer_passcodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL UNIQUE,
    passcode_hash TEXT NOT NULL,
    last_seen_at TEXT,
    created_at TEXT NOT NULL
);

-- Raw vitals readings from the Owlet sock. Polled at OWLET_POLL_INTERVAL_S
-- (default 120 s). Compacted into vitals_daily and pruned after
-- VITALS_RAW_RETAIN_DAYS (default 14) so storage stays bounded.
CREATE TABLE IF NOT EXISTS vitals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recorded_at TEXT NOT NULL,
    heart_rate REAL,
    spo2 REAL,
    spo2_avg10 REAL,
    movement INTEGER,
    skin_temp INTEGER,
    sock_connection INTEGER,
    sock_off INTEGER NOT NULL DEFAULT 0,
    charging INTEGER NOT NULL DEFAULT 0,
    low_spo2_alert INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_vitals_recorded_at ON vitals(recorded_at);

-- Per feeding-day aggregates. One row per day, kept indefinitely.
-- Recomputed if needed (raw data within retention window) or filled in
-- once when the raw readings for that day are about to be pruned.
CREATE TABLE IF NOT EXISTS vitals_daily (
    feeding_day TEXT PRIMARY KEY,
    hr_avg REAL,
    hr_min REAL,
    hr_max REAL,
    spo2_avg REAL,
    spo2_min_avg10 REAL,
    monitoring_minutes INTEGER NOT NULL DEFAULT 0,
    session_count INTEGER NOT NULL DEFAULT 0,
    low_spo2_alert_count INTEGER NOT NULL DEFAULT 0,
    sample_count INTEGER NOT NULL DEFAULT 0,
    computed_at TEXT NOT NULL
);

-- Recurring daily meds (iron, vitamin D, etc). Predefined list lives in
-- this table; doses_per_day drives the today-checklist slot count.
-- Archived = soft delete so historical doses still resolve a name.
CREATE TABLE IF NOT EXISTS meds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    doses_per_day INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

-- One row per dose given. med_id null = one-off (e.g. saline drops),
-- name carries the free-text label in that case. is_extra marks doses
-- beyond the scheduled count for the day, mirroring the feeds pattern.
CREATE TABLE IF NOT EXISTS med_doses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    med_id INTEGER REFERENCES meds(id) ON DELETE SET NULL,
    name TEXT,
    given_at TEXT NOT NULL,
    notes TEXT,
    is_extra INTEGER NOT NULL DEFAULT 0,
    feeding_day_override TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_med_doses_given_at ON med_doses(given_at);
"""

DEFAULTS = {
    "day_start_hour": "2",
    "day_start_minute": "30",
    "feeds_per_day": "8",
    # Intake bands (ml/kg/day) — defaults align with ESPGHAN 2022 + Brigham/UCD/
    # Hopkins NICU goal of 150–160; below 135 is the "below safe stable phase"
    # threshold cited by ESPGHAN.
    "target_concern_ml_per_kg": "135",
    "target_low_ml_per_kg": "150",
    "target_solid_ml_per_kg": "160",
    "target_high_ml_per_kg": "180",
    # Birth context — used by the PMA-aware growth indicator on Overview
    # and the milestone chip on Today.
    # Defaults are Zoey's: 2026-04-15 at 35 weeks gestational age, 2455 g.
    "birth_date": "2026-04-15",
    "gestational_age_weeks": "35",
    "birth_weight_grams": "2455",
}


def init_db() -> None:
    path = db_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as conn:
        conn.executescript(SCHEMA)
        for k, v in DEFAULTS.items():
            conn.execute("INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)", (k, v))
        # Migrations: add columns introduced after initial release
        cols = {r[1] for r in conn.execute("PRAGMA table_info(feeds)")}
        if "is_extra" not in cols:
            conn.execute("ALTER TABLE feeds ADD COLUMN is_extra INTEGER NOT NULL DEFAULT 0")
        if "method" not in cols:
            conn.execute("ALTER TABLE feeds ADD COLUMN method TEXT NOT NULL DEFAULT 'bottle'")
        if "duration_min" not in cols:
            conn.execute("ALTER TABLE feeds ADD COLUMN duration_min INTEGER")
        if "feeding_day_override" not in cols:
            # Optional 'YYYY-MM-DD' explicit feeding-day membership. Lets a
            # feed logged at 02:20 (just before a 02:30 anchor) count as
            # feed #1 of the new day without having to fudge the timestamp.
            conn.execute("ALTER TABLE feeds ADD COLUMN feeding_day_override TEXT")
        cols_w = {r[1] for r in conn.execute("PRAGMA table_info(weight_entries)")}
        if "is_auto" not in cols_w:
            conn.execute("ALTER TABLE weight_entries ADD COLUMN is_auto INTEGER NOT NULL DEFAULT 0")
        # Seed default meds on first creation so the checklist isn't empty.
        # INSERT OR IGNORE keyed off name so manually-archived rows stay archived.
        from datetime import datetime, timezone
        now_iso = datetime.now(timezone.utc).isoformat()
        existing = {r[0] for r in conn.execute("SELECT name FROM meds")}
        seed_meds = [
            ("Iron drops", 1, 0),
            ("Vitamin D", 1, 1),
        ]
        for name, dpd, order in seed_meds:
            if name not in existing:
                conn.execute(
                    "INSERT INTO meds (name, doses_per_day, sort_order, archived, created_at) "
                    "VALUES (?, ?, ?, 0, ?)",
                    (name, dpd, order, now_iso),
                )


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
