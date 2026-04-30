#!/usr/bin/env python3
"""Restore a Zoey tracker database from a data-backup snapshot.json.

The export script (scripts/export-to-github.sh) writes a snapshot.json with
all rows from feeds, pumps, weight_entries, diapers, and app_settings. This
script loads them back into a SQLite database with the matching schema.

Usage:
    python scripts/restore-from-snapshot.py <path-to-snapshot.json> --db <db-path>
    python scripts/restore-from-snapshot.py <snapshot> --db <db> --force
        # wipes the destination tables before restoring (otherwise the script
        # refuses if any of those tables is non-empty)

Disaster-recovery flow:
  1. Provision a fresh server / container.
  2. Bring up the app once so backend/db.py creates the schema, then stop it.
  3. Clone the data-backup repo:  git clone git@github.com:mr-mpage/your-data-backup.git
  4. Run this script against the freshly-created zoey.db with --force.
  5. Restart the app — data, settings, and history are back.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path


TABLES = ("feeds", "pumps", "weight_entries", "diapers", "vitals_daily", "app_settings")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("snapshot", type=Path, help="Path to data-backup/snapshot.json")
    parser.add_argument("--db", required=True, type=Path, help="Path to the destination zoey.db")
    parser.add_argument("--force", action="store_true", help="Wipe destination tables before restoring")
    args = parser.parse_args()

    if not args.snapshot.exists():
        sys.exit(f"snapshot not found: {args.snapshot}")
    if not args.db.exists():
        sys.exit(
            f"db not found: {args.db}\n"
            "Bring up the backend once so init_db() creates the schema, then re-run."
        )

    data = json.loads(args.snapshot.read_text())
    feeds = data.get("feeds", [])
    pumps = data.get("pumps", [])
    weights = data.get("weights", [])
    diapers = data.get("diapers", [])
    vitals_daily = data.get("vitals_daily", [])
    settings = data.get("settings", {})

    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row

    def has_rows(table: str) -> int:
        try:
            return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        except sqlite3.OperationalError as e:
            sys.exit(f"table {table} missing — has the schema been initialised? ({e})")

    existing = {t: has_rows(t) for t in TABLES}
    populated = [f"{t} ({n})" for t, n in existing.items() if n > 0]
    if populated and not args.force:
        sys.exit(
            "destination is not empty — refusing to restore: "
            + ", ".join(populated)
            + "\nRe-run with --force to wipe and replace."
        )

    with conn:
        if args.force:
            for t in TABLES:
                conn.execute(f"DELETE FROM {t}")

        for f in feeds:
            conn.execute(
                "INSERT INTO feeds (id, fed_at, amount_ml, notes, is_extra, method, duration_min, feeding_day_override) "
                "VALUES (:id, :fed_at, :amount_ml, :notes, :is_extra, :method, :duration_min, :feeding_day_override)",
                {
                    "id": f.get("id"),
                    "fed_at": f["fed_at"],
                    "amount_ml": f["amount_ml"],
                    "notes": f.get("notes"),
                    "is_extra": f.get("is_extra", 0),
                    "method": f.get("method") or "bottle",
                    "duration_min": f.get("duration_min"),
                    "feeding_day_override": f.get("feeding_day_override"),
                },
            )

        for p in pumps:
            conn.execute(
                "INSERT INTO pumps (id, pumped_at, amount_ml, notes) VALUES (:id, :pumped_at, :amount_ml, :notes)",
                {"id": p.get("id"), "pumped_at": p["pumped_at"], "amount_ml": p["amount_ml"], "notes": p.get("notes")},
            )

        for w in weights:
            conn.execute(
                "INSERT INTO weight_entries (id, recorded_at, weight_grams, ml_per_kg_per_day, notes) "
                "VALUES (:id, :recorded_at, :weight_grams, :ml_per_kg_per_day, :notes)",
                {
                    "id": w.get("id"),
                    "recorded_at": w["recorded_at"],
                    "weight_grams": w["weight_grams"],
                    "ml_per_kg_per_day": w["ml_per_kg_per_day"],
                    "notes": w.get("notes"),
                },
            )

        for d in diapers:
            conn.execute(
                "INSERT INTO diapers (id, recorded_at, kind, notes) VALUES (:id, :recorded_at, :kind, :notes)",
                {"id": d.get("id"), "recorded_at": d["recorded_at"], "kind": d["kind"], "notes": d.get("notes")},
            )

        for v in vitals_daily:
            conn.execute(
                "INSERT INTO vitals_daily (feeding_day, hr_avg, hr_min, hr_max, spo2_avg, spo2_min_avg10, "
                "monitoring_minutes, session_count, low_spo2_alert_count, sample_count, computed_at) "
                "VALUES (:feeding_day, :hr_avg, :hr_min, :hr_max, :spo2_avg, :spo2_min_avg10, "
                ":monitoring_minutes, :session_count, :low_spo2_alert_count, :sample_count, :computed_at)",
                {
                    "feeding_day": v["feeding_day"],
                    "hr_avg": v.get("hr_avg"),
                    "hr_min": v.get("hr_min"),
                    "hr_max": v.get("hr_max"),
                    "spo2_avg": v.get("spo2_avg"),
                    "spo2_min_avg10": v.get("spo2_min_avg10"),
                    "monitoring_minutes": v.get("monitoring_minutes", 0),
                    "session_count": v.get("session_count", 0),
                    "low_spo2_alert_count": v.get("low_spo2_alert_count", 0),
                    "sample_count": v.get("sample_count", 0),
                    "computed_at": v.get("computed_at"),
                },
            )

        for k, v in settings.items():
            conn.execute(
                "INSERT INTO app_settings (key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (k, str(v)),
            )

    print(
        f"restored: {len(feeds)} feeds, {len(pumps)} pumps, {len(weights)} weights, "
        f"{len(diapers)} diapers, {len(vitals_daily)} vitals_daily, {len(settings)} settings"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
