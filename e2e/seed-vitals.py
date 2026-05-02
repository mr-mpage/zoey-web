"""Seed synthetic vitals into the e2e SQLite DB so the Vitals screenshot
isn't an empty 'not configured' / 'no data yet' card.

Reads DB_PATH from env (matching e2e/serve.sh's per-run DB) and writes
raw vitals samples directly via sqlite3 — bypasses the API because there
is no insert endpoint (in real use, the Owlet poller writes them).

Generated pattern: 7 days of overnight monitoring (~22:00 → 07:00 the
next morning), one sample per minute, with realistic infant ranges and
small wave-like variation. No alerts, all values comfortably in the
'green' bands so the card reads as a healthy week.
"""

from __future__ import annotations

import math
import os
import sqlite3
import sys
from datetime import datetime, timedelta, timezone


def main() -> None:
    db_path = os.environ.get("DB_PATH")
    if not db_path:
        print("DB_PATH env var must be set (point at the running e2e DB)", file=sys.stderr)
        sys.exit(1)

    tz = datetime.now().astimezone().tzinfo or timezone.utc
    now = datetime.now(tz).replace(microsecond=0)
    today = now.date()

    rows: list[tuple] = []
    for day_offset in range(7):
        # Each "session" runs 22:00 the previous evening → 07:00 the day in
        # question, mirroring how a parent puts the sock on for sleep.
        end_day = today - timedelta(days=day_offset)
        start = datetime.combine(end_day - timedelta(days=1), datetime.min.time(), tz).replace(hour=22)
        end = datetime.combine(end_day, datetime.min.time(), tz).replace(hour=7)
        cur = start
        i = 0
        while cur < end:
            # Wave-like HR (~135 ± 12) and SpO2 (~97 ± 1.5) — within green.
            hr = 135 + 12 * math.sin(i / 25.0)
            spo2 = 97 + 1.5 * math.sin(i / 17.0)
            rows.append(
                (
                    cur.isoformat(),
                    round(hr, 1),
                    round(spo2, 1),
                    round(spo2, 1),  # spo2_avg10 — rolling avg, fine to mirror raw
                    1 if i % 7 == 0 else 0,  # movement
                    36,  # skin_temp °C
                    1,  # sock_connection (good)
                    0,  # sock_off
                    0,  # charging
                    0,  # low_spo2_alert
                )
            )
            cur += timedelta(minutes=1)
            i += 1

    with sqlite3.connect(db_path) as conn:
        conn.executemany(
            "INSERT INTO vitals (recorded_at, heart_rate, spo2, spo2_avg10, movement, "
            "skin_temp, sock_connection, sock_off, charging, low_spo2_alert) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            rows,
        )
        conn.commit()

    print(f"vitals seed: {len(rows)} samples across 7 days → {db_path}")


if __name__ == "__main__":
    main()
